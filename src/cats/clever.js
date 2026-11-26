/**
 * C4 · Clever (Pearl Persian) — Core Flow Smoke Test & Embedded AI Chat Widget Safety Probe.
 * Squad C | Dual Axis (Human + Agent) | --full Mode
 */

export const meta = {
  id: 'clever',
  code: 'C4',
  name: 'Clever',
  title: '波斯猫 · 主流冒烟与内置AI探测',
  squad: 'C',
  axis: 'dual',
  mode: 'full',
  color: '#f1f5f9',
  accentColor: '#60a5fa',
  prop: 'Dialogue Probe Bubble',
  description: 'Verifies core interactive flow readiness and inspects embedded AI chat widgets for guardrails & rate/error handling.'
};

export async function run(ctx) {
  const { page } = ctx;
  const findings = [];
  const quips = [];

  const probe = await page.evaluate(`(() => {
    const hasInteractive = document.querySelectorAll('a[href], button, form').length > 0;
    const bodyWords = (document.body.innerText || '').trim().split(/\\s+/).filter(Boolean).length;
    const chatWidgets = Array.from(document.querySelectorAll('[data-ai-chat], .ai-chat-widget, [aria-label*="chat" i], [placeholder*="ask ai" i]'));
    const unguardedChat = chatWidgets.filter((el) => !el.hasAttribute('data-guardrail') && !el.closest('[data-guardrail]')).length;
    return { hasInteractive, bodyWords, chatWidgetCount: chatWidgets.length, unguardedChat };
  })()`);

  if (!probe.hasInteractive || probe.bodyWords < 8) {
    findings.push({
      id: 'clever-empty-flow',
      severity: 'high',
      axis: 'human',
      title: 'Primary user flow appears empty or non-interactive',
      detail: `Detected ${probe.bodyWords} visible words and interactive=${probe.hasInteractive}.`,
      fixHint: 'Ensure the landing view renders meaningful copy and at least one clear primary call-to-action.'
    });
    quips.push('Looked for the core user flow and found an empty room!');
  }

  if (probe.unguardedChat > 0) {
    findings.push({
      id: 'clever-unguarded-ai-chat',
      severity: 'medium',
      axis: 'agent',
      title: `${probe.unguardedChat} embedded AI chat widget(s) detected without explicit prompt-guard metadata`,
      detail: 'Embedded AI chat widgets should enforce server-side system-prompt isolation, max input length, and SSE disconnect recovery.',
      fixHint: 'Add maxlength limits, server-side prompt-injection filtering, and graceful SSE reconnect handling to AI chat inputs.'
    });
    if (!quips.length) quips.push(`Poked ${probe.unguardedChat} embedded AI chat box — make sure SSE drops & jailbreaks are guarded!`);
  }

  if (quips.length === 0) {
    quips.push(`Core flow smoke check green (${probe.bodyWords} words, interactive controls responsive).`);
  }

  return { findings, quips, metrics: probe };
}
