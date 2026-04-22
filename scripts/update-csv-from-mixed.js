#!/usr/bin/env node
/**
 * 一键更新本地 vendor 下已存在的 CSV（来源：InfSein/ffxiv-datamining-mixed/chs）
 * 规则：
 * 1) 先读取远端 chs 目录 CSV 列表；
 * 2) 校验本地 CSV 文件名是否都存在于远端；
 * 3) 逐个下载并覆盖本地文件；
 * 4) 更新完成后自动重建 csv-valid-icon-ids.json（相关派生数据）。
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const VENDOR_ROOT = path.join(ROOT, 'vendor');
const API_LIST_URL =
  'https://api.github.com/repos/InfSein/ffxiv-datamining-mixed/contents/chs';
const API_FILE_URL_BASE =
  'https://api.github.com/repos/InfSein/ffxiv-datamining-mixed/contents/chs/';
const REQUEST_HEADERS = {
  'User-Agent': 'icon-composer-csv-updater/1.0',
  Accept: 'application/vnd.github+json',
};

function log(msg) {
  process.stdout.write(String(msg) + '\n');
}

function fail(msg) {
  process.stderr.write('[ERROR] ' + String(msg) + '\n');
  process.exit(1);
}

function fetchText(url, redirectDepth = 0) {
  if (redirectDepth > 5) {
    return Promise.reject(new Error('too many redirects: ' + url));
  }
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: REQUEST_HEADERS },
      res => {
        if (
          res.statusCode === 301 ||
          res.statusCode === 302 ||
          res.statusCode === 307 ||
          res.statusCode === 308
        ) {
          const location = res.headers.location;
          res.resume();
          if (!location) {
            reject(new Error('redirect without location: ' + url));
            return;
          }
          const next = location.startsWith('http')
            ? location
            : new URL(location, url).href;
          fetchText(next, redirectDepth + 1).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} ${url}`));
          return;
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          resolve(Buffer.concat(chunks).toString('utf8'));
        });
      }
    );
    req.on('error', reject);
  });
}

function listLocalCsvFiles() {
  const out = [];
  if (!fs.existsSync(VENDOR_ROOT)) return out;

  function walk(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (!ent.isFile()) continue;
      if (!/\.csv$/i.test(ent.name)) continue;
      out.push({
        fullPath: full,
        fileName: ent.name,
        relPath: path.relative(ROOT, full).replace(/\\/g, '/'),
      });
    }
  }

  walk(VENDOR_ROOT);
  out.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return out;
}

async function fetchRemoteCsvNameSet() {
  const text = await fetchText(API_LIST_URL);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error('failed to parse GitHub API response: ' + e.message);
  }
  if (!Array.isArray(parsed)) {
    throw new Error('unexpected GitHub API payload (not array)');
  }
  const names = new Set();
  for (const item of parsed) {
    if (!item || item.type !== 'file') continue;
    const name = String(item.name || '');
    if (!/\.csv$/i.test(name)) continue;
    names.add(name);
  }
  return names;
}

async function fetchCsvTextByApi(fileName) {
  const apiUrl = API_FILE_URL_BASE + encodeURIComponent(fileName);
  const text = await fetchText(apiUrl);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`failed to parse file api payload for ${fileName}: ${e.message}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`unexpected file api payload for ${fileName}`);
  }
  if (String(parsed.encoding || '').toLowerCase() === 'base64' && parsed.content) {
    const b64 = String(parsed.content).replace(/\r?\n/g, '');
    return Buffer.from(b64, 'base64').toString('utf8');
  }
  if (parsed.download_url) {
    // 兜底：有些情况下 API 可能不给 content，尝试 download_url。
    return fetchText(String(parsed.download_url));
  }
  throw new Error(`file content missing in api response for ${fileName}`);
}

async function downloadAndWriteCsv(localItem) {
  const text = await fetchCsvTextByApi(localItem.fileName);
  fs.writeFileSync(localItem.fullPath, text, 'utf8');
}

function rebuildDerivedData() {
  const script = path.join(ROOT, 'csv-whitelist.js');
  if (!fs.existsSync(script)) {
    log('[WARN] 未找到 csv-whitelist.js，跳过派生数据重建。');
    return;
  }
  log('-> 重建 csv-valid-icon-ids.json ...');
  const ret = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (ret.status !== 0) {
    throw new Error('csv-whitelist.js 执行失败，退出码: ' + ret.status);
  }
}

async function main() {
  log('=== CSV 一键更新（ffxiv-datamining-mixed/chs）===');

  const localCsv = listLocalCsvFiles();
  if (localCsv.length === 0) {
    fail('未找到本地 CSV（vendor 下为空），无需更新。');
  }
  log(`本地 CSV 数量: ${localCsv.length}`);

  log('-> 拉取远端目录清单 ...');
  const remoteNameSet = await fetchRemoteCsvNameSet();
  log(`远端 CSV 数量: ${remoteNameSet.size}`);

  const missing = localCsv.filter(item => !remoteNameSet.has(item.fileName));
  if (missing.length > 0) {
    const list = missing.map(m => `- ${m.fileName} (${m.relPath})`).join('\n');
    fail(
      '发现本地 CSV 不在远端 chs 目录，已中止更新：\n' + list
    );
  }
  log('校验通过：本地 CSV 全部来自远端 chs 目录。');

  let updated = 0;
  for (const item of localCsv) {
    log(`-> 更新 ${item.relPath}`);
    await downloadAndWriteCsv(item);
    updated += 1;
  }
  log(`CSV 更新完成：${updated} 个文件。`);

  rebuildDerivedData();
  log('全部完成。');
}

main().catch(err => {
  fail(err && err.message ? err.message : String(err));
});
