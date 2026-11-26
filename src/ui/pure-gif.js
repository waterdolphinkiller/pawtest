import zlib from 'node:zlib';

/**
 * 100% Zero-Dependency Pure-JS Animated GIF89a Encoder (PNG -> GIF89a).
 * Used as an automatic fallback when `ffmpeg` is not installed on the host machine.
 * Decodes standard 8-bit RGB/RGBA PNG frames via Node's built-in `zlib`, quantizes
 * to a fixed 256-color RGB332 global palette, and writes standard LZW GIF89a streams.
 */

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== sig[i]) throw new Error('Invalid PNG signature');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 2;
  const idatChunks = [];

  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }

  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG format (bitDepth=${bitDepth}, colorType=${colorType})`);
  }

  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = width * bpp;
  const pixels = Buffer.alloc(width * height * bpp);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    const outStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const val = raw[rowStart + x];
      const a = x >= bpp ? pixels[outStart + x - bpp] : 0;
      const b = y > 0 ? pixels[outStart - stride + x] : 0;
      const c = x >= bpp && y > 0 ? pixels[outStart - stride + x - bpp] : 0;
      let recon = val;
      if (filter === 1) recon = (val + a) & 0xff;
      else if (filter === 2) recon = (val + b) & 0xff;
      else if (filter === 3) recon = (val + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) recon = (val + paethPredictor(a, b, c)) & 0xff;
      pixels[outStart + x] = recon;
    }
  }

  return { width, height, bpp, pixels };
}

function buildRgb332Palette() {
  const pal = Buffer.alloc(256 * 3);
  for (let i = 0; i < 256; i++) {
    const r = (i >> 5) & 7;
    const g = (i >> 2) & 7;
    const b = i & 3;
    pal[i * 3] = Math.round((r * 255) / 7);
    pal[i * 3 + 1] = Math.round((g * 255) / 7);
    pal[i * 3 + 2] = Math.round((b * 255) / 3);
  }
  return pal;
}

function quantizeFrameRgb332(decoded, targetW, targetH) {
  const { width, height, bpp, pixels } = decoded;
  const indices = new Uint8Array(targetW * targetH);
  for (let y = 0; y < targetH; y++) {
    const sy = Math.min(height - 1, Math.floor((y * height) / targetH));
    for (let x = 0; x < targetW; x++) {
      const sx = Math.min(width - 1, Math.floor((x * width) / targetW));
      const idx = (sy * width + sx) * bpp;
      const r = pixels[idx] >> 5;
      const g = pixels[idx + 1] >> 5;
      const b = pixels[idx + 2] >> 6;
      indices[y * targetW + x] = (r << 5) | (g << 2) | b;
    }
  }
  return indices;
}

function lzwEncode(indices, minCodeSize = 8) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  let dict = new Map();

  const bytes = [];
  let bitBuf = 0;
  let bitCount = 0;

  const emit = (code) => {
    bitBuf |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      bytes.push(bitBuf & 0xff);
      bitBuf >>= 8;
      bitCount -= 8;
    }
  };

  emit(clearCode);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
    } else {
      emit(prefix);
      if (nextCode < 4096) {
        dict.set(key, nextCode++);
        if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
      } else {
        emit(clearCode);
        dict = new Map();
        codeSize = minCodeSize + 1;
        nextCode = eoiCode + 1;
      }
      prefix = k;
    }
  }
  emit(prefix);
  emit(eoiCode);
  if (bitCount > 0) bytes.push(bitBuf & 0xff);

  // Pack into GIF sub-blocks (max 255 bytes each)
  const blocks = [Buffer.from([minCodeSize])];
  for (let i = 0; i < bytes.length; i += 255) {
    const slice = bytes.slice(i, i + 255);
    blocks.push(Buffer.from([slice.length, ...slice]));
  }
  blocks.push(Buffer.from([0x00]));
  return Buffer.concat(blocks);
}

/**
 * Encode an array of PNG Buffers into a looping animated GIF89a Buffer.
 * @param {Buffer[]} pngBuffers
 * @param {{ width?: number, height?: number, delayCs?: number }} opts
 */
export function encodeAnimatedGifFromPngs(pngBuffers, { width = 640, height = 360, delayCs = 50 } = {}) {
  const chunks = [];
  // Header + Logical Screen Descriptor (Global Color Table 256 colors)
  const header = Buffer.alloc(13);
  header.write('GIF89a', 0, 'ascii');
  header.writeUInt16LE(width, 6);
  header.writeUInt16LE(height, 8);
  header[10] = 0xf7; // GCT flag=1, color res=7, sort=0, size=7 (256 colors)
  header[11] = 0;
  header[12] = 0;
  chunks.push(header);
  chunks.push(buildRgb332Palette());

  // NETSCAPE2.0 Infinite Loop Extension
  chunks.push(Buffer.from([0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0', 'ascii'), 0x03, 0x01, 0x00, 0x00, 0x00]));

  for (const pngBuf of pngBuffers) {
    const decoded = decodePng(pngBuf);
    const indices = quantizeFrameRgb332(decoded, width, height);

    // Graphic Control Extension
    const gce = Buffer.alloc(8);
    gce[0] = 0x21; gce[1] = 0xf9; gce[2] = 0x04;
    gce[3] = 0x00;
    gce.writeUInt16LE(delayCs, 4);
    gce[6] = 0x00; gce[7] = 0x00;
    chunks.push(gce);

    // Image Descriptor
    const desc = Buffer.alloc(10);
    desc[0] = 0x2c;
    desc.writeUInt16LE(0, 1);
    desc.writeUInt16LE(0, 3);
    desc.writeUInt16LE(width, 5);
    desc.writeUInt16LE(height, 7);
    desc[9] = 0x00;
    chunks.push(desc);

    chunks.push(lzwEncode(indices, 8));
  }

  chunks.push(Buffer.from([0x3b])); // GIF Trailer
  return Buffer.concat(chunks);
}
