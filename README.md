# PawTest v3.1

**16 Pure-Code Faceted Crystal Origami Cat QA Agents auditing both Human UX (0–100) and 2026 Autonomous AI Agent Readiness (0–100) at $0 LLM API cost.**

Zero runtime npm dependencies (96.8 KB tarball) — requires only Node.js 18+ and a local Chromium-based browser (Chrome, Chromium, Edge, or Brave; even `--gif` includes a pure-JS GIF89a encoder with zero `ffmpeg` required).
<img width="800" height="450" alt="PawTest v3.1 Demo" src="https://raw.githubusercontent.com/waterdolphinkiller/pawtest/main/pawtest-v31-hero.gif" />
## Quick Start

```bash
# 1. Fast Mode (8 core Human + AI Agent cats in ~2-3s)
npx pawtest localhost:3000

# 2. All-in-One Viral Launch Bundle (16 cats + 1200x630 PNG + 5s GIF + README SVG Badges)
npx pawtest https://your-site.com --viral

# 3. Head-to-Head Competitor PK Mode (side-by-side scores + 1200x630 PK card)
npx pawtest diff https://your-site.com https://competitor.com --share-card

# 4. Live Route-A Faceted Crystal Origami 3D Stage (16 pure-code WebGL2 cats)
npx pawtest https://your-site.com --full --stage

# 5. Enterprise CI + GitHub Security (SARIF 2.1.0) + Site Presets
npx pawtest https://your-site.com --full --preset saas --sarif

# 6. Local Dev Hot-Reload (re-runs only failing/warning cats on file change)
npx pawtest http://localhost:3000 --watch ./src

# 7. Auto-Scaffold Ready-to-Commit Fixes (llms.txt, robots.txt, /.well-known/ucp, agent-card.json, form-aware WebMCP)
npx pawtest https://your-site.com --full --apply-scaffolds ./public
```
https://github.com/user-attachments/assets/6c8a2bf0-de7a-4bd6-a740-a8e70f22d787

## What PawTest v3.1 Audits (4×4 Optical Cat Matrix)
- **Squad A · Human UX**: `A1 Marmalade` (form fuzzing/XSS), `A2 Zoomies` (3G & click idempotency), `A3 Mochi` (375px–4K responsive & CTA occlusion), `A4 Pixel` (404s, broken images, console errors)
- **Squad B · Perf / WCAG / SEO**: `B1 Naps` (Core Web Vitals LCP/CLS/INP), `B2 Shadow` (WCAG 2.2 contrast & focus traps), `B3 Scout` (SEO/canonical/OG), `B4 Chaos` (offline & cookie-clear recovery)
- **Squad C · Security & GEO**: `C1 Vault` (client secret leaks, SourceMaps, CSP/HSTS/CORS), `C2 RoboCat` (RFC 9309 tiered AI crawlers, `Content-Signal`/`Content-Usage`, `X-Robots-Tag noai`, `llms.txt` v2, Markdown Token-Tax), `C3 Leak` (JS Heap & `<44px` targets), `C4 Clever` (core flows & AI chat SSE)
- **Squad D · Autonomous AI Agents**: `D1 MuseBot` (Shadow DOM penetration, AXTree CTA reachability, obfuscated & strikethrough price split, DOM vs JSON-LD price parity, W3C `document.modelContext` WebMCP dry-run), `D2 Antidote` (indirect prompt injection in DOM, comments, Shadow DOM, Unicode Tags `U+E0000`, JSON-LD & `Accept: text/markdown`), `D3 Sentinel` (destructive confirmation gates & dynamic 429/RateLimit), `D4 Lucky` (7-endpoint `/.well-known/` UCP/ACP/AP2/A2A/MCP/OAuth/RFC9421 matrix, 7-provider WAF fingerprinting & `HTTP 402 / x402 / Pay-Per-Crawl` compliance)

## Standout v3.1 Capabilities
- **Shared Read-Only Page Pool**: 9 read-only cats share a single rendered tab + cached AXTree (cutting `--full` page loads by >50% to ~5.7s).
- **Compound Risk Chains & Agent Funnel Survival Rate**: Correlates cross-cat gaps into prioritized remediation chains and estimates 4-stage AI shopping/browsing funnel survival %.
- **3-Tool Lean MCP Server (`npx pawtest --mcp`)**: Plugs directly into Claude Code & Cursor (`pawtest_audit`, `pawtest_cat`, `pawtest_fix_prompt`) with `preset`, `headers`, and `applyScaffoldsDir` support.
- **Authenticated & Multi-Step Audits**: Repeatable `--header "Authorization: Bearer ..."` (auto-redacted in all reports), `--storage-state`, `--save-storage`, and `--flow <flow.json>` with terminal DOM/AXTree verification.

## MCP Setup (Claude Code / Cursor)

```json
{
  "mcpServers": {
    "pawtest": {
      "command": "npx",
      "args": ["-y", "pawtest", "--mcp"]
    }
  }
}
```

## Contributing & License
Run `npx pawtest --init-cat <name>` to scaffold Cat #17 (see `CONTRIBUTING_A_CAT.md`). MIT Licensed.


## 2026 Real-World Benchmark (Top 20 Sites)


| Rank | Website | Human UX | AI Agent | Token-Tax | WAF / Anti-Bot |
| :---: | :--- | :---: | :---: | :---: | :--- |
| #1 | https://vercel.com | **S** (96) | **A** (93) | 39.37x (MD ON) | None |
| #2 | https://supabase.com | **S** (97) | **A** (92) | 259.81x (MD ON) | None |
| #3 | https://nodejs.org | **S** (96) | **A** (91) | 141.26x (MD OFF) | None |
| #4 | https://developer.mozilla.org | **S** (96) | **A** (91) | 16.24x (MD OFF) | None |
| #5 | https://anthropic.com | **A** (94) | **A** (91) | 86.26x (MD OFF) | None |
| #6 | https://playwright.dev | **S** (95) | **A** (90) | 6x (MD OFF) | None |
| #7 | https://cloudflare.com | **A** (89) | **A** (94) | 446.55x (MD ON) | None |
| #8 | https://linear.app | **A** (93) | **A** (90) | 182.27x (MD ON) | None |
| #9 | https://stripe.com | **S** (95) | **A** (87) | 56.78x (MD OFF) | None |
| #10 | https://shopify.com | **S** (95) | **A** (87) | 97.89x (MD OFF) | None |
| #11 | https://openai.com | **A** (93) | **A** (87) | 146.13x (MD OFF) | Cloudflare |
| #12 | https://github.com/explore | **A** (92) | **A** (86) | 47.12x (MD OFF) | None |
| #13 | https://figma.com | **A** (91) | **A** (85) | 458.73x (MD OFF) | None |
| #14 | https://amazon.com | **A** (93) | **B** (82) | 23.65x (MD OFF) | None |
| #15 | https://target.com | **A** (88) | **A** (86) | 128.21x (MD OFF) | PerimeterX / HUMAN |
| #16 | https://walmart.com | **A** (91) | **B** (81) | 131.7x (MD OFF) | PerimeterX / HUMAN |
| #17 | https://airbnb.com | **A** (86) | **B** (84) | 1113.62x (MD OFF) | None |
| #18 | https://notion.so | **D** (55) | **D** (55) | — | None |
| #19 | https://ebay.com | **D** (55) | **D** (55) | — | Akamai Bot Manager |
| #20 | https://etsy.com | **D** (55) | **D** (55) | — | DataDome |
