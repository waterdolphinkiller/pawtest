#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAudit } from '../src/engine/runner.js';
import { startFixtureServer } from '../test/fixture-server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const TOP_20_SITES = [
  'https://anthropic.com',
  'https://openai.com',
  'https://stripe.com',
  'https://shopify.com',
  'https://vercel.com',
  'https://cloudflare.com',
  'https://github.com/explore',
  'https://nodejs.org',
  'https://playwright.dev',
  'https://developer.mozilla.org',
  'https://supabase.com',
  'https://linear.app',
  'https://figma.com',
  'https://notion.so',
  'https://airbnb.com',
  'https://amazon.com',
  'https://ebay.com',
  'https://etsy.com',
  'https://target.com',
  'https://walmart.com'
];

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildLeaderboardHtml(rows, generatedAt) {
  const trs = rows
    .map(
      (r, idx) => `<tr>
        <td>#${idx + 1}</td>
        <td><code>${escapeHtml(r.url)}</code></td>
        <td><strong>${r.humanGrade}</strong> (${r.humanScore})</td>
        <td><strong>${r.agentGrade}</strong> (${r.agentScore})</td>
        <td>${r.tokenTax || '—'}</td>
        <td>${escapeHtml(r.waf || 'None')}</td>
      </tr>`
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>PawTest 2026 AI Agent Readiness Leaderboard</title>
  <style>
    body{margin:0;background:#070606;color:#faf5ee;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:40px 24px}
    .wrap{max-width:1040px;margin:0 auto}
    h1{font-family:Georgia,serif;font-weight:300;font-size:2.4rem;margin:0 0 8px}
    p{color:#a89f96;margin:0 0 28px}
    table{width:100%;border-collapse:collapse;background:#110f0e;border:1px solid rgba(255,248,238,.12);border-radius:12px;overflow:hidden}
    th,td{padding:14px 16px;text-align:left;border-bottom:1px solid rgba(255,248,238,.08);font-size:14px}
    th{color:#e7cfa0;font-family:ui-monospace,Menlo,monospace;font-size:12px;text-transform:uppercase;letter-spacing:.08em}
    code{color:#fde68a}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>2026 AI Agent Readiness Leaderboard</h1>
    <p>Audited with PawTest v2.7.0 (read-only sandbox, $0 LLM API cost) · Generated ${escapeHtml(generatedAt)}</p>
    <table>
      <thead><tr><th>Rank</th><th>Website</th><th>Human UX</th><th>AI Agent</th><th>Token-Tax</th><th>WAF / Anti-Bot</th></tr></thead>
      <tbody>${trs}</tbody>
    </table>
  </div>
</body>
</html>`;
}

async function main() {
  const args = process.argv.slice(2);
  const localSmoke = args.includes('--local-smoke');
  const outDir = path.join(ROOT, 'pawtest-report');
  fs.mkdirSync(outDir, { recursive: true });

  let fixture = null;
  let targets = TOP_20_SITES;
  if (localSmoke) {
    fixture = await startFixtureServer();
    targets = [`${fixture.baseUrl}/clean`, `${fixture.baseUrl}/buggy`];
  } else {
    const custom = args.filter((a) => /^https?:\/\//i.test(a));
    if (custom.length > 0) targets = custom;
  }

  const rows = [];
  try {
    for (const url of targets) {
      console.log(`[Benchmark] Auditing ${url} ...`);
      try {
        const rep = await runAudit({ url, full: true, allowMutations: false, blockLocalhost: !localSmoke });
        const lucky = rep.cats.find((c) => c.catId === 'lucky');
        rows.push({
          url,
          humanScore: rep.scores.human.score,
          humanGrade: rep.scores.human.grade,
          agentScore: rep.scores.agent.score,
          agentGrade: rep.scores.agent.grade,
          combined: rep.scores.human.score + rep.scores.agent.score,
          tokenTax: rep.tokenTax ? `${rep.tokenTax.bloatRatio}x (MD ${rep.tokenTax.supportsMarkdown ? 'ON' : 'OFF'})` : '—',
          waf: lucky?.metrics?.wafDetected || 'None'
        });
      } catch (err) {
        rows.push({ url, humanScore: 0, humanGrade: 'F', agentScore: 0, agentGrade: 'F', combined: 0, tokenTax: 'ERR', waf: err.message.slice(0, 40) });
      }
    }
  } finally {
    if (fixture) await fixture.close();
  }

  rows.sort((a, b) => b.combined - a.combined);
  const generatedAt = new Date().toISOString();

  fs.writeFileSync(path.join(outDir, 'leaderboard.json'), JSON.stringify({ generatedAt, rows }, null, 2));
  const md = [
    '# PawTest 2026 AI Agent Readiness Leaderboard',
    '',
    '| Rank | Website | Human UX | AI Agent | Token-Tax | WAF / Anti-Bot |',
    '| :---: | :--- | :---: | :---: | :---: | :--- |',
    ...rows.map((r, i) => `| #${i + 1} | ${r.url} | **${r.humanGrade}** (${r.humanScore}) | **${r.agentGrade}** (${r.agentScore}) | ${r.tokenTax} | ${r.waf} |`)
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(outDir, 'leaderboard.md'), md);

  if (!localSmoke) {
    fs.writeFileSync(path.join(ROOT, 'docs', 'leaderboard.html'), buildLeaderboardHtml(rows, generatedAt));
  } else {
    fs.writeFileSync(path.join(outDir, 'leaderboard.html'), buildLeaderboardHtml(rows, generatedAt));
  }
  console.log(`Generated leaderboard (${rows.length} sites) in ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
