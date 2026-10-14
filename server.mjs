import http from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const sharedModules = new Set(['config.js', 'session-store.js', 'replay.js', 'layout.js']);
const within = (base, filename) => { const relative = path.relative(base, filename); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };

function json(res, value) {
  res.setHeader('Content-Type', types['.json']);
  res.end(JSON.stringify(value));
}

/** Shared zero-dependency static handler, used by the demo and local MCP hub. */
export async function serveStatic(req, res, { root = projectRoot } = {}) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-cache');
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part => part === '..')) throw new Error('Invalid path');
  } catch { res.writeHead(400).end('Invalid path'); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
  if (pathname === '/status') { json(res, { application: 'prompt-spider-ui' }); return; }
  let filename;
  let base;
  if (pathname === '/project-config.json' || pathname === '/replay.json') {
    base = root;
    filename = path.join(root, pathname.slice(1));
    if (pathname === '/project-config.json') {
      try { await stat(filename); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        json(res, {}); return;
      }
    }
  } else if (pathname.startsWith('/lib/')) {
    const name = pathname.slice(5);
    if (!sharedModules.has(name)) { res.writeHead(404).end('Not found'); return; }
    base = path.join(root, 'lib');
    filename = path.join(base, name);
  } else {
    base = path.join(root, 'app');
    filename = path.resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!within(base, filename) || !types[path.extname(filename)] || pathname.split('/').some(part => part.startsWith('.'))) {
      res.writeHead(404).end('Not found'); return;
    }
  }
  try {
    const [realBase, realFile] = await Promise.all([realpath(base), realpath(filename)]);
    if (!within(realBase, realFile) || !(await stat(realFile)).isFile()) { res.writeHead(404).end('Not found'); return; }
    res.setHeader('Content-Type', types[path.extname(filename)] || 'application/octet-stream');
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = createReadStream(realFile);
    res.once('close', () => stream.destroy());
    stream.once('error', () => res.destroy());
    stream.pipe(res);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') res.writeHead(404).end('Not found');
    else throw error;
  }
}

export function createDemoServer({ root = projectRoot } = {}) {
  return http.createServer((req, res) => {
    serveStatic(req, res, { root }).catch(() => { if (!res.headersSent) res.writeHead(500); res.end('Server error'); });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4317);
  const server = createDemoServer();
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Set PORT to another port and run npm start.` : error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`Prompt Spider UI → http://127.0.0.1:${server.address().port}\nLocal Canvas demo. Ctrl+C to stop.`));
}
