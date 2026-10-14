import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
async function connect(t, mode, entry = path.join(root, 'mcp', 'server.mjs'), exportRoot) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry, ...(exportRoot ? ['--export-root', exportRoot] : [])], stderr: 'pipe' });
  const client = new Client({ name: 'spider-test', version: '1.0.0' }, { versionNegotiation: { mode } });
  await client.connect(transport);
  t.after(() => client.close());
  return { client, transport };
}
async function call(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.ok(result.structuredContent);
  return result.structuredContent;
}
for (const mode of ['legacy', { pin: '2026-07-28' }]) {
  test(`official client ${JSON.stringify(mode)} discovers all tools, resources and prompt`, async t => {
    const { client } = await connect(t, mode);
    assert.equal(client.getProtocolEra(), mode === 'legacy' ? 'legacy' : 'modern');
    assert.equal((await client.listTools()).tools.length, 11);
    assert.equal((await client.listResources()).resources.length, 3);
    const guide = await client.readResource({ uri: 'spider://guide' });
    assert.match(guide.contents[0].text, /spider_update_events/);
    assert.equal((await client.listPrompts()).prompts[0].name, 'spider_report_task');
    assert.match((await client.getPrompt({ name: 'spider_report_task', arguments: { task: 'Check files' } })).messages[0].content.text, /Check files/);
    const result = await client.callTool({ name: 'spider_create_session', arguments: { config: { layout: 'broken' } } });
    assert.equal(result.isError, true);
  });
}
test('official client complete tool chain, 5000 events, replay and clean independent export', { timeout: 60000 }, async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'spider-protocol-'));
  let app;
  t.after(async () => {
    if (app && app.exitCode === null && app.signalCode === null) await new Promise(resolve => { app.once('exit', resolve); app.kill(); });
    await rm(temp, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
  });
  const exportRoot = path.join(temp, 'exports');
  const { client } = await connect(t, 'legacy', undefined, exportRoot);
  const session = await call(client, 'spider_create_session', { config: { title: 'Integration', expectedTotal: 5000 } });
  const id = session.id;
  assert.ok(session.previewUrl.includes('#token='));
  const origin = new URL(session.previewUrl).origin;
  const token = new URLSearchParams(new URL(session.previewUrl).hash.slice(1)).get('token');
  const headers = { Authorization: `Bearer ${token}` };
  await call(client, 'spider_control_playback', { sessionId: id, command: { action: 'pause' } });
  for (let i = 0; i < 5000; i += 100) {
    await call(client, 'spider_update_events', { sessionId: id, events: Array.from({ length: 100 }, (_, j) => ({ id: `step-${i+j}`, label: `Step ${i+j}`, route: ['code','model','you'][(i+j)%3], status: 'completed' })) });
  }
  await call(client, 'spider_update_events', { sessionId: id, events: [{ id: 'step-0', status: 'failed' }] });
  const state = await call(client, 'spider_get_session', { sessionId: id, offset: 4990, limit: 10 });
  assert.equal(state.pagination.total, 5000);
  assert.equal(state.events.length, 10);
  assert.equal(state.playback.mode, 'paused');
  assert.equal(state.events[0].score, null);
  await call(client, 'spider_configure_session', { sessionId: id, config: { layout: 'square', routes: { code: { label: 'Rules' } } } });
  await call(client, 'spider_complete_session', { sessionId: id });
  await call(client, 'spider_control_playback', { sessionId: id, command: { action: 'restart', loop: true } });
  const exported = await call(client, 'spider_export_session', { sessionId: id, filename: 'replay.json' });
  const replay = JSON.parse(await readFile(exported.path, 'utf8'));
  assert.equal(replay.events.length, 5000);
  assert.ok(!JSON.stringify(replay).includes(token));
  const imported = await call(client, 'spider_import_session', { filename: 'replay.json' });
  assert.notEqual(imported.id, id);
  assert.equal(imported.totalEvents, 5000);
  assert.equal((await call(client, 'spider_list_sessions')).sessions.length, 2);
  const conflictingExport = await client.callTool({ name: 'spider_export_project', arguments: { sessionId: id, name: 'conflicting-replay', includeReplay: true, config: { title: 'Unrecorded override' } } });
  assert.equal(conflictingExport.isError, true);
  assert.match(conflictingExport.content[0].text, /spider_configure_session/);
  const project = await call(client, 'spider_export_project', { sessionId: id, name: 'independent', includeMcp: true, includeReplay: true });
  const files = await readdir(project.path, { recursive: true });
  assert.ok(!files.some(file => /node_modules|\.mp4$|\.gif$|\.git[\\/]/i.test(file)));
  assert.ok(files.includes('mcp\\package-lock.json') || files.includes('mcp/package-lock.json'));
  assert.match(await readFile(path.join(project.path, 'README.en.md'), 'utf8'), /npm start/);
  app = spawn(process.execPath, ['server.mjs'], { cwd: project.path, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise((resolve, reject) => {
    app.stdout.on('data', buffer => { const found = String(buffer).match(/http:\/\/127\.0\.0\.1:\d+/); if (found) resolve(found[0]); });
    app.once('error', reject); app.once('exit', code => reject(new Error(`Exported app exited ${code}`)));
  });
  for (const route of ['/', '/lib/config.js', '/project-config.json', '/replay.json']) assert.equal((await fetch(url + route)).status, 200);
  const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  await new Promise((resolve, reject) => {
    const install = spawn(process.execPath, [npmCli, '--prefix', path.join(project.path, 'mcp'), 'ci', '--ignore-scripts'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    install.stdout.on('data', data => output += data);
    install.stderr.on('data', data => output += data);
    install.once('error', reject);
    install.once('exit', code => code === 0 ? resolve() : reject(new Error(`Clean MCP install failed: ${output}`)));
  });
  const independent = await connect(t, { pin: '2026-07-28' }, path.join(project.path, 'mcp', 'server.mjs'));
  const independentSession = await call(independent.client, 'spider_create_session');
  assert.equal(independentSession.config.title, 'Integration');
  assert.equal(independentSession.config.layout, 'square');
  await independent.client.close();
  const updateError = await client.callTool({ name: 'spider_update_events', arguments: { sessionId: id, events: [{ id: 'no', label: 'No', route: 'code' }] } });
  assert.equal(updateError.isError, true);
  await call(client, 'spider_close_session', { sessionId: id });
  assert.equal((await fetch(`${origin}/api/sessions/${id}`, { headers })).status, 404);
});
