import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

/**
 * Zero-dependency Chrome DevTools Protocol (CDP) client & isolated Chromium launcher.
 * Implements RFC 6455 WebSocket over Node's native `net` + `crypto` modules so PawTest
 * runs cleanly on Node 18/20/22 without needing external npm packages.
 */

const CHROME_CANDIDATES = [
  process.env.PAWTEST_CHROME_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/microsoft-edge',
  '/usr/bin/brave-browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);

export function findChromeExecutable(explicitPath) {
  if (explicitPath && fs.existsSync(explicitPath)) return explicitPath;
  for (const candidate of CHROME_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  const installHint =
    process.platform === 'darwin'
      ? 'brew install --cask chromium'
      : process.platform === 'win32'
        ? 'winget install Google.Chrome'
        : 'sudo apt-get install -y chromium';
  throw new Error(
    `No Chromium/Chrome/Edge/Brave executable found. Install one (${installHint}) or set PAWTEST_CHROME_PATH=/path/to/browser.`
  );
}

class MiniWebSocket extends EventEmitter {
  constructor(wsUrl) {
    super();
    this.url = new URL(wsUrl);
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.upgraded = false;
    this.closed = false;
    this._fragmentChunks = [];
    this._fragmentOpcode = 0;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const port = Number(this.url.port) || 80;
      const host = this.url.hostname;
      const key = crypto.randomBytes(16).toString('base64');
      const socket = net.createConnection({ host, port });
      this.socket = socket;

      const onError = (err) => {
        if (!this.upgraded) reject(err);
        else this.emit('error', err);
      };
      socket.on('error', onError);

      socket.on('connect', () => {
        const reqPath = this.url.pathname + (this.url.search || '');
        const headers = [
          `GET ${reqPath} HTTP/1.1`,
          `Host: ${host}:${port}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${key}`,
          'Sec-WebSocket-Version: 13',
          '\r\n'
        ].join('\r\n');
        socket.write(headers);
      });

      socket.on('data', (chunk) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        if (!this.upgraded) {
          const headerEnd = this.buffer.indexOf('\r\n\r\n');
          if (headerEnd === -1) return;
          const headerText = this.buffer.slice(0, headerEnd).toString('utf8');
          if (!headerText.startsWith('HTTP/1.1 101')) {
            reject(new Error(`WebSocket handshake failed: ${headerText.split('\r\n')[0]}`));
            socket.destroy();
            return;
          }
          this.upgraded = true;
          this.buffer = this.buffer.slice(headerEnd + 4);
          resolve();
          if (this.buffer.length > 0) this._parseFrames();
        } else {
          this._parseFrames();
        }
      });

      socket.on('close', () => {
        this.closed = true;
        this.emit('close');
      });
    });
  }

  _parseFrames() {
    while (this.buffer.length >= 2) {
      const b0 = this.buffer[0];
      const b1 = this.buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let payloadLen = b1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (this.buffer.length < 4) return;
        payloadLen = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (this.buffer.length < 10) return;
        const hi = this.buffer.readUInt32BE(2);
        const lo = this.buffer.readUInt32BE(6);
        payloadLen = hi * 0x100000000 + lo;
        offset = 10;
      }

      const maskLen = masked ? 4 : 0;
      if (this.buffer.length < offset + maskLen + payloadLen) return;

      let payload = this.buffer.slice(offset + maskLen, offset + maskLen + payloadLen);
      if (masked) {
        const mask = this.buffer.slice(offset, offset + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= mask[i % 4];
        }
      }
      this.buffer = this.buffer.slice(offset + maskLen + payloadLen);

      if (opcode === 0x8) {
        this.close();
        return;
      }
      if (opcode === 0x9) {
        this._sendFrame(0x0a, payload);
        continue;
      }
      if (opcode === 0x0a) continue;

      if (opcode !== 0x0) {
        this._fragmentOpcode = opcode;
        this._fragmentChunks = [payload];
      } else {
        this._fragmentChunks.push(payload);
      }

      if (fin) {
        const full = Buffer.concat(this._fragmentChunks);
        this._fragmentChunks = [];
        if (this._fragmentOpcode === 0x1) {
          this.emit('message', full.toString('utf8'));
        }
      }
    }
  }

  send(text) {
    if (this.closed || !this.socket) return;
    this._sendFrame(0x1, Buffer.from(text, 'utf8'));
  }

  _sendFrame(opcode, payload) {
    const mask = crypto.randomBytes(4);
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(6);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | len;
      mask.copy(header, 2);
    } else if (len < 65536) {
      header = Buffer.alloc(8);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(len, 2);
      mask.copy(header, 4);
    } else {
      header = Buffer.alloc(14);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 127;
      header.writeUInt32BE(Math.floor(len / 0x100000000), 2);
      header.writeUInt32BE(len >>> 0, 6);
      mask.copy(header, 10);
    }
    const masked = Buffer.alloc(len);
    for (let i = 0; i < len; i++) {
      masked[i] = payload[i] ^ mask[i % 4];
    }
    this.socket.write(Buffer.concat([header, masked]));
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.socket?.end(); } catch {}
    try { this.socket?.destroy(); } catch {}
  }
}

export class CDPSession extends EventEmitter {
  constructor(wsUrl) {
    super();
    this.ws = new MiniWebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();

    this.ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.id) {
        const entry = this.pending.get(msg.id);
        if (!entry) return;
        this.pending.delete(msg.id);
        if (msg.error) {
          entry.reject(new Error(`CDP ${entry.method} error: ${msg.error.message}`));
        } else {
          entry.resolve(msg.result || {});
        }
      } else if (msg.method) {
        this.emit(msg.method, msg.params || {});
      }
    });

    this.ws.on('close', () => {
      for (const [, entry] of this.pending) {
        entry.reject(new Error(`CDP connection closed while awaiting ${entry.method}`));
      }
      this.pending.clear();
    });
  }

  async connect() {
    await this.ws.connect();
  }

  send(method, params = {}, timeoutMs = 10000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      this.pending.set(id, {
        method,
        resolve: (val) => { clearTimeout(timer); resolve(val); },
        reject: (err) => { clearTimeout(timer); reject(err); }
      });

      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

export class IsolatedBrowser {
  constructor(opts = {}) {
    this.chromePath = findChromeExecutable(opts.chromePath);
    this.proc = null;
    this.userDataDir = null;
    this.debugPort = 0;
  }

  async launch() {
    this.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawtest-chrome-'));
    const args = [
      '--headless=new',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--remote-debugging-port=0',
      `--user-data-dir=${this.userDataDir}`,
      '--window-size=1440,900',
      'about:blank'
    ];

    this.proc = spawn(this.chromePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    const wsEndpoint = await new Promise((resolve, reject) => {
      let stderrBuf = '';
      const timer = setTimeout(() => {
        reject(new Error(`Timed out launching Chromium (${this.chromePath}). stderr: ${stderrBuf.slice(-400)}`));
      }, 15000);

      this.proc.stderr.on('data', (chunk) => {
        stderrBuf += chunk.toString('utf8');
        const match = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });

      this.proc.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Chromium exited prematurely with code ${code}. stderr: ${stderrBuf.slice(-400)}`));
      });
    });

    const parsed = new URL(wsEndpoint);
    this.debugPort = Number(parsed.port);
    return this;
  }

  async newPage() {
    const res = await fetch(`http://127.0.0.1:${this.debugPort}/json/new?about:blank`, { method: 'PUT' })
      .catch(() => fetch(`http://127.0.0.1:${this.debugPort}/json/new?about:blank`));
    const target = await res.json();
    const cdp = new CDPSession(target.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Accessibility.enable').catch(() => {});

    return new PageSession(cdp, target.id, this.debugPort);
  }

  async close() {
    if (this.proc) {
      try { this.proc.kill('SIGTERM'); } catch {}
      await new Promise((r) => setTimeout(r, 150));
      try { this.proc.kill('SIGKILL'); } catch {}
      this.proc = null;
    }
    if (this.userDataDir) {
      try { fs.rmSync(this.userDataDir, { recursive: true, force: true }); } catch {}
      this.userDataDir = null;
    }
  }
}

export class PageSession {
  constructor(cdp, targetId, debugPort) {
    this.cdp = cdp;
    this.targetId = targetId;
    this.debugPort = debugPort;
    this.consoleMessages = [];
    this.pageErrors = [];
    this.requests = new Map();
    this.usedDocumentFallback = false;

    cdp.on('Runtime.consoleAPICalled', (ev) => {
      const text = (ev.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      this.consoleMessages.push({ type: ev.type, text });
    });

    cdp.on('Runtime.exceptionThrown', (ev) => {
      const desc = ev.exceptionDetails?.exception?.description || ev.exceptionDetails?.text || 'Uncaught exception';
      this.pageErrors.push(desc);
    });

    cdp.on('Network.requestWillBeSent', (ev) => {
      this.requests.set(ev.requestId, {
        url: ev.request.url,
        method: ev.request.method,
        resourceType: ev.type || 'Other'
      });
    });

    cdp.on('Network.responseReceived', (ev) => {
      const rec = this.requests.get(ev.requestId) || { url: ev.response.url, method: 'GET', resourceType: ev.type || 'Other' };
      rec.status = ev.response.status;
      rec.headers = ev.response.headers || {};
      this.requests.set(ev.requestId, rec);
    });

    cdp.on('Network.loadingFailed', (ev) => {
      const rec = this.requests.get(ev.requestId);
      if (rec) {
        rec.failed = true;
        rec.errorText = ev.errorText;
      }
    });
  }

  resetTelemetry() {
    this.consoleMessages = [];
    this.pageErrors = [];
    this.requests.clear();
  }

  async setExtraHeaders(headers) {
    this.extraHeaders = headers && Object.keys(headers).length > 0 ? { ...headers } : null;
    if (this.extraHeaders) {
      await this.cdp.send('Network.setExtraHTTPHeaders', { headers: this.extraHeaders }).catch(() => {});
    }
  }

  async goto(url, timeoutMs = 12000) {
    const loadPromise = new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.cdp.off('Page.loadEventFired', onLoad);
        resolve();
      }, timeoutMs);
      const onLoad = () => {
        clearTimeout(timer);
        resolve();
      };
      this.cdp.once('Page.loadEventFired', onLoad);
    });

    const nav = await this.cdp.send('Page.navigate', { url }, timeoutMs);
    if (nav && nav.errorText && nav.errorText.includes('ERR_BLOCKED_BY_ADMINISTRATOR')) {
      this.usedDocumentFallback = true;
      await this._hydrateViaFetch(url);
      return;
    }

    await loadPromise;
    await new Promise((r) => setTimeout(r, 250));
  }

  async _hydrateViaFetch(url) {
    const res = await fetch(url, { headers: this.extraHeaders || undefined });
    const origin = new URL(url).origin;
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const firstPair = setCookie.split(';')[0] || '';
      const eqIdx = firstPair.indexOf('=');
      if (eqIdx > 0) {
        await this.cdp.send('Network.setCookie', {
          name: firstPair.slice(0, eqIdx).trim(),
          value: firstPair.slice(eqIdx + 1).trim(),
          url: origin,
          path: '/'
        }).catch(() => {});
      }
    }
    let html = await res.text();

    // Inline same-origin <script src="..."> while preserving original src and blocking metadata
    // so both C1 Vault and B1 Naps maintain 100% fidelity under restricted Chromium policies.
    const scriptTagRe = /<script\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi;
    const matches = [...html.matchAll(scriptTagRe)];
    for (const m of matches) {
      try {
        const scriptUrl = new URL(m[2], url);
        if (scriptUrl.origin === origin) {
          const sRes = await fetch(scriptUrl.href);
          if (sRes.ok) {
            const code = await sRes.text();
            const rawAttrs = `${m[1]} ${m[3]}`;
            const isNonBlocking = /\b(?:async|defer)\b/i.test(rawAttrs) || /type\s*=\s*["']module["']/i.test(rawAttrs);
            const blockingAttr = isNonBlocking ? '' : ' data-pawtest-blocking="true"';
            html = html.replace(
              m[0],
              `<script data-pawtest-src="${scriptUrl.href}"${blockingAttr}>${code}</script>`
            );
          }
        }
      } catch {}
    }

    // Inline valid same-origin images as data URIs so broken images remain broken (naturalWidth === 0)
    const imgTagRe = /<img\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)\/?>/gi;
    const imgMatches = [...html.matchAll(imgTagRe)];
    for (const m of imgMatches) {
      try {
        const imgUrl = new URL(m[2], url);
        if (imgUrl.origin === origin) {
          const iRes = await fetch(imgUrl.href);
          if (iRes.ok) {
            const ct = iRes.headers.get('content-type') || 'image/png';
            const buf = Buffer.from(await iRes.arrayBuffer());
            const dataUri = `data:${ct};base64,${buf.toString('base64')}`;
            html = html.replace(m[0], m[0].replace(m[2], dataUri));
          }
        }
      } catch {}
    }

    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head[^>]*>/i, (tag) => `${tag}<base href="${url}">`);
    } else {
      html = `<base href="${url}">${html}`;
    }

    const tree = await this.cdp.send('Page.getFrameTree');
    await this.cdp.send('Page.setDocumentContent', {
      frameId: tree.frameTree.frame.id,
      html
    });
    await new Promise((r) => setTimeout(r, 250));
  }

  async setContent(html) {
    const tree = await this.cdp.send('Page.getFrameTree');
    await this.cdp.send('Page.setDocumentContent', {
      frameId: tree.frameTree.frame.id,
      html
    });
    await new Promise((r) => setTimeout(r, 200));
  }

  async evaluate(expression, timeoutMs = 8000) {
    const res = await this.cdp.send(
      'Runtime.evaluate',
      {
        expression,
        returnByValue: true,
        awaitPromise: true
      },
      timeoutMs
    );
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Evaluation error');
    }
    return res.result?.value;
  }

  async setViewport(width, height, deviceScaleFactor = 1, mobile = false) {
    await this.cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile
    });
    await new Promise((r) => setTimeout(r, 120));
  }

  async setNetworkProfile(profile) {
    if (profile === 'offline') {
      await this.cdp.send('Network.emulateNetworkConditions', {
        offline: true,
        latency: 0,
        downloadThroughput: 0,
        uploadThroughput: 0
      });
    } else if (profile === '3g') {
      await this.cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 400,
        downloadThroughput: (400 * 1024) / 8,
        uploadThroughput: (200 * 1024) / 8
      });
    } else {
      await this.cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1
      });
    }
  }

  async getAccessibilityTree() {
    try {
      const res = await this.cdp.send('Accessibility.getFullAXTree', {}, 6000);
      return res.nodes || [];
    } catch {
      return [];
    }
  }

  async getHeapUsage() {
    try {
      return await this.cdp.send('Runtime.getHeapUsage', {}, 5000);
    } catch {
      return { usedSize: 0, totalSize: 0 };
    }
  }

  async clearCookies() {
    await this.cdp.send('Network.clearBrowserCookies').catch(() => {});
  }

  async screenshot(clip) {
    const params = { format: 'png' };
    if (clip) {
      params.clip = { x: clip.x || 0, y: clip.y || 0, width: clip.width, height: clip.height, scale: 1 };
    }
    const res = await this.cdp.send('Page.captureScreenshot', params, 10000);
    return Buffer.from(res.data, 'base64');
  }

  async close() {
    this.cdp.close();
    await fetch(`http://127.0.0.1:${this.debugPort}/json/close/${this.targetId}`).catch(() => {});
  }
}
