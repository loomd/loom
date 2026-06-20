---
status: completed
created: 2026-06-20
priority: medium
parent: 001-climaster-project
created_at: 2026-06-20T13:41:38.791966400Z
updated_at: 2026-06-20T14:32:00.000000000Z
transitions:
- status: in-progress
  at: 2026-06-20T13:43:01.045246300Z
- status: completed
  at: 2026-06-20T14:32:00.000000000Z
---

# Command Override Feature

## Overview
Implement a command override feature in the execution template. This feature allows creating a command that overrides the original command. For example, if the default CLI tool name/command is `gemini`, we can create a template with a command override `gemini1` that still runs `gemini` but carries different environment variables or arguments. Executing `climaster gemini1` will resolve to this template and execute the underlying CLI tool `gemini` with the template's configuration.

## Requirements
- [x] **Data Model Update**:
  - Add an optional `cmd_override` field (type `Option<String>`) to the `Template` struct.
- [x] **Storage API Updates**:
  - Update `create_template` and `update_template` in `crates/core` to support the new `cmd_override` field.
  - Enforce validation: the `cmd_override` must be unique across all templates.
- [x] **CLI Runner Updates**:
  - Update `climaster` CLI binary (`crates/cli/src/main.rs`) to support running commands directly.
  - If a command line execution has a subcommand that is not a built-in one (not `list`, `search`, `mock-run`, etc.), look up if it matches a template's `cmd_override` or a CLI tool's `name`.
  - If it matches a template's `cmd_override`, execute the template synchronously in the current terminal, inheriting stdin/stdout/stderr, passing template env vars, template args, and appending any extra arguments passed.
  - If it matches a CLI tool's `name` (and no template overrides it), execute the CLI tool directly, inheriting stdin/stdout/stderr and passing custom env vars, appending any extra arguments.
- [x] **Tauri Backend Updates**:
  - Update the Tauri command handlers for template creation and update to accept and return the new `cmd_override` field.
- [x] **Frontend GUI Updates**:
  - Add a "Command Override" (指令覆盖) input field in the Template creation and editing modal.
  - Display the Command Override value on the template card.
  - Support localization for the new field labels and placeholders in English and Chinese.
- [x] **E2E Testing**:
  - Write test cases verifying command override creation, validation, CLI execution mapping, environment inheritance, and GUI display.

## Acceptance Criteria
- [x] A template can be successfully created/updated with a command override name (e.g. `gemini1`).
- [x] Running `climaster gemini1` in the terminal runs the underlying CLI tool (e.g., `gemini`) with the template's arguments, environment variables, and any additional arguments appended.
- [x] Running `climaster` with a registered CLI name directly executes that CLI tool.
- [x] Validation prevents duplicate command overrides.
- [x] The GUI provides an input field for "Command Override" (指令覆盖) and displays it on the template card.
