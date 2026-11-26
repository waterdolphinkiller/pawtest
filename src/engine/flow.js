import { isMutationBlocked } from './sandbox.js';

/**
 * Lightweight Multi-Step Funnel Runner (`--flow <flow.json>`).
 * Executes a short declarative sequence of steps (`goto`, `fill`, `click`, `wait`, `assertText`)
 * inside an isolated CDP page while respecting read-only mutation guardrails.
 */

export async function runFunnelFlow({ browser, startUrl, steps = [], extraHeaders = null, storageState = null, allowMutations = false, timeoutMs = 8000 }) {
  if (!Array.isArray(steps) || steps.length === 0) return [];
  const results = [];
  const page = await browser.newPage();

  try {
    if (extraHeaders && Object.keys(extraHeaders).length > 0) {
      await page.setExtraHeaders(extraHeaders);
    }
    if (storageState?.cookies?.length) {
      const origin = new URL(startUrl).origin;
      for (const ck of storageState.cookies) {
        if (!ck.name) continue;
        await page.cdp.send('Network.setCookie', {
          name: String(ck.name),
          value: String(ck.value ?? ''),
          url: ck.url || origin,
          path: ck.path || '/'
        }).catch(() => {});
      }
    }

    await page.goto(startUrl, Math.min(timeoutMs, 10000));

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i] || {};
      const name = step.name || `Step ${i + 1} (${step.action || 'unknown'})`;
      const t0 = Date.now();
      try {
        const action = String(step.action || '').toLowerCase();

        if (action === 'goto' && step.url) {
          const nextUrl = new URL(step.url, startUrl).toString();
          await page.goto(nextUrl, Math.min(timeoutMs, 10000));
        } else if (action === 'wait') {
          await new Promise((r) => setTimeout(r, Math.min(Number(step.ms) || 300, 5000)));
        } else if (action === 'fill' && step.selector) {
          const ok = await page.evaluate(`((sel, val) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            el.focus();
            el.value = String(val ?? '');
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          })(${JSON.stringify(step.selector)}, ${JSON.stringify(step.value ?? '')})`);
          if (!ok) throw new Error(`Selector not found for fill: "${step.selector}"`);
        } else if (action === 'click' && step.selector) {
          const label = await page.evaluate(`((sel) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            return (el.textContent || el.getAttribute('aria-label') || el.getAttribute('value') || '').trim();
          })(${JSON.stringify(step.selector)})`);
          if (label === null) throw new Error(`Selector not found for click: "${step.selector}"`);
          if (isMutationBlocked(label, allowMutations)) {
            throw new Error(`Read-only guardrail blocked destructive click "${label}". Pass --allow-mutations to override.`);
          }
          await page.evaluate(`((sel) => { document.querySelector(sel)?.click(); })(${JSON.stringify(step.selector)})`);
          await new Promise((r) => setTimeout(r, 200));
        } else if (action === 'asserttext' && step.text) {
          const found = await page.evaluate(`((txt) => (document.body?.innerText || '').toLowerCase().includes(String(txt).toLowerCase()))(${JSON.stringify(step.text)})`);
          if (!found) throw new Error(`Expected text "${step.text}" not visible in page body`);
        } else {
          throw new Error(`Unsupported or incomplete flow action: "${step.action}"`);
        }

        const curUrl = await page.evaluate('window.location.href').catch(() => startUrl);
        results.push({ step: i + 1, name, action, status: 'pass', url: curUrl, durationMs: Date.now() - t0 });
      } catch (err) {
        results.push({ step: i + 1, name, action: step.action || 'unknown', status: 'fail', error: err.message, durationMs: Date.now() - t0 });
        break;
      }
    }
    // Final-state DOM & AXTree health verification on the terminal funnel page
    const allStepsPassed = results.length > 0 && results.every((r) => r.status === 'pass');
    if (allStepsPassed) {
      const t0 = Date.now();
      const [axNodes, domHealth] = await Promise.all([
        page.getAccessibilityTree().catch(() => []),
        page.evaluate(`(() => {
          const brokenImages = Array.from(document.querySelectorAll('img')).filter((img) => img.complete && img.naturalWidth === 0).length;
          return { brokenImages, title: document.title || '' };
        })()`).catch(() => ({ brokenImages: 0, title: '' }))
      ]);
      const namedAx = axNodes.filter((n) => ['button', 'link', 'textbox'].includes(n.role?.value) && (n.name?.value || '').trim()).length;
      const errCount = (page.pageErrors || []).length;
      const ok = domHealth.brokenImages === 0 && errCount === 0;
      results.push({
        step: results.length + 1,
        name: 'Final Funnel State Audit (DOM + AXTree)',
        action: 'finalAudit',
        status: ok ? 'pass' : 'fail',
        url: await page.evaluate('window.location.href').catch(() => startUrl),
        durationMs: Date.now() - t0,
        metrics: { brokenImages: domHealth.brokenImages, pageErrors: errCount, namedAxControls: namedAx },
        ...(ok ? {} : { error: `Terminal state defects: ${domHealth.brokenImages} broken image(s), ${errCount} console error(s)` })
      });
    }
  } finally {
    await page.close().catch(() => {});
  }

  return results;
}
