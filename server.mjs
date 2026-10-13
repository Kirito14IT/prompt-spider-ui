import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(root, 'app');
const port = Number(process.env.PORT || 4317);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

function streamFile(filename,res) {
  const stream=createReadStream(filename);
  // Stop reading when a client closes the response.
  res.once('close',()=>stream.destroy());
  stream.once('error',()=>res.destroy());
  stream.pipe(res);
}

const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end(); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (url === '/status') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ application: 'prompt-spider-ui' })); return;
  }
  const filename = path.resolve(app, '.' + (url === '/' ? '/index.html' : url));
  if (!filename.startsWith(app + path.sep) || !existsSync(filename) || !statSync(filename).isFile()) { res.writeHead(404).end('Not found'); return; }
  res.setHeader('Content-Type', types[path.extname(filename)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  if (req.method === 'HEAD') res.end(); else streamFile(filename,res);
});
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${port} is busy. Use $env:PORT=4318; npm start` : e); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Prompt Spider UI → http://127.0.0.1:${port}\nLocal Canvas demo. Ctrl+C to stop.`));
