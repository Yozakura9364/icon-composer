const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { PNG } = require('pngjs');
const { createLayeredPSD } = require('./psd-writer');
const { generateJSXScript } = require('./jsx-writer');
const { getCsvWhitelistSync } = require('./csv-whitelist');
const yazl = require('yazl');

// 支持命令行参数: --materials <path> --export <path>
// 部署时可设环境变量 ICON_COMPOSER_MATERIALS / ICON_COMPOSER_EXPORT（命令行优先）
const args = process.argv.slice(2);
// 默认：仓库根目录下 ui/icon（与游戏解包 ui/icon 结构一致：若干六位数字子目录 + PNG）
let ICON_ROOT =
  process.env.ICON_COMPOSER_MATERIALS ||
  path.join(__dirname, 'ui', 'icon');
/** 写入 api 的素材路径相对仓库根目录（与 ICON_ROOT 默认一致） */
const REL_UI_ICON = path.join('ui', 'icon').replace(/\\/g, '/');
let EXPORT_ROOT = process.env.ICON_COMPOSER_EXPORT || null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--materials' && args[i + 1]) ICON_ROOT = args[++i];
  if (args[i] === '--export'    && args[i + 1]) EXPORT_ROOT = args[++i];
}
const PORT = parseInt(process.env.ICON_COMPOSER_PORT || '3456', 10);
/** 若设置，访问 /api/metrics 须在 query 带 ?secret= 值，避免流量数据被随意抓取 */
const METRICS_SECRET = process.env.METRICS_SECRET || '';

/** 未设环境变量时，可读项目根 app-base.txt 首行（如 /portable），方便宝塔不写 env */
function mergeIconComposerBaseFromFile() {
  if (String(process.env.ICON_COMPOSER_BASE || '').trim()) return;
  try {
    const p = path.join(__dirname, 'app-base.txt');
    if (!fs.existsSync(p)) return;
    const line = fs.readFileSync(p, 'utf8').split(/\r?\n/)[0].trim();
    if (line) process.env.ICON_COMPOSER_BASE = line;
  } catch (e) {
    /* ignore */
  }
}
mergeIconComposerBaseFromFile();

/** 子路径部署，如 /portable（对应 https://www.example.com/portable/）。不设则根路径。 */
function normalizeIconComposerBase() {
  let s = String(process.env.ICON_COMPOSER_BASE || '').trim();
  if (!s) return '';
  if (!s.startsWith('/')) s = '/' + s;
  s = s.replace(/\/+$/, '');
  if (s.includes('..') || !/^\/[\w./-]+$/.test(s)) return '';
  return s;
}
const ICON_COMPOSER_BASE = normalizeIconComposerBase();

/** 边缘缓存：PNG 路径即内容版本，可长期缓存以降低回源（配合 CDN 控制台规则） */
const CACHE_IMG = 'public, max-age=31536000, immutable';
const CACHE_API = 'private, no-cache';
const CACHE_HTML = 'no-cache';

const metrics = {
  startTime: Date.now(),
  requestsTotal: 0,
  imgHits: 0,
  img404: 0,
  apiFiles: 0,
  apiPresets: 0,
  apiExport: 0,
  staticOther: 0,
};

function metricsAuthorized(req) {
  if (!METRICS_SECRET) return true;
  const parsed = url.parse(req.url, true);
  const q = parsed.query && parsed.query.secret;
  return q === METRICS_SECRET;
}

// 加载 ID → 中文名称 映射
let idNames = {};
try {
  idNames = JSON.parse(fs.readFileSync(path.join(__dirname, 'id-names.json'), 'utf8'));
  console.log('已加载 %d 个图层名称', Object.keys(idNames).length);
} catch (e) {
  console.log('未找到 id-names.json，跳过名称映射');
}

// 加载预设数据
let presets = { banner: [], charcard: [] };
try {
  presets = JSON.parse(fs.readFileSync(path.join(__dirname, 'presets.json'), 'utf8'));
  console.log('已加载 %d 个 Banner 预设, %d 个 CharaCard 预设', presets.banner.length, presets.charcard.length);
} catch (e) {
  console.log('未找到 presets.json，跳过预设');
}

// 图层分类
const LAYER_CATEGORIES = [
  // === 肖像画布（512×840）===
  { name: '肖像背景',     min: 190002, max: 190999, canvas: 'portrait'  },
  { name: '肖像装饰框',   min: 191002, max: 191999, canvas: 'portrait'  },
  { name: '肖像装饰物',   min: 192002, max: 192999, canvas: 'portrait'  },
  // === 铭牌画布（2560×1440）===
  { name: '铭牌背衬',     min: 195002, max: 195999, canvas: 'nameplate' },
  { name: '铭牌底色',     min: 193002, max: 193999, canvas: 'nameplate' },
  { name: '铭牌花纹',     min: 194002, max: 194999, canvas: 'nameplate' },
  { name: '铭牌外框',     min: 198002, max: 198999, canvas: 'nameplate' },
  { name: '肖像外框',     min: 197002, max: 197999, canvas: 'nameplate' }, // 铭牌上的肖像外框
  { name: '铭牌顶部装饰', min: 196002, max: 196249, canvas: 'nameplate' },
  { name: '铭牌底部装饰', min: 196252, max: 196499, canvas: 'nameplate' },
  { name: '铭牌装饰物',   min: 199002, max: 199999, canvas: 'nameplate' },
  // 234xxx 是另一组装饰物，缩放0.75
  { name: '铭牌装饰物B',  min: 234401, max: 234499, canvas: 'nameplate', scale: 0.75 },
];
const INFO_ICON_EXTRA_SOURCES = [
  { category: '职业图标', relDir: path.join('ui', 'sprites', 'class') },
  { category: '装饰图标', relDir: path.join('ui', 'info-custom') },
  {
    category: '军衔图标',
    rules: [
      { folder: '083000', min: 83001, max: 83020 },
      { folder: '083000', min: 83051, max: 83070 },
      { folder: '083000', min: 83101, max: 83120 },
    ],
  },
];
const INFO_ICON_EXTRA_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg']);
const INFO_ICON_ACTIVITY_CATEGORY = '活动图标';
const INFO_ICON_ACTIVITY_FOLDER = '061000';
const CHARA_CARD_PLAY_STYLE_CSV_PATH = path.join(
  __dirname,
  'vendor',
  'ffxiv-datamining-mixed',
  'chs',
  'CharaCardPlayStyle.csv'
);
const INFO_SPECIAL_BG_CATEGORY = '国际服寓意背景';
const INFO_SPECIAL_MASK_CATEGORY = '国际服上色蒙版';
const INFO_SPECIAL_SYMBOL_CATEGORY = '国际服寓意物';
const INFO_SPECIAL_SYMBOL_INCLUDE_FILES = ['091000_hr1.png', '091001_hr1.png', '091002_hr1.png'];
const INFO_SPECIAL_CATEGORY_RULES = [
  {
    category: INFO_SPECIAL_BG_CATEGORY,
    rules: [{ folder: '090000', min: 90401, max: 90463 }],
  },
  {
    category: INFO_SPECIAL_MASK_CATEGORY,
    rules: [{ folder: '090000', min: 90200, max: 90263 }],
  },
  {
    category: INFO_SPECIAL_SYMBOL_CATEGORY,
    rules: [
      {
        folder: '091000',
        min: 91000,
        max: 91999,
        skipIdMod1000Le: 2,
        includeFiles: INFO_SPECIAL_SYMBOL_INCLUDE_FILES,
      },
      { folder: '092000', min: 92000, max: 92999, skipIdMod1000Le: 2 },
      { folder: '093000', min: 93000, max: 93999, skipIdMod1000Le: 2 },
      { folder: '094000', min: 94000, max: 94999, skipIdMod1000Le: 2 },
    ],
  },
];

function normalizePriorityIdsFromRules(rules) {
  const ids = [];
  const seen = new Set();
  const list = Array.isArray(rules) ? rules : [];
  for (const rule of list) {
    if (!rule || !Array.isArray(rule.includeFiles)) continue;
    for (const rawName of rule.includeFiles) {
      const parsed = parseIconNumericIdFromFile(rawName);
      if (!parsed) continue;
      if (seen.has(parsed.numStr)) continue;
      seen.add(parsed.numStr);
      ids.push(parsed.numStr);
    }
  }
  return ids;
}

function reorderEntriesByPriorityIds(entries, priorityIds) {
  const list = Array.isArray(entries) ? entries : [];
  const ids = Array.isArray(priorityIds) ? priorityIds : [];
  if (!list.length || !ids.length) return list;
  const idSet = new Set(ids);
  const byId = new Map();
  const rest = [];
  for (const item of list) {
    const id = item && item.id != null ? String(item.id) : '';
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, item);
    if (!idSet.has(id)) rest.push(item);
  }
  const front = [];
  const frontSeen = new Set();
  for (const id of ids) {
    if (frontSeen.has(id)) continue;
    frontSeen.add(id);
    const item = byId.get(id);
    if (item) front.push(item);
  }
  return [...front, ...rest];
}

function scanInfoIconExtraFiles(relDir) {
  const absDir = path.join(__dirname, relDir);
  const out = [];
  let files = [];
  try {
    files = fs.readdirSync(absDir);
  } catch (_) {
    return out;
  }

  for (const file of files) {
    const full = path.join(absDir, file);
    let st;
    try {
      st = fs.statSync(full);
    } catch (_) {
      continue;
    }
    if (!st.isFile()) continue;
    const ext = path.extname(file).toLowerCase();
    if (!INFO_ICON_EXTRA_EXTS.has(ext)) continue;

    const stem = file.slice(0, file.length - ext.length);
    out.push({
      id: file,
      file,
      // 相对路径（前端会按 appPath('/ui/sprites/class/...') 访问）
      path: `${relDir.replace(/\\/g, '/')}/${encodeURIComponent(file)}`,
      name: stem || file,
    });
  }

  out.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hans-CN'));
  return out;
}

function parseIconNumericIdFromFile(file) {
  const numStr = String(file || '').split('_')[0];
  if (!/^\d{6}$/.test(numStr)) return null;
  const num = parseInt(numStr, 10);
  if (!Number.isFinite(num)) return null;
  return { numStr, num };
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === ',') {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function readCharaCardPlayStyleRows() {
  if (!fs.existsSync(CHARA_CARD_PLAY_STYLE_CSV_PATH)) return [];
  let raw;
  try {
    raw = fs.readFileSync(CHARA_CARD_PLAY_STYLE_CSV_PATH, 'utf8');
  } catch (_) {
    return [];
  }
  const lines = String(raw || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(line => String(line || '').trim())
    .filter(Boolean);
  if (!lines.length) return [];
  let schemaIdx = lines.findIndex(line => line.startsWith('int32,'));
  if (schemaIdx < 0) schemaIdx = 2;
  const out = [];
  for (let i = schemaIdx + 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < 4) continue;
    const key = Number.parseInt(cols[0], 10);
    const image = Number.parseInt(cols[1], 10);
    if (!Number.isFinite(key) || key < 0) continue;
    if (!Number.isFinite(image) || image <= 0) continue;
    const name = String(cols[3] || '').trim();
    out.push({ key, image, name });
  }
  return out;
}

function buildInfoActivityIconFilesFromPlayStyleCsv() {
  const rows = readCharaCardPlayStyleRows();
  if (!rows.length) return [];
  const folderPath = path.join(ICON_ROOT, INFO_ICON_ACTIVITY_FOLDER);
  let existingFiles = [];
  try {
    existingFiles = fs.readdirSync(folderPath);
  } catch (_) {
    return [];
  }
  const fileSet = new Set(
    existingFiles
      .filter(file => /\.png$/i.test(file))
      .map(file => String(file || '').trim().toLowerCase())
  );
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const num = Math.trunc(Number(row.image));
    if (!Number.isFinite(num) || num <= 0) continue;
    const id = String(num).padStart(6, '0');
    if (!/^\d{6}$/.test(id)) continue;
    const file = `${id}_hr1.png`;
    if (!fileSet.has(file.toLowerCase())) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const displayName = String(row.name || '').trim() || idNames[num] || id;
    out.push({
      id,
      file,
      path: `${REL_UI_ICON}/${INFO_ICON_ACTIVITY_FOLDER}/${file}`.replace(/\\/g, '/'),
      name: displayName,
    });
  }
  return out;
}

function injectInfoIconExtraCategory(data) {
  const source = data && typeof data === 'object' ? data : { portrait: {}, nameplate: {} };
  const portrait = source.portrait && typeof source.portrait === 'object' ? source.portrait : {};
  const nameplateSrc = source.nameplate && typeof source.nameplate === 'object' ? source.nameplate : {};
  const nameplate = { ...nameplateSrc };
  for (const extra of INFO_ICON_EXTRA_SOURCES) {
    if (!extra || !extra.category) continue;
    if (Array.isArray(extra.rules) && extra.rules.length > 0) {
      const scanned = scanInfoSpecialFilesByRules(extra.rules);
      nameplate[extra.category] =
        scanned.length > 0 ? scanned : buildVirtualIconFilesByRules(extra.rules);
      continue;
    }
    if (!extra.relDir) continue;
    nameplate[extra.category] = scanInfoIconExtraFiles(extra.relDir);
  }
  nameplate[INFO_ICON_ACTIVITY_CATEGORY] = buildInfoActivityIconFilesFromPlayStyleCsv();
  return { portrait, nameplate };
}

function buildVirtualIconFilesByRules(rules) {
  const out = [];
  const seen = new Set();
  const list = Array.isArray(rules) ? rules : [];
  const pushEntry = (folder, file, num) => {
    const key = `${folder}/${file}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const id = String(num).padStart(6, '0');
    out.push({
      id,
      file,
      path: `${REL_UI_ICON}/${folder}/${file}`.replace(/\\/g, '/'),
      name: idNames[num] || null,
    });
  };

  for (const rule of list) {
    if (!rule || !rule.folder) continue;
    const folder = String(rule.folder);
    if (!/^\d{6}$/.test(folder)) continue;
    const min = Number(rule.min);
    const max = Number(rule.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) continue;
    for (let num = Math.trunc(min); num <= Math.trunc(max); num += 1) {
      if (!Number.isFinite(num) || num < 0 || num > 999999) continue;
      if (rule.skipIdMod1000Le != null) {
        const mod = num % 1000;
        if (mod <= Number(rule.skipIdMod1000Le)) continue;
      }
      const id = String(num).padStart(6, '0');
      pushEntry(folder, `${id}_hr1.png`, num);
    }
    if (Array.isArray(rule.includeFiles)) {
      for (const rawName of rule.includeFiles) {
        const file = String(rawName || '').trim();
        if (!file) continue;
        const parsed = parseIconNumericIdFromFile(file);
        if (!parsed) continue;
        pushEntry(folder, file, parsed.num);
      }
    }
  }

  out.sort((a, b) => Number(a.id) - Number(b.id));
  return reorderEntriesByPriorityIds(out, normalizePriorityIdsFromRules(rules));
}

function scanInfoSpecialFilesByRules(rules) {
  const out = [];
  const list = Array.isArray(rules) ? rules : [];
  for (const rule of list) {
    if (!rule || !rule.folder) continue;
    const folder = String(rule.folder);
    if (!/^\d{6}$/.test(folder)) continue;
    const includeFileSet = Array.isArray(rule.includeFiles)
      ? new Set(rule.includeFiles.map(name => String(name || '').trim().toLowerCase()).filter(Boolean))
      : null;
    const folderPath = path.join(ICON_ROOT, folder);
    let files = [];
    try {
      files = fs.readdirSync(folderPath).filter(f => /\.png$/i.test(f));
    } catch (_) {
      continue;
    }
    for (const file of files) {
      const parsed = parseIconNumericIdFromFile(file);
      if (!parsed) continue;
      const { numStr, num } = parsed;
      if (num < Number(rule.min) || num > Number(rule.max)) continue;
      const normalizedFile = String(file || '').trim().toLowerCase();
      const forceInclude = !!(includeFileSet && includeFileSet.has(normalizedFile));
      if (rule.skipIdMod1000Le != null) {
        const mod = num % 1000;
        if (!forceInclude && mod <= Number(rule.skipIdMod1000Le)) continue;
      }
      out.push({
        id: numStr,
        file,
        path: `${REL_UI_ICON}/${folder}/${file}`.replace(/\\/g, '/'),
        name: idNames[num] || null,
      });
    }
  }
  out.sort((a, b) => Number(a.id) - Number(b.id));
  return reorderEntriesByPriorityIds(out, normalizePriorityIdsFromRules(rules));
}

function injectInfoSpecialCategories(data) {
  const source = data && typeof data === 'object' ? data : { portrait: {}, nameplate: {} };
  const portrait = source.portrait && typeof source.portrait === 'object' ? source.portrait : {};
  const nameplateSrc = source.nameplate && typeof source.nameplate === 'object' ? source.nameplate : {};
  const nameplate = { ...nameplateSrc };
  for (const def of INFO_SPECIAL_CATEGORY_RULES) {
    if (!def || !def.category) continue;
    const priorityIds = normalizePriorityIdsFromRules(def.rules);
    const scanned = scanInfoSpecialFilesByRules(def.rules);
    if (scanned.length > 0) {
      nameplate[def.category] = scanned;
      continue;
    }
    if (Array.isArray(nameplate[def.category])) {
      nameplate[def.category] = reorderEntriesByPriorityIds(
        nameplate[def.category],
        priorityIds
      );
      continue;
    }
    if (def.category === INFO_SPECIAL_SYMBOL_CATEGORY) {
      const fallbackVirtual = buildVirtualIconFilesByRules(def.rules);
      if (fallbackVirtual.length > 0) {
        nameplate[def.category] = reorderEntriesByPriorityIds(
          fallbackVirtual,
          priorityIds
        );
        continue;
      }
    }
    if (!Array.isArray(nameplate[def.category])) {
      nameplate[def.category] = [];
    }
  }
  return { portrait, nameplate };
}

function scanFiles() {
  const portrait  = {};
  const nameplate = {};
  LAYER_CATEGORIES.filter(c => c.canvas === 'portrait').forEach(c  => { portrait[c.name]  = []; });
  LAYER_CATEGORIES.filter(c => c.canvas === 'nameplate').forEach(c => { nameplate[c.name] = []; });

  let folders;
  try {
    folders = fs.readdirSync(ICON_ROOT).filter(f => /^\d{6}$/.test(f));
  } catch (e) {
    return { portrait, nameplate };
  }

  for (const folder of folders) {
    const folderPath = path.join(ICON_ROOT, folder);
    let files;
    try {
      files = fs.readdirSync(folderPath).filter(f => f.endsWith('.png'));
    } catch (e) { continue; }

    for (const file of files) {
      const numStr = file.split('_')[0];
      const num = parseInt(numStr, 10);
      if (isNaN(num)) continue;

      for (const cat of LAYER_CATEGORIES) {
        if (num < cat.min || num > cat.max) continue;
        if (cat.skipIdMod1000Le != null) {
          const mod = num % 1000;
          if (mod <= cat.skipIdMod1000Le) continue;
        }
        {
          const entry = {
            id: numStr,
            file,
            path: `${REL_UI_ICON}/${folder}/${file}`.replace(/\\/g, '/'),
            name: idNames[num] || null, // 中文名称（无则为 null）
          };
          if (cat.canvas === 'portrait') {
            portrait[cat.name].push(entry);
          } else {
            nameplate[cat.name].push(entry);
          }
          break;
        }
      }
    }
  }

  const sortArr = arr => arr.sort((a, b) => parseInt(a.id) - parseInt(b.id));
  Object.keys(portrait).forEach(k  => { portrait[k]  = sortArr(portrait[k]);  });
  Object.keys(nameplate).forEach(k => { nameplate[k] = sortArr(nameplate[k]); });

  return { portrait, nameplate };
}

function filterFileDataByWhitelist(data, set) {
  if (!set || set.size === 0) return data;
  const pick = arr => arr.filter(e => set.has(parseInt(e.id, 10)));
  const out = { portrait: {}, nameplate: {} };
  Object.keys(data.portrait).forEach(k => {
    out.portrait[k] = pick(data.portrait[k]);
  });
  Object.keys(data.nameplate).forEach(k => {
    out.nameplate[k] = pick(data.nameplate[k]);
  });
  return out;
}

/** 无本地 ui/icon 时，可用本机扫出来的 JSON 缓存（见启动日志说明） */
function resolveFilesJsonPath() {
  const p = process.env.ICON_COMPOSER_FILES_JSON;
  if (!p) return path.join(__dirname, 'api-files-cache.json');
  return path.isAbsolute(p) ? p : path.join(__dirname, p);
}

let filesJsonCache = { key: '', mtimeMs: 0, data: null };

function loadPinnedFilesApiData() {
  const jsonPath = resolveFilesJsonPath();
  if (!fs.existsSync(jsonPath)) {
    filesJsonCache = { key: '', mtimeMs: 0, data: null };
    return null;
  }
  try {
    const mtimeMs = fs.statSync(jsonPath).mtimeMs;
    if (filesJsonCache.key === jsonPath && filesJsonCache.mtimeMs === mtimeMs) {
      return filesJsonCache.data;
    }
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (!raw || typeof raw !== 'object' || !raw.portrait || !raw.nameplate) {
      console.warn('[icon-composer] api-files 缓存缺少 portrait/nameplate 字段:', jsonPath);
      return null;
    }
    filesJsonCache = {
      key: jsonPath,
      mtimeMs,
      data: { portrait: raw.portrait, nameplate: raw.nameplate },
    };
    return filesJsonCache.data;
  } catch (e) {
    console.warn('[icon-composer] 读取 api-files 缓存失败 (%s): %s', jsonPath, e.message);
    return null;
  }
}

/** 默认走本机 /img（来自 ICON_ROOT）；可用 ICON_COMPOSER_IMG_BASE 覆盖为自建图床/CDN */
const DEFAULT_IMG_BASE = '/img';

function resolveImgBase() {
  const v = process.env.ICON_COMPOSER_IMG_BASE;
  let out;
  if (v && String(v).trim()) out = String(v).trim().replace(/\/$/, '');
  else out = DEFAULT_IMG_BASE;
  if (ICON_COMPOSER_BASE && out.startsWith('/') && !out.startsWith('//')) {
    return ICON_COMPOSER_BASE + out;
  }
  return out;
}

function clampPreviewMaxEdge(n) {
  const x = parseInt(String(n), 10);
  if (!Number.isFinite(x) || x < 1) return 640;
  return Math.min(2048, Math.max(128, Math.round(x)));
}

/** 本地存在六位数字素材目录时，可提供 /img-preview 供浏览器画布用缩略体积加载 */
function hasLocalIconFolders() {
  try {
    if (!fs.existsSync(ICON_ROOT)) return false;
    const st = fs.statSync(ICON_ROOT);
    if (!st.isDirectory()) return false;
    const folders = fs.readdirSync(ICON_ROOT).filter(f => /^\d{6}$/.test(f));
    return folders.length > 0;
  } catch (e) {
    return false;
  }
}

function resolvePreviewImgMeta() {
  // 侧栏缩略图实际展示尺寸很小，默认 640 会让手机解码压力过高。
  const maxEdge = clampPreviewMaxEdge(process.env.ICON_COMPOSER_PREVIEW_MAX_EDGE || 256);
  if (!hasLocalIconFolders()) return { maxEdge, base: null };
  return { maxEdge, base: `/img-preview/${maxEdge}` };
}

/** 仅识别相对仓库根的 `ui/icon/…`；返回相对 ICON_ROOT 的文件系统路径，否则 null */
function relPathInsideIconMaterials(raw) {
  let s = String(raw || '').trim().replace(/^[/\\]+/, '').replace(/\\/g, '/');
  if (!s || s.includes('..')) return null;
  const prefix = `${REL_UI_ICON}/`;
  if (s.length < prefix.length || s.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) {
    return null;
  }
  const inner = s.slice(prefix.length);
  if (!inner || inner.includes('..')) return null;
  return inner.replace(/\//g, path.sep);
}

function pathUnderIconRoot(relUrlPath) {
  const rel = relPathInsideIconMaterials(relUrlPath);
  if (!rel) return null;
  const full = path.resolve(path.join(ICON_ROOT, rel));
  const root = path.resolve(ICON_ROOT);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

function nearestDownscaleRgba(src, sw, sh, dw, dh) {
  const dst = new Uint8Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor((y + 0.5) * sh / dh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x + 0.5) * sw / dw));
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
 * 把单图层 PNG 放到透明全画布上，输出固定尺寸（默认 2560x1440）PNG。
 * 这样每张导出图本身就包含坐标摆放结果。
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

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.json': 'application/json',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = decodeURIComponent(parsedUrl.pathname);
  if (ICON_COMPOSER_BASE) {
    if (pathname === ICON_COMPOSER_BASE || pathname === ICON_COMPOSER_BASE + '/') {
      pathname = '/';
    } else if (pathname.startsWith(ICON_COMPOSER_BASE + '/')) {
      pathname = pathname.slice(ICON_COMPOSER_BASE.length);
    }
  }
  metrics.requestsTotal += 1;
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (pathname === '/api/metrics' && req.method === 'GET') {
    if (!metricsAuthorized(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }
    const uptimeMs = Date.now() - metrics.startTime;
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(
      JSON.stringify({
        uptimeMs,
        requestsTotal: metrics.requestsTotal,
        imgHits: metrics.imgHits,
        img404: metrics.img404,
        apiFiles: metrics.apiFiles,
        apiPresets: metrics.apiPresets,
        apiExport: metrics.apiExport,
        staticOther: metrics.staticOther,
      })
    );
    return;
  }

  if (pathname === '/api/files') {
    metrics.apiFiles += 1;
    let data = loadPinnedFilesApiData();
    if (!data) data = scanFiles();
    const csvWhitelist = getCsvWhitelistSync();
    if (csvWhitelist && csvWhitelist.size > 0) {
      data = filterFileDataByWhitelist(data, csvWhitelist);
    }
    data = injectInfoIconExtraCategory(data);
    data = injectInfoSpecialCategories(data);
    const prevM = resolvePreviewImgMeta();
    const payload = {
      portrait: data.portrait,
      nameplate: data.nameplate,
      _meta: {
        imgBase: resolveImgBase(),
        previewImgBase: prevM.base ? ICON_COMPOSER_BASE + prevM.base : null,
        previewMaxEdge: prevM.base ? prevM.maxEdge : null,
      },
    };
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': CACHE_API,
    });
    res.end(JSON.stringify(payload));
    return;
  }

  if (pathname === '/api/presets') {
    metrics.apiPresets += 1;
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': CACHE_API,
    });
    res.end(JSON.stringify(presets));
    return;
  }

  // PSD 导出 API
  if (pathname === '/api/export-psd' && req.method === 'POST') {
    metrics.apiExport += 1;
    let body = [];
    req.on('data', chunk => { body.push(chunk); });
    req.on('end', () => {
      try {
        const rawBody = Buffer.concat(body).toString('utf8');
        const { layers, canvasWidth, canvasHeight } = JSON.parse(rawBody);
        if (!Array.isArray(layers) || layers.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No layers provided' }));
          return;
        }

        // 前端发来 PNG base64，服务端解码后传给 PSD 生成器
        const psdLayers = layers.map(ly => {
          const b64 = String(ly.rgbaData).replace(/^data:image\/\w+;base64,/, '');
          const pngBuf = Buffer.from(b64, 'base64');
          return {
            name: ly.name || 'Layer',
            x: ly.x,
            y: ly.y,
            width: ly.width,
            height: ly.height,
            rgbaData: pngBuf
          };
        });

        const psdBuffer = createLayeredPSD(psdLayers, canvasWidth, canvasHeight);

        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="composite_${Date.now()}.psd"`,
          'Content-Length': psdBuffer.length
        });
        res.end(psdBuffer);
      } catch (e) {
        console.error('PSD export error:', e);
        console.error('Stack:', e.stack);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message, stack: e.stack }));
      }
    });
    return;
  }

  // JSX 脚本导出
  if (pathname === '/api/export-psd-jsx' && req.method === 'POST') {
    metrics.apiExport += 1;
    // 扩大限制：2560x1440 RGBA ≈ 14.8MB
    let body = [];
    let size = 0;
    req.on('data', chunk => {
      body.push(chunk);
      size += chunk.length;
    });
    req.on('end', () => {
      try {
        const rawBody = Buffer.concat(body).toString('utf8');
        const { layers, canvasWidth, canvasHeight } = JSON.parse(rawBody);
        if (!Array.isArray(layers) || layers.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No layers provided' }));
          return;
        }

        const os = require('os');
        // 默认导出目录：文档/ffxivportable
        const defaultExportDir = path.join(os.homedir(), 'Documents', 'ffxivportable');
        const desktopDir = EXPORT_ROOT || defaultExportDir;
        const exportId = Date.now();
        const exportDir = path.join(desktopDir, `icon-composer-${exportId}`);

          // 解码并保存所有图层 PNG 到导出目录（纯 ASCII 文件名）
        fs.mkdirSync(exportDir, { recursive: true });
        const pngPaths = [];
        for (let i = 0; i < layers.length; i++) {
          const ly = layers[i];
          // 支持 data:image/png;base64,XXXX 格式
          const b64 = ly.rgbaData.replace(/^data:image\/\w+;base64,/, '');
          const pngBuf = Buffer.from(b64, 'base64');
          // 纯 ASCII 文件名，避免 ExtendScript 中文路径问题
          const asciiName = 'L' + String(i).padStart(3, '0') + '.png';
          const pngPath = path.join(exportDir, asciiName);
          fs.writeFileSync(pngPath, pngBuf);
          pngPaths.push({
            name: ly.name || 'Layer',
            x: ly.x,
            y: ly.y,
            pngPath: pngPath.replace(/\\/g, '/'),
            opacity: ly.opacity
          });
        }

        const jsxScript = generateJSXScript(
          pngPaths,
          canvasWidth,
          canvasHeight,
          `composite_${exportId}.psd`,
          exportDir
        );

        res.writeHead(200, {
          'Content-Type': 'application/x-javascript',
          'Content-Disposition': `attachment; filename="composite_${Date.now()}.jsx"`,
          'Content-Length': Buffer.byteLength(jsxScript, 'utf8')
        });
        res.end(jsxScript);
      } catch (e) {
        console.error('JSX export error:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // 分层 ZIP：每层导出为全画布 PNG（默认 2560x1440）+ 坐标清单
  if (pathname === '/api/export-layered-zip' && req.method === 'POST') {
    metrics.apiExport += 1;
    let body = [];
    let size = 0;
    req.on('data', chunk => {
      body.push(chunk);
      size += chunk.length;
    });
    req.on('end', () => {
      try {
        const rawBody = Buffer.concat(body).toString('utf8');
        const { layers, canvasWidth, canvasHeight, composerConfigFull } = JSON.parse(rawBody);
        if (!Array.isArray(layers) || layers.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No layers provided' }));
          return;
        }

        const fixedCanvasWidth = parseCanvasSize(canvasWidth, 2560);
        const fixedCanvasHeight = parseCanvasSize(canvasHeight, 1440);

        const manifest = {
          coordinateSpace: 'fullCanvasTopLeft',
          canvasWidth: fixedCanvasWidth,
          canvasHeight: fixedCanvasHeight,
          layers: layers.map((ly, i) => ({
            file: `L${String(i).padStart(3, '0')}.png`,
            name: ly.name || 'Layer',
            x: parseLayerCoord(ly.x),
            y: parseLayerCoord(ly.y),
            width: Math.round(Number(ly.width) || 0),
            height: Math.round(Number(ly.height) || 0),
          })),
        };

        /** 与 ZIP 内 L000.png 等对应的画布坐标说明（供外部工具对齐 PNG，不是网页「从JSON导入」格式） */
        const zipfile = new yazl.ZipFile();
        const manifestJson = JSON.stringify(manifest, null, 2);
        zipfile.addBuffer(Buffer.from(manifestJson, 'utf8'), 'layers.json');
        zipfile.addBuffer(Buffer.from(manifestJson, 'utf8'), 'manifest.json');

        /** 与「导出 JSON」相同结构，用于网页恢复图层/预设/主题等；请用此文件做「从JSON导入」 */
        if (
          composerConfigFull &&
          typeof composerConfigFull === 'object' &&
          Number(composerConfigFull.version) === 1
        ) {
          zipfile.addBuffer(
            Buffer.from(JSON.stringify(composerConfigFull, null, 2), 'utf8'),
            'composer-config.json'
          );
        }
        for (let i = 0; i < layers.length; i++) {
          const ly = layers[i];
          const entryName = `L${String(i).padStart(3, '0')}.png`;
          const pngBuf = placeLayerOnFullCanvas(
            ly,
            fixedCanvasWidth,
            fixedCanvasHeight
          );
          zipfile.addBuffer(pngBuf, entryName);
        }

        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="layered_export_${Date.now()}.zip"`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        zipfile.outputStream.on('error', err => {
          console.error('[export-layered-zip] stream', err);
        });
        zipfile.outputStream.pipe(res);
        zipfile.end();
      } catch (e) {
        console.error('[export-layered-zip]', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (pathname.startsWith('/img/')) {
    let relUrl = pathname.slice('/img/'.length).replace(/\\/g, '/');
    try {
      relUrl = decodeURIComponent(relUrl);
    } catch (_) {
      /* keep raw */
    }
    const relPath = relPathInsideIconMaterials(relUrl);
    if (!relPath) {
      metrics.img404 += 1;
      res.writeHead(404, { 'Cache-Control': 'no-store' });
      res.end('Not Found');
      return;
    }
    const filePath = path.join(ICON_ROOT, relPath);
    if (fs.existsSync(filePath)) {
      metrics.imgHits += 1;
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': CACHE_IMG,
        'X-Content-Type-Options': 'nosniff',
      });
      fs.createReadStream(filePath).pipe(res);
    } else {
      metrics.img404 += 1;
      res.writeHead(404, { 'Cache-Control': 'no-store' });
      res.end('Not Found');
    }
    return;
  }

  if (pathname.startsWith('/img-preview/')) {
    const rest = pathname.slice('/img-preview/'.length);
    const slash = rest.indexOf('/');
    if (slash <= 0) {
      metrics.img404 += 1;
      res.writeHead(404, { 'Cache-Control': 'no-store' });
      res.end('Not Found');
      return;
    }
    const maxEdge = clampPreviewMaxEdge(rest.slice(0, slash));
    const relUrl = rest.slice(slash + 1);
    if (!relUrl || !/\.png$/i.test(relUrl)) {
      metrics.img404 += 1;
      res.writeHead(404, { 'Cache-Control': 'no-store' });
      res.end('Not Found');
      return;
    }
    const filePath = pathUnderIconRoot(relUrl);
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      metrics.img404 += 1;
      res.writeHead(404, { 'Cache-Control': 'no-store' });
      res.end('Not Found');
      return;
    }
    try {
      const outBuf = buildPreviewPngBuffer(filePath, maxEdge);
      metrics.imgHits += 1;
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': CACHE_IMG,
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(outBuf);
    } catch (e) {
      console.error('[img-preview]', filePath, e.message);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Preview error');
    }
    return;
  }

  let filePath;
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(__dirname, 'index.html');
  } else {
    filePath = path.join(__dirname, pathname);
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    metrics.staticOther += 1;
    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'text/plain' };
    if (ext === '.html') {
      headers['Cache-Control'] = CACHE_HTML;
    } else if (ext === '.js' || ext === '.css') {
      headers['Cache-Control'] = 'public, max-age=3600';
    } else {
      headers['Cache-Control'] = 'public, max-age=600';
    }
    if (ext === '.html' && path.basename(filePath) === 'index.html') {
      const body = fs
        .readFileSync(filePath, 'utf8')
        .replace(/@@ICON_APP_BASE@@/g, ICON_COMPOSER_BASE.replace(/"/g, ''));
      res.writeHead(200, headers);
      res.end(body, 'utf8');
    } else {
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
    }
  } else {
    res.writeHead(404, { 'Cache-Control': 'no-store' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  const w = getCsvWhitelistSync();
  if (w && w.size > 0) {
    console.log(
      'CSV 图标白名单已就绪: %d 个编号（每次请求会重新读取 json/vendor，改文件后无需重启）',
      w.size
    );
  } else {
    console.log(
      '未加载 CSV 白名单：将列出素材目录内全部 PNG（可放置 csv-valid-icon-ids.json 或 vendor/ffxiv-datamining-chs）'
    );
  }
  console.log(`铭牌生成器已启动: http://localhost:${PORT}`);
  if (ICON_COMPOSER_BASE) {
    console.log('应用子路径: %s', ICON_COMPOSER_BASE);
  }
  console.log(`素材目录: ${ICON_ROOT}`);
  const pinned = resolveFilesJsonPath();
  if (fs.existsSync(pinned)) {
    console.log(
      '已检测到 api-files 缓存: %s（将优先用于 /api/files 列表，无需在服务器上放整包 ui/icon）',
      pinned
    );
  }
  console.log(
    '图片基址 _meta.imgBase: %s（覆盖默认请设环境变量 ICON_COMPOSER_IMG_BASE）',
    resolveImgBase()
  );
  const pm = resolvePreviewImgMeta();
  if (pm.base) {
    console.log(
      '已启用侧栏缩略图: %s（长边 %d px，可调 ICON_COMPOSER_PREVIEW_MAX_EDGE；画布与导出仍用 _meta.imgBase 原图）',
      pm.base,
      pm.maxEdge
    );
  } else {
    console.log(
      '未启用 /img-preview（无本地六位数字素材目录时，缩略图与画布均走 _meta.imgBase）'
    );
  }
  try {
    if (!fs.existsSync(ICON_ROOT)) {
      const hint = fs.existsSync(pinned)
        ? '当前有 api-files 缓存，列表可不依赖本地目录；若无缓存仍为空，请配置 ICON_COMPOSER_MATERIALS 或在有解包的机器上生成 api-files-cache.json 后上传到服务器。'
        : '请设置 ICON_COMPOSER_MATERIALS 或 --materials；或放置 api-files-cache.json（可用有素材的本机 curl /api/files 生成，去掉 _meta 字段）并设置 ICON_COMPOSER_IMG_BASE 指向图床。';
      console.warn('[警告] 素材目录不存在或不可访问。' + hint);
    }
  } catch (e) {
    console.warn('[警告] 无法检查素材目录:', e.message);
  }
  if (METRICS_SECRET) {
    console.log(`指标: GET /api/metrics?secret=*** (已设置 METRICS_SECRET)`);
  } else {
    console.log('指标: GET /api/metrics（未设置 METRICS_SECRET 时对公网暴露有风险，见代码顶部说明）');
  }
  console.log('/img 响应已带 Cache-Control 长期缓存，部署在 CDN 后请在控制台开启「缓存一切」或匹配 /img/*');
});
