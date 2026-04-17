const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { createLayeredPSD } = require('./psd-writer');
const { generateJSXScript } = require('./jsx-writer');
const { getCsvWhitelistSync } = require('./csv-whitelist');

// 支持命令行参数: --materials <path> --export <path>
// 部署时可设环境变量 ICON_COMPOSER_MATERIALS / ICON_COMPOSER_EXPORT（命令行优先）
const args = process.argv.slice(2);
// 默认：仓库根目录下 ui/icon（与游戏解包 ui/icon 结构一致：若干六位数字子目录 + PNG）
let ICON_ROOT =
  process.env.ICON_COMPOSER_MATERIALS ||
  path.join(__dirname, 'ui', 'icon');
let EXPORT_ROOT = process.env.ICON_COMPOSER_EXPORT || null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--materials' && args[i + 1]) ICON_ROOT = args[++i];
  if (args[i] === '--export'    && args[i + 1]) EXPORT_ROOT = args[++i];
}
const PORT = parseInt(process.env.ICON_COMPOSER_PORT || '3456', 10);
/** 若设置，访问 /api/metrics 须在 query 带 ?secret= 值，避免流量数据被随意抓取 */
const METRICS_SECRET = process.env.METRICS_SECRET || '';

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
        if (num >= cat.min && num <= cat.max) {
          const entry = {
            id: numStr,
            file,
            path: path.join(folder, file).replace(/\\/g, '/'),
            name: idNames[num] || null   // 中文名称（无则为 null）
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

/** 仅保留 CSV 白名单中的图标（与图床/游戏表一致，避免列表里出现无图文件） */
function filterFileDataByWhitelist(data, set) {
  if (!set || set.size === 0) return data;
  const pick = arr =>
    arr.filter(e => set.has(parseInt(e.id, 10)));
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

/** 默认走 Cloudflare Worker 图床；若要改回由本机 /img 提供图片，设 ICON_COMPOSER_IMG_BASE=/img */
const DEFAULT_IMG_BASE = 'https://portable-icon.2513985996.workers.dev';

function resolveImgBase() {
  const v = process.env.ICON_COMPOSER_IMG_BASE;
  if (v && String(v).trim()) return String(v).trim().replace(/\/$/, '');
  return DEFAULT_IMG_BASE;
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
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsedUrl.pathname);
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
    const payload = {
      portrait: data.portrait,
      nameplate: data.nameplate,
      _meta: { imgBase: resolveImgBase() },
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

  if (pathname.startsWith('/img/')) {
    const relPath = pathname.slice(5).replace(/\//g, path.sep);
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
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
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
