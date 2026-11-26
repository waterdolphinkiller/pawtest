import net from 'node:net';
import dns from 'node:dns/promises';

/**
 * Security Sandbox & Redaction Engine for PawTest v1.5.1.
 *
 * Enforces:
 * 1. Bare host normalization (localhost:3000 -> http://, example.com -> https://) + strict protocol allowlist
 * 2. SSRF protection against cloud metadata, IPv4/IPv6-mapped hex (::ffff:a9fe:a9fe), and RFC1918/ULA ranges
 * 3. Read-only default mode (blocks destructive HTTP methods & payment/delete actions)
 * 4. Regex-based secret/cookie/token/URL-query redaction before exporting reports
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

const DESTRUCTIVE_KEYWORDS = [
  'delete', 'remove', 'destroy', 'drop', 'purge', 'wipe',
  'pay', 'checkout', 'purchase', 'buy now', 'place order',
  'charge', 'transfer', 'wire', 'unsubscribe', 'close account',
  '删除', '支付', '立即购买', '确认付款', '注销', '清空'
];

const DESTRUCTIVE_HTTP_METHODS = new Set(['DELETE', 'PUT', 'PATCH']);

export const SECRET_PATTERNS = [
  { name: 'OpenAI Key', regex: /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{20,}\b/g, replacement: '[REDACTED:OPENAI_KEY]' },
  { name: 'Anthropic Key', regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, replacement: '[REDACTED:ANTHROPIC_KEY]' },
  { name: 'AWS Access Key', regex: /\bAKIA[0-9A-Z]{16}\b/g, replacement: '[REDACTED:AWS_KEY]' },
  { name: 'GitHub Token', regex: /\bgh[pousr]_[A-Za-z0-9]{24,}\b/g, replacement: '[REDACTED:GITHUB_TOKEN]' },
  { name: 'Stripe Secret Key', regex: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, replacement: '[REDACTED:STRIPE_KEY]' },
  { name: 'Supabase / JWT', regex: /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g, replacement: '[REDACTED:JWT_TOKEN]' },
  { name: 'Google API Key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g, replacement: '[REDACTED:GOOGLE_API_KEY]' },
  { name: 'Bearer Token', regex: /(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, replacement: '$1[REDACTED:BEARER]' },
  { name: 'Cookie Header', regex: /((?:Set-)?Cookie\s*[:=]\s*)[^\r\n;]{8,}/gi, replacement: '$1[REDACTED:COOKIE]' },
  { name: 'URL Query Secret', regex: /([?&](?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|key|password)=)[^&\s#'"]+/gi, replacement: '$1[REDACTED:QUERY_SECRET]' },
  { name: 'Inline Secret Assignment', regex: /((?:api[_-]?key|secret|token|password|supabase[_-]?anon[_-]?key)\s*[:=]\s*['"`])[^'"`\s]{10,}(['"`])/gi, replacement: '$1[REDACTED:SECRET]$2' }
];

export function classifyIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return 'invalid';
  }
  const [a, b] = parts;
  if (a === 127) return 'loopback';
  if (a === 0) return 'unspecified';
  if (a === 169 && b === 254) return 'metadata';
  if (a === 10) return 'private';
  if (a === 172 && b >= 16 && b <= 31) return 'private';
  if (a === 192 && b === 168) return 'private';
  if (a === 100 && b >= 64 && b <= 127) return 'private';
  return 'public';
}

export function classifyIPv6(ip) {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return 'loopback';
  if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return 'unspecified';
  if (lower.startsWith('fe80:')) return 'metadata';
  if (lower.startsWith('fc') || lower.startsWith('fd')) return 'private';

  // Handle both dotted ::ffff:169.254.169.254 and Node URL normalized hex ::ffff:a9fe:a9fe
  const mappedPrefix = lower.match(/^(?:0:0:0:0:0:ffff:|::ffff:)(.+)$/);
  if (mappedPrefix) {
    const tail = mappedPrefix[1];
    if (tail.includes('.')) {
      return classifyIPv4(tail);
    }
    const hexParts = tail.split(':');
    if (hexParts.length === 2) {
      const hi = parseInt(hexParts[0], 16);
      const lo = parseInt(hexParts[1], 16);
      if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
        const ipv4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
        return classifyIPv4(ipv4);
      }
    }
  }
  return 'public';
}

/**
 * Normalizes bare hostnames like "localhost:3000" or "example.com" while preserving explicit schemes.
 * @param {string} raw
 */
export function normalizeInputUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return trimmed;
  // Already has an explicit scheme like http://, https://, file://, ftp://, javascript:, data:
  if (/^(?:https?|file|ftp):\/\//i.test(trimmed) || /^(?:javascript|data|mailto|tel):/i.test(trimmed)) {
    return trimmed;
  }
  // Bare localhost / loopback / IP with optional port
  if (/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  // Bare domain name (e.g. example.com or app.example.com/path)
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:\/|$)/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export async function validateTargetUrl(rawUrl, opts = {}) {
  const normalized = normalizeInputUrl(rawUrl);
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return {
      ok: false,
      reason: `Invalid URL "${rawUrl}". Provide a valid http:// or https:// URL (e.g. https://example.com or localhost:3000).`
    };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return {
      ok: false,
      reason: `Blocked unsafe protocol "${parsed.protocol}". PawTest only allows http: and https: targets.`
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const bareHost = hostname.replace(/^\[|\]$/g, '');
  const isLocalName = hostname === 'localhost' || hostname.endsWith('.localhost');

  if (hostname === 'metadata.google.internal' || bareHost === '169.254.169.254') {
    return {
      ok: false,
      reason: `Blocked cloud metadata endpoint "${hostname}" (SSRF guardrail).`
    };
  }

  if (isLocalName && opts.blockLocalhost) {
    return {
      ok: false,
      reason: `Blocked localhost target "${hostname}" because --block-localhost is active.`
    };
  }

  const ipVer = net.isIP(bareHost);
  if (ipVer === 4 || ipVer === 6) {
    const kind = ipVer === 4 ? classifyIPv4(bareHost) : classifyIPv6(bareHost);
    if (kind === 'metadata' || kind === 'unspecified' || kind === 'invalid') {
      return { ok: false, reason: `Blocked ${kind} IP address "${hostname}" (SSRF guardrail).` };
    }
    if (kind === 'loopback' && opts.blockLocalhost) {
      return { ok: false, reason: `Blocked loopback IP "${hostname}" because --block-localhost is active.` };
    }
    if (kind === 'private' && !opts.allowPrivateIp) {
      return {
        ok: false,
        reason: `Blocked private network IP "${hostname}" (SSRF guardrail). Pass --allow-private-ip to override explicitly.`
      };
    }
    return { ok: true, url: parsed };
  }

  if (!opts.skipDns && !isLocalName) {
    try {
      const records = await dns.lookup(hostname, { all: true });
      for (const rec of records) {
        const kind = rec.family === 4 ? classifyIPv4(rec.address) : classifyIPv6(rec.address);
        if (kind === 'metadata' || kind === 'unspecified') {
          return { ok: false, reason: `DNS resolved "${hostname}" to blocked ${kind} IP ${rec.address}.` };
        }
        if (kind === 'private' && !opts.allowPrivateIp) {
          return { ok: false, reason: `DNS resolved "${hostname}" to private IP ${rec.address} (SSRF guardrail).` };
        }
        if (kind === 'loopback' && opts.blockLocalhost) {
          return { ok: false, reason: `DNS resolved "${hostname}" to loopback IP ${rec.address}.` };
        }
      }
    } catch {}
  }

  return { ok: true, url: parsed };
}

export function isMutationBlocked(action, allowMutations = false) {
  if (allowMutations) return false;
  if (action.method && DESTRUCTIVE_HTTP_METHODS.has(action.method.toUpperCase())) {
    return true;
  }
  const haystack = `${action.text || ''} ${action.href || ''}`.toLowerCase();
  return DESTRUCTIVE_KEYWORDS.some((kw) => haystack.includes(kw));
}

export function redactText(input) {
  if (typeof input !== 'string' || !input) return { text: input, count: 0 };
  let text = input;
  let count = 0;
  for (const { regex, replacement } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    const matches = text.match(regex);
    if (matches) {
      count += matches.length;
      text = text.replace(regex, replacement);
    }
  }
  return { text, count };
}

export function sanitizeReport(value) {
  let redactions = 0;
  const walk = (node) => {
    if (typeof node === 'string') {
      const res = redactText(node);
      redactions += res.count;
      return res.text;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(node)) out[k] = walk(v);
      return out;
    }
    return node;
  };
  return { data: walk(value), redactions };
}
