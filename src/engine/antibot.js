/**
 * WAF, Anti-Bot Challenge Interstitial Fingerprinting & 4-Tier Agent Access Diagnostics.
 *
 * Identifies Cloudflare Turnstile / Managed Challenge, DataDome, Akamai Bot Manager,
 * AWS WAF, PerimeterX / HUMAN, Anubis PoW, and generic captcha soft-blocks, and
 * differentiates unsigned scrapers from RFC 9421 Web Bot Auth / Accept-Signature gateways.
 */

const WAF_SIGNATURES = [
  {
    provider: 'Cloudflare',
    check: ({ headers, body, status }) => {
      const cfMitigated = (headers['cf-mitigated'] || '').toLowerCase();
      if (cfMitigated.includes('challenge')) return 'Header cf-mitigated: challenge';
      if (
        /challenges\.cloudflare\.com\/turnstile|_cf_chl_opt|cf-browser-verification|Just a moment\.\.\./i.test(body) &&
        (status === 403 || status === 503 || /cf-ray/i.test(Object.keys(headers).join(',')) || /_cf_chl_opt/i.test(body))
      ) {
        return 'Cloudflare Turnstile / Managed Challenge interstitial';
      }
      return null;
    }
  },
  {
    provider: 'DataDome',
    check: ({ headers, body }) => {
      if (headers['x-datadome'] || headers['x-dd-b']) return 'Header x-datadome present';
      if (/captcha-delivery\.com|geo\.captcha-delivery\.com|datadome\.co\/captcha/i.test(body)) {
        return 'DataDome interstitial script';
      }
      return null;
    }
  },
  {
    provider: 'Akamai Bot Manager',
    check: ({ headers, body, status }) => {
      const setCookie = headers['set-cookie'] || '';
      if (status === 403 && (/akamai/i.test(headers['server'] || '') || /Reference\s*#18\./i.test(body))) {
        return 'Akamai 403 Edge Block (Reference #18)';
      }
      if (/_abck=|bm_sz=/i.test(setCookie) && status === 403) return 'Akamai _abck bot block';
      return null;
    }
  },
  {
    provider: 'AWS WAF',
    check: ({ headers, body }) => {
      const action = (headers['x-amzn-waf-action'] || '').toLowerCase();
      if (action === 'challenge' || action === 'captcha') return `Header x-amzn-waf-action: ${action}`;
      if (/awswaf\.com\/.*challenge\.js|aws-waf-captcha/i.test(body)) return 'AWS WAF JS challenge';
      return null;
    }
  },
  {
    provider: 'PerimeterX / HUMAN',
    check: ({ body }) => {
      if (/px-captcha|_pxAppId|perimeterx\.net\/.*captcha/i.test(body)) {
        return 'PerimeterX / HUMAN captcha interstitial';
      }
      return null;
    }
  },
  {
    provider: 'Anubis PoW',
    check: ({ body }) => {
      if (/anubis_challenge|id=["']anubis_version["']|Making sure you.?re not a bot/i.test(body)) {
        return 'Anubis Proof-of-Work anti-AI challenge';
      }
      return null;
    }
  },
  {
    provider: 'Generic Captcha / Access Denied',
    check: ({ body, status }) => {
      if (
        (status === 403 || status === 429 || status === 503) &&
        /g-recaptcha|h-captcha|verify you are human|access denied|attention required/i.test(body)
      ) {
        return `HTTP ${status} anti-bot verification page`;
      }
      return null;
    }
  }
];

function normalizeHeaders(headersObj) {
  const out = {};
  if (!headersObj) return out;
  if (typeof headersObj.forEach === 'function') {
    headersObj.forEach((v, k) => {
      out[k.toLowerCase()] = String(v);
    });
  } else {
    for (const [k, v] of Object.entries(headersObj)) {
      out[k.toLowerCase()] = String(v);
    }
  }
  return out;
}

/**
 * Inspect HTTP status, headers, and HTML body for WAF / anti-bot interstitials.
 */
export function detectWafChallenge({ status = 200, headers = {}, body = '' }) {
  const normHeaders = normalizeHeaders(headers);
  for (const sig of WAF_SIGNATURES) {
    const reason = sig.check({ headers: normHeaders, body: String(body || ''), status });
    if (reason) {
      return { blocked: true, provider: sig.provider, reason, status };
    }
  }
  return { blocked: false, provider: null, reason: null, status };
}

/**
 * Run a 4-tier anti-bot differential audit:
 *  Tier 1: Rendered Chromium page (already captured)
 *  Tier 2: Plain HTTP fetch (neutral browser UA) -> detects JS Challenge / Soft-403
 *  Tier 3: Unsigned spoofed scraper UA
 *  Tier 4: RFC 9421 Web Bot Auth + Signature-Agent probe (checks both admission & Accept-Signature enforcement)
 */
export async function runAntiBotAudit({ targetUrl, browserStatus = 200, browserHtml = '' }) {
  const browserWaf = detectWafChallenge({ status: browserStatus, headers: {}, body: browserHtml });

  async function safeFetch(headers) {
    try {
      const res = await fetch(targetUrl, { headers, redirect: 'follow' });
      const body = await res.text().catch(() => '');
      const norm = normalizeHeaders(res.headers);
      const waf = detectWafChallenge({ status: res.status, headers: norm, body });
      return { status: res.status, headers: norm, bodyLength: body.length, waf };
    } catch (err) {
      return { status: 0, headers: {}, bodyLength: 0, waf: { blocked: false, provider: null, reason: null }, error: err.message };
    }
  }

  const [plainHttp, spoofedBot, signedAgent] = await Promise.all([
    safeFetch({
      'User-Agent': 'Mozilla/5.0 (compatible; PawTestAudit/2.3; +https://pawtest.dev)',
      Accept: 'text/html,application/xhtml+xml'
    }),
    safeFetch({
      'User-Agent': 'SpoofedBot/1.0 (+unverified)'
    }),
    safeFetch({
      'User-Agent': 'PawTest-VerifiedAgent/2.3',
      'Signature-Agent': '"https://pawtest.dev/.well-known/http-message-signatures-directory"',
      'Signature-Input': 'sig1=("@authority" "signature-agent");created=1764000000;keyid="pawtest-demo";alg="ed25519";tag="web-bot-auth"',
      'Signature': 'sig1=:ZGVtb19yZmM5NDIxX3NpZ25hdHVyZQ==:'
    })
  ]);

  const acceptSignatureHeader =
    signedAgent.headers['accept-signature'] ||
    spoofedBot.headers['accept-signature'] ||
    plainHttp.headers['accept-signature'] ||
    null;

  const rfc9421VerifiedHeader = Boolean(
    signedAgent.headers['x-web-bot-auth-verified'] ||
    signedAgent.headers['signature-agent-verified']
  );

  // Determine Web Bot Auth policy posture accurately:
  // 1) Admitted signed probe while blocking unsigned spoofed bot (403 -> 200)
  // 2) Actively enforced cryptographic verification (401/403 with Accept-Signature / WWW-Authenticate Signature)
  // 3) Hard-blocked all bots including signed agents via WAF interstitial
  // 4) Open (does not differentiate spoofed bot from verified agent)
  let botAuthPosture = 'open-no-differentiation';
  if (browserWaf.blocked || (plainHttp.waf.blocked && signedAgent.waf.blocked)) {
    botAuthPosture = 'waf-hard-blocked';
  } else if (
    (signedAgent.status === 401 || signedAgent.status === 403) &&
    (acceptSignatureHeader || /signature/i.test(signedAgent.headers['www-authenticate'] || ''))
  ) {
    botAuthPosture = 'rfc9421-crypto-enforced';
  } else if (spoofedBot.status === 403 && signedAgent.status >= 200 && signedAgent.status < 300) {
    botAuthPosture = rfc9421VerifiedHeader ? 'rfc9421-verified-admit' : 'rfc9421-differentiated';
  } else if (plainHttp.waf.blocked && !browserWaf.blocked) {
    botAuthPosture = 'js-challenge-http-only';
  }

  const detect402Protocol = (probe) => {
    if (!probe || probe.status !== 402) return null;
    const h = probe.headers || {};
    const pr = String(h['payment-required'] || h['x-payment-required'] || h['x-402-version'] || '');
    if (/x402/i.test(pr) || h['payment-required'] || h['x-payment-required']) return 'x402';
    if (h['crawler-price'] || h['cf-pay-per-crawl']) return 'pay-per-crawl';
    return 'http-402-unstructured';
  };
  const http402Protocol =
    detect402Protocol(signedAgent) ||
    detect402Protocol(spoofedBot) ||
    detect402Protocol(plainHttp) ||
    'none';
  const blocksHumansWith402 = browserStatus === 402 || plainHttp.status === 402;

  return {
    http402Protocol,
    blocksHumansWith402,
    browserWaf,
    plainHttp: { status: plainHttp.status, waf: plainHttp.waf },
    spoofedBot: { status: spoofedBot.status, waf: spoofedBot.waf },
    signedAgent: { status: signedAgent.status, waf: signedAgent.waf },
    acceptSignatureHeader,
    botAuthPosture,
    distinguishesBotAuth:
      botAuthPosture === 'rfc9421-crypto-enforced' ||
      botAuthPosture === 'rfc9421-verified-admit' ||
      botAuthPosture === 'rfc9421-differentiated'
  };
}
