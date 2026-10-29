# Changelog

## Documentation — 2026-10-29

- Added an independent, full-run orbital-network GIF to both READMEs, captured from the actual canvas renderer with word grabbing, node rotation and changing counters.
- Kept the logo animation and classic-web preview, with the previous orbital PNG available as the reduced-motion source.

## 1.2.3 — 2026-10-29

- Enlarged the horizontal logo spider to roughly three quarters of the frame height and centered its left/right patrol.
- Restored orbital lights, floating particles and the heartbeat aura as a field attached to the moving spider.

## 1.2.2 — 2026-10-29

- Replaced the horizontal logo patrol with one spider walking across the wordmark and back, with visible alternating steps and in-place turns.
- Re-rendered the README GIF as a seamless twelve-second loop; kept the wordmark stationary and the navigation icon unchanged.

## 1.2.1 — 2026-10-29

- Animated the existing mechanical spider logo with a six-second directional patrol, staggered legs, orbital nodes and a double heartbeat.
- Added a separate keyboard-accessible logo pause button; logo motion stops when hidden or when reduced motion is requested. Scene playback stays independent.
- Added self-contained animated SVG assets and a looping GIF for both READMEs, with a static reduced-motion source. Kept the static favicon and brand assets.

## 1.2.0 — 2026-10-23

- Added an optional orbital network for both the demo and Agent/replay sessions, with drag and keyboard-accessible slider rotation.
- Added current-frame/current-page node search and links to the existing inspector.
- Added native-resolution PNG canvas snapshots.
- Kept the classic view as the default, existing playback/filtering behavior, and zero-dependency UI startup.
- Added bounded/deterministic projection tests. Orbital placement groups reported routes; it does not infer semantic links.
