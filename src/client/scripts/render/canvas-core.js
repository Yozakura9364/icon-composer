const LAYER_LOADING_OVERLAY_DELAY_MS = 420;

function isPrimaryLoadingOverlayVisible() {
  const el = document.getElementById('loadingOverlay');
  return !!el && !el.classList.contains('hidden');
}

function scheduleLayerLoadingOverlay() {
  if (layerLoadingShowTimer) return;
  // 首屏初始化阶段只保留 loadingOverlay，避免双遮罩闪烁。
  if (isPrimaryLoadingOverlayVisible()) return;
  layerLoadingShowTimer = setTimeout(() => {
    layerLoadingShowTimer = null;
    if (layerRenderDepth > 0 && !isPrimaryLoadingOverlayVisible()) {
      const el = document.getElementById('layerLoadingOverlay');
      if (el) {
        el.classList.add('visible');
        el.setAttribute('aria-hidden', 'false');
      }
    }
  }, LAYER_LOADING_OVERLAY_DELAY_MS);
}

function cancelLayerLoadingOverlayTimer() {
  if (layerLoadingShowTimer) {
    clearTimeout(layerLoadingShowTimer);
    layerLoadingShowTimer = null;
  }
}

function hideLayerLoadingOverlay() {
  cancelLayerLoadingOverlayTimer();
  const el = document.getElementById('layerLoadingOverlay');
  if (el) {
    el.classList.remove('visible');
    el.setAttribute('aria-hidden', 'true');
  }
}

async function render() {
  const serial = ++renderRequestSerial;
  layerRenderDepth++;
  scheduleLayerLoadingOverlay();
  try {
    await renderFull({ serial });
    if (serial !== renderRequestSerial) return;
    updateStatus();
  } finally {
    layerRenderDepth--;
    if (layerRenderDepth === 0) {
      hideLayerLoadingOverlay();
    }
  }
}

function updateStatus() {
  const count =
    Object.values(selected).filter(v => v !== null).length +
    (customPortraitImage ? 1 : 0) +
    countRenderableInfoLayers();
  document.getElementById('statusBar').textContent = `已选 ${count} 层`;
}

/** 与 drawImgFull 一致：素材在 512x840 肖像槽内的左上角偏移 */
function centeredAssetOffsetInPortraitSlot(naturalW, naturalH) {
  const iw = Number(naturalW) || 0;
  const ih = Number(naturalH) || 0;
  const dx = iw <= CANVAS_PORTRAIT.w ? (CANVAS_PORTRAIT.w - iw) / 2 : 0;
  const dy = ih <= CANVAS_PORTRAIT.h ? (CANVAS_PORTRAIT.h - ih) / 2 : 0;
  return { x: dx, y: dy };
}

function getCustomPortraitDrawRect() {
  if (!customPortraitImage || !customPortraitImage.img) return null;
  const img = customPortraitImage.img;
  const scale = customPortraitImage.scale || 1;
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);
  const x = Math.round((CANVAS_PORTRAIT.w - width) / 2);
  const y = Math.round((CANVAS_PORTRAIT.h - height) / 2);
  return { x, y, width, height };
}

async function drawCustomPortraitImage(ctx) {
  if (!customPortraitImage || !customPortraitImage.img) return;
  const rect = getCustomPortraitDrawRect();
  if (!rect) return;
  ctx.drawImage(customPortraitImage.img, rect.x, rect.y, rect.width, rect.height);
}

function canvasToPngDataUrl(canvas) {
  return canvas.toDataURL('image/png');
}

async function createSystemLayerData(item, options = {}) {
  if (!item) return null;
  await ensureHdLoaded(item.path);
  const img = imgCacheHd[item.path];
  if (!img) return null;

  const scale = options.scale || 1;
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, width, height);

  return {
    name: options.name || item.name || item.id || 'Layer',
    x: Math.round(options.x || 0),
    y: Math.round(options.y || 0),
    width,
    height,
    rgbaData: canvasToPngDataUrl(c),
    sourceType: options.sourceType || 'system',
  };
}

async function createCustomPortraitLayerData(portraitOrigin) {
  if (!customPortraitImage || !customPortraitImage.img) return null;
  const rect = getCustomPortraitDrawRect();
  if (!rect) return null;

  const c = document.createElement('canvas');
  c.width = rect.width;
  c.height = rect.height;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(customPortraitImage.img, 0, 0, rect.width, rect.height);

  return {
    name: '自定义图片',
    x: portraitOrigin.x + rect.x,
    y: portraitOrigin.y + rect.y,
    width: rect.width,
    height: rect.height,
    rgbaData: canvasToPngDataUrl(c),
    sourceType: 'custom',
  };
}

/** 与 renderFull / drawLayer 使用同一套常量，避免手写坐标漂移 */
function exportPlacementForNameplate(cat) {
  if (cat === '肖像外框') {
    const p = PORTRAIT_FRAME_ON_NAMEPLATE[portraitSide];
    return { x: p.x, y: p.y, scale: 1 };
  }
  const c = LAYER_COORDS[cat];
  if (!c || c.canvas !== 'nameplate') return null;
  return {
    x: c.x,
    y: c.y,
    scale: c.scale !== undefined ? c.scale : 1,
  };
}

async function collectLayeredExportData(options = {}) {
  const mergeInfoLayers = options && options.mergeInfoLayers === true;
  const layers = [];
  // 与 renderFull 顺序一致；坐标与 drawLayer / drawPortraitOnCtx / drawPortraitFrameOnNameplate 对齐
  const zipPortrait = PORTRAIT_EMBED[portraitSide];

  const nameplatePrefix = ['铭牌背衬', '铭牌底色', '铭牌花纹'];
  for (const cat of nameplatePrefix) {
    const place = exportPlacementForNameplate(cat);
    if (!place) continue;
    const item = selected[cat];
    const layer = await createSystemLayerData(item, {
      name: cat,
      x: place.x,
      y: place.y,
      scale: place.scale,
    });
    if (layer) layers.push(layer);
  }

  const portraitZipCats = ['肖像背景', '肖像装饰框', '肖像装饰物'];
  for (const cat of portraitZipCats) {
    if (cat === '肖像装饰框') {
      const customLayer = await createCustomPortraitLayerData(zipPortrait);
      if (customLayer) layers.push(customLayer);
    }
    const item = selected[cat];
    if (!item) continue;
    await ensureHdLoaded(item.path);
    const pimg = imgCacheHd[item.path];
    if (!pimg) continue;
    const off = centeredAssetOffsetInPortraitSlot(pimg.naturalWidth, pimg.naturalHeight);
    const layer = await createSystemLayerData(item, {
      name: cat,
      x: zipPortrait.x + off.x,
      y: zipPortrait.y + off.y,
      scale: 1,
    });
    if (layer) layers.push(layer);
  }

  const nameplateSuffix = [
    '铭牌外框',
    '肖像外框',
    '铭牌顶部装饰',
    '铭牌底部装饰',
    '铭牌装饰物',
    '铭牌装饰物B',
  ];
  for (const cat of nameplateSuffix) {
    const place = exportPlacementForNameplate(cat);
    if (!place) continue;
    const item = selected[cat];
    const layer = await createSystemLayerData(item, {
      name: cat,
      x: place.x,
      y: place.y,
      scale: place.scale,
    });
    if (layer) layers.push(layer);
  }
  if (mergeInfoLayers) {
    const mergedInfo = await createMergedInfoLayersData(infoLayers);
    if (mergedInfo) layers.push(mergedInfo);
  } else {
    for (const infoLayer of buildInfoRuntimeLayers(infoLayers)) {
      const layer = await createInfoLayerData(infoLayer);
      if (layer) layers.push(layer);
    }
  }

  return layers;
}

// 渲染「肖像画布」标签页（只看 512×840）
