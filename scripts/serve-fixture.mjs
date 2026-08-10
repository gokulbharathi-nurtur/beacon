// Minimal static server for the local capture-engine test fixture. No deps.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.FIXTURE_PORT || 4173;
const FILE = path.join(__dirname, '..', 'test', 'fixtures', 'sample.html');

const server = http.createServer((req, res) => {
  const body = fs.readFileSync(FILE);
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(body);
});

server.listen(PORT, () => {
  console.log(`Fixture server listening on http://localhost:${PORT}`);
});
