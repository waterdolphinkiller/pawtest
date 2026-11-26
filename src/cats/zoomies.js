/**
 * A2 · Zoomies (Tuxedo Cat) — 3G Weak Network Rapid-Click Idempotency & Loading Deadlock.
 * Squad A | Human UX | Default Fast Mode
 */

export const meta = {
  id: 'zoomies',
  code: 'A2',
  name: 'Zoomies',
  title: '奶牛猫 · 弱网连点防抖',
  squad: 'A',
  axis: 'human',
  mode: 'fast',
  color: '#1e293b',
  accentColor: '#38bdf8',
  prop: 'Lightning + SUBMIT x15',
  description: '3G weak network rapid-click stress, debounce/idempotency check, duplicate submit & loading deadlock.'
};

export async function run(ctx) {
  const { page, isMutationBlocked, recordBlockedMutation } = ctx;
  const findings = [];
  const quips = [];

  await page.setNetworkProfile('3g');
  try {
    const result = await page.evaluate(`(async () => {
      const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]'))
        .filter((el) => el.offsetParent !== null && !el.disabled);

      const destructiveRe = /(delete|remove|pay|checkout|purchase|buy now|place order|charge|删除|支付|付款)/i;
      const safeButtons = [];
      const blockedButtons = [];

      for (const btn of buttons) {
        const label = (btn.textContent || btn.getAttribute('value') || btn.getAttribute('aria-label') || '').trim();
        if (destructiveRe.test(label)) {
          blockedButtons.push(label);
        } else {
          safeButtons.push({ btn, label });
        }
      }

      let duplicateFires = 0;
      let stuckLoading = false;
      let testedLabel = null;

      if (safeButtons.length > 0) {
        const target = safeButtons[0];
        testedLabel = target.label || 'button#0';
        let fetchCount = 0;
        const origFetch = window.fetch;
        window.fetch = function (...args) {
          fetchCount++;
          return origFetch.apply(this, args);
        };

        try {
          for (let i = 0; i < 6; i++) {
            if (!target.btn.disabled && target.btn.getAttribute('aria-busy') !== 'true') {
              target.btn.click();
            }
          }
          await new Promise((r) => setTimeout(r, 350));
          if (fetchCount >= 4) duplicateFires = fetchCount;
          if (target.btn.getAttribute('aria-busy') === 'true' && target.btn.disabled) {
            await new Promise((r) => setTimeout(r, 900));
            if (target.btn.getAttribute('aria-busy') === 'true' && target.btn.dataset.stuck === 'true') {
              stuckLoading = true;
            }
          }
        } finally {
          window.fetch = origFetch;
        }
      }

      return {
        buttonCount: buttons.length,
        testedLabel,
        duplicateFires,
        stuckLoading,
        blockedButtons
      };
    })()`);

    for (const label of result.blockedButtons || []) {
      if (isMutationBlocked({ text: label })) {
        recordBlockedMutation(`Zoomies skipped rapid-clicking destructive button "${label}"`);
      }
    }

    if (result.duplicateFires >= 4) {
      findings.push({
        id: 'zoomies-duplicate-submit',
        severity: 'high',
        axis: 'human',
        title: `Rapid clicking "${result.testedLabel}" fired ${result.duplicateFires} duplicate requests`,
        detail: 'Under 3G latency, clicking an action button 6 times rapidly triggered multiple concurrent fetches without disabling or debouncing.',
        fixHint: 'Disable the button or set aria-busy="true" while an async request is in-flight, and enforce idempotency keys server-side.'
      });
      quips.push(`Clicked "${result.testedLabel}" 6 times on 3G and fired ${result.duplicateFires} duplicate requests — hello double charge!`);
    }

    if (result.stuckLoading) {
      findings.push({
        id: 'zoomies-loading-deadlock',
        severity: 'high',
        axis: 'human',
        title: 'Button remained stuck in loading deadlock state',
        detail: `Button "${result.testedLabel}" stayed disabled/busy after network activity settled.`,
        fixHint: 'Always reset loading/disabled state inside a finally{} block on async handlers.'
      });
      quips.push('Button got stuck in eternal spinning loading state!');
    }

    if (quips.length === 0) {
      quips.push(
        result.testedLabel
          ? `Spam-clicked "${result.testedLabel}" on 3G — cleanly debounced with zero duplicate fires.`
          : 'No clickable non-destructive action buttons needed rapid-click testing.'
      );
    }

    return { findings, quips, metrics: result };
  } finally {
    await page.setNetworkProfile('online');
  }
}
