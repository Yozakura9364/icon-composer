/**
 * 从 InfSein/ffxiv-datamining-mixed 的 chs CSV 中提取 Image 列里的图标编号，
 * 用于过滤本地扫描结果：仅展示 CSV 中存在条目的图标（避免 CDN 404）。
 * @see https://github.com/InfSein/ffxiv-datamining-mixed/tree/master/chs
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

const CSV_BASE =
  'https://raw.githubusercontent.com/InfSein/ffxiv-datamining-mixed/master/chs/';

const CSV_FILES = [
  'BannerBg.csv',
  'BannerFrame.csv',
  'BannerDecoration.csv',
  'CharaCardBase.csv',
  'CharaCardDecoration.csv',
  'CharaCardHeader.csv',
];

/** 与图层分类一致的可展示图标 ID 区间（排除 CSV 里其它 Image 如 82091） */
function isPortableCharaIconId(id) {
  if (!Number.isFinite(id) || id <= 0) return false;
  const ranges = [
    [190002, 190999],
    [191002, 191999],
    [192002, 192999],
    [193002, 193999],
    [194002, 194999],
    [195002, 195999],
    [196002, 196499],
    [197002, 197999],
    [198002, 198999],
    [199002, 199999],
    [234401, 234999],
  ];
  return ranges.some(([a, b]) => id >= a && id <= b);
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === ',') {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

function extractImageIdsFromCsv(text) {
  const body = text.replace(/^\uFEFF/, '');
  const lines = body.split(/\r?\n/);
  let schemaIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('int32,')) {
      schemaIdx = i;
      break;
    }
  }
  if (schemaIdx < 0) return [];

  const types = splitCsvLine(lines[schemaIdx]);
  const imageCols = [];
  types.forEach((t, i) => {
    if (t.trim() === 'Image') imageCols.push(i);
  });
  if (imageCols.length === 0) return [];

  const ids = [];
  for (let i = schemaIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const parts = splitCsvLine(raw);
    for (const col of imageCols) {
      if (col >= parts.length) continue;
      const v = parseInt(parts[col], 10);
      if (Number.isNaN(v) || v <= 0) continue;
      if (isPortableCharaIconId(v)) ids.push(v);
    }
  }
  return ids;
}

function fetchUrl(url, redirectDepth = 0) {
  if (redirectDepth > 5) {
    return Promise.reject(new Error('too many redirects'));
  }
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: { 'User-Agent': 'icon-composer-csv-whitelist/1.0' },
        },
        res => {
          if (
            res.statusCode === 301 ||
            res.statusCode === 302 ||
            res.statusCode === 307 ||
            res.statusCode === 308
          ) {
            const loc = res.headers.location;
            res.resume();
            if (!loc) {
              reject(new Error('redirect without location'));
              return;
            }
            const next = loc.startsWith('http')
              ? loc
              : new URL(loc, url).href;
            fetchUrl(next, redirectDepth + 1).then(resolve).catch(reject);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode} ${url}`));
            return;
          }
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () =>
            resolve(Buffer.concat(chunks).toString('utf8'))
          );
        }
      )
      .on('error', reject);
  });
}

async function buildCsvIconIdSetFromNetwork() {
  const set = new Set();
  for (const name of CSV_FILES) {
    const text = await fetchUrl(CSV_BASE + encodeURIComponent(name));
    for (const id of extractImageIdsFromCsv(text)) set.add(id);
  }
  return set;
}

/** 使用仓库内 vendor 副本（无网也可用，与 GitHub chs 目录一致） */
function buildCsvIconIdSetFromVendorDir(vendorDir) {
  const set = new Set();
  for (const name of CSV_FILES) {
    const p = path.join(vendorDir, name);
    if (!fs.existsSync(p)) return null;
  }
  for (const name of CSV_FILES) {
    const p = path.join(vendorDir, name);
    const text = fs.readFileSync(p, 'utf8');
    for (const id of extractImageIdsFromCsv(text)) set.add(id);
  }
  return set;
}

function loadCachedIconIdsSync(jsonPath) {
  if (!fs.existsSync(jsonPath)) return null;
  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    const s = new Set(arr.map(n => parseInt(n, 10)).filter(n => !Number.isNaN(n)));
    if (s.size === 0) return null;
    return s;
  } catch (e) {
    return null;
  }
}

/**
 * 同步读取白名单（供 /api/files 每次请求调用，改 json 或 vendor 后无需重启服务）。
 * 优先使用「不旧于 vendor CSV」的 csv-valid-icon-ids.json；否则现场从 vendor 解析。
 */
function getCsvWhitelistSync(options = {}) {
  const cachePath =
    options.cachePath || path.join(PROJECT_ROOT, 'data', 'csv-valid-icon-ids.json');
  const vendorDir =
    options.vendorDir || path.join(PROJECT_ROOT, 'vendor', 'ffxiv-datamining-chs');

  let jsonMtime = 0;
  if (fs.existsSync(cachePath)) {
    try {
      jsonMtime = fs.statSync(cachePath).mtimeMs;
    } catch (_) {
      jsonMtime = 0;
    }
  }

  let vendorMtime = 0;
  let vendorComplete = true;
  for (const name of CSV_FILES) {
    const p = path.join(vendorDir, name);
    if (!fs.existsSync(p)) {
      vendorComplete = false;
      vendorMtime = 0;
      break;
    }
    try {
      const t = fs.statSync(p).mtimeMs;
      if (t > vendorMtime) vendorMtime = t;
    } catch (_) {
      vendorComplete = false;
      vendorMtime = 0;
      break;
    }
  }

  const fromJson = loadCachedIconIdsSync(cachePath);
  const vendorSet = vendorComplete
    ? buildCsvIconIdSetFromVendorDir(vendorDir)
    : null;

  if (fromJson && fromJson.size > 0 && jsonMtime >= vendorMtime) {
    return fromJson;
  }
  if (vendorSet && vendorSet.size > 0) return vendorSet;
  if (fromJson && fromJson.size > 0) return fromJson;
  return null;
}

async function loadCsvIconIdSet(options = {}) {
  const cachePath =
    options.cachePath || path.join(PROJECT_ROOT, 'data', 'csv-valid-icon-ids.json');
  const vendorDir =
    options.vendorDir || path.join(PROJECT_ROOT, 'vendor', 'ffxiv-datamining-chs');

  if (!options.forceNetwork) {
    const vendorSet = buildCsvIconIdSetFromVendorDir(vendorDir);
    if (vendorSet && vendorSet.size > 0) {
      if (options.persistVendorToJson) {
        try {
          fs.writeFileSync(
            cachePath,
            JSON.stringify([...vendorSet].sort((a, b) => a - b)),
            'utf8'
          );
          console.log('已从 vendor 写入 %s', cachePath);
        } catch (e) {
          console.warn('写入 csv-valid-icon-ids.json 失败:', e.message);
        }
      }
      return vendorSet;
    }
    const cached = loadCachedIconIdsSync(cachePath);
    if (cached && cached.size > 0) return cached;
  }
  try {
    const set = await buildCsvIconIdSetFromNetwork();
    if (set.size > 0 && options.writeCache !== false) {
      try {
        fs.writeFileSync(
          cachePath,
          JSON.stringify([...set].sort((a, b) => a - b)),
          'utf8'
        );
        console.log('已写入 CSV 图标白名单缓存: %s (%d 个)', cachePath, set.size);
      } catch (e) {
        console.warn('写入 csv-valid-icon-ids.json 失败:', e.message);
      }
    }
    return set;
  } catch (e) {
    console.warn(
      '[csv-whitelist] 从 GitHub 拉取 CSV 失败，将不进行白名单过滤:',
      e.message
    );
    const fromDisk = loadCachedIconIdsSync(cachePath);
    if (fromDisk && fromDisk.size > 0) return fromDisk;
    const vendorFallback = buildCsvIconIdSetFromVendorDir(vendorDir);
    if (vendorFallback && vendorFallback.size > 0) return vendorFallback;
    return new Set();
  }
}

module.exports = {
  CSV_FILES,
  splitCsvLine,
  extractImageIdsFromCsv,
  buildCsvIconIdSetFromNetwork,
  buildCsvIconIdSetFromVendorDir,
  loadCsvIconIdSet,
  loadCachedIconIdsSync,
  getCsvWhitelistSync,
  isPortableCharaIconId,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const forceNet = args.includes('--network');
  // 默认：从 vendor 重建 json；--network 时从 GitHub 拉取并写 json
  loadCsvIconIdSet({
    forceNetwork: forceNet,
    writeCache: true,
    persistVendorToJson: !forceNet,
  })
    .then(s => {
      if (!s || s.size === 0) {
        console.error(
          '未能得到任何图标编号。请检查 vendor/ffxiv-datamining-chs 下 6 个 CSV 是否齐全，或联网后执行: node csv-whitelist.js --network'
        );
        process.exit(1);
      }
      console.log('csv-valid-icon-ids.json 已更新，共 %d 个编号', s.size);
      process.exit(0);
    })
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}
