import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IsolatedBrowser } from '../engine/cdp.js';
import { encodeAnimatedGifFromPngs } from './pure-gif.js';

/**
 * Generates a lightweight 5-second "Crime Scene" Failure Replay GIF locally
 * via Chromium CDP frame capture + ffmpeg palettegen/paletteuse (zero cloud upload).
 *
 * Highlights offending DOM elements with a pulsing red crime-scene bounding box,
 * cat corner badge, and live defect callout ticker across 10 frames @ 2 fps (= 5.0s).
 */

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => {
      reject(new Error(`ffmpeg not found or failed to launch (${err.message}). Install ffmpeg to enable --gif export.`));
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-300)}`));
    });
  });
}

/**
 * Picks up to 5 top failing cats to feature in the 5-second crime-scene replay.
 * @param {import('../../types/index.d.ts').AuditReport} report
 */
function pickCrimeScenes(report) {
  const sevRank = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  const scenes = [];
  for (const cat of report.cats) {
    if (!cat.findings || cat.findings.length === 0) continue;
    const top = [...cat.findings].sort((a, b) => (sevRank[b.severity] ?? 0) - (sevRank[a.severity] ?? 0))[0];
    scenes.push({
      code: cat.code,
      name: cat.name,
      catId: cat.catId,
      severity: top.severity.toUpperCase(),
      title: top.title,
      quip: cat.quips[0] || top.title
    });
  }
  if (scenes.length === 0) {
    return [{
      code: 'OK',
      name: 'All Cats',
      catId: 'clean',
      severity: 'PASS',
      title: 'Zero defects detected — S-Tier site!',
      quip: 'All cats purred in approval!'
    }];
  }
  return scenes.slice(0, 5);
}

/**
 * Exports a 5-second (10 frames @ 2 fps, 960x540) annotated crime-scene GIF to `outputPath`.
 * @param {import('../../types/index.d.ts').AuditReport} report
 * @param {string} outputPath
 */
export async function generateFailureGif(report, outputPath, opts = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawtest-gif-'));
  const browser = new IsolatedBrowser({ chromePath: opts.chromePath });
  const scenes = pickCrimeScenes(report);
  const totalFrames = 10; // 10 frames @ 2 fps = exact 5.0 seconds
  const width = 960;
  const height = 540;

  await browser.launch();
  try {
    const page = await browser.newPage();
    await page.setViewport(width, height, 1, false);
    await page.goto(report.targetUrl, 10000);

    for (let i = 0; i < totalFrames; i++) {
      const scene = scenes[Math.floor((i * scenes.length) / totalFrames) % scenes.length];
      const pulse = i % 2 === 0;
      const elapsedSec = (i * 0.5).toFixed(1);

      await page.evaluate(`((scene, pulse, elapsedSec, scores) => {
        const old = document.getElementById('__pawtest_gif_hud');
        if (old) old.remove();

        // Find a matching offending element to frame with a crime-scene red box
        let targetEl = null;
        if (scene.catId === 'pixel') targetEl = document.querySelector('img, a[href]');
        else if (scene.catId === 'mochi') targetEl = document.querySelector('.overflow-box, .wide-banner, h1');
        else if (scene.catId === 'marmalade' || scene.catId === 'shadow') targetEl = document.querySelector('form, input');
        else if (scene.catId === 'zoomies' || scene.catId === 'sentinel') targetEl = document.querySelector('button');
        else if (scene.catId === 'musebot') targetEl = document.querySelector('div[onclick], button');
        else targetEl = document.querySelector('h1, header, form, body');

        const rect = targetEl ? targetEl.getBoundingClientRect() : { left: 24, top: 24, width: 320, height: 80 };
        const hud = document.createElement('div');
        hud.id = '__pawtest_gif_hud';
        hud.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;';

        const isPass = scene.severity === 'PASS';
        const boxColor = isPass ? '#22c55e' : (pulse ? '#ef4444' : '#f97316');

        // Red crime-scene highlight box around offending element
        const box = document.createElement('div');
        const bx = Math.max(8, Math.min(rect.left - 4, window.innerWidth - 120));
        const by = Math.max(8, Math.min(rect.top - 4, window.innerHeight - 140));
        const bw = Math.max(80, Math.min(rect.width + 8, window.innerWidth - bx - 8));
        const bh = Math.max(36, Math.min(rect.height + 8, window.innerHeight - by - 110));
        box.style.cssText = 'position:fixed;left:' + bx + 'px;top:' + by + 'px;width:' + bw + 'px;height:' + bh + 'px;'
          + 'border:3px solid ' + boxColor + ';border-radius:8px;box-shadow:0 0 0 2px rgba(0,0,0,0.45),0 0 18px ' + boxColor + '88;';
        hud.appendChild(box);

        // Top-right corner cat stamp
        const stamp = document.createElement('div');
        stamp.style.cssText = 'position:fixed;top:14px;right:16px;background:rgba(12,10,9,0.92);color:#fafaf9;border:2px solid ' + boxColor + ';'
          + 'border-radius:12px;padding:8px 14px;font-size:13px;font-weight:800;display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,0.45);';
        stamp.textContent = 'PAWTEST REC ' + elapsedSec + 's  |  Human ' + scores.human.grade + ' (' + scores.human.score + ')  ·  Agent ' + scores.agent.grade + ' (' + scores.agent.score + ')';
        hud.appendChild(stamp);

        // Bottom crime-scene caption bar
        const bar = document.createElement('div');
        bar.style.cssText = 'position:fixed;left:16px;right:16px;bottom:14px;background:rgba(12,10,9,0.94);color:#fafaf9;border:2px solid ' + boxColor + ';'
          + 'border-radius:14px;padding:12px 18px;box-shadow:0 10px 28px rgba(0,0,0,0.55);';
        bar.innerHTML = '<div style="font-size:12px;font-weight:800;letter-spacing:0.08em;color:' + boxColor + ';text-transform:uppercase;">'
          + scene.code + ' · ' + scene.name + ' [' + scene.severity + ']</div>'
          + '<div style="font-size:15px;font-weight:700;margin-top:3px;color:#fff;">' + scene.title.replace(/</g, '&lt;') + '</div>'
          + '<div style="font-size:13px;margin-top:2px;color:#d6d3d1;">' + scene.quip.replace(/</g, '&lt;') + '</div>';
        hud.appendChild(bar);

        document.documentElement.appendChild(hud);
      })(${JSON.stringify(scene)}, ${pulse}, ${JSON.stringify(elapsedSec)}, ${JSON.stringify(report.scores)})`);

      const buf = await page.screenshot({ x: 0, y: 0, width, height });
      fs.writeFileSync(path.join(tmpDir, `frame_${String(i).padStart(2, '0')}.png`), buf);
    }

    await page.close();

    const framePaths = Array.from({ length: totalFrames }, (_, idx) => path.join(tmpDir, `frame_${String(idx).padStart(2, '0')}.png`));
    let encodedViaFfmpeg = false;
    if (!opts.pureJsGif) {
      try {
        const palettePath = path.join(tmpDir, 'palette.png');
        await runFfmpeg([
          '-y', '-framerate', '2', '-i', path.join(tmpDir, 'frame_%02d.png'),
          '-vf', 'scale=800:-1:flags=lanczos,palettegen=stats_mode=diff',
          palettePath
        ]);
        await runFfmpeg([
          '-y', '-framerate', '2', '-i', path.join(tmpDir, 'frame_%02d.png'),
          '-i', palettePath,
          '-lavfi', 'scale=800:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3',
          '-loop', '0',
          outputPath
        ]);
        encodedViaFfmpeg = true;
      } catch {}
    }
    if (!encodedViaFfmpeg) {
      const pngBuffers = framePaths.map((fp) => fs.readFileSync(fp));
      const gifBuf = encodeAnimatedGifFromPngs(pngBuffers, { width: 640, height: 360, delayCs: 50 });
      fs.writeFileSync(outputPath, gifBuf);
    }

    return outputPath;
  } finally {
    await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
