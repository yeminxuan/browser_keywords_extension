[简体中文](README.md) | English

# browser_keywords_extension

<p align="center">
  <img src="public/icons/icon128.png" width="96" height="96" alt="browser_keywords_extension icon">
</p>

A keyboard-driven Chrome extension that binds repetitive actions — dragging, clicking, magnifying, color picking, measuring — to a single key so you can replay them instantly. Configurations are stored per tab, and more shortcuts are planned.

## Features

### Drag & click replay
Record a key → pick the start point → pick the end point. Pressing that key replays the mouse drag with easing; drag duration, hold-after-press and move steps are configurable. You can also set "start = current cursor", so the drag goes from wherever the mouse is to a fixed end point.

### Point click
Record a key → pick a position. Pressing that key clicks that exact coordinate once.

### Area click
Record a key → drag out a region. Pressing that key clicks every point in the region on a grid (5px by default) — handy for popping balloons, clearing lists and other high-frequency clicking. Grid spacing and click interval are configurable.

### Magnifier
Record a key (e.g. Q) → press once to turn it on, press again (or press ESC) to turn it off. A 180×180 lens then follows the cursor and magnifies the page content underneath it in real time, centered on the cursor. The zoom level is configurable in the panel (1.2 – 6, default 2.4).

- Implemented as a DOM mirror plus a `transform` scale: each frame only updates translation/scale, so it tracks the cursor at 60fps with no screenshot permission required.
- The mirror is rebuilt automatically after DOM changes; CSS animations keep playing.
- Known limitation: pixels inside `<canvas>` and `<video>` are not replicated.

### Color picker
Record a key → press it to enter picking mode. The visible viewport is captured once, then a magnifier lens follows the cursor with a crosshair centered on the target pixel, showing HEX, RGB and a swatch in real time. It samples actual rendered pixels, so images, canvases and video frames all work.

- `+` / `-`: adjust zoom live (2 – 24, default 6). The adjusted value becomes the new default and can also be changed in the panel.
- Left click: copy the HEX value to the clipboard and close. Right click / ESC / pressing the hotkey again: cancel.
- The image is a frozen capture from the moment of activation; scrolling is locked while picking so coordinates stay aligned.

### Ruler & measurement
Record a key → press it to enter ruler mode (press again or ESC to exit). Drag to create a ruler with tick marks and a length label at its midpoint, in px or mm (mm uses the CSS conversion 96px = 25.4mm).

- Multiple rulers can coexist and scroll with the page content. Click one to select it (highlighted, with the angle shown); drag its endpoints to fine-tune or its body to move it.
- Secondary hotkeys (apply to the selected ruler, or the last one if none is selected):

| Key | Action |
|------|------|
| Shift while dragging | Snap to 45° increments (including horizontal / vertical 90°) |
| S | Toggle persistent angle snapping |
| R | Rotate +15° around the center (Shift+R rotates +90°) |
| D | Duplicate the ruler |
| Delete / Backspace | Delete the selected ruler |
| U | Toggle px / mm |
| C | Clear all rulers |
| ESC / hotkey again | Exit ruler mode |

### High-compatibility mode
By default, events are simulated inside the page, which works with most components. If dragging does nothing (native `draggable`) or clicks are ignored (file inputs, games), enable "High-compatibility mode" to dispatch real input events via `chrome.debugger`. Note: this mode requires the extension's debugger permission, and the target page cannot have DevTools open at the same time.

### Dark mode
The panel automatically follows the browser / system light or dark theme — no manual setting needed.

## Install

Download `browser_keywords_extension-vX.Y.Z.zip` of the version you need from the [Releases page](https://github.com/yeminxuan/browser_keywords_extension/releases) and unzip it. Then open `chrome://extensions/` → enable "Developer mode" → click "Load unpacked" → select the extracted folder. No npm, no build step — just unzip and load.

## Usage

1. Click the extension icon in the toolbar to open the panel and pick a tab (Drag / Area / Point / Magnifier / Color picker / Ruler).
2. Click "＋ New…" and follow the prompts to record a key, pick a coordinate or draw a region. The magnifier, color picker and ruler only need a key.
3. Press that key on any page to run it. From the panel you can rebind, re-pick coordinates, disable or delete it at any time.
4. Turning off "Enable all" pauses every shortcut. The panel can be dragged anywhere and remembers its position per tab.

## Test page

`test-page.html` in the project root is a functional test page: squares can be dragged into the trash bin, bubbles can be popped in bulk with area clicks, and the magnifier, color picker and ruler can be verified there too.

Open the file directly in Chrome (`file://`). Note that you first need to find this extension at `chrome://extensions`, open its "Details" page and enable "Allow access to file URLs" — otherwise content scripts are not injected into local file pages.
