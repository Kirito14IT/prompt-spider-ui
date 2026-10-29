<p align="center"><picture><source media="(prefers-reduced-motion: reduce)" srcset="docs/brand/logo.svg"><img src="docs/brand/logo-animated.gif" width="560" alt="Prompt Spider UI"></picture></p>

# Prompt Spider UI~

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/%E8%AF%AD%E8%A8%80-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-f34a87?style=flat-square" alt="简体中文"></a>
  <a href="README.en.md"><img src="https://img.shields.io/badge/Language-English-3b82f6?style=flat-square" alt="English"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/version-v1.2.3-8b5cf6?style=flat-square" alt="Version 1.2.3"></a>
  <a href="#快速开始"><img src="https://img.shields.io/badge/Node.js-20%2B-339933?style=flat-square&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js 20+"></a>
  <a href="app/main.js"><img src="https://img.shields.io/badge/JavaScript-ES_modules-f7df1e?style=flat-square&amp;logo=javascript&amp;logoColor=white" alt="JavaScript ES modules"></a>
  <a href="app/renderer.js"><img src="https://img.shields.io/badge/Canvas-2D-06b6d4?style=flat-square" alt="Canvas 2D"></a>
  <a href="#连接自己的-agentmcp"><img src="https://img.shields.io/badge/MCP-local_stdio-42d6a4?style=flat-square" alt="MCP local stdio"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-f0ca57?style=flat-square" alt="License MIT"></a>
  <br>
  <a href="https://github.com/Kirito14IT/prompt-spider-ui/stargazers"><img src="https://img.shields.io/github/stars/Kirito14IT/prompt-spider-ui?style=social&amp;logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI%2BPHBhdGggZmlsbD0iIzlhNjcwMCIgZD0ibTEyIDIgMy4xIDYuMyA2LjkgMS01IDQuOSAxLjIgNi44LTYuMi0zLjItNi4yIDMuMkw3IDE0LjIgMiA5LjNsNi45LTF6Ii8%2BPC9zdmc%2B" alt="GitHub Stars"></a>
</p>

一个用 **原生 JavaScript + Canvas 2D** 实现的动态提示词可视化界面：机械蜘蛛沿文字游走、伸出触手抓取词语，词条沿弧线飞入蛛网，再分流到 `code`、`model` 和 `you` 三条分支。

黑底、粉色扫描、高密度蛛丝、跳动核心，配合可拖动的时间轴和侧边控制抽屉。**普通演示无需安装依赖、无需 API Key**；连接自己的 Agent 后，也能用同一套效果实时展示任务，定制主题并导出个人项目。

<p align="center"><img src="docs/preview.gif" width="540" alt="Prompt Spider UI 完整动画：机械蜘蛛抓词、蛛网分流与动态统计"></p>

## 快速开始

准备 **Node.js 20 或更高版本**和 Git，然后执行：

```bash
git clone https://github.com/Kirito14IT/prompt-spider-ui.git
cd prompt-spider-ui
npm start
```

浏览器打开 http://127.0.0.1:4317
终端出现本地地址后即可访问，按 `Ctrl+C` 停止服务。Windows 用户也可以双击 `start.cmd`。

普通 UI 没有第三方运行依赖，跳过 `npm install` 即可。MCP 接入需要单独安装子包依赖，见下文。推荐使用较新的 Chrome、Edge 或 Firefox；手机尺寸也有适配。服务默认只监听本机 `127.0.0.1`。

## 1.2 新增：探索网络

- **星轨网络**：点击画布上方的「星轨网络」，在三个分支轨道中查看节点。横向拖动或使用旋转滑块；暂停和时间轴仍控制动画，系统减少动态效果时停止自动旋转。
- **词条搜索**：搜索当前时间点已出现的词条或事件，点结果打开详情；星轨视图会淡化非匹配节点。Agent 模式搜索当前页（最多 32 个事件）。
- **PNG 快照**：直接保存当前画布像素尺寸的图片，不含控制栏和浏览器边框。

没有新增运行依赖，普通演示、Agent 会话、JSON 回放及独立导出项目均可使用。经典蛛网仍为默认视图；星轨仅按分支排列节点，距离不代表语义相似度或因果关系。

<p align="center"><picture><source media="(prefers-reduced-motion: reduce)" srcset="docs/orbit-preview.png"><img src="docs/orbit-preview.gif" width="540" alt="星轨网络动画：机械蜘蛛抓词、节点旋转与动态统计"></picture></p>

详见[更新记录](CHANGELOG.md)与[视觉参考](docs/visual-references.md)。

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

以上两种本地模式是 **UI 与动画演示**：分数未经概率校准，`model` 和 `you` 是可视化分支，不会调用模型或执行批准。`code` 分支也不会执行生成的代码。这些演示的 JSON 导出保留 `modelCalls: 0` 和 `executedActions: 0` 等字段。画面中的模型名称是视觉标签。

## 连接自己的 Agent：MCP

MCP 让支持本地 stdio 的 Agent 调用这个 UI：**创建会话 → 打开预览 → 上报任务步骤 → 调整外观 → 保存回放或导出项目**。例如展示代码检查、资料整理或需要人工确认的工作流。Agent 自己负责实际任务，UI 展示它主动上报的信息，不会自动读取聊天、捕获隐藏推理或执行三条分支里的操作。

Agent 会话使用单独的实时界面和记录，不套用原参考演示的固定计数。当前上报接口支持步骤、分支、状态和可选分数，**没有模型调用次数上报字段**，因此调用次数显示为未提供。

### 1. 安装 MCP 依赖

在项目根目录执行一次：

```bash
npm --prefix mcp ci
```

MCP 使用官方 SDK 和 Zod，锁文件固定依赖版本。它本身不需要 API Key；你的 Agent 使用何种模型及凭据，由 Agent 自己配置。

### 2. 添加到你的 Agent

支持 `mcpServers` 配置的客户端可使用下面的 JSON。把示例路径换成你克隆项目的**绝对路径**：

```json
{
  "mcpServers": {
    "prompt-spider": {
      "command": "node",
      "args": ["C:/projects/prompt-spider-ui/mcp/server.mjs"]
    }
  }
}
```

macOS / Linux 可改成 `/home/yourname/projects/prompt-spider-ui/mcp/server.mjs`。如果客户端找不到 `node`，将 `command` 改成 Node.js 可执行文件的绝对路径。不同客户端的配置文件位置不同，选择 **stdio / 本地进程**，不要把浏览器预览地址当作 MCP 服务地址。

**Codex CLI** 可直接注册：

```bash
codex mcp add prompt-spider -- node "C:/projects/prompt-spider-ui/mcp/server.mjs"
codex mcp list
```

或在 `~/.codex/config.toml` 中添加：

```toml
[mcp_servers.prompt_spider]
command = "node"
args = ["C:/projects/prompt-spider-ui/mcp/server.mjs"]
```

两种方式选一种，保存后重新连接客户端。配置依据 [Codex 官方 MCP 文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)。启动命令直接调用 `node`，避免 `npm run` 的额外输出进入 stdio 协议。

### 3. 让 Agent 展示一次任务

配置成功后，把这段话发给自己的 Agent：

> 使用 Prompt Spider MCP 为这次任务创建会话，返回预览链接。按实际进度上报任务步骤，使用稳定 ID 更新状态，不编造分数。把规则处理归入 code，模型处理归入 model，需要人工确认的步骤归入 you。完成后保存 JSON 回放，并导出一份包含回放的独立 UI 项目。

也可以直接调用工具。下面是**合成示例**，只用于说明参数；把 `SESSION_ID` 换成创建结果的 `id`，打开返回的 `previewUrl`：

```text
spider_create_session({"config":{"title":"我的 Agent 工作流","layout":"landscape","unit":"task"}})
spider_update_events({"sessionId":"SESSION_ID","events":[{"id":"check-1","label":"检查输入格式","route":"code","status":"completed"},{"id":"draft-1","label":"生成草稿","route":"model","status":"running"}]})
spider_update_events({"sessionId":"SESSION_ID","events":[{"id":"draft-1","status":"completed"},{"id":"review-1","label":"等待人工确认","route":"you","status":"pending"}]})
spider_complete_session({"sessionId":"SESSION_ID","status":"completed"})
spider_export_session({"sessionId":"SESSION_ID","filename":"my-session.json"})
spider_export_project({"sessionId":"SESSION_ID","name":"my-spider-ui","includeReplay":true,"includeMcp":true})
```

`completed` 表示结束本次展示，不等于人工已批准。需要等待批准的真实任务应在批准完成后再标记完成。工具返回的 `path` 是实际导出位置。

### 实时展示与定制

| 布局 | 画布尺寸 | 适合 |
| --- | --- | --- |
| `portrait`（默认） | 1080 × 1350 | 原版竖屏、展示录制 |
| `landscape` | 1600 × 900 | 桌面演示、工作流面板 |
| `square` | 1080 × 1080 | 方形展示、紧凑预览 |

在浏览器「布局与外观」中编辑，或使用 `spider_configure_session` 修改标题、模型标签、布局、三分支名称和配色，无需编辑绘制代码。提示词与数据单位在收到事件后锁定，需要更换时新建会话。内部分类仍为 `code / model / you`：

```json
{
  "sessionId": "SESSION_ID",
  "config": {
    "title": "我的资料助手",
    "modelName": "My Agent",
    "layout": "square",
    "routes": {"you": {"label": "人工复核", "color": "#F0CA57"}},
    "theme": {"accent": "#F34A87", "spider": "#42D6A4"}
  }
}
```

实时模式默认跟随新事件；暂停或拖动时间轴只改变观看位置，后台仍接收数据。点击「返回实时」，或向 `spider_control_playback` 传入 `command: {"action":"follow_live"}` 追上进度。完成后可以循环回放；关闭会话才释放记录。缺失分数和预计总量保持“未提供”，不会补成虚构指标。同一事件 ID 更新状态，不重复累计；长会话按页查看。

外观变更随回放时间保存；回看更早时间会恢复当时样式，回到最新时间可查看新设置。

**会话默认只保存在内存中，请在退出 Agent / MCP 之前主动导出。** 每个进程最多 20 个会话，单会话最多 10,000 个事件、16 MiB 更新日志；超过限制会报错并保留已有记录。

导出的独立项目包含可编辑源码、主题配置、许可证及双语说明；进入返回的项目目录执行 `npm start` 即可运行。选择包含 MCP 后，再执行 `npm --prefix mcp ci` 就能接自己的 Agent。导出只创建新文件或目录，不覆盖已有项目；默认位置为 `exports/`，也可在 MCP 启动参数中设置 `--export-root`。源视频、原仓库 `.git`、已安装依赖、预览令牌和其他会话不包含在导出中。

随附回放会遵循 `replay.json` 中记录的历史外观。`project-config.json` 作为无回放界面及后续 MCP 新会话的默认配置；要让个人主题始终作为默认外观，可不附带回放导出、移除配置中的 `replayFile`，或创建新的 MCP 会话。只想调整当前回放，可用浏览器外观编辑；变更记在回放末尾，回看早期仍恢复原样式。

完整的 **11 个工具、配置字段、逐词模式、回放导入、导出目录及故障排查**见 [MCP 接入指南](docs/mcp.md)。MCP 同时提供 `spider://guide`、`spider://config`、`spider://replay-format` 三个 resources，以及 `spider_report_task` prompt，供 Agent 自行读取接入约定。

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
│   ├── mcp.md              # MCP 接入、事件、定制与导出指南
│   └── brand/              # Logo、SVG、PNG 和 favicon
├── lib/                    # 主题配置、会话状态与确定性回放
├── mcp/                    # 独立 MCP 子包、官方 SDK 与本地预览服务
├── exports/                # 主动导出的项目 / 会话（已忽略）
├── tests/*.test.mjs        # Node.js 内置测试
├── server.mjs              # Node.js 本地静态服务
├── start.cmd                # Windows 启动入口
├── README.md               # 默认中文文档
├── README.en.md            # 英文文档
├── package.json
└── LICENSE
```

仓库包含 UI 代码、测试、说明、品牌资产和 GIF 预览。源 MP4、原片抽帧、研究记录和视频导出工具均未包含；

## 修改与复用

修改文件后刷新浏览器即可，无需打包：

- 换默认文字：编辑 `app/prompt.txt`。若希望文字与分流规则对应，使用「自己的提示词」模式；参考演示的统计锚点固定，不会随文本重新统计。
- 换配色：MCP 会话通过 `spider_configure_session` 统一配置页面与 Canvas 主题；参考演示仍可编辑 `app/style.css` 的 CSS 变量及绘制模块中的画布颜色。
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

MCP 的协议与导出测试需要先安装 MCP 依赖：

```bash
npm --prefix mcp ci
npm --prefix mcp test
```

## 来源与许可证

本项目依据参考画面独立重建视觉和交互，使用原生 Canvas 2D 实现。预设轨迹和部分统计依据画面观察，逐词配对、分数和传播关系使用确定性重建。显示的 195 个总词与默认文本的实际分词数量可能不同，属于参考演示的固定口径。

相关逆向调查工具：[REA](https://github.com/morluto/rea)。

本仓库代码以 [MIT License](LICENSE) 开源，可以学习、修改与复用，请保留许可证声明。许可证适用于本仓库发布的代码，不授予原参考作品的权利。
