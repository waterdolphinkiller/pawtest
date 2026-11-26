import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAudit } from '../src/engine/runner.js';
import { parseArgs } from '../src/cli.js';
import { generateFailureGif } from '../src/ui/failure-gif.js';
import { applyFixScaffolds } from '../src/engine/scaffolder.js';
import { resolveEffectivePolicy } from '../src/engine/config.js';
import { generateMarkdownReport } from '../src/engine/reporter.js';

test('v2.4.0 Unit: Site presets (blog/saas/docs/ecommerce) & CLI arg parser', () => {
  const blogPolicy = resolveEffectivePolicy({ preset: 'blog' });
  assert.equal(blogPolicy.preset, 'blog');
  assert.equal(blogPolicy.ignoreFindings.has('lucky-missing-ucp'), true);
  assert.equal(blogPolicy.ignoreFindings.has('musebot-no-webmcp'), true);

  const parsed = parseArgs([
    'https://example.com',
    '--preset', 'saas',
    '--header', 'Authorization: Bearer secret-token-123',
    '--header', 'X-Tenant: acme',
    '--flow', './flow.json',
    '--save-storage', './session.json',
    '--apply-scaffolds', './public',
    '--pure-js-gif'
  ]);
  assert.equal(parsed.preset, 'saas');
  assert.equal(parsed.extraHeaders.Authorization, 'Bearer secret-token-123');
  assert.equal(parsed.extraHeaders['X-Tenant'], 'acme');
  assert.equal(parsed.flowPath, './flow.json');
  assert.equal(parsed.saveStoragePath, './session.json');
  assert.equal(parsed.applyScaffoldsDir, './public');
  assert.equal(parsed.pureJsGif, true);
});

test('v2.4.0 E2E: Presets, Auth --header + --save-storage, Multi-step --flow, Pure-JS GIF fallback & --apply-scaffolds', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawtest-v24-'));
  const server = http.createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://127.0.0.1');
    const auth = req.headers.authorization || '';

    if (u.pathname === '/protected') {
      if (auth !== 'Bearer pawtest-secret-999') {
        res.writeHead(401, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>401 Unauthorized</h1></body></html>');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Set-Cookie': 'paw_session=ok123; Path=/'
      });
      res.end(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>SaaS Dashboard</title></head>
<body>
  <h1>Authenticated Workspace</h1>
  <p>Welcome to your private SaaS dashboard with full authenticated access and search funnel controls.</p>
  <form id="workspace_search"><input id="q" name="query_term" type="text" required aria-label="Search query" /><button id="go" type="button" onclick="document.getElementById('res').textContent='Found: '+document.getElementById('q').value">Run Search</button></form>

  <div id="res"></div>
</body>
</html>`);
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const saveStoragePath = path.join(tmpDir, 'saved-session.json');
    const report = await runAudit({
      url: `${baseUrl}/protected`,
      cats: ['robocat', 'musebot', 'lucky'],
      preset: 'blog',
      extraHeaders: { Authorization: 'Bearer pawtest-secret-999' },
      saveStoragePath,
      flowSteps: [
        { name: 'Fill Search', action: 'fill', selector: '#q', value: 'optical-cat' },
        { name: 'Run Search', action: 'click', selector: '#go' },
        { name: 'Verify Output', action: 'assertText', text: 'Found: optical-cat' }
      ]
    });

    // 1. Authenticated access succeeded (HTTP 200, not 401)
    assert.equal(report.mainHttpStatus, 200);
    assert.equal(report.sandbox.authenticated, true);

    // 2. Blog preset filtered out ecommerce-only findings (lucky-missing-ucp, musebot-no-webmcp)
    const ids = report.cats.flatMap((c) => c.findings.map((f) => f.id));
    assert.equal(report.preset, 'blog');
    assert.ok(!ids.includes('lucky-missing-ucp'), 'Blog preset should suppress lucky-missing-ucp');
    assert.ok(!ids.includes('musebot-no-webmcp'), 'Blog preset should suppress musebot-no-webmcp');
    assert.ok(report.ignoredFindingCount >= 2, 'Expected suppressed findings count >= 2');

    // 3. Multi-step funnel executed cleanly (3 user steps + 1 terminal DOM/AXTree audit)
    assert.equal(report.flowResults.length, 4);
    const md = generateMarkdownReport(report);
    assert.ok(md.includes('Multi-Step Funnel Results') && md.includes('Final Funnel State Audit'), 'Expected funnel table in report.md');
    assert.ok(report.flowResults.every((s) => s.status === 'pass'), `Expected all flow steps to pass: ${JSON.stringify(report.flowResults)}`);

    // 4. --save-storage captured cookie cleanly
    assert.ok(fs.existsSync(saveStoragePath), 'Expected saved storage state file');
    const saved = JSON.parse(fs.readFileSync(saveStoragePath, 'utf8'));
    assert.ok(saved.cookies.some((c) => c.name === 'paw_session'), 'Expected paw_session cookie captured');

    // 5. Pure-JS GIF89a encoder works with ZERO ffmpeg dependency
    const gifPath = path.join(tmpDir, 'pure-js-5s.gif');
    await generateFailureGif(report, gifPath, { pureJsGif: true });
    const gifBuf = fs.readFileSync(gifPath);
    assert.equal(gifBuf.subarray(0, 6).toString('ascii'), 'GIF89a', 'Expected valid GIF89a header');
    assert.ok(gifBuf.length > 5000, `Expected non-trivial animated GIF, got ${gifBuf.length} bytes`);

    // 6. --apply-scaffolds writes ready-to-commit llms.txt directly to disk
    const scaffoldDir = path.join(tmpDir, 'scaffolds');
    const created = applyFixScaffolds(report, scaffoldDir);
    assert.ok(created.some((x) => x.path.endsWith('llms.txt') && x.status === 'created'), 'Expected llms.txt scaffolded');
    assert.ok(fs.existsSync(path.join(scaffoldDir, 'llms.txt')));
    // Also verify form-aware WebMCP scaffolding when musebot-no-webmcp is present
    const formScaffoldDir = path.join(tmpDir, 'webmcp-scaffolds');
    const ecomReport = await runAudit({ url: `${baseUrl}/protected`, cats: ['musebot'], preset: 'ecommerce', extraHeaders: { Authorization: 'Bearer pawtest-secret-999' } });
    applyFixScaffolds(ecomReport, formScaffoldDir);
    const wmCode = fs.readFileSync(path.join(formScaffoldDir, 'webmcp-register.js'), 'utf8');
    assert.ok(wmCode.includes('workspace_search') && wmCode.includes('query_term'), 'Expected form-aware WebMCP schema inference');
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
