# Prompt Spider UI 品牌资产 / Brand assets

标志由八条青绿色机械蛛腿与粉色代码括号核心组成。与 UI 的扫描、抓取和分流主题对应，保持轮廓简洁，适合 README、浏览器标签和项目头像。

The symbol combines eight mint mechanical legs with a pink code-bracket core. It follows the UI's scanning, grabbing, and routing theme, with a compact silhouette for documentation, browser tabs, and project avatars.

| 文件 / File | 规格与用途 / Specification and use |
| --- | --- |
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
