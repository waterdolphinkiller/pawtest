#!/usr/bin/env node
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFixtureServer } from '../test/fixture-server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function frameMessage(obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8'), body]);
}

class McpClient {
  constructor(proc) {
    this.proc = proc;
    this.buf = Buffer.alloc(0);
    this.pending = new Map();
    proc.stdout.on('data', (chunk) => {
      this.buf = Buffer.concat([this.buf, chunk]);
      this.drain();
    });
  }

  drain() {
    while (true) {
      const headerEnd = this.buf.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const header = this.buf.slice(0, headerEnd).toString('utf8');
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) return;
      const len = Number(match[1]);
      const start = headerEnd + 4;
      if (this.buf.length < start + len) return;
      const payload = this.buf.slice(start, start + len).toString('utf8');
      this.buf = this.buf.slice(start + len);
      const msg = JSON.parse(payload);
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        resolve(msg);
      }
    }
  }

  request(id, method, params = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, 30000);
      this.pending.set(id, {
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        }
      });
      this.proc.stdin.write(frameMessage({ jsonrpc: '2.0', id, method, params }));
    });
  }
}

async function main() {
  const fixture = await startFixtureServer();
  const proc = spawn(process.execPath, [path.join(ROOT, 'src/mcp/server.js')], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const client = new McpClient(proc);

  try {
    console.log('[1/5] MCP initialize...');
    const init = await client.request(1, 'initialize', {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'ide-simulator', version: '1.0.0' },
      capabilities: {}
    });
    assert.equal(init.result.serverInfo.name, 'pawtest');

    console.log('[2/5] MCP tools/list (verify 3 lean tools)...');
    const list = await client.request(2, 'tools/list');
    const names = list.result.tools.map((t) => t.name);
    assert.deepEqual(names, ['pawtest_audit', 'pawtest_cat', 'pawtest_fix_prompt']);

    console.log('[3/5] MCP pawtest_audit on buggy target...');
    const audit = await client.request(3, 'tools/call', {
      name: 'pawtest_audit',
      arguments: { url: `${fixture.baseUrl}/buggy`, full: false }
    });
    const auditText = audit.result.content[0].text;
    assert.ok(!audit.result.isError, `pawtest_audit error: ${auditText}`);
    const auditData = JSON.parse(auditText);
    const hMatch = String(auditData.scores?.human || '').match(/(\d+)\/100/);
    const aMatch = String(auditData.scores?.agent || '').match(/(\d+)\/100/);
    assert.ok(hMatch && Number(hMatch[1]) < 90, `Expected buggy Human score < 90: ${auditData.scores?.human}`);
    assert.ok(aMatch && Number(aMatch[1]) < 90, `Expected buggy Agent score < 90: ${auditData.scores?.agent}`);
    console.log(`      Buggy audit OK -> ${auditText.slice(0, 140).replace(/\n/g, ' ')}...`);

    console.log('[4/5] MCP pawtest_fix_prompt...');
    const fix = await client.request(4, 'tools/call', {
      name: 'pawtest_fix_prompt',
      arguments: {}
    });
    const fixText = fix.result.content[0].text;
    assert.ok(!fix.result.isError && fixText.includes('PawTest') && fixText.length > 100, 'Expected non-empty fix-prompt.md');

    console.log('[5/5] MCP pawtest_cat post-fix re-test on clean target...');
    const retest = await client.request(5, 'tools/call', {
      name: 'pawtest_cat',
      arguments: { url: `${fixture.baseUrl}/clean`, cat: 'vault,antidote,musebot' }
    });
    const retestText = retest.result.content[0].text;
    assert.ok(!retest.result.isError, `pawtest_cat error: ${retestText}`);
    const retestData = JSON.parse(retestText);
    const defects = retestData.topDefects || retestData.defects || [];
    assert.equal(defects.length, 0, `Expected zero defects on /clean re-test, got: ${JSON.stringify(defects)}`);
    assert.ok(String(retestData.scores?.human || '').includes('100/100') && String(retestData.scores?.agent || '').includes('100/100'), `Expected 100/100 on clean re-test, got: ${JSON.stringify(retestData.scores)}`);
    console.log('      Post-fix re-test -> vault, antidote, musebot ALL GREEN!');
    console.log('\nPASS: Full IDE MCP closed-loop verified.');
  } finally {
    proc.kill();
    await fixture.close();
  }
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
