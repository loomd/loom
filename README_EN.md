<p align="center">
  <img src="samples/20260706-124550.jpg" alt="Loom Screenshot" width="780" />
</p>

<p align="center">
  <a href="https://github.com/loomd/loom/actions/workflows/ci.yml"><img src="https://github.com/loomd/loom/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>&nbsp;<a href="https://github.com/loomd/loom/releases"><img src="https://img.shields.io/github/v/release/loomd/loom?color=blue" alt="Release" /></a>&nbsp;<a href="LICENSE"><img src="https://img.shields.io/badge/license-FSL--1.1--ALv2-blue" alt="FSL-1.1-ALv2" /></a>
</p>

## Loom

Multi-Project Management & Multi-Agent Parallel Development.

## Features

### Project Management

Manage project files, skills, and AGENTS.md with independent configuration per project.

### Local Agent Discovery

Automatically scans locally installed CLI tools with support for manual registration. Just discover and use.

### AI Agent Environment Isolation

Each agent gets its own isolated environment with custom variables, preventing configuration conflicts across projects.

### Agent Terminal Aggregation

Centralized terminal management across all agents. View every agent's status and logs in one place.

## Quick Start

### Download

- **Installer**: Get the latest `.exe` from [Releases](https://github.com/loomd/loom/releases)
- **Portable**: A `.zip` package is also available - unzip and run

### Development

```bash
git clone https://github.com/loomd/loom.git
cd loom
```

Install dependencies:
```bash
cd crates/gui/frontend
npm install
```

Run in development mode:
```bash
cargo tauri dev
```

## License

**Functional Source License, Version 1.1, ALv2 Future License (FSL-1.1-ALv2)**

Loom is licensed under Fair Source. You may freely use, modify, fork and redistribute it, including publishing closed-source derivatives; however, you may **not** use Loom to build a commercial product or service that competes with this project. Internal use, non-commercial research, and professional services for licensees are all permitted.

Each version automatically **converts to Apache-2.0** two years after its release (irrevocably). The "Loom" trademark is not included in the grant.

See [LICENSING.md](LICENSING.md) for per-version license history and commercial licensing contacts, and [TRADEMARKS.md](TRADEMARKS.md) for trademark rules.

---

[中文](README.md)