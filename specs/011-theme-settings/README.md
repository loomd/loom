---
status: complete
created: 2026-06-20
priority: medium
tags:
- gui
- tauri
- theme
- settings
parent: 001-climaster-project
created_at: 2026-06-20T13:29:46.894376500Z
updated_at: 2026-06-20T13:33:17.472170Z
completed_at: 2026-06-20T13:33:17.472170Z
transitions:
- status: in-progress
  at: 2026-06-20T13:29:54.371451700Z
- status: complete
  at: 2026-06-20T13:33:17.472170Z
---

# Theme Settings and Global Icon

## Overview
Implement day/dark theme switching, introduce a dedicated Settings page to configure app options (theme, language), and replace the sidebar placeholder icon with the global application logo. In addition, refine the dark theme to reduce excessive contrast and glare, and design a soft, gentle day theme.

## Requirements
- [x] **Global Icon Replacement**:
  - Replace the text-based icon (`⌘`) in the sidebar logo with the global application icon image.
- [x] **Settings Option and Navigation**:
  - Add a "Settings" (⚙) item to the sidebar navigation panel.
  - Introduce a Settings page/view containing application configurations: Theme selection (Dark / Day) and Language selection (Chinese / English).
- [x] **Theme Switching Mechanics**:
  - Store the selected theme in the storage configuration.
  - Implement backend APIs (`get_theme`, `set_theme`) to persist theme choices.
  - Load the stored theme on application startup and apply it as a CSS class (`.theme-day` or `.theme-dark`) to the document/body element.
- [x] **Refine Dark Theme**:
  - Tweak the dark theme variables in CSS to reduce contrast fatigue. Move away from absolute black (`#050505`) to a slightly softer deep gray/navy tone (e.g., `#0f0f13` or `#121216`), and soften glowing effects and text colors.
- [x] **Implement Soft Day Theme**:
  - Create a custom, high-aesthetic light theme (`.theme-day`) matching the Ethereal Glass archetype.
  - Use soft, low-glare light background colors, muted text colors, and gentle frosted glass shadow effects instead of dark neon glows.

## Non-Goals
- Adding settings options other than theme and language.
- Automatic theme switching based on system preference (keep it manual via settings).

## Technical Notes
- **Storage/Backend**:
  - Update `CliMasterStorage` in `crates/core/src/storage/models.rs` to include a `theme` field (defaulting to "dark").
  - Implement `get_theme` and `set_theme` helper functions in `crates/core/src/storage/manager.rs` and expose them via Tauri commands.
- **Frontend**:
  - Add API wrappers in `crates/gui/frontend/src/api.ts` to call backend theme commands.
  - Add new language translations in `I18nContext.tsx` under the `'settings.*'` keys.
  - Copy the `icon.png` or similar app logo into the frontend assets directory and display it in the sidebar.

## Acceptance Criteria
- [x] The sidebar displays the global logo instead of the placeholder `⌘`.
- [x] A settings menu item is available in the sidebar, which successfully navigates to the Settings page.
- [x] The Settings page allows users to change the language (Chinese/English) and theme (Dark/Day).
- [x] The language selection in the settings page works immediately and persists on restart.
- [x] The theme selection persists across restarts.
- [x] The dark theme is softer and less glary, and the day theme is soft, gentle, and follows the design system aesthetic.
