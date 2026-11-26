/**
 * C3 · Leak (Maine Coon) — JS Heap Memory Growth Probe & <44px Mobile Touch Targets.
 * Squad C | Human UX | --full Mode
 */

export const meta = {
  id: 'leak',
  code: 'C3',
  name: 'Leak',
  title: '缅因猫 · 内存泄漏与触控热区',
  squad: 'C',
  axis: 'human',
  mode: 'full',
  color: '#a855f7',
  accentColor: '#d8b4fe',
  prop: 'Glowing Tangled Yarn Ball',
  description: 'Samples CDP JS Heap growth for runaway timers/leaks and audits <44x44px mobile touch targets.'
};

export async function run(ctx) {
  const { page } = ctx;
  const findings = [];
  const quips = [];

  const heapStart = await page.getHeapUsage();
  await new Promise((r) => setTimeout(r, 450));
  const heapEnd = await page.getHeapUsage();

  const deltaMb = Number(((heapEnd.usedSize - heapStart.usedSize) / (1024 * 1024)).toFixed(2));

  const touchAudit = await page.evaluate(`(() => {
    const targets = Array.from(document.querySelectorAll('button, a[href], input:not([type="hidden"]), [role="button"]'));
    const tiny = [];
    for (const el of targets) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)) {
        tiny.push({ tag: el.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
    return { total: targets.length, tinyCount: tiny.length, tinySample: tiny.slice(0, 4) };
  })()`);

  if (deltaMb > 15) {
    findings.push({
      id: 'leak-heap-growth',
      severity: 'high',
      axis: 'human',
      title: `Rapid JS Heap growth detected (+${deltaMb} MB in 450ms)`,
      detail: 'Unbounded intervals, detached DOM listeners, or runaway allocations are growing memory rapidly.',
      fixHint: 'Clear setInterval/addEventListener handles on unmount and inspect Chrome Memory heap snapshots.'
    });
    quips.push(`Yarn ball keeps tangling! JS Heap ballooned by +${deltaMb} MB while idling.`);
  }

  if (touchAudit.tinyCount >= 3) {
    findings.push({
      id: 'leak-small-touch-targets',
      severity: 'low',
      axis: 'human',
      title: `${touchAudit.tinyCount} interactive control(s) smaller than 44×44px touch guideline`,
      detail: `Sample tiny targets: ${touchAudit.tinySample.map((t) => `${t.tag}(${t.w}x${t.h})`).join(', ')}`,
      fixHint: 'Ensure primary buttons and links have at least 44×44px tap area (via min-height/padding).'
    });
    if (!quips.length) quips.push(`Caught ${touchAudit.tinyCount} tiny touch targets under 44px — paws keep mis-tapping!`);
  }

  if (quips.length === 0) {
    quips.push(`Heap steady (${deltaMb >= 0 ? '+' : ''}${deltaMb} MB) and touch targets nicely sized.`);
  }

  return {
    findings,
    quips,
    metrics: { heapStartBytes: heapStart.usedSize, heapEndBytes: heapEnd.usedSize, deltaMb, ...touchAudit }
  };
}
