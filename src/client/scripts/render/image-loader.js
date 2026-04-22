const CDN = '/img';
let ICON_IMG_BASE = CDN;
/** 同源 /img-preview/... ；仅用于侧栏缩略图 src，不参与画布几何计算 */
let ICON_PREVIEW_BASE = null;

function isAbsoluteImgUrl(raw) {
  return /^(https?:)?\/\//i.test(raw) || /^data:/i.test(raw) || /^blob:/i.test(raw);
}

function isStaticAssetPath(p) {
  return /^ui\//i.test(p);
}

function isUiIconMaterialPath(p) {
  return /^ui\/icon\//i.test(String(p || ''));
}

function joinAssetBase(base, rel) {
  const b = String(base || '').replace(/\/$/, '');
  const r = String(rel || '').replace(/^\/+/, '');
  return b ? `${b}/${r}` : `/${r}`;
}

function iconImgSrcHd(relPath) {
  const raw = String(relPath || '').trim();
  if (!raw) return '';
  if (isAbsoluteImgUrl(raw)) return raw;
  if (raw.startsWith('/')) return appPath(raw);
  const p = raw.replace(/^\.\//, '').replace(/^\//, '');
  if (isUiIconMaterialPath(p)) return joinAssetBase(ICON_IMG_BASE || CDN, p);
  if (isStaticAssetPath(p)) return appPath('/' + p);
  return joinAssetBase(ICON_IMG_BASE || CDN, p);
}

function iconImgSrcPreview(relPath) {
  const raw = String(relPath || '').trim();
  if (!raw) return '';
  if (isAbsoluteImgUrl(raw)) return raw;
  if (raw.startsWith('/')) return appPath(raw);
  const p = raw.replace(/^\.\//, '').replace(/^\//, '');
  if (isUiIconMaterialPath(p)) {
    return ICON_PREVIEW_BASE ? joinAssetBase(ICON_PREVIEW_BASE, p) : iconImgSrcHd(p);
  }
  if (isStaticAssetPath(p)) return iconImgSrcHd(p);
  return ICON_PREVIEW_BASE ? joinAssetBase(ICON_PREVIEW_BASE, p) : iconImgSrcHd(p);
}

function loadImgHd(imgPath) {
  return new Promise(resolve => {
    if (imgCacheHd[imgPath]) { resolve(imgCacheHd[imgPath]); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgCacheHd[imgPath] = img;
      const finish = () => resolve(img);
      if (typeof img.decode === 'function') {
        img.decode().then(finish).catch(finish);
      } else {
        finish();
      }
    };
    img.onerror = () => resolve(null);
    img.src = iconImgSrcHd(imgPath);
  });
}

// ============================================================
// 画布变换（固定居中，可缩放，不可拖拽）
// ============================================================
