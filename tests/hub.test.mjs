import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, readFile, rm, stat, symlink } from 'node:fs/promises';
import { SessionStore } from '../lib/session-store.js';
import { createPreviewHub } from '../mcp/hub.mjs';
import { Exporter } from '../mcp/exporter.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function setup(t) {
  const store = new SessionStore();
  const hub = createPreviewHub({ store, root });
  await hub.start();
  t.after(() => hub.close());
  const session = store.create({});
  const headers = { Authorization: `Bearer ${hub.token}` };
  return { store, hub, id: session.id, headers };
}
function rawGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', part => body += part);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}
test('hub requires capability, exact host and same origin for private snapshots', async t => {
  const { hub, id, headers } = await setup(t);
  const url = `${hub.origin}/api/sessions/${id}`;
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await rawGet(url, { ...headers, Host: 'evil.example' })).status, 403);
  assert.equal((await fetch(url, { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(url, { headers: { ...headers, Origin: hub.origin } })).status, 200);
  assert.equal((await (await fetch(url, { headers })).json()).id, id);
});
test('static whitelist serves app/shared config but refuses traversal and repository files', async t => {
  const { hub } = await setup(t);
  for (const pathname of ['/', '/main.js', '/lib/config.js', '/project-config.json']) {
    assert.equal((await fetch(hub.origin + pathname)).status, 200, pathname);
  }
  for (const pathname of ['/package.json', '/mcp/server.mjs', '/.git/config', '/..%2fpackage.json', '/%2e%2e%5cpackage.json', '/lib/../package.json']) {
    assert.notEqual((await fetch(hub.origin + pathname)).status, 200, pathname);
  }
});
test('SSE sends bounded notifications and closes on session release', async t => {
  const { hub, store, id, headers } = await setup(t);
  const abort = new AbortController();
  t.after(() => abort.abort());
  const response = await fetch(`${hub.origin}/api/sessions/${id}/events`, { headers, signal: abort.signal });
  const reader = response.body.getReader();
  await reader.read();
  store.updateEvents(id, [{ id: 'a', label: 'Inspect', route: 'code' }]);
  const change = new TextDecoder().decode((await reader.read()).value);
  assert.match(change, /"type":"update"/);
  assert.doesNotMatch(change, /"log":/);
  store.close(id);
  const closed = new TextDecoder().decode((await reader.read()).value);
  assert.match(closed, /"type":"closed"/);
  assert.equal((await reader.read()).done, true);
});
test('preview playback control validates payload and does not stop ingestion', async t => {
  const { hub, store, id, headers } = await setup(t);
  const url = `${hub.origin}/api/sessions/${id}/control`;
  assert.equal((await fetch(url, { method: 'POST', headers, body: '{' })).status, 400);
  assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ action: 'pause' }) })).status, 200);
  store.updateEvents(id, [{ id: 'a', label: 'Task', route: 'model' }]);
  assert.equal(store.get(id).pagination.total, 1);
  assert.equal(store.snapshot(id).playback.mode, 'paused');
  const configured = await fetch(`${hub.origin}/api/sessions/${id}/configure`, { method: 'POST', headers, body: JSON.stringify({ layout: 'landscape' }) });
  assert.equal(configured.status, 200);
  assert.equal(store.snapshot(id).config.layout, 'landscape');
});
test('SSE reconnect starts with a fresh snapshot and disconnect releases its subscriber', async t => {
  const { hub, store, id, headers } = await setup(t);
  const controller = new AbortController();
  const response = await fetch(`${hub.origin}/api/sessions/${id}/events`, { headers, signal: controller.signal });
  const reader = response.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /"type":"snapshot"/);
  controller.abort();
  await assert.rejects(reader.read(), /abort/i);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(store.sessions.get(id).listeners.size, 0);
  store.updateEvents(id, [{ id: 'offline', label: 'Reported while disconnected', route: 'you' }]);
  const restored = await fetch(`${hub.origin}/api/sessions/${id}/events`, { headers });
  const restoredReader = restored.body.getReader();
  const snapshot = new TextDecoder().decode((await restoredReader.read()).value);
  assert.match(snapshot, /"offline"/);
  assert.match(snapshot, /"type":"snapshot"/);
  await restoredReader.cancel();
});
test('exports only create new bounded paths and omit credentials/media/dependencies', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'spider-export-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const exporter = new Exporter({ root, exportRoot: path.join(temp, 'exports') });
  const store = new SessionStore();
  const session = store.create({ title: 'Personal UI' });
  const record = store.record(session.id);
  await assert.rejects(exporter.exportSession(record, '../escape.json'), /path|name|inside|relative/i);
  await assert.rejects(exporter.exportProject({ name: '../escape', config: record.config }), /path|name|inside|relative/i);
  await assert.rejects(exporter.exportProject({ name: 'conflicting-replay', config: { ...record.config, title: 'Unrecorded override' }, record, includeReplay: true }), /spider_configure_session/);
  await assert.rejects(stat(path.join(temp, 'exports', 'conflicting-replay')), { code: 'ENOENT' });
  const result = await exporter.exportProject({ name: 'personal-ui', config: record.config, record, includeMcp: false, includeReplay: true });
  assert.equal(JSON.parse(await readFile(path.join(result.path, 'project-config.json'), 'utf8')).replayFile, 'replay.json');
  assert.match(await readFile(path.join(result.path, 'README.md'), 'utf8'), /npm start/);
  assert.match(await readFile(path.join(result.path, 'README.md'), 'utf8'), /回放历史.*配置优先/);
  assert.match(await readFile(path.join(result.path, 'README.en.md'), 'utf8'), /Recorded configuration takes precedence/);
  assert.equal(JSON.parse(await readFile(path.join(result.path, 'replay.json'), 'utf8')).format, 'prompt-spider-session/v1');
  await assert.rejects(exporter.exportProject({ name: 'personal-ui', config: record.config }), /exist/i);
  await mkdir(path.join(temp, 'outside'));
  try { await symlink(path.join(temp, 'outside'), path.join(temp, 'exports', 'linked'), 'junction'); }
  catch (error) { if (error.code === 'EPERM') return; throw error; }
  await assert.rejects(exporter.exportSession(record, 'linked/leak.json'), /link|path|name|inside|relative/i);
  const linkedRoot = new Exporter({ root, exportRoot: path.join(temp, 'exports', 'linked') });
  await assert.rejects(linkedRoot.exportSession(record, 'leak.json'), /link|junction/i);
});
test('replay import refuses a symbolic file link when the OS permits creating one', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'spider-import-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const exporter = new Exporter({ root, exportRoot: temp });
  const store = new SessionStore();
  const session = store.create({});
  const exported = await exporter.exportSession(store.record(session.id), 'source.json');
  try { await symlink(exported.path, path.join(temp, 'linked.json'), 'file'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('Windows file symlink creation needs Developer Mode or elevated privileges; junction protection is tested above.'); return; } throw error; }
  await assert.rejects(exporter.importSession('linked.json'), /link/i);
});
test('large legal replay roundtrips even when pretty JSON exceeds 32 MiB', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'spider-large-replay-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const store = new SessionStore();
  const session = store.create({});
  for (let offset = 0; offset < 4100; offset += 100) {
    store.updateEvents(session.id, Array.from({ length: 100 }, (_, index) => ({ id: `large-${offset+index}`, label: 'Detailed task', route: 'code', detail: 'x'.repeat(3800) })));
  }
  const record = store.record(session.id);
  assert.ok(Buffer.byteLength(JSON.stringify(record.log)) < 16 * 1024 * 1024, 'Valid source history stays below its unchanged 16 MiB limit');
  const exporter = new Exporter({ root, exportRoot: temp });
  const exported = await exporter.exportSession(record, 'large.json');
  assert.ok((await stat(exported.path)).size > 32 * 1024 * 1024, 'Regression fixture actually exceeds the old file limit');
  const imported = await exporter.importSession('large.json');
  assert.equal(imported.events.length, 4100);
  assert.equal(imported.events.at(-1).detail, 'x'.repeat(3800));
  assert.deepEqual(imported.counts, record.counts);
});
