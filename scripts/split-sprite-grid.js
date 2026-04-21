#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

function printUsage() {
  console.log(
    [
      'Usage:',
      '  node scripts/split-sprite-grid.js --input <png> --output <dir> --tile <WxH> [options]',
      '',
      'Options:',
      '  --tile-width <n>       Tile width (alternative to --tile)',
      '  --tile-height <n>      Tile height (alternative to --tile)',
      '  --start-index <n>      Start index for naming/mapping (default: 0)',
      '  --digits <n>           Zero-pad digits for index names (default: 3)',
      '  --prefix <text>        Prefix for index names (default: tile)',
      '  --skip-empty           Skip fully transparent tiles',
      '  --alpha-threshold <n>  Pixel alpha > n counts as non-empty (default: 0)',
      '  --mapping <json>       Mapping file (array or object) from index to icon id',
      '  --id-suffix <text>     File suffix when mapping id is present (default: _hr1)',
      '',
      'Examples:',
      '  node scripts/split-sprite-grid.js --input ui/uld/PVPClassJobIcon/pvpclassjobicon_hr1.png --output ui/uld/PVPClassJobIcon/slices --tile 56x56 --skip-empty',
      '  node scripts/split-sprite-grid.js --input atlas.png --output out --tile-width 56 --tile-height 56 --mapping ids.json --skip-empty',
    ].join('\n')
  );
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const cur = argv[i];
    if (!cur.startsWith('--')) continue;
    const key = cur.slice(2);
    if (key === 'skip-empty') {
      args.skipEmpty = true;
      continue;
    }
    const val = argv[i + 1];
    if (val == null || val.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = val;
    i += 1;
  }
  return args;
}

function parsePositiveInt(name, raw) {
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return n;
}

function parseNonNegativeInt(name, raw) {
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return n;
}

function parseTileSize(args) {
  let tileWidth = null;
  let tileHeight = null;

  if (args.tile) {
    const m = String(args.tile).match(/^(\d+)x(\d+)$/i);
    if (!m) {
      throw new Error('--tile must look like 56x56');
    }
    tileWidth = parsePositiveInt('tile width', m[1]);
    tileHeight = parsePositiveInt('tile height', m[2]);
  }

  if (args['tile-width']) {
    tileWidth = parsePositiveInt('tile width', args['tile-width']);
  }
  if (args['tile-height']) {
    tileHeight = parsePositiveInt('tile height', args['tile-height']);
  }

  if (!tileWidth || !tileHeight) {
    throw new Error('Please provide tile size via --tile or --tile-width/--tile-height');
  }

  return { tileWidth, tileHeight };
}

function readMapping(mappingPath) {
  if (!mappingPath) return null;
  const abs = path.resolve(mappingPath);
  const raw = fs.readFileSync(abs, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data) && (typeof data !== 'object' || data == null)) {
    throw new Error('--mapping must be a JSON array or object');
  }
  return data;
}

function resolveMappedId(mapping, index) {
  if (!mapping) return null;
  if (Array.isArray(mapping)) {
    if (index < 0 || index >= mapping.length) return null;
    const v = mapping[index];
    if (v == null || v === '') return null;
    return String(v);
  }
  if (Object.prototype.hasOwnProperty.call(mapping, String(index))) {
    const v = mapping[String(index)];
    if (v == null || v === '') return null;
    return String(v);
  }
  return null;
}

function countOpaquePixels(data, width, sx, sy, tw, th, alphaThreshold) {
  let opaque = 0;
  for (let y = 0; y < th; y++) {
    const srcY = sy + y;
    const rowBase = srcY * width;
    for (let x = 0; x < tw; x++) {
      const srcX = sx + x;
      const alpha = data[(rowBase + srcX) * 4 + 3];
      if (alpha > alphaThreshold) opaque++;
    }
  }
  return opaque;
}

function copyTileRgba(data, width, sx, sy, tw, th) {
  const out = Buffer.alloc(tw * th * 4);
  for (let y = 0; y < th; y++) {
    const srcY = sy + y;
    const srcStart = (srcY * width + sx) * 4;
    const dstStart = y * tw * 4;
    data.copy(out, dstStart, srcStart, srcStart + tw * 4);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  if (!args.input || !args.output) {
    printUsage();
    throw new Error('--input and --output are required');
  }

  const inputPath = path.resolve(args.input);
  const outputDir = path.resolve(args.output);
  const { tileWidth, tileHeight } = parseTileSize(args);
  const startIndex = args['start-index'] == null ? 0 : parseNonNegativeInt('start index', args['start-index']);
  const digits = args.digits == null ? 3 : parsePositiveInt('digits', args.digits);
  const prefix = args.prefix == null ? 'tile' : String(args.prefix);
  const skipEmpty = Boolean(args.skipEmpty);
  const alphaThreshold = args['alpha-threshold'] == null ? 0 : parseNonNegativeInt('alpha threshold', args['alpha-threshold']);
  const mapping = readMapping(args.mapping);
  const idSuffix = args['id-suffix'] == null ? '_hr1' : String(args['id-suffix']);

  const inputBuf = fs.readFileSync(inputPath);
  const png = PNG.sync.read(inputBuf);
  const srcW = png.width;
  const srcH = png.height;
  const cols = Math.floor(srcW / tileWidth);
  const rows = Math.floor(srcH / tileHeight);
  const coveredW = cols * tileWidth;
  const coveredH = rows * tileHeight;
  const remW = srcW - coveredW;
  const remH = srcH - coveredH;

  if (cols <= 0 || rows <= 0) {
    throw new Error('Tile size is larger than source image');
  }
  if (remW !== 0 || remH !== 0) {
    console.warn(
      '[warn] image size is not divisible by tile size. Remaining pixels are ignored:',
      `remW=${remW}, remH=${remH}`
    );
  }

  fs.mkdirSync(outputDir, { recursive: true });

  let totalTiles = 0;
  let exportedTiles = 0;
  let emptyTiles = 0;
  let mappedTiles = 0;
  const manifest = {
    source: path.relative(process.cwd(), inputPath).replace(/\\/g, '/'),
    imageWidth: srcW,
    imageHeight: srcH,
    tileWidth,
    tileHeight,
    cols,
    rows,
    startIndex,
    skipEmpty,
    alphaThreshold,
    generatedAt: new Date().toISOString(),
    entries: [],
  };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      totalTiles++;
      const tileIndex = startIndex + row * cols + col;
      const sx = col * tileWidth;
      const sy = row * tileHeight;
      const opaquePixels = countOpaquePixels(
        png.data,
        srcW,
        sx,
        sy,
        tileWidth,
        tileHeight,
        alphaThreshold
      );
      const nonEmpty = opaquePixels > 0;
      if (!nonEmpty) emptyTiles++;
      if (skipEmpty && !nonEmpty) {
        manifest.entries.push({
          index: tileIndex,
          row,
          col,
          sourceX: sx,
          sourceY: sy,
          width: tileWidth,
          height: tileHeight,
          opaquePixels,
          exported: false,
          output: null,
          mappedId: null,
        });
        continue;
      }

      const mappedId = resolveMappedId(mapping, tileIndex);
      if (mappedId) mappedTiles++;

      const fileName = mappedId
        ? `${mappedId}${idSuffix}.png`
        : `${prefix}_${String(tileIndex).padStart(digits, '0')}.png`;
      const outPath = path.join(outputDir, fileName);
      const tileRgba = copyTileRgba(png.data, srcW, sx, sy, tileWidth, tileHeight);
      const tilePng = new PNG({ width: tileWidth, height: tileHeight });
      tilePng.data = tileRgba;
      fs.writeFileSync(outPath, PNG.sync.write(tilePng));

      exportedTiles++;
      manifest.entries.push({
        index: tileIndex,
        row,
        col,
        sourceX: sx,
        sourceY: sy,
        width: tileWidth,
        height: tileHeight,
        opaquePixels,
        exported: true,
        output: fileName,
        mappedId: mappedId || null,
      });
    }
  }

  const manifestPath = path.join(outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(
    [
      `source: ${inputPath}`,
      `output: ${outputDir}`,
      `grid: ${cols}x${rows}, tile=${tileWidth}x${tileHeight}`,
      `total tiles: ${totalTiles}`,
      `exported: ${exportedTiles}`,
      `empty: ${emptyTiles}`,
      `mapped ids used: ${mappedTiles}`,
      `manifest: ${manifestPath}`,
    ].join('\n')
  );
}

try {
  main();
} catch (err) {
  console.error('[split-sprite-grid] ' + err.message);
  process.exit(1);
}

