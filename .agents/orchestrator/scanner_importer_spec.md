# Auto-Scanner and Manual Importer

## Overview
Implement the scanning logic that detects CLI executables. It reads the system `PATH` env var to find executables (on Windows: `.exe`, `.bat`, `.cmd`, `.ps1`), deduplicates and indexes them. Also support manual file and folder import.

## Requirements
- [ ] Implement system `PATH` auto-scanner.
- [ ] Filter out non-CLI executables (or allow selecting/de-selecting and basic deduplication by executable name).
- [ ] Implement manual importing of a single executable file.
- [ ] Implement manual importing of an entire folder.
- [ ] Persist scanned and imported items into the configuration database/file.
- [ ] Write tests verifying path resolution, extension filtering, and duplication detection.

## Acceptance Criteria
- [ ] Auto-scanner detects standard Windows executables in PATH correctly.
- [ ] Users can manually import a single file or directory and see it added to the database.
