/**
 * C2 · RoboCat (Cybernetic Cat) — GEO Readability, /llms.txt, Markdown for Agents (Accept: text/markdown),
 * RFC 9309 Tiered AI Crawler Policy (Live Agents vs Training Bots), Content-Signal / Content-Usage,
 * X-Robots-Tag noai, No-JS Shell, JSON-LD & Agent Token-Tax Meter.
 * Squad C | AI Agent Readiness | Default Fast Mode
 */

import { analyzeAiCrawlerPolicy } from '../engine/robots-policy.js';

export const meta = {
  id: 'robocat',
  code: 'C2',
  name: 'RoboCat',
  title: '机械猫 · GEO / RFC 9309 / 阅读税',
  squad: 'C',
  axis: 'agent',
  mode: 'fast',
  color: '#06b6d4',
  accentColor: '#22d3ee',
  prop: 'Radar Dish + Markdown & Content-Signal Meter',
  description: 'Audits RFC 9309 AI crawler rules, Content-Signal/Content-Usage, X-Robots-Tag, Accept: text/markdown Token-Tax, /llms.txt, SSR & JSON-LD.'
};

function estimateTokens(text) {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export async function run(ctx) {
  const { targetUrl, extraHeaders } = ctx;
  const parsedUrl = new URL(targetUrl);
  const origin = parsedUrl.origin;
  const targetPath = parsedUrl.pathname + (parsedUrl.search || '');
  const findings = [];
  const quips = [];

  const [rawRes, mdRes, llmsRes, robotsRes] = await Promise.all([
    fetch(targetUrl, { headers: extraHeaders || undefined }).catch(() => null),
    fetch(targetUrl, { headers: { ...(extraHeaders || {}), Accept: 'text/markdown, text/plain;q=0.9, */*;q=0.1' } }).catch(() => null),
    fetch(`${origin}/llms.txt`).catch(() => null),
    fetch(`${origin}/robots.txt`).catch(() => null)
  ]);

  const rawHtml = rawRes && rawRes.ok ? await rawRes.text() : '';
  const xRobotsTag = rawRes?.headers?.get('x-robots-tag') || '';
  const contentSignalHeader = rawRes?.headers?.get('content-signal') || '';
  const contentUsageHeader = rawRes?.headers?.get('content-usage') || '';

  const mdContentType = (mdRes?.headers?.get('content-type') || '').toLowerCase();
  const rawMdBody = mdRes && mdRes.ok && mdContentType.includes('text/markdown') ? await mdRes.text() : '';
  const trimmedMd = rawMdBody.trim();
  const isFakeHtmlMarkdown = /^<(?:!doctype|html)\b/i.test(trimmedMd);
  const linkHeader = rawRes?.headers?.get('link') || '';
  const altMdLinkMatch =
    rawHtml.match(/<link[^>]+rel=["']alternate["'][^>]*type=["']text\/markdown["'][^>]*href=["']([^"']+)["']/i) ||
    rawHtml.match(/<link[^>]+type=["']text\/markdown["'][^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) ||
    linkHeader.match(/<([^>]+)>;[^>]*rel=["']?alternate["']?[^>]*type=["']?text\/markdown["']?/i);
  const hasDescribedByLlms =
    /<link[^>]+rel=["']describedby["'][^>]*llms\.txt/i.test(rawHtml) ||
    /llms\.txt[^>]*rel=["']?describedby/i.test(linkHeader);

  let altMdBody = '';
  if (!trimmedMd && altMdLinkMatch && altMdLinkMatch[1]) {
    try {
      const altUrl = new URL(altMdLinkMatch[1], targetUrl).toString();
      const altRes = await fetch(altUrl, { headers: extraHeaders || undefined }).catch(() => null);
      if (altRes && altRes.ok) {
        const txt = (await altRes.text()).trim();
        if (txt.length >= 10 && !/^<(?:!doctype|html)\b/i.test(txt)) altMdBody = txt;
      }
    } catch {}
  }

  const supportsMarkdownForAgents = Boolean((trimmedMd.length >= 10 && !isFakeHtmlMarkdown) || altMdBody.length >= 10);
  const mdBody = trimmedMd.length >= 10 && !isFakeHtmlMarkdown ? rawMdBody : altMdBody;

  const llmsText = llmsRes && llmsRes.ok ? await llmsRes.text() : '';
  const robotsText = robotsRes && robotsRes.ok ? await robotsRes.text() : '';

  const strippedText = rawHtml
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const rawHtmlTokens = estimateTokens(rawHtml);
  const cleanTokens = supportsMarkdownForAgents ? estimateTokens(mdBody) : estimateTokens(strippedText);
  const bloatRatio = Number((rawHtmlTokens / Math.max(cleanTokens, 1)).toFixed(2));
  const tokenSavingsPct = supportsMarkdownForAgents
    ? Math.max(0, Math.round((1 - cleanTokens / Math.max(rawHtmlTokens, 1)) * 100))
    : 0;

  const hasJsonLd = /<script[^>]+type=["']application\/ld\+json["'][^>]*>/i.test(rawHtml);
  const hasLlmsTxt = !!(llmsRes && llmsRes.ok && llmsText.trim().length > 20 && !/^<(?:!doctype|html)\b/i.test(llmsText.trim()));
  const llmsTokens = hasLlmsTxt ? estimateTokens(llmsText) : 0;

  // Full RFC 9309 + Content-Signal + Content-Usage + X-Robots-Tag analysis
  const policy = analyzeAiCrawlerPolicy({
    robotsText,
    targetPath,
    xRobotsTag,
    contentSignalHeader,
    contentUsageHeader,
    rawHtml
  });

  if (strippedText.length < 120) {
    findings.push({
      id: 'robocat-no-js-shell',
      severity: 'high',
      axis: 'agent',
      title: 'No-JS HTML response is an empty SPA shell',
      detail: `Raw HTML contains only ${strippedText.length} characters of visible text without executing JavaScript.`,
      fixHint: 'Enable SSR/SSG or pre-rendering for primary landing/product content so lightweight AI fetchers can read your site.'
    });
    quips.push(`Fetched raw HTML without JS and only found ${strippedText.length} chars — invisible to fast AI readers!`);
  }

  if (!supportsMarkdownForAgents) {
    findings.push({
      id: 'robocat-no-markdown-negotiation',
      severity: 'medium',
      axis: 'agent',
      title: isFakeHtmlMarkdown
        ? 'Fake text/markdown header returned raw HTML body'
        : 'No Markdown for Agents support (Accept: text/markdown returns HTML)',
      detail: isFakeHtmlMarkdown
        ? 'Server responded with Content-Type: text/markdown, but the body begins with <!DOCTYPE/<html>.'
        : `Agent Token-Tax is ${bloatRatio}x (${rawHtmlTokens} HTML tokens vs ${cleanTokens} content tokens). Serving text/markdown cuts agent token cost & latency.`,
      fixHint: 'Return genuine Markdown content (not HTML) when clients send Accept: text/markdown.'
    });
    if (!quips.length) {
      quips.push(
        isFakeHtmlMarkdown
          ? 'Sneaky! Server sent Content-Type: text/markdown but stuffed raw HTML inside!'
          : `No Accept: text/markdown negotiation — AI agents pay a ${bloatRatio}x HTML Token-Tax!`
      );
    }
  }

  if (!hasLlmsTxt) {
    findings.push({
      id: 'robocat-missing-llms-txt',
      severity: 'medium',
      axis: 'agent',
      title: 'Missing /llms.txt AI discovery manifest',
      detail: `GET ${origin}/llms.txt did not return a valid Markdown/plain-text llms.txt guide.`,
      fixHint: 'Publish /llms.txt summarizing key pages, API docs, pricing, and agent entry points in clean Markdown.'
    });
    if (!quips.length) quips.push('Radar pinged /llms.txt and heard crickets (404).');
  } else if (llmsTokens > 25000) {
    findings.push({
      id: 'robocat-llms-txt-bloated',
      severity: 'low',
      axis: 'agent',
      title: `/llms.txt is oversized (~${llmsTokens} tokens)`,
      detail: 'Oversized llms.txt manifests bloat agent context windows and increase truncation risk.',
      fixHint: 'Keep /llms.txt concise (<8,000 tokens) as an index and move deep documentation to linked Markdown endpoints.'
    });
  }

  if (!hasJsonLd) {
    findings.push({
      id: 'robocat-missing-jsonld',
      severity: 'medium',
      axis: 'agent',
      title: 'No JSON-LD structured data (<script type="application/ld+json">)',
      detail: 'Structured Schema.org markup helps AI engines cite products, FAQs, and organizations accurately.',
      fixHint: 'Embed valid Schema.org JSON-LD (Organization, Product, WebApplication, or FAQPage) in <head>.'
    });
  }

  // Tiered AI crawler diagnostics (distinguish live search/user-triggered agents from training bots)
  if (policy.blockedLiveAgents.length > 0) {
    const summary = policy.blockedLiveAgents.map((b) => `${b.bot} (${b.rule})`).join(', ');
    findings.push({
      id: 'robocat-live-ai-agents-blocked',
      severity: 'medium',
      axis: 'agent',
      title: `robots.txt blocks ${policy.blockedLiveAgents.length} live AI search/user agent(s) on ${targetPath}`,
      detail: `RFC 9309 path match blocked real-time retrieval/shopping agents: ${summary}.`,
      fixHint: 'If you only want to block model training, disallow GPTBot/ClaudeBot/Google-Extended while allowing OAI-SearchBot, ChatGPT-User, Claude-User, and Perplexity-User.'
    });
    if (!quips.length) {
      quips.push(`RFC 9309 alert: robots.txt blocks live user agents (${policy.blockedLiveAgents.map((b) => b.bot).join(', ')}) on this path!`);
    }
  }

  if (policy.aiInputBlockedBySignal) {
    findings.push({
      id: 'robocat-content-signal-blocks-ai-input',
      severity: 'medium',
      axis: 'agent',
      title: 'Content-Signal / Content-Usage blocks live AI grounding (ai-input=no)',
      detail: `Parsed AI preference signals: ${JSON.stringify({ ...policy.contentSignals, ...policy.contentUsage })}. Blocking ai-input prevents live citations and shopping retrieval.`,
      fixHint: 'Use "Content-Signal: search=yes, ai-input=yes, ai-train=no" to block model training while keeping live AI search & commerce visibility.'
    });
  }

  if (policy.hasNoAiDirective) {
    findings.push({
      id: 'robocat-x-robots-noai',
      severity: 'medium',
      axis: 'agent',
      title: 'HTTP X-Robots-Tag or <meta name="robots"> declares noai / noimageai',
      detail: `Detected directive: ${policy.xRobotsTag || '<meta name="robots"> noai'}. Even if robots.txt allows access, strict AI agents will skip indexing this page.`,
      fixHint: 'Remove noai from public product/documentation pages or scope it strictly to private/licensed content.'
    });
  }

  // Note: Blocking offline training bots (GPTBot/ClaudeBot) or setting ai-train=no is reported in metrics
  // without penalizing Agent Readiness, because protecting IP from training while allowing live agents is best practice.

  if (quips.length === 0) {
    const signalNote = policy.hasContentSignal ? ' + Content-Signal parsed' : '';
    quips.push(`Radar lock! Markdown saved ${tokenSavingsPct}% tokens (${cleanTokens} tok), RFC 9309 live agents clear${signalNote}.`);
  }

  return {
    findings,
    quips,
    metrics: {
      rawTextChars: strippedText.length,
      supportsMarkdownForAgents,
      isFakeHtmlMarkdown,
      rawHtmlTokens,
      cleanTokens,
      bloatRatio,
      tokenSavingsPct,
      hasLlmsTxt,
      llmsV2AlternateMd: Boolean(altMdLinkMatch),
      llmsV2DescribedBy: hasDescribedByLlms,
      llmsTokens,
      hasJsonLd,
      blockedAiBots: [
        ...policy.blockedLiveAgents.map((b) => b.bot),
        ...policy.blockedTrainingBots.map((b) => b.bot)
      ],
      blockedLiveAgents: policy.blockedLiveAgents,
      blockedTrainingBots: policy.blockedTrainingBots,
      contentSignals: policy.contentSignals,
      contentUsage: policy.contentUsage,
      hasNoAiDirective: policy.hasNoAiDirective,
      xRobotsTag: policy.xRobotsTag
    }
  };
}
