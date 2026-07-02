# GUI Dashboard and Frontend Integration

## Overview
Implement a responsive desktop GUI dashboard using Tauri (Rust backend + Web Frontend). It allows users to view scanned/imported CLI tools, manage categories and env variables, run tools using templates, and view live process streams and kill running processes.

## Requirements
- [ ] Setup Tauri frontend framework (e.g. React/Svelte/Vue or plain HTML/JS with Tailwind CSS).
- [ ] Build a dashboard UI displaying all CLI tools (grouped or filterable by category).
- [ ] Build UI forms for creating/updating categories, custom environment variables, and execution templates.
- [ ] Implement terminal-like view for real-time stdout/stderr log streaming.
- [ ] Connect frontend components to Tauri Rust commands.

## Acceptance Criteria
- [ ] Users can browse, filter, edit, and run CLI tools directly from the GUI.
- [ ] The terminal view shows logs in real-time when a CLI tool is executed.
- [ ] The stop/terminate button in the UI halts execution and updates process status.
