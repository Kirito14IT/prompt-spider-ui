<p align="center"><img src="docs/brand/logo.svg" width="560" alt="Prompt Spider UI"></p>

# Prompt Spider UI

**简体中文 | [English](README.en.md)**

一个用 **原生 JavaScript + Canvas 2D** 实现的动态提示词可视化界面：机械蜘蛛沿文字游走、伸出触手抓取词语，词条沿弧线飞入蛛网，再分流到 `code`、`model` 和 `you` 三条分支。

黑底、粉色扫描、高密度蛛丝、跳动核心，配合可拖动的时间轴和侧边控制抽屉。克隆后即可在本地运行，**无需安装依赖、无需 API Key**。

<p align="center"><img src="docs/preview.gif" width="540" alt="Prompt Spider UI 完整动画：机械蜘蛛抓词、蛛网分流与动态统计"></p>

预览为约 21 秒的循环 GIF，由本地 UI 动画导出，未加速。仓库不包含源 MP4。

## 快速开始

准备 **Node.js 20 或更高版本**和 Git，然后执行：

```bash
git clone https://github.com/Kirito14IT/prompt-spider-ui.git
cd prompt-spider-ui
npm start
```

浏览器打开 **http://127.0.0.1:4317**。终端出现本地地址后即可访问，按 `Ctrl+C` 停止服务。Windows 用户也可以双击 `启动.cmd`。

本项目没有第三方运行依赖，跳过 `npm install` 即可。推荐使用较新的 Chrome、Edge 或 Firefox；手机尺寸也有适配。服务默认只监听本机 `127.0.0.1`。

## 可以怎么玩

- **看完整动画**：逐词扫描、弧形抓取、接触驻留、收臂、词条飞行、蛛网分流和双拍心跳。
- **控制播放**：暂停、重播、0.5× / 1× / 2× / 4× 速度、循环播放，以及拖动时间轴跳到任意时刻。
- **查看词条**：点击画布中的词条或决策流，自动展开右侧控制栏，查看问题、示意分数和分支。
- **试自己的提示词**：展开右侧「控制」，选择「自己的提示词」，输入中文或英文，点击「扫描提示词」。
- **调整分流**：拖动阈值，观察本地规则如何改变分支；点击 `code`、`model`、`you` 筛选。
- **导出结果**：点击「导出本次分流 JSON」，保存当前时间点的演示状态。
- **专注画面**：放大画布或切换沉浸模式；控制抽屉覆盖在画布上，默认收起。

| 快捷键 | 功能 |
| --- | --- |
| `Space` | 播放 / 暂停 |
| `R` | 从头重播 |
| `F` | 切换沉浸模式 |
| `Esc` | 退出沉浸模式或收起控制栏 |
| `←` / `→` | 后退 / 前进 0.5 秒 |

输入框聚焦时不会触发播放快捷键。系统开启「减少动态效果」时，页面默认暂停，并减少部分动态效果。

## 两种演示模式

**参考演示**保留预设的布局、轨迹和统计时间线，时长约 20.92 秒。拖动时间轴能够重复得到同一时刻的状态。末段显示 175 次分流：`137 code / 27 model / 11 you`。

**自己的提示词**使用本地关键词和规则生成示意分数。达到阈值的词进入 `code`，低于阈值进入 `model`；命中发布、购买、删除等批准相关规则的词优先进入 `you`。拖动分流阈值会切换为该模式。

这是一个 **UI 与动画演示项目**：分数未经概率校准，`model` 和 `you` 是可视化分支，不会调用模型或执行批准。`code` 分支也不会执行生成的代码。JSON 导出保留 `modelCalls: 0` 和 `executedActions: 0` 等字段。画面中的模型名称是视觉标签。

## 项目结构

```text
prompt-spider-ui/
├── app/
│   ├── index.html          # 页面结构与控制面板
│   ├── style.css           # 深色主题、抽屉和移动端布局
│   ├── main.js             # 播放、输入、筛选、快捷键和导出
│   ├── renderer.js         # Canvas 画面与命中检测
│   ├── spider.js           # 蜘蛛身体、步态和心跳
│   ├── probes.js           # 抓词触手：伸出、驻留、收回
│   ├── motion.js           # 统计时间线、移动、曲线飞行和分流位置
│   ├── reference-track.js  # 预设蜘蛛移动与文本滚动轨迹
│   ├── model.js            # 分词、本地规则和确定性状态
│   ├── prompt.txt          # 默认演示文本
│   └── favicon.svg
├── docs/
│   ├── preview.gif         # 完整 UI 循环动画
│   └── brand/              # Logo、SVG、PNG 和 favicon
├── tests/*.test.mjs        # Node.js 内置测试
├── server.mjs              # Node.js 本地静态服务
├── 启动.cmd                # Windows 启动入口
├── README.md               # 默认中文文档
├── README.en.md            # 英文文档
├── package.json
└── LICENSE
```

仓库包含 UI 代码、测试、说明、品牌资产和 GIF 预览。源 MP4、原片抽帧、研究记录和视频导出工具均未包含；运行动画不需要视频文件。

## 修改与复用

修改文件后刷新浏览器即可，无需打包：

- 换默认文字：编辑 `app/prompt.txt`。若希望文字与分流规则对应，使用「自己的提示词」模式；参考演示的统计锚点固定，不会随文本重新统计。
- 换配色：编辑 `app/style.css` 的 CSS 变量及 `app/renderer.js` 等绘制模块中的画布颜色。Canvas 颜色不会自动继承 CSS 变量。
- 调整抓取动作：查看 `app/probes.js` 中的 `PROBE_TIMING`。
- 调整步态和心跳：编辑 `app/spider.js`。
- 修改分词或分流规则：编辑 `app/model.js`。

前端使用浏览器 ES modules，没有框架和构建步骤。请通过 HTTP 服务打开页面，直接双击 `app/index.html` 会因资源路径和模块加载限制而无法正常运行。

### 修改端口

Windows PowerShell：

```powershell
$env:PORT = '4318'
npm start
```

macOS / Linux：

```bash
PORT=4318 npm start
```

随后访问 http://127.0.0.1:4318 。若提示端口被占用，关闭已有服务或改用其他端口。

## Logo 与图标

标志把粉色代码核心与八条青绿色机械蛛腿组合起来，沿用界面配色。横版字标使用原生 SVG 路径，不依赖外部字体；独立图标及其 PNG 保留透明背景。

| 文件 | 用途 |
| --- | --- |
| [logo.svg](docs/brand/logo.svg) | 深色横版 Logo，README 顶部使用 |
| [logo-light.svg](docs/brand/logo-light.svg) | 浅色横版 Logo |
| [icon.svg](docs/brand/icon.svg) | 可编辑、可缩放的透明图标 |
| [logo.png](docs/brand/logo.png) | 1440 × 320 的 PNG 字标 |
| [icon-512.png](docs/brand/icon-512.png) | 512 × 512 的透明 PNG 图标 |
| [favicon.ico](docs/brand/favicon.ico) | ICO 图标，用于浏览器或桌面快捷方式 |
| [app/favicon.svg](app/favicon.svg) | 页面正在使用的浏览器标签图标 |

设计与复用说明见 [品牌资产说明](docs/brand/README.md)。这些项目品牌资产同样采用 [MIT License](LICENSE)，复用时保留许可证声明即可。

## 验证

```bash
npm test
```

使用 Node.js 内置测试运行器，不需额外测试库。测试覆盖预设统计时间线、阈值分流、中文与空白输入、任意跳转确定性、词条飞行、触手动作、步态和心跳。测试只验证演示逻辑与动画几何，不代表真实模型推理评测。

## 来源与许可证

本项目依据参考画面独立重建视觉和交互，使用原生 Canvas 2D 实现，不声称恢复了原作者源码。预设轨迹和部分统计依据画面观察，逐词配对、分数和传播关系使用确定性重建。显示的 195 个总词与默认文本的实际分词数量可能不同，属于参考演示的固定口径。

相关逆向调查工具：[REA](https://github.com/morluto/rea)。REA 不是本项目的运行依赖。

本仓库代码以 [MIT License](LICENSE) 开源，可以学习、修改与复用，请保留许可证声明。许可证适用于本仓库发布的代码，不授予原参考作品的权利。
