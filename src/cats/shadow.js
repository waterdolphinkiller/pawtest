/**
 * B2 · Shadow (Night-Vision Black Cat) — WCAG 2.2 Accessibility Audit, True Relative-Luminance Contrast Ratio,
 * Keyboard Focus & Missing alt/aria/landmarks.
 * Squad B | Human UX | --full Mode
 */

export const meta = {
  id: 'shadow',
  code: 'B2',
  name: 'Shadow',
  title: '夜视黑猫 · WCAG 2.2 与对比度',
  squad: 'B',
  axis: 'human',
  mode: 'full',
  color: '#1e293b',
  accentColor: '#2dd4bf',
  prop: 'Glowing Whiskers + Tab Focus Box',
  description: 'WCAG 2.2 audit: true relative-luminance color contrast ratio, missing img alt, landmarks, tabindex traps & form labels.'
};

export async function run(ctx) {
  const { page } = ctx;
  const findings = [];
  const quips = [];

  const a11y = await page.evaluate(`(() => {
    const hasLang = !!(document.documentElement.getAttribute('lang') || '').trim();
    const hasMain = !!document.querySelector('main, [role="main"]');
    const imgsNoAlt = Array.from(document.querySelectorAll('img')).filter((i) => i.getAttribute('alt') === null).length;
    const positiveTabindex = Array.from(document.querySelectorAll('[tabindex]')).filter((el) => Number(el.getAttribute('tabindex')) > 0).length;
    const inputsNoLabel = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea'))
      .filter((el) => {
        const id = el.id;
        const hasFor = id ? !!document.querySelector('label[for="' + CSS.escape(id) + '"]') : false;
        const wrapped = !!el.closest('label');
        const aria = !!(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby'));
        return !hasFor && !wrapped && !aria;
      }).length;

    // True WCAG 2.2 relative luminance contrast computation
    const parseRgba = (str) => {
      const m = String(str || '').match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
      if (!m) return null;
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) };
    };
    const relLum = ({ r, g, b }) => {
      const lin = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };
    const effectiveBg = (el) => {
      let cur = el;
      while (cur && cur.nodeType === 1) {
        const c = parseRgba(window.getComputedStyle(cur).backgroundColor);
        if (c && c.a > 0.1) return c;
        cur = cur.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };

    const lowContrast = [];
    for (const el of Array.from(document.querySelectorAll('h1, h2, h3, p, a, button, label')).slice(0, 80)) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) < 0.1) continue;
      const text = (el.textContent || '').trim();
      if (!text) continue;
      const fg = parseRgba(st.color);
      if (!fg || fg.a < 0.1) continue;
      const bg = effectiveBg(el);
      const l1 = Math.max(relLum(fg), relLum(bg));
      const l2 = Math.min(relLum(fg), relLum(bg));
      const ratio = Number(((l1 + 0.05) / (l2 + 0.05)).toFixed(2));
      const fontSize = parseFloat(st.fontSize) || 16;
      const isBold = parseInt(st.fontWeight, 10) >= 700;
      const minRatio = (fontSize >= 24 || (isBold && fontSize >= 18.66)) ? 3.0 : 4.5;
      if (ratio < minRatio) {
        lowContrast.push({
          selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''),
          ratio,
          minRatio,
          sample: text.slice(0, 28)
        });
      }
    }

    return { hasLang, hasMain, imgsNoAlt, positiveTabindex, inputsNoLabel, lowContrastCount: lowContrast.length, lowContrastSample: lowContrast.slice(0, 3) };
  })()`);

  if (a11y.lowContrastCount > 0) {
    const first = a11y.lowContrastSample[0];
    findings.push({
      id: 'shadow-low-contrast',
      severity: 'medium',
      axis: 'human',
      title: `${a11y.lowContrastCount} element(s) fail WCAG 2.2 AA color contrast (lowest ${first.ratio}:1 < ${first.minRatio}:1)`,
      detail: `Low contrast on "${first.selector}" ("${first.sample}"): ${first.ratio}:1 (minimum ${first.minRatio}:1).`,
      repro: `CSS selector: ${first.selector}`,
      fixHint: 'Darken foreground text or lighten background to meet >= 4.5:1 (normal text) or >= 3.0:1 (large text).'
    });
    quips.push(`Night vision barely read "${first.sample}" — contrast is only ${first.ratio}:1!`);
  }

  if (a11y.imgsNoAlt > 0) {
    findings.push({
      id: 'shadow-missing-alt',
      severity: 'medium',
      axis: 'human',
      title: `${a11y.imgsNoAlt} image(s) missing alt attribute`,
      detail: 'Screen readers and blind users cannot interpret images lacking alt text.',
      fixHint: 'Add descriptive alt="..." text (or alt="" for purely decorative images).'
    });
    if (!quips.length) quips.push(`Night vision spotted ${a11y.imgsNoAlt} image(s) with no alt text!`);
  }

  if (a11y.inputsNoLabel > 0) {
    findings.push({
      id: 'shadow-unlabeled-inputs',
      severity: 'high',
      axis: 'human',
      title: `${a11y.inputsNoLabel} form field(s) lack associated <label> or aria-label`,
      detail: 'Keyboard and screen-reader users cannot identify unlabeled form inputs.',
      fixHint: 'Bind each input with <label for="id"> or aria-label.'
    });
    if (!quips.length) quips.push(`Tab-prowled into ${a11y.inputsNoLabel} unlabeled form input(s) in the dark!`);
  }

  if (!a11y.hasLang || !a11y.hasMain) {
    findings.push({
      id: 'shadow-landmarks',
      severity: 'low',
      axis: 'human',
      title: `Missing WCAG page structure (${!a11y.hasLang ? 'html[lang]' : ''} ${!a11y.hasMain ? '<main>' : ''})`.trim(),
      detail: 'Document language and <main> landmark allow assistive tech to jump directly to content.',
      fixHint: 'Set <html lang="en"> (or appropriate locale) and wrap primary content in <main>.'
    });
  }

  if (a11y.positiveTabindex > 0) {
    findings.push({
      id: 'shadow-tabindex-trap',
      severity: 'medium',
      axis: 'human',
      title: `${a11y.positiveTabindex} element(s) use positive tabindex > 0`,
      detail: 'Positive tabindex values hijack natural keyboard focus order.',
      fixHint: 'Use tabindex="0" or native focusable elements in logical DOM order.'
    });
  }

  if (quips.length === 0) {
    quips.push('Keyboard Tab-prowl & WCAG 2.2 contrast math complete — crystal clear!');
  }

  return { findings, quips, metrics: a11y };
}
