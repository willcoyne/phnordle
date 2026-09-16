// Static dev server. The game fetches its word lists, so file:// will not work.
// Run: node scripts/serve.mjs   ->   http://localhost:8080
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.txt': 'text/plain' };
const root = process.cwd();
const port = Number(process.env.PORT) || 8080;

http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, rel === '/' ? 'index.html' : rel);
  // Keep the server inside the project directory.
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': (TYPES[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
    res.end(buf);
  });
}).listen(port, () => console.log('http://localhost:' + port));
