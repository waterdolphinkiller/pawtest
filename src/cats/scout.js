/**
 * B3 · Scout (Silver Tabby) — Traditional SEO: title/meta, unique H1, canonical & OpenGraph.
 * Squad B | Human UX | --full Mode
 */

export const meta = {
  id: 'scout',
  code: 'B3',
  name: 'Scout',
  title: '美短猎手 · 传统 SEO',
  squad: 'B',
  axis: 'human',
  mode: 'full',
  color: '#94a3b8',
  accentColor: '#e2e8f0',
  prop: 'Binoculars + OG Card Frame',
  description: 'Audits <title>, meta description, single H1 hierarchy, rel="canonical" & og:image social preview tags.'
};

export async function run(ctx) {
  const { page } = ctx;
  const findings = [];
  const quips = [];

  const seo = await page.evaluate(`(() => {
    const title = (document.title || '').trim();
    const metaDesc = (document.querySelector('meta[name="description"]')?.getAttribute('content') || '').trim();
    const h1Count = document.querySelectorAll('h1').length;
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
    const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '';
    return { title, metaDesc, h1Count, hasCanonical: !!canonical, hasOgImage: !!ogImage, hasViewport: !!viewport };
  })()`);

  if (!seo.title || seo.title.length < 10) {
    findings.push({
      id: 'scout-weak-title',
      severity: 'medium',
      axis: 'human',
      title: `Weak or missing <title> tag ("${seo.title}")`,
      detail: 'Search engines rely on a descriptive 20–60 character <title> for ranking and CTR.',
      fixHint: 'Provide a clear, unique <title> tag describing the page value.'
    });
  }

  if (!seo.metaDesc) {
    findings.push({
      id: 'scout-missing-description',
      severity: 'medium',
      axis: 'human',
      title: 'Missing <meta name="description"> tag',
      detail: 'Without meta description, search snippets fall back to random page text.',
      fixHint: 'Add <meta name="description" content="..."> summarizing the page in 120–160 characters.'
    });
    quips.push('Peered through binoculars — no meta description or social preview in sight!');
  }

  if (seo.h1Count !== 1) {
    findings.push({
      id: 'scout-h1-count',
      severity: 'medium',
      axis: 'human',
      title: `Expected exactly 1 <h1> heading, found ${seo.h1Count}`,
      detail: 'Multiple or missing <h1> tags weaken semantic document hierarchy.',
      fixHint: 'Keep a single primary <h1> per page and use <h2>–<h6> for subsections.'
    });
    if (!quips.length) quips.push(`Spotted ${seo.h1Count} <h1> headings — only one alpha heading allowed!`);
  }

  if (!seo.hasCanonical || !seo.hasOgImage) {
    findings.push({
      id: 'scout-canonical-og',
      severity: 'low',
      axis: 'human',
      title: `Missing ${[!seo.hasCanonical && 'canonical link', !seo.hasOgImage && 'og:image'].filter(Boolean).join(' & ')}`,
      detail: 'Canonical URLs prevent duplicate indexing; og:image powers rich link previews on X/Slack/Discord.',
      fixHint: 'Add <link rel="canonical" href="..."> and <meta property="og:image" content="...">.'
    });
  }

  if (quips.length === 0) {
    quips.push('Binoculars locked on — crisp title, unique H1, canonical & OG card all present.');
  }

  return { findings, quips, metrics: seo };
}
