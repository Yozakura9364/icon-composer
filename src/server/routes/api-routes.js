const fs = require('fs');
const path = require('path');
const os = require('os');
const yazl = require('yazl');
const { createLayeredPSD } = require('../lib/psd-writer');
const { generateJSXScript } = require('../lib/jsx-writer');
const { getCsvWhitelistSync } = require('../lib/csv-whitelist');
const {
  parseCanvasSize,
  parseLayerCoord,
  placeLayerOnFullCanvas,
} = require('../services/layered-export');

function collectRequestBody(req, onDone) {
  const body = [];
  req.on('data', chunk => {
    body.push(chunk);
  });
  req.on('end', () => {
    onDone(Buffer.concat(body).toString('utf8'));
  });
}

function handleApiRoute(req, res, pathname, ctx) {
  const {
    metrics,
    metricsAuthorized,
    loadPinnedFilesApiData,
    scanFiles,
    filterFileDataByWhitelist,
    injectInfoIconExtraCategory,
    injectInfoSpecialCategories,
    resolvePreviewImgMeta,
    resolveImgBase,
    iconComposerBase,
    presets,
    cacheApi,
    exportRoot,
  } = ctx;

  if (pathname === '/api/metrics' && req.method === 'GET') {
    if (!metricsAuthorized(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return true;
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
    return true;
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
        previewImgBase: prevM.base ? iconComposerBase + prevM.base : null,
        previewMaxEdge: prevM.base ? prevM.maxEdge : null,
      },
    };
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': cacheApi,
    });
    res.end(JSON.stringify(payload));
    return true;
  }

  if (pathname === '/api/presets') {
    metrics.apiPresets += 1;
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': cacheApi,
    });
    res.end(JSON.stringify(presets));
    return true;
  }

  if (pathname === '/api/export-psd' && req.method === 'POST') {
    metrics.apiExport += 1;
    collectRequestBody(req, rawBody => {
      try {
        const { layers, canvasWidth, canvasHeight } = JSON.parse(rawBody);
        if (!Array.isArray(layers) || layers.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No layers provided' }));
          return;
        }
        const psdLayers = layers.map(ly => {
          const b64 = String(ly.rgbaData).replace(/^data:image\/\w+;base64,/, '');
          const pngBuf = Buffer.from(b64, 'base64');
          return {
            name: ly.name || 'Layer',
            x: ly.x,
            y: ly.y,
            width: ly.width,
            height: ly.height,
            rgbaData: pngBuf,
          };
        });
        const psdBuffer = createLayeredPSD(psdLayers, canvasWidth, canvasHeight);
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="composite_${Date.now()}.psd"`,
          'Content-Length': psdBuffer.length,
        });
        res.end(psdBuffer);
      } catch (e) {
        console.error('PSD export error:', e);
        console.error('Stack:', e.stack);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message, stack: e.stack }));
      }
    });
    return true;
  }

  if (pathname === '/api/export-psd-jsx' && req.method === 'POST') {
    metrics.apiExport += 1;
    collectRequestBody(req, rawBody => {
      try {
        const { layers, canvasWidth, canvasHeight } = JSON.parse(rawBody);
        if (!Array.isArray(layers) || layers.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No layers provided' }));
          return;
        }

        const defaultExportDir = path.join(os.homedir(), 'Documents', 'ffxivportable');
        const desktopDir = exportRoot || defaultExportDir;
        const exportId = Date.now();
        const exportDir = path.join(desktopDir, `icon-composer-${exportId}`);

        fs.mkdirSync(exportDir, { recursive: true });
        const pngPaths = [];
        for (let i = 0; i < layers.length; i++) {
          const ly = layers[i];
          const b64 = String(ly.rgbaData).replace(/^data:image\/\w+;base64,/, '');
          const pngBuf = Buffer.from(b64, 'base64');
          const asciiName = `L${String(i).padStart(3, '0')}.png`;
          const pngPath = path.join(exportDir, asciiName);
          fs.writeFileSync(pngPath, pngBuf);
          pngPaths.push({
            name: ly.name || 'Layer',
            x: ly.x,
            y: ly.y,
            pngPath: pngPath.replace(/\\/g, '/'),
            opacity: ly.opacity,
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
          'Content-Length': Buffer.byteLength(jsxScript, 'utf8'),
        });
        res.end(jsxScript);
      } catch (e) {
        console.error('JSX export error:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return true;
  }

  if (pathname === '/api/export-layered-zip' && req.method === 'POST') {
    metrics.apiExport += 1;
    collectRequestBody(req, rawBody => {
      try {
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

        const zipfile = new yazl.ZipFile();
        const manifestJson = JSON.stringify(manifest, null, 2);
        zipfile.addBuffer(Buffer.from(manifestJson, 'utf8'), 'layers.json');
        zipfile.addBuffer(Buffer.from(manifestJson, 'utf8'), 'manifest.json');

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
          const pngBuf = placeLayerOnFullCanvas(ly, fixedCanvasWidth, fixedCanvasHeight);
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
    return true;
  }

  return false;
}

module.exports = {
  handleApiRoute,
};
