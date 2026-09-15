import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

export interface FixtureServer {
  url: string;
  close: () => Promise<void>;
}

/** Serves test/fixtures/** on an ephemeral port, for browser-driven tests that need a
 * real HTTP origin (Playwright can't navigate to a bare file:// path the way capture
 * relies on — page.exposeBinding and same-origin link resolution both need a real origin). */
export function serveFixtures(): Promise<FixtureServer> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const parsed = new URL(req.url ?? '/', 'http://localhost');

      // Delayed-response endpoint: GET /slow?ms=1500 answers after that many ms. Lets a
      // fixture model a data fetch that keeps the page's network non-idle for a stretch.
      if (parsed.pathname === '/slow') {
        const ms = Math.min(Number(parsed.searchParams.get('ms')) || 0, 10_000);
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{}');
        }, ms);
        return;
      }

      const file = path.join(FIXTURES_DIR, parsed.pathname.replace(/^\/+/, ''));
      if (!file.startsWith(FIXTURES_DIR) || !fs.existsSync(file)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fs.readFileSync(file));
    });
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://localhost:${port}`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}
