const { PNG } = require('pngjs');

function parseCanvasSize(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.round(n));
}

function parseLayerCoord(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

/**
 * Put a layer PNG onto a transparent full-size canvas and return PNG bytes.
 */
function placeLayerOnFullCanvas(layer, canvasWidth, canvasHeight) {
  const b64 = String(layer && layer.rgbaData ? layer.rgbaData : '').replace(
    /^data:image\/\w+;base64,/,
    ''
  );
  if (!b64) throw new Error('layer rgbaData missing');
  const src = PNG.sync.read(Buffer.from(b64, 'base64'));
  const out = new PNG({ width: canvasWidth, height: canvasHeight });
  out.data.fill(0);

  const ox = parseLayerCoord(layer.x);
  const oy = parseLayerCoord(layer.y);
  for (let sy = 0; sy < src.height; sy++) {
    const dy = oy + sy;
    if (dy < 0 || dy >= canvasHeight) continue;
    for (let sx = 0; sx < src.width; sx++) {
      const dx = ox + sx;
      if (dx < 0 || dx >= canvasWidth) continue;
      const si = (sy * src.width + sx) * 4;
      const di = (dy * canvasWidth + dx) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }

  return PNG.sync.write(out);
}

module.exports = {
  parseCanvasSize,
  parseLayerCoord,
  placeLayerOnFullCanvas,
};
