import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTargetUrl, isMutationBlocked, redactText, sanitizeReport } from '../src/engine/sandbox.js';
import { scoreToGrade, computeCatScore, computeDualScores, pickTopRoasts, computeBaselineDiff } from '../src/engine/scoring.js';
import { parseArgs } from '../src/cli.js';
import { generateFixPrompt, generateMarkdownReport } from '../src/engine/reporter.js';
import { ALL_CATS, getCatsForMode } from '../src/cats/index.js';

test('Sandbox blocks unsafe protocols and SSRF metadata/private IPs', async () => {
  const fileRes = await validateTargetUrl('file:///etc/passwd', { skipDns: true });
  assert.equal(fileRes.ok, false);

  const metaRes = await validateTargetUrl('http://169.254.169.254/latest/meta-data/', { skipDns: true });
  assert.equal(metaRes.ok, false);

  const privRes = await validateTargetUrl('http://10.0.0.5:8080', { skipDns: true });
  assert.equal(privRes.ok, false);

  const allowedPriv = await validateTargetUrl('http://192.168.1.10', { allowPrivateIp: true, skipDns: true });
  assert.equal(allowedPriv.ok, true);

  const localOk = await validateTargetUrl('http://127.0.0.1:3000', { skipDns: true });
  assert.equal(localOk.ok, true);

  const localBlocked = await validateTargetUrl('http://localhost:3000', { blockLocalhost: true, skipDns: true });
  assert.equal(localBlocked.ok, false);
});

test('Sandbox read-only mode blocks destructive actions unless overridden', () => {
  assert.equal(isMutationBlocked({ method: 'DELETE' }, false), true);
  assert.equal(isMutationBlocked({ text: 'Confirm Payment & Checkout' }, false), true);
  assert.equal(isMutationBlocked({ text: '删除账号' }, false), true);
  assert.equal(isMutationBlocked({ text: 'Search catalog', method: 'GET' }, false), false);
  assert.equal(isMutationBlocked({ text: 'Delete item', method: 'DELETE' }, true), false);
});

test('Secret redactor scrubs API keys, JWTs, and cookies', () => {
  const raw = 'Found sk-proj-abcdefghijklmnopqrstuvwxyz123456 and eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature1234567890 and Cookie: session_id=supersecretvalue999';
  const { text, count } = redactText(raw);
  assert.equal(count >= 3, true);
  assert.equal(text.includes('sk-proj-'), false);
  assert.equal(text.includes('eyJhbGci'), false);
  assert.equal(text.includes('supersecretvalue999'), false);

  const sanitized = sanitizeReport({ nested: [{ msg: 'Bearer abcdefghijklmnopqrstuvwxyz1234' }] });
  assert.equal(sanitized.redactions, 1);
  assert.equal(sanitized.data.nested[0].msg.includes('[REDACTED:BEARER]'), true);
});

test('Dual-axis scoring and baseline diff compute accurately', () => {
  assert.equal(scoreToGrade(98), 'S');
  assert.equal(scoreToGrade(88), 'A');
  assert.equal(scoreToGrade(78), 'B');
  assert.equal(scoreToGrade(65), 'C');
  assert.equal(scoreToGrade(50), 'D');
  assert.equal(scoreToGrade(20), 'F');

  assert.equal(computeCatScore([{ severity: 'critical' }, { severity: 'medium' }]), 61);

  const sampleCats = [
    {
      catId: 'marmalade', code: 'A1', name: 'Marmalade', squad: 'A', axis: 'human',
      status: 'pass', score: 100, durationMs: 200, quips: ['All clean'], findings: []
    },
    {
      catId: 'vault', code: 'C1', name: 'Vault', squad: 'C', axis: 'dual',
      status: 'fail', score: 52, durationMs: 220, quips: ['Sniffed OpenAI key'],
      findings: [
        { id: 'v1', severity: 'critical', axis: 'human', title: 'Leak', detail: 'd', fixHint: 'f' },
        { id: 'v2', severity: 'high', axis: 'agent', title: 'Agent leak', detail: 'd', fixHint: 'f' }
      ]
    },
    {
      catId: 'antidote', code: 'D2', name: 'Antidote', squad: 'D', axis: 'agent',
      status: 'fail', score: 70, durationMs: 180, quips: ['Caught prompt injection!'],
      findings: [{ id: 'a1', severity: 'critical', axis: 'agent', title: 'PI', detail: 'd', fixHint: 'f' }]
    }
  ];

  const scores = computeDualScores(sampleCats);
  assert.equal(scores.human.score, 85);
  assert.equal(scores.human.grade, 'A');
  assert.equal(scores.agent.score, 76);
  assert.equal(scores.agent.grade, 'B');

  const diff = computeBaselineDiff(
    { scores: { human: { score: 95 }, agent: { score: 92 } }, cats: [] },
    { scores: { human: { score: 80 }, agent: { score: 60 } }, cats: [{ catId: 'vault', findings: [{ id: 'v1' }] }] }
  );
  assert.equal(diff.humanDelta, 15);
  assert.equal(diff.agentDelta, 32);
  assert.deepEqual(diff.newlyFixed, ['vault:v1']);

  const roasts = pickTopRoasts(sampleCats);
  assert.equal(roasts.length, 2);
});

test('CLI arg parser and v1.5.0 report generators work cleanly', () => {
  const opts = parseArgs([
    'http://localhost:3000', '--full', '--cat', 'vault,lucky',
    '--share-card', '--gif', '--stage', '--baseline', 'prev.json', '--storage-state', 'auth.json', '--timeout', '12000'
  ]);
  assert.equal(opts.url, 'http://localhost:3000');
  assert.equal(opts.full, true);
  assert.deepEqual(opts.cats, ['vault', 'lucky']);
  assert.equal(opts.shareCard, true);
  assert.equal(opts.gif, true);
  assert.equal(opts.stage, true);
  assert.equal(opts.baselinePath, 'prev.json');
  assert.equal(opts.storageStatePath, 'auth.json');
  assert.equal(opts.timeoutMs, 12000);

  const fastCats = getCatsForMode({ full: false });
  assert.equal(fastCats.length, 8);
  assert.equal(ALL_CATS.length, 16);

  const mockReport = {
    tool: 'pawtest', version: '1.5.0', targetUrl: 'http://localhost:3000', timestamp: new Date().toISOString(),
    mode: 'fast', durationMs: 1200,
    sandbox: { readOnly: true, authenticated: false, mutationsBlocked: 1, redactionsApplied: 0 },
    scores: {
      human: { score: 92, grade: 'A', catsRun: 5, criticalCount: 0, highCount: 0 },
      agent: { score: 54, grade: 'D', catsRun: 4, criticalCount: 1, highCount: 1 }
    },
    tokenTax: { rawHtmlTokens: 1200, cleanTokens: 200, bloatRatio: 6, supportsMarkdown: false, tokenSavingsPct: 0 },
    diff: { humanDelta: 12, agentDelta: 20, newlyFixed: ['a'], newRegressions: [] },
    topRoasts: ['[Antidote] Caught prompt injection'],
    cats: [{
      catId: 'antidote', code: 'D2', name: 'Antidote', squad: 'D', axis: 'agent',
      status: 'fail', score: 70, durationMs: 120, quips: ['Caught prompt injection'],
      findings: [{ id: 'pi', severity: 'critical', axis: 'agent', title: 'Prompt Injection', detail: 'Hidden instruction', fixHint: 'Strip hidden text' }]
    }]
  };

  const fixMd = generateFixPrompt(mockReport);
  assert.equal(fixMd.includes('Self-Healing Fix Prompt'), true);
  assert.equal(fixMd.includes('AI Token-Tax'), true);
  assert.equal(fixMd.includes('--cat antidote'), true);

  const md = generateMarkdownReport(mockReport);
  assert.equal(md.includes('Human UX'), true);
  assert.equal(md.includes('AI Token-Tax'), true);
  assert.equal(md.includes('(+12)'), true);
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeReadmeBadges } from '../src/ui/badge.js';
import { scaffoldNewCat } from '../src/cats/scaffold.js';

test('v2.0.0 --viral flag, README SVG badges & --init-cat scaffolder work cleanly', () => {
  const viralOpts = parseArgs(['localhost:3000', '--viral']);
  assert.equal(viralOpts.full, true);
  assert.equal(viralOpts.shareCard, true);
  assert.equal(viralOpts.gif, true);
  assert.equal(viralOpts.badge, true);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawtest-v2-unit-'));
  try {
    const badges = writeReadmeBadges({
      scores: { human: { grade: 'S', score: 100 }, agent: { grade: 'S', score: 100 } },
      tokenTax: { bloatRatio: 1.4, supportsMarkdown: true }
    }, tmp);
    const svg = fs.readFileSync(badges.scoreBadgePath, 'utf8');
    assert.equal(svg.includes('<svg') && svg.includes('Human S (100)'), true);
    assert.equal(fs.existsSync(badges.tokenTaxBadgePath), true);

    const created = scaffoldNewCat('stripe-guard', tmp);
    const pluginCode = fs.readFileSync(created.filePath, 'utf8');
    assert.equal(pluginCode.includes("id: 'stripe-guard'"), true);
    assert.equal(pluginCode.includes('export async function run(ctx)'), true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
