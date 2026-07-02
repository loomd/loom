# Global CLI climaster

## Overview
Implement the `climaster` command-line executable. It allows users to query registered, scanned, or imported CLI tools in the system, support structured JSON/table outputs, and run searches.

## Requirements
- [ ] Implement `climaster` command-line parsing (e.g., using `clap`).
- [ ] Implement `climaster list` or `climaster query` to list all registered CLI tools.
- [ ] Implement `--format json` or `--json` flag to output standard JSON data.
- [ ] Implement query filters (e.g., filter by category, path, or name).
- [ ] Write unit and integration tests verifying query command outputs.

## Acceptance Criteria
- [ ] Running `climaster list` returns a tabular list of registered tools.
- [ ] Running `climaster list --format json` (or `--json`) outputs valid JSON representing the tools.
