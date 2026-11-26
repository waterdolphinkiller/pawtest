import fs from 'node:fs';
import path from 'node:path';

/**
 * Community Flywheel Scaffolder: `npx pawtest --init-cat <name>`
 * Generates a clean <80-line QA cat plugin ready for immediate testing & PR contribution.
 */
export function scaffoldNewCat(rawName, targetDir = path.resolve('src/cats')) {
  const id = String(rawName || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .trim();

  if (!id || id.length < 2) {
    throw new Error('Invalid cat name. Use lowercase letters/numbers (e.g. --init-cat stripe-guard).');
  }

  const displayName = id
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');

  fs.mkdirSync(targetDir, { recursive: true });
  const filePath = path.join(targetDir, `${id}.js`);
  if (fs.existsSync(filePath)) {
    throw new Error(`Cat plugin already exists at "${filePath}". Pick a different name.`);
  }

  const content = `/**
 * Custom Cat · ${displayName} — Domain-Specific Deterministic QA Agent.
 * Generated via \`npx pawtest --init-cat ${id}\`
 */

export const meta = {
  id: '${id}',
  code: 'E1',
  name: '${displayName}',
  title: '${displayName} · Custom QA Cat',
  squad: 'D',        // 'A' | 'B' | 'C' | 'D'
  axis: 'agent',     // 'human' | 'agent' | 'dual'
  mode: 'full',      // 'fast' | 'full'
  color: '#14b8a6',
  accentColor: '#5eead4',
  prop: 'Custom Optical Prop',
  description: 'Custom deterministic QA check contributed via PawTest Cat #17 scaffold.'
};

export async function run(ctx) {
  const { page, targetUrl, isMutationBlocked, recordBlockedMutation } = ctx;
  const findings = [];
  const quips = [];

  const check = await page.evaluate(\`(() => {
    return { title: document.title || '', hasBody: (document.body.innerText || '').trim().length > 0 };
  })()\`);

  if (!check.hasBody) {
    findings.push({
      id: '${id}-empty-body',
      severity: 'high',
      axis: 'agent',
      title: '${displayName} detected an empty rendered page body',
      detail: \`Target \${targetUrl} rendered zero visible text.\`,
      fixHint: 'Ensure primary content renders cleanly without requiring blocked scripts.'
    });
    quips.push('${displayName} prowled the page and found nothing inside!');
  } else {
    quips.push('${displayName} verified the page cleanly — zero defects!');
  }

  return { findings, quips, metrics: check };
}
`;

  fs.writeFileSync(filePath, content, 'utf8');
  return { id, displayName, filePath };
}
