const fs = require('fs');
const { PNG } = require('pngjs');

function clampPreviewMaxEdge(n) {
  const x = parseInt(String(n), 10);
  if (!Number.isFinite(x) || x < 1) return 640;
  return Math.min(2048, Math.max(128, Math.round(x)));
}

function nearestDownscaleRgba(src, sw, sh, dw, dh) {
  const dst = new Uint8Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / dh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / dw));
      const si = (sy * sw + sx) * 4;
      const di = (y * dw + x) * 4;
      dst[di] = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
      dst[di + 3] = src[si + 3];
    }
  }
  return Buffer.from(dst);
}

function buildPreviewPngBuffer(filePath, maxEdge) {
  const buf = fs.readFileSync(filePath);
  const png = PNG.sync.read(buf);
  const sw = png.width;
  const sh = png.height;
  const data = png.data;
  if (!sw || !sh || !data || data.length < sw * sh * 4) {
    throw new Error('invalid png dimensions');
  }
  const maxCur = Math.max(sw, sh);
  if (maxCur <= maxEdge) return buf;
  let dw;
  let dh;
  if (sw >= sh) {
    dw = maxEdge;
    dh = Math.max(1, Math.round((sh * maxEdge) / sw));
  } else {
    dh = maxEdge;
    dw = Math.max(1, Math.round((sw * maxEdge) / sh));
  }
  const newData = nearestDownscaleRgba(data, sw, sh, dw, dh);
  const outPng = new PNG({ width: dw, height: dh });
  outPng.data = newData;
  return PNG.sync.write(outPng);
}

module.exports = {
  clampPreviewMaxEdge,
  buildPreviewPngBuffer,
};
