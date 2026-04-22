const fs = require('fs');
const path = require('path');

function resolveStaticFilePath(rawPathname, projectRoot) {
  if (!rawPathname) return null;
  let decoded = String(rawPathname);
  try {
    decoded = decodeURIComponent(decoded);
  } catch (_) {
    /* keep raw */
  }
  const normalized = path.posix.normalize(decoded);
  if (normalized.includes('\0')) return null;
  const rel = normalized.replace(/^\/+/, '');
  const full = path.resolve(projectRoot, rel);
  if (full === projectRoot || full.startsWith(projectRoot + path.sep)) {
    return full;
  }
  return null;
}

function handleStaticRoute(req, res, pathname, ctx) {
  const { metrics, clientRoot, projectRoot, mime, cacheHtml, iconComposerBase } = ctx;
  let filePath;
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(clientRoot, 'index.html');
  } else {
    filePath = resolveStaticFilePath(pathname, projectRoot);
  }

  if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    metrics.staticOther += 1;
    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'Content-Type': mime[ext] || 'text/plain' };
    if (ext === '.html') {
      headers['Cache-Control'] = cacheHtml;
    } else if (ext === '.js' || ext === '.css') {
      headers['Cache-Control'] = 'public, max-age=3600';
    } else {
      headers['Cache-Control'] = 'public, max-age=600';
    }
    if (ext === '.html' && path.basename(filePath) === 'index.html') {
      const body = fs
        .readFileSync(filePath, 'utf8')
        .replace(/@@ICON_APP_BASE@@/g, iconComposerBase.replace(/"/g, ''));
      res.writeHead(200, headers);
      res.end(body, 'utf8');
      return true;
    }
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
    return true;
  }

  res.writeHead(404, { 'Cache-Control': 'no-store' });
  res.end('Not Found');
  return true;
}

module.exports = {
  handleStaticRoute,
};
