import fs from 'node:fs';
import path from 'node:path';

/**
 * Enterprise SARIF 2.1.0 Exporter for GitHub Code Scanning / Security tab.
 * Maps PawTest Human UX, Security & AI Agent Readiness findings to standard SARIF rules & results.
 */

function mapSeverityToSarifLevel(severity) {
  switch (String(severity || '').toLowerCase()) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    default:
      return 'note';
  }
}

function mapSeverityToSecurityScore(severity) {
  switch (String(severity || '').toLowerCase()) {
    case 'critical': return '9.2';
    case 'high': return '7.8';
    case 'medium': return '5.4';
    default: return '2.5';
  }
}

export function generateSarifReport(report) {
  const rulesMap = new Map();
  const results = [];
  const targetUri = (() => {
    try {
      const u = new URL(report.targetUrl);
      return u.pathname && u.pathname !== '/' ? u.pathname.replace(/^\/+/, '') : 'index.html';
    } catch {
      return 'index.html';
    }
  })();

  for (const cat of report?.cats || []) {
    for (const f of cat.findings || []) {
      const ruleId = f.id || `${cat.catId}-finding`;
      if (!rulesMap.has(ruleId)) {
        rulesMap.set(ruleId, {
          id: ruleId,
          name: `${cat.name}:${ruleId}`,
          shortDescription: { text: f.title || ruleId },
          fullDescription: { text: f.detail || f.title || ruleId },
          help: {
            text: f.fixHint || 'Review PawTest fix-prompt.md for remediation.',
            markdown: `**${cat.code} ${cat.name}** (${cat.axis} axis)\n\n- **Issue**: ${f.detail || f.title}\n- **Fix**: ${f.fixHint || 'See fix-prompt.md'}`
          },
          properties: {
            tags: ['pawtest', cat.axis, cat.catId, f.severity || 'medium'],
            'security-severity': mapSeverityToSecurityScore(f.severity)
          }
        });
      }

      results.push({
        ruleId,
        level: mapSeverityToSarifLevel(f.severity),
        message: {
          text: `[${cat.code} ${cat.name}] ${f.title}: ${f.detail || ''} (Fix: ${f.fixHint || 'N/A'})`.trim()
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: targetUri },
              region: { startLine: 1 }
            }
          }
        ],
        properties: {
          targetUrl: report.targetUrl,
          catId: cat.catId,
          axis: f.axis || cat.axis,
          severity: f.severity || 'medium'
        }
      });
    }
  }

  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'PawTest',
            version: report?.version || '3.0.0',
            informationUri: 'https://pawtest.dev',
            rules: Array.from(rulesMap.values())
          }
        },
        results
      }
    ]
  };
}

export function writeSarifArtifact(report, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const sarifPath = path.join(outDir, 'pawtest.sarif');
  fs.writeFileSync(sarifPath, JSON.stringify(generateSarifReport(report), null, 2));
  return sarifPath;
}
