import fs from 'node:fs';
import { IsolatedBrowser } from './cdp.js';
import { validateTargetUrl, isMutationBlocked, sanitizeReport } from './sandbox.js';
import { computeCatScore, deriveCatStatus, computeDualScores, pickTopRoasts, computeBaselineDiff, scoreToGrade } from './scoring.js';
import { getCatsForMode } from '../cats/index.js';
import { loadProjectConfig, resolveEffectivePolicy } from './config.js';
import { runFunnelFlow } from './flow.js';
import { analyzeCompoundRisks, computeAgentSurvivalFunnel } from './analytics.js';

const TOOL_VERSION = '3.1.1';

function loadJsonFileSafe(filePath, flagName) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found for ${flagName}: "${filePath}". Check the path and try again.`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`Invalid JSON in ${flagName} ("${filePath}"): ${err.message}`);
  }
}

async function applyStorageState(page, storageState, targetUrl) {
  if (!storageState) return;
  const origin = new URL(targetUrl).origin;
  if (Array.isArray(storageState.cookies)) {
    for (const ck of storageState.cookies) {
      if (!ck.name) continue;
      await page.cdp.send('Network.setCookie', {
        name: String(ck.name),
        value: String(ck.value ?? ''),
        url: ck.url || origin,
        path: ck.path || '/'
      }).catch(() => {});
    }
  }
  if (storageState.localStorage && typeof storageState.localStorage === 'object') {
    const entries = Object.entries(storageState.localStorage);
    if (entries.length > 0) {
      await page.evaluate(`((entries) => {
        try {
          for (const [k, v] of entries) window.localStorage.setItem(k, String(v));
        } catch {}
      })(${JSON.stringify(entries)})`).catch(() => {});
    }
  }
}

const READONLY_CAT_IDS = new Set([
  'robocat', 'lucky', 'scout', 'vault', 'naps', 'pixel', 'antidote', 'musebot', 'sentinel'
]);

async function runCatOnSharedPage(cat, sharedPage, sharedCtx, timeoutMs) {
  const start = Date.now();
  try {
    const ctx = { ...sharedCtx, page: sharedPage };
    const raw = await Promise.race([
      cat.run(ctx),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Cat "${cat.meta.name}" timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
    const findings = Array.isArray(raw?.findings) ? raw.findings : [];
    const quips = Array.isArray(raw?.quips) ? raw.quips : [];
    const score = computeCatScore(findings);
    const status = deriveCatStatus(findings, score);
    return {
      catId: cat.meta.id,
      code: cat.meta.code,
      name: cat.meta.name,
      squad: cat.meta.squad,
      axis: cat.meta.axis,
      status,
      score,
      durationMs: Date.now() - start,
      quips,
      findings,
      metrics: raw?.metrics || {}
    };
  } catch (err) {
    return {
      catId: cat.meta.id,
      code: cat.meta.code,
      name: cat.meta.name,
      squad: cat.meta.squad,
      axis: cat.meta.axis,
      status: 'error',
      score: 50,
      durationMs: Date.now() - start,
      quips: [`Encountered an error while prowling: ${err.message}`],
      findings: [
        {
          id: `${cat.meta.id}-runtime-error`,
          severity: 'medium',
          axis: cat.meta.axis === 'agent' ? 'agent' : 'human',
          title: `${cat.meta.name} probe encountered an execution error`,
          detail: err.message,
          fixHint: 'Verify the target URL is reachable and responds within the timeout window.'
        }
      ],
      metrics: {}
    };
  }
}

async function runCatIsolated(cat, sharedCtx, timeoutMs) {
  const start = Date.now();
  let page = null;
  try {
    page = await sharedCtx.browser.newPage();
    if (sharedCtx.extraHeaders && Object.keys(sharedCtx.extraHeaders).length > 0) {
      await page.setExtraHeaders(sharedCtx.extraHeaders);
    }
    if (sharedCtx.storageState?.cookies?.length) {
      await applyStorageState(page, { cookies: sharedCtx.storageState.cookies }, sharedCtx.targetUrl);
    }
    await page.goto(sharedCtx.targetUrl, Math.min(timeoutMs, 10000));
    if (sharedCtx.storageState?.localStorage) {
      await applyStorageState(page, { localStorage: sharedCtx.storageState.localStorage }, sharedCtx.targetUrl);
    }

    const ctx = { ...sharedCtx, page };

    const raw = await Promise.race([
      cat.run(ctx),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Cat "${cat.meta.name}" timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);

    const findings = Array.isArray(raw?.findings) ? raw.findings : [];
    const quips = Array.isArray(raw?.quips) ? raw.quips : [];
    const score = computeCatScore(findings);
    const status = deriveCatStatus(findings, score);

    return {
      catId: cat.meta.id,
      code: cat.meta.code,
      name: cat.meta.name,
      squad: cat.meta.squad,
      axis: cat.meta.axis,
      status,
      score,
      durationMs: Date.now() - start,
      quips,
      findings,
      metrics: raw?.metrics || {}
    };
  } catch (err) {
    return {
      catId: cat.meta.id,
      code: cat.meta.code,
      name: cat.meta.name,
      squad: cat.meta.squad,
      axis: cat.meta.axis,
      status: 'error',
      score: 50,
      durationMs: Date.now() - start,
      quips: [`Encountered an error while prowling: ${err.message}`],
      findings: [
        {
          id: `${cat.meta.id}-runtime-error`,
          severity: 'medium',
          axis: cat.meta.axis === 'agent' ? 'agent' : 'human',
          title: `${cat.meta.name} probe encountered an execution error`,
          detail: err.message,
          fixHint: 'Verify the target URL is reachable and responds within the timeout window.'
        }
      ],
      metrics: {}
    };
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

export async function runAudit(options) {
  const totalStart = Date.now();
  const validation = await validateTargetUrl(options.url, {
    allowPrivateIp: Boolean(options.allowPrivateIp),
    blockLocalhost: Boolean(options.blockLocalhost)
  });

  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  const { data: configData } = loadProjectConfig({ configPath: options.configPath || null });
  const policy = resolveEffectivePolicy({
    preset: options.preset || null,
    ignoreFindings: options.ignoreFindings || [],
    ignoreCats: options.ignoreCats || [],
    configData
  });

  const storageState = options.storageStatePath ? loadJsonFileSafe(options.storageStatePath, '--storage-state') : null;
  const baselineReport = options.baselinePath ? loadJsonFileSafe(options.baselinePath, '--baseline') : null;
  const flowSteps = Array.isArray(options.flowSteps)
    ? options.flowSteps
    : options.flowPath
      ? loadJsonFileSafe(options.flowPath, '--flow')
      : null;
  const extraHeaders = options.extraHeaders && Object.keys(options.extraHeaders).length > 0 ? options.extraHeaders : null;

  const targetUrl = validation.url.href;
  const selectedCats = getCatsForMode({ full: Boolean(options.full), cats: options.cats || null })
    .filter((c) => !policy.ignoreCats.has(c.meta.id));
  const timeoutMs = options.timeoutMs || 8000;
  const allowMutations = Boolean(options.allowMutations);
  const concurrency = options.concurrency || 4;

  // Pre-check main document HTTP status so 4xx/5xx error pages cannot receive inflated S-tier scores
  let mainHttpStatus = 200;
  try {
    const probe = await fetch(targetUrl, { redirect: 'follow', headers: extraHeaders || undefined });
    mainHttpStatus = probe.status;
  } catch {
    mainHttpStatus = 0;
  }

  let mutationsBlocked = 0;

  const browser = new IsolatedBrowser({ chromePath: options.chromePath });
  await browser.launch();

  const catReports = new Array(selectedCats.length);
  let flowResults = [];
  let perfStats = { pageLoads: 0, sharedReadOnlyCats: 0, isolatedCats: 0 };

  try {
    const sharedCtx = {
      browser,
      targetUrl,
      mainHttpStatus,
      allowMutations,
      storageState,
      extraHeaders,
      isMutationBlocked: (action) => isMutationBlocked(action, allowMutations),
      recordBlockedMutation: () => {
        mutationsBlocked++;
      }
    };

    const readOnlyTasks = [];
    const isolatedTasks = [];
    selectedCats.forEach((cat, idx) => {
      if (READONLY_CAT_IDS.has(cat.meta.id)) readOnlyTasks.push({ cat, idx });
      else isolatedTasks.push({ cat, idx });
    });

    let pageLoads = 0;
    const runReadOnlyPool = async () => {
      if (readOnlyTasks.length === 0) return;
      const sharedPage = await browser.newPage();
      try {
        if (extraHeaders) await sharedPage.setExtraHeaders(extraHeaders);
        if (storageState?.cookies?.length) {
          await applyStorageState(sharedPage, { cookies: storageState.cookies }, targetUrl);
        }
        await sharedPage.goto(targetUrl, Math.min(timeoutMs, 10000));
        pageLoads += 1;
        if (storageState?.localStorage) {
          await applyStorageState(sharedPage, { localStorage: storageState.localStorage }, targetUrl);
        }
        // Cache Accessibility Tree once for all read-only cats
        let axPromise = null;
        const origGetAx = sharedPage.getAccessibilityTree.bind(sharedPage);
        sharedPage.getAccessibilityTree = () => {
          if (!axPromise) axPromise = origGetAx();
          return axPromise;
        };

        await Promise.all(
          readOnlyTasks.map(async ({ cat, idx }) => {
            const rep = await runCatOnSharedPage(cat, sharedPage, sharedCtx, timeoutMs);
            catReports[idx] = rep;
            if (typeof options.onCatComplete === 'function') options.onCatComplete(rep);
          })
        );
      } finally {
        await sharedPage.close().catch(() => {});
      }
    };

    const runIsolatedPool = async () => {
      let cursor = 0;
      const workers = Array.from({ length: Math.min(concurrency, isolatedTasks.length) }, async () => {
        while (cursor < isolatedTasks.length) {
          const { cat, idx } = isolatedTasks[cursor++];
          pageLoads += 1;
          const rep = await runCatIsolated(cat, sharedCtx, timeoutMs);
          catReports[idx] = rep;
          if (typeof options.onCatComplete === 'function') options.onCatComplete(rep);
        }
      });
      await Promise.all(workers);
    };

    await Promise.all([runReadOnlyPool(), runIsolatedPool()]);
    sharedCtx.performance = {
      pageLoads,
      sharedReadOnlyCats: readOnlyTasks.length,
      isolatedCats: isolatedTasks.length
    };

    if (flowSteps && flowSteps.length > 0) {
      sharedCtx.flowResults = await runFunnelFlow({
        browser,
        startUrl: targetUrl,
        steps: flowSteps,
        extraHeaders,
        storageState,
        allowMutations,
        timeoutMs
      });
    }

    if (options.saveStoragePath) {
      const capPage = await browser.newPage();
      try {
        if (extraHeaders) await capPage.setExtraHeaders(extraHeaders);
        await capPage.goto(targetUrl, Math.min(timeoutMs, 10000));
        const cookieRes = await capPage.cdp.send('Network.getCookies', { urls: [targetUrl] }).catch(() => ({ cookies: [] }));
        const ls = await capPage.evaluate(`(() => { const o = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } } catch {} return o; })()`).catch(() => ({}));
        fs.writeFileSync(options.saveStoragePath, JSON.stringify({ cookies: cookieRes.cookies || [], localStorage: ls }, null, 2));
      } finally {
        await capPage.close().catch(() => {});
      }
    }
    flowResults = sharedCtx.flowResults || [];
    perfStats = sharedCtx.performance || perfStats;
  } finally {
    await browser.close();
  }

  let ignoredFindingCount = 0;
  if (policy.ignoreFindings.size > 0) {
    for (const c of catReports) {
      if (!c || !Array.isArray(c.findings)) continue;
      const before = c.findings.length;
      c.findings = c.findings.filter((f) => !policy.ignoreFindings.has(f.id));
      ignoredFindingCount += before - c.findings.length;
      c.score = computeCatScore(c.findings);
      c.status = deriveCatStatus(c.findings, c.score);
    }
  }

  // If the target page itself returned 4xx/5xx, inject a dual-axis critical defect into Pixel (or first cat)
  if (mainHttpStatus >= 400) {
    const hostCat = catReports.find((c) => c.catId === 'pixel') || catReports[0];
    if (hostCat) {
      hostCat.findings.unshift({
        id: `target-http-${mainHttpStatus}`,
        severity: 'critical',
        axis: 'human',
        title: `Target URL itself returned HTTP ${mainHttpStatus}`,
        detail: `GET ${targetUrl} responded with HTTP ${mainHttpStatus} instead of 2xx OK.`,
        fixHint: 'Fix the server error or broken route before running UX/Agent audits.'
      });
      hostCat.status = 'fail';
      hostCat.score = Math.min(hostCat.score, mainHttpStatus >= 500 ? 20 : 40);
      hostCat.quips.unshift(`Target page crashed with HTTP ${mainHttpStatus} right at the front door!`);
    }
  }

  const scores = computeDualScores(catReports);
  if (mainHttpStatus >= 400) {
    const cap = mainHttpStatus >= 500 ? 40 : 55;
    scores.human.score = Math.min(scores.human.score, cap);
    scores.human.grade = scoreToGrade(scores.human.score);
    scores.human.criticalCount = Math.max(scores.human.criticalCount, 1);
    scores.agent.score = Math.min(scores.agent.score, cap);
    scores.agent.grade = scoreToGrade(scores.agent.score);
    scores.agent.criticalCount = Math.max(scores.agent.criticalCount, 1);
  }

  const topRoasts = pickTopRoasts(catReports);

  const robo = catReports.find((c) => c.catId === 'robocat');
  const tokenTax = robo?.metrics?.rawHtmlTokens
    ? {
        rawHtmlTokens: robo.metrics.rawHtmlTokens,
        cleanTokens: robo.metrics.cleanTokens,
        bloatRatio: robo.metrics.bloatRatio,
        supportsMarkdown: Boolean(robo.metrics.supportsMarkdownForAgents),
        tokenSavingsPct: robo.metrics.tokenSavingsPct || 0
      }
    : null;

  const rawReport = {
    tool: 'pawtest',
    version: TOOL_VERSION,
    targetUrl,
    mainHttpStatus,
    timestamp: new Date().toISOString(),
    mode: options.cats?.length ? 'custom' : options.full ? 'full' : 'fast',
    durationMs: Date.now() - totalStart,
    preset: policy.preset,
    ignoredFindingCount,
    flowResults,
    performance: perfStats,
    sandbox: {
      readOnly: !allowMutations,
      authenticated: Boolean(storageState || extraHeaders),
      mutationsBlocked,
      redactionsApplied: 0
    },
    scores,
    tokenTax,
    diff: null,
    topRoasts,
    cats: catReports
  };

  rawReport.compoundRisks = analyzeCompoundRisks(catReports);
  rawReport.agentFunnel = computeAgentSurvivalFunnel(rawReport);

  if (baselineReport) {
    rawReport.diff = computeBaselineDiff(rawReport, baselineReport);
  }

  const { data: sanitized, redactions } = sanitizeReport(rawReport);
  sanitized.sandbox.redactionsApplied = redactions;
  return sanitized;
}


async function discoverSameOriginLinks(entryUrl, limit, extraHeaders = null) {
  const discovered = [entryUrl];
  const seen = new Set([entryUrl]);
  try {
    const res = await fetch(entryUrl, { headers: extraHeaders || undefined });
    if (!res.ok) return discovered;
    const html = await res.text();
    const origin = new URL(entryUrl).origin;
    const hrefRe = /<a\b[^>]*?href=["']([^"'#]+)["']/gi;
    let m;
    while ((m = hrefRe.exec(html)) && discovered.length < limit) {
      try {
        const u = new URL(m[1], entryUrl);
        if (u.origin === origin && !seen.has(u.href) && !/\.(?:png|jpg|jpeg|svg|gif|webp|pdf|zip|css|js)$/i.test(u.pathname)) {
          seen.add(u.href);
          discovered.push(u.href);
        }
      } catch {}
    }
  } catch {}
  return discovered;
}

export async function runCrawlAudit(options) {
  const maxPages = Math.max(1, Math.min(10, Number(options.crawl) || 1));
  const validation = await validateTargetUrl(options.url, {
    allowPrivateIp: Boolean(options.allowPrivateIp),
    blockLocalhost: Boolean(options.blockLocalhost)
  });
  if (!validation.ok) throw new Error(validation.reason);

  const urls = maxPages > 1 ? await discoverSameOriginLinks(validation.url.href, maxPages, options.extraHeaders || null) : [validation.url.href];
  const primary = await runAudit({ ...options, url: urls[0] });
  if (urls.length <= 1) return primary;

  const crawlPages = [{
    url: primary.targetUrl,
    humanScore: primary.scores.human.score,
    humanGrade: primary.scores.human.grade,
    agentScore: primary.scores.agent.score,
    agentGrade: primary.scores.agent.grade
  }];

  for (const extraUrl of urls.slice(1)) {
    const sub = await runAudit({ ...options, url: extraUrl, baselinePath: null });
    crawlPages.push({
      url: sub.targetUrl,
      humanScore: sub.scores.human.score,
      humanGrade: sub.scores.human.grade,
      agentScore: sub.scores.agent.score,
      agentGrade: sub.scores.agent.grade
    });
  }
  primary.crawlPages = crawlPages;
  return primary;
}
