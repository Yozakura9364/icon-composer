async function renderPortraitOnly() {
  const canvas = document.getElementById('mainCanvas');
  canvas.width  = CANVAS_PORTRAIT.w;
  canvas.height = CANVAS_PORTRAIT.h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, CANVAS_PORTRAIT.w, CANVAS_PORTRAIT.h);
  ctx.imageSmoothingEnabled = false;

  await prefetchImgPaths(collectPathsForPortraitTab());

  const bg = selected['肖像背景'];
  if (bg) await drawImgFull(ctx, bg.path);
  await drawCustomPortraitImage(ctx);
  const frame = selected['肖像装饰框'];
  if (frame) await drawImgFull(ctx, frame.path);
  const deco = selected['肖像装饰物'];
  if (deco) await drawImgFull(ctx, deco.path);
  setInfoLayerHitRegions([]);
  syncHoverOverlayCanvasSize();
  drawHoveredInfoLayerOverlay();
}

function isRenderSerialCurrent(serial) {
  if (!Number.isInteger(serial)) return true;
  return serial === renderRequestSerial;
}

// 渲染「完整预览」标签页（2560×1440）
