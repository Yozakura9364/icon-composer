async function buildFullComposite(ctx) {
  await prefetchImgPaths(collectPathsForFullRender());
  // 1. 铭牌基础
  await drawLayer(ctx, '铭牌背衬');
  await drawLayer(ctx, '铭牌底色');
  await drawLayer(ctx, '铭牌花纹');

  // 2. 肖像画布嵌入
  const embedPos = PORTRAIT_EMBED[portraitSide];
  await drawPortraitOnCtx(ctx, embedPos.x, embedPos.y);

  // 3. 铭牌外框
  await drawLayer(ctx, '铭牌外框');

  // 4. 肖像外框
  await drawPortraitFrameOnNameplate(ctx);

  // 5. 装饰层
  await drawLayer(ctx, '铭牌顶部装饰');
  await drawLayer(ctx, '铭牌底部装饰');
  await drawLayer(ctx, '铭牌装饰物');
  await drawLayer(ctx, '铭牌装饰物B');
  await drawInfoLayers(ctx);
}

function ensureHdLoaded(imgPath) {
  if (imgCacheHd[imgPath]) return Promise.resolve();
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgCacheHd[imgPath] = img;
      const finish = () => resolve();
      if (typeof img.decode === 'function') {
        img.decode().then(finish).catch(finish);
      } else {
        finish();
      }
    };
    img.onerror = () => resolve();
    img.src = iconImgSrcHd(imgPath);
  });
}

/** 并行预加载，避免多图层时串行 await 导致点击后长时间等待 */
async function prefetchImgPaths(paths) {
  const uniq = [...new Set(paths.filter(Boolean))];
  if (uniq.length === 0) return;
  await Promise.all(uniq.map(p => loadImgHd(p)));
}

function collectPathsForFullRender() {
  const keys = [
    '铭牌背衬', '铭牌底色', '铭牌花纹',
    ...PORTRAIT_CATS,
    '铭牌外框', '肖像外框',
    '铭牌顶部装饰', '铭牌底部装饰', '铭牌装饰物', '铭牌装饰物B',
  ];
  const out = [];
  for (const k of keys) {
    const s = selected[k];
    if (s && s.path) out.push(s.path);
  }
  out.push(...collectInfoIconPathsForRender());
  return out;
}

function collectPathsForPortraitTab() {
  const out = [];
  for (const k of PORTRAIT_CATS) {
    const s = selected[k];
    if (s && s.path) out.push(s.path);
  }
  return out;
}


function resolveExportScaleFactor() {
  const checkbox = document.getElementById('exportScale2xCheckbox');
  return checkbox && checkbox.checked ? 2 : 1;
}

function buildExportScaleSuffix(scaleFactor) {
  const n = Number(scaleFactor);
  if (!Number.isFinite(n) || n <= 1) return '';
  return '_' + Math.round(n) + 'x';
}

// ========== 导出 PSD ==========
