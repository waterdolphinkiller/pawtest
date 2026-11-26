/**
 * Defensive Compound Risk Correlator & Deterministic AI Agent Funnel Survival Estimator.
 *
 * 1) Correlates cross-cat defensive findings into prioritized remediation chains
 *    (so teams know which 2-3 combined gaps pose the highest operational risk).
 * 2) Translates technical 16-cat metrics into a clear 4-stage Agent Funnel Survival Rate (%).
 */

export function analyzeCompoundRisks(catReports = []) {
  const byId = new Map();
  for (const cat of catReports) {
    for (const f of cat.findings || []) {
      byId.set(f.id, { ...f, catId: cat.catId, catName: cat.name });
    }
  }

  const chains = [];

  if (byId.has('antidote-prompt-injection') && byId.has('sentinel-missing-confirm-gate')) {
    chains.push({
      id: 'chain-untrusted-action-path',
      severity: 'critical',
      title: 'Untrusted Content + Unguarded High-Impact Action',
      involvedFindings: ['antidote-prompt-injection', 'sentinel-missing-confirm-gate'],
      impact: 'Untrusted text in the page can influence an autonomous browser agent that has direct access to an unguarded destructive or payment button.',
      remediation: 'Sanitize untrusted DOM/JSON-LD/Markdown content AND add an explicit <dialog> confirmation gate + Event.isTrusted check on destructive actions.'
    });
  }

  if (byId.has('antidote-prompt-injection') && (byId.has('vault-missing-csp') || byId.has('vault-exposed-secrets'))) {
    chains.push({
      id: 'chain-data-egress-surface',
      severity: 'critical',
      title: 'Prompt Injection Surface + Weak Content Security Policy / Exposed Secrets',
      involvedFindings: [
        'antidote-prompt-injection',
        ...(byId.has('vault-missing-csp') ? ['vault-missing-csp'] : []),
        ...(byId.has('vault-exposed-secrets') ? ['vault-exposed-secrets'] : [])
      ],
      impact: 'Weak CSP or client-exposed credentials amplify the blast radius if an agent is tricked into loading external beacons or leaking session state.',
      remediation: 'Enforce strict Content-Security-Policy (img-src/connect-src allowlists), rotate exposed client keys, and strip untrusted prompt directives.'
    });
  }

  if (
    (byId.has('musebot-price-parity-mismatch') || byId.has('musebot-strikethrough-price-unmarked')) &&
    byId.has('sentinel-missing-confirm-gate')
  ) {
    chains.push({
      id: 'chain-checkout-price-confusion',
      severity: 'high',
      title: 'Ambiguous Pricing + Missing Checkout Confirmation Gate',
      involvedFindings: [
        ...(byId.has('musebot-price-parity-mismatch') ? ['musebot-price-parity-mismatch'] : []),
        ...(byId.has('musebot-strikethrough-price-unmarked') ? ['musebot-strikethrough-price-unmarked'] : []),
        'sentinel-missing-confirm-gate'
      ],
      impact: 'Autonomous shopping agents may misread promotional or stale JSON-LD prices and proceed directly into checkout without explicit price confirmation.',
      remediation: 'Use semantic <del> tags for struck-through prices, align JSON-LD Offer.price with DOM text, and enforce a final confirmation dialog.'
    });
  }

  if (byId.has('lucky-waf-hard-blocked') && byId.has('robocat-live-ai-agents-blocked')) {
    chains.push({
      id: 'chain-total-agent-lockout',
      severity: 'high',
      title: 'Dual Lockout: robots.txt + Anti-Bot WAF Both Block Live AI Agents',
      involvedFindings: ['lucky-waf-hard-blocked', 'robocat-live-ai-agents-blocked'],
      impact: 'Both policy layer (robots.txt) and network edge (WAF) block verified AI search and shopping agents, dropping AI discovery and commerce to 0%.',
      remediation: 'Allow live user-triggered agents in robots.txt (while optionally keeping ai-train=no) and admit RFC 9421 verified agents at the WAF.'
    });
  }

  return chains;
}

export function computeAgentSurvivalFunnel(report) {
  const byId = new Set((report?.cats || []).flatMap((c) => (c.findings || []).map((f) => f.id)));

  // Stage 1: Network & WAF Admission
  let accessPct = 100;
  if (report.mainHttpStatus >= 400) accessPct = 0;
  else if (byId.has('lucky-waf-hard-blocked') || byId.has('lucky-402-blocks-humans')) accessPct = 10;
  else {
    if (byId.has('lucky-http-js-challenge')) accessPct -= 25;
    if (byId.has('robocat-live-ai-agents-blocked')) accessPct -= 30;
    if (byId.has('robocat-content-signal-blocks-ai-input') || byId.has('robocat-x-robots-noai')) accessPct -= 15;
  }
  accessPct = Math.max(0, accessPct);

  // Stage 2: Content & Markdown Readability
  let readPct = 100;
  if (byId.has('robocat-no-js-shell')) readPct -= 45;
  if (byId.has('robocat-no-markdown-negotiation')) readPct -= 15;
  if (byId.has('robocat-missing-llms-txt')) readPct -= 10;
  if (byId.has('robocat-missing-jsonld')) readPct -= 10;
  readPct = Math.max(10, readPct);

  // Stage 3: Semantic & Price Accuracy
  let semanticPct = 100;
  if (byId.has('musebot-price-obfuscated')) semanticPct -= 35;
  if (byId.has('musebot-price-parity-mismatch')) semanticPct -= 30;
  if (byId.has('musebot-strikethrough-price-unmarked')) semanticPct -= 20;
  if (byId.has('antidote-prompt-injection')) semanticPct -= 25;
  semanticPct = Math.max(10, semanticPct);

  // Stage 4: Action & Checkout Execution
  let actionPct = 100;
  if (byId.has('musebot-cta-axtree-blocked')) actionPct -= 40;
  if (byId.has('musebot-unlabeled-controls')) actionPct -= 20;
  if (byId.has('musebot-nonsemantic-clickables')) actionPct -= 20;
  if (byId.has('musebot-no-webmcp')) actionPct -= 10;
  if (byId.has('lucky-missing-ucp')) actionPct -= 10;
  actionPct = Math.max(10, actionPct);

  const overallSurvivalPct = Math.round((accessPct / 100) * (readPct / 100) * (semanticPct / 100) * (actionPct / 100) * 100);
  const potentialAfterTopFixesPct = Math.min(98, Math.max(overallSurvivalPct, Math.min(100, overallSurvivalPct + (100 - overallSurvivalPct) * 0.72 | 0)));

  return {
    overallSurvivalPct,
    potentialAfterTopFixesPct,
    stages: [
      { stage: '1. WAF & Crawler Admission', survivalPct: accessPct },
      { stage: '2. Content & Markdown Readability', survivalPct: readPct },
      { stage: '3. Price & Semantic Accuracy', survivalPct: semanticPct },
      { stage: '4. CTA & Checkout Execution', survivalPct: actionPct }
    ]
  };
}
