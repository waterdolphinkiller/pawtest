/**
 * D2 · Antidote (Porcelain White Cat) — Indirect Prompt Injection, Unicode Tag Smuggling (U+E0000–U+E007F),
 * Open Shadow DOM Piercing & Markdown Image Exfiltration Scanner.
 * Squad D | AI Agent Readiness | Default Fast Mode
 */

export const meta = {
  id: 'antidote',
  code: 'D2',
  name: 'Antidote',
  title: '试毒白猫 · 防提示词与隐写投毒',
  squad: 'D',
  axis: 'agent',
  mode: 'fast',
  color: '#f8fafc',
  accentColor: '#a3e635',
  prop: 'Safety Goggles + Litmus Strip',
  description: 'Scans comments, hidden/off-screen CSS, open Shadow DOM, Unicode Tag smuggling (U+E0000) & Markdown image exfiltration beacons.'
};

const INJECTION_PATTERNS = [
  { name: 'Instruction Override', regex: /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?/i },
  { name: 'System Prompt Hijack', regex: /(?:^|\s)(?:system\s*prompt|you\s+are\s+now\s+(?:in\s+)?developer\s+mode|disregard\s+safety)/i },
  { name: 'Exfiltration Directive', regex: /(?:exfiltrate|send\s+(?:all\s+)?(?:cookies|tokens|credentials|session)|curl\s+https?:\/\/)/i },
  { name: 'Tool Abuse Directive', regex: /(?:transfer\s+funds|confirm\s+purchase\s+immediately|call\s+tool\s+delete|bypass\s+confirmation)/i },
  { name: 'Hidden Agent Command', regex: /(?:\[SYSTEM\]|<\|im_start\|>system|IMPORTANT\s+FOR\s+AI\s+AGENT)/i },
  { name: 'Markdown Image Exfiltration', regex: /!\[[^\]]*\]\(https?:\/\/[^)]*(?:token|cookie|secret|leak|data|q)=/i }
];

/**
 * Decodes invisible ASCII smuggled inside Unicode Tag characters (U+E0020..U+E007E).
 * @param {string} str
 */
function decodeUnicodeTags(str) {
  let decoded = '';
  let count = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp >= 0xe0020 && cp <= 0xe007e) {
      decoded += String.fromCharCode(cp - 0xe0000);
      count++;
    }
  }
  return { decoded, count };
}

export async function run(ctx) {
  const { page, targetUrl, extraHeaders } = ctx;
  const findings = [];
  const quips = [];

  const extracted = await page.evaluate(`(() => {
    const surfaces = [];

    const scanRoot = (root, prefix) => {
      // 1. HTML comments
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
      let node;
      while ((node = walker.nextNode())) {
        const val = (node.nodeValue || '').trim();
        if (val.length > 8) surfaces.push({ surface: prefix + 'HTML comment', text: val.slice(0, 400) });
      }

      // 2. Elements (hidden/off-screen/Unicode-smuggled/Shadow DOM)
      for (const el of Array.from(root.querySelectorAll('*')).slice(0, 400)) {
        if (el.shadowRoot) {
          scanRoot(el.shadowRoot, 'Shadow DOM > ');
        }
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
        const directText = Array.from(el.childNodes)
          .filter((c) => c.nodeType === Node.TEXT_NODE)
          .map((c) => c.textContent || '')
          .join(' ')
          .trim();
        if (directText.length < 8) continue;

        // Always inspect text containing Unicode Tag smuggling (U+E0000+) or Markdown image beacons
        const hasUnicodeTags = /[\\u{E0000}-\\u{E007F}]/u.test(directText);
        const hasZeroWidthBurst = /[\\u200B\\u200C\\u200D\\uFEFF]{6,}/.test(directText);
        const hasMdImg = /!\\[[^\\]]*\\]\\(https?:\\/\\//i.test(directText);

        if (hasUnicodeTags) {
          surfaces.push({ surface: prefix + 'Unicode Tag Smuggling', text: directText.slice(0, 600), unicodeTag: true });
          continue;
        }
        if (hasZeroWidthBurst) {
          surfaces.push({ surface: prefix + 'Zero-Width Steganography', text: directText.slice(0, 400), zeroWidth: true });
        }
        if (hasMdImg) {
          surfaces.push({ surface: prefix + 'Markdown Beacon', text: directText.slice(0, 400) });
        }

        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const leftVal = parseFloat(style.left);
        const topVal = parseFloat(style.top);
        const indentVal = parseFloat(style.textIndent);
        const clipStr = (style.clip || '') + ' ' + (style.clipPath || '');

        const isOffscreen =
          (!Number.isNaN(leftVal) && leftVal < -500) ||
          (!Number.isNaN(topVal) && topVal < -500) ||
          (!Number.isNaN(indentVal) && indentVal < -500) ||
          (rect.width > 0 && (rect.right < -20 || rect.bottom < -20)) ||
          /rect\\(0px,\\s*0px,\\s*0px,\\s*0px\\)|inset\\((?:50|100)%/i.test(clipStr) ||
          (style.overflow === 'hidden' && rect.width <= 2 && rect.height <= 2);

        const isHidden =
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          parseFloat(style.opacity) < 0.05 ||
          parseFloat(style.fontSize) <= 1 ||
          isOffscreen ||
          (style.color && style.backgroundColor && style.color === style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)');

        if (isHidden && directText.length >= 12) {
          surfaces.push({
            surface: prefix + (isOffscreen ? 'Off-screen CSS stealth text' : 'Hidden/Stealth DOM text'),
            text: directText.slice(0, 400)
          });
        }
      }

      // 3. WebMCP & ARIA metadata
      for (const el of Array.from(root.querySelectorAll('[tooldescription], [aria-description], [data-prompt]'))) {
        const val = el.getAttribute('tooldescription') || el.getAttribute('aria-description') || el.getAttribute('data-prompt') || '';
        if (val.length > 8) surfaces.push({ surface: prefix + 'WebMCP/ARIA metadata', text: val.slice(0, 400) });
      }

      // 4. Visible UGC / comment blocks
      for (const el of Array.from(root.querySelectorAll('.comment, .review, [data-ugc], article, blockquote')).slice(0, 40)) {
        const txt = (el.textContent || '').trim();
        if (txt.length > 12) surfaces.push({ surface: prefix + 'UGC / Review text', text: txt.slice(0, 600) });
      }
    };

    scanRoot(document.documentElement, '');

    // 5. JSON-LD structured data blocks (common 2026 indirect prompt-injection vector)
    for (const sc of Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 12)) {
      const txt = (sc.textContent || '').trim();
      if (txt.length > 10) {
        surfaces.push({ surface: 'JSON-LD structured data', text: txt.slice(0, 4000) });
        if (/[\u{E0020}-\u{E007E}]/u.test(txt)) {
          surfaces.push({ surface: 'JSON-LD Unicode Tag smuggling', text: txt, unicodeTag: true });
        }
      }
    }

    return surfaces;
  })()`);

  // 6. Probe Accept: text/markdown response body for Markdown-only prompt injection & exfil beacons
  if (targetUrl) {
    try {
      const mdRes = await fetch(targetUrl, {
        headers: { ...(extraHeaders || {}), Accept: 'text/markdown, text/plain;q=0.9, */*;q=0.1' }
      }).catch(() => null);
      const ct = (mdRes?.headers?.get('content-type') || '').toLowerCase();
      if (mdRes && mdRes.ok && ct.includes('text/markdown')) {
        const mdBody = (await mdRes.text()).trim();
        if (mdBody.length >= 10 && !/^<(?:!doctype|html)\b/i.test(mdBody)) {
          extracted.push({ surface: 'Accept: text/markdown response', text: mdBody.slice(0, 6000) });
          if (/[\u{E0020}-\u{E007E}]/u.test(mdBody)) {
            extracted.push({ surface: 'Markdown Unicode Tag smuggling', text: mdBody, unicodeTag: true });
          }
        }
      }
    } catch {}
  }

  const hits = [];
  for (const item of extracted) {
    if (item.unicodeTag) {
      const { decoded, count } = decodeUnicodeTags(item.text);
      if (count >= 6) {
        hits.push({
          surface: item.surface,
          pattern: 'Unicode Tag ASCII Smuggling (U+E0000)',
          snippet: decoded.slice(0, 120)
        });
      }
      continue;
    }
    for (const pat of INJECTION_PATTERNS) {
      if (pat.regex.test(item.text)) {
        hits.push({
          surface: item.surface,
          pattern: pat.name,
          snippet: item.text.slice(0, 120)
        });
      }
    }
  }

  if (hits.length > 0) {
    const first = hits[0];
    findings.push({
      id: 'antidote-prompt-injection',
      severity: 'critical',
      axis: 'agent',
      title: `Indirect Prompt Injection payload detected in ${first.surface} (${hits.length} hit(s))`,
      detail: `Matched "${first.pattern}" inside ${first.surface}: "${first.snippet}"`,
      fixHint: 'Strip Unicode Tag characters (U+E0000–U+E007F), sanitize UGC/Shadow DOM text, block Markdown exfiltration images, and isolate untrusted text from WebMCP metadata.'
    });
    quips.push(`Litmus strip turned neon purple! Caught "${first.pattern}" hiding inside ${first.surface}.`);
  } else {
    quips.push(`Tested ${extracted.length} comments, Shadow DOM, Unicode tags & stealth nodes — zero prompt-injection poison!`);
  }

  return {
    findings,
    quips,
    metrics: {
      surfacesScanned: extracted.length,
      injectionHits: hits.length
    }
  };
}
