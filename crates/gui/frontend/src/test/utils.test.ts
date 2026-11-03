import { describe, it, expect } from "vitest";
import { buildMcodeResumeArgs, buildOpencodeResumeArgs, mergeCliArgs, projectPathKey } from "../utils";

describe("mergeCliArgs", () => {
  it("merges empty arrays", () => {
    expect(mergeCliArgs([], [])).toEqual([]);
  });

  it("returns base args when no override", () => {
    expect(mergeCliArgs(["status"], [])).toEqual(["status"]);
  });

  it("appends new override args", () => {
    expect(mergeCliArgs(["status"], ["--verbose"])).toEqual(["status", "--verbose"]);
  });

  it("overrides named arg value", () => {
    expect(mergeCliArgs(["--name", "foo"], ["--name", "bar"])).toEqual(["--name", "bar"]);
  });

  it("overrides named arg with = syntax", () => {
    expect(mergeCliArgs(["--name=foo"], ["--name=bar"])).toEqual(["--name=bar"]);
  });

  it("handles flag + named with same key (different types, no override)", () => {
    // base has --verbose as flag, override has --verbose as named=value
    // different key types -> both preserved
    expect(mergeCliArgs(["--verbose"], ["--verbose", "1"])).toEqual(["--verbose", "--verbose", "1"]);
  });

  it("handles positional args with override", () => {
    expect(mergeCliArgs(["input.txt"], ["output.txt"])).toEqual(["output.txt"]);
  });

  it("preserves base positional order when not overridden", () => {
    expect(mergeCliArgs(["input.txt", "--format", "json"], ["--format", "yaml"])).toEqual(["input.txt", "--format", "yaml"]);
  });

  it("handles -c config switch with same subkey overrides", () => {
    expect(mergeCliArgs(["-c", "key1=val1"], ["-c", "key1=val2"])).toEqual(["-c", "key1=val2"]);
  });

  it("handles -c config switch with different subkeys keeps both", () => {
    expect(mergeCliArgs(["-c", "key1=val1"], ["-c", "key2=val2"])).toEqual(["-c", "key1=val1", "-c", "key2=val2"]);
  });

  it("merges -c config with override adding new subkey", () => {
    const result = mergeCliArgs(["-c", "key1=val1"], ["--verbose"]);
    expect(result).toContain("-c");
    expect(result).toContain("key1=val1");
    expect(result).toContain("--verbose");
  });

  it("handles mixed positional, named, flags", () => {
    const base = ["input.txt", "--format", "json", "--verbose"];
    const override = ["--format", "yaml"];
    expect(mergeCliArgs(base, override)).toEqual(["input.txt", "--format", "yaml", "--verbose"]);
  });

  it("handles empty strings in args", () => {
    expect(mergeCliArgs(["", "--flag"], ["--name", ""])).toEqual(["--flag", "--name", ""]);
  });
});

describe("projectPathKey", () => {
  it("returns identical keys for the same path", () => {
    expect(projectPathKey("D:\\Develop\\loom")).toBe(projectPathKey("D:\\Develop\\loom"));
  });

  it("ignores letter case (Windows)", () => {
    expect(projectPathKey("D:\\Develop\\Loom")).toBe(projectPathKey("d:\\develop\\loom"));
  });

  it("normalizes forward slashes to backslashes", () => {
    expect(projectPathKey("D:/Develop/loom")).toBe(projectPathKey("D:\\Develop\\loom"));
  });

  it("ignores trailing separators", () => {
    expect(projectPathKey("D:\\Develop\\loom\\")).toBe(projectPathKey("D:\\Develop\\loom"));
    expect(projectPathKey("  D:\\Develop\\loom  ")).toBe(projectPathKey("D:\\Develop\\loom"));
  });

  it("keeps distinct paths distinct", () => {
    expect(projectPathKey("D:\\Develop\\loom")).not.toBe(projectPathKey("D:\\Develop\\other"));
  });
});

describe("buildMcodeResumeArgs", () => {
  it("removes --mode lightweight and injects --session", () => {
    const raw = ["--model", "custom_provider:loom/claude-opus-4-6-thinking", "--mode", "lightweight"];
    const result = buildMcodeResumeArgs(raw, "mvs_12345");
    expect(result).toEqual([
      "--model",
      "custom_provider:loom/claude-opus-4-6-thinking",
      "--session",
      "mvs_12345",
    ]);
  });

  it("removes --mode=lightweight syntax", () => {
    const raw = ["--mode=lightweight", "--ptc"];
    const result = buildMcodeResumeArgs(raw, "mvs_12345");
    expect(result).toEqual(["--ptc", "--session", "mvs_12345"]);
  });

  it("removes -c and --continue conflicting flags", () => {
    const raw = ["-c", "--model", "custom_provider:loom/claude-opus-4-6-thinking"];
    const result = buildMcodeResumeArgs(raw, "mvs_12345");
    expect(result).toEqual([
      "--model",
      "custom_provider:loom/claude-opus-4-6-thinking",
      "--session",
      "mvs_12345",
    ]);
  });

  it("replaces old --session and --resume arguments", () => {
    const raw = ["--session", "old_session", "--resume", "old_resume", "-m", "loom/model"];
    const result = buildMcodeResumeArgs(raw, "mvs_new");
    expect(result).toEqual(["-m", "loom/model", "--session", "mvs_new"]);
  });

  it("handles undefined or empty args cleanly", () => {
    expect(buildMcodeResumeArgs(undefined, "mvs_12345")).toEqual(["--session", "mvs_12345"]);
    expect(buildMcodeResumeArgs([], "mvs_12345")).toEqual(["--session", "mvs_12345"]);
  });
});

describe("buildOpencodeResumeArgs", () => {
  it("replaces old -s or --session with new sessionId", () => {
    const raw = ["-s", "old_sess", "--verbose"];
    const result = buildOpencodeResumeArgs(raw, "ses_new");
    expect(result).toEqual(["--verbose", "-s", "ses_new"]);
  });

  it("removes conflicting -c / --continue flags", () => {
    const raw = ["-c", "--continue", "--model", "anthropic/claude"];
    const result = buildOpencodeResumeArgs(raw, "ses_new");
    expect(result).toEqual(["--model", "anthropic/claude", "-s", "ses_new"]);
  });

  it("handles undefined or empty args cleanly", () => {
    expect(buildOpencodeResumeArgs(undefined, "ses_12345")).toEqual(["-s", "ses_12345"]);
    expect(buildOpencodeResumeArgs([], "ses_12345")).toEqual(["-s", "ses_12345"]);
  });
});

