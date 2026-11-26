/**
 * Dual-Axis Scoring Engine + Baseline Regression Diff:
 *   1. Human UX Score (0–100, S–F): Squads A, B + C1 (Vault), C3 (Leak), C4 (Clever)
 *   2. AI Agent Readiness Score (0–100, S–F): C1 (Vault), C2 (RoboCat), C4 (Clever) + Squad D
 */

export const SEVERITY_PENALTIES = {
  critical: 30,
  high: 18,
  medium: 9,
  low: 4,
  info: 0
};

export function scoreToGrade(score) {
  if (score >= 95) return 'S';
  if (score >= 85) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

export function computeCatScore(findings) {
  let penalty = 0;
  for (const f of findings) {
    penalty += SEVERITY_PENALTIES[f.severity] ?? 5;
  }
  return Math.max(0, Math.min(100, 100 - penalty));
}

export function deriveCatStatus(findings, score) {
  if (findings.some((f) => f.severity === 'critical' || f.severity === 'high') || score < 65) {
    return 'fail';
  }
  if (findings.some((f) => f.severity === 'medium' || f.severity === 'low') || score < 95) {
    return 'warn';
  }
  return 'pass';
}

export function computeDualScores(catReports) {
  const humanCats = catReports.filter((c) => c.status !== 'skipped' && (c.axis === 'human' || c.axis === 'dual'));
  const agentCats = catReports.filter((c) => c.status !== 'skipped' && (c.axis === 'agent' || c.axis === 'dual'));

  const calcAxis = (cats, axisName) => {
    if (cats.length === 0) {
      return { score: 100, grade: scoreToGrade(100), catsRun: 0, criticalCount: 0, highCount: 0 };
    }
    let total = 0;
    let criticalCount = 0;
    let highCount = 0;

    for (const cat of cats) {
      const relevantFindings = cat.axis === 'dual'
        ? cat.findings.filter((f) => f.axis === axisName)
        : cat.findings;
      const catAxisScore = cat.status === 'error' ? 50 : computeCatScore(relevantFindings);
      total += catAxisScore;
      for (const f of relevantFindings) {
        if (f.severity === 'critical') criticalCount++;
        if (f.severity === 'high') highCount++;
      }
    }

    const avg = Math.round(total / cats.length);
    return {
      score: avg,
      grade: scoreToGrade(avg),
      catsRun: cats.length,
      criticalCount,
      highCount
    };
  };

  return {
    human: calcAxis(humanCats, 'human'),
    agent: calcAxis(agentCats, 'agent')
  };
}

export function pickTopRoasts(catReports) {
  const severityRank = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  const scored = [];
  for (const cat of catReports) {
    if (cat.quips.length > 0 && cat.findings.length > 0) {
      const maxSev = Math.max(...cat.findings.map((f) => severityRank[f.severity] ?? 0));
      scored.push({ rank: maxSev * 100 + (100 - cat.score), text: `[${cat.name}] ${cat.quips[0]}` });
    }
  }
  scored.sort((a, b) => b.rank - a.rank);
  const top = scored.slice(0, 3).map((s) => s.text);
  if (top.length === 0) {
    return ['All cats purred in approval — zero critical defects caught!'];
  }
  return top;
}

/**
 * Computes regression/improvement deltas between a baseline AuditReport and the current run.
 */
export function computeBaselineDiff(currentReport, baselineReport) {
  if (!baselineReport || !baselineReport.scores) return null;
  const humanDelta = currentReport.scores.human.score - baselineReport.scores.human.score;
  const agentDelta = currentReport.scores.agent.score - baselineReport.scores.agent.score;

  const baseFindings = new Set();
  for (const c of baselineReport.cats || []) {
    for (const f of c.findings || []) baseFindings.add(`${c.catId}:${f.id}`);
  }
  const curFindings = new Set();
  for (const c of currentReport.cats || []) {
    for (const f of c.findings || []) curFindings.add(`${c.catId}:${f.id}`);
  }

  const newlyFixed = [...baseFindings].filter((id) => !curFindings.has(id));
  const newRegressions = [...curFindings].filter((id) => !baseFindings.has(id));

  return {
    baselineTimestamp: baselineReport.timestamp || null,
    humanDelta,
    agentDelta,
    newlyFixed,
    newRegressions
  };
}
