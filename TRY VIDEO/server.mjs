import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 4173;
const LOG_PATH = path.join(__dirname, 'transform.log');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function writeTerminal(line) {
  const text = `[${new Date().toISOString()}] ${line}`;
  console.log(text);
  fs.appendFileSync(LOG_PATH, `${text}\n`, 'utf8');
}

function sendFile(response, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  response.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer((request, response) => {
  if (!request.url) {
    response.writeHead(400);
    response.end('Bad Request');
    return;
  }

  if (request.method === 'POST' && request.url === '/log') {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1024 * 1024) {
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        writeTerminal(`ACTION ${data.action} ${JSON.stringify(data.payload || {})}`);
        response.writeHead(204);
        response.end();
      } catch (error) {
        writeTerminal(`ACTION parse-error ${String(error)}`);
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Bad log payload');
      }
    });
    return;
  }

  const requestPath = request.url === '/' ? '/index.html' : request.url;
  const cleanPath = path.normalize(decodeURIComponent(requestPath)).replace(/^(\.\.[\\/])+/, '');
  const fullPath = path.join(__dirname, cleanPath);

  if (!fullPath.startsWith(__dirname)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not Found');
    return;
  }

  writeTerminal(`HTTP ${request.method} ${request.url}`);
  sendFile(response, fullPath);
});

server.listen(PORT, '127.0.0.1', () => {
  writeTerminal(`SERVER READY http://127.0.0.1:${PORT}`);
});
