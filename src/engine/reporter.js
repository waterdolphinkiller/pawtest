import fs from 'node:fs';
import path from 'node:path';

/**
 * Generates sanitized JSON, Markdown summary (with Token-Tax, Crawl Summary & PR Baseline Delta),
 * and Claude Code / Cursor-ready fix-prompt.md with exact `curl` reproducers & 2026 protocol snippets.
 */

function fmtDelta(n) {
  if (typeof n !== 'number') return '';
  if (n > 0) return ` (+${n})`;
  if (n < 0) return ` (${n})`;
  return ' (±0)';
}

function defaultRepro(finding, targetUrl) {
  if (finding.repro) return finding.repro;
  const origin = (() => { try { return new URL(targetUrl).origin; } catch { return targetUrl; } })();
  if (finding.id === 'robocat-no-markdown-negotiation') return `curl -i -H "Accept: text/markdown" "${targetUrl}"`;
  if (finding.id === 'robocat-missing-llms-txt') return `curl -i "${origin}/llms.txt"`;
  if (finding.id === 'lucky-missing-ucp') return `curl -i "${origin}/.well-known/ucp"`;
  if (finding.id === 'lucky-no-web-bot-auth') return `curl -i -A "SpoofedBot/1.0" "${targetUrl}"`;
  if (finding.id === 'vault-missing-csp') return `curl -sI "${targetUrl}" | grep -i content-security-policy`;
  return null;
}

export function generateFixPrompt(report) {
  const allFindings = [];
  for (const cat of report.cats) {
    for (const f of cat.findings) {
      allFindings.push({ cat: cat.name, catId: cat.catId, code: cat.code, ...f });
    }
  }

  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  allFindings.sort((a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9));

  const lines = [
    `# PawTest v${report.version} Self-Healing Fix Prompt`,
    ``,
    `- **Target**: ${report.targetUrl}`,
    `- **Scores**: Human UX **${report.scores.human.grade} (${report.scores.human.score}/100${fmtDelta(report.diff?.humanDelta)})** · AI Agent Readiness **${report.scores.agent.grade} (${report.scores.agent.score}/100${fmtDelta(report.diff?.agentDelta)})**`,
    `- **Mode**: ${report.mode} (${report.cats.length} cats, ${report.durationMs}ms, read-only=${report.sandbox.readOnly})`
  ];

  if (report.tokenTax) {
    lines.push(
      `- **AI Token-Tax**: ${report.tokenTax.bloatRatio}x (${report.tokenTax.rawHtmlTokens} HTML tokens vs ${report.tokenTax.cleanTokens} content tokens; Markdown negotiation=${report.tokenTax.supportsMarkdown ? 'ON' : 'OFF'})`
    );
  }
  if (report.crawlPages && report.crawlPages.length > 1) {
    lines.push(`- **Multi-Page Crawl**: Audited ${report.crawlPages.length} same-origin pages`);
  }
  lines.push('');

  if (allFindings.length === 0) {
    lines.push(`All ${report.cats.length} cats passed with zero defects. No code changes required.`);
    return lines.join('\n');
  }

  lines.push(`## Prioritized Defects to Fix (${allFindings.length})`);
  lines.push('');

  allFindings.forEach((f, idx) => {
    const repro = defaultRepro(f, report.targetUrl);
    lines.push(`${idx + 1}. **[${f.severity.toUpperCase()} · ${f.axis.toUpperCase()}] ${f.title}** *(caught by ${f.code} ${f.cat})*`);
    lines.push(`   - **Finding**: ${f.detail}`);
    if (repro) lines.push(`   - **Reproduce**: \`${repro}\``);
    lines.push(`   - **Fix**: ${f.fixHint}`);
    lines.push(`   - **Verify**: \`npx pawtest ${report.targetUrl} --cat ${f.catId}\``);
  });

  const findingIds = new Set(allFindings.map((f) => f.id));
  const snippets = [];

  if (findingIds.has('musebot-no-webmcp') || findingIds.has('musebot-legacy-webmcp-api')) {
    snippets.push([
      `### Starter Snippet: W3C WebMCP (\`document.modelContext\`)`,
      '```js',
      `document.modelContext?.registerTool({`,
      `  name: 'search_catalog',`,
      `  description: 'Search products by keyword and return matching items.',`,
      `  inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },`,
      `  execute: async ({ query }) => ({ ok: true, query })`,
      `});`,
      '```'
    ].join('\n'));
  }

  if (findingIds.has('lucky-missing-ucp')) {
    snippets.push([
      `### Starter Snippet: \`/.well-known/ucp\` (Universal Commerce Protocol)`,
      '```json',
      `{`,
      `  "ucp_version": "2026-11",`,
      `  "merchant": { "name": "Your Store" },`,
      `  "capabilities": ["catalog", "checkout_handoff", "web_bot_auth"],`,
      `  "endpoints": { "catalog": "/products", "checkout": "/api/checkout" }`,
      `}`,
      '```'
    ].join('\n'));
  }

  if (findingIds.has('robocat-no-markdown-negotiation')) {
    snippets.push([
      `### Starter Snippet: Markdown for Agents (\`Accept: text/markdown\`)`,
      '```js',
      `if ((req.headers['accept'] || '').includes('text/markdown')) {`,
      `  res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });`,
      `  return res.end('# Page Title\\n\\nConcise agent-ready Markdown summary...');`,
      `}`,
      '```'
    ].join('\n'));
  }

  if (snippets.length > 0) {
    lines.push('', '## Ready-to-Paste 2026 Agent Protocol Snippets', '', ...snippets);
  }

  lines.push(
    '',
    `## Re-verification Command`,
    `After applying fixes, re-run only the failed cats via MCP (\`pawtest_cat\`) or CLI:`,
    `\`npx pawtest ${report.targetUrl} --cat ${[...new Set(allFindings.map((f) => f.catId))].join(',')}\``
  );

  return lines.join('\n');
}

export function generateMarkdownReport(report) {
  const h = report.scores.human;
  const a = report.scores.agent;
  const hd = fmtDelta(report.diff?.humanDelta);
  const ad = fmtDelta(report.diff?.agentDelta);

  const lines = [
    `# PawTest v${report.version} Dual-Axis QA Report`,
    ``,
    `| Dimension | Grade | Score | Critical | High | Cats Run |`,
    `| :--- | :---: | :---: | :---: | :---: | :---: |`,
    `| **Human UX** | **${h.grade}** | ${h.score}/100${hd} | ${h.criticalCount} | ${h.highCount} | ${h.catsRun} |`,
    `| **AI Agent Readiness** | **${a.grade}** | ${a.score}/100${ad} | ${a.criticalCount} | ${a.highCount} | ${a.catsRun} |`,
    ``,
    `**Target**: \`${report.targetUrl}\` · **Duration**: ${(report.durationMs / 1000).toFixed(2)}s · **Read-only Sandbox**: ${report.sandbox.readOnly ? 'ON' : 'OFF'} (Blocked mutations: ${report.sandbox.mutationsBlocked}, Redactions: ${report.sandbox.redactionsApplied})`
  ];

  if (report.tokenTax) {
    lines.push(
      `**AI Token-Tax**: \`${report.tokenTax.bloatRatio}x\` (${report.tokenTax.rawHtmlTokens} HTML tokens → ${report.tokenTax.cleanTokens} content tokens · Markdown for Agents: ${report.tokenTax.supportsMarkdown ? `ON, -${report.tokenTax.tokenSavingsPct}%` : 'OFF'})`
    );
  }

  if (report.preset) {
    lines.push(
      `**Preset**: \`${report.preset}\`${report.ignoredFindingCount ? ` (suppressed ${report.ignoredFindingCount} out-of-scope finding(s))` : ''}`
    );
  }

  if (Array.isArray(report.flowResults) && report.flowResults.length > 0) {
    lines.push(
      ``,
      `## Multi-Step Funnel Results (${report.flowResults.length} steps)`,
      `| # | Step | Action | Status | Time | Detail |`,
      `| :---: | :--- | :---: | :---: | :---: | :--- |`,
      ...report.flowResults.map((st) =>
        `| ${st.step} | ${st.name} | \`${st.action}\` | ${st.status.toUpperCase()} | ${st.durationMs}ms | ${(st.error || (st.metrics ? `AX controls: ${st.metrics.namedAxControls}` : st.url || '')).replace(/\|/g, '\\|')} |`
      )
    );
  }

  if (report.agentFunnel) {
    lines.push(
      `**AI Agent Funnel Survival**: \`${report.agentFunnel.overallSurvivalPct}%\` (Potential after Top 3 fixes: \`${report.agentFunnel.potentialAfterTopFixesPct}%\`)`
    );
  }

  if (Array.isArray(report.compoundRisks) && report.compoundRisks.length > 0) {
    lines.push(
      ``,
      `## Compound Risk Chains (${report.compoundRisks.length})`,
      ...report.compoundRisks.map((ch) => `- **[${ch.severity.toUpperCase()}] ${ch.title}**: ${ch.impact} *(Remediation: ${ch.remediation})*`)
    );
  }

  if (report.diff) {
    lines.push(
      `**Baseline Diff**: Newly fixed \`${report.diff.newlyFixed.length}\` · New regressions \`${report.diff.newRegressions.length}\``
    );
  }

  if (report.crawlPages && report.crawlPages.length > 1) {
    lines.push(
      ``,
      `## Multi-Page Crawl Summary (${report.crawlPages.length} pages)`,
      `| Page | Human UX | AI Agent |`,
      `| :--- | :---: | :---: |`,
      ...report.crawlPages.map((p) => `| \`${p.url}\` | ${p.humanGrade} (${p.humanScore}) | ${p.agentGrade} (${p.agentScore}) |`)
    );
  }

  lines.push(
    ``,
    `## Top Cat Verdicts`,
    ...report.topRoasts.map((r) => `- ${r}`),
    ``,
    `## Squad Breakdown`,
    `| Code | Cat | Axis | Status | Score | Summary |`,
    `| :---: | :--- | :---: | :---: | :---: | :--- |`
  );

  for (const cat of report.cats) {
    const icon = cat.status === 'pass' ? 'PASS' : cat.status === 'warn' ? 'WARN' : 'FAIL';
    const note = (cat.quips[0] || '').replace(/\|/g, '\\|');
    lines.push(`| ${cat.code} | **${cat.name}** | ${cat.axis} | ${icon} | ${cat.score} | ${note} |`);
  }

  return lines.join('\n');
}

export function writeReportArtifacts(report, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'report.json');
  const mdPath = path.join(outputDir, 'report.md');
  const fixPath = path.join(outputDir, 'fix-prompt.md');

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(mdPath, generateMarkdownReport(report), 'utf8');
  fs.writeFileSync(fixPath, generateFixPrompt(report), 'utf8');

  return { jsonPath, mdPath, fixPath };
}
