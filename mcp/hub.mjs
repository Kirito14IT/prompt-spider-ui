import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { serveStatic } from '../server.mjs';

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}
function sameToken(actual, expected) {
  const a = Buffer.from(actual || '');
  const b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function readJson(req) {
  let size = 0;
  const parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > 64 * 1024) throw new Error('Control payload exceeds 64 KiB');
    parts.push(part);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}

/** A process-private browser preview, separate from the stdio MCP transport. */
export function createPreviewHub({ store, root }) {
  const token = randomBytes(32).toString('hex');
  const streams = new Set();
  let pending;
  let origin;
  const server = http.createServer((req, res) => {
    handle(req, res).catch(error => {
      if (res.headersSent) { res.destroy(); return; }
      const status = /not found|unknown session|does not exist/i.test(error.message) ? 404 : 400;
      sendJson(res, status, { error: error.message });
    });
  });
  async function handle(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) {
      sendJson(res, 403, { error: 'Host or Origin is not allowed' }); return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, origin).pathname); }
    catch { sendJson(res, 400, { error: 'Invalid URL' }); return; }
    if (!pathname.startsWith('/api/')) { await serveStatic(req, res, { root }); return; }
    if (!sameToken(req.headers.authorization, token)) { sendJson(res, 401, { error: 'Preview capability token required. Reopen the previewUrl returned by MCP.' }); return; }
    const match = /^\/api\/sessions\/([^/]+)(?:\/(events|control|configure|export))?$/.exec(pathname);
    if (!match) { sendJson(res, 404, { error: 'Unknown API route' }); return; }
    const [, id, operation] = match;
    if (!operation && req.method === 'GET') { sendJson(res, 200, store.snapshot(id)); return; }
    if (operation === 'export' && req.method === 'GET') {
      res.setHeader('Content-Disposition', 'attachment; filename="spider-session.json"');
      sendJson(res, 200, store.record(id)); return;
    }
    if (operation === 'control' && req.method === 'POST') { sendJson(res, 200, store.control(id, await readJson(req))); return; }
    if (operation === 'configure' && req.method === 'POST') { sendJson(res, 200, store.configure(id, await readJson(req))); return; }
    if (operation === 'events' && req.method === 'GET') {
      store.get(id);
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      streams.add(res);
      const unsubscribe = store.subscribe(id, payload => {
        if (res.destroyed) return;
        const writable = res.write(`data: ${JSON.stringify(payload)}\n\n`);
        if (payload.type === 'closed' || !writable) res.end();
      });
      res.write(`data: ${JSON.stringify({ type: 'snapshot', snapshot: store.snapshot(id) })}\n\n`);
      const timer = setInterval(() => { if (!res.destroyed) res.write(': keepalive\n\n'); }, 15000);
      timer.unref();
      res.once('close', () => { clearInterval(timer); unsubscribe(); streams.delete(res); });
      return;
    }
    sendJson(res, 405, { error: 'Method not allowed' });
  }
  return {
    token,
    get origin() { return origin; },
    async start() {
      if (origin) return origin;
      if (!pending) pending = new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          server.removeListener('error', reject);
          origin = `http://127.0.0.1:${server.address().port}`;
          resolve(origin);
        });
      });
      return pending;
    },
    previewUrl(id) { return `${origin}/?session=${encodeURIComponent(id)}#token=${token}`; },
    async close() {
      for (const response of streams) response.end();
      streams.clear();
      if (!server.listening) return;
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    }
  };
}
