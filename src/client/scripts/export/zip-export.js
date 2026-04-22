async function exportLayeredZip() {
  if (!isWebRuntime()) return;
  const statusBar = document.getElementById('statusBar');
  try {
    statusBar.textContent = '?????? ZIP?';
    let layers = await collectLayeredExportData({ mergeInfoLayers: true });
    if (layers.length === 0) {
      alert('??????????');
      return;
    }

    const scaleFactor = resolveExportScaleFactor();
    if (scaleFactor > 1) {
      statusBar.textContent = '??????? 200%?';
      layers = await scaleLayeredExportLayers(layers, scaleFactor);
    }

    const resp = await fetch(appPath('/api/export-layered-zip'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        layers,
        canvasWidth: Math.round(CANVAS_FULL.w * scaleFactor),
        canvasHeight: Math.round(CANVAS_FULL.h * scaleFactor),
        composerConfigFull: collectComposerConfigObjectForTransfer({ includeCustomPortrait: true }),
      })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || ('?????: ' + resp.status));
    }

    const blob = await resp.blob();
    const link = document.createElement('a');
    const scaleSuffix = buildExportScaleSuffix(scaleFactor);
    link.download = 'layered_export_' + Date.now() + scaleSuffix + '.zip';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (e) {
    console.error('[exportLayeredZip] failed:', e);
    alert('???? ZIP ???' + (e?.message || e));
  } finally {
    statusBar.textContent = '??';
  }
}

async function scaleLayeredExportLayers(layers, scaleFactor) {
  const scale = Number(scaleFactor);
  if (!Array.isArray(layers) || !layers.length || !Number.isFinite(scale) || scale <= 1) {
    return layers;
  }
  const out = [];
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') {
      out.push(layer);
      continue;
    }
    const x = Math.round((Number(layer.x) || 0) * scale);
    const y = Math.round((Number(layer.y) || 0) * scale);
    const rgbaData = typeof layer.rgbaData === 'string' ? layer.rgbaData : '';
    if (!rgbaData) {
      out.push({ ...layer, x, y });
      continue;
    }
    const scaled = await scalePngDataUrl(rgbaData, scale);
    out.push({
      ...layer,
      x,
      y,
      width: scaled.width,
      height: scaled.height,
      rgbaData: scaled.dataUrl,
    });
  }
  return out;
}

async function scalePngDataUrl(dataUrl, scaleFactor) {
  const img = await loadImageFromDataUrl(dataUrl);
  const srcW = Math.max(1, Number(img.naturalWidth) || Number(img.width) || 1);
  const srcH = Math.max(1, Number(img.naturalHeight) || Number(img.height) || 1);
  const w = Math.max(1, Math.round(srcW * scaleFactor));
  const h = Math.max(1, Math.round(srcH * scaleFactor));
  if (w === srcW && h === srcH) {
    return { width: w, height: h, dataUrl };
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('????????');
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return { width: w, height: h, dataUrl: canvas.toDataURL('image/png') };
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('????????'));
    img.src = dataUrl;
  });
}

// ??? base64 ??????????????
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}
