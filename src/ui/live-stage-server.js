import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STAGE_HTML_PATH = path.join(__dirname, 'stage.html');

/**
 * Ephemeral local HTTP + Server-Sent Events (SSE) bridge for `pawtest <url> --stage`.
 * Serves `src/ui/stage.html` and streams real-time cat verdicts as each probe completes.
 */
export function startLiveStageServer() {
  const clients = new Set();
  const stageHtml = fs.readFileSync(STAGE_HTML_PATH, 'utf8');

  const server = http.createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://127.0.0.1');
    if (u.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write('event: connected\ndata: {"ok":true}\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(stageHtml);
  });

  const emit = (eventName, payload) => {
    const chunk = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of clients) {
      try { res.write(chunk); } catch {}
    }
  };

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        port: addr.port,
        emitCatComplete: (catReport) => emit('cat-complete', catReport),
        emitAuditComplete: (fullReport) => emit('audit-complete', fullReport),
        close: () => {
          for (const res of clients) {
            try { res.end(); } catch {}
          }
          clients.clear();
          return new Promise((r) => server.close(r));
        }
      });
    });
  });
}
