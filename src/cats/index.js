import * as marmalade from './marmalade.js';
import * as zoomies from './zoomies.js';
import * as mochi from './mochi.js';
import * as pixel from './pixel.js';
import * as naps from './naps.js';
import * as shadow from './shadow.js';
import * as scout from './scout.js';
import * as chaos from './chaos.js';
import * as vault from './vault.js';
import * as robocat from './robocat.js';
import * as leak from './leak.js';
import * as clever from './clever.js';
import * as musebot from './musebot.js';
import * as antidote from './antidote.js';
import * as sentinel from './sentinel.js';
import * as lucky from './lucky.js';

/**
 * Complete 4x4 (16-Cat) PawTest Matrix:
 *   Squad A (Interactive UX):  A1 Marmalade, A2 Zoomies, A3 Mochi, A4 Pixel
 *   Squad B (Perf/A11y/SEO):   B1 Naps, B2 Shadow, B3 Scout, B4 Chaos
 *   Squad C (Security/GEO/AI): C1 Vault, C2 RoboCat, C3 Leak, C4 Clever
 *   Squad D (Autonomous Agent):D1 MuseBot, D2 Antidote, D3 Sentinel, D4 Lucky
 */
export const ALL_CATS = [
  marmalade,
  zoomies,
  mochi,
  pixel,
  naps,
  shadow,
  scout,
  chaos,
  vault,
  robocat,
  leak,
  clever,
  musebot,
  antidote,
  sentinel,
  lucky
];

export function getCatsForMode({ full = false, cats = null } = {}) {
  if (Array.isArray(cats) && cats.length > 0) {
    const wanted = new Set(cats.map((c) => c.toLowerCase().trim()));
    const matched = ALL_CATS.filter(
      (c) => wanted.has(c.meta.id.toLowerCase()) || wanted.has(c.meta.code.toLowerCase())
    );
    if (matched.length === 0) {
      const validIds = ALL_CATS.map((c) => c.meta.id).join(', ');
      throw new Error(`Unknown cat(s): ${cats.join(', ')}. Available cats: ${validIds}`);
    }
    return matched;
  }
  return full ? ALL_CATS : ALL_CATS.filter((c) => c.meta.mode === 'fast');
}

export function getCatById(id) {
  const key = String(id || '').toLowerCase().trim();
  return ALL_CATS.find((c) => c.meta.id === key || c.meta.code.toLowerCase() === key) || null;
}
