// Minimal static server for the local capture-engine test fixtures. No deps.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.FIXTURE_PORT || 4173;
const FIXTURES_DIR = path.join(__dirname, '..', 'test', 'fixtures');

const server = http.createServer((req, res) => {
  const requested = new URL(req.url, 'http://localhost').pathname;
  const file = path.join(FIXTURES_DIR, requested === '/' ? 'sample.html' : requested.replace(/^\/+/, ''));

  if (!file.startsWith(FIXTURES_DIR) || !fs.existsSync(file)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(fs.readFileSync(file));
});

server.listen(PORT, () => {
  console.log(`Fixture server listening on http://localhost:${PORT}`);
});
