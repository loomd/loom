# Running Templates and Process Lifecycle Management

## Overview
Implement CLI execution templates (default arguments, env vars, working dir) and process lifecycle management (launching CLI instances, real-time log streaming of stdout/stderr, and killing process trees safely on Windows).

## Requirements
- [ ] Implement CRUD for CLI Execution Templates (id, cli_name, default_args, env, pwd).
- [ ] Implement process execution engine to launch a CLI using a selected template.
- [ ] Capture stdout and stderr streams in real-time, sending them to the GUI/frontend.
- [ ] Implement process tree termination (Kill) to kill the launched process and all its child processes on Windows.
- [ ] Write tests verifying process execution, stream capturing, and termination.

## Acceptance Criteria
- [ ] A CLI tool runs successfully using a template with custom env vars and arguments.
- [ ] Logs are streamed live from the running process.
- [ ] Terminating a running process kills it and its child processes, updating its state to stopped.
