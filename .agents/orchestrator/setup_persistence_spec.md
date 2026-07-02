# Setup and Persistence

## Overview
Initialize the project structure as a Rust workspace with Tauri, configure dependency crates, and implement the local persistence system (JSON or SQLite) to store scanned/imported CLI tools, categories, env variables, and templates.

## Requirements
- [ ] Initialize Cargo workspace with `climaster-cli` (or common library) and `climaster-gui` packages.
- [ ] Configure `Cargo.toml` with dependencies (Tauri, serde, serde_json, etc.).
- [ ] Implement database or JSON configuration manager to store:
  - Scanned and imported CLI lists (name, path, version, category_id, custom_env, templates).
  - Categories (id, name, description).
  - Templates (id, cli_name, args, env, pwd).
- [ ] Write unit tests for storage load and save logic.

## Acceptance Criteria
- [ ] Storage loader can read and write configuration successfully.
- [ ] Tests verify that modifications to CLI, category, or template databases are saved and loaded correctly.
