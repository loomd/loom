import { execa } from 'execa';
import * as path from 'path';
import * as fs from 'fs';
import { describe, test, expect, beforeEach, afterAll } from 'vitest';

const CLI_BINARY = path.resolve(__dirname, '../../target/debug/loom');
const CONFIG_PATH = path.resolve(__dirname, '../temp_config_cli.json');

/**
 * Helper to dynamically read the current workspace version from Cargo.toml.
 * Choosing a dynamic parser avoids breaking E2E tests during version bumps.
 */
function getExpectedVersion(): string {
  const cargoPath = path.resolve(__dirname, '../../Cargo.toml');
  const cargoContent = fs.readFileSync(cargoPath, 'utf8');

  // Match the version inside [workspace.package]
  const match = cargoContent.match(/\[workspace\.package\][\s\S]*?version\s*=\s*"([^"]+)"/);
  if (match && match[1]) {
    return match[1];
  }
  throw new Error('Could not parse version from Cargo.toml');
}

async function runCli(args: string[], env: any = {}) {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const binPath = `${CLI_BINARY}${ext}`;
  return await execa(binPath, args, {
    env: {
      LOOM_CONFIG_PATH: CONFIG_PATH,
      ...env
    },
    reject: false
  });
}

function writeMockConfig(data: any) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

describe('loom CLI E2E tests', () => {
  beforeEach(() => {
    if (fs.existsSync(CONFIG_PATH)) {
      fs.unlinkSync(CONFIG_PATH);
    }
  });

  afterAll(() => {
    if (fs.existsSync(CONFIG_PATH)) {
      fs.unlinkSync(CONFIG_PATH);
    }
  });

  // F5: loom CLI Tool (5 tests)
  test('test_cli_help_menu', async () => {
    const res = await runCli(['--help']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('loom - 多项目统一管理，多agent并行开发');
    expect(res.stdout).toContain('Usage:');

    const resShort = await runCli(['-h']);
    expect(resShort.exitCode).toBe(0);
    expect(resShort.stdout).toContain('loom - 多项目统一管理，多agent并行开发');
  });

  test('test_cli_version_info', async () => {
    const res = await runCli(['--version']);
    const expected = `loom ${getExpectedVersion()}`;
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain(expected);

    const resShort = await runCli(['-v']);
    expect(resShort.exitCode).toBe(0);
    expect(resShort.stdout).toContain(expected);
  });

  test('test_cli_list_default_table', async () => {
    writeMockConfig({
      cli_tools: [
        {
          id: '1',
          name: 'git',
          path: 'C:\\Program Files\\Git\\cmd\\git.exe',
          version: '2.40.0',
          category_id: 'category-dev',
          custom_env: {}
        }
      ],
      categories: [],
      templates: []
    });

    const res = await runCli(['list']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('Name');
    expect(res.stdout).toContain('Path');
    expect(res.stdout).toContain('git');
    expect(res.stdout).toContain('category-dev');
  });

  test('test_cli_list_json_format', async () => {
    writeMockConfig({
      cli_tools: [
        {
          id: '1',
          name: 'git',
          path: 'C:\\Program Files\\Git\\cmd\\git.exe',
          version: '2.40.0',
          category_id: 'category-dev',
          custom_env: {}
        }
      ],
      categories: [],
      templates: []
    });

    const res = await runCli(['list', '--json']);
    expect(res.exitCode).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('git');
    expect(parsed[0].path).toBe('C:\\Program Files\\Git\\cmd\\git.exe');
  });

  test('test_cli_search_by_query', async () => {
    writeMockConfig({
      cli_tools: [
        {
          id: '1',
          name: 'git',
          path: 'C:\\Program Files\\Git\\cmd\\git.exe',
          version: '2.40.0',
          category_id: 'category-dev',
          custom_env: {}
        },
        {
          id: '2',
          name: 'npm',
          path: 'C:\\Program Files\\nodejs\\npm.cmd',
          version: '9.0.0',
          category_id: 'category-node',
          custom_env: {}
        }
      ],
      categories: [],
      templates: []
    });

    const res = await runCli(['search', 'git']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('git');
    expect(res.stdout).not.toContain('npm');

    const resJson = await runCli(['search', 'npm', '--json']);
    expect(resJson.exitCode).toBe(0);
    const parsed = JSON.parse(resJson.stdout);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('npm');
  });

  // Boundary/Corner Cases (5 tests)
  test('test_cli_unknown_subcommand', async () => {
    const res = await runCli(['invalid_cmd']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("Error: Unknown command 'invalid_cmd'");
  });

  test('test_cli_search_empty_query', async () => {
    const res = await runCli(['search']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('Error: search query is required');
  });

  test('test_cli_list_invalid_format', async () => {
    const res = await runCli(['list', '--format', 'invalid']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("Error: invalid format 'invalid'");
  });

  test('test_cli_excessive_arguments', async () => {
    const res = await runCli(['list', 'extra', 'arg1', 'arg2']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("Error: excessive or unknown argument 'extra'");
  });

  test('test_cli_json_parse_empty_db', async () => {
    // Write an empty structure
    writeMockConfig({
      cli_tools: [],
      categories: [],
      templates: []
    });

    const res = await runCli(['list', '--json']);
    expect(res.exitCode).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed).toEqual([]);
  });

  // F7: Command Override
  test('test_cli_run_override_template', async () => {
    writeMockConfig({
      cli_tools: [
        {
          id: 'cli-override-1',
          name: 'mocktool',
          path: CLI_BINARY,
          version: '1.0.0',
          category_id: null,
          custom_env: {}
        }
      ],
      categories: [],
      templates: [
        {
          id: 'tpl-override-1',
          cli_id: 'cli-override-1',
          name: 'MyOverrideTpl',
          args: ['mock-run', '--stdout', 'hello-override-stdout'],
          env: { TEST_VAR: 'hello-env' },
          pwd: null,
          cmd_override: 'custom-override'
        }
      ]
    });

    // Run the override command and check output & exit code
    const res = await runCli(['custom-override']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('hello-override-stdout');

    // Verify env is passed
    const resEnv = await runCli(['custom-override', '--print-env', 'TEST_VAR']);
    expect(resEnv.exitCode).toBe(0);
    expect(resEnv.stdout).toContain('hello-env');
  });

  test('test_cli_run_override_tool_direct', async () => {
    writeMockConfig({
      cli_tools: [
        {
          id: 'cli-direct-1',
          name: 'direct-tool',
          path: CLI_BINARY,
          version: '1.0.0',
          category_id: null,
          custom_env: { DIRECT_VAR: 'direct-val' }
        }
      ],
      categories: [],
      templates: []
    });

    // Run the tool name directly with mock-run args
    const res = await runCli(['direct-tool', 'mock-run', '--stdout', 'hello-direct-stdout']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('hello-direct-stdout');

    // Verify custom env of the tool is passed
    const resEnv = await runCli(['direct-tool', 'mock-run', '--print-env', 'DIRECT_VAR']);
    expect(resEnv.exitCode).toBe(0);
    expect(resEnv.stdout).toContain('direct-val');
  });

  test('test_cli_run_override_not_found', async () => {
    writeMockConfig({
      cli_tools: [],
      categories: [],
      templates: []
    });

    const res = await runCli(['non-existent-override']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("Error: Unknown command 'non-existent-override'");
  });

  test('test_cli_run_override_with_global_env_vars', async () => {
    writeMockConfig({
      cli_tools: [
        {
          id: 'cli-1',
          name: 'mocktool',
          path: CLI_BINARY,
          version: '1.0.0',
          category_id: null,
          custom_env: {}
        }
      ],
      categories: [],
      env_vars: [
        {
          id: 'g-1',
          key: 'GLOBAL_VAR',
          value: 'global-value',
          description: 'A global env variable'
        }
      ],
      templates: [
        {
          id: 'tpl-1',
          cli_id: 'cli-1',
          name: 'MyOverrideTpl',
          args: ['mock-run'],
          env: { LOCAL_VAR: 'local-value' },
          env_var_ids: ['g-1'],
          pwd: null,
          cmd_override: 'mycmd'
        }
      ]
    });

    // Verify global env var is resolved and passed
    const resGlobal = await runCli(['mycmd', '--print-env', 'GLOBAL_VAR']);
    expect(resGlobal.exitCode).toBe(0);
    expect(resGlobal.stdout).toContain('global-value');

    // Verify local template env override is also resolved and passed
    const resLocal = await runCli(['mycmd', '--print-env', 'LOCAL_VAR']);
    expect(resLocal.exitCode).toBe(0);
    expect(resLocal.stdout).toContain('local-value');
  });
});
