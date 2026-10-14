# MCP 接入指南

[返回中文 README](../README.md) · [English setup and API reference](../README.en.md#connect-your-agent-with-mcp)

MCP 接口把 Prompt Spider UI 变成 Agent 可以调用的本地展示工具。Agent 创建会话后得到预览地址，按实际进度上报任务，浏览器展示机械蜘蛛、弧形飞行和三路分流。你也可以换主题、切布局，最后导出回放或可继续修改的独立项目。

## 1. 安装与连接

准备 Node.js 20+ 和一个支持**本地 stdio MCP** 的 Agent 客户端。在克隆好的项目根目录执行：

```bash
npm --prefix mcp ci
```

普通演示仍然只需 `npm start`，不需要安装依赖。MCP 子包使用官方 `@modelcontextprotocol/server` SDK 与 Zod；依赖版本由 `mcp/package-lock.json` 固定。MCP 本身不调用模型、不需要 API Key，你的 Agent 仍使用它自己的模型配置。

### 通用客户端配置

将下面内容添加到客户端的 MCP 配置中。路径必须替换成你本机项目的**绝对路径**，Windows 可使用正斜杠，避免 JSON 反斜杠转义问题：

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

macOS / Linux 的 `args` 例如 `["/home/yourname/projects/prompt-spider-ui/mcp/server.mjs"]`。若客户端找不到 Node.js，将 `command` 换成 `node` 可执行文件的绝对路径。配置文件位置由客户端决定；选择 **stdio / 本地进程**，保存后重新连接。

直接启动 `node`，不要把 `npm start` 或 `npm run` 填进 MCP 配置。stdio 的标准输出用于协议消息，日志写入标准错误；在终端直接执行 `node mcp/server.mjs` 后没有欢迎文字是正常的，它在等待客户端。

### Codex 配置

任选一种方式，避免重复注册。

CLI：

```bash
codex mcp add prompt-spider -- node "C:/projects/prompt-spider-ui/mcp/server.mjs"
codex mcp list
```

或在用户级 `~/.codex/config.toml` 中添加（Windows 位于你的用户目录下 `.codex/config.toml`）：

```toml
[mcp_servers.prompt_spider]
command = "node"
args = ["C:/projects/prompt-spider-ui/mcp/server.mjs"]
```

格式见 [Codex 官方 MCP 文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)。这里使用 stdio，不需要 OAuth，也不把浏览器预览地址配置成 MCP URL。

### 自定义导出目录

默认导出根目录为项目下的 `exports/`，已加入 `.gitignore`。想换位置，可在 MCP 配置中添加启动参数：

```json
{
  "command": "node",
  "args": [
    "C:/projects/prompt-spider-ui/mcp/server.mjs",
    "--export-root",
    "C:/projects/spider-exports"
  ]
}
```

`--export-root` 使用绝对路径；macOS / Linux 可换成 `/home/yourname/spider-exports`。所有工具写文件和按文件名导入的操作都限制在这个根目录下。

## 2. 从创建到导出的完整流程

配置成功后，可以直接对自己的 Agent 说：

> 使用 Prompt Spider MCP 为当前任务创建会话，给我预览链接。按真实进度上报任务步骤，以稳定 ID 更新状态。规则处理归入 code，模型处理归入 model，需要人工确认归入 you。不编造分数或执行结果。任务结束后保存 JSON，并导出包含回放的独立项目。

客户端也可以读取 `spider_report_task` prompt，传入 `{"task":"你要展示的任务"}` 获取接入提示。下面的参数全部是**合成示例**，不会执行检查、模型调用或人工批准。

### 创建会话

调用 `spider_create_session`：

```json
{
  "config": {
    "title": "我的 Agent 工作流",
    "subtitle": "按实际进度上报的任务步骤",
    "modelName": "My Agent",
    "layout": "landscape",
    "unit": "task"
  }
}
```

保存返回的 `id`，打开返回的完整 `previewUrl`。后续示例中的 `SESSION_ID` 都要换成这个 ID。预览服务在第一次需要时才启动，自动选择本机空闲端口，不要求先运行 `npm start`。

### 上报新步骤

调用 `spider_update_events`：

```json
{
  "sessionId": "SESSION_ID",
  "events": [
    {"id": "check-1", "label": "检查输入格式", "route": "code", "status": "completed"},
    {"id": "draft-1", "label": "整理草稿", "route": "model", "status": "running"}
  ]
}
```

每次调用对应当前进度。把所有事件一次性发送，回放中它们就会同时到达；想体现任务过程，应在步骤开始或状态变化时调用。

### 更新同一个步骤

继续调用 `spider_update_events`：

```json
{
  "sessionId": "SESSION_ID",
  "events": [
    {"id": "draft-1", "status": "completed", "detail": "已整理出可供复核的草稿。"},
    {"id": "review-1", "label": "等待人工确认", "route": "you", "status": "pending"}
  ]
}
```

同一 `id` 更新已有事件，不会重复累计。重复发送相同状态也不会产生新的有效状态变化。不要给同一个步骤在每次更新时生成新 ID。

### 完成展示并保存

真实任务结束后调用 `spider_complete_session`：

```json
{"sessionId": "SESSION_ID", "status": "completed"}
```

也可使用 `failed` 或 `cancelled` 表示任务失败或取消。完成保留历史并固定回放时长，随后可以循环播放、保存和导出。`completed` 不会批准 `you` 分支的操作，也不要求所有事件都处于 completed；等待人工确认的真实步骤应在用户实际确认后再更新。

调用 `spider_export_session` 保存 JSON：

```json
{"sessionId": "SESSION_ID", "filename": "my-session.json"}
```

返回实际文件路径、相对文件名及事件数量。JSON 文件内包含完整的可移植 `record`，不会把长会话全文塞回 Agent 上下文。也可以在浏览器导出 JSON；浏览器下载不会写入 MCP 的导出根目录。

调用 `spider_export_project` 导出个人项目：

```json
{
  "sessionId": "SESSION_ID",
  "name": "my-spider-ui",
  "includeMcp": true,
  "includeReplay": true
}
```

工具返回项目目录。`name` 使用字母、数字、点、下划线或连字符组成的新目录名称，不能使用路径；已有同名目录会报错，需要换名，不会覆盖。JSON `filename` 同样只接受不带目录的简单文件名，并以 `.json` 结尾。

## 3. 事件与配置

### 事件约定

| 字段 | 含义 |
| --- | --- |
| `id` | 稳定的步骤 ID，必填 |
| `label` | 画面显示的步骤名称；新事件必填 |
| `route` | `code`、`model` 或 `you`；新事件必填 |
| `status` | `pending`、`running`、`completed`、`failed`；新事件默认 `running` |
| `score` | 可选的 0–1 上报分数或 `null`；未提供时保持未知，不自动评分 |
| `detail` | 可选的说明，供用户查看 |
| `tokenIndex` | 逐词模式需要的零起始提示词索引 |
| `occurredAt` | 可选的来源时间文本，仅作为元数据；回放按服务器接收时间排序 |

后续更新只需 `id` 和变化字段；每次调用可提交 1–100 个事件，不能用任意额外键夹带未定义数据。服务器维护事件顺序、首次到达时间和更新时间，回放使用服务器的单调相对时间。

`code / model / you` 是展示分类，可理解为规则处理、模型处理和人工确认。它们不会触发代码执行、模型调用或批准。Agent 负责上报真实发生的步骤；不要把动画分流当作权限系统，也不要将模型的隐藏推理转成事件。

### 逐词模式

默认 `unit: "task"`，每个事件是一个任务步骤。想让蜘蛛对应提示词里的具体词，创建会话时设置：

```json
{"config": {"unit": "word", "prompt": "read source write report"}}
```

然后上报：

```json
{
  "sessionId": "SESSION_ID",
  "events": [{"id": "word-1", "label": "read", "route": "code", "tokenIndex": 0}]
}
```

分词按空白分组，上例 `read / source / write / report` 的索引分别为 `0 / 1 / 2 / 3`。中文如果需要逐词定位，请在词间添加空格。`tokenIndex` 必须对应现有词。收到事件后，提示词和 `unit` 锁定；需要更换时创建新会话，避免历史事件指向别的词。

### 布局与主题

| 配置 | 说明 |
| --- | --- |
| `title`、`subtitle` | 标题和副标题 |
| `modelName` | 模型 / Agent 视觉标签，不是调用配置 |
| `layout` | `portrait` 1080 × 1350、`landscape` 1600 × 900、`square` 1080 × 1080 |
| `unit` | `task`（默认）或 `word` |
| `prompt` | 显示的提示词或上下文 |
| `expectedTotal` | 可选预计事件总量；默认 `null`，表示未提供 |
| `routes` | 三分支的 `label` 和 `color`；内部 ID 保持不变 |
| `theme` | 页面、画布和蜘蛛的配色 |

主题颜色字段为 `background / panel / panelTop / border / text / muted / accent / spider`，颜色统一使用 `#RRGGBB`。配置采用部分合并，未提供的值保留；未知字段会报错。浏览器的「布局与外观」也可调整常用字段，点击应用后生效；完整配置可用 MCP 修改。

例如调用 `spider_configure_session`：

```json
{
  "sessionId": "SESSION_ID",
  "config": {
    "title": "我的资料助手",
    "layout": "square",
    "routes": {
      "code": {"label": "规则检查", "color": "#42D6A4"},
      "model": {"label": "内容整理", "color": "#F28A76"},
      "you": {"label": "人工复核", "color": "#F0CA57"}
    },
    "theme": {"accent": "#F34A87", "spider": "#42D6A4"}
  }
}
```

配置变化同样进入回放日志，所以早期时间点会显示当时的配置。暂停在早期位置时应用外观，会记录到会话最新时间；回到最新时间可查看新设置。缺失分数和预计总量保持未提供，不用动画生成的数值替代真实指标。当前事件 schema 没有模型调用次数上报字段，实时界面的调用次数显示为未提供。Agent 会话有自己的实时界面与记录，不套用原参考演示的固定统计口径。

## 4. 实时、回放和导入

默认实时跟随。暂停、拖动时间轴或 `seek` 只冻结观看位置，Agent 仍可以持续上报；点击“返回实时”或调用 `follow_live` 即可追上最新状态。实时动画轨迹连续，动画运动不会把数据时间归零。

`spider_control_playback` 参数示例：

```json
{"sessionId": "SESSION_ID", "command": {"action": "pause"}}
```

```json
{"sessionId": "SESSION_ID", "command": {"action": "seek", "position": 3}}
```

```json
{"sessionId": "SESSION_ID", "command": {"action": "follow_live"}}
```

支持 `play / pause / seek / restart / follow_live`。可选 `position` 单位为秒，另有 `speed`（0.5–4）、`loop`、`routeFilter` 和 `page`；`loop` 用于已完成会话。浏览器控制和 MCP 控制操作同一个会话，因此多个预览窗口会共享播放状态。

查询当前状态用 `spider_get_session`，默认返回 50 条事件，可用 `offset` 和 `limit` 分页，单页最多 200 条。`spider_list_sessions` 返回摘要，不返回整段历史。浏览器绘制可见页和近期活跃事件，长会话不需要每帧重画所有历史。

### 导入保存的 JSON

对于导出根目录中的文件，调用：

```json
{"filename": "my-session.json"}
```

工具为 `spider_import_session`。也可以传 `{"record": ...}`，值是此前导出 JSON 文件中的完整 record；`record` 和 `filename` 二选一。`filename` 只接受导出根目录中不含目录组件的简单 `.json` 文件名，不能传绝对路径或越界路径。其他目录的 JSON 可由客户端读入后通过 `record` 传入，或使用浏览器导入。

导入后使用返回的新会话信息和预览地址。导入会验证格式、事件与更新日志，并重新计算统计，不信任 JSON 中自称正确的累计值。即使导出时还在实时运行，导入后也会作为冻结回放，不再接收后续任务上报；继续新任务请创建新会话。

回放格式为 `prompt-spider-session/v1`，包含 `initialConfig`、当前 `config`、事件快照和有序 `log`。日志中的 `revision` 递增，`at` 是相对秒数；事件更新、配置修改和完成状态都记录在内。重新导入后相同时间点可重现相同状态。不要手工拼接不同会话日志或只改累计计数。

### 保存与释放的区别

- **完成**：停止接收后续任务进度，保留记录用于回放和导出。
- **导出**：主动写入 JSON / 项目；浏览器导出则下载文件。
- **关闭**：`spider_close_session` 释放该会话的内存与订阅。
- **退出 MCP**：进程内全部会话释放，本进程的预览服务随之关闭。

**没有自动落盘，请在关闭或退出前导出需要保留的内容。** 每进程最多 20 个会话；每会话最多 10,000 个不同事件、16 MiB 更新日志。批量更新出错时不会只写入半批数据，超限不会静默裁剪旧历史。接近上限时结束并导出当前会话，再创建下一段。

## 5. 导出属于自己的 UI

`spider_export_project` 支持 `name`、可选 `sessionId`、`config`、`includeMcp` 和 `includeReplay`。默认包含 MCP 源码（`true`），不附带会话回放（`false`）；附带回放需要 `sessionId`。不提供会话也可用 `config` 导出空白的个人项目。

导出包含 UI 与共享源码、无依赖静态服务、项目配置、许可证和双语启动说明。可选 MCP 子包包含锁文件，需要在新目录安装依赖。只包含明确选择的当前回放，不携带其他会话。

进入返回的导出项目目录：

```bash
npm start
```

然后打开终端显示的地址。若同时运行原项目，可改用空闲端口，见 README 的端口设置。包含回放时会直接加载回放；不包含回放时，可导入自己的 JSON 或连接自己的 Agent。

如需继续作为 MCP 使用：

```bash
npm --prefix mcp ci
```

再将客户端中的 `args` 改成**导出项目**的 `mcp/server.mjs` 绝对路径。导出项目不依赖原仓库的目录或已安装依赖，可以移动或交给其他人。

`project-config.json` 作为无回放时的本地界面默认，以及后续 MCP 新会话的默认配置。附带回放的项目还包含 `replay.json`，配置中的 `replayFile` 指向该文件；加载回放时，界面遵循记录中的历史配置，因此只改 `project-config.json` 不会改写回放外观。

要让个人主题始终作为默认外观，可选择不附带回放导出、移除 `project-config.json` 中的 `replayFile`，或创建新的 MCP 会话。只想调整当前回放，可用浏览器「布局与外观」编辑，变更记在回放末尾；回看更早的时间仍会恢复当时样式。需要保存这次修改时，再导出回放 JSON。

导出不会复制源视频、GIF 预览、原仓库 `.git`、`node_modules`、私密配置、预览令牌和无关工作材料。只创建新目录 / 文件，检查路径及链接逃逸；导出根目录内已有文件也不会覆盖。包含在导出中的源码和品牌文件仍遵守 MIT 许可证，保留许可证声明。

## 6. 工具、resources 与 prompt

| 工具 | 参数与作用 |
| --- | --- |
| `spider_create_session` | 可选 `config`；创建会话、返回 `id` 与 `previewUrl` |
| `spider_get_session` | `sessionId`、可选 `offset / limit`；查询当前状态 |
| `spider_list_sessions` | 无参数；列出会话摘要 |
| `spider_close_session` | `sessionId`；释放内存会话 |
| `spider_update_events` | `sessionId`、1–100 个 `events`；添加 / 更新步骤 |
| `spider_complete_session` | `sessionId`、可选 `status`；结束并保留回放 |
| `spider_configure_session` | `sessionId`、`config`；修改外观 / 配置 |
| `spider_control_playback` | `sessionId`、`command`；观看位置和播放控制 |
| `spider_export_session` | `sessionId`、可选 `filename`；保存 JSON，返回路径与文件名 |
| `spider_import_session` | `record` 或 `filename`；导入回放 |
| `spider_export_project` | `name` 及可选导出选项；创建独立项目 |

| 类型 | 名称 | 内容 |
| --- | --- | --- |
| resource | `spider://guide` | 接入与上报流程 |
| resource | `spider://config` | 主题、布局和事件配置 |
| resource | `spider://replay-format` | JSON 回放格式 |
| prompt | `spider_report_task` | 参数 `task`，引导 Agent 展示真实任务步骤 |

客户端应通过 MCP 的工具发现读取当前输入 schema，而不是把本文中的调用表示法当作终端命令。

## 7. 本地连接与常见问题

预览服务只监听 `127.0.0.1` 的自动分配端口，每个 MCP 进程独立。它不会复用或关闭你手动运行的 `npm start` 服务。Agent 在远程机器或容器中运行时，`127.0.0.1` 指那台机器；本接口不提供公开部署或远程 MCP HTTP 服务。

预览 URL 的 `#token=...` 是临时访问令牌，打开时保留完整地址。浏览器按来源保存在会话存储中，API 请求使用 Bearer 令牌并校验 Host / Origin。浏览器的数据事件订阅是内部 UI 通道，不是旧式 MCP SSE 入口；MCP 客户端始终通过 stdio 连接。令牌不会进入回放和独立项目。

| 现象 | 处理 |
| --- | --- |
| `node` 找不到 / 无法启动 | 检查 `node --version`，要求 20+；客户端配置可用 Node.js 绝对路径 |
| 缺少 SDK / 模块 | 在原项目或导出项目根目录运行 `npm --prefix mcp ci` |
| Agent 看不到工具 | 检查 `mcp/server.mjs` 绝对路径，选择 stdio，重新连接客户端 |
| 终端启动后没有界面 | 正常；先让客户端调用 `spider_create_session`，打开返回的预览 URL |
| 预览显示未授权 | 打开包含 `#token=...` 的完整 URL，确认进程仍在运行 |
| 刷新 / 断线后落后 | 浏览器重连时会获取完整快照；需要追上进度则选择“返回实时” |
| 暂停后事件数量还在变 | 暂停的是观看位置，后台仍接收；用回放时间点查看当时状态 |
| 导出同名文件失败 | 使用新的 `filename` 或项目 `name`；不支持覆盖 |
| 导入找不到文件 | `filename` 必须位于当前 `--export-root`；浏览器下载默认在下载目录，可改传 `record` |
| 会话不存在 | 检查是否使用另一 MCP 进程、已经关闭或重启；先前导出的 JSON 可重新导入 |
| 逐词事件报错 | 检查 `unit: "word"` 的提示词与零起始 `tokenIndex`，中文按需加空格 |
| 达到事件 / 日志上限 | 导出当前会话，完成后新建下一段；不要反复重试同一超限更新 |

页面默认文案为中文，英文 README 提供相同的连接与接口说明。原始参考演示与自己的提示词演示继续可用，与 Agent 上报的真实数据分开显示。
