import fs from 'node:fs';
import { IsolatedBrowser } from '../engine/cdp.js';

/**
 * Generates a high-contrast 1200x630 dual-axis PNG share card locally via Chromium CDP
 * featuring Human UX & AI Agent Readiness grades, Baseline Regression Deltas,
 * Agent Token-Tax Meter, top 3 cat verdicts, and squad status pills.
 */

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function gradeColor(grade) {
  switch (grade) {
    case 'S': return { bg: '#052e16', border: '#22c55e', text: '#4ade80' };
    case 'A': return { bg: '#064e3b', border: '#10b981', text: '#34d399' };
    case 'B': return { bg: '#1e3a5f', border: '#38bdf8', text: '#7dd3fc' };
    case 'C': return { bg: '#451a03', border: '#f59e0b', text: '#fbbf24' };
    case 'D': return { bg: '#431407', border: '#fb923c', text: '#fdba74' };
    default:  return { bg: '#450a0a', border: '#ef4444', text: '#fca5a5' };
  }
}

function deltaBadge(n) {
  if (typeof n !== 'number' || n === 0) return '';
  const cls = n > 0 ? 'delta-up' : 'delta-down';
  const sign = n > 0 ? `+${n}` : `${n}`;
  return `<span class="delta ${cls}">${sign}</span>`;
}

export function buildShareCardHtml(report) {
  const h = report.scores.human;
  const a = report.scores.agent;
  const hc = gradeColor(h.grade);
  const ac = gradeColor(a.grade);
  const host = (() => {
    try { return new URL(report.targetUrl).host + new URL(report.targetUrl).pathname; }
    catch { return report.targetUrl; }
  })();

  const pills = report.cats.map((c) => {
    const dot = c.status === 'pass' ? '#22c55e' : c.status === 'warn' ? '#f59e0b' : '#ef4444';
    return `<span class="pill"><i style="background:${dot}"></i><b>${escapeHtml(c.code)}</b> ${escapeHtml(c.name)} <em>${c.score}</em></span>`;
  }).join('');

  const roasts = (report.topRoasts || []).slice(0, 3).map((r) => `<li>${escapeHtml(r)}</li>`).join('');
  const tokenTaxChip = report.tokenTax
    ? `<span class="tax-chip">AI Token-Tax: <b>${report.tokenTax.bloatRatio}x</b> (${report.tokenTax.cleanTokens} tok · MD ${report.tokenTax.supportsMarkdown ? 'ON' : 'OFF'})</span>`
    : '';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1200px; height: 630px; overflow: hidden; background: #0c0a09; color: #fafaf9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .card {
    width: 1200px; height: 630px; padding: 36px 46px;
    background:
      radial-gradient(circle at 12% 14%, rgba(245, 158, 11, 0.18), transparent 42%),
      radial-gradient(circle at 88% 82%, rgba(139, 92, 246, 0.22), transparent 46%),
      linear-gradient(145deg, #14110f 0%, #0c0a09 62%, #13111c 100%);
    display: flex; flex-direction: column; justify-content: space-between;
    border: 2px solid #292524;
  }
  .top { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .paw-badge {
    width: 50px; height: 50px; border-radius: 15px;
    background: linear-gradient(135deg, #f59e0b, #fb7185);
    display: flex; align-items: center; justify-content: center;
    font-size: 24px; font-weight: 900; color: #0c0a09;
    box-shadow: 0 0 28px rgba(245,158,11,0.35);
  }
  .brand h1 { font-size: 26px; letter-spacing: -0.02em; font-weight: 800; }
  .brand p { font-size: 13px; color: #a8a29e; margin-top: 2px; }
  .top-right { display: flex; align-items: center; gap: 10px; }
  .target {
    background: #1c1917; border: 1px solid #44403c; border-radius: 999px;
    padding: 8px 18px; font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 14px; color: #fde68a; max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .tax-chip {
    background: #172554; border: 1px solid #3b82f6; border-radius: 999px;
    padding: 8px 14px; font-size: 13px; color: #dbeafe; white-space: nowrap;
  }
  .tax-chip b { color: #93c5fd; }
  .scores { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-top: 14px; }
  .score-box {
    border-radius: 20px; padding: 22px 26px; display: flex; align-items: center; justify-content: space-between;
    background: #171412; border: 2px solid #292524;
  }
  .score-meta .kicker { font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #a8a29e; font-weight: 700; }
  .score-meta .label { font-size: 25px; font-weight: 800; margin-top: 5px; color: #fafaf9; display: flex; align-items: center; gap: 10px; }
  .score-meta .sub { font-size: 14px; color: #d6d3d1; margin-top: 7px; }
  .delta { font-size: 14px; font-weight: 800; padding: 3px 9px; border-radius: 999px; }
  .delta-up { background: #052e16; color: #4ade80; border: 1px solid #22c55e; }
  .delta-down { background: #450a0a; color: #fca5a5; border: 1px solid #ef4444; }
  .grade-ring {
    width: 108px; height: 108px; border-radius: 22px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    border: 3px solid;
  }
  .grade-ring .letter { font-size: 52px; font-weight: 900; line-height: 1; }
  .grade-ring .num { font-size: 15px; font-weight: 700; margin-top: 4px; opacity: 0.9; }
  .roasts {
    background: rgba(28, 25, 23, 0.88); border: 1px solid #292524; border-radius: 16px;
    padding: 16px 22px; margin-top: 14px;
  }
  .roasts h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #fbbf24; margin-bottom: 8px; }
  .roasts ul { list-style: none; display: flex; flex-direction: column; gap: 6px; }
  .roasts li { font-size: 15px; color: #f5f5f4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .roasts li::before { content: "▸ "; color: #f59e0b; font-weight: 900; }
  .pills { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
  .pill {
    display: inline-flex; align-items: center; gap: 6px;
    background: #1c1917; border: 1px solid #292524; border-radius: 999px;
    padding: 4px 10px; font-size: 12px; color: #e7e5e4;
  }
  .pill i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .pill b { color: #a8a29e; font-weight: 700; }
  .pill em { font-style: normal; color: #fde68a; font-weight: 700; }
  .foot { display: flex; justify-content: space-between; font-size: 13px; color: #78716c; margin-top: 8px; }
</style>
</head>
<body>
  <div class="card">
    <div class="top">
      <div class="brand">
        <div class="paw-badge">16</div>
        <div>
          <h1>PawTest v${escapeHtml(report.version)} · Dual-Axis Scorecard</h1>
          <p>Human UX × AI Agent Readiness (WebMCP · Markdown · UCP/ACP · RFC 9421)</p>
        </div>
      </div>
      <div class="top-right">
        ${tokenTaxChip}
        <div class="target">${escapeHtml(host)}</div>
      </div>
    </div>

    <div class="scores">
      <div class="score-box" style="border-color:${hc.border}55">
        <div class="score-meta">
          <div class="kicker">AXIS 01 · HUMANS</div>
          <div class="label">Human UX ${deltaBadge(report.diff?.humanDelta)}</div>
          <div class="sub">${h.catsRun} cats · ${h.criticalCount} critical · ${h.highCount} high</div>
        </div>
        <div class="grade-ring" style="background:${hc.bg};border-color:${hc.border};color:${hc.text}">
          <div class="letter">${h.grade}</div>
          <div class="num">${h.score}/100</div>
        </div>
      </div>

      <div class="score-box" style="border-color:${ac.border}55">
        <div class="score-meta">
          <div class="kicker">AXIS 02 · AUTONOMOUS AGENTS</div>
          <div class="label">AI Agent Readiness ${deltaBadge(report.diff?.agentDelta)}</div>
          <div class="sub">${a.catsRun} cats · ${a.criticalCount} critical · ${a.highCount} high</div>
        </div>
        <div class="grade-ring" style="background:${ac.bg};border-color:${ac.border};color:${ac.text}">
          <div class="letter">${a.grade}</div>
          <div class="num">${a.score}/100</div>
        </div>
      </div>
    </div>

    <div class="roasts">
      <h2>Top Cat Verdicts</h2>
      <ul>${roasts}</ul>
    </div>

    <div class="pills">${pills}</div>

    <div class="foot">
      <span>npx pawtest ${escapeHtml(host)} · $0 API Cost · Read-Only Sandbox</span>
      <span>${(report.durationMs / 1000).toFixed(2)}s · ${report.cats.length} cats · ${report.sandbox.redactionsApplied} redactions</span>
    </div>
  </div>
</body>
</html>`;
}

export async function generateShareCardPng(report, outputPath, opts = {}) {
  const html = buildShareCardHtml(report);
  const browser = new IsolatedBrowser({ chromePath: opts.chromePath });
  await browser.launch();
  try {
    const page = await browser.newPage();
    await page.setViewport(1200, 630, 1, false);
    await page.setContent(html);
    const pngBuf = await page.screenshot({ x: 0, y: 0, width: 1200, height: 630 });
    fs.writeFileSync(outputPath, pngBuf);
    await page.close();
    return outputPath;
  } finally {
    await browser.close();
  }
}
