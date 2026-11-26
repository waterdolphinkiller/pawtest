import fs from 'node:fs';
import path from 'node:path';

/**
 * Generates crisp, zero-dependency, Shields-style SVG badges for GitHub READMEs:
 *  - pawtest-badge.svg           : PawTest | Human S (100) · Agent S (100)
 *  - pawtest-tokentax-badge.svg  : AI Token-Tax | 1.4x · MD ON
 */

function gradeHex(grade) {
  switch (grade) {
    case 'S': return '#16a34a';
    case 'A': return '#059669';
    case 'B': return '#2563eb';
    case 'C': return '#d97706';
    case 'D': return '#ea580c';
    default:  return '#dc2626';
  }
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildShieldSvg(leftText, rightText, rightColor) {
  const leftW = Math.max(66, leftText.length * 7.2 + 18);
  const rightW = Math.max(90, rightText.length * 6.8 + 20);
  const totalW = Math.round(leftW + rightW);
  const lx = Math.round(leftW / 2);
  const rx = Math.round(leftW + rightW / 2);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="24" role="img" aria-label="${escapeXml(leftText)}: ${escapeXml(rightText)}">
  <linearGradient id="g" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".12"/>
    <stop offset="1" stop-opacity=".14"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalW}" height="24" rx="5" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${Math.round(leftW)}" height="24" fill="#1c1917"/>
    <rect x="${Math.round(leftW)}" width="${Math.round(rightW)}" height="24" fill="${rightColor}"/>
    <rect width="${totalW}" height="24" fill="url(#g)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11" font-weight="700">
    <text x="${lx}" y="16">${escapeXml(leftText)}</text>
    <text x="${rx}" y="16">${escapeXml(rightText)}</text>
  </g>
</svg>`;
}

/**
 * Writes README SVG badge(s) into `outputDir` and returns file paths + Markdown snippet.
 * @param {import('../../types/index.d.ts').AuditReport} report
 * @param {string} outputDir
 */
export function writeReadmeBadges(report, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const h = report.scores.human;
  const a = report.scores.agent;
  const worstScore = Math.min(h.score, a.score);
  const badgeColor = gradeHex(worstScore >= 95 ? 'S' : worstScore >= 85 ? 'A' : worstScore >= 75 ? 'B' : worstScore >= 60 ? 'C' : worstScore >= 45 ? 'D' : 'F');

  const scoreSvg = buildShieldSvg('PawTest', `Human ${h.grade} (${h.score}) · Agent ${a.grade} (${a.score})`, badgeColor);
  const scoreBadgePath = path.join(outputDir, 'pawtest-badge.svg');
  fs.writeFileSync(scoreBadgePath, scoreSvg, 'utf8');

  let tokenTaxBadgePath = null;
  if (report.tokenTax) {
    const taxColor = report.tokenTax.supportsMarkdown ? '#059669' : report.tokenTax.bloatRatio <= 3 ? '#2563eb' : '#d97706';
    const taxLabel = `${report.tokenTax.bloatRatio}x · MD ${report.tokenTax.supportsMarkdown ? 'ON' : 'OFF'}`;
    const taxSvg = buildShieldSvg('AI Token-Tax', taxLabel, taxColor);
    tokenTaxBadgePath = path.join(outputDir, 'pawtest-tokentax-badge.svg');
    fs.writeFileSync(tokenTaxBadgePath, taxSvg, 'utf8');
  }

  return {
    scoreBadgePath,
    tokenTaxBadgePath,
    markdownSnippet: `![PawTest Dual-Axis Score](./pawtest-report/pawtest-badge.svg)`
  };
}
