const fs = require('fs');
const path = require('path');
const { clampPreviewMaxEdge, buildPreviewPngBuffer } = require('../services/preview-image');

function relPathInsideIconMaterials(raw, relUiIcon) {
  let s = String(raw || '')
    .trim()
    .replace(/^[/\\]+/, '')
    .replace(/\\/g, '/');
  if (!s || s.includes('..')) return null;
  const prefix = `${relUiIcon}/`;
  if (s.length < prefix.length || s.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) {
    return null;
  }
  const inner = s.slice(prefix.length);
  if (!inner || inner.includes('..')) return null;
  return inner.replace(/\//g, path.sep);
}

function pathUnderIconRoot(relUrlPath, iconRoot, relUiIcon) {
  const rel = relPathInsideIconMaterials(relUrlPath, relUiIcon);
  if (!rel) return null;
  const full = path.resolve(path.join(iconRoot, rel));
  const root = path.resolve(iconRoot);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

function handleImageRoute(req, res, pathname, ctx) {
  const { metrics, iconRoot, relUiIcon, mime, cacheImg } = ctx;

  if (pathname.startsWith('/img/')) {
    let relUrl = pathname.slice('/img/'.length).replace(/\\/g, '/');
    try {
      relUrl = decodeURIComponent(relUrl);
    } catch (_) {
      /* keep raw */
    }
    const relPath = relPathInsideIconMaterials(relUrl, relUiIcon);
    if (!relPath) {
      metrics.img404 += 1;
      res.writeHead(404, { 'Cache-Control': 'no-store' });
      res.end('Not Found');
      return true;
    }
    const filePath = path.join(iconRoot, relPath);
    if (fs.existsSync(filePath)) {
      metrics.imgHits += 1;
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': mime[ext] || 'application/octet-stream',
        'Cache-Control': cacheImg,
        'X-Content-Type-Options': 'nosniff',
      });
      fs.createReadStream(filePath).pipe(res);
    } else {
      metrics.img404 += 1;
      res.writeHead(404, { 'Cache-Control': 'no-store' });
      res.end('Not Found');
    }
    return true;
  }

  if (pathname.startsWith('/img-preview/')) {
    const rest = pathname.slice('/img-preview/'.length);
    const slash = rest.indexOf('/');
    if (slash <= 0) {
      metrics.img404 += 1;
      res.writeHead(404, { 'Cache-Control': 'no-store' });
      res.end('Not Found');
      return true;
    }

    const maxEdge = clampPreviewMaxEdge(rest.slice(0, slash));
    const relUrl = rest.slice(slash + 1);
    if (!relUrl || !/\.png$/i.test(relUrl)) {
      metrics.img404 += 1;
      res.writeHead(404, { 'Cache-Control': 'no-store' });
      res.end('Not Found');
      return true;
    }

    const filePath = pathUnderIconRoot(relUrl, iconRoot, relUiIcon);
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      metrics.img404 += 1;
      res.writeHead(404, { 'Cache-Control': 'no-store' });
      res.end('Not Found');
      return true;
    }

    try {
      const outBuf = buildPreviewPngBuffer(filePath, maxEdge);
      metrics.imgHits += 1;
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': cacheImg,
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(outBuf);
    } catch (e) {
      console.error('[img-preview]', filePath, e.message);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Preview error');
    }
    return true;
  }

  return false;
}

module.exports = {
  handleImageRoute,
};
