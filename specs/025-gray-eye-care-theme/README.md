---
status: complete
created: 2026-07-03
priority: medium
tags:
- gui
- theme
- design
- eye-care
created_at: 2026-07-03T15:03:32.130941800Z
updated_at: 2026-07-03T15:11:13.540537500Z
completed_at: 2026-07-03T15:11:13.540537500Z
transitions:
- status: in-progress
  at: 2026-07-03T15:04:08.378676200Z
- status: complete
  at: 2026-07-03T15:11:13.540537500Z
---

# Gray Eye-Care Theme Design

## Overview
Design and implement a gray theme positioned between black and white, with the core philosophy of eye protection. This theme should cover shell backgrounds with low contrast to prevent glare and eye strain. The design follows the high-end-visual-design skill principles for premium UI/UX.

## Design Principles (from high-end-visual-design)
- **Vibe Archetype**: Soft Structuralism (Consumer / Health / Portfolio)
  - Silver-grey or completely white backgrounds
  - Massive bold Grotesk typography
  - Airy, floating components with unbelievably soft, highly diffused ambient shadows
- **Layout Archetype**: The Z-Axis Cascade
  - Elements stacked like physical cards, slightly overlapping each other with varying depths of field
  - Some with subtle rotations to break the digital grid
- **Color Philosophy**: 
  - Pure black (#000000) is too harsh, pure white (#FFFFFF) is too bright
  - Gray theme should sit in the comfortable middle ground
  - Low contrast ratios to minimize eye strain
  - Soft, muted color palette

## Requirements
- [x] **Color Palette Design**:
  - Base gray: #1a1a1f (dark gray, not pure black)
  - Surface gray: #2a2a30 (slightly lighter for cards)
  - Elevated gray: #3a3a40 (for interactive elements)
  - Text colors: #e0e0e0 (primary), #a0a0a0 (secondary), #707070 (tertiary)
  - All colors must have low contrast ratios (4.5:1 or less for text)
  
- [x] **Shell Background Implementation**:
  - Terminal/shell backgrounds use the gray theme colors
  - Background should be #1a1a1f or similar soft gray
  - Text should be #c8c8c8 or softer for readability
  - Remove pure black (#000) backgrounds from terminals
  
- [x] **CSS Variable System**:
  - Create comprehensive CSS variable system for gray theme
  - Include all color, shadow, and border variables
  - Ensure smooth transitions between themes
  - Maintain existing theme switching mechanics
  
- [x] **Component Styling**:
  - Cards use Double-Bezel architecture with gray tones
  - Buttons use pill-shaped design with soft gray backgrounds
  - Borders use low-opacity white/gray instead of solid colors
  - Shadows use highly diffused, soft shadows
  
- [x] **Typography**:
  - Use Plus Jakarta Sans or similar premium Grotesk font
  - Ensure text remains readable with low contrast
  - Maintain proper line heights and letter spacing
  
- [x] **Accessibility**:
  - Meet WCAG AA contrast requirements (4.5:1 for normal text)
  - Ensure keyboard navigation works
  - Maintain focus states with subtle gray highlights

## Non-Goals
- Creating high-contrast themes
- Implementing automatic theme switching based on time of day
- Designing themes with vibrant or saturated colors
- Changing the existing theme switching mechanics

## Technical Notes
- **Storage/Backend**:
  - Add 'gray' as a new theme option in the theme selection
  - Store gray theme preference in storage configuration
  - Implement backend support for gray theme
  
- **Frontend**:
  - Add .theme-gray CSS class similar to .theme-day and .theme-dark
  - Update all components to support gray theme variables
  - Ensure shell/terminal components use gray theme colors
  - Test theme switching between dark, day, and gray themes
  
- **CSS Architecture**:
  - Use HSL color values for easier lightness manipulation
  - Create color scales (50-900) for gray palette
  - Implement proper color transitions with cubic-bezier curves

## Acceptance Criteria
- [x] The gray theme is visually between black and white
- [x] All shell/terminal backgrounds use gray theme colors (not pure black)
- [x] Text remains readable with low contrast (4.5:1 or less)
- [x] The theme reduces eye strain compared to pure black or white backgrounds
- [x] Theme switching works between dark, day, and gray themes
- [x] All components support the gray theme
- [x] The theme follows high-end-visual-design principles
- [x] The theme is accessible and meets WCAG requirements
- [x] Performance is maintained with theme switching

## Implementation Phases
1. **Phase 1: Color System** - Design gray color palette and CSS variables ✓
2. **Phase 2: Shell Integration** - Update terminal/shell backgrounds ✓
3. **Phase 3: Component Updates** - Update all UI components ✓
4. **Phase 4: Theme Switching** - Implement gray theme option ✓
5. **Phase 5: Testing & Refinement** - Test accessibility and refine ✓