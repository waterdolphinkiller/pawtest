import fs from 'node:fs';
import path from 'node:path';
import { runAudit } from './runner.js';

/**
 * Side-by-Side Site Comparison Mode (`pawtest diff <urlA> <urlB>`).
 * Audits two websites with identical settings and produces a structured head-to-head comparison.
 */

export async function runDiffAudit(urlA, urlB, opts = {}) {
  const [reportA, reportB] = await Promise.all([
    runAudit({ ...opts, url: urlA }),
    runAudit({ ...opts, url: urlB })
  ]);

  const totalA = reportA.scores.human.score + reportA.scores.agent.score;
  const totalB = reportB.scores.human.score + reportB.scores.agent.score;
  const winner = totalA === totalB ? 'tie' : totalA > totalB ? 'A' : 'B';

  const catMapB = new Map(reportB.cats.map((c) => [c.catId, c]));
  const catComparison = reportA.cats.map((ca) => {
    const cb = catMapB.get(ca.catId);
    return {
      catId: ca.catId,
      code: ca.code,
      name: ca.name,
      axis: ca.axis,
      scoreA: ca.score,
      scoreB: cb ? cb.score : 0,
      delta: ca.score - (cb ? cb.score : 0)
    };
  });

  return {
    tool: 'pawtest-diff',
    version: reportA.version,
    timestamp: new Date().toISOString(),
    winner,
    siteA: {
      url: reportA.targetUrl,
      human: reportA.scores.human,
      agent: reportA.scores.agent,
      tokenTax: reportA.tokenTax,
      survivalPct: reportA.agentFunnel?.overallSurvivalPct ?? null,
      compoundRisks: reportA.compoundRisks?.length ?? 0
    },
    siteB: {
      url: reportB.targetUrl,
      human: reportB.scores.human,
      agent: reportB.scores.agent,
      tokenTax: reportB.tokenTax,
      survivalPct: reportB.agentFunnel?.overallSurvivalPct ?? null,
      compoundRisks: reportB.compoundRisks?.length ?? 0
    },
    deltas: {
      human: reportA.scores.human.score - reportB.scores.human.score,
      agent: reportA.scores.agent.score - reportB.scores.agent.score,
      combined: totalA - totalB
    },
    catComparison
  };
}

export function generateDiffMarkdown(diff) {
  const fmt = (n) => (n > 0 ? `+${n}` : String(n));
  const lines = [
    `# PawTest v${diff.version} Head-to-Head Comparison`,
    ``,
    `| Metric | Site A (\`${diff.siteA.url}\`) | Site B (\`${diff.siteB.url}\`) | Delta (A vs B) |`,
    `| :--- | :---: | :---: | :---: |`,
    `| **Human UX** | **${diff.siteA.human.grade}** (${diff.siteA.human.score}) | **${diff.siteB.human.grade}** (${diff.siteB.human.score}) | ${fmt(diff.deltas.human)} |`,
    `| **AI Agent Readiness** | **${diff.siteA.agent.grade}** (${diff.siteA.agent.score}) | **${diff.siteB.agent.grade}** (${diff.siteB.agent.score}) | ${fmt(diff.deltas.agent)} |`,
    `| **Agent Funnel Survival** | ${diff.siteA.survivalPct ?? '—'}% | ${diff.siteB.survivalPct ?? '—'}% | — |`,
    `| **Compound Risk Chains** | ${diff.siteA.compoundRisks} | ${diff.siteB.compoundRisks} | — |`,
    ``,
    `## Per-Cat Breakdown`,
    `| Code | Cat | Site A | Site B | Delta |`,
    `| :---: | :--- | :---: | :---: | :---: |`,
    ...diff.catComparison.map((c) => `| ${c.code} | **${c.name}** | ${c.scoreA} | ${c.scoreB} | ${fmt(c.delta)} |`)
  ];
  return lines.join('\n') + '\n';
}

export function writeDiffArtifacts(diff, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'diff-report.json');
  const mdPath = path.join(outDir, 'diff-report.md');
  fs.writeFileSync(jsonPath, JSON.stringify(diff, null, 2));
  fs.writeFileSync(mdPath, generateDiffMarkdown(diff));
  return { jsonPath, mdPath };
}
