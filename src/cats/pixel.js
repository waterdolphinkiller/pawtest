/**
 * A4 · Pixel (Ragdoll) — Broken Links, Broken Images, 404/500 Requests, Console Errors & Dead Buttons.
 * Squad A | Human UX | Default Fast Mode
 */

export const meta = {
  id: 'pixel',
  code: 'A4',
  name: 'Pixel',
  title: '布偶猫 · 死链裂图报错',
  squad: 'A',
  axis: 'human',
  mode: 'fast',
  color: '#38bdf8',
  accentColor: '#ef4444',
  prop: 'Red Laser Tracking Beam',
  description: 'Broken links, broken images, HTTP 404/500 requests, console errors & inert fake buttons.'
};

export async function run(ctx) {
  const { page, targetUrl } = ctx;
  const findings = [];
  const quips = [];

  const domAudit = await page.evaluate(`(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    const brokenImages = imgs
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.getAttribute('src') || '(empty src)');

    const links = Array.from(document.querySelectorAll('a[href]'))
      .map((a) => ({ href: a.getAttribute('href') || '', text: (a.textContent || '').trim().slice(0, 40) }))
      .filter((l) => l.href && !l.href.startsWith('#') && !l.href.startsWith('mailto:') && !l.href.startsWith('tel:'));

    const deadButtons = Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter((btn) => {
        if (btn.disabled || btn.closest('form')) return false;
        const hasInline = !!(btn.getAttribute('onclick') || btn.getAttribute('href') || btn.dataset.action);
        const type = btn.getAttribute('type');
        return !hasInline && type !== 'submit' && btn.dataset.inert === 'true';
      })
      .map((btn) => (btn.textContent || '').trim().slice(0, 32));

    return {
      imageCount: imgs.length,
      brokenImages,
      links: links.slice(0, 12),
      deadButtons
    };
  })()`);

  // Probe same-origin links with lightweight HEAD/GET
  const origin = new URL(targetUrl).origin;
  const brokenLinks = [];
  for (const link of domAudit.links) {
    try {
      const resolved = new URL(link.href, targetUrl);
      if (resolved.origin !== origin) continue;
      const res = await fetch(resolved.href, { method: 'GET', redirect: 'follow' });
      if (res.status >= 400) {
        brokenLinks.push(`${resolved.pathname} (${res.status})`);
      }
    } catch {
      brokenLinks.push(`${link.href} (network error)`);
    }
  }

  const failedNetwork = [];
  for (const req of page.requests.values()) {
    if (req.failed || (req.status && req.status >= 400)) {
      failedNetwork.push(`${req.status || 'ERR'} ${req.url}`);
    }
  }

  const consoleErrors = page.consoleMessages.filter((m) => m.type === 'error').map((m) => m.text);
  const pageErrors = [...page.pageErrors];

  if (domAudit.brokenImages.length > 0) {
    findings.push({
      id: 'pixel-broken-images',
      severity: 'high',
      axis: 'human',
      title: `${domAudit.brokenImages.length} broken image(s) failed to load`,
      detail: `Images with naturalWidth === 0: ${domAudit.brokenImages.slice(0, 5).join(', ')}`,
      fixHint: 'Verify image URLs, build asset paths, and add fallback/onerror handling.'
    });
    quips.push(`Chased the laser beam straight into ${domAudit.brokenImages.length} broken image(s)!`);
  }

  if (brokenLinks.length > 0) {
    findings.push({
      id: 'pixel-broken-links',
      severity: 'high',
      axis: 'human',
      title: `${brokenLinks.length} dead internal link(s) returned 4xx/5xx`,
      detail: `Dead links: ${brokenLinks.slice(0, 5).join(', ')}`,
      fixHint: 'Fix or remove broken routes and configure proper redirects.'
    });
    if (!quips.length) quips.push(`Found ${brokenLinks.length} dead link(s) leading to 404 black holes.`);
  }

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    findings.push({
      id: 'pixel-console-errors',
      severity: 'high',
      axis: 'human',
      title: `${consoleErrors.length + pageErrors.length} runtime console/page error(s)`,
      detail: [...pageErrors, ...consoleErrors].slice(0, 4).join(' | '),
      fixHint: 'Inspect DevTools console stack traces and guard undefined accesses or failed API calls.'
    });
    if (!quips.length) quips.push(`Console is bleeding ${consoleErrors.length + pageErrors.length} uncaught error(s)!`);
  }

  if (failedNetwork.length > 0 && brokenLinks.length === 0 && domAudit.brokenImages.length === 0) {
    findings.push({
      id: 'pixel-failed-requests',
      severity: 'medium',
      axis: 'human',
      title: `${failedNetwork.length} subresource request(s) returned 4xx/5xx`,
      detail: failedNetwork.slice(0, 4).join(', '),
      fixHint: 'Resolve missing static assets or failing API endpoints.'
    });
  }

  if (domAudit.deadButtons.length > 0) {
    findings.push({
      id: 'pixel-dead-buttons',
      severity: 'medium',
      axis: 'human',
      title: `${domAudit.deadButtons.length} inert/fake button(s) detected`,
      detail: `Buttons without active handlers: ${domAudit.deadButtons.join(', ')}`,
      fixHint: 'Wire real click handlers or remove placeholder buttons before shipping.'
    });
  }

  if (quips.length === 0) {
    quips.push(`Laser-scanned ${domAudit.links.length} links & ${domAudit.imageCount} images — zero 404s or console errors.`);
  }

  return {
    findings,
    quips,
    metrics: {
      brokenImages: domAudit.brokenImages.length,
      brokenLinks: brokenLinks.length,
      consoleErrors: consoleErrors.length,
      pageErrors: pageErrors.length,
      failedNetwork: failedNetwork.length
    }
  };
}
