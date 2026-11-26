# PawTest — 16 Pure-Code Optical Cat QA Agents

Audit any web app for **Human UX (0–100)** and **AI Agent Readiness (0–100)** in one zero-config command with $0 LLM API cost.

```bash
npx pawtest https://your-site.com --full --share-card --gif
```

## Highlights
- **16 Deterministic Probes**: Interactive UX, Core Web Vitals, WCAG 2.2, SEO, Secret Leak & CSP, Markdown Token-Tax, W3C WebMCP (`document.modelContext`), Indirect Prompt Injection, Destructive Action Gates, UCP/ACP, and RFC 9421 Web Bot Auth.
- **3-Tool Lean MCP Server**: Plugs straight into Claude Code and Cursor (`pawtest_audit`, `pawtest_cat`, `pawtest_fix_prompt`).
- **Zero-Upload Local Artifacts**: Generates a 1200×630 PNG scorecard, 5-second failure replay GIF, and `fix-prompt.md` locally.
