import { describe, it, expect } from "vitest";
import { mergeCliArgs } from "../utils";

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
