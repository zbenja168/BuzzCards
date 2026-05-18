#!/usr/bin/env node
// Minimal static file server for local development.
// Usage: node scripts/dev_server.js [port]
// Serves the project root so the game can fetch ../data/cards.json relative to game/index.html.

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2], 10) || 3000;
const ROOT = path.resolve(__dirname, '..');

const MIME = {
  '.html':'text/html; charset=utf-8',
  '.js':  'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url.endsWith('/')) url += 'index.html';
  const filePath = path.normalize(path.join(ROOT, url));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('not found: ' + url); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(filePath).pipe(res);
  });
}).listen(PORT, () => {
  console.log(`Dev server: http://localhost:${PORT}/`);
});
