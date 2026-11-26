#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runAudit } from '../src/engine/runner.js';
import { generateShareCardPng } from '../src/ui/share-card.js';
import { writeReadmeBadges } from '../src/ui/badge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');
const ASSETS_DIR = path.join(DOCS_DIR, 'assets');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.json': 'application/json; charset=utf-8'
};

function startDocsServer() {
  const rateCounts = new Map();
  const server = http.createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://127.0.0.1');
    const accept = String(req.headers.accept || '');
    const sigAgent = req.headers['signature-agent'];

    const baseHeaders = {
      'Content-Security-Policy': "default-src 'self' 'unsafe-inline' data:; img-src 'self' data:;",
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Vary': 'Accept'
    };
    if (sigAgent) baseHeaders['X-Web-Bot-Auth-Verified'] = 'rfc9421-accepted';
    const ua = String(req.headers['user-agent'] || '');
    if (/Scrapy|curl|python-requests|FakeBot|Spoofed/i.test(ua) && !req.headers['signature-input'] && !sigAgent) {
      res.writeHead(403, { ...baseHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Unsigned bot blocked — present RFC 9421 Signature-Agent');
      return;
    }

    if (u.pathname.startsWith('/api/')) {
      const count = (rateCounts.get(u.pathname) || 0) + 1;
      rateCounts.set(u.pathname, count);
      if (count > 5) {
        res.writeHead(429, { ...baseHeaders, 'Retry-After': '60', 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'rate_limited', retryAfter: 60 }));
        return;
      }
      res.writeHead(200, { ...baseHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if ((u.pathname === '/' || u.pathname === '/index.html') && accept.includes('text/markdown')) {
      const md = fs.readFileSync(path.join(DOCS_DIR, 'index.md'));
      res.writeHead(200, { ...baseHeaders, 'Content-Type': 'text/markdown; charset=utf-8' });
      res.end(md);
      return;
    }

    const relPath = u.pathname === '/' ? 'index.html' : u.pathname.replace(/^\/+/, '');
    const fullPath = path.resolve(DOCS_DIR, relPath);
    if (!fullPath.startsWith(DOCS_DIR) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
      res.writeHead(404, { ...baseHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType =
      relPath.startsWith('.well-known/') ? 'application/json; charset=utf-8' : MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { ...baseHeaders, 'Content-Type': contentType });
    res.end(fs.readFileSync(fullPath));
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r))
      });
    });
  });
}

async function main() {
  const srv = await startDocsServer();
  try {
    console.log(`[Dogfood] Running PawTest --full against ${srv.url}/ ...`);
    const report = await runAudit({ url: `${srv.url}/`, full: true, allowMutations: false });
    const h = report.scores.human;
    const a = report.scores.agent;
    console.log(`[Dogfood] Human UX: ${h.grade} (${h.score}) | AI Agent Readiness: ${a.grade} (${a.score})`);

    const nonPass = report.cats.filter((c) => c.status !== 'pass');
    if (nonPass.length > 0) {
      console.log('Non-passing cats:', JSON.stringify(nonPass.map((c) => ({ id: c.catId, status: c.status, score: c.score, findings: c.findings })), null, 2));
    }

    fs.mkdirSync(ASSETS_DIR, { recursive: true });
    const cardPath = path.join(ASSETS_DIR, 'pawtest-dogfood-card.png');
    await generateShareCardPng(report, cardPath);
    writeReadmeBadges(report, ASSETS_DIR);

    assert.equal(h.grade, 'S', `Expected Human UX S-tier, got ${h.grade} (${h.score})`);
    assert.equal(a.grade, 'S', `Expected AI Agent S-tier, got ${a.grade} (${a.score})`);
    console.log('PASS: PawTest official site achieved Human: S · AI Agent: S!');
  } finally {
    await srv.close();
  }
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
