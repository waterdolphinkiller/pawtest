/**
 * RFC 9309-compliant robots.txt parser + 2026 AI Preferences parser
 * (Cloudflare Content-Signal, IETF Content-Usage, X-Robots-Tag, and <meta name="robots">).
 *
 * Splits AI bots into two strategic tiers:
 *  - liveAgents: Real-time search & user-triggered shopping/browsing agents (blocking hurts traffic & commerce)
 *  - trainingBots: Offline model training crawlers (blocking is often intentional IP protection)
 */

export const LIVE_AI_AGENTS = [
  'OAI-SearchBot',
  'ChatGPT-User',
  'Claude-User',
  'Claude-SearchBot',
  'PerplexityBot',
  'Perplexity-User'
];

export const TRAINING_AI_BOTS = [
  'GPTBot',
  'ClaudeBot',
  'Google-Extended',
  'Meta-ExternalAgent',
  'Applebot-Extended',
  'Bytespider'
];

export const ALL_AI_BOTS = [...LIVE_AI_AGENTS, ...TRAINING_AI_BOTS];

/**
 * Convert an RFC 9309 robots.txt path pattern (* and $) into a RegExp.
 */
function patternToRegex(pattern) {
  let endAnchor = false;
  let p = pattern;
  if (p.endsWith('$')) {
    endAnchor = true;
    p = p.slice(0, -1);
  }
  const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}${endAnchor ? '$' : ''}`);
}

/**
 * Parse Content-Signal or Content-Usage key=value directives (comma-separated).
 * Example: "search=yes, ai-train=no, ai-input=yes" or "train-ai=n, search=y"
 */
export function parseAiPreferenceHeader(rawValue) {
  const result = {};
  if (!rawValue || typeof rawValue !== 'string') return result;
  const parts = rawValue.split(',');
  for (const part of parts) {
    const m = part.trim().match(/^([a-z0-9_-]+)\s*=\s*([a-z0-9_-]+)/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const rawVal = m[2].toLowerCase();
    if (rawVal === 'yes' || rawVal === 'y' || rawVal === 'true' || rawVal === '1') {
      result[key] = 'yes';
    } else if (rawVal === 'no' || rawVal === 'n' || rawVal === 'false' || rawVal === '0') {
      result[key] = 'no';
    } else {
      result[key] = rawVal;
    }
  }
  return result;
}

/**
 * Parse robots.txt into structured RFC 9309 groups.
 */
export function parseRobotsTxt(robotsText) {
  const groups = [];
  if (!robotsText || typeof robotsText !== 'string') return groups;

  let current = null;
  let seenRuleInGroup = false;

  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const field = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (field === 'user-agent') {
      if (!current || seenRuleInGroup) {
        current = { agents: [], rules: [], contentSignals: {}, contentUsage: {} };
        groups.push(current);
        seenRuleInGroup = false;
      }
      if (value) current.agents.push(value.toLowerCase());
    } else if (current) {
      if (field === 'allow' || field === 'disallow') {
        seenRuleInGroup = true;
        if (value !== '') {
          current.rules.push({ type: field, path: value, regex: patternToRegex(value) });
        }
      } else if (field === 'content-signal') {
        seenRuleInGroup = true;
        Object.assign(current.contentSignals, parseAiPreferenceHeader(value));
      } else if (field === 'content-usage') {
        seenRuleInGroup = true;
        Object.assign(current.contentUsage, parseAiPreferenceHeader(value));
      }
    }
  }

  return groups;
}

/**
 * Evaluate whether a specific bot is allowed to access `targetPath` per RFC 9309
 * (specific User-agent group overrides wildcard `*`; within a group, longest matching
 * path wins, with `allow` winning ties).
 */
export function evaluateBotAccess(groups, botName, targetPath = '/') {
  const lowerBot = botName.toLowerCase();
  const pathToCheck = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;

  let specificGroups = groups.filter((g) => g.agents.includes(lowerBot));
  const wildcardGroups = groups.filter((g) => g.agents.includes('*'));
  const activeGroups = specificGroups.length > 0 ? specificGroups : wildcardGroups;

  const mergedSignals = {};
  const mergedUsage = {};
  for (const g of wildcardGroups) {
    Object.assign(mergedSignals, g.contentSignals);
    Object.assign(mergedUsage, g.contentUsage);
  }
  for (const g of specificGroups) {
    Object.assign(mergedSignals, g.contentSignals);
    Object.assign(mergedUsage, g.contentUsage);
  }

  let bestMatch = null;
  for (const g of activeGroups) {
    for (const rule of g.rules) {
      if (rule.regex.test(pathToCheck)) {
        const specificity = rule.path.length;
        if (
          !bestMatch ||
          specificity > bestMatch.specificity ||
          (specificity === bestMatch.specificity && rule.type === 'allow' && bestMatch.type === 'disallow')
        ) {
          bestMatch = { type: rule.type, path: rule.path, specificity };
        }
      }
    }
  }

  return {
    bot: botName,
    allowed: bestMatch ? bestMatch.type === 'allow' : true,
    matchedRule: bestMatch ? `${bestMatch.type}: ${bestMatch.path}` : null,
    contentSignals: mergedSignals,
    contentUsage: mergedUsage
  };
}

/**
 * Analyze full AI crawler policy across robots.txt, HTTP headers, and HTML meta tags.
 */
export function analyzeAiCrawlerPolicy({
  robotsText = '',
  targetPath = '/',
  xRobotsTag = '',
  contentSignalHeader = '',
  contentUsageHeader = '',
  rawHtml = ''
}) {
  const groups = parseRobotsTxt(robotsText);

  const blockedLiveAgents = [];
  const blockedTrainingBots = [];
  const botDecisions = {};

  for (const bot of LIVE_AI_AGENTS) {
    const res = evaluateBotAccess(groups, bot, targetPath);
    botDecisions[bot] = res;
    if (!res.allowed) blockedLiveAgents.push({ bot, rule: res.matchedRule });
  }
  for (const bot of TRAINING_AI_BOTS) {
    const res = evaluateBotAccess(groups, bot, targetPath);
    botDecisions[bot] = res;
    if (!res.allowed) blockedTrainingBots.push({ bot, rule: res.matchedRule });
  }

  // Merge Content-Signal & Content-Usage from wildcard robots.txt + HTTP headers
  const wildcardEval = evaluateBotAccess(groups, '*', targetPath);
  const contentSignals = {
    ...wildcardEval.contentSignals,
    ...parseAiPreferenceHeader(contentSignalHeader)
  };
  const contentUsage = {
    ...wildcardEval.contentUsage,
    ...parseAiPreferenceHeader(contentUsageHeader)
  };

  // Check X-Robots-Tag and <meta name="robots"> for noai / noimageai / noindex / none
  const xRobotsLower = String(xRobotsTag || '').toLowerCase();
  const metaRobotsMatches = [...String(rawHtml || '').matchAll(/<meta[^>]+name=["'](?:robots|googlebot|bingbot)["'][^>]*content=["']([^"']+)["'][^>]*>/gi)];
  const metaRobotsCombined = metaRobotsMatches.map((m) => m[1].toLowerCase()).join(', ');
  const combinedRobotsDirectives = `${xRobotsLower} ${metaRobotsCombined}`;

  const hasNoAiDirective = /\b(?:noai|noimageai)\b/i.test(combinedRobotsDirectives);
  const hasNoIndexDirective = /\b(?:noindex|none)\b/i.test(combinedRobotsDirectives);
  const aiInputBlockedBySignal =
    contentSignals['ai-input'] === 'no' || contentUsage['ai-input'] === 'no';
  const aiTrainBlockedBySignal =
    contentSignals['ai-train'] === 'no' || contentUsage['train-ai'] === 'no';

  return {
    blockedLiveAgents,
    blockedTrainingBots,
    contentSignals,
    contentUsage,
    hasContentSignal: Object.keys(contentSignals).length > 0 || Object.keys(contentUsage).length > 0,
    aiInputBlockedBySignal,
    aiTrainBlockedBySignal,
    xRobotsTag: xRobotsTag || null,
    hasNoAiDirective,
    hasNoIndexDirective,
    botDecisions
  };
}
