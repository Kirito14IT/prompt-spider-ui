#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio, StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { DEFAULT_CONFIG, normalizeConfig } from '../lib/config.js';
import { SessionStore } from '../lib/session-store.js';
import { createPreviewHub } from './hub.mjs';
import { Exporter } from './exporter.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const route = z.enum(['code', 'model', 'you']);
const terminal = z.enum(['completed', 'failed', 'cancelled']);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const routeConfig = z.object({ label: z.string().min(1).max(40).optional(), color: color.optional() }).strict();
const config = z.object({
  title: z.string().min(1).max(80).optional(), subtitle: z.string().max(160).optional(), modelName: z.string().min(1).max(80).optional(),
  layout: z.enum(['portrait', 'landscape', 'square']).optional(), unit: z.enum(['task', 'word']).optional(), prompt: z.string().max(12000).optional(),
  expectedTotal: z.number().int().min(0).max(10000).nullable().optional(),
  routes: z.object({ code: routeConfig.optional(), model: routeConfig.optional(), you: routeConfig.optional() }).strict().optional(),
  theme: z.object(Object.fromEntries(Object.keys(DEFAULT_CONFIG.theme).map(key => [key, color.optional()]))).strict().optional()
}).strict();
const event = z.object({
  id: z.string().min(1).max(120).describe('Stable task ID. Reuse it to update a task without increasing counts.'),
  label: z.string().min(1).max(200).optional().describe('Required for a new ID.'), route: route.optional().describe('Required for a new ID: deterministic code, model work, or human action.'),
  status: z.enum(['pending', 'running', 'completed', 'failed']).optional(), score: z.number().min(0).max(1).nullable().optional(),
  detail: z.string().max(4000).optional(), tokenIndex: z.number().int().min(0).nullable().optional().describe('Required zero-based whitespace token index for word mode.'),
  occurredAt: z.string().max(120).nullable().optional()
}).strict();
const command = z.object({
  action: z.enum(['play', 'pause', 'seek', 'restart', 'follow_live']).optional(), position: z.number().min(0).optional(), speed: z.number().min(0.5).max(4).optional(),
  loop: z.boolean().optional(), routeFilter: z.enum(['all', 'code', 'model', 'you']).optional(), page: z.number().int().min(0).optional()
}).strict();
const sessionId = z.string().min(1).max(120).describe('id returned by spider_create_session or spider_import_session');
const object = fields => z.object(fields).strict();
const resultSchema = z.record(z.string(), z.unknown());
const guide = `# Prompt Spider UI MCP\n\n1. Call spider_create_session with optional config; open its previewUrl in your browser.\n2. Report only real, public-safe task information through spider_update_events, 1–100 events per call. New IDs require label and route; reuse IDs for progress changes. code = deterministic tool/rule work, model = model work, you = human action. Scores are optional and are never invented.\n3. spider_configure_session changes title, route labels/colors, theme and portrait/landscape/square layout. Word mode needs prompt and zero-based tokenIndex. Prompt/unit cannot change after events arrive.\n4. Pause/seek only changes the view; ingestion continues. Use follow_live to return.\n5. spider_complete_session freezes duration but preserves data. spider_export_session saves a portable JSON under the configured export root; spider_import_session restores it as a read-only replay under a new ID.\n6. spider_export_project creates a new standalone editable directory; includeMcp defaults true, includeReplay defaults false. Pass sessionId for its theme and optional recording.\n7. spider_close_session releases memory; it is different from completing a session.\n\nOrdinary UI: npm start (no dependencies). MCP: npm --prefix mcp ci, then configure your host to launch node /absolute/project/mcp/server.mjs over stdio. Optional --export-root /absolute/directory restricts explicit disk writes. Only new leaf file/directory names are accepted; existing exports are never overwritten.\n\nLimits: 20 sessions, 10,000 unique events/session, 16 MiB update log/session, paginated get up to 200 events. All sessions are process-local and in memory until you export. Stopping MCP closes its previews. No automatic Agent instrumentation, no cloud services. Never report keys, credentials or private chain of thought.\n`;

export async function createRuntime({ projectRoot = root, exportRoot = path.join(projectRoot, 'exports') } = {}) {
  const store = new SessionStore();
  const hub = createPreviewHub({ store, root: projectRoot });
  const exporter = new Exporter({ root: projectRoot, exportRoot });
  let projectConfig = {};
  try {
    const { replayFile, ...loaded } = JSON.parse(await readFile(path.join(projectRoot, 'project-config.json'), 'utf8'));
    projectConfig = normalizeConfig(loaded);
  } catch (error) { if (error.code !== 'ENOENT') throw new Error(`Invalid project-config.json: ${error.message}`); }
  return { store, hub, exporter, projectConfig, async close() { await hub.close(); } };
}

/** One factory is used for both legacy initialization and modern discovery. */
export function createMcpServer(runtime) {
  const { store, hub, exporter, projectConfig } = runtime;
  const server = new McpServer({ name: 'prompt-spider-ui', version: '1.1.0' });
  function tool(name, description, inputSchema, handler, { readOnlyHint = false, destructiveHint = false, idempotentHint = false } = {}) {
    server.registerTool(name, { description, inputSchema, outputSchema: resultSchema, annotations: { readOnlyHint, destructiveHint, idempotentHint, openWorldHint: false } }, async args => {
      try {
        const data = await handler(args);
        return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
      } catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
    });
  }
  const preview = result => ({ ...result, previewUrl: hub.previewUrl(result.id) });
  tool('spider_create_session', 'Create an in-memory task visualization and return its local previewUrl. Open the URL manually. UI does not automatically instrument your Agent.', object({ config: config.optional() }), async args => {
    await hub.start();
    return preview(store.create(normalizeConfig(args.config || {}, normalizeConfig(projectConfig))));
  });
  tool('spider_get_session', 'Get current session metadata and a page of latest events; no full history. Use offset and limit for large sessions.', object({ sessionId, offset: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(200).optional() }), args => preview(store.get(args.sessionId, { offset: args.offset, limit: args.limit })), { readOnlyHint: true, idempotentHint: true });
  tool('spider_list_sessions', 'List open sessions with summary counts, configuration and playback state; no event histories.', object({}), () => ({ sessions: store.list().map(preview) }), { readOnlyHint: true, idempotentHint: true });
  tool('spider_close_session', 'Release a session and its history from memory, ending its preview. Export first if you want to preserve it.', object({ sessionId }), args => store.close(args.sessionId), { destructiveHint: true });
  tool('spider_update_events', 'Report 1–100 real task events. A new ID needs label and route. Reusing an ID updates it without double counting. Missing score stays unknown.', object({ sessionId, events: z.array(event).min(1).max(100) }), args => store.updateEvents(args.sessionId, args.events), { idempotentHint: true });
  tool('spider_complete_session', 'Mark a live session completed, failed or cancelled. Freeze duration and keep history for export or looping replay; this does not close it.', object({ sessionId, status: terminal.optional() }), args => store.complete(args.sessionId, args.status), { idempotentHint: true });
  tool('spider_configure_session', 'Merge title, modelName, route labels/colors, theme or portrait/landscape/square layout. Prompt and unit cannot change after events arrive.', object({ sessionId, config }), args => store.configure(args.sessionId, args.config), { idempotentHint: true });
  tool('spider_control_playback', 'Play, pause, seek in seconds, restart or follow_live. Ingestion continues while paused. Looping needs a completed or imported session.', object({ sessionId, command }), args => store.control(args.sessionId, args.command));
  tool('spider_export_session', 'Explicitly save a portable replay JSON below the configured export root. filename must be a new simple .json basename; no overwriting or arbitrary paths.', object({ sessionId, filename: z.string().optional() }), async args => {
    const saved = await exporter.exportSession(store.record(args.sessionId), args.filename);
    return { path: saved.path, filename: path.basename(saved.path), eventCount: saved.record.events.length, format: saved.record.format };
  });
  tool('spider_import_session', 'Restore a portable record or a .json filename from the export root into a new read-only replay session. Supply exactly one of record or filename.', object({ record: z.record(z.string(), z.unknown()).optional(), filename: z.string().optional() }), async args => {
    if (Number(args.record !== undefined) + Number(args.filename !== undefined) !== 1) throw new Error('Supply exactly one of record or filename');
    const record = args.record ?? await exporter.importSession(args.filename);
    const restored = store.importRecord(record);
    await hub.start();
    return preview(store.get(restored.id));
  });
  tool('spider_export_project', 'Create an independent editable UI under a new export-root directory. includeMcp defaults true; includeReplay defaults false and requires sessionId. No videos, dependencies or credentials are copied.', object({ sessionId: sessionId.optional(), name: z.string().min(1).max(100), config: config.optional(), includeMcp: z.boolean().optional(), includeReplay: z.boolean().optional() }), async args => {
    const record = args.sessionId ? store.record(args.sessionId) : undefined;
    const merged = normalizeConfig(args.config || {}, record?.config || normalizeConfig(projectConfig));
    return exporter.exportProject({ name: args.name, config: merged, record, includeMcp: args.includeMcp ?? true, includeReplay: args.includeReplay ?? false });
  });
  const resource = (name, uri, mimeType, text) => server.registerResource(name, uri, { mimeType, description: name }, async url => ({ contents: [{ uri: url.href, mimeType, text }] }));
  resource('Agent integration guide', 'spider://guide', 'text/markdown', guide);
  resource('Configuration defaults and schema', 'spider://config', 'application/json', JSON.stringify({ defaults: DEFAULT_CONFIG, schema: z.toJSONSchema(config) }, null, 2));
  resource('Portable replay format', 'spider://replay-format', 'text/markdown', '# prompt-spider-session/v1\n\nversion: 1; id; createdAt; initialConfig; config; status (live/completed/failed/cancelled); duration (relative seconds); revision; events (latest normalized events); log (monotonic revision/at/type, full events or config or completion status); counts; statusCounts; playback. Logs preserve event and theme/config updates. Import validates and rebuilds aggregates instead of trusting them. Control positions are seconds. An unfinished saved live session imports as a frozen read-only replay. No preview token or local paths are part of this format.\n');
  server.registerPrompt('spider_report_task', { description: 'Guide an Agent to visualize a real task with stable IDs and honest progress.', argsSchema: object({ task: z.string().min(1).max(4000) }) }, ({ task }) => ({ messages: [{ role: 'user', content: { type: 'text', text: `Visualize this task with Prompt Spider UI: ${task}\nCreate a session, return its previewUrl, then report public-safe task steps with stable IDs through spider_update_events. Use code for deterministic tool or rule work, model for model work, you for human action. Report only steps you actually perform, never invent scores or totals. Do not report secrets or private reasoning. Update existing IDs for progress, complete the session at the end, and offer replay or independent project export if requested. Read spider://guide before using unfamiliar tools.` } }] }));
  return server;
}

export async function main(argv = process.argv.slice(2)) {
  let exportRoot;
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--export-root' && argv[index + 1]) exportRoot = argv[++index];
    else if (argv[index] === '--help') { console.error('node mcp/server.mjs [--export-root ABSOLUTE_DIRECTORY]\nMCP stdio server. Install with npm --prefix mcp ci.'); return; }
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  const runtime = await createRuntime({ exportRoot });
  const handle = serveStdio(() => createMcpServer(runtime), { transport: new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 64 * 1024 * 1024 }), onerror: error => console.error(`MCP: ${error.message}`) });
  let closing = false;
  const close = async () => { if (closing) return; closing = true; await runtime.close(); await handle.close(); };
  process.stdin.once('end', () => { void close(); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void close(); });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
