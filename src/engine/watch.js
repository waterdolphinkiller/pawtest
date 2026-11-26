import fs from 'node:fs';
import path from 'node:path';

/**
 * Incremental `--watch <dir>` Hot-Reload Runner.
 * Watches local source files and automatically re-runs ONLY the previously failing/warning cats
 * for ~2-second feedback during local development.
 */

export function computeIncrementalCats(lastReport) {
  if (!lastReport || !Array.isArray(lastReport.cats)) return null;
  const failing = lastReport.cats
    .filter((c) => c.status === 'fail' || c.status === 'warn' || c.status === 'error')
    .map((c) => c.catId);
  return failing.length > 0 ? failing : null;
}

function collectWatchDirs(rootDir) {
  const dirs = [rootDir];
  const ignore = new Set(['node_modules', '.git', 'pawtest-report', 'dist', 'build', '.next']);
  try {
    for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
      if (entry.isDirectory() && !ignore.has(entry.name) && !entry.name.startsWith('.')) {
        dirs.push(path.join(rootDir, entry.name));
      }
    }
  } catch {}
  return dirs;
}

export function startWatchMode({ watchDir, onTrigger }) {
  const absDir = path.resolve(watchDir || '.');
  const watchers = [];
  let timer = null;
  let running = false;

  const schedule = (filename) => {
    if (filename && /pawtest-report|node_modules|\.git/i.test(String(filename))) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (running) return;
      running = true;
      try {
        await onTrigger(filename || 'file change');
      } finally {
        running = false;
      }
    }, 350);
  };

  try {
    watchers.push(fs.watch(absDir, { recursive: true }, (_ev, fn) => schedule(fn)));
  } catch {
    for (const d of collectWatchDirs(absDir)) {
      try {
        watchers.push(fs.watch(d, (_ev, fn) => schedule(fn)));
      } catch {}
    }
  }

  return {
    dir: absDir,
    close: () => {
      if (timer) clearTimeout(timer);
      for (const w of watchers) {
        try { w.close(); } catch {}
      }
    }
  };
}
