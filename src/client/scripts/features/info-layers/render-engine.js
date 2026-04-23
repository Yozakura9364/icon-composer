function escapeFontFamilyForCanvas(raw) {
  return normalizeTextLayerFontFamily(raw, 'Adobe Heiti Std')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function buildTextLayerFontSpecWithSize(layer, fontSizePx) {
  const normalized = normalizeTextLayerState(layer);
  const fontStyle = normalized.italic ? 'italic ' : '';
  const variant = resolveTextLayerFontVariantMeta(normalized.fontFamily, normalized.fontVariant);
  const variantWeight = Number.isFinite(Number(variant.weight)) ? Number(variant.weight) : 400;
  const finalWeight = variantWeight;
  const fontWeight = `${Math.round(finalWeight)} `;
  const escapedFamily = escapeFontFamilyForCanvas(normalized.fontFamily);
  const size = Math.max(1, Number(fontSizePx) || normalized.fontSize);
  return `${fontStyle}${fontWeight}${size}px "${escapedFamily}", sans-serif`;
}

function buildTextLayerFontSpec(layer) {
  const normalized = normalizeTextLayerState(layer);
  return buildTextLayerFontSpecWithSize(normalized, normalized.fontSize);
}

function applyCanvasTextFeatureHints(ctx, normalized) {
  if (!ctx || !normalized) return;
  const basicGlyphLocked = isJupiterProFontFamily(normalized.fontFamily);
  const enableLigatures = !basicGlyphLocked && normalized.freeLigatures === true;
  try {
    if ('fontKerning' in ctx) ctx.fontKerning = 'normal';
  } catch (_) {}
  try {
    if ('fontVariantLigatures' in ctx) {
      ctx.fontVariantLigatures = enableLigatures ? 'common-ligatures contextual' : 'none';
    }
  } catch (_) {}
  try {
    if ('fontFeatureSettings' in ctx) {
      if (basicGlyphLocked) {
        ctx.fontFeatureSettings =
          '"liga" 0, "clig" 0, "dlig" 0, "hlig" 0, "calt" 0, "salt" 0, "aalt" 0, ' +
          '"smcp" 0, "c2sc" 0, "pcap" 0, "onum" 0, "lnum" 0, "tnum" 0, "pnum" 0, ' +
          '"ss01" 0, "ss02" 0, "ss03" 0, "ss04" 0, "ss05" 0, "titl" 0, "swsh" 0';
      } else {
        ctx.fontFeatureSettings = enableLigatures
          ? '"liga" 1, "clig" 1, "calt" 1'
          : '"liga" 0, "clig" 0, "calt" 0';
      }
    }
  } catch (_) {}
  try {
    if ('letterSpacing' in ctx) {
      const em = Number.isFinite(Number(normalized.tracking)) ? Number(normalized.tracking) : 0;
      const px = (em / 1000) * normalized.fontSize;
      ctx.letterSpacing = `${px}px`;
    }
  } catch (_) {}
  try {
    if ('textRendering' in ctx) {
      const preferLegibility = enableLigatures;
      ctx.textRendering = preferLegibility ? 'optimizeLegibility' : 'auto';
    }
  } catch (_) {}
  try {
    if ('lang' in ctx) {
      const family = String(normalized.fontFamily || '').trim().toLowerCase();
      ctx.lang = family === 'jupiter pro' ? 'en' : 'zh-CN';
    }
  } catch (_) {}
}

function isLowercaseLetterForSmallCaps(ch) {
  const c = String(ch || '');
  if (!c) return false;
  return c.toLowerCase() !== c.toUpperCase() && c === c.toLowerCase();
}

function buildSmallCapsRuns(text) {
  const src = String(text || '');
  if (!src) return [];
  const runs = [];
  let currentScale = null;
  let currentText = '';
  for (const ch of src) {
    const lowerLike = isLowercaseLetterForSmallCaps(ch);
    const scale = lowerLike ? SMALL_CAPS_GLYPH_SCALE : 1;
    const nextChar = lowerLike ? ch.toUpperCase() : ch;
    if (currentScale === null || currentScale !== scale) {
      if (currentText) runs.push({ text: currentText, scale: currentScale });
      currentScale = scale;
      currentText = nextChar;
      continue;
    }
    currentText += nextChar;
  }
  if (currentText) runs.push({ text: currentText, scale: currentScale });
  return runs;
}

const textLayerFontLoadInflight = new Map();
const textLayerFontLoaded = new Map();
const TEXT_LAYER_FONT_LOAD_CACHE_MAX = 128;
const TEXT_LAYER_FONT_LOAD_PROBE_LATIN = 'BESbswy0123456789';
const TEXT_LAYER_FONT_LOAD_PROBE_CJK = '汉字测试';

function buildTextLayerFontLoadDescriptor(layer) {
  const normalized = normalizeTextLayerState(layer);
  const variant = resolveTextLayerFontVariantMeta(normalized.fontFamily, normalized.fontVariant);
  const weight = Number.isFinite(Number(variant.weight)) ? Math.round(Number(variant.weight)) : 400;
  const style = normalized.italic ? 'italic' : 'normal';
  const family = normalizeTextLayerFontFamily(normalized.fontFamily, 'Adobe Heiti Std');
  const escapedFamily = escapeFontFamilyForCanvas(family);
  const firstLine = textLayerLines(normalized.text).find(line => line.trim()) || '';
  const firstSample = String(firstLine).trim().slice(0, 32);
  const samples = [TEXT_LAYER_FONT_LOAD_PROBE_LATIN, TEXT_LAYER_FONT_LOAD_PROBE_CJK];
  if (firstSample) samples.push(firstSample);
  return {
    key: `${style}|${weight}|${family.toLowerCase()}`,
    spec: `${style === 'italic' ? 'italic ' : ''}${weight} 16px "${escapedFamily}"`,
    samples: Array.from(new Set(samples)),
  };
}

function rememberTextLayerFontLoaded(key) {
  if (textLayerFontLoaded.has(key)) {
    textLayerFontLoaded.delete(key);
  }
  textLayerFontLoaded.set(key, 1);
  if (textLayerFontLoaded.size <= TEXT_LAYER_FONT_LOAD_CACHE_MAX) return;
  const oldest = textLayerFontLoaded.keys().next();
  if (!oldest.done) textLayerFontLoaded.delete(oldest.value);
}

async function ensureTextLayerFontReady(layer) {
  if (!document.fonts || typeof document.fonts.load !== 'function') return;
  const descriptor = buildTextLayerFontLoadDescriptor(layer);
  const inflightKey = descriptor.key;
  if (textLayerFontLoaded.has(inflightKey)) return;
  if (textLayerFontLoadInflight.has(inflightKey)) {
    await textLayerFontLoadInflight.get(inflightKey);
    return;
  }
  const task = (async () => {
    try {
      // Do not short-circuit with document.fonts.check(): it can return true on fallback fonts.
      await Promise.all(
        descriptor.samples.map(sample =>
          document.fonts.load(descriptor.spec, sample).catch(() => null)
        )
      );
      rememberTextLayerFontLoaded(inflightKey);
    } catch (_) {
      // ignore font loading failures and let canvas fallback
    } finally {
      textLayerFontLoadInflight.delete(inflightKey);
    }
  })();
  textLayerFontLoadInflight.set(inflightKey, task);
  await task;
}

async function ensureInfoTextLayerFontsReady(layers) {
  if (!Array.isArray(layers) || !layers.length) return;
  const tasks = [];
  for (const layer of layers) {
    if (!layer || layer.type === 'icon' || layer.type === 'special' || layer.type === 'fixed' || layer.type === 'bar48') {
      continue;
    }
    if (!hasRenderableTextLayer(layer)) continue;
    tasks.push(ensureTextLayerFontReady(layer));
  }
  if (!tasks.length) return;
  await Promise.all(tasks);
}

async function ensureInfoFollowTextLayerFontsReady(layers) {
  if (!Array.isArray(layers) || !layers.length) return;
  const normalizedLayers = normalizeInfoLayers(layers);
  const textById = new Map();
  for (const layer of normalizedLayers) {
    if (!layer || layer.type !== 'text') continue;
    const normalized = normalizeInfoLayer(layer, 'text');
    if (!normalized.id) continue;
    textById.set(normalized.id, normalized);
  }
  if (!textById.size) return;

  const tasks = [];
  const pushIfRenderable = layer => {
    if (!layer || !hasRenderableTextLayer(layer)) return;
    tasks.push(ensureTextLayerFontReady(layer));
  };

  for (const layer of textById.values()) {
    const followLayerId = normalizeInfoTextFollowLayerId(layer.followLayerId);
    if (!followLayerId) continue;
    pushIfRenderable(layer);
    pushIfRenderable(textById.get(followLayerId));
  }

  if (!tasks.length) return;
  await Promise.all(tasks);
}

const TEXT_LAYER_RENDER_EFFECT_STYLES = {
  [TEXT_RENDER_EFFECT_SHADOW_GRAY]: {
    shadowOffsetX: 0,
    shadowOffsetY: 1,
    shadowFill: 'rgba(64,64,64,0.72)',
    // Approximate Photoshop: Distance=2px, Spread=50%, Size=0px
    shadowExpandPx: 0.35,
    shadowLineJoin: 'miter',
    shadowMiterLimit: 4,
    shadowSnapToPixel: true,
  },
  // legacy key maps to same plain gray shadow effect
  [TEXT_RENDER_EFFECT_EMBOSS_SOFT]: {
    shadowOffsetX: 0,
    shadowOffsetY: 1,
    shadowFill: 'rgba(64,64,64,0.72)',
    // Approximate Photoshop: Distance=2px, Spread=50%, Size=0px
    shadowExpandPx: 0.35,
    shadowLineJoin: 'miter',
    shadowMiterLimit: 4,
    shadowSnapToPixel: true,
  },
};

function resolveTextLayerRenderEffectStyle(renderEffect) {
  const key = normalizeTextLayerRenderEffect(renderEffect);
  if (key === TEXT_RENDER_EFFECT_NONE) return null;
  return TEXT_LAYER_RENDER_EFFECT_STYLES[key] || null;
}

function drawTextLayerRowGlyphs(ctx, normalized, layout, row, textLeft, textTop, drawStroke = false, drawFill = true) {
  if (!row || !row.text) return;
  if (normalized.smallCaps && Array.isArray(row.runs) && row.runs.length) {
    let runLeft = textLeft;
    for (const run of row.runs) {
      const runScale = Number(run.scale) || 1;
      const runFontSize = Math.max(1, normalized.fontSize * runScale);
      const runTop = textTop + (normalized.fontSize - runFontSize);
      ctx.font = buildTextLayerFontSpecWithSize(normalized, runFontSize);
      if (drawStroke) ctx.strokeText(run.text, runLeft, runTop);
      if (drawFill) ctx.fillText(run.text, runLeft, runTop);
      runLeft += ctx.measureText(run.text).width;
    }
    ctx.font = layout.fontSpec;
    return;
  }
  if (drawStroke) ctx.strokeText(row.text, textLeft, textTop);
  if (drawFill) ctx.fillText(row.text, textLeft, textTop);
}

function drawTextLayerRowRenderEffect(ctx, normalized, layout, row, textLeft, textTop, effectStyle) {
  if (!effectStyle || !row || !row.text) return;
  const prevFillStyle = ctx.fillStyle;
  const prevStrokeStyle = ctx.strokeStyle;
  const prevLineWidth = ctx.lineWidth;
  const prevLineJoin = ctx.lineJoin;
  const prevMiterLimit = ctx.miterLimit;
  const hasHighlight =
    typeof effectStyle.highlightFill === 'string' &&
    Number.isFinite(Number(effectStyle.highlightOffsetX)) &&
    Number.isFinite(Number(effectStyle.highlightOffsetY));
  const hasShadow =
    typeof effectStyle.shadowFill === 'string' &&
    Number.isFinite(Number(effectStyle.shadowOffsetX)) &&
    Number.isFinite(Number(effectStyle.shadowOffsetY));
  const hasEdgeStroke =
    typeof effectStyle.edgeStroke === 'string' &&
    Number.isFinite(Number(effectStyle.edgeWidth)) &&
    Number(effectStyle.edgeWidth) > 0;

  if (hasHighlight) {
    ctx.fillStyle = effectStyle.highlightFill;
    drawTextLayerRowGlyphs(
      ctx,
      normalized,
      layout,
      row,
      textLeft + Number(effectStyle.highlightOffsetX),
      textTop + Number(effectStyle.highlightOffsetY),
      false,
      true
    );
  }

  if (hasShadow) {
    ctx.fillStyle = effectStyle.shadowFill;
    const shadowTextLeftRaw = textLeft + Number(effectStyle.shadowOffsetX);
    const shadowTextTopRaw = textTop + Number(effectStyle.shadowOffsetY);
    const shadowSnapToPixel = effectStyle.shadowSnapToPixel === true;
    const shadowTextLeft = shadowSnapToPixel ? Math.round(shadowTextLeftRaw) : shadowTextLeftRaw;
    const shadowTextTop = shadowSnapToPixel ? Math.round(shadowTextTopRaw) : shadowTextTopRaw;
    const shadowExpandPx = Number(effectStyle.shadowExpandPx);
    if (Number.isFinite(shadowExpandPx) && shadowExpandPx > 0) {
      ctx.strokeStyle = effectStyle.shadowFill;
      ctx.lineWidth = Math.max(0.01, shadowExpandPx * 2);
      ctx.lineJoin = effectStyle.shadowLineJoin === 'miter' ? 'miter' : 'round';
      const shadowMiterLimit = Number(effectStyle.shadowMiterLimit);
      ctx.miterLimit = Number.isFinite(shadowMiterLimit) && shadowMiterLimit > 0
        ? shadowMiterLimit
        : 2;
      drawTextLayerRowGlyphs(
        ctx,
        normalized,
        layout,
        row,
        shadowTextLeft,
        shadowTextTop,
        true,
        true
      );
    } else {
      drawTextLayerRowGlyphs(
        ctx,
        normalized,
        layout,
        row,
        shadowTextLeft,
        shadowTextTop,
        false,
        true
      );
    }
  }

  if (hasEdgeStroke) {
    ctx.strokeStyle = effectStyle.edgeStroke;
    ctx.lineWidth = Math.max(0.01, Number(effectStyle.edgeWidth) || 1);
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    drawTextLayerRowGlyphs(ctx, normalized, layout, row, textLeft, textTop, true, false);
  }

  ctx.fillStyle = prevFillStyle;
  ctx.strokeStyle = prevStrokeStyle;
  ctx.lineWidth = prevLineWidth;
  ctx.lineJoin = prevLineJoin;
  ctx.miterLimit = prevMiterLimit;
}

function resolveTextLayerRowTextLeft(row) {
  const textLeft = Number(row && row.textLeft);
  if (Number.isFinite(textLeft)) return textLeft;
  const left = Number(row && row.left);
  return Number.isFinite(left) ? left : 0;
}

let textLayerMeasureCanvas = null;
function getTextLayerMeasureContext() {
  if (!textLayerMeasureCanvas) textLayerMeasureCanvas = document.createElement('canvas');
  return textLayerMeasureCanvas.getContext('2d');
}

function resolveTextLayerStrokeWidthPx(layer) {
  if (!layer || layer.strokeEnabled !== true) return 0;
  const w = Number(layer.strokeWidth);
  if (!Number.isFinite(w) || w <= 0) return 0;
  return w;
}

function resolveTextLayerStrokeOutsetPx(layer) {
  const w = resolveTextLayerStrokeWidthPx(layer);
  if (w <= 0) return 0;
  return layer && layer.strokePosition === 'outside' ? w : w / 2;
}

function computeTextLayerLayout(layer) {
  const normalized = normalizeTextLayerState(layer);
  const lineHeightPx = Math.max(1, Math.round(normalized.fontSize * normalized.lineHeight));
  const xAnchor = Math.round(normalized.x);
  const yAnchor = Math.round(normalized.y);
  const scaleX = Math.max(0.01, (Number(normalized.scaleXPercent) || 100) / 100);
  const scaleY = Math.max(0.01, (Number(normalized.scaleYPercent) || 100) / 100);
  const iconPath = normalizeInfoInlineIconPath(normalized.inlineIconPath);
  const iconWidthPx = iconPath
    ? Math.max(0, Number(normalized.inlineIconWidth) || Number(normalized.inlineIconSize) || 0)
    : 0;
  const iconHeightPx = iconPath
    ? Math.max(0, Number(normalized.inlineIconHeight) || Number(normalized.inlineIconSize) || 0)
    : 0;
  const iconGapPx = iconWidthPx > 0 && iconHeightPx > 0
    ? Math.max(0, Number(normalized.inlineIconGap) || 0)
    : 0;
  const isWorldTransrateInlineIcon = isWorldTransrate4InlineIconPath(iconPath);
  const ctx = getTextLayerMeasureContext();
  const fontSpec = buildTextLayerFontSpec(normalized);
  ctx.font = fontSpec;
  applyCanvasTextFeatureHints(ctx, normalized);
  const iconExtraWidthPx =
    iconWidthPx > 0 && iconHeightPx > 0
      ? iconWidthPx + iconGapPx
      : 0;
  const wrapWidthPx = Math.max(
    1,
    INFO_TEXT_AUTO_WRAP_MAX_WIDTH / scaleX - iconExtraWidthPx
  );
  const lines = wrapTextLayerLinesByWidth(normalized, ctx, fontSpec, wrapWidthPx);
  const underlineOffset = Math.max(1, Math.round(normalized.fontSize * 0.08));
  const underlineThickness = Math.max(1, Math.round(normalized.fontSize * 0.06));

  const rows = lines.map((line, idx) => {
    const text = String(line || '');
    let runs = null;
    let width = 0;
    if (normalized.smallCaps && text) {
      runs = buildSmallCapsRuns(text);
      for (const run of runs) {
        const runFontSize = Math.max(1, normalized.fontSize * (Number(run.scale) || 1));
        ctx.font = buildTextLayerFontSpecWithSize(normalized, runFontSize);
        width += ctx.measureText(run.text).width;
      }
      ctx.font = fontSpec;
    } else {
      width = text ? ctx.measureText(text).width : 0;
    }
    const hasInlineIconOnRow = idx === 0 && iconWidthPx > 0 && iconHeightPx > 0;
    if (hasInlineIconOnRow && isWorldTransrateInlineIcon) {
      const textW = width;
      let textLeft;
      if (normalized.align === 'center') {
        textLeft = xAnchor - textW / 2;
      } else if (normalized.align === 'right') {
        textLeft = xAnchor - textW;
      } else {
        textLeft = xAnchor;
      }
      return {
        text,
        width: textW,
        textWidth: textW,
        runs,
        iconPath,
        iconWidthPx,
        iconHeightPx,
        iconGapPx,
        textLeft,
        left: textLeft,
        top: yAnchor + idx * lineHeightPx,
        iconWorldTransrate: true,
        iconFixedBottomY: INFO_TEXT_WORLD_TRANSRATE_INLINE_BOTTOM_Y,
      };
    }
    const iconWidth = hasInlineIconOnRow ? iconWidthPx + (text ? iconGapPx : 0) : 0;
    const textWidth = width;
    width += iconWidth;
    const left =
      normalized.align === 'center'
        ? xAnchor - width / 2
        : normalized.align === 'right'
          ? xAnchor - width
          : xAnchor;
    const textLeft = left + iconWidth;
    return {
      text,
      width,
      textWidth,
      runs,
      iconPath: hasInlineIconOnRow ? iconPath : '',
      iconWidthPx: hasInlineIconOnRow ? iconWidthPx : 0,
      iconHeightPx: hasInlineIconOnRow ? iconHeightPx : 0,
      iconGapPx: hasInlineIconOnRow ? iconGapPx : 0,
      textLeft,
      left,
      top: yAnchor + idx * lineHeightPx,
    };
  });
  if (rows.length === 0) {
    rows.push({ text: '', textWidth: 0, width: 0, textLeft: xAnchor, left: xAnchor, top: yAnchor });
  }

  let minX = rows[0].left;
  let maxX = rows[0].left + rows[0].width;
  for (const row of rows) {
    if (row.left < minX) minX = row.left;
    const rowRight = row.left + row.width;
    if (rowRight > maxX) maxX = rowRight;
  }
  let minY = yAnchor;
  let maxY = yAnchor + lineHeightPx * rows.length;
  for (const row of rows) {
    const iconW = Math.max(0, Number(row.iconWidthPx) || 0);
    const iconH = Math.max(0, Number(row.iconHeightPx) || 0);
    if (iconW <= 0 || iconH <= 0) continue;
    let iconLeft;
    let iconTop;
    if (row.iconWorldTransrate) {
      const tl = resolveTextLayerRowTextLeft(row);
      const gap = Math.max(0, Number(row.iconGapPx) || 0);
      iconLeft = tl - gap - iconW;
      const bottomY = Number.isFinite(Number(row.iconFixedBottomY))
        ? Number(row.iconFixedBottomY)
        : INFO_TEXT_WORLD_TRANSRATE_INLINE_BOTTOM_Y;
      iconTop = bottomY - iconH;
    } else {
      iconLeft = row.left;
      iconTop = row.top + normalized.fontSize - iconH;
    }
    const iconRight = iconLeft + iconW;
    const iconBottom = iconTop + iconH;
    if (iconLeft < minX) minX = iconLeft;
    if (iconRight > maxX) maxX = iconRight;
    if (iconTop < minY) minY = iconTop;
    if (iconBottom > maxY) maxY = iconBottom;
  }
  if (normalized.underline) {
    for (const row of rows) {
      if (!row.text || row.width <= 0) continue;
      const underlineBottom = row.top + normalized.fontSize + underlineOffset + underlineThickness;
      if (underlineBottom > maxY) maxY = underlineBottom;
    }
  }
  const strokeOutsetPx = resolveTextLayerStrokeOutsetPx(normalized);
  if (strokeOutsetPx > 0) {
    minX -= strokeOutsetPx;
    maxX += strokeOutsetPx;
    minY -= strokeOutsetPx;
    maxY += strokeOutsetPx;
  }

  const scaledMinXRaw = xAnchor + (minX - xAnchor) * scaleX;
  const scaledMaxXRaw = xAnchor + (maxX - xAnchor) * scaleX;
  const scaledMinYRaw = yAnchor + (minY - yAnchor) * scaleY;
  const scaledMaxYRaw = yAnchor + (maxY - yAnchor) * scaleY;
  const scaledMinX = Math.min(scaledMinXRaw, scaledMaxXRaw);
  const scaledMaxX = Math.max(scaledMinXRaw, scaledMaxXRaw);
  const scaledMinY = Math.min(scaledMinYRaw, scaledMaxYRaw);
  const scaledMaxY = Math.max(scaledMinYRaw, scaledMaxYRaw);

  return {
    normalized,
    fontSpec,
    rows,
    lineHeightPx,
    underlineOffset,
    underlineThickness,
    strokeOutsetPx,
    bounds: {
      minX: scaledMinX,
      minY: scaledMinY,
      maxX: scaledMaxX,
      maxY: scaledMaxY,
      width: Math.max(1, Math.ceil(scaledMaxX - scaledMinX)),
      height: Math.max(1, Math.ceil(scaledMaxY - scaledMinY)),
    },
  };
}

function escapeSvgTextContent(raw) {
  return String(raw == null ? '' : raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function drawTextLayerViaSvgCalt(ctx, layout, normalized, options = {}, effectiveColor = '#ffffff') {
  if (!ctx || !layout || !normalized) return false;
  const rows = Array.isArray(layout.rows) ? layout.rows : [];
  const hasInlineIcon = rows.some(row =>
    (Number(row && row.iconWidthPx) || 0) > 0 || (Number(row && row.iconHeightPx) || 0) > 0
  );
  if (hasInlineIcon) return false;
  if (normalized.smallCaps === true) return false;

  const width = Math.max(1, Math.ceil(layout.bounds.width));
  const height = Math.max(1, Math.ceil(layout.bounds.height));
  const offsetX = Number.isFinite(Number(options.offsetX)) ? Number(options.offsetX) : 0;
  const offsetY = Number.isFinite(Number(options.offsetY)) ? Number(options.offsetY) : 0;
  const originX = Math.floor(layout.bounds.minX + offsetX);
  const originY = Math.floor(layout.bounds.minY + offsetY);

  const variant = resolveTextLayerFontVariantMeta(normalized.fontFamily, normalized.fontVariant);
  const fontWeight = Number.isFinite(Number(variant && variant.weight)) ? Number(variant.weight) : 400;
  const fontStyle = normalized.italic ? 'italic' : 'normal';
  const trackingPx = (Number.isFinite(Number(normalized.tracking)) ? Number(normalized.tracking) : 0) / 1000 * normalized.fontSize;
  const strokeWidthPx = resolveTextLayerStrokeWidthPx(normalized);
  const hasStroke = strokeWidthPx > 0;
  const strokeLineWidth = normalized.strokePosition === 'outside' ? strokeWidthPx * 2 : strokeWidthPx;
  const strokeColor = normalizeHexColor(normalized.strokeColor, '#000000');
  const fillColor = normalizeHexColor(effectiveColor, '#ffffff');
  const escapedFamily = String(normalized.fontFamily || '').replace(/"/g, '&quot;');

  const textNodes = rows
    .filter(row => row && row.text)
    .map(row => {
      const textLeft = resolveTextLayerRowTextLeft(row);
      const x = textLeft - layout.bounds.minX;
      const y = Number(row.top) - layout.bounds.minY;
      return `<text xml:space="preserve" x="${x}" y="${y}" text-anchor="start" dominant-baseline="text-before-edge">${escapeSvgTextContent(row.text)}</text>`;
    })
    .join('');
  if (!textNodes) return false;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<g fill="${fillColor}" ${hasStroke ? `stroke="${strokeColor}" stroke-width="${strokeLineWidth}" stroke-linejoin="round" paint-order="stroke fill"` : ''}` +
    ` style="font-family:'${escapedFamily}',sans-serif;font-style:${fontStyle};font-weight:${fontWeight};font-size:${normalized.fontSize}px;` +
    `font-variant-ligatures:common-ligatures contextual;` +
    `font-feature-settings:'liga' 1,'clig' 1,'calt' 1;` +
    `font-kerning:normal;letter-spacing:${trackingPx}px;` +
    `text-rendering:optimizeLegibility">` +
    `${textNodes}</g></svg>`;

  const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const img = await new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
  if (!img) return false;

  ctx.save();
  ctx.globalAlpha = normalized.opacity;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, originX, originY, width, height);
  ctx.restore();
  return true;
}

async function drawTextLayer(ctx, layer, options = {}) {
  const normalized = normalizeTextLayerState(layer);
  if (!hasRenderableTextLayer(normalized)) return null;
  await ensureTextLayerFontReady(normalized);
  const layout = computeTextLayerLayout(normalized);
  const firstRow = Array.isArray(layout.rows) && layout.rows.length ? layout.rows[0] : null;
  const inlineIconPath =
    firstRow && firstRow.iconPath ? normalizeInfoInlineIconPath(firstRow.iconPath) : '';
  const inlineIconImg = inlineIconPath ? await loadImgHd(inlineIconPath) : null;
  const effectiveColor = await resolveAdaptiveInfoTextColor(
    normalized.color,
    normalized.adaptiveColorSource,
    normalized
  );
  const offsetX = Number.isFinite(Number(options.offsetX)) ? Number(options.offsetX) : 0;
  const offsetY = Number.isFinite(Number(options.offsetY)) ? Number(options.offsetY) : 0;
  const scaleX = Math.max(0.01, (Number(normalized.scaleXPercent) || 100) / 100);
  const scaleY = Math.max(0.01, (Number(normalized.scaleYPercent) || 100) / 100);
  const anchorX = Math.round(normalized.x) + offsetX;
  const anchorY = Math.round(normalized.y) + offsetY;
  const strokeWidthPx = resolveTextLayerStrokeWidthPx(normalized);
  const hasStroke = strokeWidthPx > 0;
  const strokeLineWidth = normalized.strokePosition === 'outside' ? strokeWidthPx * 2 : strokeWidthPx;
  const textRenderEffectStyle = resolveTextLayerRenderEffectStyle(normalized.renderEffect);

  ctx.save();
  if (Math.abs(scaleX - 1) > 1e-6 || Math.abs(scaleY - 1) > 1e-6) {
    ctx.translate(anchorX, anchorY);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-anchorX, -anchorY);
  }
  ctx.globalAlpha = normalized.opacity;
  ctx.fillStyle = effectiveColor;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = layout.fontSpec;
  applyCanvasTextFeatureHints(ctx, normalized);
  if (hasStroke) {
    ctx.strokeStyle = normalizeHexColor(normalized.strokeColor, '#000000');
    ctx.lineWidth = Math.max(0.01, strokeLineWidth);
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
  }
  for (const row of layout.rows) {
    if (!row.text) continue;
    const iconWidthPx = Math.max(0, Number(row.iconWidthPx) || 0);
    const iconHeightPx = Math.max(0, Number(row.iconHeightPx) || 0);
    const iconGapPx = Math.max(0, Number(row.iconGapPx) || 0);
    if (iconWidthPx > 0 && iconHeightPx > 0 && inlineIconImg) {
      let iconX;
      let iconY;
      if (row.iconWorldTransrate) {
        const tl = resolveTextLayerRowTextLeft(row) + offsetX;
        iconX = tl - iconGapPx - iconWidthPx;
        const bottomY = Number.isFinite(Number(row.iconFixedBottomY))
          ? Number(row.iconFixedBottomY)
          : INFO_TEXT_WORLD_TRANSRATE_INLINE_BOTTOM_Y;
        iconY = bottomY - iconHeightPx + offsetY;
      } else {
        iconX = row.left + offsetX;
        iconY = row.top + offsetY + normalized.fontSize - iconHeightPx;
      }
      ctx.drawImage(inlineIconImg, iconX, iconY, iconWidthPx, iconHeightPx);
    }
    const textLeft = resolveTextLayerRowTextLeft(row) + offsetX;
    const textTop = row.top + offsetY;
    if (textRenderEffectStyle) {
      drawTextLayerRowRenderEffect(
        ctx,
        normalized,
        layout,
        row,
        textLeft,
        textTop,
        textRenderEffectStyle
      );
    }
    drawTextLayerRowGlyphs(ctx, normalized, layout, row, textLeft, textTop, hasStroke, true);
  }
  if (normalized.underline) {
    ctx.strokeStyle = effectiveColor;
    ctx.lineWidth = layout.underlineThickness;
    for (const row of layout.rows) {
      if (!row.text || row.width <= 0) continue;
      const y = row.top + normalized.fontSize + layout.underlineOffset + offsetY + layout.underlineThickness / 2;
      const x1 = resolveTextLayerRowTextLeft(row) + offsetX;
      const textWidth = Number.isFinite(Number(row.textWidth)) ? Number(row.textWidth) : row.width;
      const x2 = x1 + Math.max(0, textWidth);
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
    }
  }
  ctx.restore();
  return layout;
}

function computeInfoBar48Bounds(layer) {
  const normalized = normalizeInfoLayer(layer, 'bar48');
  const columns = Math.max(1, Math.min(INFO_BAR48_COUNT, Number(normalized.columns) || INFO_BAR48_DEFAULT_COLUMNS));
  const rows = Math.max(1, Math.ceil(INFO_BAR48_COUNT / columns));
  const splitCol = Math.floor(columns / 2);
  const hasCenterGap = columns === INFO_BAR48_DEFAULT_COLUMNS && splitCol > 0;
  const centerGapPx = hasCenterGap
    ? Math.max(
        0,
        Math.round(INFO_BAR48_CENTER_GAP_BASE_PX * (normalized.cellWidth / INFO_BAR48_BASE_CELL_WIDTH_PX))
      )
    : 0;
  const width = columns * normalized.cellWidth + Math.max(0, columns - 1) * normalized.gapX + centerGapPx;
  const height = rows * normalized.cellHeight + Math.max(0, rows - 1) * normalized.gapY;
  return {
    normalized,
    columns,
    rows,
    splitCol,
    centerGapPx,
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

async function drawInfoFixedLayer(ctx, layer, options = {}) {
  const normalized = normalizeInfoLayer(layer, 'fixed');
  if (!hasRenderableInfoFixedLayer(normalized)) return null;
  const assetPath = normalizeInfoAssetPath(normalized.path);
  if (!assetPath) return null;
  const img = await loadImgHd(assetPath);
  if (!img) return null;
  const width = Number.isFinite(Number(normalized.width)) && Number(normalized.width) > 0
    ? Math.max(1, Math.round(Number(normalized.width)))
    : Math.max(1, Math.round(img.naturalWidth));
  const height = Number.isFinite(Number(normalized.height)) && Number(normalized.height) > 0
    ? Math.max(1, Math.round(Number(normalized.height)))
    : Math.max(1, Math.round(img.naturalHeight));
  const offsetX = Number.isFinite(Number(options.offsetX)) ? Number(options.offsetX) : 0;
  const offsetY = Number.isFinite(Number(options.offsetY)) ? Number(options.offsetY) : 0;
  ctx.save();
  ctx.globalAlpha = normalized.opacity;
  setCanvasImageSmoothing(ctx, shouldSmoothWhenScaledDown(img, width, height));
  ctx.drawImage(img, normalized.x + offsetX, normalized.y + offsetY, width, height);
  ctx.restore();
  return {
    normalized,
    path: assetPath,
    width,
    height,
  };
}

async function drawInfoBar48Layer(ctx, layer, options = {}) {
  const meta = computeInfoBar48Bounds(layer);
  const normalized = meta.normalized;
  if (!hasRenderableInfoBar48Layer(normalized)) return null;
  const emptyPath = normalizeInfoAssetPath(normalized.emptyPath);
  const fillPath = normalizeInfoAssetPath(normalized.fillPath);
  if (!emptyPath) return null;
  const emptyImg = await loadImgHd(emptyPath);
  if (!emptyImg) return null;
  const fillImg = fillPath ? await loadImgHd(fillPath) : null;
  const offsetX = Number.isFinite(Number(options.offsetX)) ? Number(options.offsetX) : 0;
  const offsetY = Number.isFinite(Number(options.offsetY)) ? Number(options.offsetY) : 0;
  const emptyNaturalW = Math.max(1, Number(emptyImg.naturalWidth) || normalized.cellWidth);
  const emptyNaturalH = Math.max(1, Number(emptyImg.naturalHeight) || normalized.cellHeight);
  const fillScaleX = fillImg ? (Number(fillImg.naturalWidth) || 0) / emptyNaturalW : 0;
  const fillScaleY = fillImg ? (Number(fillImg.naturalHeight) || 0) / emptyNaturalH : 0;
  const fillDrawW = fillImg ? Math.max(1, Math.round(normalized.cellWidth * fillScaleX)) : 0;
  const fillDrawH = fillImg ? Math.max(1, Math.round(normalized.cellHeight * fillScaleY)) : 0;
  const fillOffsetX = (() => {
    const emptyNorm = String(emptyPath || '').replace(/\\/g, '/').toLowerCase();
    const fillNorm = String(fillPath || '').replace(/\\/g, '/').toLowerCase();
    if (emptyNorm.endsWith('ui/sprites/charactercard_3.png') && fillNorm.endsWith('ui/sprites/charactercard_4.png')) {
      return -1;
    }
    return 0;
  })();
  const smoothEmpty = shouldSmoothWhenScaledDown(emptyImg, normalized.cellWidth, normalized.cellHeight);
  const smoothFill = fillImg ? shouldSmoothWhenScaledDown(fillImg, fillDrawW, fillDrawH) : false;

  ctx.save();
  ctx.globalAlpha = normalized.opacity;
  setCanvasImageSmoothing(ctx, smoothEmpty);
  for (let i = 0; i < INFO_BAR48_COUNT; i += 1) {
    const col = i % meta.columns;
    const row = Math.floor(i / meta.columns);
    const centerOffset = col >= meta.splitCol ? meta.centerGapPx : 0;
    const x = normalized.x + offsetX + col * (normalized.cellWidth + normalized.gapX) + centerOffset;
    const y = normalized.y + offsetY + row * (normalized.cellHeight + normalized.gapY);
    ctx.drawImage(emptyImg, x, y, normalized.cellWidth, normalized.cellHeight);
    if (normalized.states[i] === 1 && fillImg) {
      const fx = x + Math.round((normalized.cellWidth - fillDrawW) / 2) + fillOffsetX;
      const fy = y + Math.round((normalized.cellHeight - fillDrawH) / 2);
      setCanvasImageSmoothing(ctx, smoothFill);
      ctx.drawImage(fillImg, fx, fy, fillDrawW, fillDrawH);
      setCanvasImageSmoothing(ctx, smoothEmpty);
    }
  }
  ctx.restore();
  return {
    normalized,
    width: meta.width,
    height: meta.height,
    emptyPath,
    fillPath,
  };
}

function drawImageCover(ctx, img, dx, dy, dw, dh) {
  const iw = Math.max(1, Number(img.naturalWidth) || Number(img.width) || 1);
  const ih = Math.max(1, Number(img.naturalHeight) || Number(img.height) || 1);
  const rw = Math.max(1, Number(dw) || 1);
  const rh = Math.max(1, Number(dh) || 1);
  const scale = Math.max(rw / iw, rh / ih);
  const sw = rw / scale;
  const sh = rh / scale;
  const sx = Math.max(0, (iw - sw) / 2);
  const sy = Math.max(0, (ih - sh) / 2);
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, rw, rh);
}

function shouldSmoothWhenScaledDown(img, drawWidth, drawHeight) {
  if (!img) return false;
  const srcW = Math.max(1, Number(img.naturalWidth) || Number(img.width) || 1);
  const srcH = Math.max(1, Number(img.naturalHeight) || Number(img.height) || 1);
  const dstW = Math.max(1, Number(drawWidth) || 1);
  const dstH = Math.max(1, Number(drawHeight) || 1);
  return dstW < srcW || dstH < srcH;
}

function setCanvasImageSmoothing(ctx, enabled) {
  if (!ctx) return;
  const on = enabled === true;
  ctx.imageSmoothingEnabled = on;
  if ('imageSmoothingQuality' in ctx) {
    try {
      ctx.imageSmoothingQuality = on ? 'high' : 'low';
    } catch (_) {
      // ignore unsupported assignment
    }
  }
}

function tintInfoSpecialMaskImage(maskImg, bgImg, width, height, darkHex, lightHex) {
  const w = Math.max(1, Math.round(Number(width) || 1));
  const h = Math.max(1, Math.round(Number(height) || 1));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cctx = c.getContext('2d', { willReadFrequently: true });
  cctx.clearRect(0, 0, w, h);
  setCanvasImageSmoothing(cctx, shouldSmoothWhenScaledDown(maskImg, w, h));
  cctx.drawImage(maskImg, 0, 0, w, h);
  const imageData = cctx.getImageData(0, 0, w, h);
  const arr = imageData.data;
  let bgArr = null;
  if (bgImg) {
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = w;
    bgCanvas.height = h;
    const bgCtx = bgCanvas.getContext('2d', { willReadFrequently: true });
    bgCtx.clearRect(0, 0, w, h);
    // 这里要做严格白色(255,255,255)判定，不能插值。
    setCanvasImageSmoothing(bgCtx, false);
    bgCtx.drawImage(bgImg, 0, 0, w, h);
    bgArr = bgCtx.getImageData(0, 0, w, h).data;
  }
  const dark = hexColorToRgbObject(darkHex, '#5f3c22');
  const light = hexColorToRgbObject(lightHex, '#f6d9a7');
  for (let i = 0; i < arr.length; i += 4) {
    const a = arr[i + 3];
    if (a === 0) continue;
    if (bgArr) {
      const bgA = bgArr[i + 3];
      if (bgA === 0) {
        arr[i + 3] = 0;
        continue;
      }
      const bgR = bgArr[i];
      const bgG = bgArr[i + 1];
      const bgB = bgArr[i + 2];
      const isBgWhiteRegion =
        bgR === INFO_SPECIAL_BG_WHITE_VALUE &&
        bgG === INFO_SPECIAL_BG_WHITE_VALUE &&
        bgB === INFO_SPECIAL_BG_WHITE_VALUE;
      if (!isBgWhiteRegion) {
        arr[i + 3] = 0;
        continue;
      }
    }
    const r = arr[i];
    const g = arr[i + 1];
    const b = arr[i + 2];
    const t = (r + g + b) / 765;
    arr[i] = Math.round(dark.r + (light.r - dark.r) * t);
    arr[i + 1] = Math.round(dark.g + (light.g - dark.g) * t);
    arr[i + 2] = Math.round(dark.b + (light.b - dark.b) * t);
  }
  cctx.putImageData(imageData, 0, 0);
  return c;
}

async function drawInfoSpecialLayer(ctx, layer, options = {}) {
  const normalized = normalizeInfoLayer(layer, 'special');
  if (!hasRenderableInfoSpecialLayer(normalized)) return null;
  const symbolItem = resolveInfoSpecialLayerItem(normalized, 'symbol');
  if (!symbolItem || !symbolItem.path) return null;
  const symbolImg = await loadImgHd(symbolItem.path);
  if (!symbolImg) return null;
  const bgItem = resolveInfoSpecialLayerItem(normalized, 'background');
  const maskItem = resolveInfoSpecialLayerItem(normalized, 'mask');
  const bgImg = bgItem && bgItem.path ? await loadImgHd(bgItem.path) : null;
  const maskImg = maskItem && maskItem.path ? await loadImgHd(maskItem.path) : null;

  const hasFixedSize = normalized.sizeMode === 'fixed' && Number.isFinite(Number(normalized.targetSize)) && Number(normalized.targetSize) > 0;
  const fixedSize = hasFixedSize ? Math.max(1, Math.round(Number(normalized.targetSize))) : 0;
  const width = hasFixedSize ? fixedSize : Math.max(1, Math.round(symbolImg.naturalWidth * normalized.scale));
  const height = hasFixedSize ? fixedSize : Math.max(1, Math.round(symbolImg.naturalHeight * normalized.scale));
  const offsetX = Number.isFinite(Number(options.offsetX)) ? Number(options.offsetX) : 0;
  const offsetY = Number.isFinite(Number(options.offsetY)) ? Number(options.offsetY) : 0;
  const canDrawMask = !!bgImg && !!maskImg;

  ctx.save();
  ctx.globalAlpha = normalized.opacity;
  if (bgImg) {
    setCanvasImageSmoothing(ctx, shouldSmoothWhenScaledDown(bgImg, width, height));
    ctx.drawImage(bgImg, normalized.x + offsetX, normalized.y + offsetY, width, height);
  }
  if (canDrawMask) {
    const tintedMask = tintInfoSpecialMaskImage(
      maskImg,
      bgImg,
      width,
      height,
      normalized.maskDarkColor,
      normalized.maskLightColor
    );
    // tintedMask 输出尺寸即绘制尺寸，这里无需插值。
    setCanvasImageSmoothing(ctx, false);
    ctx.drawImage(tintedMask, normalized.x + offsetX, normalized.y + offsetY, width, height);
  }
  setCanvasImageSmoothing(ctx, shouldSmoothWhenScaledDown(symbolImg, width, height));
  ctx.drawImage(symbolImg, normalized.x + offsetX, normalized.y + offsetY, width, height);
  ctx.restore();
  return {
    normalized,
    symbolItem,
    bgItem,
    maskItem,
    width,
    height,
  };
}

async function drawInfoIconLayer(ctx, layer, options = {}) {
  const normalized = normalizeInfoLayer(layer, 'icon');
  if (!hasRenderableInfoIconLayer(normalized)) return null;
  const items = resolveInfoIconLayerItems(normalized);
  if (!items.length) return null;
  const hasFixedSize = normalized.sizeMode === 'fixed' && Number.isFinite(Number(normalized.targetSize)) && Number(normalized.targetSize) > 0;
  const fixedSize = hasFixedSize ? Math.max(1, Math.round(Number(normalized.targetSize))) : 0;
  const offsetX = Number.isFinite(Number(options.offsetX)) ? Number(options.offsetX) : 0;
  const offsetY = Number.isFinite(Number(options.offsetY)) ? Number(options.offsetY) : 0;

  if (isInfoActivityIconLayer(normalized)) {
    const drawSize = Math.max(1, INFO_ACTIVITY_ICON_SIZE_PX);
    const gap = Math.max(0, INFO_ACTIVITY_ICON_GAP_PX);
    const totalWidth = items.length > 0 ? drawSize * items.length + gap * (items.length - 1) : 0;
    const loaded = await Promise.all(
      items.map(async item => {
        if (!item || !item.path) return null;
        const img = await loadImgHd(item.path);
        if (!img) return null;
        return { item, img };
      })
    );
    const drawables = loaded.filter(Boolean);
    if (!drawables.length) return null;
    ctx.save();
    ctx.globalAlpha = normalized.opacity;
    for (let idx = 0; idx < drawables.length; idx += 1) {
      const drawable = drawables[idx];
      const dx = normalized.x + offsetX + idx * (drawSize + gap);
      const dy = normalized.y + offsetY;
      setCanvasImageSmoothing(ctx, shouldSmoothWhenScaledDown(drawable.img, drawSize, drawSize));
      ctx.drawImage(drawable.img, dx, dy, drawSize, drawSize);
    }
    ctx.restore();
    return {
      normalized,
      items: drawables.map(entry => entry.item),
      width: totalWidth,
      height: drawSize,
    };
  }

  const item = items[0];
  if (!item || !item.path) return null;
  const img = await loadImgHd(item.path);
  if (!img) return null;
  const width = hasFixedSize ? fixedSize : Math.max(1, Math.round(img.naturalWidth * normalized.scale));
  const height = hasFixedSize ? fixedSize : Math.max(1, Math.round(img.naturalHeight * normalized.scale));
  ctx.save();
  ctx.globalAlpha = normalized.opacity;
  setCanvasImageSmoothing(ctx, shouldSmoothWhenScaledDown(img, width, height));
  ctx.drawImage(img, normalized.x + offsetX, normalized.y + offsetY, width, height);
  ctx.restore();
  return {
    normalized,
    item,
    width,
    height,
  };
}

function resolveTextLayerMinXOffsetFromAnchor(layer) {
  const normalized = normalizeInfoLayer(layer, 'text');
  const layout = computeTextLayerLayout(normalized);
  const minX = Number(layout && layout.bounds ? layout.bounds.minX : NaN);
  const anchorX = Math.round(normalized.x);
  if (!Number.isFinite(minX) || !Number.isFinite(anchorX)) return 0;
  return minX - anchorX;
}

function buildInfoRuntimeLayers(rawLayers = infoLayers) {
  const baseLayers = normalizeInfoLayers(rawLayers);
  const resolvedLayers = [];
  const resolvedById = new Map();
  for (const layer of baseLayers) {
    if (!layer || layer.type !== 'text') {
      resolvedLayers.push(layer);
      if (layer && layer.id) resolvedById.set(layer.id, layer);
      continue;
    }
    const normalized = normalizeInfoLayer(layer, 'text');
    const followLayerId = normalizeInfoTextFollowLayerId(normalized.followLayerId);
    let next = normalized;
    if (followLayerId) {
      const sourceLayer =
        resolvedById.get(followLayerId) ||
        baseLayers.find(item => item && item.type === 'text' && item.id === followLayerId) ||
        null;
      if (sourceLayer) {
        const sourceNormalized = normalizeInfoLayer(sourceLayer, 'text');
        const sourceLayout = computeTextLayerLayout(sourceNormalized);
        const sourceRight = Number(sourceLayout && sourceLayout.bounds ? sourceLayout.bounds.maxX : NaN);
        if (Number.isFinite(sourceRight)) {
          const gap = Number.isFinite(Number(normalized.followXGap)) ? Number(normalized.followXGap) : 0;
          const targetMinOffset = resolveTextLayerMinXOffsetFromAnchor(normalized);
          const nextX = Math.round(sourceRight + gap - targetMinOffset);
          next = normalizeInfoLayer({ ...normalized, x: nextX }, 'text');
        }
      }
    }
    resolvedLayers.push(next);
    if (next && next.id) resolvedById.set(next.id, next);
  }
  return resolvedLayers;
}

async function drawInfoLayers(ctx, rawLayers = infoLayers, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const trackHitRegions = opts.trackHitRegions === true;
  const regions = trackHitRegions ? [] : null;
  const baseLayers = normalizeInfoLayers(rawLayers);
  await ensureInfoFollowTextLayerFontsReady(baseLayers);
  const layers = buildInfoRuntimeLayers(baseLayers);
  for (let idx = 0; idx < layers.length; idx += 1) {
    const layer = layers[idx];
    let drawResult = null;
    if (layer.type === 'icon') {
      drawResult = await drawInfoIconLayer(ctx, layer);
    } else if (layer.type === 'special') {
      drawResult = await drawInfoSpecialLayer(ctx, layer);
    } else if (layer.type === 'fixed') {
      drawResult = await drawInfoFixedLayer(ctx, layer);
    } else if (layer.type === 'bar48') {
      drawResult = await drawInfoBar48Layer(ctx, layer);
    } else {
      drawResult = await drawTextLayer(ctx, layer);
    }
    if (trackHitRegions) {
      const region = buildInfoLayerHitRegion(idx, layer, drawResult);
      if (region) regions.push(region);
    }
  }
  if (trackHitRegions) setInfoLayerHitRegions(regions);
}

async function createInfoTextLayerData(layer) {
  const normalizedLayer = normalizeInfoLayer(layer, 'text');
  const normalized = normalizeTextLayerState(normalizedLayer);
  if (!hasRenderableTextLayer(normalized)) return null;
  await ensureTextLayerFontReady(normalized);
  const layout = computeTextLayerLayout(normalized);
  const padding = 2;
  const x = Math.floor(layout.bounds.minX) - padding;
  const y = Math.floor(layout.bounds.minY) - padding;
  const width = Math.max(1, Math.ceil(layout.bounds.width + padding * 2));
  const height = Math.max(1, Math.ceil(layout.bounds.height + padding * 2));

  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  await drawTextLayer(ctx, normalized, { offsetX: -x, offsetY: -y });

  return {
    name: normalizedLayer.name || '文字图层',
    x,
    y,
    width,
    height,
    rgbaData: canvasToPngDataUrl(c),
    sourceType: 'info-text',
  };
}

async function createInfoIconLayerData(layer) {
  const normalized = normalizeInfoLayer(layer, 'icon');
  if (!hasRenderableInfoIconLayer(normalized)) return null;
  const items = resolveInfoIconLayerItems(normalized);
  if (!items.length) return null;

  if (isInfoActivityIconLayer(normalized)) {
    const drawSize = Math.max(1, INFO_ACTIVITY_ICON_SIZE_PX);
    const gap = Math.max(0, INFO_ACTIVITY_ICON_GAP_PX);
    const width = drawSize * items.length + gap * Math.max(0, items.length - 1);
    const height = drawSize;
    const c = document.createElement('canvas');
    c.width = Math.max(1, width);
    c.height = Math.max(1, height);
    const ctx = c.getContext('2d');
    ctx.globalAlpha = normalized.opacity;
    for (let idx = 0; idx < items.length; idx += 1) {
      const item = items[idx];
      if (!item || !item.path) continue;
      await ensureHdLoaded(item.path);
      const img = imgCacheHd[item.path];
      if (!img) continue;
      const x = idx * (drawSize + gap);
      setCanvasImageSmoothing(ctx, shouldSmoothWhenScaledDown(img, drawSize, drawSize));
      ctx.drawImage(img, x, 0, drawSize, drawSize);
    }
    return {
      name: normalized.name || '活动图标',
      x: normalized.x,
      y: normalized.y,
      width: c.width,
      height: c.height,
      rgbaData: canvasToPngDataUrl(c),
      sourceType: 'info-icon',
    };
  }

  const item = items[0];
  if (!item || !item.path) return null;
  await ensureHdLoaded(item.path);
  const img = imgCacheHd[item.path];
  if (!img) return null;
  const hasFixedSize = normalized.sizeMode === 'fixed' && Number.isFinite(Number(normalized.targetSize)) && Number(normalized.targetSize) > 0;
  const fixedSize = hasFixedSize ? Math.max(1, Math.round(Number(normalized.targetSize))) : 0;
  const width = hasFixedSize ? fixedSize : Math.max(1, Math.round(img.naturalWidth * normalized.scale));
  const height = hasFixedSize ? fixedSize : Math.max(1, Math.round(img.naturalHeight * normalized.scale));
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  setCanvasImageSmoothing(ctx, shouldSmoothWhenScaledDown(img, width, height));
  ctx.globalAlpha = normalized.opacity;
  ctx.drawImage(img, 0, 0, width, height);
  return {
    name: normalized.name || item.name || item.id || '图标图层',
    x: normalized.x,
    y: normalized.y,
    width,
    height,
    rgbaData: canvasToPngDataUrl(c),
    sourceType: 'info-icon',
  };
}

async function createInfoSpecialLayerData(layer) {
  const normalized = normalizeInfoLayer(layer, 'special');
  if (!hasRenderableInfoSpecialLayer(normalized)) return null;
  const symbolItem = resolveInfoSpecialLayerItem(normalized, 'symbol');
  if (!symbolItem || !symbolItem.path) return null;
  await ensureHdLoaded(symbolItem.path);
  const symbolImg = imgCacheHd[symbolItem.path];
  if (!symbolImg) return null;
  const hasFixedSize = normalized.sizeMode === 'fixed' && Number.isFinite(Number(normalized.targetSize)) && Number(normalized.targetSize) > 0;
  const fixedSize = hasFixedSize ? Math.max(1, Math.round(Number(normalized.targetSize))) : 0;
  const width = hasFixedSize ? fixedSize : Math.max(1, Math.round(symbolImg.naturalWidth * normalized.scale));
  const height = hasFixedSize ? fixedSize : Math.max(1, Math.round(symbolImg.naturalHeight * normalized.scale));
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  await drawInfoSpecialLayer(ctx, normalized, {
    offsetX: -normalized.x,
    offsetY: -normalized.y,
  });
  return {
    name: normalized.name || '寓意图层',
    x: normalized.x,
    y: normalized.y,
    width,
    height,
    rgbaData: canvasToPngDataUrl(c),
    sourceType: 'info-special',
  };
}

async function createInfoFixedLayerData(layer) {
  const normalized = normalizeInfoLayer(layer, 'fixed');
  if (!hasRenderableInfoFixedLayer(normalized)) return null;
  const assetPath = normalizeInfoAssetPath(normalized.path);
  if (!assetPath) return null;
  await ensureHdLoaded(assetPath);
  const img = imgCacheHd[assetPath];
  if (!img) return null;
  const width = Number.isFinite(Number(normalized.width)) && Number(normalized.width) > 0
    ? Math.max(1, Math.round(Number(normalized.width)))
    : Math.max(1, Math.round(img.naturalWidth));
  const height = Number.isFinite(Number(normalized.height)) && Number(normalized.height) > 0
    ? Math.max(1, Math.round(Number(normalized.height)))
    : Math.max(1, Math.round(img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  setCanvasImageSmoothing(ctx, shouldSmoothWhenScaledDown(img, width, height));
  ctx.globalAlpha = normalized.opacity;
  ctx.drawImage(img, 0, 0, width, height);
  return {
    name: normalized.name || '固定图层',
    x: normalized.x,
    y: normalized.y,
    width,
    height,
    rgbaData: canvasToPngDataUrl(c),
    sourceType: 'info-fixed',
  };
}

async function createInfoBar48LayerData(layer) {
  const meta = computeInfoBar48Bounds(layer);
  const normalized = meta.normalized;
  if (!hasRenderableInfoBar48Layer(normalized)) return null;
  const width = meta.width;
  const height = meta.height;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  await drawInfoBar48Layer(ctx, normalized, {
    offsetX: -normalized.x,
    offsetY: -normalized.y,
  });
  return {
    name: normalized.name || '48条形图层',
    x: normalized.x,
    y: normalized.y,
    width,
    height,
    rgbaData: canvasToPngDataUrl(c),
    sourceType: 'info-bar48',
  };
}

async function createInfoLayerData(layer) {
  const candidateType = String(layer && layer.type ? layer.type : '').trim().toLowerCase();
  const resolvedType = INFO_LAYER_TYPES.includes(candidateType) ? candidateType : 'text';
  const normalized = normalizeInfoLayer(layer, resolvedType);
  if (normalized.type === 'icon') return createInfoIconLayerData(normalized);
  if (normalized.type === 'special') return createInfoSpecialLayerData(normalized);
  if (normalized.type === 'fixed') return createInfoFixedLayerData(normalized);
  if (normalized.type === 'bar48') return createInfoBar48LayerData(normalized);
  return createInfoTextLayerData(normalized);
}

async function createMergedInfoLayersData(rawLayers = infoLayers) {
  const layers = buildInfoRuntimeLayers(rawLayers);
  const hasRenderable = layers.some(layer => hasRenderableAnyInfoLayer(layer));
  if (!hasRenderable) return null;
  const c = document.createElement('canvas');
  c.width = CANVAS_FULL.w;
  c.height = CANVAS_FULL.h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.imageSmoothingEnabled = false;
  await drawInfoLayers(ctx, layers);
  return {
    name: '信息图层',
    x: 0,
    y: 0,
    width: c.width,
    height: c.height,
    rgbaData: canvasToPngDataUrl(c),
    sourceType: 'info-merged',
  };
}

function countRenderableInfoLayers() {
  const layers = normalizeInfoLayers(infoLayers);
  const visibleIndices = getInfoLayerListIndicesForCurrentPreset(layers);
  let count = 0;
  for (const index of visibleIndices) {
    const layer = layers[index];
    if (hasRenderableAnyInfoLayer(layer)) {
      count++;
    }
  }
  return count;
}

function collectInfoIconPathsForRender() {
  const out = [];
  const layers = normalizeInfoLayers(infoLayers);
  const visibleIndices = getInfoLayerListIndicesForCurrentPreset(layers);
  for (const index of visibleIndices) {
    const layer = layers[index];
    if (!layer || layer.enabled !== true) continue;
    if (layer.type === 'icon') {
      const items = resolveInfoIconLayerItems(layer);
      for (const item of items) {
        if (item && item.path) out.push(item.path);
      }
      continue;
    }
    if (layer.type === 'special') {
      const bgItem = resolveInfoSpecialLayerItem(layer, 'background');
      const maskItem = resolveInfoSpecialLayerItem(layer, 'mask');
      const symbolItem = resolveInfoSpecialLayerItem(layer, 'symbol');
      if (bgItem && bgItem.path) out.push(bgItem.path);
      if (maskItem && maskItem.path) out.push(maskItem.path);
      if (symbolItem && symbolItem.path) out.push(symbolItem.path);
      continue;
    }
    if (layer.type === 'fixed') {
      const normalizedFixed = normalizeInfoLayer(layer, 'fixed');
      const fixedPath = normalizeInfoAssetPath(normalizedFixed.path);
      if (fixedPath) out.push(fixedPath);
      continue;
    }
    if (layer.type === 'bar48') {
      const normalizedBar = normalizeInfoLayer(layer, 'bar48');
      const emptyPath = normalizeInfoAssetPath(normalizedBar.emptyPath);
      const fillPath = normalizeInfoAssetPath(normalizedBar.fillPath);
      if (emptyPath) out.push(emptyPath);
      if (fillPath) out.push(fillPath);
      continue;
    }
    const normalizedText = normalizeInfoLayer(layer, 'text');
    const inlineIconPath = normalizeInfoInlineIconPath(normalizedText.inlineIconPath);
    const inlineIconWidth = Number(normalizedText.inlineIconWidth) || Number(normalizedText.inlineIconSize) || 0;
    const inlineIconHeight = Number(normalizedText.inlineIconHeight) || Number(normalizedText.inlineIconSize) || 0;
    if (inlineIconPath && inlineIconWidth > 0 && inlineIconHeight > 0) out.push(inlineIconPath);
  }
  return out;
}
