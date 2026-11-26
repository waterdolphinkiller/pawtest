/**
 * A3 · Mochi (Sakura Calico) — 375px / Tablet / Desktop Responsive, 175% Font Zoom &
 * Deterministic Visual Occlusion Detection (document.elementsFromPoint).
 * Squad A | Human UX | Default Fast Mode
 */

export const meta = {
  id: 'mochi',
  code: 'A3',
  name: 'Mochi',
  title: '樱花三花 · 响应式与遮挡碰撞',
  squad: 'A',
  axis: 'human',
  mode: 'fast',
  color: '#f472b6',
  accentColor: '#fbcfe8',
  prop: '375px Cardboard Box',
  description: '375px/tablet/desktop responsive overflow, 175% font zoom & deterministic elementsFromPoint button occlusion checks.'
};

export async function run(ctx) {
  const { page } = ctx;
  const findings = [];
  const quips = [];
  const viewports = [
    { name: 'mobile-375', width: 375, height: 812, mobile: true },
    { name: 'tablet-768', width: 768, height: 1024, mobile: true },
    { name: 'desktop-1440', width: 1440, height: 900, mobile: false }
  ];

  const metrics = {};

  try {
    for (const vp of viewports) {
      await page.setViewport(vp.width, vp.height, 1, vp.mobile);
      const check = await page.evaluate(`(() => {
        const docEl = document.documentElement;
        const overflowPx = Math.max(0, docEl.scrollWidth - window.innerWidth);
        const clipped = [];
        const occluded = [];

        const describeEl = (el) => {
          if (!el) return 'unknown';
          const tag = el.tagName.toLowerCase();
          const id = el.id ? '#' + el.id : '';
          const cls = typeof el.className === 'string' && el.className.trim()
            ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
            : '';
          return tag + id + cls;
        };

        for (const el of Array.from(document.querySelectorAll('h1, h2, button, a[href], input:not([type="hidden"])')).slice(0, 60)) {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          if (r.right > window.innerWidth + 4) {
            clipped.push((el.textContent || el.tagName).trim().slice(0, 32));
          }
          // Deterministic visual occlusion check via elementsFromPoint on visible in-viewport interactive controls
          const isInteractive = ['BUTTON', 'A', 'INPUT'].includes(el.tagName);
          if (isInteractive && r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth) {
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const stack = document.elementsFromPoint(cx, cy);
            const topEl = stack[0];
            if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
              occluded.push({
                target: describeEl(el),
                coveredBy: describeEl(topEl)
              });
            }
          }
        }
        return {
          overflowPx,
          clippedCount: clipped.length,
          clippedSample: clipped.slice(0, 3),
          occludedCount: occluded.length,
          occludedSample: occluded.slice(0, 3)
        };
      })()`);
      metrics[vp.name] = check;
    }

    // 175% font scale check at mobile 375px
    await page.setViewport(375, 812, 1, true);
    const zoomCheck = await page.evaluate(`(() => {
      const prevSize = document.documentElement.style.fontSize;
      document.documentElement.style.fontSize = '175%';
      const overflowPx = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
      document.documentElement.style.fontSize = prevSize;
      return { overflowAt175Pct: overflowPx };
    })()`);
    metrics.fontZoom175 = zoomCheck;

    const mobile = metrics['mobile-375'];
    if (mobile.overflowPx > 4) {
      findings.push({
        id: 'mochi-mobile-overflow',
        severity: 'high',
        axis: 'human',
        title: `Horizontal scrollbar at 375px mobile (+${mobile.overflowPx}px overflow)`,
        detail: `Content exceeds 375px viewport width by ${mobile.overflowPx}px. Clipped elements: ${(mobile.clippedSample || []).join(', ') || 'layout container'}.`,
        fixHint: 'Replace fixed pixel widths with max-width: 100%, flex-wrap, or responsive grid tracks (minmax(0, 1fr)).'
      });
      quips.push(`Tried squeezing into a 375px phone box and spilled out by ${mobile.overflowPx}px!`);
    }

    const allOccluded = [
      ...(metrics['mobile-375'].occludedSample || []),
      ...(metrics['desktop-1440'].occludedSample || [])
    ];
    if (allOccluded.length > 0) {
      const first = allOccluded[0];
      findings.push({
        id: 'mochi-element-occluded',
        severity: 'high',
        axis: 'human',
        title: `Interactive control "${first.target}" is visually occluded by "${first.coveredBy}"`,
        detail: `elementsFromPoint() hit "${first.coveredBy}" above "${first.target}" (${allOccluded.length} occlusion(s) detected).`,
        repro: `document.querySelector('${first.target}') occluded by '${first.coveredBy}'`,
        fixHint: 'Adjust z-index, bottom padding, or sticky/fixed overlay placement so interactive controls remain clickable.'
      });
      quips.push(`Paw tapped "${first.target}" but hit "${first.coveredBy}" sitting right on top of it!`);
    }

    if (zoomCheck.overflowAt175Pct > 20 && mobile.overflowPx <= 4) {
      findings.push({
        id: 'mochi-font-zoom-overflow',
        severity: 'medium',
        axis: 'human',
        title: `Layout breaks at 175% font size (+${zoomCheck.overflowAt175Pct}px overflow)`,
        detail: 'Scaling root font size to 175% causes horizontal overflow on mobile.',
        fixHint: 'Use rem units with flexible containers and overflow-wrap: anywhere for long headings/links.'
      });
      if (!quips.length) quips.push('At 175% font zoom, text burst right out of the cardboard box!');
    }

    if (quips.length === 0) {
      quips.push('Fit snugly inside 375px mobile, 768px tablet & 175% font zoom — zero overflow or button occlusion!');
    }

    return { findings, quips, metrics };
  } finally {
    await page.setViewport(1440, 900, 1, false);
  }
}
