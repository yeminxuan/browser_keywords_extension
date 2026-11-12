# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-12

### Added

- Drag replay: record a hotkey, pick start and end points, and replay a smooth mouse drag with configurable duration, hold time and move steps; supports "start from current cursor".
- Point click: click a fixed coordinate on hotkey.
- Area click: draw a region and click every point in it on a grid (spacing and interval configurable).
- Magnifier: a cursor-following lens that magnifies the page content underneath in real time, built on a DOM mirror plus CSS transform (no screenshot permission); zoom configurable from 1.2 to 6 (default 2.4), toggled by hotkey or closed with ESC.
- Per-tab settings panel: draggable overlay with key recording, coordinate picking, enable/disable, re-pick and delete.
- High-compatibility mode that dispatches real input events via `chrome.debugger` for native drag-to-drop and stubborn click targets.
- Test page with draggable squares, a trash bin and batch-poppable bubbles.
- Bilingual README (Chinese and English).
