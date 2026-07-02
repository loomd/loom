# Plan — CliMaster Development

## Goal
Implement a local CLI management tool called CliMaster, featuring a Tauri-based GUI, a CLI `climaster`, auto-scanning of PATH, categorization, custom env vars, execution templates, and live process log streaming and termination. Follow HarnSpec process and Project dual-track (Implementation + E2E Testing).

## Milestones

### Milestone 1: Workspace Setup, Shared Contracts & Persistence (Specs: 001-setup)
- Initialize Rust workspace and Tauri project structure.
- Define persistence mechanism (JSON file or SQLite).
- Define shared interface contracts (Tauri Commands, Rust module APIs).

### Milestone 2: Global CLI `climaster` (Specs: 002-cli)
- Implement `climaster` global binary.
- Implement list/query commands.
- Support JSON and table output formatting.

### Milestone 3: Auto-Scanner & Manual Importer (Specs: 003-scanner)
- Crawl PATH environment variable for executables (filtering non-CLI executables).
- Support manual file and directory scanning.
- Save results to persistence layer.

### Milestone 4: Categorization & Custom Environment Variables (Specs: 004-metadata)
- Implement CLI tool categorization.
- Implement CRUD operations for custom environment variables per CLI.

### Milestone 5: Template & Process Lifecycle Manager (Specs: 005-process)
- Implement run templates (args, env, working dir).
- Run CLI instances and stream stdout/stderr logs.
- Support killing running processes (including child processes on Windows).

### Milestone 6: GUI Frontend Integration (Specs: 006-gui)
- Build responsive frontend dashboard.
- Integrate Tauri IPC calls to category management, run templates, scan results.
- Implement live terminal log stream UI and process control buttons.

### Milestone 7: Final Integration, E2E Verification & Adversarial Hardening (Specs: 007-integration)
- Run complete E2E testing suite designed by E2E Testing Track.
- Run adversarial testing (whitebox gap detection and fixing).
- Ensure all HarnSpec specs are validated and marked complete.

## Dual Track Strategy
- **Implementation Track**: Executes Milestones 1-7.
- **E2E Testing Track**: Standard 4-tier test case design, creates `TEST_INFRA.md` and outputs `TEST_READY.md`.
