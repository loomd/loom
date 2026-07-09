import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";

const mockInvoke = invoke as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("api - CLI Tools", () => {
  it("getCliTools calls invoke with correct command", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    const { getCliTools } = await import("../api");
    const result = await getCliTools();
    expect(mockInvoke).toHaveBeenCalledWith("get_cli_tools");
    expect(result).toEqual([]);
  });

  it("importCliTool calls invoke with path", async () => {
    mockInvoke.mockResolvedValueOnce({ id: "1", name: "git" });
    const { importCliTool } = await import("../api");
    const result = await importCliTool("/usr/bin/git");
    expect(mockInvoke).toHaveBeenCalledWith("import_cli_tool", { path: "/usr/bin/git" });
    expect(result.name).toBe("git");
  });

  it("scanPathEnv calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    const { scanPathEnv } = await import("../api");
    await scanPathEnv();
    expect(mockInvoke).toHaveBeenCalledWith("scan_path_env");
  });

  it("scanDirectory calls invoke with path", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    const { scanDirectory } = await import("../api");
    await scanDirectory("/usr/local/bin");
    expect(mockInvoke).toHaveBeenCalledWith("scan_directory", { path: "/usr/local/bin" });
  });

  it("deleteCliTool calls invoke with cliId", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { deleteCliTool } = await import("../api");
    await deleteCliTool("cli-1");
    expect(mockInvoke).toHaveBeenCalledWith("delete_cli_tool", { cliId: "cli-1" });
  });

  it("reorderCliTools calls invoke with ids", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { reorderCliTools } = await import("../api");
    await reorderCliTools(["a", "b"]);
    expect(mockInvoke).toHaveBeenCalledWith("reorder_cli_tools", { ids: ["a", "b"] });
  });

  it("updateCliEnv calls invoke with cliId and env", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { updateCliEnv } = await import("../api");
    await updateCliEnv("cli-1", { KEY: "val" });
    expect(mockInvoke).toHaveBeenCalledWith("update_cli_env", { cliId: "cli-1", env: { KEY: "val" } });
  });

  it("updateCliArgs calls invoke with cliId and args", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { updateCliArgs } = await import("../api");
    await updateCliArgs("cli-1", ["--verbose"]);
    expect(mockInvoke).toHaveBeenCalledWith("update_cli_args", { cliId: "cli-1", args: ["--verbose"] });
  });
});

describe("api - Categories", () => {
  it("createCategory calls invoke with name and desc", async () => {
    mockInvoke.mockResolvedValueOnce({ id: "c-1", name: "Dev", description: "" });
    const { createCategory } = await import("../api");
    const result = await createCategory("Dev", "");
    expect(mockInvoke).toHaveBeenCalledWith("create_category", { name: "Dev", desc: "" });
    expect(result.name).toBe("Dev");
  });

  it("deleteCategory calls invoke with catId", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { deleteCategory } = await import("../api");
    await deleteCategory("c-1");
    expect(mockInvoke).toHaveBeenCalledWith("delete_category", { catId: "c-1" });
  });

  it("assignCliCategory calls invoke with cliId and catId", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { assignCliCategory } = await import("../api");
    await assignCliCategory("cli-1", "c-1");
    expect(mockInvoke).toHaveBeenCalledWith("assign_cli_category", { cliId: "cli-1", catId: "c-1" });
  });

  it("updateCategory calls invoke with catId, name, desc", async () => {
    mockInvoke.mockResolvedValueOnce({ id: "c-1", name: "Updated", description: "new" });
    const { updateCategory } = await import("../api");
    const result = await updateCategory("c-1", "Updated", "new");
    expect(mockInvoke).toHaveBeenCalledWith("update_category", { catId: "c-1", name: "Updated", desc: "new" });
    expect(result.name).toBe("Updated");
  });

  it("smartClassify calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce([5, 3]);
    const { smartClassify } = await import("../api");
    const result = await smartClassify();
    expect(mockInvoke).toHaveBeenCalledWith("smart_classify");
    expect(result).toEqual([5, 3]);
  });
});

describe("api - Global Env Vars", () => {
  it("getGlobalEnvVars calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    const { getGlobalEnvVars } = await import("../api");
    await getGlobalEnvVars();
    expect(mockInvoke).toHaveBeenCalledWith("get_global_env_vars");
  });

  it("createGlobalEnvVar calls invoke with fields", async () => {
    mockInvoke.mockResolvedValueOnce({ id: "e-1", key: "K", value: "V", description: "D" });
    const { createGlobalEnvVar } = await import("../api");
    const result = await createGlobalEnvVar("K", "V", "D");
    expect(mockInvoke).toHaveBeenCalledWith("create_global_env_var", { key: "K", value: "V", description: "D" });
    expect(result.key).toBe("K");
  });

  it("updateGlobalEnvVar calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce({ id: "e-1", key: "K", value: "V2", description: "D" });
    const { updateGlobalEnvVar } = await import("../api");
    const result = await updateGlobalEnvVar("e-1", "K", "V2", "D");
    expect(mockInvoke).toHaveBeenCalledWith("update_global_env_var", { id: "e-1", key: "K", value: "V2", description: "D" });
    expect(result.value).toBe("V2");
  });

  it("deleteGlobalEnvVar calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { deleteGlobalEnvVar } = await import("../api");
    await deleteGlobalEnvVar("e-1");
    expect(mockInvoke).toHaveBeenCalledWith("delete_global_env_var", { id: "e-1" });
  });
});

describe("api - Templates", () => {
  it("getTemplates calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    const { getTemplates } = await import("../api");
    await getTemplates();
    expect(mockInvoke).toHaveBeenCalledWith("get_templates");
  });

  it("createTemplate calls invoke with all fields", async () => {
    mockInvoke.mockResolvedValueOnce({ id: "t-1", name: "Test", cli_id: "cli-1", args: [], env: {}, env_var_ids: [] });
    const { createTemplate } = await import("../api");
    const result = await createTemplate("cli-1", "Test", [], {}, [], "/tmp", "/usr/bin/bash", "isolated");
    expect(mockInvoke).toHaveBeenCalledWith("create_template", {
      cliId: "cli-1", name: "Test", args: [], env: {}, envVarIds: [], pwd: "/tmp", cmdOverride: "/usr/bin/bash", envMode: "isolated",
    });
    expect(result.name).toBe("Test");
  });

  it("updateTemplate calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce({ id: "t-1", name: "Updated", cli_id: "cli-1", args: [], env: {}, env_var_ids: [] });
    const { updateTemplate } = await import("../api");
    const result = await updateTemplate("t-1", "Updated", [], {}, []);
    expect(mockInvoke).toHaveBeenCalledWith("update_template", {
      templateId: "t-1", name: "Updated", args: [], env: {}, envVarIds: [], pwd: undefined, cmdOverride: undefined, envMode: undefined,
    });
    expect(result.name).toBe("Updated");
  });

  it("deleteTemplate calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { deleteTemplate } = await import("../api");
    await deleteTemplate("t-1");
    expect(mockInvoke).toHaveBeenCalledWith("delete_template", { templateId: "t-1" });
  });

  it("reorderTemplates calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { reorderTemplates } = await import("../api");
    await reorderTemplates(["a", "b"]);
    expect(mockInvoke).toHaveBeenCalledWith("reorder_templates", { ids: ["a", "b"] });
  });
});

describe("api - Process Lifecycle", () => {
  it("runCliTemplate calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce("inst-1");
    const { runCliTemplate } = await import("../api");
    const result = await runCliTemplate("t-1");
    expect(mockInvoke).toHaveBeenCalledWith("run_cli_template", { templateId: "t-1" });
    expect(result).toBe("inst-1");
  });

  it("killCliInstance calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { killCliInstance } = await import("../api");
    await killCliInstance("inst-1");
    expect(mockInvoke).toHaveBeenCalledWith("kill_cli_instance", { instanceId: "inst-1" });
  });
});

describe("api - Language", () => {
  it("getLanguage calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce("zh");
    const { getLanguage } = await import("../api");
    const result = await getLanguage();
    expect(mockInvoke).toHaveBeenCalledWith("get_language");
    expect(result).toBe("zh");
  });

  it("setLanguage calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { setLanguage } = await import("../api");
    await setLanguage("en");
    expect(mockInvoke).toHaveBeenCalledWith("set_language", { lang: "en" });
  });
});

describe("api - Theme & Font", () => {
  it("getTheme calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce("dark");
    const { getTheme } = await import("../api");
    const result = await getTheme();
    expect(mockInvoke).toHaveBeenCalledWith("get_theme");
    expect(result).toBe("dark");
  });

  it("setTheme calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { setTheme } = await import("../api");
    await setTheme("day");
    expect(mockInvoke).toHaveBeenCalledWith("set_theme", { theme: "day" });
  });

  it("getProjectColumnAlign calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce("top");
    const { getProjectColumnAlign } = await import("../api");
    const result = await getProjectColumnAlign();
    expect(mockInvoke).toHaveBeenCalledWith("get_project_column_align");
    expect(result).toBe("top");
  });

  it("setProjectColumnAlign calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { setProjectColumnAlign } = await import("../api");
    await setProjectColumnAlign("center");
    expect(mockInvoke).toHaveBeenCalledWith("set_project_column_align", { align: "center" });
  });

  it("getFontFamily calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce("Mono");
    const { getFontFamily } = await import("../api");
    const result = await getFontFamily();
    expect(mockInvoke).toHaveBeenCalledWith("get_font_family");
    expect(result).toBe("Mono");
  });

  it("setFontFamily calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { setFontFamily } = await import("../api");
    await setFontFamily("Mono");
    expect(mockInvoke).toHaveBeenCalledWith("set_font_family", { font: "Mono" });
  });

  it("getFontSize calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce("14px");
    const { getFontSize } = await import("../api");
    const result = await getFontSize();
    expect(mockInvoke).toHaveBeenCalledWith("get_font_size");
    expect(result).toBe("14px");
  });

  it("setFontSize calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { setFontSize } = await import("../api");
    await setFontSize("16px");
    expect(mockInvoke).toHaveBeenCalledWith("set_font_size", { size: "16px" });
  });
});

describe("api - Projects", () => {
  it("getProjects calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    const { getProjects } = await import("../api");
    await getProjects();
    expect(mockInvoke).toHaveBeenCalledWith("get_projects");
  });

  it("createProject calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce({ id: "p-1", name: "MyApp", root_path: "/app" });
    const { createProject } = await import("../api");
    const result = await createProject("MyApp", "/app");
    expect(mockInvoke).toHaveBeenCalledWith("create_project", { name: "MyApp", rootPath: "/app" });
    expect(result.name).toBe("MyApp");
  });

  it("deleteProject calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { deleteProject } = await import("../api");
    await deleteProject("p-1");
    expect(mockInvoke).toHaveBeenCalledWith("delete_project", { id: "p-1" });
  });

  it("getProjectAgents calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    const { getProjectAgents } = await import("../api");
    await getProjectAgents("p-1");
    expect(mockInvoke).toHaveBeenCalledWith("get_project_agents", { projectId: "p-1" });
  });

  it("spawnProjectAgent calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce("inst-1");
    const { spawnProjectAgent } = await import("../api");
    const result = await spawnProjectAgent("p-1", "npm", ["run", "test"], "inherit", {}, "/app");
    expect(mockInvoke).toHaveBeenCalledWith("spawn_project_agent", {
      projectId: "p-1", command: "npm", args: ["run", "test"], envMode: "inherit", customEnvs: {}, pwd: "/app",
    });
    expect(result).toBe("inst-1");
  });

  it("getAgentLogs calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(["log1"]);
    const { getAgentLogs } = await import("../api");
    const result = await getAgentLogs("inst-1");
    expect(mockInvoke).toHaveBeenCalledWith("get_agent_logs", { instanceId: "inst-1" });
    expect(result).toEqual(["log1"]);
  });

  it("killAgentProcess calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { killAgentProcess } = await import("../api");
    await killAgentProcess("inst-1");
    expect(mockInvoke).toHaveBeenCalledWith("kill_agent_process", { instanceId: "inst-1" });
  });

  it("bringAgentToForeground calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(true);
    const { bringAgentToForeground } = await import("../api");
    const result = await bringAgentToForeground("inst-1");
    expect(mockInvoke).toHaveBeenCalledWith("bring_agent_to_foreground", { instanceId: "inst-1" });
    expect(result).toBe(true);
  });

  it("selectDirectory calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce("/path");
    const { selectDirectory } = await import("../api");
    const result = await selectDirectory();
    expect(mockInvoke).toHaveBeenCalledWith("select_directory");
    expect(result).toBe("/path");
  });

  it("reorderProjects calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { reorderProjects } = await import("../api");
    await reorderProjects(["a", "b"]);
    expect(mockInvoke).toHaveBeenCalledWith("reorder_projects", { ids: ["a", "b"] });
  });

  it("getProjectSkills calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    const { getProjectSkills } = await import("../api");
    await getProjectSkills("p-1");
    expect(mockInvoke).toHaveBeenCalledWith("get_project_skills", { projectId: "p-1" });
  });

  it("toggleProjectSkill calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { toggleProjectSkill } = await import("../api");
    await toggleProjectSkill("p-1", "skill-x", true);
    expect(mockInvoke).toHaveBeenCalledWith("toggle_project_skill", { projectId: "p-1", skillName: "skill-x", enabled: true });
  });

  it("scanProjectAgentDocs calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    const { scanProjectAgentDocs } = await import("../api");
    await scanProjectAgentDocs("p-1");
    expect(mockInvoke).toHaveBeenCalledWith("scan_project_agent_docs", { projectId: "p-1" });
  });

  it("createProjectAgentDoc calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce({ relative_path: "docs/guide.md", absolute_path: "/app/docs/guide.md", file_name: "guide.md" });
    const { createProjectAgentDoc } = await import("../api");
    const result = await createProjectAgentDoc("p-1", "docs/guide.md", "markdown");
    expect(mockInvoke).toHaveBeenCalledWith("create_project_agent_doc", { projectId: "p-1", relativePath: "docs/guide.md", docType: "markdown" });
    expect(result.file_name).toBe("guide.md");
  });
});

describe("api - Global Skills & Docs", () => {
  it("getGlobalSkills calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    const { getGlobalSkills } = await import("../api");
    await getGlobalSkills();
    expect(mockInvoke).toHaveBeenCalledWith("get_global_skills");
  });

  it("createGlobalSkill calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce({ id: "gs-1", name: "skill1", description: "desc", content: "# content", files: {} });
    const { createGlobalSkill } = await import("../api");
    const result = await createGlobalSkill("skill1", "desc", "# content", {});
    expect(mockInvoke).toHaveBeenCalledWith("create_global_skill", { name: "skill1", description: "desc", content: "# content", files: {} });
    expect(result.name).toBe("skill1");
  });

  it("updateGlobalSkill calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce({ id: "gs-1", name: "skill1", description: "desc", content: "# content", files: {} });
    const { updateGlobalSkill } = await import("../api");
    const result = await updateGlobalSkill("gs-1", "skill1", "desc", "# content", {});
    expect(mockInvoke).toHaveBeenCalledWith("update_global_skill", { id: "gs-1", name: "skill1", description: "desc", content: "# content", files: {} });
    expect(result.name).toBe("skill1");
  });

  it("deleteGlobalSkill calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { deleteGlobalSkill } = await import("../api");
    await deleteGlobalSkill("gs-1");
    expect(mockInvoke).toHaveBeenCalledWith("delete_global_skill", { id: "gs-1" });
  });

  it("getGlobalDocs calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    const { getGlobalDocs } = await import("../api");
    await getGlobalDocs();
    expect(mockInvoke).toHaveBeenCalledWith("get_global_docs");
  });

  it("createGlobalDoc calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce({ id: "gd-1", alias: "doc1", default_filename: "DOC.md", content: "# doc" });
    const { createGlobalDoc } = await import("../api");
    const result = await createGlobalDoc("doc1", "DOC.md", "# doc");
    expect(mockInvoke).toHaveBeenCalledWith("create_global_doc", { alias: "doc1", defaultFilename: "DOC.md", content: "# doc" });
    expect(result.alias).toBe("doc1");
  });

  it("updateGlobalDoc calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce({ id: "gd-1", alias: "doc1", default_filename: "DOC.md", content: "# doc" });
    const { updateGlobalDoc } = await import("../api");
    const result = await updateGlobalDoc("gd-1", "doc1", "DOC.md", "# doc");
    expect(mockInvoke).toHaveBeenCalledWith("update_global_doc", { id: "gd-1", alias: "doc1", defaultFilename: "DOC.md", content: "# doc" });
    expect(result.id).toBe("gd-1");
  });

  it("deleteGlobalDoc calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { deleteGlobalDoc } = await import("../api");
    await deleteGlobalDoc("gd-1");
    expect(mockInvoke).toHaveBeenCalledWith("delete_global_doc", { id: "gd-1" });
  });

  it("importGlobalSkillToProject calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { importGlobalSkillToProject } = await import("../api");
    await importGlobalSkillToProject("p-1", "gs-1");
    expect(mockInvoke).toHaveBeenCalledWith("import_global_skill_to_project", { projectId: "p-1", skillId: "gs-1" });
  });

  it("importGlobalDocToProject calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce({ relative_path: "docs/rules.md", absolute_path: "/app/docs/rules.md", file_name: "rules.md" });
    const { importGlobalDocToProject } = await import("../api");
    const result = await importGlobalDocToProject("p-1", "gd-1", "docs/rules.md");
    expect(mockInvoke).toHaveBeenCalledWith("import_global_doc_to_project", { projectId: "p-1", docId: "gd-1", relativePath: "docs/rules.md" });
    expect(result.file_name).toBe("rules.md");
  });

  it("parseLocalSkillDir calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce({ id: "gs-1", name: "skill1", description: "", content: "", files: {} });
    const { parseLocalSkillDir } = await import("../api");
    const result = await parseLocalSkillDir("/path/to/skill");
    expect(mockInvoke).toHaveBeenCalledWith("parse_local_skill_dir", { path: "/path/to/skill" });
    expect(result.name).toBe("skill1");
  });
});

describe("api - Autostart", () => {
  it("getAutostart calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(true);
    const { getAutostart } = await import("../api");
    const result = await getAutostart();
    expect(mockInvoke).toHaveBeenCalledWith("get_autostart");
    expect(result).toBe(true);
  });

  it("setAutostart calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { setAutostart } = await import("../api");
    await setAutostart(true);
    expect(mockInvoke).toHaveBeenCalledWith("set_autostart", { enabled: true });
  });
});

describe("api - File Explorer", () => {
  it("listProjectFiles calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    const { listProjectFiles } = await import("../api");
    await listProjectFiles("/app");
    expect(mockInvoke).toHaveBeenCalledWith("list_project_files", { dirPath: "/app" });
  });

  it("openFileWithSystem calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { openFileWithSystem } = await import("../api");
    await openFileWithSystem("/app/file.txt");
    expect(mockInvoke).toHaveBeenCalledWith("open_file_with_system", { filePath: "/app/file.txt" });
  });

  it("openInManager calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { openInManager } = await import("../api");
    await openInManager("/app");
    expect(mockInvoke).toHaveBeenCalledWith("open_in_manager", { itemPath: "/app" });
  });

  it("deleteFileEntry calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { deleteFileEntry } = await import("../api");
    await deleteFileEntry("/app/file.txt", false);
    expect(mockInvoke).toHaveBeenCalledWith("delete_file_entry", { filePath: "/app/file.txt", isDir: false });
  });

  it("readTextFile calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce("file content");
    const { readTextFile } = await import("../api");
    const result = await readTextFile("/app/file.txt");
    expect(mockInvoke).toHaveBeenCalledWith("read_text_file", { filePath: "/app/file.txt" });
    expect(result).toBe("file content");
  });

  it("writeTextFile calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { writeTextFile } = await import("../api");
    await writeTextFile("/app/file.txt", "content");
    expect(mockInvoke).toHaveBeenCalledWith("write_text_file", { filePath: "/app/file.txt", content: "content" });
  });

  it("openUrl calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { openUrl } = await import("../api");
    await openUrl("https://example.com");
    expect(mockInvoke).toHaveBeenCalledWith("open_url", { url: "https://example.com" });
  });

  it("getSkippedVersion calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(null);
    const { getSkippedVersion } = await import("../api");
    const result = await getSkippedVersion();
    expect(mockInvoke).toHaveBeenCalledWith("get_skipped_version");
    expect(result).toBeNull();
  });

  it("setSkippedVersion calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { setSkippedVersion } = await import("../api");
    await setSkippedVersion("0.4.0");
    expect(mockInvoke).toHaveBeenCalledWith("set_skipped_version", { version: "0.4.0" });
  });

  it("getUpdateCheckInterval calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce("1h");
    const { getUpdateCheckInterval } = await import("../api");
    const result = await getUpdateCheckInterval();
    expect(mockInvoke).toHaveBeenCalledWith("get_update_check_interval");
    expect(result).toBe("1h");
  });

  it("setUpdateCheckInterval calls invoke", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { setUpdateCheckInterval } = await import("../api");
    await setUpdateCheckInterval("30min");
    expect(mockInvoke).toHaveBeenCalledWith("set_update_check_interval", { interval: "30min" });
  });
});

describe("api - Error Propagation", () => {
  it("propagates invoke error", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("backend error"));
    const { getCliTools } = await import("../api");
    await expect(getCliTools()).rejects.toThrow("backend error");
  });
});
