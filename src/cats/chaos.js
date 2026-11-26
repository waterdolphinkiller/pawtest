/**
 * B4 · Chaos (Sphynx Cat) — Offline White-Screen Degradation & Session/Cookie Resilience.
 * Squad B | Human UX | --full Mode
 */

export const meta = {
  id: 'chaos',
  code: 'B4',
  name: 'Chaos',
  title: '无毛猫 · 断网与会话容错',
  squad: 'B',
  axis: 'human',
  mode: 'full',
  color: '#e11d48',
  accentColor: '#38bdf8',
  prop: 'Spilled Blue WiFi Cup',
  description: 'Simulates sudden offline disconnect & cookie clearing to catch unhandled white-screen crashes.'
};

export async function run(ctx) {
  const { page } = ctx;
  const findings = [];
  const quips = [];

  const beforeErrors = page.pageErrors.length;
  await page.setNetworkProfile('offline');
  await page.clearCookies();

  try {
    const check = await page.evaluate(`(async () => {
      window.dispatchEvent(new Event('offline'));
      await new Promise((r) => setTimeout(r, 150));
      const textLen = (document.body.innerText || '').trim().length;
      const hasOfflineHandler = 'onoffline' in window;
      return { textLen, hasOfflineHandler };
    })()`);

    const newErrors = page.pageErrors.length - beforeErrors;
    if (check.textLen === 0 || newErrors > 0) {
      findings.push({
        id: 'chaos-offline-crash',
        severity: 'high',
        axis: 'human',
        title: `Offline event triggered ${newErrors} uncaught error(s) or blank screen`,
        detail: `Body visible text length after offline disconnect: ${check.textLen}, new exceptions: ${newErrors}.`,
        fixHint: 'Wrap network calls in try/catch with a friendly offline banner instead of crashing the UI tree.'
      });
      quips.push('Knocked over the WiFi cup and your app face-planted into an error!');
    } else {
      quips.push('Knocked over the WiFi cup & wiped cookies — page stayed upright without crashing!');
    }

    return { findings, quips, metrics: { ...check, newErrors } };
  } finally {
    await page.setNetworkProfile('online');
  }
}
