const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { createLayeredPSD } = require('./psd-writer');
const { generateJSXScript } = require('./jsx-writer');

// 支持命令行参数: --materials <path> --export <path>
const args = process.argv.slice(2);
let ICON_ROOT = 'C:\\Users\\13359\\Pictures\\ui\\icon';
let EXPORT_ROOT = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--materials' && args[i + 1]) ICON_ROOT = args[++i];
  if (args[i] === '--export'    && args[i + 1]) EXPORT_ROOT = args[++i];
}
const PORT = parseInt(process.env.ICON_COMPOSER_PORT || '3456', 10);

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
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (pathname === '/api/files') {
    const data = scanFiles();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
    return;
  }

  if (pathname === '/api/presets') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(presets));
    return;
  }

  // PSD 导出 API
  if (pathname === '/api/export-psd' && req.method === 'POST') {
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
          const b64 = ly.rgbaData;
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
        const desktopDir = EXPORT_ROOT || path.join(os.homedir(), 'Desktop');
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

        const jsxScript = generateJSXScript(pngPaths, canvasWidth, canvasHeight, `composite_${exportId}.psd`);

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
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404); res.end('Not Found');
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
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404); res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`图层组合器已启动: http://localhost:${PORT}`);
  console.log(`素材目录: ${ICON_ROOT}`);
});
