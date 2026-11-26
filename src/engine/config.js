import fs from 'node:fs';
import path from 'node:path';

/**
 * Site Presets & Configuration Loader (`pawtest.config.json` / `.pawtestrc.json`).
 * Prevents irrelevant findings (e.g., commerce UCP checks on a personal blog or docs site)
 * from polluting CI gates.
 */

export const SITE_PRESETS = {
  ecommerce: {
    description: 'Full Human UX + Agentic Commerce (UCP/ACP/AP2, Price Parity, CTAs, WAF, Security)',
    ignoreFindings: [],
    ignoreCats: []
  },
  saas: {
    description: 'Web App / SaaS (focuses on Auth, Security, WCAG, WebMCP, Prompt Injection & Rate Limits)',
    ignoreFindings: ['lucky-missing-ucp', 'lucky-missing-price-schema'],
    ignoreCats: []
  },
  docs: {
    description: 'Documentation / Developer Portal (focuses on /llms.txt, Markdown Token-Tax, SEO, WCAG & Links)',
    ignoreFindings: ['lucky-missing-ucp', 'lucky-missing-price-schema', 'sentinel-missing-confirm-gate'],
    ignoreCats: []
  },
  blog: {
    description: 'Content Site / Blog (focuses on Human UX, CWV, SEO, Content-Signal & Markdown Readability)',
    ignoreFindings: [
      'lucky-missing-ucp',
      'lucky-missing-price-schema',
      'musebot-no-webmcp',
      'sentinel-no-rate-limit',
      'sentinel-missing-confirm-gate'
    ],
    ignoreCats: []
  }
};

export function loadProjectConfig({ configPath = null, cwd = process.cwd() } = {}) {
  const candidates = configPath
    ? [path.resolve(cwd, configPath)]
    : [path.join(cwd, 'pawtest.config.json'), path.join(cwd, '.pawtestrc.json')];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { path: file, data: parsed && typeof parsed === 'object' ? parsed : {} };
    } catch (err) {
      throw new Error(`Invalid JSON in PawTest config "${file}": ${err.message}`);
    }
  }
  if (configPath) {
    throw new Error(`Config file not found: "${configPath}"`);
  }
  return { path: null, data: {} };
}

export function resolveEffectivePolicy({ preset = null, ignoreFindings = [], ignoreCats = [], configData = {} } = {}) {
  const effectivePreset = (preset || configData.preset || 'ecommerce').toLowerCase();
  if (!SITE_PRESETS[effectivePreset]) {
    throw new Error(`Unknown preset "${effectivePreset}". Valid presets: ${Object.keys(SITE_PRESETS).join(', ')}`);
  }
  const presetDef = SITE_PRESETS[effectivePreset];
  const mergedIgnoreFindings = new Set([
    ...presetDef.ignoreFindings,
    ...(Array.isArray(configData.ignoreFindings) ? configData.ignoreFindings : []),
    ...(Array.isArray(ignoreFindings) ? ignoreFindings : [])
  ]);
  const mergedIgnoreCats = new Set([
    ...presetDef.ignoreCats,
    ...(Array.isArray(configData.ignoreCats) ? configData.ignoreCats : []),
    ...(Array.isArray(ignoreCats) ? ignoreCats : [])
  ]);

  return {
    preset: effectivePreset,
    ignoreFindings: mergedIgnoreFindings,
    ignoreCats: mergedIgnoreCats
  };
}
