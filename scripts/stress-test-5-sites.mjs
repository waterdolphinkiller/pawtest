#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { runAudit } from '../src/engine/runner.js';
import { startFixtureServer } from '../test/fixture-server.mjs';

const DEFAULT_REAL_SITES = [
  'https://nodejs.org',
  'https://playwright.dev',
  'https://developer.mozilla.org',
  'https://www.shopify.com',
  'https://github.com/explore'
];

async function main() {
  const args = process.argv.slice(2);
  const localSmoke = args.includes('--local-smoke');
  const outDir = path.resolve(process.cwd(), 'pawtest-report');
  fs.mkdirSync(outDir, { recursive: true });

  let fixture = null;
  let targets = [];

  if (localSmoke) {
    fixture = await startFixtureServer();
    targets = [`${fixture.baseUrl}/clean`, `${fixture.baseUrl}/buggy`];
  } else {
    const custom = args.filter((a) => /^https?:\/\//i.test(a));
    const envUrls = (process.env.PAWTEST_STRESS_URLS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    targets = custom.length > 0 ? custom : envUrls.length > 0 ? envUrls : DEFAULT_REAL_SITES;
  }

  const results = [];
  let crashes = 0;

  try {
    for (const url of targets) {
      const t0 = Date.now();
      console.log(`\n[Stress] Auditing (--full, read-only): ${url}`);
      try {
        const report = await runAudit({ url,
          full: true,
          allowMutations: false,
          blockLocalhost: !localSmoke
        });
        const elapsedMs = Date.now() - t0;
        results.push({
          url,
          ok: true,
          elapsedMs,
          human: report.scores.human,
          agent: report.scores.agent,
          catCount: report.cats.length,
          defects: report.cats.reduce((acc, c) => acc + (c.findings?.length || 0), 0)
        });
        console.log(
          `  -> OK in ${(elapsedMs / 1000).toFixed(1)}s | Human: ${report.scores.human.grade} (${report.scores.human.score}) | Agent: ${report.scores.agent.grade} (${report.scores.agent.score})`
        );
      } catch (err) {
        crashes += 1;
        results.push({ url, ok: false, error: err.message });
        console.error(`  -> ERROR: ${err.message}`);
      }
    }
  } finally {
    if (fixture) await fixture.close();
  }

  const summaryPath = path.join(outDir, 'stress-5-sites-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({ generatedAt: new Date().toISOString(), crashes, results }, null, 2));

  const mdLines = [
    '# PawTest 5-Site Full Stress Test Summary',
    '',
    '| Target URL | Status | Time | Human UX | AI Agent | Findings |',
    '| :--- | :--- | :--- | :--- | :--- | :--- |',
    ...results.map((r) =>
      r.ok
        ? `| ${r.url} | PASS | ${(r.elapsedMs / 1000).toFixed(1)}s | ${r.human.grade} (${r.human.score}) | ${r.agent.grade} (${r.agent.score}) | ${r.defects} |`
        : `| ${r.url} | FAIL | - | - | - | ${r.error} |`
    )
  ];
  fs.writeFileSync(path.join(outDir, 'stress-5-sites-summary.md'), mdLines.join('\n') + '\n');
  console.log(`\nSaved summary to ${summaryPath}`);

  if (crashes > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
