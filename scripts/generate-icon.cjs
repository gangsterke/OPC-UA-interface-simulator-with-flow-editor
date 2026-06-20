// One-off asset generator for a simple placeholder app icon (no design tools
// or external image libraries available) - draws a flat-color circle with
// three signal-style bars directly into raw RGBA pixels, then hand-encodes
// PNG (zlib deflate + crc32, both Node builtins) and wraps the PNGs in a
// minimal ICO container (Vista+ ICOs may embed PNG-compressed images
// directly, no BMP/DIB encoding needed). Run with: node scripts/generate-icon.cjs
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const BG_COLOR = [0x1a, 0x73, 0xe8]; // a plain blue, nothing brand-specific
const BAR_COLOR = [0xff, 0xff, 0xff];

function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4); // RGBA, starts fully transparent
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.47;

  function setPixel(x, y, color, alpha = 255) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    pixels[i] = color[0];
    pixels[i + 1] = color[1];
    pixels[i + 2] = color[2];
    pixels[i + 3] = alpha;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (Math.sqrt(dx * dx + dy * dy) <= radius) {
        setPixel(x, y, BG_COLOR);
      }
    }
  }

  // Three horizontal bars of decreasing width, suggesting a signal/flow.
  const bars = [
    { widthFrac: 0.62, yFrac: 0.37 },
    { widthFrac: 0.46, yFrac: 0.5 },
    { widthFrac: 0.3, yFrac: 0.63 },
  ];
  const barHeight = Math.max(2, Math.round(size * 0.07));
  for (const bar of bars) {
    const barWidth = size * bar.widthFrac;
    const left = Math.round(cx - barWidth / 2);
    const right = Math.round(cx + barWidth / 2);
    const top = Math.round(size * bar.yFrac - barHeight / 2);
    for (let y = top; y < top + barHeight; y++) {
      for (let x = left; x < right; x++) {
        setPixel(x, y, BAR_COLOR);
      }
    }
  }

  return pixels;
}

function encodePng(pixels, size) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  function chunk(type, data) {
    const typeBuf = Buffer.from(type, "ascii");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcInput = Buffer.concat([typeBuf, data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(zlib.crc32(crcInput), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Each scanline prefixed with filter byte 0 (none).
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idatData = zlib.deflateSync(raw);

  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idatData), chunk("IEND", Buffer.alloc(0))]);
}

function buildIco(pngBuffersBySize) {
  const entries = Object.entries(pngBuffersBySize);
  const headerSize = 6 + entries.length * 16;
  let offset = headerSize;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const dirParts = [];
  const dataParts = [];
  entries.forEach(([sizeStr, pngBuffer], index) => {
    const size = Number(sizeStr);
    const entryOffset = 6 + index * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entryOffset); // width (0 = 256)
    header.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1); // height
    header.writeUInt8(0, entryOffset + 2); // color count
    header.writeUInt8(0, entryOffset + 3); // reserved
    header.writeUInt16LE(1, entryOffset + 4); // planes
    header.writeUInt16LE(32, entryOffset + 6); // bit count
    header.writeUInt32LE(pngBuffer.length, entryOffset + 8); // bytes in resource
    header.writeUInt32LE(offset, entryOffset + 12); // offset
    offset += pngBuffer.length;
    dataParts.push(pngBuffer);
  });

  return Buffer.concat([header, ...dataParts]);
}

const buildDir = path.join(__dirname, "..", "build");
fs.mkdirSync(buildDir, { recursive: true });

const icoSizes = [16, 32, 48, 256];
const pngBuffersBySize = {};
for (const size of icoSizes) {
  pngBuffersBySize[size] = encodePng(drawIcon(size), size);
}

fs.writeFileSync(path.join(buildDir, "icon.ico"), buildIco(pngBuffersBySize));
fs.writeFileSync(path.join(buildDir, "icon.png"), encodePng(drawIcon(512), 512));

console.log("Wrote build/icon.ico and build/icon.png");
