async function renderFull(options = {}) {
  const serial = Number.isInteger(options.serial) ? options.serial : null;
  const stage = document.createElement('canvas');
  stage.width = CANVAS_FULL.w;
  stage.height = CANVAS_FULL.h;
  const ctx = stage.getContext('2d');
  ctx.clearRect(0, 0, CANVAS_FULL.w, CANVAS_FULL.h);
  ctx.imageSmoothingEnabled = false;

  await prefetchImgPaths(collectPathsForFullRender());
  if (!isRenderSerialCurrent(serial)) return;

  // --- 1. 铭牌背景层 ---
  await drawLayer(ctx, '铭牌背衬');
  if (!isRenderSerialCurrent(serial)) return;
  await drawLayer(ctx, '铭牌底色');
  if (!isRenderSerialCurrent(serial)) return;
  await drawLayer(ctx, '铭牌花纹');
  if (!isRenderSerialCurrent(serial)) return;

  // --- 2. 肖像画布嵌入铭牌（右侧或左侧） ---
  const embedPos = PORTRAIT_EMBED[portraitSide];
  await drawPortraitOnCtx(ctx, embedPos.x, embedPos.y);
  if (!isRenderSerialCurrent(serial)) return;

  // --- 3. 铭牌外框 ---
  await drawLayer(ctx, '铭牌外框');
  if (!isRenderSerialCurrent(serial)) return;

  // --- 4. 肖像外框（197），按左右侧放置在铭牌画布上 ---
  await drawPortraitFrameOnNameplate(ctx);
  if (!isRenderSerialCurrent(serial)) return;

  // --- 5. 铭牌装饰层 ---
  await drawLayer(ctx, '铭牌顶部装饰');
  if (!isRenderSerialCurrent(serial)) return;
  await drawLayer(ctx, '铭牌底部装饰');
  if (!isRenderSerialCurrent(serial)) return;
  await drawLayer(ctx, '铭牌装饰物');
  if (!isRenderSerialCurrent(serial)) return;
  await drawLayer(ctx, '铭牌装饰物B');
  if (!isRenderSerialCurrent(serial)) return;
  await drawInfoLayers(ctx, infoLayers, { trackHitRegions: true });
  if (!isRenderSerialCurrent(serial)) return;

  const canvas = document.getElementById('mainCanvas');
  canvas.width = CANVAS_FULL.w;
  canvas.height = CANVAS_FULL.h;
  const outCtx = canvas.getContext('2d');
  outCtx.clearRect(0, 0, CANVAS_FULL.w, CANVAS_FULL.h);
  outCtx.imageSmoothingEnabled = false;
  outCtx.drawImage(stage, 0, 0);
  syncHoverOverlayCanvasSize();
  drawHoveredInfoLayerOverlay();
}

// 在指定 ctx 的 (px, py) 位置绘制肖像画布
async function drawPortraitOnCtx(ctx, px, py) {
  const pc = document.createElement('canvas');
  pc.width = CANVAS_PORTRAIT.w; pc.height = CANVAS_PORTRAIT.h;
  const pctx = pc.getContext('2d');
  pctx.imageSmoothingEnabled = false;

  const bg = selected['肖像背景'];
  if (bg) await drawImgFull(pctx, bg.path);
  await drawCustomPortraitImage(pctx);
  const frame = selected['肖像装饰框'];
  if (frame) await drawImgFull(pctx, frame.path);
  const deco = selected['肖像装饰物'];
  if (deco) await drawImgFull(pctx, deco.path);

  ctx.drawImage(pc, px, py);
}

// 肖像外框（197）绘制到铭牌画布
async function drawPortraitFrameOnNameplate(ctx) {
  const item = selected['肖像外框'];
  if (!item) return;
  const pos = PORTRAIT_FRAME_ON_NAMEPLATE[portraitSide];
  await drawImgFullAt(ctx, item.path, pos.x, pos.y);
}

// ============================================================
// 绘图工具（直接绘制原始尺寸，不缩放）
// ============================================================
async function drawLayer(ctx, cat) {
  const item = selected[cat];
  if (!item) return;
  const c = LAYER_COORDS[cat];
  if (c.scale !== undefined) {
    await drawImgScaled(ctx, item.path, c.x, c.y, c.scale);
  } else {
    await drawImgFullAt(ctx, item.path, c.x, c.y);
  }
}

// 在 ctx 的 (px, py) 位置以原始尺寸绘制图片
async function drawImgFullAt(ctx, imgPath, px, py) {
  const img = await loadImgHd(imgPath);
  if (!img) return;
  ctx.drawImage(img, px, py);
}

// 以 scale 比例缩放绘制图片
async function drawImgScaled(ctx, imgPath, px, py, scale) {
  const img = await loadImgHd(imgPath);
  if (!img) return;
  const sw = Math.round(img.naturalWidth * scale);
  const sh = Math.round(img.naturalHeight * scale);
  ctx.drawImage(img, px, py, sw, sh);
}

// 在 ctx 中心位置以原始尺寸绘制（用于画布自身内居中）
async function drawImgFull(ctx, imgPath) {
  const img = await loadImgHd(imgPath);
  if (!img) return;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const dx = iw <= ctx.canvas.width  ? (ctx.canvas.width  - iw) / 2 : 0;
  const dy = ih <= ctx.canvas.height ? (ctx.canvas.height - ih) / 2 : 0;
  ctx.drawImage(img, dx, dy);
}

// 与 server.js 默认一致：本机 /img；若接口返回其它 _meta.imgBase 则以接口为准
