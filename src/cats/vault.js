/**
 * C1 · Vault (Siamese Detective) — Frontend JS / SourceMap Secret Leaks & Security Headers.
 * Squad C | Dual Axis (Human + Agent) | Default Fast Mode
 */

import { SECRET_PATTERNS } from '../engine/sandbox.js';

export const meta = {
  id: 'vault',
  code: 'C1',
  name: 'Vault',
  title: '暹罗侦探 · 密钥与安全头',
  squad: 'C',
  axis: 'dual',
  mode: 'fast',
  color: '#10b981',
  accentColor: '#34d399',
  prop: 'Deerstalker Hat + .env Tin',
  description: 'Scans HTML, inline/external JS & sourcemaps for leaked API keys (OpenAI/Supabase/AWS) + CSP/HSTS/CORS headers.'
};

export async function run(ctx) {
  const { page, targetUrl } = ctx;
  const findings = [];
  const quips = [];

  const mainRes = await fetch(targetUrl);
  const htmlText = await mainRes.text();
  const headers = Object.fromEntries(
    Array.from(mainRes.headers.entries()).map(([k, v]) => [k.toLowerCase(), v])
  );

  const scriptUrls = await page.evaluate(`(() => {
    return Array.from(document.querySelectorAll('script[src], script[data-pawtest-src]'))
      .map((s) => s.getAttribute('src') || s.getAttribute('data-pawtest-src'))
      .filter(Boolean)
      .slice(0, 12);
  })()`);

  /** @type {Array<{ source: string, secretType: string }>} */
  const leakedSecrets = [];
  const scanSource = (sourceName, content) => {
    for (const pat of SECRET_PATTERNS.slice(0, 7)) {
      pat.regex.lastIndex = 0;
      if (pat.regex.test(content)) {
        leakedSecrets.push({ source: sourceName, secretType: pat.name });
      }
    }
  };

  scanSource('index.html', htmlText);

  let exposedSourceMaps = 0;
  for (const rawSrc of scriptUrls) {
    try {
      const sUrl = new URL(rawSrc, targetUrl).href;
      const res = await fetch(sUrl);
      if (!res.ok) continue;
      const body = await res.text();
      const shortName = new URL(sUrl).pathname;
      scanSource(shortName, body);
      if (body.includes('sourceMappingURL=')) {
        const mapMatch = body.match(/sourceMappingURL=([^\s*]+)/);
        if (mapMatch) {
          const mapUrl = new URL(mapMatch[1], sUrl).href;
          const mapRes = await fetch(mapUrl).catch(() => null);
          if (mapRes && mapRes.ok) {
            exposedSourceMaps++;
            const mapBody = await mapRes.text();
            scanSource(`${shortName}.map`, mapBody.slice(0, 200000));
          }
        }
      }
    } catch {
      // Ignore unreachable third-party scripts
    }
  }

  if (leakedSecrets.length > 0) {
    const summary = leakedSecrets.map((l) => `${l.secretType} in ${l.source}`).join('; ');
    findings.push({
      id: 'vault-secret-leak',
      severity: 'critical',
      axis: 'human',
      title: `Exposed secret key(s) detected in client bundle (${leakedSecrets.length})`,
      detail: `Found credential pattern(s): ${summary} (values automatically redacted).`,
      fixHint: 'Revoke leaked keys immediately, move secrets to server-side environment variables, and proxy API calls via backend routes.'
    });
    findings.push({
      id: 'vault-agent-secret-exposure',
      severity: 'high',
      axis: 'agent',
      title: 'Client-exposed secrets can be harvested by autonomous browsing agents',
      detail: `Autonomous agents parsing page bundles can extract ${leakedSecrets.length} exposed key(s): ${summary}.`,
      fixHint: 'Never ship privileged API tokens or service-role JWTs in client HTML/JS.'
    });
    quips.push(`Sniffed ${leakedSecrets[0].secretType} right inside ${leakedSecrets[0].source}!`);
  }

  if (exposedSourceMaps > 0) {
    findings.push({
      id: 'vault-exposed-sourcemap',
      severity: 'medium',
      axis: 'human',
      title: `${exposedSourceMaps} public JavaScript sourcemap(s) accessible`,
      detail: 'Public .map files reveal original TypeScript source, internal routes, and comments.',
      fixHint: 'Upload sourcemaps privately to your error tracker and disable public .map serving in production.'
    });
  }

  if (!headers['content-security-policy']) {
    findings.push({
      id: 'vault-missing-csp',
      severity: 'medium',
      axis: 'human',
      title: 'Missing Content-Security-Policy (CSP) response header',
      detail: 'Without CSP, reflected XSS or injected scripts can exfiltrate tokens freely.',
      fixHint: "Add a strict Content-Security-Policy header (e.g. default-src 'self'; script-src 'self')."
    });
    if (!quips.length) quips.push('No Content-Security-Policy header — the front door has no deadbolt.');
  }

  if (headers['access-control-allow-origin'] === '*' && headers['access-control-allow-credentials'] === 'true') {
    findings.push({
      id: 'vault-unsafe-cors',
      severity: 'high',
      axis: 'agent',
      title: 'Overly permissive CORS wildcard with credentials',
      detail: 'Access-Control-Allow-Origin: * combined with credentials weakens cross-origin isolation.',
      fixHint: 'Restrict Access-Control-Allow-Origin to explicit trusted origins.'
    });
  }

  const isHttps = targetUrl.startsWith('https://');
  if (isHttps && !headers['strict-transport-security']) {
    findings.push({
      id: 'vault-missing-hsts',
      severity: 'low',
      axis: 'human',
      title: 'Missing Strict-Transport-Security (HSTS) header on HTTPS',
      detail: 'HSTS protects users against protocol downgrade attacks.',
      fixHint: 'Add Strict-Transport-Security: max-age=31536000; includeSubDomains.'
    });
  }

  if (quips.length === 0) {
    quips.push('Inspected bundles, sourcemaps & security headers — vault is locked tight.');
  }

  return {
    findings,
    quips,
    metrics: {
      scriptsScanned: scriptUrls.length,
      leakedSecretsCount: leakedSecrets.length,
      exposedSourceMaps,
      hasCSP: !!headers['content-security-policy']
    }
  };
}
