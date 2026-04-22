// ============================================================
// Export
// ============================================================
async function exportCanvas() {
  const scale = resolveExportScaleFactor();
  await exportCanvasScaledPng(scale, buildExportScaleSuffix(scale));
}

async function exportCanvas2x() {
  await exportCanvasScaledPng(2, '_2x');
}

async function exportCanvasJpg() {
  const scale = resolveExportScaleFactor();
  await exportCanvasWithSolidBgJpg('#ffffff', '_white' + buildExportScaleSuffix(scale), scale);
}

async function exportCanvasScaledPng(scaleFactor, suffixTag) {
  const canvas = document.getElementById('mainCanvas');
  layerRenderDepth++;
  scheduleLayerLoadingOverlay();
  try {
    await prefetchImgPaths(collectPathsForFullRender());
    await renderFull();
    const out = createScaledCanvasForExport(canvas, scaleFactor);
    triggerDownload(out, '_' + out.width + 'x' + out.height + suffixTag + '.png');
  } catch (e) {
    console.error('[exportCanvasScaledPng] failed:', e);
    alert('?? PNG ???' + (e?.message || e));
  } finally {
    layerRenderDepth--;
    if (layerRenderDepth === 0) hideLayerLoadingOverlay();
  }
}

function createScaledCanvasForExport(sourceCanvas, scaleFactor) {
  const src = sourceCanvas;
  const scale = Number(scaleFactor);
  if (!src || !Number.isFinite(scale) || scale <= 0) {
    throw new Error('???????');
  }
  const outWidth = Math.max(1, Math.round(src.width * scale));
  const outHeight = Math.max(1, Math.round(src.height * scale));
  if (outWidth === src.width && outHeight === src.height) return src;
  const out = document.createElement('canvas');
  out.width = outWidth;
  out.height = outHeight;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('????????');
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, outWidth, outHeight);
  return out;
}

async function exportCanvasWhiteJpg() {
  await exportCanvasWithSolidBgJpg('#ffffff', '_white', 1);
}

async function exportCanvasBlackJpg() {
  await exportCanvasWithSolidBgJpg('#000000', '_black', 1);
}

async function exportCanvasWithSolidBgJpg(bgColor, nameSuffix, scaleFactor = 1) {
  const canvas = document.getElementById('mainCanvas');
  layerRenderDepth++;
  scheduleLayerLoadingOverlay();
  try {
    await prefetchImgPaths(collectPathsForFullRender());
    await renderFull();
    const scaled = createScaledCanvasForExport(canvas, scaleFactor);
    const out = document.createElement('canvas');
    out.width = scaled.width;
    out.height = scaled.height;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('????????');
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(scaled, 0, 0);
    triggerDownload(out, '_' + out.width + 'x' + out.height + nameSuffix + '.jpg', 'image/jpeg', 0.92);
  } catch (e) {
    console.error('[exportCanvasWithSolidBgJpg] failed:', e);
    alert('?? JPG ???' + (e?.message || e));
  } finally {
    layerRenderDepth--;
    if (layerRenderDepth === 0) hideLayerLoadingOverlay();
  }
}

function triggerDownload(canvas, suffix, mimeType = 'image/png', quality) {
  const dataUrl =
    typeof quality === 'number'
      ? canvas.toDataURL(mimeType, quality)
      : canvas.toDataURL(mimeType);
  triggerDownloadDataUrl(dataUrl, suffix);
}

function triggerDownloadDataUrl(dataUrl, suffix) {
  const link = document.createElement('a');
  link.download = 'composite_' + Date.now() + suffix;
  link.href = dataUrl;
  link.click();
}

// ============================================================
// PSD export helpers use full composition from canvas-core
// ============================================================
