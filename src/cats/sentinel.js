/**
 * D3 · Sentinel (Orange-White Guard Cat) — Irreversible Action Confirmation Gate &
 * Dynamic Same-Origin 429 Retry-After / RateLimit Header Probing.
 * Squad D | AI Agent Readiness | --full Mode
 */

export const meta = {
  id: 'sentinel',
  code: 'D3',
  name: 'Sentinel',
  title: '门卫猫 · 高危门禁与动态限流',
  squad: 'D',
  axis: 'agent',
  mode: 'full',
  color: '#f97316',
  accentColor: '#ef4444',
  prop: 'Police Cap + CONFIRM? Gate',
  description: 'Verifies destructive/payment confirmation gates (OWASP Agentic) & dynamically probes same-origin read-only endpoints for 429 + Retry-After / RateLimit headers.'
};

export async function run(ctx) {
  const { page, targetUrl, extraHeaders } = ctx;
  const findings = [];
  const quips = [];

  const gateAudit = await page.evaluate(`(() => {
    const destructiveRe = /(delete|remove|destroy|pay|checkout|purchase|place order|charge|删除|支付|付款)/i;
    const controls = Array.from(document.querySelectorAll('button, a[href], input[type="submit"]'));
    const dangerous = [];
    const unguarded = [];

    for (const el of controls) {
      const label = (el.textContent || el.getAttribute('value') || el.getAttribute('aria-label') || '').trim();
      if (!destructiveRe.test(label)) continue;
      dangerous.push(label);
      const hasGate =
        el.hasAttribute('data-confirm-gate') ||
        el.getAttribute('aria-haspopup') === 'dialog' ||
        /confirm\\(/i.test(el.getAttribute('onclick') || '') ||
        !!document.querySelector('dialog');
      if (!hasGate) unguarded.push(label);
    }
    return { dangerousCount: dangerous.length, unguarded };
  })()`);

  // Dynamically discover safe same-origin read-only GET API endpoints from telemetry before falling back
  const origin = new URL(targetUrl).origin;
  const staticAssetRe = /\.(?:js|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|map)(?:\?|$)/i;
  const discovered = [];
  for (const req of Array.from(page?.requests?.values?.() || [])) {
    try {
      if ((req.method || 'GET').toUpperCase() !== 'GET') continue;
      const u = new URL(req.url);
      if (u.origin !== origin) continue;
      if (staticAssetRe.test(u.pathname)) continue;
      if (/\/(?:api|graphql|v\d+|search|products|items)\b/i.test(u.pathname)) {
        discovered.push(u.pathname + u.search);
      }
    } catch {}
  }

  const probeEndpoints = [...new Set([...discovered, '/api/stock', '/api/ping'])].slice(0, 4);
  let saw429 = false;
  let sawRetryAfter = false;
  let sawRateLimitHeaders = false;
  let probedEndpoint = null;

  for (const ep of probeEndpoints) {
    try {
      const first = await fetch(`${origin}${ep}`, { headers: extraHeaders || undefined });
      if (first.status === 404) continue;
      probedEndpoint = ep;
      if (
        first.headers.get('ratelimit-limit') ||
        first.headers.get('x-ratelimit-limit') ||
        first.headers.get('ratelimit')
      ) {
        sawRateLimitHeaders = true;
      }
      const burst = await Promise.all(Array.from({ length: 8 }, () => fetch(`${origin}${ep}`, { headers: extraHeaders || undefined })));
      for (const r of burst) {
        if (
          r.headers.get('ratelimit-limit') ||
          r.headers.get('x-ratelimit-limit') ||
          r.headers.get('ratelimit')
        ) {
          sawRateLimitHeaders = true;
        }
        if (r.status === 429) {
          saw429 = true;
          if (r.headers.get('retry-after')) sawRetryAfter = true;
        }
      }
      break;
    } catch {}
  }

  if (gateAudit.unguarded.length > 0) {
    findings.push({
      id: 'sentinel-missing-confirm-gate',
      severity: 'high',
      axis: 'agent',
      title: `${gateAudit.unguarded.length} irreversible action(s) lack a secondary confirmation gate`,
      detail: `Unguarded high-impact controls: ${gateAudit.unguarded.join(', ')}`,
      fixHint: 'Require an explicit <dialog> confirmation step (aria-haspopup="dialog" / human-in-the-loop gate) before executing deletes or payments.'
    });
    quips.push(`STOP! "${gateAudit.unguarded[0]}" fires straight away with zero CONFIRM? gate!`);
  }

  if (probedEndpoint && !saw429 && !sawRateLimitHeaders) {
    findings.push({
      id: 'sentinel-no-rate-limit',
      severity: 'medium',
      axis: 'agent',
      title: `API endpoint (${probedEndpoint}) accepted rapid agent burst without 429 + Retry-After throttling`,
      detail: 'Sending 8 concurrent requests returned neither HTTP 429 nor standard RateLimit/X-RateLimit headers.',
      fixHint: 'Enforce per-client rate limiting returning HTTP 429 with Retry-After and RateLimit headers so autonomous agents back off gracefully.'
    });
    if (!quips.length) quips.push(`Burst-fired 8 requests to ${probedEndpoint} and never got a 429 Retry-After!`);
  } else if (saw429 && !sawRetryAfter) {
    findings.push({
      id: 'sentinel-missing-retry-after',
      severity: 'low',
      axis: 'agent',
      title: 'HTTP 429 response is missing Retry-After header',
      detail: 'Autonomous agents rely on Retry-After to schedule deterministic backoff.',
      fixHint: 'Include Retry-After: <seconds> alongside HTTP 429 responses.'
    });
  }

  if (quips.length === 0) {
    quips.push('Gate bar verified! High-risk actions require confirmation & burst traffic gets polite 429 Retry-After.');
  }

  return {
    findings,
    quips,
    metrics: { ...gateAudit, probed: Boolean(probedEndpoint), probedEndpoint, saw429, sawRetryAfter, sawRateLimitHeaders }
  };
}
