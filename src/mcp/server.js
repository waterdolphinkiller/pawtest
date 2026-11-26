#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runAudit } from '../engine/runner.js';
import { generateFixPrompt } from '../engine/reporter.js';
import { ALL_CATS } from '../cats/index.js';
import { applyFixScaffolds } from '../engine/scaffolder.js';

/**
 * PawTest Zero-Dependency MCP Server (JSON-RPC 2.0 over stdio).
 * Supports BOTH LSP-style `Content-Length: N\r\n\r\n{...}` byte framing AND newline-delimited JSON.
 *
 * Exposes strictly 3 compact, token-efficient tools:
 *   1. pawtest_audit      — Run fast (8 cats) or full (16 cats) dual-axis audit
 *   2. pawtest_cat        — Re-run 1+ specific cats after applying fixes
 *   3. pawtest_fix_prompt — Return structured self-healing fix-prompt.md for the last or target audit
 */

const SERVER_INFO = {
  name: 'pawtest',
  version: '3.1.1'
};

const TOOLS = [
  {
    name: 'pawtest_audit',
    description:
      'Audit a URL with PawTest optical QA cats and return compact Human UX + AI Agent Readiness scores, AI Token-Tax, and prioritized defects.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target http:// or https:// URL to audit.' },
        full: { type: 'boolean', description: 'Run all 16 cats instead of default 8 fast cats.', default: false },
        allowMutations: { type: 'boolean', description: 'Allow destructive clicks (default false = safe read-only).', default: false },
        preset: { type: 'string', enum: ['ecommerce', 'saas', 'docs', 'blog'], description: 'Optional site preset to suppress out-of-scope findings (default ecommerce).' },
        headers: { type: 'object', description: 'Optional extra HTTP headers for authenticated staging audits (auto-redacted in reports).' },
        applyScaffoldsDir: { type: 'string', description: 'Optional local directory to auto-write missing llms.txt, robots.txt, /.well-known/ucp, agent-card.json & WebMCP files.' }
      },
      required: ['url']
    }
  },
  {
    name: 'pawtest_cat',
    description:
      'Run one or more specific PawTest cats (e.g. "vault", "musebot", "antidote", "lucky") to verify a targeted fix.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target http:// or https:// URL.' },
        cat: {
          type: 'string',
          description: `Cat ID or comma-separated IDs. Valid: ${ALL_CATS.map((c) => c.meta.id).join(', ')}`
        }
      },
      required: ['url', 'cat']
    }
  },
  {
    name: 'pawtest_fix_prompt',
    description:
      'Return a concise, prioritized Markdown fix-prompt.md with exact remediation steps, starter snippets, and re-verification commands.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Optional target URL to audit fresh; omit to reuse the most recent audit.' },
        full: { type: 'boolean', description: 'Use --full (16 cats) if running a fresh audit.', default: false }
      }
    }
  }
];

let lastReport = null;

function compactSummary(report) {
  return {
    targetUrl: report.targetUrl,
    mainHttpStatus: report.mainHttpStatus,
    mode: report.mode,
    durationMs: report.durationMs,
    scores: {
      human: `${report.scores.human.grade} (${report.scores.human.score}/100)`,
      agent: `${report.scores.agent.grade} (${report.scores.agent.score}/100)`
    },
    tokenTax: report.tokenTax,
    sandbox: report.sandbox,
    failedCats: report.cats
      .filter((c) => c.findings.length > 0)
      .map((c) => ({
        cat: `${c.code} ${c.name} (${c.catId})`,
        status: c.status,
        score: c.score,
        findings: c.findings.map((f) => ({
          severity: f.severity,
          axis: f.axis,
          title: f.title,
          fixHint: f.fixHint
        }))
      })),
    passedCats: report.cats.filter((c) => c.findings.length === 0).map((c) => c.catId)
  };
}

export async function handleRpcRequest(req) {
  const { id, method, params = {} } = req;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO
      }
    };
  }

  if (method === 'notifications/initialized') {
    return null;
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: { tools: TOOLS }
    };
  }

  if (method === 'tools/call') {
    const toolName = params.name;
    const args = params.arguments || {};

    try {
      if (toolName === 'pawtest_audit') {
        if (!args.url) throw new Error('Missing required parameter "url". Example: { "url": "http://localhost:3000" }');
        const report = await runAudit({
          url: args.url,
          full: Boolean(args.full),
          allowMutations: Boolean(args.allowMutations),
          preset: args.preset || null,
          extraHeaders: args.headers && typeof args.headers === 'object' ? args.headers : null
        });
        lastReport = report;
        const summary = compactSummary(report);
        if (args.applyScaffoldsDir) {
          summary.scaffoldedFiles = applyFixScaffolds(report, args.applyScaffoldsDir);
        }
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }]
          }
        };
      }

      if (toolName === 'pawtest_cat') {
        if (!args.url || !args.cat) {
          throw new Error('Missing required parameters "url" and "cat". Example: { "url": "http://localhost:3000", "cat": "vault" }');
        }
        const cats = String(args.cat).split(',').map((s) => s.trim()).filter(Boolean);
        const report = await runAudit({ url: args.url, cats });
        lastReport = report;
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(compactSummary(report), null, 2) }]
          }
        };
      }

      if (toolName === 'pawtest_fix_prompt') {
        let report = lastReport;
        if (args.url || !report) {
          if (!args.url) {
            throw new Error('No previous audit in session. Pass "url" to pawtest_fix_prompt or call pawtest_audit first.');
          }
          report = await runAudit({ url: args.url, full: Boolean(args.full) });
          lastReport = report;
        }
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: generateFixPrompt(report) }]
          }
        };
      }

      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Unknown tool "${toolName}". Available tools: pawtest_audit, pawtest_cat, pawtest_fix_prompt.` }
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          isError: true,
          content: [{ type: 'text', text: `PawTest Error: ${err.message}` }]
        }
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` }
  };
}

export function startMcpServer() {
  let rawBuf = Buffer.alloc(0);

  const sendMessage = (obj, useContentLength) => {
    if (!obj) return;
    const json = JSON.stringify(obj);
    if (useContentLength) {
      const byteLen = Buffer.byteLength(json, 'utf8');
      process.stdout.write(`Content-Length: ${byteLen}\r\n\r\n${json}`);
    } else {
      process.stdout.write(json + '\n');
    }
  };

  const processBuffer = async () => {
    while (rawBuf.length > 0) {
      // Skip leading whitespace/newlines
      while (rawBuf.length > 0 && (rawBuf[0] === 0x0d || rawBuf[0] === 0x0a || rawBuf[0] === 0x20 || rawBuf[0] === 0x09)) {
        rawBuf = rawBuf.slice(1);
      }
      if (rawBuf.length === 0) break;

      // Mode A: LSP Content-Length framing
      if (rawBuf.slice(0, 15).toString('ascii').toLowerCase().startsWith('content-length:')) {
        const sepIdx = rawBuf.indexOf('\r\n\r\n');
        if (sepIdx === -1) break;
        const headerStr = rawBuf.slice(0, sepIdx).toString('ascii');
        const m = headerStr.match(/content-length:\s*(\d+)/i);
        if (!m) {
          rawBuf = rawBuf.slice(sepIdx + 4);
          continue;
        }
        const contentLen = Number(m[1]);
        const bodyStart = sepIdx + 4;
        if (rawBuf.length < bodyStart + contentLen) break; // wait for full payload bytes
        const payload = rawBuf.slice(bodyStart, bodyStart + contentLen).toString('utf8');
        rawBuf = rawBuf.slice(bodyStart + contentLen);
        try {
          const req = JSON.parse(payload);
          const res = await handleRpcRequest(req);
          sendMessage(res, true);
        } catch (err) {
          sendMessage({ jsonrpc: '2.0', id: null, error: { code: -32700, message: `Parse error: ${err.message}` } }, true);
        }
        continue;
      }

      // Mode B: Newline-delimited JSON-RPC
      const nlIdx = rawBuf.indexOf(0x0a);
      if (nlIdx === -1) break;
      const line = rawBuf.slice(0, nlIdx).toString('utf8').trim();
      rawBuf = rawBuf.slice(nlIdx + 1);
      if (!line) continue;
      try {
        const req = JSON.parse(line);
        const res = await handleRpcRequest(req);
        sendMessage(res, false);
      } catch (err) {
        sendMessage({ jsonrpc: '2.0', id: null, error: { code: -32700, message: `Parse error: ${err.message}` } }, false);
      }
    }
  };

  process.stdin.on('data', (chunk) => {
    rawBuf = Buffer.concat([rawBuf, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8')]);
    processBuffer();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startMcpServer();
}
