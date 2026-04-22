function hasRenderableAnyInfoLayer(layer) {
  if (!layer || !layer.type) return false;
  if (layer.type === 'icon') return hasRenderableInfoIconLayer(layer);
  if (layer.type === 'special') return hasRenderableInfoSpecialLayer(layer);
  if (layer.type === 'fixed') return hasRenderableInfoFixedLayer(layer);
  if (layer.type === 'bar48') return hasRenderableInfoBar48Layer(layer);
  return hasRenderableTextLayer(layer);
}

function syncHoverOverlayCanvasSize() {
  const main = document.getElementById('mainCanvas');
  const overlay = document.getElementById('hoverOverlayCanvas');
  if (!main || !overlay) return;
  if (overlay.width !== main.width) overlay.width = main.width;
  if (overlay.height !== main.height) overlay.height = main.height;
}

function findHoveredInfoLayerRegion() {
  if (!Number.isInteger(hoveredInfoLayerIndex) || hoveredInfoLayerIndex < 0) return null;
  for (const region of infoLayerHitRegions) {
    if (!region || region.index !== hoveredInfoLayerIndex) continue;
    return region;
  }
  return null;
}

function drawHoveredInfoLayerOverlay() {
  syncHoverOverlayCanvasSize();
  const overlay = document.getElementById('hoverOverlayCanvas');
  if (!overlay) return;
  const ctx = overlay.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (activePanel !== 'info') return;
  const region = findHoveredInfoLayerRegion();
  if (!region) return;

  const pad = 4;
  const x = Math.max(0, Math.floor(region.x - pad));
  const y = Math.max(0, Math.floor(region.y - pad));
  const right = Math.min(overlay.width, Math.ceil(region.x + region.width + pad));
  const bottom = Math.min(overlay.height, Math.ceil(region.y + region.height + pad));
  const w = Math.max(1, right - x);
  const h = Math.max(1, bottom - y);

  ctx.save();
  ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.95)';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(245, 158, 11, 0.45)';
  ctx.shadowBlur = 18;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
  ctx.restore();
}

function setInfoLayerHitRegions(regions) {
  infoLayerHitRegions = Array.isArray(regions) ? regions : [];
  if (
    hoveredInfoLayerIndex >= 0 &&
    !infoLayerHitRegions.some(region => region && region.index === hoveredInfoLayerIndex)
  ) {
    hoveredInfoLayerIndex = -1;
  }
  drawHoveredInfoLayerOverlay();
}

function buildInfoLayerHitRegion(index, layer, drawResult) {
  if (!layer || !drawResult) return null;
  if (layer.type === 'text') {
    const bounds = drawResult && drawResult.bounds ? drawResult.bounds : null;
    if (!bounds) return null;
    const x = Number(bounds.minX);
    const y = Number(bounds.minY);
    const width = Number(bounds.width);
    const height = Number(bounds.height);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
    if (width <= 0 || height <= 0) return null;
    return {
      index,
      id: layer.id || '',
      type: layer.type,
      x,
      y,
      width,
      height,
    };
  }
  const normalized = drawResult.normalized || normalizeInfoLayer(layer, layer.type);
  const x = Number(normalized && normalized.x);
  const y = Number(normalized && normalized.y);
  const width = Number(drawResult.width);
  const height = Number(drawResult.height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return {
    index,
    id: layer.id || '',
    type: layer.type,
    x,
    y,
    width,
    height,
  };
}

function findInfoLayerHitRegionAtPoint(x, y) {
  const px = Number(x);
  const py = Number(y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  for (let i = infoLayerHitRegions.length - 1; i >= 0; i -= 1) {
    const region = infoLayerHitRegions[i];
    if (!region) continue;
    if (px < region.x || py < region.y) continue;
    if (px > region.x + region.width || py > region.y + region.height) continue;
    return region;
  }
  return null;
}

function canvasPointFromPointerEvent(event) {
  const canvas = document.getElementById('mainCanvas');
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x,
    y,
    inside: x >= 0 && y >= 0 && x <= canvas.width && y <= canvas.height,
  };
}

function setHoveredInfoLayerIndex(index) {
  const next = Number.isInteger(index) && index >= 0 ? index : -1;
  if (hoveredInfoLayerIndex === next) return;
  hoveredInfoLayerIndex = next;
  const viewport = document.getElementById('canvasViewport');
  if (viewport) viewport.style.cursor = next >= 0 && activePanel === 'info' ? 'pointer' : '';
  drawHoveredInfoLayerOverlay();
}

function getInfoLayerCardElement(index) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0) return null;
  const list = document.getElementById('infoLayerList');
  if (!list) return null;
  return list.querySelector(`.info-layer-card[data-layer-index="${i}"]`);
}

function scrollInfoLayerCardIntoView(index) {
  const card = getInfoLayerCardElement(index);
  if (!card) return;
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function flashInfoLayerCardHead(index) {
  const card = getInfoLayerCardElement(index);
  if (!card) return;
  const head = card.querySelector('.info-layer-head');
  if (!head) return;
  head.classList.remove('locate-flash');
  // Force reflow so repeated clicks can retrigger the same animation.
  void head.offsetWidth;
  head.classList.add('locate-flash');
}

function focusInfoLayerCardFromCanvas(index) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  infoLayerCardOpenState[i] = true;
  renderInfoLayersPanel();
  requestAnimationFrame(() => {
    scrollInfoLayerCardIntoView(i);
    flashInfoLayerCardHead(i);
  });
}

function handleInfoCanvasPointerMove(event) {
  if (activePanel !== 'info') {
    setHoveredInfoLayerIndex(-1);
    return;
  }
  const pt = canvasPointFromPointerEvent(event);
  if (!pt || !pt.inside) {
    setHoveredInfoLayerIndex(-1);
    return;
  }
  const hit = findInfoLayerHitRegionAtPoint(pt.x, pt.y);
  setHoveredInfoLayerIndex(hit ? hit.index : -1);
}

function handleInfoCanvasClick(event) {
  if (activePanel !== 'info') return;
  const pt = canvasPointFromPointerEvent(event);
  if (!pt || !pt.inside) return;
  const hit = findInfoLayerHitRegionAtPoint(pt.x, pt.y);
  if (!hit) return;
  event.preventDefault();
  focusInfoLayerCardFromCanvas(hit.index);
}

function setupInfoLayerCanvasHoverHandlers() {
  const viewport = document.getElementById('canvasViewport');
  if (!viewport || viewport.dataset.infoHoverBound === '1') return;
  viewport.dataset.infoHoverBound = '1';
  viewport.addEventListener('mousemove', handleInfoCanvasPointerMove);
  viewport.addEventListener('mouseleave', () => setHoveredInfoLayerIndex(-1));
  viewport.addEventListener('click', handleInfoCanvasClick);
}
