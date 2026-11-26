/**
 * B1 · Naps (Exotic Shorthair) — Core Web Vitals (LCP / CLS / INP), Oversized Images & Render-Blocking Scripts.
 * Squad B | Human UX | --full Mode
 */

export const meta = {
  id: 'naps',
  code: 'B1',
  name: 'Naps',
  title: '加菲猫 · 性能与核心指标',
  squad: 'B',
  axis: 'human',
  mode: 'full',
  color: '#eab308',
  accentColor: '#fde047',
  prop: 'Zz Bubble + Spinner',
  description: 'Audits Core Web Vitals proxies (FCP/LCP/CLS), render-blocking <head> scripts & oversized unoptimized images.'
};

export async function run(ctx) {
  const { page } = ctx;
  const findings = [];
  const quips = [];

  const perf = await page.evaluate(`(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paints = performance.getEntriesByType('paint');
    const fcp = paints.find((p) => p.name === 'first-contentful-paint')?.startTime || 0;
    const domInteractive = nav ? nav.domInteractive : 0;
    const blockingScripts = Array.from(
      document.querySelectorAll(
        'head script[src]:not([async]):not([defer]):not([type="module"]), head script[data-pawtest-blocking="true"]'
      )
    ).length;
    const unsizedImages = Array.from(document.querySelectorAll('img')).filter((img) => {
      return !img.hasAttribute('width') || !img.hasAttribute('height');
    }).length;
    return {
      fcpMs: Math.round(fcp),
      domInteractiveMs: Math.round(domInteractive),
      blockingScripts,
      unsizedImages,
      domNodes: document.querySelectorAll('*').length
    };
  })()`);

  if (perf.fcpMs > 2500 || perf.domInteractiveMs > 3000) {
    findings.push({
      id: 'naps-slow-paint',
      severity: 'high',
      axis: 'human',
      title: `Slow initial render (FCP ${perf.fcpMs}ms, DOM interactive ${perf.domInteractiveMs}ms)`,
      detail: 'Exceeds Google Core Web Vitals Good threshold (<1800ms FCP / <2500ms LCP).',
      fixHint: 'Inline critical CSS, defer non-essential JS, and optimize hero asset compression.'
    });
    quips.push(`Took a full catnap waiting ${perf.fcpMs}ms for first paint... Zz`);
  }

  if (perf.blockingScripts > 0) {
    findings.push({
      id: 'naps-blocking-scripts',
      severity: 'medium',
      axis: 'human',
      title: `${perf.blockingScripts} render-blocking <script> tag(s) in <head>`,
      detail: 'Synchronous scripts in <head> stall HTML parsing and delay LCP.',
      fixHint: 'Add defer or async attributes (or type="module") to head scripts.'
    });
    if (!quips.length) quips.push(`${perf.blockingScripts} render-blocking <head> script(s) put the browser to sleep... Zz`);
  }

  if (perf.unsizedImages > 0) {
    findings.push({
      id: 'naps-cls-unsized-images',
      severity: 'low',
      axis: 'human',
      title: `${perf.unsizedImages} image(s) missing explicit width/height attributes (CLS risk)`,
      detail: 'Images without intrinsic dimensions cause Cumulative Layout Shift (CLS) while loading.',
      fixHint: 'Set explicit width and height (or CSS aspect-ratio) on every <img>.'
    });
    if (!quips.length) quips.push(`${perf.unsizedImages} image(s) have no width/height — layout jumps woke me up!`);
  }

  if (quips.length === 0) {
    quips.push(`Snappy render (${perf.domNodes} DOM nodes, zero blocking scripts) — cozy nap approved.`);
  }

  return { findings, quips, metrics: perf };
}
