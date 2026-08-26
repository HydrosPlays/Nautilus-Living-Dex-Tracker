/*
 * Living Dex Tracker — local server (zero dependencies).
 * Serves the app from /public and persists progress to data/progress.json.
 *
 * Start:  node server.js       (then open http://localhost:3000)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  // Prevent path traversal outside /public.
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function readProgress(res) {
  fs.readFile(PROGRESS_FILE, 'utf8', (err, data) => {
    if (err) return sendJson(res, 200, { version: 1, normal: {}, shiny: {} });
    try { sendJson(res, 200, JSON.parse(data)); }
    catch { sendJson(res, 200, { version: 1, normal: {}, shiny: {} }); }
  });
}

function writeProgress(req, res) {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 5 * 1024 * 1024) { req.destroy(); } // 5MB guard
  });
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      // Write atomically via a temp file so a crash can't corrupt the save.
      const tmp = PROGRESS_FILE + '.tmp';
      fs.writeFile(tmp, JSON.stringify(parsed), err => {
        if (err) return sendJson(res, 500, { ok: false, error: 'write failed' });
        fs.rename(tmp, PROGRESS_FILE, err2 => {
          if (err2) return sendJson(res, 500, { ok: false, error: 'rename failed' });
          sendJson(res, 200, { ok: true });
        });
      });
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid JSON' });
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.url.split('?')[0] === '/api/progress') {
    if (req.method === 'GET') return readProgress(res);
    if (req.method === 'POST' || req.method === 'PUT') return writeProgress(req, res);
    res.writeHead(405); res.end('Method not allowed'); return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log('\n  Nautilus — Living Dex Tracker is running!');
  console.log('  Open:  ' + url);
  console.log('  Your progress is saved to: ' + PROGRESS_FILE);
  console.log('  Press Ctrl+C to stop.\n');
  // Best-effort auto-open in the default browser (skip with LD_NO_OPEN=1).
  if (process.env.LD_NO_OPEN) return;
  const opener = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(opener, () => {});
});
