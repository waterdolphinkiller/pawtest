#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { IsolatedBrowser } from '../src/engine/cdp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(ROOT, 'docs', 'assets');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-300)))));
  });
}

const COVER_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:1280px;height:640px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
background:radial-gradient(circle at 80% 25%,#3b1d0a 0%,#141110 52%,#0c0a09 100%);color:#faf6f1;padding:54px 64px;display:flex;flex-direction:column;justify-content:space-between}
.top{display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:18px}
.badge{width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,#f59e0b,#fb7185,#8b5cf6);color:#111;font-weight:900;font-size:28px;display:grid;place-items:center}
.tag{background:#221c18;border:1.5px solid #443931;color:#fde68a;padding:10px 18px;border-radius:999px;font-weight:800;font-size:18px}
.mid{display:grid;grid-template-columns:1.25fr 0.75fr;gap:40px;align-items:center}
h1{font-size:60px;line-height:1.06;font-weight:900;letter-spacing:-0.02em}
h1 span{color:#f59e0b}
p{margin-top:18px;font-size:24px;color:#cfc5bb;line-height:1.45}
.scores{display:flex;flex-direction:column;gap:18px}
.sc{background:rgba(28,23,20,.92);border:2px solid #22c55e;border-radius:20px;padding:22px 26px;display:flex;align-items:center;justify-content:space-between}
.sc.ag{border-color:#8b5cf6}
.sc .k{font-size:15px;text-transform:uppercase;letter-spacing:.1em;color:#a8a29e;font-weight:800}
.sc .v{font-size:44px;font-weight:900;color:#4ade80}
.sc.ag .v{color:#c4b5fd}
.bot{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #332c27;padding-top:20px}
.cmd{background:#181412;border:1.5px solid #3f352e;border-radius:12px;padding:12px 18px;font-family:ui-monospace,Menlo,monospace;font-size:18px;color:#fbbf24;font-weight:700;white-space:nowrap}
.pills{display:flex;gap:10px}
.p{background:#241e1a;border:1px solid #3d342e;border-radius:10px;padding:8px 14px;font-size:16px;font-weight:700;color:#e7e5e4}
</style></head><body>
<div class="top">
  <div class="brand"><div class="badge">16</div><div><div style="font-size:28px;font-weight:900">PawTest</div><div style="font-size:16px;color:#a8a29e">16 Pure-Code Optical Cat QA Agents</div></div></div>
  <div class="tag">Zero-Config · $0 LLM API Cost · MIT</div>
</div>
<div class="mid">
  <div>
    <h1>Audit <span>Human UX</span> &amp; <span>AI Agent Readiness</span> in One Command</h1>
    <p>Deterministic CDP sandbox + 3-tool MCP Server for Claude Code &amp; Cursor. Checks WCAG 2.2, Secret Leaks, Token-Tax, WebMCP, Prompt Injection, UCP/ACP &amp; RFC 9421.</p>
  </div>
  <div class="scores">
    <div class="sc"><div><div class="k">Human UX Score</div><div style="font-size:15px;color:#d6d3d1;margin-top:4px">Squads A · B · C</div></div><div class="v">S · 100</div></div>
    <div class="sc ag"><div><div class="k">AI Agent Readiness</div><div style="font-size:15px;color:#d6d3d1;margin-top:4px">WebMCP · PI · UCP · 9421</div></div><div class="v">S · 100</div></div>
  </div>
</div>
<div class="bot">
  <div class="cmd">$ npx pawtest https://your-site.com --viral</div>
  <div class="pills"><div class="p">16 Crystal Cats</div><div class="p">MCP 3-Tool</div><div class="p">Zero Upload</div></div>
</div>
</body></html>`;

async function generateCoverAndHero() {
  const browser = new IsolatedBrowser();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawtest-launch-'));
  await browser.launch();
  try {
    const page = await browser.newPage();
    const coverPath = path.join(ASSETS_DIR, 'social-cover-1280x640.png');
    await page.setViewport(1280, 640, 1, false);
    await page.setContent(COVER_HTML);
    const coverPng = await page.screenshot({ x: 0, y: 0, width: 1280, height: 640 });
    fs.writeFileSync(coverPath, coverPng);
    console.log('Generated 1280x640 cover:', coverPath);

    // 5-second Hero GIF (10 frames @ 2 fps)
    await page.setViewport(960, 540, 1, false);
    const cats = [
      ['A1 Marmalade', 'Form Fuzzing & XSS', '#f59e0b', 18],
      ['A2 Zoomies', '3G & Click Idempotency', '#38bdf8', 31],
      ['A3 Mochi', '375px Mobile & 175% Font', '#f472b6', 44],
      ['C1 Vault', 'Secret Leaks & CSP/HSTS', '#34d399', 58],
      ['C2 RoboCat', 'llms.txt & Token-Tax', '#22d3ee', 69],
      ['D1 MuseBot', 'AXTree & W3C WebMCP', '#a78bfa', 78],
      ['D2 Antidote', 'Prompt Injection & Unicode', '#a3e635', 86],
      ['D3 Sentinel', 'Confirm Gates & 429', '#fb923c', 92],
      ['D4 Lucky', 'UCP / ACP & RFC 9421', '#fde047', 97],
      ['ALL 16 CATS', 'Human UX: S (100) · AI Agent: S (100)', '#4ade80', 100]
    ];

    for (let i = 0; i < cats.length; i++) {
      const [name, desc, color, pct] = cats[i];
      const frameHtml = `<!doctype html><html><body style="margin:0;width:960px;height:540px;background:#0f0d0c;color:#faf6f1;font-family:-apple-system,sans-serif;display:flex;flex-direction:column;justify-content:space-between;padding:42px 50px;box-sizing:border-box">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:24px;font-weight:900;color:#f59e0b">PawTest Live 16-Cat QA</div>
          <div style="font-family:monospace;font-size:17px;color:#a8a29e">npx pawtest https://pawtest.dev --full</div>
        </div>
        <div style="background:#1b1715;border:2px solid ${color};border-radius:22px;padding:34px 38px">
          <div style="font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:${color};font-weight:800">ACTIVE OPTICAL PROBE (${i + 1}/10)</div>
          <div style="font-size:48px;font-weight:900;margin-top:8px">${name}</div>
          <div style="font-size:24px;color:#d6d3d1;margin-top:10px">${desc}</div>
          <div style="margin-top:26px;height:16px;background:#292524;border-radius:999px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${color}"></div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:18px;color:#a8a29e">
          <span>Zero LLM API Cost · Local CDP Sandbox</span>
          <span style="color:#4ade80;font-weight:800">${pct}% Complete</span>
        </div>
      </body></html>`;
      await page.setContent(frameHtml);
      const frameBuf = await page.screenshot({ x: 0, y: 0, width: 960, height: 540 });
      fs.writeFileSync(path.join(tmpDir, `frame_${String(i).padStart(2, '0')}.png`), frameBuf);
    }

    await page.close();
    const palettePath = path.join(tmpDir, 'palette.png');
    const gifPath = path.join(ASSETS_DIR, 'hero-5s.gif');
    await runFfmpeg(['-y', '-framerate', '2', '-i', path.join(tmpDir, 'frame_%02d.png'), '-vf', 'palettegen=stats_mode=diff', palettePath]);
    await runFfmpeg(['-y', '-framerate', '2', '-i', path.join(tmpDir, 'frame_%02d.png'), '-i', palettePath, '-lavfi', 'paletteuse=dither=bayer', gifPath]);
    console.log('Generated 5-second Hero GIF:', gifPath);
  } finally {
    await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

generateCoverAndHero().catch((err) => {
  console.error(err);
  process.exit(1);
});
