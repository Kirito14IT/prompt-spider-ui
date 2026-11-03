# Visual references / 视觉参考

Reviewed on 2026-10-23. These are design references, not bundled dependencies or copied implementations.

- [AI Safety HOT Hub](https://github.com/wuyoscar/AISafetyHot-Hub): rotating constellation, colored node categories, and selecting a node to inspect its source. Prompt Spider keeps its own dark canvas, spider, local demo and Agent data; no AI Safety HOT content/API is imported.
- [force-graph](https://github.com/vasturiano/force-graph): interactive Canvas graph exploration and node picking. This implementation uses an independently written analytic orbital projection rather than a force simulation.
- [particles.js](https://github.com/VincentGarreau/particles.js): lightweight Canvas particle presentation. No code/assets are reused.

星轨只对当前数据按 code / model / you 分支进行视觉排列。连接中心的细线表示分支归属，不表示推断出的知识关系；未上报的数据和分数不会生成。

## 1.3 references — 2026-11-04

- [Sigma.js](https://github.com/jacomyal/sigma.js): graph exploration and node focus inspired the hover interaction.
- [force-graph](https://github.com/vasturiano/force-graph): directional link particles and camera zoom/reset inspired the route flow controls.
- [WebGL Fluid Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation): surveyed for reactive motion; no fluid solver or code from it is included.

The nebula projection, depth cues, camera controls and Canvas effects are independently implemented in app/nebula.js and app/explorer.js. No third-party runtime package was added. Route spokes are not inferred knowledge edges; each node belongs to the route provided by the current demo or Agent event. The preview is an eight-second excerpt (reference time 7–15 seconds), not a real model execution recording.
