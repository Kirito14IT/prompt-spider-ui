# Prompt Spider UI 品牌资产 / Brand assets

标志由八条青绿色机械蛛腿与粉色代码括号核心组成。与 UI 的扫描、抓取和分流主题对应，保持轮廓简洁，适合 README、浏览器标签和项目头像。

The symbol combines eight mint mechanical legs with a pink code-bracket core. It follows the UI's scanning, grabbing, and routing theme, with a compact silhouette for documentation, browser tabs, and project avatars.

| 文件 / File | 规格与用途 / Specification and use |
| --- | --- |
| `logo-animated.svg` | 720 × 160，12 秒字标往返爬行 / twelve-second wordmark walk |
| `logo-animated.gif` | 720 × 160，240 帧，约 1.42 MiB；README 循环动画 / looping README animation |
| `../../app/brand-mark.svg` | 160 × 160，网页动态标志 / animated web symbol |
| `logo.svg` | 720 × 160 viewBox，深色横版 / dark wordmark |
| `logo-light.svg` | 720 × 160 viewBox，浅色横版 / light wordmark |
| `icon.svg` | 128 × 128 viewBox，透明底 / transparent symbol |
| `logo.png` | 1440 × 320，深色横版 / dark wordmark |
| `icon-512.png` | 512 × 512，透明 PNG / transparent PNG |
| `icon-256.png` | 256 × 256，透明 PNG / transparent PNG |
| `favicon.ico` | 64 × 64，ICO |
| `../../app/favicon.svg` | 与 icon.svg 相同的页面图标 / same symbol used by the app |

配色 / Palette：粉色 `#F34A87`、青绿色 `#44D79C`、深色 `#090A0A`、浅色 `#E5E6E7`。

SVG 仅包含原生形状和路径，不嵌入位图、不加载外部字体或脚本。横版字标的字母也以路径绘制，可直接修改颜色、位置与笔画。缩放时保留原比例；需要小尺寸图标时使用独立 icon，避免把整个字标缩进 favicon。

The SVGs use native shapes and paths, with no embedded bitmap, external font, or script. The wordmark lettering is also outlined as paths. Preserve the aspect ratio when scaling, and use the standalone symbol for small icons.

设计流程：使用内置 imagegen 生成机械蜘蛛概念，再按该构图重绘正式矢量资产；PNG 和 ICO 从正式矢量导出。实际生成提示词保存在 [generation-prompt.txt](generation-prompt.txt)。概念图、导出工具和工作记录不属于运行依赖。

Design process: a concept was generated with the built-in imagegen tool, then redrawn as editable vector artwork. PNG and ICO assets were exported from those vectors. The exact concept prompt is in [generation-prompt.txt](generation-prompt.txt). Concept drafts, export tooling, and work logs are not runtime dependencies.

品牌资产采用项目的 [MIT License](../../LICENSE)。复用和修改时保留许可证声明。

Brand assets use the project's [MIT License](../../LICENSE). Retain the license notice when reusing or modifying them.

## 动画使用 / Motion

横版 logo 中只有一只蜘蛛，放大至画框高度约 75%，在字标中部左右往返；两端原地转身，12 秒无缝循环。轨道光点、浮动粒子和心跳光圈都挂在同一个移动坐标系中，随蜘蛛一起移动。八腿以 0.6 秒周期交错迈步，粉色核心保持双拍心跳，文字保持稳定。网页导航的小图标继续使用 6 秒方向巡游；暂停按钮支持点击、空格和回车，独立于画布播放。网页在标志离屏、页面隐藏或系统开启减少动态效果时停止动画；资产加载失败时保留静态图标。

One enlarged spider, roughly 75% of the frame height, patrols the center of the wordmark in a seamless twelve-second loop, turning in place at both ends. Its orbital lights, floating particles and heartbeat aura move together with the spider. Its legs alternate every 0.6 seconds and the pink core keeps its double heartbeat. Lettering stays stationary. The small navigation icon retains its six-second patrol and independent pause control. The web mark pauses offscreen, on hidden pages, and under reduced motion, with a static icon fallback if loading fails.

README 使用 GIF 保证常见图片环境中的循环显示；picture 为减少动态效果提供原静态 SVG。原始 logo.svg、logo-light.svg、PNG 和 favicon 保持可用。动态 SVG 无脚本或外部依赖；GIF 从同一 SVG 的确定时间点采帧生成。

The README GIF is rendered from the same animated SVG; its picture element selects the static SVG for reduced motion where media sources are supported. Existing static assets remain available. Animation adds no runtime dependency.
