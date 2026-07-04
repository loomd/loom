---
status: complete
created: 2026-07-04
priority: medium
tags:
- gui
- sidebar
- layout
- tauri
created_at: 2026-07-04T00:00:00Z
updated_at: 2026-07-04T00:00:00Z
completed_at: 2026-07-04T00:00:00Z
transitions:
- status: complete
  at: 2026-07-04T00:00:00Z
---

# Spec 026: Sidebar Resize and Collapse

## Overview
This specification details the frontend-only implementation of a resizable and collapsible projects sidebar within the Loom desktop workspace interface. The solution utilizes React state management and coordinates layout widths directly inside the index.css styling definitions.

## Requirements
- Persist state changes without modification to the Rust-based Tauri backend APIs.
- Provide drag-to-resize operations that scale dynamically without causing layout stuttering.
- Include auto-collapsing interactions based on size boundaries.

## Technical Architecture
- **State Keys**:
  - `loom_sidebar_width`: Stores integer width configurations representing current display parameters.
  - `loom_sidebar_collapsed`: Boolean marker flagging whether sidebar is currently collapsed.
- **Resizer Mechanism**: A vertical visual divider overlay that tracks mouse drag movements through DOM level events.
- **CSS Setup**: Dynamic styling applied inline to the Grid layout template on the `.app-shell` element.

## Acceptance Criteria
- Clicking and dragging the right-hand border of the sidebar changes its width within constraints.
- Sidebar width is constrained between a minimum of 140px and a maximum of 450px.
- Dragging the sidebar size below 80px triggers auto-collapse.
- Double-clicking the resizer bar resets the sidebar width back to the default fallback size of 170px.
- The sidebar contains a collapse button inside its header, which collapses the panel to 0px width.
- A floating expand button is rendered at the bottom-left coordinate of the workspace when the sidebar is collapsed. Clicking it restores the sidebar to its last saved width.
- The sidebar width and collapsed configurations persist correctly across app restarts and view shifts.
