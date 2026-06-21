import { execa } from 'execa';
import * as path from 'path';
import * as fs from 'fs';
import { describe, test, expect, beforeEach, afterAll } from 'vitest';

const GUI_BINARY = path.resolve(__dirname, '../../target/debug/loom-gui');
const CLI_BINARY = path.resolve(__dirname, '../../target/debug/loom');
const CONFIG_PATH = path.resolve(__dirname, '../temp_config_gui.json');
const ACTIVE_INSTANCES_PATH = path.resolve(__dirname, '../active_instances.json');

async function callCmd(cmd: string, args: any = {}, envOverrides: any = {}) {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const binPath = `${GUI_BINARY}${ext}`;
  const res = await execa(binPath, [], {
    env: {
      TAURI_TEST_CMD: cmd,
      TAURI_TEST_ARGS: JSON.stringify(args),
      LOOM_CONFIG_PATH: CONFIG_PATH,
      ...envOverrides
    }
  });
  if (res.stdout.trim() === '' || res.stdout.trim() === 'null') {
    return null;
  }
  try {
    return JSON.parse(res.stdout);
  } catch (e) {
    throw new Error(`Failed to parse output for ${cmd}: ${res.stdout}\nStderr: ${res.stderr}`);
  }
}

function writeMockConfig(data: any) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

function cleanState() {
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  if (fs.existsSync(ACTIVE_INSTANCES_PATH)) {
    fs.unlinkSync(ACTIVE_INSTANCES_PATH);
  }
}

// Get the correct CLI binary path to use as a mock executable in tests
const ext = process.platform === 'win32' ? '.exe' : '';
const MOCK_CLI_PATH = `${CLI_BINARY}${ext}`;

describe('loom GUI Tauri Commands E2E tests', () => {
  beforeEach(() => {
    cleanState();
  });

  afterAll(() => {
    cleanState();
  });

  // ==========================================
  // TIER 1: Feature Coverage (25 tests in GUI)
  // ==========================================

  // F1: CLI List & Categorization (5 tests)
  test('test_gui_list_displays_all_cli_tools', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: []
    });
    const tools = await callCmd('get_cli_tools');
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('git');
    expect(tools[0].path).toBe(MOCK_CLI_PATH);
  });

  test('test_gui_create_category', async () => {
    const cat = await callCmd('create_category', { name: 'Development Tools', desc: 'Compilers and VCS' });
    expect(cat.name).toBe('Development Tools');
    expect(cat.description).toBe('Compilers and VCS');
    expect(cat.id).toBeDefined();
  });

  test('test_gui_assign_cli_to_category', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [
        { id: 'cat-1', name: 'Dev', description: '' }
      ],
      templates: []
    });

    await callCmd('assign_cli_category', { cli_id: 'cli-1', cat_id: 'cat-1' });
    const tools = await callCmd('get_cli_tools');
    expect(tools[0].category_id).toBe('cat-1');
  });

  test('test_gui_filter_by_category', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: 'cat-1', custom_env: {} },
        { id: 'cli-2', name: 'npm', path: MOCK_CLI_PATH, version: '9.0.0', category_id: 'cat-2', custom_env: {} }
      ],
      categories: [
        { id: 'cat-1', name: 'Dev', description: '' },
        { id: 'cat-2', name: 'Node', description: '' }
      ],
      templates: []
    });

    const tools = await callCmd('get_cli_tools');
    const filteredDev = tools.filter((t: any) => t.category_id === 'cat-1');
    expect(filteredDev).toHaveLength(1);
    expect(filteredDev[0].name).toBe('git');
  });

  test('test_gui_persistence_across_sessions', async () => {
    await callCmd('create_category', { name: 'VCS', desc: '' });
    // Load config again, verify category survives
    const configData = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    expect(configData.categories).toHaveLength(1);
    expect(configData.categories[0].name).toBe('VCS');
  });

  // F2: Custom Environment Variables (5 tests)
  test('test_gui_view_env_vars', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: { AUTHOR: 'Me' } }
      ],
      categories: [],
      templates: []
    });

    const tools = await callCmd('get_cli_tools');
    expect(tools[0].custom_env).toEqual({ AUTHOR: 'Me' });
  });

  test('test_gui_add_custom_env_var', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: []
    });

    await callCmd('update_cli_env', { cli_id: 'cli-1', env: { NEW_VAR: 'value' } });
    const tools = await callCmd('get_cli_tools');
    expect(tools[0].custom_env).toEqual({ NEW_VAR: 'value' });
  });

  test('test_gui_edit_custom_env_var', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: { NEW_VAR: 'value1' } }
      ],
      categories: [],
      templates: []
    });

    await callCmd('update_cli_env', { cli_id: 'cli-1', env: { NEW_VAR: 'value2' } });
    const tools = await callCmd('get_cli_tools');
    expect(tools[0].custom_env).toEqual({ NEW_VAR: 'value2' });
  });

  test('test_gui_delete_custom_env_var', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: { NEW_VAR: 'value' } }
      ],
      categories: [],
      templates: []
    });

    await callCmd('update_cli_env', { cli_id: 'cli-1', env: {} });
    const tools = await callCmd('get_cli_tools');
    expect(tools[0].custom_env).toEqual({});
  });

  test('test_gui_env_var_persistence', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: []
    });

    await callCmd('update_cli_env', { cli_id: 'cli-1', env: { PERSISTED: 'ok' } });
    const configData = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    expect(configData.cli_tools[0].custom_env).toEqual({ PERSISTED: 'ok' });
  });

  // F3: Run Parameter Templates (5 tests)
  test('test_template_create', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: []
    });

    const temp = await callCmd('create_template', {
      cli_id: 'cli-1',
      name: 'Status',
      args: ['status'],
      env: { GIT_OPT: '1' },
      pwd: ''
    });
    expect(temp.name).toBe('Status');
    expect(temp.args).toEqual(['status']);
    expect(temp.env).toEqual({ GIT_OPT: '1' });
    expect(temp.id).toBeDefined();
  });

  test('test_template_list', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: [
        { id: 't-1', cli_id: 'cli-1', name: 'Status', args: ['status'], env: {}, pwd: null }
      ]
    });

    const temps = await callCmd('get_templates');
    expect(temps).toHaveLength(1);
    expect(temps[0].name).toBe('Status');
  });

  test('test_template_update', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: [
        { id: 't-1', cli_id: 'cli-1', name: 'Status', args: ['status'], env: {}, pwd: null }
      ]
    });

    const updated = await callCmd('update_template', {
      template_id: 't-1',
      name: 'Status New',
      args: ['status', '-s'],
      env: { A: '1' },
      pwd: ''
    });
    expect(updated.name).toBe('Status New');
    expect(updated.args).toEqual(['status', '-s']);
    expect(updated.env).toEqual({ A: '1' });
  });

  test('test_template_delete', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: [
        { id: 't-1', cli_id: 'cli-1', name: 'Status', args: ['status'], env: {}, pwd: null }
      ]
    });

    await callCmd('delete_template', { template_id: 't-1' });
    const temps = await callCmd('get_templates');
    expect(temps).toHaveLength(0);
  });

  test('test_template_persistence', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: []
    });

    await callCmd('create_template', {
      cli_id: 'cli-1',
      name: 'Status',
      args: ['status'],
      env: {},
      pwd: ''
    });
    const configData = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    expect(configData.templates).toHaveLength(1);
    expect(configData.templates[0].name).toBe('Status');
  });

  // F4: CLI Process Execution & Life Cycle (5 tests)
  test('test_process_start_from_template', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'mock-cli', path: MOCK_CLI_PATH, version: '1.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: [
        { id: 't-1', cli_id: 'cli-1', name: 'Run Mock', args: ['mock-run', '--sleep', '2000'], env: {}, pwd: null }
      ]
    });

    // Run the template (in headless mode it will block, but we want to verify it starts and returns)
    // To avoid blocking the test runner forever, we'll spawn the process asynchronously and read the first line
    const ext = process.platform === 'win32' ? '.exe' : '';
    const binPath = `${GUI_BINARY}${ext}`;
    const runProcess = execa(binPath, [], {
      env: {
        TAURI_TEST_CMD: 'run_cli_template',
        TAURI_TEST_ARGS: JSON.stringify({ template_id: 't-1' }),
        LOOM_CONFIG_PATH: CONFIG_PATH,
      }
    });

    return new Promise<void>((resolve, reject) => {
      runProcess.stdout?.on('data', (data) => {
        const out = data.toString();
        if (out.includes('INSTANCE_ID:')) {
          const lines = out.split('\n');
          const instanceLine = lines.find((l: string) => l.includes('INSTANCE_ID:'));
          const instanceId = instanceLine?.replace('INSTANCE_ID:', '').trim();
          expect(instanceId).toBeDefined();
          runProcess.kill();
          runProcess.then(() => resolve()).catch(() => resolve());
        }
      });
      runProcess.catch((err) => {
        // Ignored since we kill it
        resolve();
      });
    });
  });



  test('test_process_status_events', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'mock-cli', path: MOCK_CLI_PATH, version: '1.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: [
        { id: 't-1', cli_id: 'cli-1', name: 'Run Mock', args: ['mock-run', '--exit', '0'], env: {}, pwd: null }
      ]
    });

    const ext = process.platform === 'win32' ? '.exe' : '';
    const binPath = `${GUI_BINARY}${ext}`;
    const runProcess = await execa(binPath, [], {
      env: {
        TAURI_TEST_CMD: 'run_cli_template',
        TAURI_TEST_ARGS: JSON.stringify({ template_id: 't-1' }),
        LOOM_CONFIG_PATH: CONFIG_PATH,
      }
    });

    expect(runProcess.stdout).toContain('EVENT: cli-status-event:');
    expect(runProcess.stdout).toContain('"status":"running"');
    expect(runProcess.stdout).toContain('"status":"stopped"');
  });

  // F6: Auto-Scanner & Manual Importer (5 tests)
  test('test_scanner_crawl_path_env', async () => {
    // Create a temporary directory containing an executable mock
    const tempDir = path.resolve(__dirname, '../temp_path_scan');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const exeName = process.platform === 'win32' ? 'dummy-tool.exe' : 'dummy-tool';
    const tempExe = path.join(tempDir, exeName);
    fs.copyFileSync(MOCK_CLI_PATH, tempExe);

    try {
      // Set the path environment variable to ONLY search this folder
      const result = await callCmd('scan_path_env', {}, { PATH: tempDir });
      expect(result).toBeDefined();
      const match = result.find((t: any) => t.name === 'dummy-tool');
      expect(match).toBeDefined();
      expect(match.path).toBe(tempExe);
    } finally {
      if (fs.existsSync(tempExe)) {
        fs.unlinkSync(tempExe);
      }
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir);
      }
    }
  });

  test('test_scanner_deduplicate_executables', async () => {
    const tempDir1 = path.resolve(__dirname, '../temp_path_scan1');
    const tempDir2 = path.resolve(__dirname, '../temp_path_scan2');
    fs.mkdirSync(tempDir1, { recursive: true });
    fs.mkdirSync(tempDir2, { recursive: true });
    const exeName = process.platform === 'win32' ? 'dummy-dup.exe' : 'dummy-dup';
    const tempExe1 = path.join(tempDir1, exeName);
    const tempExe2 = path.join(tempDir2, exeName);
    fs.copyFileSync(MOCK_CLI_PATH, tempExe1);
    fs.copyFileSync(MOCK_CLI_PATH, tempExe2);

    try {
      const pathSep = process.platform === 'win32' ? ';' : ':';
      const mockPath = `${tempDir1}${pathSep}${tempDir2}`;
      // Run scanner
      const result = await callCmd('scan_path_env', {}, { PATH: mockPath });
      const dups = result.filter((t: any) => t.name === 'dummy-dup');
      // Deduplicated by name, so only one should be registered
      expect(dups).toHaveLength(1);
    } finally {
      fs.unlinkSync(tempExe1);
      fs.unlinkSync(tempExe2);
      fs.rmdirSync(tempDir1);
      fs.rmdirSync(tempDir2);
    }
  });

  test('test_importer_single_file', async () => {
    const tempImportFile = path.resolve(__dirname, `../temp_import_single${ext}`);
    fs.copyFileSync(MOCK_CLI_PATH, tempImportFile);

    try {
      const imported = await callCmd('import_cli_tool', { path: tempImportFile });
      expect(imported.name).toBe('temp_import_single');
      expect(imported.path).toBe(tempImportFile);
    } finally {
      if (fs.existsSync(tempImportFile)) {
        fs.unlinkSync(tempImportFile);
      }
    }
  });

  test('test_importer_directory_scan', async () => {
    const tempDir = path.resolve(__dirname, '../temp_dir_scan');
    fs.mkdirSync(tempDir, { recursive: true });
    const tempExe = path.join(tempDir, `scan_target${ext}`);
    fs.copyFileSync(MOCK_CLI_PATH, tempExe);

    try {
      const result = await callCmd('scan_directory', { path: tempDir });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('scan_target');
    } finally {
      fs.unlinkSync(tempExe);
      fs.rmdirSync(tempDir);
    }
  });

  test('test_importer_invalid_path_error', async () => {
    await expect(callCmd('import_cli_tool', { path: 'C:\\fake_path_does_not_exist_989.exe' }))
      .rejects.toThrow();
  });


  // ==========================================
  // TIER 2: Boundary & Corner Cases (25 tests in GUI)
  // ==========================================

  // F1: CLI List & Categorization
  test('test_category_duplicate_name', async () => {
    await callCmd('create_category', { name: 'VCS', desc: '' });
    await expect(callCmd('create_category', { name: 'VCS', desc: '' })).rejects.toThrow();
  });

  test('test_category_empty_name', async () => {
    await expect(callCmd('create_category', { name: '', desc: '' })).rejects.toThrow();
  });

  test('test_category_name_too_long', async () => {
    const longName = 'a'.repeat(256);
    await expect(callCmd('create_category', { name: longName, desc: '' })).rejects.toThrow();
  });

  test('test_cli_assign_nonexistent_category', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: []
    });

    await expect(callCmd('assign_cli_category', { cli_id: 'cli-1', cat_id: 'nonexistent-cat' })).rejects.toThrow();
  });

  test('test_list_when_config_is_empty', async () => {
    const tools = await callCmd('get_cli_tools');
    expect(tools).toEqual([]);
  });

  // F2: Custom Environment Variables
  test('test_env_key_empty', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: []
    });

    await expect(callCmd('update_cli_env', { cli_id: 'cli-1', env: { '': 'value' } })).rejects.toThrow();
  });

  test('test_env_key_invalid_chars', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: []
    });

    await expect(callCmd('update_cli_env', { cli_id: 'cli-1', env: { 'INVALID=KEY': 'val' } })).rejects.toThrow();
    await expect(callCmd('update_cli_env', { cli_id: 'cli-1', env: { 'INVALID KEY': 'val' } })).rejects.toThrow();
  });

  test('test_env_value_empty', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: []
    });

    await callCmd('update_cli_env', { cli_id: 'cli-1', env: { EMPTY_VAL: '' } });
    const tools = await callCmd('get_cli_tools');
    expect(tools[0].custom_env).toEqual({ EMPTY_VAL: '' });
  });

  test('test_env_extremely_large_value', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: []
    });

    const largeVal = 'a'.repeat(64 * 1024); // 64KB
    await callCmd('update_cli_env', { cli_id: 'cli-1', env: { LARGE_VAL: largeVal } });
    const tools = await callCmd('get_cli_tools');
    expect(tools[0].custom_env.LARGE_VAL).toBe(largeVal);
  });

  test('test_env_duplicate_keys', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: { DUP: '1' } }
      ],
      categories: [],
      templates: []
    });

    await callCmd('update_cli_env', { cli_id: 'cli-1', env: { DUP: '2' } });
    const tools = await callCmd('get_cli_tools');
    expect(tools[0].custom_env).toEqual({ DUP: '2' });
  });

  // F3: Run Parameter Templates
  test('test_template_invalid_pwd', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: []
    });

    await expect(callCmd('create_template', {
      cli_id: 'cli-1',
      name: 'Status',
      args: [],
      env: {},
      pwd: 'C:\\fake_directory_does_not_exist_at_all_999'
    })).rejects.toThrow();
  });

  test('test_template_empty_args', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: []
    });

    const temp = await callCmd('create_template', {
      cli_id: 'cli-1',
      name: 'Status',
      args: [],
      env: {},
      pwd: ''
    });
    expect(temp.args).toEqual([]);
  });

  test('test_template_name_empty', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: []
    });

    await expect(callCmd('create_template', {
      cli_id: 'cli-1',
      name: '',
      args: [],
      env: {},
      pwd: ''
    })).rejects.toThrow();
  });

  test('test_template_duplicate_name', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: [
        { id: 't-1', cli_id: 'cli-1', name: 'Dup', args: [], env: {}, pwd: null }
      ]
    });

    await expect(callCmd('create_template', {
      cli_id: 'cli-1',
      name: 'Dup',
      args: [],
      env: {},
      pwd: ''
    })).rejects.toThrow();
  });

  test('test_template_missing_cli_id', async () => {
    writeMockConfig({
      cli_tools: [],
      categories: [],
      templates: []
    });

    await expect(callCmd('create_template', {
      cli_id: 'fake-cli-id',
      name: 'Status',
      args: [],
      env: {},
      pwd: ''
    })).rejects.toThrow();
  });

  // F4: CLI Process Execution & Life Cycle
  test('test_run_nonexistent_binary', async () => {
    // Write configuration with nonexistent binary path
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: 'C:\\fake_path_does_not_exist_989.exe', version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: [
        { id: 't-1', cli_id: 'cli-1', name: 'Status', args: [], env: {}, pwd: null }
      ]
    });

    await expect(callCmd('run_cli_template', { template_id: 't-1' })).rejects.toThrow();
  });

  test('test_kill_already_stopped_process', async () => {
    // Should complete gracefully and not crash
    await callCmd('kill_cli_instance', { instance_id: 'fake-instance-id' });
  });



  test('test_run_binary_lacking_executable_permissions', async () => {
    // Create a dummy text file
    const tempTextFile = path.resolve(__dirname, '../dummy_text.txt');
    fs.writeFileSync(tempTextFile, 'This is a text file, not an executable.');

    try {
      writeMockConfig({
        cli_tools: [
          { id: 'cli-1', name: 'text-file', path: tempTextFile, version: '1.0', category_id: null, custom_env: {} }
        ],
        categories: [],
        templates: [
          { id: 't-1', cli_id: 'cli-1', name: 'Run Text', args: [], env: {}, pwd: null }
        ]
      });

      // Attempting to run it should fail, since it's not executable
      await expect(callCmd('run_cli_template', { template_id: 't-1' })).rejects.toThrow();
    } finally {
      if (fs.existsSync(tempTextFile)) {
        fs.unlinkSync(tempTextFile);
      }
    }
  });

  // F6: Auto-Scanner & Manual Importer
  test('test_scanner_empty_path', async () => {
    // Run PATH scan with an empty PATH variable
    const result = await callCmd('scan_path_env', {}, { PATH: '' });
    expect(result).toEqual([]);
  });

  test('test_importer_directory_no_executables', async () => {
    const tempDir = path.resolve(__dirname, '../temp_dir_no_exes');
    fs.mkdirSync(tempDir, { recursive: true });
    const txtFile = path.join(tempDir, 'readme.txt');
    fs.writeFileSync(txtFile, 'Hello');

    try {
      const result = await callCmd('scan_directory', { path: tempDir });
      expect(result).toEqual([]);
    } finally {
      fs.unlinkSync(txtFile);
      fs.rmdirSync(tempDir);
    }
  });

  test('test_importer_deeply_nested_directories', async () => {
    const tempDirRoot = path.resolve(__dirname, '../temp_dir_nested');
    const nestedDir = path.join(tempDirRoot, 'a/b/c/d/e');
    fs.mkdirSync(nestedDir, { recursive: true });
    const tempExe = path.join(nestedDir, `target${ext}`);
    fs.copyFileSync(MOCK_CLI_PATH, tempExe);

    try {
      // scan_directory scans depth up to 3. The exe is at depth 5, so it should not be registered.
      const result = await callCmd('scan_directory', { path: tempDirRoot });
      expect(result).toHaveLength(0);
    } finally {
      fs.unlinkSync(tempExe);
      fs.rmSync(tempDirRoot, { recursive: true, force: true });
    }
  });

  test('test_importer_symbolic_link_cycle', async () => {
    const tempDirRoot = path.resolve(__dirname, '../temp_dir_symlink');
    fs.mkdirSync(tempDirRoot, { recursive: true });
    const subDir = path.join(tempDirRoot, 'subdir');
    fs.mkdirSync(subDir, { recursive: true });

    const linkPath = path.join(subDir, 'link_back');
    try {
      fs.symlinkSync(tempDirRoot, linkPath, 'junction');
      
      // Scanning the folder should not enter infinite recursion and should complete successfully
      await callCmd('scan_directory', { path: tempDirRoot });
    } catch (e: any) {
      // If symlink creation fails due to permissions (e.g. on non-Windows without admin or Windows dev-mode off), 
      // we can catch it. But we used junction, which works without admin.
    } finally {
      if (fs.existsSync(linkPath)) {
        fs.unlinkSync(linkPath);
      }
      fs.rmSync(tempDirRoot, { recursive: true, force: true });
    }
  });

  test('test_importer_locked_system_files', async () => {
    const tempDir = path.resolve(__dirname, '../temp_dir_locked');
    fs.mkdirSync(tempDir, { recursive: true });
    const lockedFile = path.join(tempDir, 'locked.exe');
    
    // We open a write handle and keep it open (exclusive lock)
    let fd: number | null = null;
    try {
      fd = fs.openSync(lockedFile, 'w');
      // Scan the directory, should complete without error
      await callCmd('scan_directory', { path: tempDir });
    } finally {
      if (fd !== null) {
        fs.closeSync(fd);
      }
      if (fs.existsSync(lockedFile)) {
        fs.unlinkSync(lockedFile);
      }
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir);
      }
    }
  });


  // ==========================================
  // TIER 3: Cross-Feature Combinations (6 tests)
  // ==========================================

  test('test_cross_scan_and_auto_assign_category', async () => {
    // Scan PATH, auto-classify specific tools into default categories.
    // 1. Create a category
    const cat = await callCmd('create_category', { name: 'VCS Tools', desc: '' });
    // 2. Set up PATH with a tool
    const tempDir = path.resolve(__dirname, '../temp_path_cross');
    fs.mkdirSync(tempDir, { recursive: true });
    const exeName = process.platform === 'win32' ? 'git-cross.exe' : 'git-cross';
    const tempExe = path.join(tempDir, exeName);
    fs.copyFileSync(MOCK_CLI_PATH, tempExe);

    try {
      const scanned = await callCmd('scan_path_env', {}, { PATH: tempDir });
      const tool = scanned.find((t: any) => t.name === 'git-cross');
      expect(tool).toBeDefined();
      
      // Auto-assign category
      await callCmd('assign_cli_category', { cli_id: tool.id, cat_id: cat.id });
      const tools = await callCmd('get_cli_tools');
      expect(tools.find((t: any) => t.id === tool.id).category_id).toBe(cat.id);
    } finally {
      fs.unlinkSync(tempExe);
      fs.rmdirSync(tempDir);
    }
  });

  test('test_cross_import_and_create_template', async () => {
    // Import and create run template
    const tempImportFile = path.resolve(__dirname, `../temp_cross_import${ext}`);
    fs.copyFileSync(MOCK_CLI_PATH, tempImportFile);

    try {
      const imported = await callCmd('import_cli_tool', { path: tempImportFile });
      const temp = await callCmd('create_template', {
        cli_id: imported.id,
        name: 'Run Cross',
        args: ['--help'],
        env: {},
        pwd: ''
      });
      expect(temp.cli_id).toBe(imported.id);
    } finally {
      fs.unlinkSync(tempImportFile);
    }
  });



  test('test_cross_delete_cli_cascades_templates', async () => {
    // Delete CLI tool and verify all its templates are automatically deleted.
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: [
        { id: 't-1', cli_id: 'cli-1', name: 'Status', args: ['status'], env: {}, pwd: null },
        { id: 't-2', cli_id: 'cli-2', name: 'Other', args: [], env: {}, pwd: null }
      ]
    });

    await callCmd('delete_cli_tool', { cli_id: 'cli-1' });
    const temps = await callCmd('get_templates');
    expect(temps).toHaveLength(1);
    expect(temps[0].id).toBe('t-2');
  });

  test('test_cross_delete_category_orphans_clis', async () => {
    // Delete a category and check that associated CLIs are not deleted but become uncategorized.
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: 'cat-1', custom_env: {} }
      ],
      categories: [
        { id: 'cat-1', name: 'VCS', description: '' }
      ],
      templates: []
    });

    await callCmd('delete_category', { cat_id: 'cat-1' });
    const tools = await callCmd('get_cli_tools');
    expect(tools).toHaveLength(1);
    expect(tools[0].category_id).toBeNull();
  });

  test('test_cross_cli_query_after_gui_modifications', async () => {
    // Make edits in GUI, verify loom list --json reflects it
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [
        { id: 'cat-1', name: 'Development Tools', description: '' }
      ],
      templates: []
    });

    // Edit category in GUI
    await callCmd('assign_cli_category', { cli_id: 'cli-1', cat_id: 'cat-1' });

    // Run CLI list --json
    const binPath = `${CLI_BINARY}${ext}`;
    const res = await execa(binPath, ['list', '--json'], {
      env: {
        LOOM_CONFIG_PATH: CONFIG_PATH
      }
    });

    const parsed = JSON.parse(res.stdout);
    expect(parsed[0].category_id).toBe('cat-1');
  });


  // ==========================================
  // TIER 4: Real-World Application Scenarios (5 tests)
  // ==========================================

  test('scenario_development_toolchain_setup', async () => {
    // 1. Create category "Dev"
    const cat = await callCmd('create_category', { name: 'Dev', desc: '' });
    // 2. Set up PATH with "git"
    const tempDir = path.resolve(__dirname, '../temp_scenario_dev');
    fs.mkdirSync(tempDir, { recursive: true });
    const exeName = process.platform === 'win32' ? 'git.exe' : 'git';
    const tempExe = path.join(tempDir, exeName);
    fs.copyFileSync(MOCK_CLI_PATH, tempExe);

    try {
      const scanned = await callCmd('scan_path_env', {}, { PATH: tempDir });
      const gitTool = scanned.find((t: any) => t.name === 'git');
      expect(gitTool).toBeDefined();

      // 3. Assign git to Dev
      await callCmd('assign_cli_category', { cli_id: gitTool.id, cat_id: cat.id });

      // 4. Set env GIT_AUTHOR_NAME
      await callCmd('update_cli_env', { cli_id: gitTool.id, env: { GIT_AUTHOR_NAME: 'Loom User' } });

      // 5. Create template "Git Log"
      const temp = await callCmd('create_template', {
        cli_id: gitTool.id,
        name: 'Git Log',
        args: ['mock-run', '--stdout', 'commit 42d8a5'],
        env: {},
        pwd: ''
      });

      // 6. Run template and verify output contains log
      const binPath = `${GUI_BINARY}${ext}`;
      const runProcess = await execa(binPath, [], {
        env: {
          TAURI_TEST_CMD: 'run_cli_template',
          TAURI_TEST_ARGS: JSON.stringify({ template_id: temp.id }),
          LOOM_CONFIG_PATH: CONFIG_PATH,
        }
      });
      expect(runProcess.stdout).toContain('commit 42d8a5');
    } finally {
      fs.unlinkSync(tempExe);
      fs.rmdirSync(tempDir);
    }
  });

  test('scenario_network_diagnostics_lifecycle', async () => {
    // 1. Create "Net" category
    const cat = await callCmd('create_category', { name: 'Net', desc: 'Network Tools' });
    // 2. Import ping CLI
    const tempImportFile = path.resolve(__dirname, `../ping${ext}`);
    fs.copyFileSync(MOCK_CLI_PATH, tempImportFile);

    try {
      const pingTool = await callCmd('import_cli_tool', { path: tempImportFile });
      await callCmd('assign_cli_category', { cli_id: pingTool.id, cat_id: cat.id });

      // 3. Create "Ping Local" template
      const temp = await callCmd('create_template', {
        cli_id: pingTool.id,
        name: 'Ping Local',
        args: ['mock-run', '--stdout-loop', '100', '--sleep', '10'],
        env: {},
        pwd: ''
      });

      // 4. Start running and monitor for 1 second, then kill
      const binPath = `${GUI_BINARY}${ext}`;
      const runProcess = execa(binPath, [], {
        env: {
          TAURI_TEST_CMD: 'run_cli_template',
          TAURI_TEST_ARGS: JSON.stringify({ template_id: temp.id }),
          LOOM_CONFIG_PATH: CONFIG_PATH,
        }
      });

      let killed = false;
      return new Promise<void>((resolve, reject) => {
        runProcess.stdout?.on('data', async (data) => {
          const out = data.toString();
          if (out.includes('INSTANCE_ID:') && !killed) {
            killed = true;
            const lines = out.split('\n');
            const instanceLine = lines.find((l: string) => l.includes('INSTANCE_ID:'));
            const instanceId = instanceLine?.replace('INSTANCE_ID:', '').trim() || '';

            // Sleep 500ms then kill
            setTimeout(async () => {
              await callCmd('kill_cli_instance', { instance_id: instanceId });
            }, 500);
          }
          if (out.includes('"status":"stopped"') || out.includes('"status":"failed"')) {
            runProcess.then(() => resolve()).catch(() => resolve());
          }
        });
        runProcess.catch((err) => {
          resolve();
        });
      });
    } finally {
      fs.unlinkSync(tempImportFile);
    }
  });

  test('scenario_environment_override_execution', async () => {
    // 1. Setup CLI and template with custom env vars
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'mock-cli', path: MOCK_CLI_PATH, version: '1.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: [
        { id: 't-1', cli_id: 'cli-1', name: 'Run Mock', args: ['mock-run', '--print-env', 'PORT', '--print-env', 'DEBUG'], env: { PORT: '8080', DEBUG: '1' }, pwd: null }
      ]
    });

    // 2. Execute template and verify env vars printed in stdout
    const ext = process.platform === 'win32' ? '.exe' : '';
    const binPath = `${GUI_BINARY}${ext}`;
    const runProcess = await execa(binPath, [], {
      env: {
        TAURI_TEST_CMD: 'run_cli_template',
        TAURI_TEST_ARGS: JSON.stringify({ template_id: 't-1' }),
        LOOM_CONFIG_PATH: CONFIG_PATH,
      }
    });
    expect(runProcess.stdout).toContain('8080');
    expect(runProcess.stdout).toContain('1');

    // 3. Edit env vars to PORT=9090 in GUI
    await callCmd('update_template', {
      template_id: 't-1',
      name: 'Run Mock',
      args: ['mock-run', '--print-env', 'PORT', '--print-env', 'DEBUG'],
      env: { PORT: '9090', DEBUG: '0' },
      pwd: ''
    });

    // 4. Re-run template and verify updated stdout
    const runProcess2 = await execa(binPath, [], {
      env: {
        TAURI_TEST_CMD: 'run_cli_template',
        TAURI_TEST_ARGS: JSON.stringify({ template_id: 't-1' }),
        LOOM_CONFIG_PATH: CONFIG_PATH,
      }
    });
    expect(runProcess2.stdout).toContain('9090');
    expect(runProcess2.stdout).toContain('0');
  });

  test('scenario_database_backup_cron_mock', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'mock-cli', path: MOCK_CLI_PATH, version: '1.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: [
        { id: 't-1', cli_id: 'cli-1', name: 'Run Mock', args: ['mock-run', '--stdout', 'db backup done', '--exit', '0'], env: {}, pwd: null }
      ]
    });

    const ext = process.platform === 'win32' ? '.exe' : '';
    const binPath = `${GUI_BINARY}${ext}`;
    const runProcess = await execa(binPath, [], {
      env: {
        TAURI_TEST_CMD: 'run_cli_template',
        TAURI_TEST_ARGS: JSON.stringify({ template_id: 't-1' }),
        LOOM_CONFIG_PATH: CONFIG_PATH,
      }
    });

    expect(runProcess.stdout).toContain('db backup done');
    expect(runProcess.stdout).toContain('"status":"stopped"');
    expect(runProcess.stdout).toContain('"exit_code":0');

    // Verify last-run history is updated
    const configData = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    expect(configData.templates[0].last_run).toBeDefined();
    expect(configData.templates[0].last_run).not.toBeNull();
  });

  test('scenario_system_cleanup_and_recovery', async () => {
    // 1. Perform bulk scan creating multiple tools
    const tempDir = path.resolve(__dirname, '../temp_scenario_bulk');
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Create 12 mock tools
    const toolIds: string[] = [];
    for (let j = 0; j < 12; j++) {
      const toolExe = path.join(tempDir, `tool_${j}${ext}`);
      fs.copyFileSync(MOCK_CLI_PATH, toolExe);
    }

    try {
      const scanned = await callCmd('scan_directory', { path: tempDir });
      expect(scanned).toHaveLength(12);

      // 2. Create and assign multiple categories
      const cat1 = await callCmd('create_category', { name: 'Category 1', desc: '' });
      const cat2 = await callCmd('create_category', { name: 'Category 2', desc: '' });

      const tools = await callCmd('get_cli_tools');
      for (let j = 0; j < 6; j++) {
        await callCmd('assign_cli_category', { cli_id: tools[j].id, cat_id: cat1.id });
      }
      for (let j = 6; j < 12; j++) {
        await callCmd('assign_cli_category', { cli_id: tools[j].id, cat_id: cat2.id });
      }

      // Verify category counts
      const tools2 = await callCmd('get_cli_tools');
      const cat1Count = tools2.filter((t: any) => t.category_id === cat1.id).length;
      const cat2Count = tools2.filter((t: any) => t.category_id === cat2.id).length;
      expect(cat1Count).toBe(6);
      expect(cat2Count).toBe(6);

      // 3. Delete 10 tools
      for (let j = 0; j < 10; j++) {
        await callCmd('delete_cli_tool', { cli_id: tools2[j].id });
      }

      // Verify lists reflect 2 remaining tools
      const tools3 = await callCmd('get_cli_tools');
      expect(tools3).toHaveLength(2);

      // Run CLI list command to confirm database synchronization
      const cliBin = `${CLI_BINARY}${ext}`;
      const res = await execa(cliBin, ['list', '--json'], {
        env: {
          LOOM_CONFIG_PATH: CONFIG_PATH
        }
      });
      const parsed = JSON.parse(res.stdout);
      expect(parsed).toHaveLength(2);
    } finally {
      // Clean files
      for (let j = 0; j < 12; j++) {
        const toolExe = path.join(tempDir, `tool_${j}${ext}`);
        if (fs.existsSync(toolExe)) {
          fs.unlinkSync(toolExe);
        }
      }
      fs.rmdirSync(tempDir);
    }
  });

  // ==========================================
  // TIER 5: Internationalization (i18n) (3 tests)
  // ==========================================
  test('test_i18n_default_language', async () => {
    writeMockConfig({
      cli_tools: [],
      categories: [],
      templates: []
    });

    const lang = await callCmd('get_language');
    expect(lang).toBe('zh');
  });

  test('test_i18n_set_and_persist_language', async () => {
    writeMockConfig({
      cli_tools: [],
      categories: [],
      templates: []
    });

    await callCmd('set_language', { lang: 'en' });
    const lang = await callCmd('get_language');
    expect(lang).toBe('en');

    // Read config file directly
    const configData = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    expect(configData.language).toBe('en');
  });

  test('test_i18n_persistence_across_sessions', async () => {
    // Write configuration with language 'en'
    writeMockConfig({
      cli_tools: [],
      categories: [],
      templates: [],
      language: 'en'
    });

    // Verify it is loaded correctly on startup
    const lang = await callCmd('get_language');
    expect(lang).toBe('en');
  });

  // F8: Command Override GUI API Tests
  test('test_gui_cmd_override_crud', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: []
    });

    // 1. Create template with command override
    const temp = await callCmd('create_template', {
      cli_id: 'cli-1',
      name: 'Status Tpl',
      args: ['status'],
      env: {},
      pwd: '',
      cmd_override: 'gitstatus'
    });
    expect(temp.cmd_override).toBe('gitstatus');

    // Verify written config has the command override
    let configData = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    expect(configData.templates[0].cmd_override).toBe('gitstatus');

    // 2. Update template command override
    const updated = await callCmd('update_template', {
      template_id: temp.id,
      name: 'Status Tpl Updated',
      args: ['status', '-s'],
      env: {},
      pwd: '',
      cmd_override: 'gits'
    });
    expect(updated.cmd_override).toBe('gits');

    configData = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    expect(configData.templates[0].cmd_override).toBe('gits');
    expect(configData.templates[0].name).toBe('Status Tpl Updated');
  });

  test('test_gui_cmd_override_validation_duplicate', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: [
        { id: 't-1', cli_id: 'cli-1', name: 'Status', args: ['status'], env: {}, pwd: null, cmd_override: 'gitstatus' }
      ]
    });

    // Create a new template with the same override should fail
    await expect(callCmd('create_template', {
      cli_id: 'cli-1',
      name: 'Status 2',
      args: ['status'],
      env: {},
      pwd: '',
      cmd_override: 'gitstatus'
    })).rejects.toThrow();

    // Create another template first, then update it to duplicate override should fail
    await callCmd('create_template', {
      cli_id: 'cli-1',
      name: 'Status 3',
      args: ['status'],
      env: {},
      pwd: '',
      cmd_override: 'gitstatus-other'
    });
    const temps = await callCmd('get_templates');
    const t3 = temps.find((t: any) => t.name === 'Status 3');

    await expect(callCmd('update_template', {
      template_id: t3.id,
      name: 'Status 3',
      args: ['status'],
      env: {},
      pwd: '',
      cmd_override: 'gitstatus'
    })).rejects.toThrow();
  });

  test('test_gui_cmd_override_validation_builtin_conflicts', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: []
    });

    const builtins = ['list', 'search', 'mock-run', 'help', 'version'];
    for (const b of builtins) {
      await expect(callCmd('create_template', {
        cli_id: 'cli-1',
        name: `Tpl ${b}`,
        args: ['status'],
        env: {},
        pwd: '',
        cmd_override: b
      })).rejects.toThrow();
    }
  });

  // F9: Global Environment Variables GUI API Tests
  test('test_gui_global_env_vars_crud', async () => {
    writeMockConfig({
      cli_tools: [],
      categories: [],
      templates: []
    });

    // 1. Create global env var
    const newVar = await callCmd('create_global_env_var', {
      key: 'MY_GLOBAL_VAR',
      value: 'value-123',
      description: 'A global variable test'
    });
    expect(newVar.key).toBe('MY_GLOBAL_VAR');
    expect(newVar.value).toBe('value-123');
    expect(newVar.description).toBe('A global variable test');

    // Verify it is returned by get_global_env_vars
    let vars = await callCmd('get_global_env_vars');
    expect(vars.length).toBe(1);
    expect(vars[0].key).toBe('MY_GLOBAL_VAR');

    // 2. Update global env var
    const updated = await callCmd('update_global_env_var', {
      id: newVar.id,
      key: 'MY_GLOBAL_VAR_NEW',
      value: 'value-456',
      description: 'A global variable test updated'
    });
    expect(updated.key).toBe('MY_GLOBAL_VAR_NEW');
    expect(updated.value).toBe('value-456');

    // Verify written config
    let configData = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    expect(configData.env_vars[0].key).toBe('MY_GLOBAL_VAR_NEW');

    // 3. Delete global env var
    await callCmd('delete_global_env_var', { id: newVar.id });
    vars = await callCmd('get_global_env_vars');
    expect(vars.length).toBe(0);

    configData = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    expect(configData.env_vars.length).toBe(0);
  });

  test('test_gui_template_associates_global_env_var', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {} }
      ],
      categories: [],
      templates: []
    });

    // Create a global env var first
    const gv = await callCmd('create_global_env_var', {
      key: 'SHARED_KEY',
      value: 'shared_val',
      description: 'Shared var'
    });

    // Create template referencing global env var
    const temp = await callCmd('create_template', {
      cli_id: 'cli-1',
      name: 'Status Tpl',
      args: ['status'],
      env: { LOCAL_KEY: 'local_val' },
      env_var_ids: [gv.id],
      pwd: '',
      cmd_override: 'gitstatus'
    });

    expect(temp.env_var_ids).toEqual([gv.id]);

    let configData = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    expect(configData.templates[0].env_var_ids).toEqual([gv.id]);

    // Update template association
    const updated = await callCmd('update_template', {
      template_id: temp.id,
      name: 'Status Tpl',
      args: ['status'],
      env: { LOCAL_KEY: 'local_val_new' },
      env_var_ids: [],
      pwd: '',
      cmd_override: 'gitstatus'
    });
    expect(updated.env_var_ids).toEqual([]);

    configData = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    expect(configData.templates[0].env_var_ids).toEqual([]);
  });

  test('test_update_cli_args', async () => {
    writeMockConfig({
      cli_tools: [
        { id: 'cli-1', name: 'git', path: MOCK_CLI_PATH, version: '2.40.0', category_id: null, custom_env: {}, custom_args: [] }
      ],
      categories: [],
      templates: []
    });

    await callCmd('update_cli_args', { cli_id: 'cli-1', args: ['--help', '-v'] });
    const tools = await callCmd('get_cli_tools');
    expect(tools[0].custom_args).toEqual(['--help', '-v']);
  });

  test('test_get_agent_logs_empty', async () => {
    const logs = await callCmd('get_agent_logs', { instance_id: 'nonexistent-instance-id' });
    expect(logs).toEqual([]);
  });
});

