/**
 * A1 · Marmalade (Orange Tabby) — Form Boundary Fuzzing & XSS Reflection.
 * Squad A | Human UX | Default Fast Mode
 */

export const meta = {
  id: 'marmalade',
  code: 'A1',
  name: 'Marmalade',
  title: '橘猫 · 表单模糊测试',
  squad: 'A',
  axis: 'human',
  mode: 'fast',
  color: '#f59e0b',
  accentColor: '#fbbf24',
  prop: 'RGB Keyboard + ASFGHJK!!',
  description: 'Form boundary fuzzing, XSS reflection checks, 500-emoji & negative input crash detection.'
};

export async function run(ctx) {
  const { page, isMutationBlocked, recordBlockedMutation } = ctx;
  const findings = [];
  const quips = [];

  const result = await page.evaluate(`(() => {
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea'));
    const forms = Array.from(document.querySelectorAll('form'));
    const summary = {
      inputCount: inputs.length,
      formCount: forms.length,
      missingMaxLength: 0,
      xssReflected: false,
      unboundedNumberInput: 0,
      formCrash: false,
      testedInputs: []
    };

    const xssPayload = '"><img src=x onerror="window.__pawtest_xss=1">';
    const emojiBurst = '🐱'.repeat(250);

    for (const el of inputs.slice(0, 6)) {
      const type = (el.getAttribute('type') || el.tagName.toLowerCase()).toLowerCase();
      const name = el.getAttribute('name') || el.id || type;
      if ((type === 'text' || type === 'search' || type === 'textarea') && !el.hasAttribute('maxlength')) {
        summary.missingMaxLength++;
      }
      if (type === 'number' && el.getAttribute('min') === null) {
        summary.unboundedNumberInput++;
      }

      const prev = el.value;
      try {
        if (type === 'number') {
          el.value = '-999999999';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (type === 'email') {
          el.value = 'pawtest+' + 'a'.repeat(120) + '@invalid';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (type !== 'checkbox' && type !== 'radio' && type !== 'file') {
          el.value = xssPayload;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.value = emojiBurst;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        summary.testedInputs.push(name);
      } catch {
        summary.formCrash = true;
      } finally {
        el.value = prev;
      }
    }

    if (window.__pawtest_xss === 1 || document.body.innerHTML.includes('window.__pawtest_xss=1')) {
      summary.xssReflected = true;
    }

    const submitButtons = forms.map((f) => {
      const btn = f.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
      return btn ? (btn.textContent || btn.getAttribute('value') || '').trim() : '';
    });
    summary.submitButtons = submitButtons;
    return summary;
  })()`);

  for (const btnText of result.submitButtons || []) {
    if (isMutationBlocked({ text: btnText })) {
      recordBlockedMutation(`Marmalade skipped destructive submit "${btnText}"`);
    }
  }

  if (result.xssReflected) {
    findings.push({
      id: 'marmalade-xss-reflection',
      severity: 'critical',
      axis: 'human',
      title: 'Reflected XSS payload executed or injected into DOM',
      detail: 'Inputting an HTML/event-handler payload caused unescaped DOM reflection or script execution.',
      fixHint: 'Escape all user input before rendering (use textContent instead of innerHTML) and enforce a strict Content-Security-Policy.'
    });
    quips.push('I rolled across the keyboard and popped an XSS alert — raw innerHTML is wide open!');
  }

  if (result.formCrash) {
    findings.push({
      id: 'marmalade-input-crash',
      severity: 'high',
      axis: 'human',
      title: 'Form input handler threw an exception during fuzzing',
      detail: 'Feeding 250 emojis or extreme negative numbers triggered a runtime error in an input listener.',
      fixHint: 'Guard input/change handlers against empty, negative, or oversized Unicode strings.'
    });
    quips.push('250 cat emojis broke your input handler — keyboard mash wins!');
  }

  if (result.missingMaxLength > 0) {
    findings.push({
      id: 'marmalade-missing-maxlength',
      severity: 'low',
      axis: 'human',
      title: `${result.missingMaxLength} text input(s) lack maxlength bounds`,
      detail: 'Unbounded text inputs invite oversized payloads, layout breakage, and client-side stalls.',
      fixHint: 'Add sensible maxlength attributes on text/search/textarea inputs and validate length server-side.'
    });
    if (!quips.length) quips.push(`Found ${result.missingMaxLength} text boxes with no maxlength — ready for a 500-emoji hairball.`);
  }

  if (result.unboundedNumberInput > 0) {
    findings.push({
      id: 'marmalade-unbounded-number',
      severity: 'medium',
      axis: 'human',
      title: `${result.unboundedNumberInput} numeric input(s) allow negative values (no min attribute)`,
      detail: 'Quantity or amount fields without min="0" can accept negative numbers on submit.',
      fixHint: 'Set explicit min/max attributes on <input type="number"> and enforce bounds on the server.'
    });
    if (!quips.length) quips.push('Ordered -999,999 items — your number input has no min boundary!');
  }

  if (quips.length === 0) {
    quips.push(`Fuzzed ${result.testedInputs.length} inputs with emojis & XSS strings — rock solid.`);
  }

  return { findings, quips, metrics: result };
}
