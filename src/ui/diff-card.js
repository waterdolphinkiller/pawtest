import fs from 'node:fs';
import { IsolatedBrowser } from '../engine/cdp.js';

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function generateDiffCardPng(diff, outputPath, opts = {}) {
  const hostA = (() => { try { const u = new URL(diff.siteA.url); return u.host + (u.pathname && u.pathname !== '/' ? u.pathname : ''); } catch { return diff.siteA.url; } })();
  const hostB = (() => { try { const u = new URL(diff.siteB.url); return u.host + (u.pathname && u.pathname !== '/' ? u.pathname : ''); } catch { return diff.siteB.url; } })();
  const winText = diff.winner === 'tie' ? 'TIE' : diff.winner === 'A' ? `WINNER: ${hostA}` : `WINNER: ${hostB}`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{width:1200px;height:630px;background:#0a0908;color:#faf5ee;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:42px 48px;display:flex;flex-direction:column;justify-content:space-between}
    .top{display:flex;justify-content:space-between;align-items:center}
    .brand{font-size:22px;font-weight:800;letter-spacing:.04em;color:#e7cfa0}
    .win{background:#1b1712;border:1.5px solid #e7cfa0;color:#fde68a;padding:8px 18px;border-radius:999px;font-weight:800;font-size:15px}
    .grid{display:grid;grid-template-columns:1fr 64px 1fr;align-items:center;gap:16px}
    .box{background:#14110f;border:1.5px solid rgba(255,248,238,.14);border-radius:18px;padding:28px}
    .box.w{border-color:#22c55e}
    .host{font-family:Georgia,serif;font-size:28px;margin-bottom:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .row{display:flex;justify-content:space-between;padding:12px 0;border-top:1px solid rgba(255,248,238,.08);font-size:18px}
    .val{font-weight:900;font-size:24px}
    .vs{text-align:center;font-family:Georgia,serif;font-style:italic;font-size:34px;color:#e7cfa0}
    .foot{display:flex;justify-content:space-between;color:#9c9288;font-size:14px;font-family:ui-monospace,Menlo,monospace;border-top:1px solid rgba(255,248,238,.1);padding-top:16px}
  </style></head><body>
    <div class="top">
      <div class="brand">PAWTEST v${esc(diff.version)} · HEAD-TO-HEAD PK</div>
      <div class="win">${esc(winText)}</div>
    </div>
    <div class="grid">
      <div class="box ${diff.winner === 'A' ? 'w' : ''}">
        <div class="host">${esc(hostA)}</div>
        <div class="row"><span>Human UX</span><span class="val" style="color:#4ade80">${diff.siteA.human.grade} · ${diff.siteA.human.score}</span></div>
        <div class="row"><span>AI Agent Readiness</span><span class="val" style="color:#c4b5fd">${diff.siteA.agent.grade} · ${diff.siteA.agent.score}</span></div>
        <div class="row"><span>Agent Funnel Survival</span><span class="val" style="color:#fde68a">${diff.siteA.survivalPct ?? '—'}%</span></div>
      </div>
      <div class="vs">vs</div>
      <div class="box ${diff.winner === 'B' ? 'w' : ''}">
        <div class="host">${esc(hostB)}</div>
        <div class="row"><span>Human UX</span><span class="val" style="color:#4ade80">${diff.siteB.human.grade} · ${diff.siteB.human.score}</span></div>
        <div class="row"><span>AI Agent Readiness</span><span class="val" style="color:#c4b5fd">${diff.siteB.agent.grade} · ${diff.siteB.agent.score}</span></div>
        <div class="row"><span>Agent Funnel Survival</span><span class="val" style="color:#fde68a">${diff.siteB.survivalPct ?? '—'}%</span></div>
      </div>
    </div>
    <div class="foot">
      <span>$ npx pawtest diff ${esc(hostA)} ${esc(hostB)}</span>
      <span>16 Pure-Code Optical Cats · $0 LLM API Cost</span>
    </div>
  </body></html>`;

  const browser = new IsolatedBrowser({ chromePath: opts.chromePath });
  await browser.launch();
  try {
    const page = await browser.newPage();
    await page.setViewport(1200, 630, 1, false);
    await page.setContent(html);
    const buf = await page.screenshot({ x: 0, y: 0, width: 1200, height: 630 });
    fs.writeFileSync(outputPath, buf);
    await page.close();
    return outputPath;
  } finally {
    await browser.close();
  }
}
