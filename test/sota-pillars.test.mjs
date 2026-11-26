import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { parseRobotsTxt, evaluateBotAccess, analyzeAiCrawlerPolicy } from '../src/engine/robots-policy.js';
import { detectWafChallenge } from '../src/engine/antibot.js';
import { runAudit } from '../src/engine/runner.js';

test('v2.3.0 Unit: RFC 9309 longest-match, tiered AI bots & Content-Signal / Content-Usage parser', () => {
  const robots = `
User-agent: *
Content-Signal: search=yes, ai-input=no, ai-train=no
Disallow: /private/
Allow: /private/public-doc

User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /products/
Allow: /products/free-sample
`;

  const groups = parseRobotsTxt(robots);
  assert.equal(evaluateBotAccess(groups, 'GPTBot', '/').allowed, false);
  assert.equal(evaluateBotAccess(groups, 'ChatGPT-User', '/products/item-1').allowed, false);
  // RFC 9309 longest-match: Allow /products/free-sample beats Disallow /products/
  assert.equal(evaluateBotAccess(groups, 'ChatGPT-User', '/products/free-sample').allowed, true);
  assert.equal(evaluateBotAccess(groups, 'Claude-User', '/private/secret').allowed, false);
  assert.equal(evaluateBotAccess(groups, 'Claude-User', '/private/public-doc').allowed, true);

  const policy = analyzeAiCrawlerPolicy({
    robotsText: robots,
    targetPath: '/products/item-1',
    xRobotsTag: 'index, noai',
    rawHtml: '<html><head></head><body>Hi</body></html>'
  });

  assert.equal(policy.blockedLiveAgents.some((b) => b.bot === 'ChatGPT-User'), true);
  assert.equal(policy.blockedTrainingBots.some((b) => b.bot === 'GPTBot'), true);
  assert.equal(policy.aiInputBlockedBySignal, true);
  assert.equal(policy.aiTrainBlockedBySignal, true);
  assert.equal(policy.hasNoAiDirective, true);
});

test('v2.3.0 Unit: WAF interstitial fingerprinting across Cloudflare, DataDome, AWS WAF & Anubis', () => {
  const cf = detectWafChallenge({ status: 403, headers: { 'cf-mitigated': 'challenge' }, body: 'Just a moment...' });
  assert.equal(cf.blocked, true);
  assert.equal(cf.provider, 'Cloudflare');

  const dd = detectWafChallenge({ status: 403, headers: { 'x-datadome': 'protected' }, body: '<script src="https://geo.captcha-delivery.com/c.js"></script>' });
  assert.equal(dd.blocked, true);
  assert.equal(dd.provider, 'DataDome');

  const aws = detectWafChallenge({ status: 202, headers: { 'x-amzn-waf-action': 'challenge' }, body: 'awswaf' });
  assert.equal(aws.blocked, true);
  assert.equal(aws.provider, 'AWS WAF');

  const anubis = detectWafChallenge({ status: 200, headers: {}, body: '<html><body><script id="anubis_challenge"></script>Making sure you\'re not a bot</body></html>' });
  assert.equal(anubis.blocked, true);
  assert.equal(anubis.provider, 'Anubis PoW');

  const clean = detectWafChallenge({ status: 200, headers: { server: 'nginx' }, body: '<html><body><h1>Hello Store</h1></body></html>' });
  assert.equal(clean.blocked, false);
});

test('v2.3.0 E2E: Adversarial 4-Pillar SOTA traps (RFC 9309, Shadow DOM CTA, CSS price, JSON-LD drift, broken /.well-known/ & Cloudflare WAF)', async () => {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://127.0.0.1');

    if (u.pathname === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end([
        'User-agent: *',
        'Content-Signal: search=yes, ai-input=no, ai-train=no',
        'Allow: /',
        '',
        'User-agent: ChatGPT-User',
        'Disallow: /sota-traps'
      ].join('\n'));
      return;
    }

    if (u.pathname === '/.well-known/ucp') {
      // Malformed UCP missing version & declaring a broken 404 endpoint
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ merchant: { name: 'TrapShop' }, endpoints: { catalog: '/missing-catalog-404' } }));
      return;
    }

    if (u.pathname === '/waf-blocked') {
      res.writeHead(403, {
        'Content-Type': 'text/html; charset=utf-8',
        'cf-mitigated': 'challenge',
        'server': 'cloudflare'
      });
      res.end('<!doctype html><html><head><title>Just a moment...</title></head><body><div id="_cf_chl_opt">Checking your browser</div></body></html>');
      return;
    }

    if (u.pathname === '/crypto-enforced') {
      const hasSig = Boolean(req.headers['signature-input']);
      if (hasSig || /SpoofedBot/i.test(req.headers['user-agent'] || '')) {
        res.writeHead(401, {
          'Content-Type': 'text/plain',
          'Accept-Signature': 'sig1=("@authority" "signature-agent");tag="web-bot-auth"'
        });
        res.end('Valid RFC 9421 cryptographic signature required');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html lang="en"><head><title>Crypto Enforced</title></head><body><h1>Verified Gateway</h1><p>Strict RFC 9421 merchant gateway.</p></body></html>');
      return;
    }

    if (u.pathname === '/sota-traps') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': 'index, noai'
      });
      res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>SOTA Trap Shop</title>
  <script type="application/ld+json">
  { "@context": "https://schema.org", "@type": "Product", "name": "Trap Widget", "offers": { "@type": "Offer", "price": "99.00", "priceCurrency": "USD" } }
  </script>
  <style>
    .obf-price::after { content: "$49.00"; }
  </style>
</head>
<body>
  <h1>Trap Widget</h1>
  <p>This product page contains enough descriptive text to pass the no-JS shell check while planting subtle 2026 AI Agent traps in prices, Shadow DOM CTAs, and headers.</p>
  <div class="price obf-price"></div>
  <div class="product-price">$49.00</div>
  <div id="shadow-host"></div>
  <script>
    const host = document.getElementById('shadow-host');
    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = '<button aria-hidden="true">Buy Now</button>';
  </script>
</body>
</html>`);
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. Audit /sota-traps with RoboCat, MuseBot, Lucky
    const trapReport = await runAudit({ url: `${baseUrl}/sota-traps`, cats: ['robocat', 'musebot', 'lucky'] });
    const allIds = trapReport.cats.flatMap((c) => c.findings.map((f) => f.id));

    assert.ok(allIds.includes('robocat-live-ai-agents-blocked'), `Missing live AI agent block finding: ${allIds}`);
    assert.ok(allIds.includes('robocat-content-signal-blocks-ai-input'), `Missing Content-Signal finding: ${allIds}`);
    assert.ok(allIds.includes('robocat-x-robots-noai'), `Missing X-Robots-Tag noai finding: ${allIds}`);
    assert.ok(allIds.includes('musebot-cta-axtree-blocked'), `Missing Shadow DOM aria-hidden CTA finding: ${allIds}`);
    assert.ok(allIds.includes('musebot-price-obfuscated'), `Missing CSS ::after obfuscated price finding: ${allIds}`);
    assert.ok(allIds.includes('musebot-price-parity-mismatch'), `Missing DOM vs JSON-LD price drift finding: ${allIds}`);
    assert.ok(allIds.includes('lucky-invalid-wellknown-schema'), `Missing /.well-known/ schema/endpoint finding: ${allIds}`);

    // 2. Audit /waf-blocked with Lucky -> must catch Cloudflare WAF critical block
    const wafReport = await runAudit({ url: `${baseUrl}/waf-blocked`, cats: ['lucky'] });
    const luckyWaf = wafReport.cats[0];
    assert.ok(luckyWaf.findings.some((f) => f.id === 'lucky-waf-hard-blocked'), 'Expected Cloudflare WAF critical finding');
    assert.equal(luckyWaf.metrics.wafDetected, 'Cloudflare');

    // 3. Audit /crypto-enforced with Lucky -> must recognize 401 + Accept-Signature as rfc9421-crypto-enforced (not penalized!)
    const cryptoReport = await runAudit({ url: `${baseUrl}/crypto-enforced`, cats: ['lucky'] });
    const luckyCrypto = cryptoReport.cats[0];
    assert.equal(luckyCrypto.metrics.botAuthPosture, 'rfc9421-crypto-enforced');
    assert.equal(luckyCrypto.metrics.distinguishesBotAuth, true);
    assert.ok(!luckyCrypto.findings.some((f) => f.id === 'lucky-no-web-bot-auth'), 'Should NOT penalize strict RFC 9421 crypto-enforced gateway');
  } finally {
    await new Promise((r) => server.close(r));
  }
});
