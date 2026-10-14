import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdir, open, readdir, realpath, rm, stat } from 'node:fs/promises';
import { normalizeConfig } from '../lib/config.js';
import { validateRecord } from '../lib/replay.js';

const maxImportBytes = 64 * 1024 * 1024;
const within = (base, target) => { const relative = path.relative(base, target); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
const forbiddenWindowsName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
function safeName(name, json = false) {
  if (typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(name) || name.endsWith('.') || forbiddenWindowsName.test(name) || (json && !name.endsWith('.json'))) {
    throw new Error(json ? 'filename must be a simple relative .json name, with no directory components' : 'Project name must be a simple relative directory name using letters, digits, dots, underscores or hyphens');
  }
  return name;
}
async function noLinksInAncestors(target) {
  const resolved = path.resolve(target);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  for (const part of resolved.slice(parsed.root.length).split(path.sep)) {
    if (!part) continue;
    current = path.join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symbolic link or junction is not allowed in export path: ${current}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
async function writeNew(filename, content) {
  const handle = await open(filename, 'wx', 0o600);
  try { await handle.writeFile(content, 'utf8'); } finally { await handle.close(); }
}
async function copyTree(source, destination, allowedExtensions) {
  if ((await lstat(source)).isSymbolicLink()) throw new Error(`Source symbolic links are not exported: ${source}`);
  await mkdir(destination);
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'exports') continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Source symbolic links are not exported: ${from}`);
    if (entry.isDirectory()) await copyTree(from, to, allowedExtensions);
    else if (entry.isFile() && allowedExtensions.has(path.extname(entry.name))) await copyFile(from, to, 1);
  }
}
function exportedReadme(english, includeMcp, includeReplay) {
  if (english) return `# My Prompt Spider UI\n\n[简体中文](README.md) | English\n\nAn independent, editable UI exported from [Prompt Spider UI](https://github.com/Kirito14IT/prompt-spider-ui).\n\n## Start\n\nInstall Node.js 20 or newer, then run:\n\n\`\`\`sh\nnpm start\n\`\`\`\n\nOpen http://127.0.0.1:4317. No dependency installation is needed for the UI. Edit \`project-config.json\` to change title, prompt, routes, theme and layout (portrait, landscape, square); use \`app/\` and \`lib/\` for deeper customization. ${includeReplay ? 'The included replay.json opens automatically.\n' : '\n'}${includeMcp ? '\n## Connect your Agent\n\n```sh\nnpm --prefix mcp ci\nnode mcp/server.mjs\n```\n\nConfigure your MCP host to launch the absolute path of mcp/server.mjs with node using stdio. Call spider_create_session, send spider_update_events with stable IDs, then spider_complete_session. Read the spider://guide resource for tool details. Source and locks are included; no dependencies are bundled.\n' : ''}\n## License\n\nMIT; preserve the included LICENSE and upstream attribution. Only explicitly reported task data appears; this UI does not monitor your Agent automatically.\n`;
  return `# 我的 Prompt Spider UI\n\n简体中文 | [English](README.en.md)\n\n从 [Prompt Spider UI](https://github.com/Kirito14IT/prompt-spider-ui) 导出的独立可编辑项目。\n\n## 启动\n\n安装 Node.js 20 或更高版本，在项目目录执行：\n\n\`\`\`sh\nnpm start\n\`\`\`\n\n打开 http://127.0.0.1:4317。普通 UI 无需安装依赖。修改 \`project-config.json\` 可调整标题、提示词、三分支名称、配色与 portrait / landscape / square 布局；深入改造可编辑 \`app/\`、\`lib/\` 源码。${includeReplay ? '随附 replay.json 会自动载入回放。\n' : '\n'}${includeMcp ? '\n## 接入自己的 Agent\n\n```sh\nnpm --prefix mcp ci\nnode mcp/server.mjs\n```\n\n在 MCP 客户端配置 node 命令和 mcp/server.mjs 的绝对路径，使用 stdio。先调用 spider_create_session，再用稳定 ID 调用 spider_update_events，结束时调用 spider_complete_session。读取 spider://guide resource 获取工具说明。项目包含源码和锁文件，不附带依赖目录。\n' : ''}\n## 许可证\n\nMIT；保留随附 LICENSE 与上游署名。界面仅展示主动上报的数据，不会自动读取 Agent 内部状态。\n`;
}

/** Disk writes are restricted to brand-new leaf names below one trusted root. */
export class Exporter {
  constructor({ root, exportRoot = path.join(root, 'exports') }) {
    this.root = path.resolve(root);
    if (!path.isAbsolute(exportRoot)) throw new Error('exportRoot must be absolute');
    this.exportRoot = path.resolve(exportRoot);
  }
  async prepareRoot() {
    await noLinksInAncestors(this.exportRoot);
    await mkdir(this.exportRoot, { recursive: true });
    const resolved = await realpath(this.exportRoot);
    if (path.resolve(resolved).toLowerCase() !== this.exportRoot.toLowerCase()) throw new Error('Export root must resolve without symlink or junction escapes');
    return resolved;
  }
  async exportSession(record, filename = `spider-${randomUUID()}.json`) {
    const normalized = validateRecord(record);
    const base = await this.prepareRoot();
    const destination = path.join(base, safeName(filename, true));
    await writeNew(destination, JSON.stringify(normalized, null, 2) + '\n');
    return { path: destination, record: normalized };
  }
  async importSession(filename) {
    const base = await this.prepareRoot();
    const target = path.join(base, safeName(filename, true));
    const info = await lstat(target);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('Import path must be a regular file, without symbolic links');
    const resolved = await realpath(target);
    if (!within(base, resolved)) throw new Error('Import file must stay inside export root');
    if (info.size > maxImportBytes) throw new Error('Replay file exceeds 64 MiB');
    const handle = await open(target, 'r');
    try { return validateRecord(JSON.parse(await handle.readFile('utf8'))); }
    finally { await handle.close(); }
  }
  async exportProject({ name, config = {}, record, includeMcp = true, includeReplay = false }) {
    safeName(name);
    const normalizedConfig = normalizeConfig(config);
    if (includeReplay && !record) throw new Error('includeReplay requires a sessionId or replay record');
    const normalizedRecord = includeReplay ? validateRecord(record) : undefined;
    if (normalizedRecord && JSON.stringify(normalizedConfig) !== JSON.stringify(normalizedRecord.config)) {
      throw new Error('includeReplay preserves recorded configuration. Call spider_configure_session first, then export without conflicting config overrides, or set includeReplay to false.');
    }
    const base = await this.prepareRoot();
    const destination = path.join(base, name);
    if (!within(base, destination) || destination === base) throw new Error('Project path must stay inside export root');
    await mkdir(destination); // exclusive: existing projects are never overwritten
    try {
      await copyTree(path.join(this.root, 'app'), path.join(destination, 'app'), new Set(['.html', '.js', '.css', '.txt', '.svg', '.png', '.ico', '.woff2']));
      await copyTree(path.join(this.root, 'lib'), path.join(destination, 'lib'), new Set(['.js']));
      for (const filename of ['server.mjs', 'LICENSE']) {
        const source = path.join(this.root, filename);
        if ((await lstat(source)).isSymbolicLink()) throw new Error('Source symbolic links are not exported');
        await copyFile(source, path.join(destination, filename), 1);
      }
      if (includeMcp) await copyTree(path.join(this.root, 'mcp'), path.join(destination, 'mcp'), new Set(['.mjs', '.json']));
      const brandSource = path.join(this.root, 'docs', 'brand');
      try {
        await stat(brandSource);
        await mkdir(path.join(destination, 'docs'));
        await copyTree(brandSource, path.join(destination, 'docs', 'brand'), new Set(['.svg', '.png', '.ico']));
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const projectConfig = { ...normalizedConfig, ...(includeReplay ? { replayFile: 'replay.json' } : {}) };
      await writeNew(path.join(destination, 'project-config.json'), JSON.stringify(projectConfig, null, 2) + '\n');
      if (includeReplay) await writeNew(path.join(destination, 'replay.json'), JSON.stringify(normalizedRecord, null, 2) + '\n');
      await writeNew(path.join(destination, 'package.json'), JSON.stringify({ name: name.toLowerCase(), version: '1.1.0', private: true, type: 'module', license: 'MIT', scripts: { start: 'node server.mjs', ...(includeMcp ? { 'start:mcp': 'node mcp/server.mjs' } : {}) }, engines: { node: '>=20' } }, null, 2) + '\n');
      const replayNoteZh = includeReplay ? '\n## 回放与默认配置\n\n载入 replay.json 时，回放历史中的配置优先，主题、标题和布局会按录制时的变化重现。project-config.json 是不载入回放时的界面配置，以及新建 MCP 会话的默认配置；直接修改它不会覆盖已有回放。若要导出新的录制配置，先调用 spider_configure_session，再导出项目；导出时不要同时传入与录制配置冲突的 config。\n' : '';
      const replayNoteEn = includeReplay ? '\n## Replay and default configuration\n\nRecorded configuration takes precedence when replay.json is loaded: title, theme and layout follow their recorded changes. project-config.json supplies the UI defaults without a replay and the defaults for new MCP sessions; editing it does not override an existing replay. To export updated recorded configuration, call spider_configure_session first, then export without conflicting config overrides.\n' : '';
      await writeNew(path.join(destination, 'README.md'), exportedReadme(false, includeMcp, includeReplay).replace('\n## 许可证\n', replayNoteZh + '\n## 许可证\n'));
      await writeNew(path.join(destination, 'README.en.md'), exportedReadme(true, includeMcp, includeReplay).replace('\n## License\n', replayNoteEn + '\n## License\n'));
      await writeNew(path.join(destination, '.gitignore'), 'node_modules/\nexports/\n.env*\nreplay.json\n');
      return { path: destination, includeMcp, includeReplay, startCommand: 'npm start' };
    } catch (error) {
      // Only this newly created and verified child is eligible for rollback.
      await noLinksInAncestors(destination);
      if (within(base, destination) && destination !== base) await rm(destination, { recursive: true, force: true });
      throw error;
    }
  }
}
