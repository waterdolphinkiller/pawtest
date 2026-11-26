import path from 'node:path';
import { runAudit, runCrawlAudit } from './engine/runner.js';
import { writeReportArtifacts } from './engine/reporter.js';
import { ALL_CATS } from './cats/index.js';

const HELP_TEXT = `
PawTest v3.1.1 — 16 Pure-Code Optical Cat QA Agents (Human UX x AI Agent Readiness)

Usage:
  pawtest <url> [options]
  pawtest diff <urlA> <urlB> [--full] [--share-card] [--out <dir>]

Options:
  --full                   Run all 16 cats (default: 8 fast cats)
  --viral                  All-in-one launch bundle: --full + --share-card + --gif + --badge
  --cat <ids>              Run specific cat(s), comma-separated (e.g. --cat vault,musebot,lucky)
  --out <dir>              Write report.json, report.md, fix-prompt.md (default: ./pawtest-report)
  --share-card             Export 1200x630 dual-score PNG share card into --out dir
  --gif                    Export 5-second annotated crime-scene failure replay GIF into --out dir
  --badge                  Export dynamic GitHub README SVG badges (dual score + AI Token-Tax)
  --stage                  Launch local SSE live 3D WebGL2 optical cat stage (stays open until Ctrl+C)
  --stage-no-wait          Close --stage server immediately after audit completes (useful for CI/scripts)
  --crawl <n>              Shallow same-origin multi-page crawl (1-10 pages, default 1)
  --baseline <file>        Compare against a previous report.json to compute regression deltas
  --preset <type>          Site preset: ecommerce (default) | saas | docs | blog
  --config <file>          Path to pawtest.config.json (auto-detected if present)
  --flow <file>            Multi-step funnel JSON (fill/click/wait/goto/assertText)
  --header "K: V"          Extra HTTP header for auth/staging (repeatable, auto-redacted)
  --storage-state <file>   Inject authenticated cookies/localStorage JSON for logged-in audits
  --save-storage <file>    Capture current session cookies & localStorage to JSON
  --apply-scaffolds <dir>  Write ready-to-commit llms.txt/robots.txt/.well-known/WebMCP files
  --pure-js-gif            Force zero-ffmpeg pure-JS animated GIF89a encoder
  --sarif                  Export enterprise SARIF 2.1.0 report (pawtest.sarif) for GitHub Security
  --watch [dir]            Watch local files & incrementally re-run only failing/warning cats
  --init-cat <name>        Scaffold a new Cat #17 plugin in src/cats/<name>.js and exit
  --json                   Print sanitized JSON report directly to stdout
  --timeout <ms>           Per-cat timeout in ms (default: 8000)
  --allow-mutations        Allow clicking destructive/checkout actions (default: read-only sandbox)
  --allow-private-ip       Allow private RFC1918 IP targets
  --block-localhost        Disallow localhost/127.0.0.1 targets (recommended for multi-tenant CI)
  --list-cats              List all available QA cats and exit
  --mcp                    Start the 3-tool stdio MCP server
  -h, --help               Show this help message
`.trim();

export function parseArgs(argv) {
  const opts = {
    url: '',
    full: false,
    viral: false,
    cats: null,
    outDir: './pawtest-report',
    shareCard: false,
    gif: false,
    badge: false,
    stage: false,
    stageNoWait: false,
    crawl: 1,
    baselinePath: null,
    preset: null,
    configPath: null,
    flowPath: null,
    extraHeaders: {},
    storageStatePath: null,
    saveStoragePath: null,
    applyScaffoldsDir: null,
    pureJsGif: false,
    sarif: false,
    watchDir: null,
    initCat: null,
    json: false,
    timeoutMs: 8000,
    allowMutations: false,
    allowPrivateIp: false,
    blockLocalhost: false,
    listCats: false,
    mcp: false,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '--full') opts.full = true;
    else if (arg === '--viral') {
      opts.viral = true;
      opts.full = true;
      opts.shareCard = true;
      opts.gif = true;
      opts.badge = true;
    } else if (arg === '--json') opts.json = true;
    else if (arg === '--share-card') opts.shareCard = true;
    else if (arg === '--gif') opts.gif = true;
    else if (arg === '--badge') opts.badge = true;
    else if (arg === '--stage') opts.stage = true;
    else if (arg === '--stage-no-wait') opts.stageNoWait = true;
    else if (arg === '--allow-mutations') opts.allowMutations = true;
    else if (arg === '--allow-private-ip') opts.allowPrivateIp = true;
    else if (arg === '--block-localhost') opts.blockLocalhost = true;
    else if (arg === '--list-cats') opts.listCats = true;
    else if (arg === '--mcp') opts.mcp = true;
    else if (arg === '--cat' && argv[i + 1]) {
      opts.cats = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg === '--out' && argv[i + 1]) {
      opts.outDir = argv[++i];
    } else if (arg === '--crawl' && argv[i + 1]) {
      opts.crawl = Math.max(1, Math.min(10, Number(argv[++i]) || 1));
    } else if (arg === '--baseline' && argv[i + 1]) {
      opts.baselinePath = argv[++i];
    } else if (arg === '--preset' && argv[i + 1]) {
      opts.preset = argv[++i];
    } else if (arg === '--config' && argv[i + 1]) {
      opts.configPath = argv[++i];
    } else if (arg === '--flow' && argv[i + 1]) {
      opts.flowPath = argv[++i];
    } else if (arg === '--header' && argv[i + 1]) {
      const rawH = argv[++i];
      const idx = rawH.indexOf(':');
      if (idx > 0) opts.extraHeaders[rawH.slice(0, idx).trim()] = rawH.slice(idx + 1).trim();
    } else if (arg === '--storage-state' && argv[i + 1]) {
      opts.storageStatePath = argv[++i];
    } else if (arg === '--save-storage' && argv[i + 1]) {
      opts.saveStoragePath = argv[++i];
    } else if (arg === '--apply-scaffolds' && argv[i + 1]) {
      opts.applyScaffoldsDir = argv[++i];
    } else if (arg === '--pure-js-gif') {
      opts.pureJsGif = true;
    } else if (arg === '--sarif') {
      opts.sarif = true;
    } else if (arg === '--watch') {
      const next = argv[i + 1];
      opts.watchDir = next && !next.startsWith('-') ? argv[++i] : '.';
    } else if (arg === '--init-cat' && argv[i + 1]) {
      opts.initCat = argv[++i];
    } else if (arg === '--timeout' && argv[i + 1]) {
      opts.timeoutMs = Number(argv[++i]) || 8000;
    } else if (!arg.startsWith('-') && !opts.url) {
      opts.url = arg;
    }
  }
  return opts;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);

  if (argv[0] === 'diff' && argv[1] && argv[2]) {
    const diffOpts = parseArgs(argv.slice(3));
    const { runDiffAudit, writeDiffArtifacts } = await import('./engine/diff-mode.js');
    const diff = await runDiffAudit(argv[1], argv[2], {
      full: diffOpts.full,
      preset: diffOpts.preset,
      extraHeaders: diffOpts.extraHeaders,
      allowMutations: diffOpts.allowMutations
    });
    const outDir = path.resolve(diffOpts.outDir);
    const written = writeDiffArtifacts(diff, outDir);
    if (diffOpts.shareCard) {
      const { generateDiffCardPng } = await import('./ui/diff-card.js');
      await generateDiffCardPng(diff, path.join(outDir, 'pawtest-diff-1200x630.png'));
    }
    if (diffOpts.json) console.log(JSON.stringify(diff, null, 2));
    else console.log(`PawTest Diff complete! Winner: ${diff.winner} | Report: ${written.mdPath}`);
    return 0;
  }

  if (opts.help) {
    console.log(HELP_TEXT);
    return 0;
  }

  if (opts.initCat) {
    const { scaffoldNewCat } = await import('./cats/scaffold.js');
    const created = scaffoldNewCat(opts.initCat);
    console.log(`\n🐾 Scaffolded Cat #17 plugin: ${created.filePath}`);
    console.log(`   Next: import * as ${created.id.replace(/-/g, '_')} from './${created.id}.js' in src/cats/index.js and run npm test.\n`);
    return 0;
  }

  if (opts.mcp) {
    const { startMcpServer } = await import('./mcp/server.js');
    startMcpServer();
    return 0;
  }

  if (opts.listCats) {
    console.log('\nPawTest v3.1.1 Cat Matrix:');
    for (const c of ALL_CATS) {
      console.log(`  ${c.meta.code}  ${c.meta.id.padEnd(11)} [${c.meta.mode.padEnd(4)} | ${c.meta.axis.padEnd(5)}]  ${c.meta.description}`);
    }
    return 0;
  }

  if (!opts.url) {
    console.error('Error: Missing target URL.\n');
    console.error(HELP_TEXT);
    return 1;
  }

  let liveStage = null;
  if (opts.stage) {
    const { startLiveStageServer } = await import('./ui/live-stage-server.js');
    liveStage = await startLiveStageServer();
    if (!opts.json) {
      console.log(`\n🎬 Live WebGL2 Optical Cat Stage streaming at: ${liveStage.url}`);
    }
  }

  if (!opts.json) {
    const modeLabel = opts.cats ? `custom (${opts.cats.join(', ')})` : opts.viral ? 'VIRAL BUNDLE (16 cats + PNG + GIF + SVG)' : opts.full ? 'FULL (16 cats)' : 'FAST (8 cats)';
    console.log(`\n🐾 PawTest v3.1.1 — Auditing ${opts.url} [${modeLabel}]`);
    console.log(`   Sandbox: ${opts.allowMutations ? 'MUTATIONS ENABLED' : 'Read-Only (Safe)'}${opts.storageStatePath ? ' · Authenticated' : ''}\n`);
  }

  try {
    const auditFn = opts.crawl > 1 ? runCrawlAudit : runAudit;
    const report = await auditFn({
      crawl: opts.crawl,
      url: opts.url,
      full: opts.full,
      cats: opts.cats,
      timeoutMs: opts.timeoutMs,
      allowMutations: opts.allowMutations,
      allowPrivateIp: opts.allowPrivateIp,
      blockLocalhost: opts.blockLocalhost,
      baselinePath: opts.baselinePath,
      preset: opts.preset,
      configPath: opts.configPath,
      flowPath: opts.flowPath,
      extraHeaders: opts.extraHeaders,
      storageStatePath: opts.storageStatePath,
      saveStoragePath: opts.saveStoragePath,
      onCatComplete: (cat) => {
        if (liveStage) liveStage.emitCatComplete(cat);
        if (opts.json) return;
        const badge = cat.status === 'pass' ? '✅' : cat.status === 'warn' ? '⚠️ ' : '❌';
        console.log(`  ${badge} ${cat.code} ${cat.name.padEnd(10)} ${String(cat.score).padStart(3)}/100  (${cat.durationMs}ms)  ${cat.quips[0] || ''}`);
      }
    });

    if (liveStage) liveStage.emitAuditComplete(report);

    const outDir = path.resolve(opts.outDir);
    const written = writeReportArtifacts(report, outDir);

    let shareCardPath = null;
    if (opts.shareCard) {
      const { generateShareCardPng } = await import('./ui/share-card.js');
      shareCardPath = path.join(outDir, 'pawtest-card-1200x630.png');
      await generateShareCardPng(report, shareCardPath);
    }

    let gifPath = null;
    if (opts.gif) {
      const { generateFailureGif } = await import('./ui/failure-gif.js');
      gifPath = path.join(outDir, 'pawtest-failure-5s.gif');
      await generateFailureGif(report, gifPath, { pureJsGif: opts.pureJsGif });
    }

    let scaffolded = [];
    if (opts.applyScaffoldsDir) {
      const { applyFixScaffolds } = await import('./engine/scaffolder.js');
      scaffolded = applyFixScaffolds(report, opts.applyScaffoldsDir);
    }

    let sarifPath = null;
    if (opts.sarif) {
      const { writeSarifArtifact } = await import('./engine/sarif.js');
      sarifPath = writeSarifArtifact(report, outDir);
    }

    let badges = null;
    if (opts.badge) {
      const { writeReadmeBadges } = await import('./ui/badge.js');
      badges = writeReadmeBadges(report, outDir);
    }

    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      const h = report.scores.human;
      const a = report.scores.agent;
      const hd = report.diff ? ` (${report.diff.humanDelta >= 0 ? '+' : ''}${report.diff.humanDelta})` : '';
      const ad = report.diff ? ` (${report.diff.agentDelta >= 0 ? '+' : ''}${report.diff.agentDelta})` : '';
      console.log('\n────────────────────────────────────────────────────────────');
      console.log(`  Human UX:           ${h.grade} (${h.score}/100)${hd}  [critical: ${h.criticalCount}, high: ${h.highCount}]`);
      console.log(`  AI Agent Readiness: ${a.grade} (${a.score}/100)${ad}  [critical: ${a.criticalCount}, high: ${a.highCount}]`);
      if (report.tokenTax) {
        console.log(`  AI Token-Tax:       ${report.tokenTax.bloatRatio}x (${report.tokenTax.rawHtmlTokens} HTML → ${report.tokenTax.cleanTokens} content tok · MD ${report.tokenTax.supportsMarkdown ? 'ON' : 'OFF'})`);
      }
      console.log(`  Duration:           ${(report.durationMs / 1000).toFixed(2)}s  |  Redactions: ${report.sandbox.redactionsApplied}`);
      console.log('────────────────────────────────────────────────────────────');
      console.log(`  JSON Report:  ${written.jsonPath}`);
      console.log(`  Markdown:     ${written.mdPath}`);
      console.log(`  Fix Prompt:   ${written.fixPath}`);
      if (shareCardPath) console.log(`  Share Card:   ${shareCardPath}`);
      if (gifPath) console.log(`  Failure GIF:  ${gifPath}`);
      if (badges) console.log(`  README Badge: ${badges.scoreBadgePath}  (${badges.markdownSnippet})`);
      if (sarifPath) console.log(`  SARIF 2.1.0:  ${sarifPath}`);
      if (scaffolded.length) console.log(`  Scaffolds:    ${scaffolded.filter((x) => x.status === 'created').length} file(s) written to ${opts.applyScaffoldsDir}`);
      console.log('');
    }

    if (liveStage && !opts.stageNoWait && !opts.json) {
      console.log(`🎬 Live 3D stage still open at ${liveStage.url} — press Ctrl+C to exit.`);
      await new Promise((resolve) => {
        const stop = () => { process.off('SIGINT', stop); process.off('SIGTERM', stop); resolve(); };
        process.on('SIGINT', stop);
        process.on('SIGTERM', stop);
      });
    }

    if (opts.watchDir && !opts.json) {
      const { startWatchMode, computeIncrementalCats } = await import('./engine/watch.js');
      let lastRep = report;
      console.log(`👀 Watching ${opts.watchDir} for changes (incremental re-run on failing cats)... Press Ctrl+C to exit.`);
      const watcher = startWatchMode({
        watchDir: opts.watchDir,
        onTrigger: async (changed) => {
          const targetCats = computeIncrementalCats(lastRep);
          console.log(`\n🔄 Change detected (${changed}) — re-running ${targetCats ? targetCats.join(', ') : 'fast 8 cats'}...`);
          lastRep = await runAudit({
            url: opts.url,
            full: !targetCats && opts.full,
            cats: targetCats || opts.cats,
            preset: opts.preset,
            configPath: opts.configPath,
            extraHeaders: opts.extraHeaders,
            storageStatePath: opts.storageStatePath,
            timeoutMs: opts.timeoutMs,
            allowMutations: opts.allowMutations
          });
          console.log(`   Human: ${lastRep.scores.human.grade} (${lastRep.scores.human.score}) · Agent: ${lastRep.scores.agent.grade} (${lastRep.scores.agent.score}) in ${(lastRep.durationMs / 1000).toFixed(2)}s`);
        }
      });
      await new Promise((resolve) => {
        const stop = () => { watcher.close(); process.off('SIGINT', stop); process.off('SIGTERM', stop); resolve(); };
        process.on('SIGINT', stop);
        process.on('SIGTERM', stop);
      });
    }

    return report.scores.human.criticalCount > 0 || report.scores.agent.criticalCount > 0 ? 2 : 0;
  } finally {
    if (liveStage) await liveStage.close();
  }
}
