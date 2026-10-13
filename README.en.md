<p align="center"><img src="docs/brand/logo.svg" width="560" alt="Prompt Spider UI"></p>

# Prompt Spider UI

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/%E8%AF%AD%E8%A8%80-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-f34a87?style=flat-square" alt="简体中文"></a>
  <a href="README.en.md"><img src="https://img.shields.io/badge/Language-English-3b82f6?style=flat-square" alt="English"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/version-v1.0.0-8b5cf6?style=flat-square" alt="Version 1.0.0"></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/Node.js-20%2B-339933?style=flat-square&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js 20+"></a>
  <a href="app/main.js"><img src="https://img.shields.io/badge/JavaScript-ES_modules-f7df1e?style=flat-square&amp;logo=javascript&amp;logoColor=white" alt="JavaScript ES modules"></a>
  <a href="app/renderer.js"><img src="https://img.shields.io/badge/Canvas-2D-06b6d4?style=flat-square" alt="Canvas 2D"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-f0ca57?style=flat-square" alt="License MIT"></a>
</p>

An animated prompt visualization built with **vanilla JavaScript and Canvas 2D**. A mechanical spider crawls over the text, reaches out to grab words, and sends them along curved paths into a web before routing them to three branches: `code`, `model`, and `you`.

A black canvas, pink scan highlights, dense web threads, and a pulsing core sit alongside a draggable timeline and a collapsible control drawer. Clone the repository and run it locally: **no dependency installation or API key required**.

<p align="center"><img src="docs/preview.gif" width="540" alt="Full Prompt Spider UI animation: mechanical word grabbing, web routing, and live statistics"></p>

## Quick start

Install **Node.js 20 or later** and Git, then run:

```bash
git clone https://github.com/Kirito14IT/prompt-spider-ui.git
cd prompt-spider-ui
npm start
```

Open **http://127.0.0.1:4317** in your browser once the terminal prints the local address. Press `Ctrl+C` to stop the server. On Windows, you can also double-click `启动.cmd`.

There are no third-party runtime dependencies, so you can skip `npm install`. Use a recent version of Chrome, Edge, or Firefox. The layout also adapts to phone screens. By default, the server listens only on `127.0.0.1`.

## Explore the demo

- **Watch the animation:** word-by-word scanning, curved reaching motions, a brief hold on contact, arm retraction, word flights, web routing, and a two-beat heartbeat.
- **Control playback:** pause, restart, choose 0.5× / 1× / 2× / 4× speed, toggle looping, or drag the timeline to any point.
- **Inspect a word:** click a word on the canvas or an entry in the decision stream. The control drawer opens to show its question, illustrative score, and route.
- **Try your own prompt:** open **控制** (Controls), select **自己的提示词** (Your own prompt), enter Chinese or English text, then click **扫描提示词** (Scan prompt).
- **Change routing:** drag the threshold to see how the local rules change the branches; click `code`, `model`, or `you` to filter them.
- **Export the current state:** click **导出本次分流 JSON** (Export routing JSON) to save the demo state at the current playback time.
- **Focus on the canvas:** enlarge it or switch to immersive mode. The control drawer overlays the canvas and starts collapsed.

| Shortcut | Action |
| --- | --- |
| `Space` | Play / pause |
| `R` | Restart from the beginning |
| `F` | Toggle immersive mode |
| `Esc` | Exit immersive mode or close the control drawer |
| `←` / `→` | Seek backward / forward by 0.5 seconds |

Playback shortcuts are disabled while a text input has focus. When your system requests reduced motion, the demo starts paused and reduces some animation effects.

## Two demo modes

**Reference demo** uses a preset layout, trajectory, and statistics timeline lasting about 20.92 seconds. Seeking to the same time produces the same state. The final segment shows 175 routing decisions: `137 code / 27 model / 11 you`.

**Your own prompt** uses local keywords and rules to generate illustrative scores. Words at or above the threshold go to `code`; those below it go to `model`. Words matching approval-related rules, such as publishing, purchasing, or deleting, take priority and go to `you`. Adjusting the routing threshold switches to this mode.

This is a **UI and animation demo**. Scores are not calibrated probabilities. The `model` and `you` branches visualize routes without calling a model or granting approval, and the `code` branch does not execute generated code. JSON exports include fields such as `modelCalls: 0` and `executedActions: 0`. Model names shown in the interface are visual labels.

## Project structure

```text
prompt-spider-ui/
├── app/
│   ├── index.html          # Page structure and controls
│   ├── style.css           # Dark theme, drawer, and mobile layout
│   ├── main.js             # Playback, input, filters, shortcuts, and export
│   ├── renderer.js         # Canvas rendering and hit detection
│   ├── spider.js           # Spider body, gait, and heartbeat
│   ├── probes.js           # Grabbing arms: reach, hold, and retract
│   ├── motion.js           # Statistics, movement, curved flights, and route positions
│   ├── reference-track.js  # Preset spider movement and text scrolling
│   ├── model.js            # Tokenization, local rules, and deterministic state
│   ├── prompt.txt          # Default demo text
│   └── favicon.svg
├── docs/
│   ├── preview.gif         # Full UI animation preview
│   └── brand/              # Project wordmark and icon assets
├── tests/*.test.mjs        # Tests using the built-in Node.js runner
├── server.mjs             # Local Node.js static server
├── 启动.cmd               # Windows launcher
├── README.md              # Chinese documentation (default)
├── README.en.md           # English documentation
├── package.json
└── LICENSE
```

The repository contains the UI code, tests, documentation, brand assets, and an animated GIF preview. It does not include the source MP4, extracted video frames, research logs, or video export tools. Running the animation does not require a video file.

## Customize and reuse

Edit the files and refresh your browser; no build step is needed.

- **Default text:** edit `app/prompt.txt`. Use **Your own prompt** mode if you want the routing statistics to reflect the text. Reference mode uses fixed statistical anchors and does not recalculate them when the text changes.
- **Colors:** edit the CSS variables in `app/style.css` and the canvas colors in rendering modules such as `app/renderer.js`. Canvas colors do not automatically inherit CSS variables.
- **Grabbing motion:** see `PROBE_TIMING` in `app/probes.js`.
- **Gait and heartbeat:** edit `app/spider.js`.
- **Tokenization and routing rules:** edit `app/model.js`.

The frontend uses browser ES modules, with no framework or build step. Open it through the HTTP server. Double-clicking `app/index.html` will not work correctly because of resource paths and module-loading restrictions.

### Change the port

Windows PowerShell:

```powershell
$env:PORT = '4318'
npm start
```

macOS / Linux:

```bash
PORT=4318 npm start
```

Then open http://127.0.0.1:4318 . If the port is already in use, stop the existing server or choose another port.

## Brand assets

The mark combines a pink code-bracket core with eight mint mechanical legs, following the interface palette. The wordmark uses native SVG paths and needs no external fonts. The standalone icon and icon PNGs have transparent backgrounds.

| File | Use |
| --- | --- |
| [`docs/brand/logo.svg`](docs/brand/logo.svg) | Dark wordmark used at the top of this README |
| [`docs/brand/logo-light.svg`](docs/brand/logo-light.svg) | Light wordmark |
| [`docs/brand/icon.svg`](docs/brand/icon.svg) | Scalable standalone icon |
| [`docs/brand/logo.png`](docs/brand/logo.png) | 1440 × 320 PNG wordmark |
| [`docs/brand/icon-512.png`](docs/brand/icon-512.png) | 512-pixel icon |
| [`docs/brand/favicon.ico`](docs/brand/favicon.ico) | ICO for browsers and desktop shortcuts |
| [`app/favicon.svg`](app/favicon.svg) | Browser tab icon |

See the [brand asset notes](docs/brand/README.md) for the design and reuse details. The included project wordmark and icon may be reused under the [MIT License](LICENSE). Keep the license notice when redistributing them.

## Verification

```bash
npm test
```

Tests use the built-in Node.js test runner and need no additional testing libraries. They cover the preset statistics timeline, threshold routing, Chinese and blank input, deterministic seeking, word flights, arm motion, gait, and heartbeat. These tests verify the demo logic and animation geometry; they are not evaluations of real model inference.

## Sources and license

This project independently recreates the visuals and interactions from a visual reference using Canvas 2D. It does not claim to recover the original author's source code. Preset trajectories and some statistics were based on visual observations; word pairings, scores, and propagation relationships were reconstructed deterministically. The displayed total of 195 words is fixed in the reference demo and may differ from the actual token count of the default text.

Related reverse-engineering investigation tool: [REA](https://github.com/morluto/rea). REA is not a runtime dependency.

The code in this repository is released under the [MIT License](LICENSE). You may study, modify, and reuse it while retaining the license notice. The license covers the code published here and does not grant rights to the original reference work.
