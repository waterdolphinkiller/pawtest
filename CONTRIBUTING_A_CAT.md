# Contributing Cat #17 to PawTest

Every PawTest QA agent is a single, self-contained ESM module in `src/cats/<your-cat>.js` (under ~150 lines) that exports `meta` and `async run(ctx)`.

## 1. Copy This Template

Create `src/cats/mycat.js`:

```js
export const meta = {
  id: 'mycat',
  code: 'E1',
  name: 'MyCat',
  title: 'Custom Domain QA Cat',
  squad: 'D',        // 'A' | 'B' | 'C' | 'D'
  axis: 'agent',     // 'human' | 'agent' | 'dual'
  mode: 'full',      // 'fast' | 'full'
  color: '#14b8a6',
  accentColor: '#5eead4',
  prop: 'Custom Prop',
  description: 'One-sentence description of the deterministic check.'
};

export async function run(ctx) {
  const { page, targetUrl, isMutationBlocked, recordBlockedMutation } = ctx;
  const findings = [];
  const quips = [];

  const check = await page.evaluate(`(() => {
    return { ok: true };
  })()`);

  if (!check.ok) {
    findings.push({
      id: 'mycat-defect',
      severity: 'high', // 'critical' | 'high' | 'medium' | 'low' | 'info'
      axis: 'agent',    // 'human' | 'agent'
      title: 'Clear, actionable defect headline',
      detail: 'Exact evidence observed on the page.',
      fixHint: 'Concrete code or header fix.'
    });
    quips.push('Short, memorable cat verdict for the scorecard!');
  } else {
    quips.push('Everything checked out cleanly!');
  }

  return { findings, quips, metrics: check };
}
```

## 2. Register Your Cat

1. Import and add your cat to `ALL_CATS` in `src/cats/index.js`.
2. Add a matching visual color/prop entry in `src/ui/stage.html` so it appears on the WebGL2 live stage.
3. Add a deterministic test case in `test/e2e.test.mjs` and run `npm test`.

## 3. Rules for Great QA Cats

- **Deterministic & $0 API Cost**: Base assertions on real DOM/AXTree/CDP/HTTP signals rather than LLM calls.
- **Respect Read-Only Mode**: Never click destructive or payment controls without checking `isMutationBlocked()`.
- **Fast & Isolated**: Complete within 8 seconds so your cat never slows down CI.
