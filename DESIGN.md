---
name: Live Operations Desk
description: A compact aviation-dispatch-inspired workspace for multi-room live operations.
colors:
  signal-cobalt: "#2457d6"
  signal-cobalt-hover: "#1949bd"
  dispatch-ink: "#162033"
  live-red: "#c9353f"
  success-green: "#187451"
  cool-paper: "#ffffff"
  cool-field: "#f4f7fb"
  divider: "#d8e0eb"
  media-stage: "#111722"
typography:
  headline:
    fontFamily: "Segoe UI Variable Text, Microsoft YaHei UI, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0"
  body:
    fontFamily: "Segoe UI Variable Text, Microsoft YaHei UI, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0"
  label:
    fontFamily: "Bahnschrift, Segoe UI, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0"
rounded:
  status: "2px"
  control: "4px"
  overlay: "6px"
spacing:
  compact: "4px"
  control: "8px"
  group: "12px"
  section: "16px"
components:
  button-primary:
    backgroundColor: "{colors.signal-cobalt}"
    textColor: "{colors.cool-paper}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "34px"
  button-secondary:
    backgroundColor: "{colors.cool-paper}"
    textColor: "{colors.dispatch-ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "34px"
  input:
    backgroundColor: "{colors.cool-paper}"
    textColor: "{colors.dispatch-ink}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "34px"
  stream-card:
    backgroundColor: "{colors.media-stage}"
    textColor: "{colors.cool-paper}"
    rounded: "{rounded.control}"
---

# Design System: Live Operations Desk

## Overview

**Creative North Star: "The Aviation Dispatch Board"**

The system behaves like an operations desk under bright working light: cool enamel surfaces carry dense information, while a dark media stage isolates the content that needs sustained attention. The interface is calm, compact, and explicitly status-driven rather than decorative.

Its visual anti-reference is the dark neon card wall used by many live-stream dashboards. Structure comes from continuous panels, measured dividers, small status tags, and persistent context instead of floating cards or ornamental effects.

**Key Characteristics:**
- Cool white working surfaces held by an ink-blue frame.
- Cobalt is reserved for selection and direct action; red is reserved for live and failure states.
- Square 4px geometry, tabular figures, and compact operational labels.
- Video remains the dominant material, with controls arranged like a dispatch rundown.

## Colors

The palette combines cool paper neutrals with one focused blue control color and semantic live, success, and warning signals.

### Primary
- **Signal Cobalt:** Used for primary controls, selected geometry, and keyboard focus.

### Secondary
- **Live Red:** Used only for live state, destructive action, and failure recovery.
- **Service Green:** Used for healthy local-service state.

### Neutral
- **Dispatch Ink:** Frames the application and carries primary text.
- **Cool Paper:** Holds active controls, panels, and data surfaces.
- **Cool Field:** Separates the working canvas from white chrome.
- **Divider:** Defines dense panel and row boundaries.
- **Media Stage:** Provides a stable dark field behind live video.

### Named Rules

**The Signal Economy Rule.** Cobalt selects or acts, red reports live or danger, and neither becomes ambient decoration.

## Typography

**Display Font:** Segoe UI Variable Text with Microsoft YaHei UI and Segoe UI fallback.
**Body Font:** Segoe UI Variable Text with Microsoft YaHei UI and Segoe UI fallback.
**Label/Mono Font:** Bahnschrift with Segoe UI fallback.

**Character:** The interface uses a neutral UI sans for fast Chinese scanning and a narrower numeric face for IDs, durations, and metrics. There is no promotional display voice.

### Hierarchy
- **Headline** (700, 15px, 1.25): Panel and dialog headings.
- **Title** (650-700, 13-14px): Room names and local toolbar titles.
- **Body** (400, 14px, 1.45): Controls, messages, and supporting copy.
- **Label** (600-700, 9-11px, 0 letter spacing): Room IDs, status codes, and tabular measurements.

### Named Rules

**The Operational Numeral Rule.** IDs, timers, and data columns use tabular figures so polling updates never shift nearby controls.

## Layout

Desktop uses a fixed 52px status header over a 280px room queue, a fluid video contact sheet, and a 300px inspector. At 1180px the inspector becomes a right drawer; at 900px the queue also becomes a drawer and primary navigation moves into a reserved bottom band. At 680px the video grid becomes one column. Spacing follows a 4/8/12/16px rhythm.

## Elevation & Depth

The system is flat by default. Dividers and tonal changes establish structure; soft ambient shadows appear only on stream hover, active selection, drawers, dialogs, and toasts.

### Shadow Vocabulary
- **Ambient Panel** (`0 10px 28px rgb(28 45 72 / 0.12)`): Drawers and overlays above the workspace.
- **Active Media** (`0 8px 18px rgb(24 42 67 / 0.13)`): Hovered or selected stream cards.

### Named Rules

**The Flat-at-Rest Rule.** Permanent panels stay flat; shadow communicates temporary elevation or active media state.

## Shapes

Controls and media frames use compact 4px corners. Status labels tighten to 2px, while dialogs and floating navigation may use 6px. Borders are one-pixel structural lines; pills and oversized rounded containers are outside this system.

## Components

### Buttons
- **Shape:** Compact rectangular controls with 4px corners and stable 34px height.
- **Primary:** Signal cobalt with white content, used for a single direct action such as adding a room.
- **Hover / Focus:** Darker cobalt on hover and a visible two-pixel focus outline with a translucent three-pixel ring.
- **Secondary / Ghost:** White or transparent surfaces with structural borders and ink text.

### Chips
- **Style:** Small rectangular status tags with text plus color; status is never color-only.
- **State:** Live uses red, loop uses amber, offline uses neutral gray.

### Cards / Containers
- **Corner Style:** Compact 4px corners.
- **Background:** Dark media stage with white control chrome.
- **Shadow Strategy:** Flat at rest, softly elevated on hover or selection.
- **Border:** One-pixel cool-gray outline.
- **Internal Padding:** 8px grid gap; 6-12px control chrome spacing.

### Inputs / Fields
- **Style:** White 34px fields with a cool-gray one-pixel stroke and 4px corners.
- **Focus:** Cobalt stroke plus the global focus ring.
- **Error / Disabled:** Red stroke and inline recovery copy; disabled controls reduce opacity and reject pointer input.

### Navigation

The desktop header uses icon-plus-text tabs with a two-pixel active underline. Narrow windows move the same two destinations into a labeled bottom bar while reserving layout space so content is never covered.

### Stream Contact Sheet

Each stream is a stable 16:10 frame with a 38px chrome strip for room identity, duration, quality, audio, and close. Operators can reorder frames by drag or with direction keys on the handle.

## Do's and Don'ts

### Do:
- **Do** keep service health, room state, and recovery actions visible within the first viewport.
- **Do** use tabular figures for room IDs, durations, and metrics.
- **Do** provide explicit empty, loading, stale, and failure states.
- **Do** preserve the 4/8/12/16px spacing rhythm and 4px control geometry.

### Don't:
- **Don't** turn the workspace into a wall of floating cards.
- **Don't** use gradients, decorative blur, neon glows, or oversized promotional type.
- **Don't** use red as a general accent or blue as ambient decoration.
- **Don't** hide critical actions behind hover or gesture-only interaction.
