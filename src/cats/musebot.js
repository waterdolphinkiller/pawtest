/**
 * D1 · MuseBot (Translucent Violet VR Cat) — Autonomous Agent AXTree Deep Exposure
 * (Key Conversion CTAs & Prices in DOM + AXTree + Open Shadow DOM Penetration +
 * Obfuscated Canvas/Image/Pseudo-Element Price Detection + DOM vs JSON-LD Price Parity +
 * W3C document.modelContext WebMCP Live Safe Dry-Run).
 * Squad D | AI Agent Readiness | Default Fast Mode
 */

export const meta = {
  id: 'musebot',
  code: 'D1',
  name: 'MuseBot',
  title: '代购猫 · AXTree / 价格穿透 / WebMCP',
  squad: 'D',
  axis: 'agent',
  mode: 'fast',
  color: '#8b5cf6',
  accentColor: '#c4b5fd',
  prop: 'VR Visor + AXTree & Price Scanner',
  description: 'Verifies key CTAs & prices in DOM/AXTree/Shadow DOM, catches obfuscated prices & JSON-LD drift, and dry-runs W3C WebMCP tools.'
};

export async function run(ctx) {
  const { page } = ctx;
  const findings = [];
  const quips = [];

  const [axNodes, domAudit] = await Promise.all([
    page.getAccessibilityTree(),
    page.evaluate(`(async () => {
      // Recursive open Shadow DOM collector
      function collectAllElements(root) {
        const out = [];
        const stack = [root];
        while (stack.length) {
          const cur = stack.pop();
          if (!cur || !cur.querySelectorAll) continue;
          const els = cur.querySelectorAll('*');
          for (const el of els) {
            out.push(el);
            if (el.shadowRoot) stack.push(el.shadowRoot);
          }
        }
        return out;
      }

      const allEls = collectAllElements(document);
      const hasDocModelContext = typeof document !== 'undefined' && 'modelContext' in document && !!document.modelContext;
      const hasLegacyNavModelContext = typeof navigator !== 'undefined' && 'modelContext' in navigator && !!navigator.modelContext;
      const mc = hasDocModelContext ? document.modelContext : (hasLegacyNavModelContext ? navigator.modelContext : null);

      const toolElements = allEls
        .filter((el) => el.hasAttribute('toolname') || el.hasAttribute('data-webmcp-tool'))
        .map((el) => ({
          tool: (el.getAttribute('toolname') || el.getAttribute('data-webmcp-tool') || '').trim(),
          desc: (el.getAttribute('tooldescription') || '').trim()
        }));
      const invalidTools = toolElements.filter((t) => !t.tool || t.desc.length < 6);

      // Safe read-only dry-run of imperative WebMCP tools exposing execute()
      const dryRuns = [];
      const destructiveRe = /(delete|remove|pay|checkout|purchase|charge|transfer|order|buy)/i;
      const toolsList = Array.isArray(mc?.tools) ? mc.tools : [];
      for (const tool of toolsList.slice(0, 4)) {
        if (!tool || typeof tool.execute !== 'function') continue;
        if (destructiveRe.test(String(tool.name || ''))) continue;
        try {
          const sampleInput = {};
          const props = tool.inputSchema?.properties || {};
          for (const [k, spec] of Object.entries(props)) {
            sampleInput[k] = spec.type === 'number' ? 1 : spec.type === 'boolean' ? true : 'pawtest';
          }
          const out = await tool.execute(sampleInput);
          dryRuns.push({ name: tool.name, ok: out !== undefined && out !== null, error: null });
        } catch (err) {
          dryRuns.push({ name: tool.name, ok: false, error: String(err?.message || err) });
        }
      }

      function isHiddenFromAx(el) {
        let cur = el;
        while (cur && cur.nodeType === 1) {
          if (cur.getAttribute('aria-hidden') === 'true' || cur.hasAttribute('inert')) return true;
          cur = cur.parentElement || (cur.getRootNode && cur.getRootNode().host) || null;
        }
        return false;
      }

      const interactiveSelector = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"]';
      const interactive = allEls.filter((el) => el.matches && el.matches(interactiveSelector));
      let unlabeled = 0;
      const unlabeledSamples = [];
      const ctaRe = /(add to cart|buy now|checkout|place order|subscribe|sign up|pay now|purchase|order now|加入购物车|立即购买|结账|去支付|立即下单)/i;
      const keyCtas = [];

      for (const el of interactive) {
        const text = (el.textContent || '').trim();
        const aria = (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.getAttribute('placeholder') || '').trim();
        const id = el.id;
        const root = el.getRootNode ? el.getRootNode() : document;
        const hasLabelEl = id && root.querySelector ? !!root.querySelector('label[for="' + CSS.escape(id) + '"]') : !!el.closest('label');
        const accessibleName = text || aria || '';
        if (!text && !aria && !hasLabelEl) {
          unlabeled++;
          unlabeledSamples.push(el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''));
        }
        if (ctaRe.test(accessibleName)) {
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          const inShadow = el.getRootNode && el.getRootNode() instanceof ShadowRoot;
          keyCtas.push({
            name: accessibleName.slice(0, 60),
            inShadow,
            axHidden: isHiddenFromAx(el),
            pointerBlocked: style.pointerEvents === 'none',
            zeroSize: rect.width < 4 || rect.height < 4
          });
        }
      }

      const divClickables = allEls.filter((el) =>
        (el.tagName === 'DIV' || el.tagName === 'SPAN') && el.hasAttribute('onclick') && !el.getAttribute('role')
      ).length;

      // Price exposure & obfuscation detection across DOM + Shadow DOM
      const pricePattern = /(?:[$€£¥₹]|USD|EUR|GBP|MYR|RM|CNY)\\s*\\d{1,6}(?:[.,]\\d{2})?|\\d{1,6}(?:[.,]\\d{2})\\s*(?:USD|EUR|GBP|MYR)/i;
      const domPrices = [];
      const obfuscatedPrices = [];
      const unmarkedStrikethroughPrices = [];

      for (const el of allEls) {
        const cls = typeof el.className === 'string' ? el.className : '';
        const isPriceEl =
          /\\bprice\\b|product-price|offer-price/i.test(cls) ||
          el.hasAttribute('data-price') ||
          el.getAttribute('itemprop') === 'price';

        const ownText = (el.textContent || '').trim();
        if (isPriceEl) {
          const beforeContent = getComputedStyle(el, '::before').content || '';
          const afterContent = getComputedStyle(el, '::after').content || '';
          const pseudoHasPrice = pricePattern.test(beforeContent) || pricePattern.test(afterContent);
          const hasCanvasOrImg = !!el.querySelector('canvas, img, svg');
          const axHidden = isHiddenFromAx(el);

          if (!ownText && (pseudoHasPrice || hasCanvasOrImg)) {
            obfuscatedPrices.push({
              reason: pseudoHasPrice ? 'CSS ::before/::after pseudo-element' : 'Canvas/Image/SVG non-text price',
              selector: el.tagName.toLowerCase() + (cls ? '.' + cls.split(' ')[0] : '')
            });
          } else if (ownText && axHidden) {
            obfuscatedPrices.push({
              reason: 'aria-hidden="true" hides price from AXTree',
              selector: el.tagName.toLowerCase() + (cls ? '.' + cls.split(' ')[0] : '')
            });
          } else if (ownText) {
            const st = getComputedStyle(el);
            const isLineThrough = /line-through/i.test(st.textDecorationLine || st.textDecoration || '');
            const hasSemanticDel = el.tagName === 'DEL' || el.tagName === 'S' || !!el.closest('del, s') || /original|was|old|compare/i.test(el.getAttribute('aria-label') || '');
            if (isLineThrough && !hasSemanticDel) {
              unmarkedStrikethroughPrices.push(ownText.slice(0, 32));
            } else {
              const numMatch = ownText.match(/\\d+(?:[.,]\\d{1,2})?/);
              if (numMatch) domPrices.push(Number(numMatch[0].replace(',', '.')));
            }
          }
        }
      }

      // Extract JSON-LD Offer/Product prices for DOM vs JSON-LD parity check
      const jsonLdPrices = [];
      for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const parsed = JSON.parse(script.textContent || '');
          const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
          while (queue.length) {
            const node = queue.pop();
            if (!node || typeof node !== 'object') continue;
            if (node.price !== undefined && !Number.isNaN(Number(node.price))) {
              jsonLdPrices.push(Number(node.price));
            }
            if (node.offers) {
              const offers = Array.isArray(node.offers) ? node.offers : [node.offers];
              queue.push(...offers);
            }
            if (Array.isArray(node['@graph'])) queue.push(...node['@graph']);
          }
        } catch {}
      }

      // Extract real <form> inputs for intelligent WebMCP tool schema scaffolding
      const detectedForms = Array.from(document.querySelectorAll('form')).slice(0, 6).map((form, idx) => {
        const fields = Array.from(form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]), select, textarea')).map((inp) => ({
          name: (inp.getAttribute('name') || inp.id || 'field_' + idx).trim(),
          type: inp.tagName === 'SELECT' ? 'string' : (inp.type === 'number' ? 'number' : inp.type === 'checkbox' ? 'boolean' : 'string'),
          required: inp.hasAttribute('required'),
          description: (inp.getAttribute('aria-label') || inp.getAttribute('placeholder') || inp.getAttribute('name') || inp.id || 'Form input').trim()
        })).filter((f) => f.name);
        const btnText = (form.querySelector('button, input[type="submit"]')?.textContent || form.id || 'submit_form').trim();
        return { id: form.id || ('form_' + (idx + 1)), action: form.getAttribute('action') || '', label: btnText.slice(0, 50), fields };
      }).filter((f) => f.fields.length > 0);

      return {
        detectedForms,
        hasDocModelContext,
        hasLegacyNavModelContext,
        webmcpToolCount: toolElements.length + toolsList.length,
        invalidToolCount: invalidTools.length,
        dryRuns,
        interactiveCount: interactive.length,
        unlabeledCount: unlabeled,
        unlabeledSamples: unlabeledSamples.slice(0, 5),
        divClickables,
        keyCtas,
        domPrices: [...new Set(domPrices)].slice(0, 10),
        jsonLdPrices: [...new Set(jsonLdPrices)].slice(0, 10),
        obfuscatedPrices: obfuscatedPrices.slice(0, 5),
        unmarkedStrikethroughPrices: unmarkedStrikethroughPrices.slice(0, 5)
      };
    })()`)
  ]);

  const namedInteractiveAxNodes = axNodes.filter((n) => {
    const role = n.role?.value || '';
    const name = n.name?.value || '';
    return ['button', 'link', 'textbox', 'combobox', 'checkbox', 'menuitem'].includes(role) && name.trim().length > 0;
  });

  const axNamesLower = new Set(namedInteractiveAxNodes.map((n) => (n.name?.value || '').trim().toLowerCase()));

  // Check if key conversion CTAs are blocked or missing from the actual CDP AXTree
  const brokenCtas = (domAudit.keyCtas || []).filter(
    (cta) => cta.axHidden || cta.pointerBlocked || cta.zeroSize || !axNamesLower.has(cta.name.toLowerCase())
  );
  if (brokenCtas.length > 0) {
    const summary = brokenCtas
      .map((c) => `"${c.name}" (${c.axHidden ? 'aria-hidden/inert' : c.pointerBlocked ? 'pointer-events:none' : c.zeroSize ? '0px size' : 'missing from AXTree'})`)
      .join(', ');
    findings.push({
      id: 'musebot-cta-axtree-blocked',
      severity: 'high',
      axis: 'agent',
      title: `${brokenCtas.length} key conversion CTA(s) unreachable in Accessibility Tree`,
      detail: `Autonomous agents cannot reliably click: ${summary}.`,
      fixHint: 'Ensure primary Add-to-Cart / Buy / Checkout buttons are native <button> elements outside aria-hidden/inert containers with visible accessible names.'
    });
    quips.push(`Tried clicking "${brokenCtas[0].name}" in AXTree and hit an invisible wall!`);
  }

  // Check obfuscated / non-DOM prices (Canvas, Image, CSS ::before/::after, aria-hidden)
  if ((domAudit.obfuscatedPrices || []).length > 0) {
    const first = domAudit.obfuscatedPrices[0];
    findings.push({
      id: 'musebot-price-obfuscated',
      severity: 'high',
      axis: 'agent',
      title: `${domAudit.obfuscatedPrices.length} price element(s) hidden from pure DOM / Accessibility Tree`,
      detail: `Detected non-readable price rendering at ${first.selector}: ${first.reason}.`,
      fixHint: 'Render product prices as plain DOM text (never solely in CSS ::before/::after, <canvas>, images, or aria-hidden nodes) so AI shopping agents read them reliably.'
    });
    if (!quips.length) quips.push(`Price tag at ${first.selector} is hidden inside ${first.reason} — unreadable in AXTree!`);
  }

  if ((domAudit.unmarkedStrikethroughPrices || []).length > 0) {
    findings.push({
      id: 'musebot-strikethrough-price-unmarked',
      severity: 'medium',
      axis: 'agent',
      title: `${domAudit.unmarkedStrikethroughPrices.length} struck-through price(s) lack semantic <del>/<s> markup`,
      detail: `CSS line-through price (${domAudit.unmarkedStrikethroughPrices.join(', ')}) has no <del>/<s> or aria-label, causing AI agents to confuse old prices with active sale prices.`,
      fixHint: 'Wrap original struck-through prices in semantic <del> tags or add aria-label="Original price".'
    });
  }

  // Check DOM visible price vs JSON-LD Offer.price parity
  const positiveDomPrices = (domAudit.domPrices || []).filter((p) => p > 0);
  const positiveLdPrices = (domAudit.jsonLdPrices || []).filter((p) => p > 0);
  let priceParityMismatch = false;
  if (positiveDomPrices.length > 0 && positiveLdPrices.length > 0) {
    const anyMatch = positiveLdPrices.some((lp) => positiveDomPrices.some((dp) => Math.abs(lp - dp) < 0.01));
    if (!anyMatch) {
      priceParityMismatch = true;
      findings.push({
        id: 'musebot-price-parity-mismatch',
        severity: 'high',
        axis: 'agent',
        title: 'DOM visible price does not match JSON-LD Product/Offer price',
        detail: `Visible DOM price(s): [${positiveDomPrices.join(', ')}] vs JSON-LD price(s): [${positiveLdPrices.join(', ')}]. Price drift causes autonomous shopping agents to abort checkout.`,
        fixHint: 'Generate DOM price and JSON-LD Offer.price from the same server-side source of truth.'
      });
      if (!quips.length) {
        quips.push(`Price mismatch! Page shows ${positiveDomPrices[0]} while JSON-LD claims ${positiveLdPrices[0]}!`);
      }
    }
  }

  const failedDryRuns = (domAudit.dryRuns || []).filter((d) => !d.ok);
  if (failedDryRuns.length > 0) {
    const first = failedDryRuns[0];
    findings.push({
      id: 'musebot-webmcp-dryrun-failed',
      severity: 'high',
      axis: 'agent',
      title: `WebMCP tool "${first.name}" failed read-only dry-run execution`,
      detail: first.error
        ? `Calling ${first.name}() with schema-valid input threw: ${first.error}`
        : `Calling ${first.name}() returned empty/undefined result instead of structured JSON.`,
      fixHint: 'Ensure every registered WebMCP tool validates inputs gracefully and returns a non-null JSON result.'
    });
    if (!quips.length) quips.push(`Dry-ran WebMCP tool "${first.name}" and it crashed right in my VR headset!`);
  }

  if (domAudit.unlabeledCount > 0) {
    findings.push({
      id: 'musebot-unlabeled-controls',
      severity: domAudit.unlabeledCount >= 3 ? 'high' : 'medium',
      axis: 'agent',
      title: `${domAudit.unlabeledCount} interactive control(s) have no accessible name`,
      detail: `Autonomous agents relying on the Accessibility Tree cannot identify: ${domAudit.unlabeledSamples.join(', ')}.`,
      fixHint: 'Provide explicit <label for="...">, visible text, or aria-label on every button, link, and input.'
    });
    if (!quips.length) quips.push(`Put on my VR visor and hit ${domAudit.unlabeledCount} mystery buttons with zero accessible labels!`);
  }

  if (domAudit.divClickables > 0) {
    findings.push({
      id: 'musebot-nonsemantic-clickables',
      severity: 'high',
      axis: 'agent',
      title: `${domAudit.divClickables} clickable <div>/<span> element(s) missing semantic roles`,
      detail: 'Non-semantic click handlers are invisible to AXTree-only autonomous agents like Meta Muse and Anthropic Duet.',
      fixHint: 'Use native <button> or <a href>, or add role="button" tabindex="0" and keyboard support.'
    });
    if (!quips.length) quips.push(`Found ${domAudit.divClickables} clickable <div> traps invisible to AXTree agents.`);
  }

  if (!domAudit.hasDocModelContext && !domAudit.hasLegacyNavModelContext && domAudit.webmcpToolCount === 0) {
    findings.push({
      id: 'musebot-no-webmcp',
      severity: 'medium',
      axis: 'agent',
      title: 'No WebMCP (document.modelContext / declarative toolname) declarations detected',
      detail: 'W3C WebMCP (Nov 2026 spec: document.modelContext + declarative toolname) lets AI agents invoke forms deterministically without brittle DOM scraping.',
      fixHint: 'Register structured tools via document.modelContext.registerTool() (or the W3C WebMCP polyfill) and add toolname/tooldescription attributes to key forms.'
    });
    if (!quips.length) quips.push('No WebMCP tools exposed — forced to fumble through raw DOM like it is 2024.');
  } else if (!domAudit.hasDocModelContext && domAudit.hasLegacyNavModelContext) {
    findings.push({
      id: 'musebot-legacy-webmcp-api',
      severity: 'low',
      axis: 'agent',
      title: 'Uses legacy navigator.modelContext instead of current document.modelContext spec',
      detail: 'The W3C WebMCP draft migrated from navigator.modelContext to document.modelContext in July 2026.',
      fixHint: 'Migrate registrations to document.modelContext.registerTool() while optionally keeping a navigator.modelContext shim.'
    });
  }

  if (domAudit.invalidToolCount > 0) {
    findings.push({
      id: 'musebot-incomplete-webmcp-schema',
      severity: 'low',
      axis: 'agent',
      title: `${domAudit.invalidToolCount} declarative WebMCP tool(s) missing descriptive tooldescription`,
      detail: 'Empty or vague tool descriptions cause AI agents to mis-invoke form actions.',
      fixHint: 'Provide clear, specific tooldescription text (>= 6 chars) on every [toolname] element.'
    });
  }

  if (quips.length === 0) {
    const dryNote = domAudit.dryRuns?.length ? ` + ${domAudit.dryRuns.length} WebMCP dry-run(s)` : '';
    quips.push(`AXTree crystal clear (${namedInteractiveAxNodes.length} named controls, CTAs & prices verified) + WebMCP ready${dryNote}!`);
  }

  return {
    findings,
    quips,
    metrics: {
      axNodeCount: axNodes.length,
      namedInteractiveAxNodes: namedInteractiveAxNodes.length,
      brokenCtaCount: brokenCtas.length,
      priceParityMismatch,
      ...domAudit
    }
  };
}
