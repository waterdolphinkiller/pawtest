/**
 * D4 · Lucky (Golden Beckoning Cat) — Complete /.well-known/ 2026 Agent Protocol Matrix
 * (UCP, ACP, AP2, A2A agent-card.json, MCP, OAuth Protected Resource, RFC 9421 JWKS Directory),
 * Schema & Endpoint Reachability Validation, Link Header Discovery & 4-Tier WAF/Anti-Bot Diagnostics.
 * Squad D | AI Agent Readiness | --full Mode
 */

import { runAntiBotAudit } from '../engine/antibot.js';

export const meta = {
  id: 'lucky',
  code: 'D4',
  name: 'Lucky',
  title: '招财验票猫 · 协议矩阵与反爬诊断',
  squad: 'D',
  axis: 'agent',
  mode: 'full',
  color: '#f59e0b',
  accentColor: '#fef08a',
  prop: 'Beckoning Paw + /.well-known/ & WAF Radar',
  description: 'Audits /.well-known/ (UCP/ACP/AP2/A2A/MCP/RFC9421) schemas & endpoints, Link discovery, WAF challenge blocks & Web Bot Auth posture.'
};

async function probeJsonManifest(url) {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return { ok: false, status: res.status, json: null };
    const json = await res.json().catch(() => null);
    if (json && typeof json === 'object' && Object.keys(json).length > 0) {
      return { ok: true, status: res.status, json };
    }
    return { ok: false, status: res.status, json: null, invalidJson: true };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

function validateCommerceSchema(name, json) {
  const issues = [];
  if (!json.version && !json.ucp_version && !json.protocol_version) {
    issues.push(`${name}: missing version/ucp_version field`);
  }
  if (!json.merchant && !json.provider && !json.name) {
    issues.push(`${name}: missing merchant/provider identity`);
  }
  return issues;
}

function validateAgentCardSchema(json) {
  const issues = [];
  if (!json.name) issues.push('agent-card.json: missing "name"');
  if (!json.url && !json.endpoint) issues.push('agent-card.json: missing "url"');
  if (!Array.isArray(json.skills) && !json.capabilities) {
    issues.push('agent-card.json: missing "skills" or "capabilities"');
  }
  return issues;
}

export async function run(ctx) {
  const { targetUrl, page, extraHeaders } = ctx;
  const origin = new URL(targetUrl).origin;
  const findings = [];
  const quips = [];

  // 1. Probe full 2026 /.well-known/ Agent & Commerce Protocol Matrix in parallel
  const [
    ucpRes,
    acpRes,
    ap2Res,
    a2aRes,
    mcpRes,
    oauthRes,
    jwksRes,
    mainRes
  ] = await Promise.all([
    probeJsonManifest(`${origin}/.well-known/ucp`),
    probeJsonManifest(`${origin}/.well-known/acp`).then((r) => (r.ok ? r : probeJsonManifest(`${origin}/.well-known/agentic-commerce`))),
    probeJsonManifest(`${origin}/.well-known/ap2`),
    probeJsonManifest(`${origin}/.well-known/agent-card.json`),
    probeJsonManifest(`${origin}/.well-known/mcp.json`),
    probeJsonManifest(`${origin}/.well-known/oauth-protected-resource`),
    probeJsonManifest(`${origin}/.well-known/http-message-signatures-directory`),
    fetch(targetUrl, { headers: extraHeaders || undefined }).catch(() => null)
  ]);

  const detectedProtocols = [
    ucpRes.ok && 'UCP',
    acpRes.ok && 'ACP',
    ap2Res.ok && 'AP2',
    a2aRes.ok && 'A2A(agent-card)',
    mcpRes.ok && 'MCP',
    oauthRes.ok && 'OAuth-PRM',
    jwksRes.ok && 'RFC9421-Dir'
  ].filter(Boolean);

  // Schema & declared endpoint reachability checks
  const schemaIssues = [];
  const brokenManifestEndpoints = [];
  if (ucpRes.ok) {
    schemaIssues.push(...validateCommerceSchema('UCP', ucpRes.json));
    if (ucpRes.json.endpoints && typeof ucpRes.json.endpoints === 'object') {
      for (const [k, ep] of Object.entries(ucpRes.json.endpoints)) {
        if (typeof ep === 'string' && ep.startsWith('/')) {
          const epRes = await fetch(`${origin}${ep}`).catch(() => null);
          if (!epRes || !epRes.ok) brokenManifestEndpoints.push(`UCP.${k} (${ep} -> ${epRes ? epRes.status : 'ERR'})`);
        }
      }
    }
  }
  if (acpRes.ok) schemaIssues.push(...validateCommerceSchema('ACP', acpRes.json));
  if (a2aRes.ok) schemaIssues.push(...validateAgentCardSchema(a2aRes.json));

  // Parse Link header protocol discovery
  const linkHeader = mainRes?.headers?.get('link') || '';
  const hasLinkDiscovery = /agent-card\.json|llms\.txt|rel=["']?service-desc/i.test(linkHeader);

  // 2. Check structured product/price metadata in raw HTML
  const rawHtml = mainRes && mainRes.ok ? await mainRes.text() : '';
  const hasStructuredPrice =
    /"@type"\s*:\s*"(?:Product|Offer|SoftwareApplication)"/i.test(rawHtml) ||
    /itemprop=["']price["']/i.test(rawHtml);

  // 3. Run 4-Tier WAF / Anti-Bot Interstitial & RFC 9421 Web Bot Auth Diagnostics
  const browserHtml = page
    ? await page.evaluate('document.documentElement ? document.documentElement.outerHTML.slice(0, 20000) : ""').catch(() => '')
    : '';
  const antiBot = await runAntiBotAudit({
    targetUrl,
    browserStatus: ctx.mainHttpStatus ?? 200,
    browserHtml
  });

  // Report WAF / Anti-Bot Hard Blocks (Highest Priority)
  if (antiBot.browserWaf.blocked || antiBot.botAuthPosture === 'waf-hard-blocked') {
    const wafInfo = antiBot.browserWaf.blocked ? antiBot.browserWaf : antiBot.plainHttp.waf;
    findings.push({
      id: 'lucky-waf-hard-blocked',
      severity: 'critical',
      axis: 'agent',
      title: `Anti-bot WAF (${wafInfo.provider}) blocked automated access with a challenge interstitial`,
      detail: `Detected ${wafInfo.provider} (${wafInfo.reason}, HTTP ${wafInfo.status}). Autonomous AI agents cannot reach page content or checkout.`,
      fixHint: `Configure ${wafInfo.provider} to allow verified AI agents via RFC 9421 Web Bot Auth (Signature-Agent) or allowlist official search/commerce agent directories.`
    });
    quips.push(`Slammed straight into a ${wafInfo.provider} anti-bot wall (${wafInfo.reason}) — AI agents are locked out!`);
  } else if (antiBot.botAuthPosture === 'js-challenge-http-only') {
    findings.push({
      id: 'lucky-http-js-challenge',
      severity: 'medium',
      axis: 'agent',
      title: `Plain HTTP AI fetchers hit ${antiBot.plainHttp.waf.provider} JS challenge (HTTP ${antiBot.plainHttp.status})`,
      detail: `Headless Chromium rendered the page, but lightweight HTTP fetchers received a ${antiBot.plainHttp.waf.provider} challenge (${antiBot.plainHttp.waf.reason}).`,
      fixHint: 'Exempt public product/docs routes or verified RFC 9421 agents from JS challenge interstitials.'
    });
  }

  // Report HTTP 402 / x402 / Pay-Per-Crawl compliance
  if (antiBot.blocksHumansWith402) {
    findings.push({
      id: 'lucky-402-blocks-humans',
      severity: 'high',
      axis: 'human',
      title: 'HTTP 402 Payment Required is blocking standard human browser requests',
      detail: `Human/neutral browser request received HTTP 402 (${antiBot.http402Protocol}).`,
      fixHint: 'Scope HTTP 402 / x402 / Pay-Per-Crawl responses strictly to automated bot/agent requests, not human browsers.'
    });
  } else if (antiBot.http402Protocol === 'http-402-unstructured') {
    findings.push({
      id: 'lucky-402-missing-metadata',
      severity: 'medium',
      axis: 'agent',
      title: 'HTTP 402 response is missing structured x402 or Pay-Per-Crawl payment headers',
      detail: 'Agent request received HTTP 402 without standard Payment-Required (x402) or Crawler-Price headers.',
      fixHint: 'Include standard x402 V2 Payment-Required headers (amount, currency, network) so autonomous agents can settle payments cleanly.'
    });
  }

  // Report /.well-known/ protocol gaps & schema bugs
  const hasCommerceProtocol = ucpRes.ok || acpRes.ok || ap2Res.ok;
  if (!hasCommerceProtocol && !a2aRes.ok && !mcpRes.ok) {
    findings.push({
      id: 'lucky-missing-ucp',
      severity: 'medium',
      axis: 'agent',
      title: 'Missing /.well-known/ agent & commerce manifests (UCP, ACP, AP2, A2A, MCP)',
      detail: 'None of /.well-known/ucp, /.well-known/acp, /.well-known/ap2, /.well-known/agent-card.json, or /.well-known/mcp.json returned a valid JSON manifest.',
      fixHint: 'Publish /.well-known/ucp (or /.well-known/acp) for commerce and /.well-known/agent-card.json for A2A agent discovery.'
    });
    if (!quips.length) quips.push('Checked /.well-known/ucp, ACP, AP2, A2A & MCP — all 404! AI agents cannot discover your endpoints.');
  }

  if (schemaIssues.length > 0 || brokenManifestEndpoints.length > 0) {
    findings.push({
      id: 'lucky-invalid-wellknown-schema',
      severity: 'medium',
      axis: 'agent',
      title: 'Invalid /.well-known/ manifest schema or unreachable declared endpoint',
      detail: [...schemaIssues, ...brokenManifestEndpoints].join('; '),
      fixHint: 'Ensure every /.well-known/ JSON manifest includes required version/identity fields and that all declared endpoints return HTTP 200.'
    });
  }

  if (!hasStructuredPrice) {
    findings.push({
      id: 'lucky-missing-price-schema',
      severity: 'low',
      axis: 'agent',
      title: 'No Schema.org Product/Offer price metadata detected',
      detail: 'Autonomous commerce agents need deterministic price, currency, and availability fields.',
      fixHint: 'Add Schema.org Product + Offer JSON-LD with explicit price, priceCurrency, and availability.'
    });
  }

  if (antiBot.botAuthPosture === 'open-no-differentiation' && antiBot.spoofedBot.status === 200) {
    findings.push({
      id: 'lucky-no-web-bot-auth',
      severity: 'low',
      axis: 'agent',
      title: 'Endpoint does not differentiate spoofed bot User-Agents from RFC 9421 Web Bot Auth + Signature-Agent',
      detail: `Spoofed UA returned HTTP ${antiBot.spoofedBot.status}, RFC 9421 probe returned HTTP ${antiBot.signedAgent.status} (no Accept-Signature negotiation).`,
      fixHint: 'Verify RFC 9421 Signature-Input / Signature / Signature-Agent headers at your edge/CDN (or return 401 with Accept-Signature) to admit verified agents while blocking spoofed scrapers.'
    });
    if (!quips.length) quips.push('Let an unsigned spoofed bot walk right in — upgrade to RFC 9421 Web Bot Auth!');
  }

  if (quips.length === 0) {
    quips.push(`Beckoning paw raised! Verified ${detectedProtocols.join(' + ')} & anti-bot posture (${antiBot.botAuthPosture}).`);
  }

  return {
    findings,
    quips,
    metrics: {
      hasValidUcp: ucpRes.ok,
      hasValidAcp: acpRes.ok,
      hasValidAp2: ap2Res.ok,
      hasValidA2a: a2aRes.ok,
      hasValidMcp: mcpRes.ok,
      hasValidOauthPrm: oauthRes.ok,
      hasValidRfc9421Dir: jwksRes.ok,
      hasLinkDiscovery,
      detectedProtocols,
      schemaIssues,
      brokenManifestEndpoints,
      ucpVersion: ucpRes.json?.ucp_version || ucpRes.json?.version || null,
      hasStructuredPrice,
      spoofedStatus: antiBot.spoofedBot.status,
      signedStatus: antiBot.signedAgent.status,
      distinguishesBotAuth: antiBot.distinguishesBotAuth,
      botAuthPosture: antiBot.botAuthPosture,
      http402Protocol: antiBot.http402Protocol,
      wafDetected: antiBot.browserWaf.blocked ? antiBot.browserWaf.provider : (antiBot.plainHttp.waf.blocked ? antiBot.plainHttp.waf.provider : null)
    }
  };
}
