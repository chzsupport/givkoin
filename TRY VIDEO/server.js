const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
};

function sendFile(req, res, filePath) {
  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = TYPES[ext] || 'application/octet-stream';
    const range = req.headers.range;

    if (range && ext === '.mp4') {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = Number(parts[0]) || 0;
      const end = parts[1] ? Number(parts[1]) : stats.size - 1;
      const chunkSize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': type,
      });

      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stats.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    });

    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const normalizedPath = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = path.join(ROOT, normalizedPath.replace(/^\/+/, ''));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  console.log(`[TRY VIDEO] ${new Date().toISOString()} ${req.method} ${requestPath}`);
  sendFile(req, res, filePath);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[TRY VIDEO] http://127.0.0.1:${PORT}`);
});
