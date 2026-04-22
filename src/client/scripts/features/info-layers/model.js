function createDefaultTextLayerState() {
  return {
    enabled: true,
    text: '',
    fontFamily: 'Eorzea',
    bold: false,
    italic: false,
    underline: false,
    smallCaps: false,
    freeLigatures: false,
    renderEffect: TEXT_RENDER_EFFECT_NONE,
    fontVariant: 'regular',
    align: 'center',
    x: Math.round(CANVAS_FULL.w / 2),
    y: Math.round(CANVAS_FULL.h / 2),
    fontSize: 96,
    lineHeightMode: 'auto',
    lineHeight: 1.2,
    tracking: 0,
    kerningVA: 0,
    scaleXPercent: 100,
    scaleYPercent: 100,
    baselineShift: 0,
    adaptiveColorSource: INFO_TEXT_ADAPTIVE_COLOR_SOURCE_BASE,
    adaptiveColorFont1: '',
    adaptiveColorFont2: '',
    svgTextCalt: false,
    followLayerId: '',
    followXGap: 0,
    color: '#ffffff',
    inlineIconPath: '',
    inlineIconSize: 0,
    inlineIconWidth: 0,
    inlineIconHeight: 0,
    inlineIconGap: 6,
    strokeEnabled: false,
    strokePosition: 'outside',
    strokeWidth: 1,
    strokeColor: '#000000',
    opacity: 1,
  };
}

function clampNumberInRange(raw, min, max, fallback) {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeHexColor(raw, fallback = '#ffffff') {
  const v = String(raw || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return (
      '#' +
      v[1] + v[1] +
      v[2] + v[2] +
      v[3] + v[3]
    ).toLowerCase();
  }
  let m = v.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);
  if (!m) m = v.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (m) {
    const nums = [m[1], m[2], m[3]].map(n => Math.max(0, Math.min(255, Number(n) || 0)));
    return (
      '#' +
      nums.map(n => n.toString(16).padStart(2, '0')).join('')
    ).toLowerCase();
  }
  return fallback;
}

function normalizeOptionalHexColor(raw) {
  const SENTINEL = '__invalid__';
  const normalized = normalizeHexColor(raw, SENTINEL);
  return normalized === SENTINEL ? '' : normalized;
}

function normalizeInfoInlineIconPath(raw) {
  let v = String(raw == null ? '' : raw).trim();
  if (!v) return '';
  v = v.replace(/\\/g, '/').replace(/\s+/g, ' ').trim();
  if (!v) return '';
  if (/^(https?:)?\/\//i.test(v) || /^data:/i.test(v) || /^blob:/i.test(v)) return v;
  const lower = v.toLowerCase();
  const uiIdx = lower.lastIndexOf('/ui/');
  if (uiIdx >= 0) {
    return v.slice(uiIdx + 1).replace(/^\/+/, '');
  }
  return v.replace(/^\/+/, '');
}

function isWorldTransrate4InlineIconPath(iconPathNorm) {
  if (!iconPathNorm) return false;
  const s = String(iconPathNorm).toLowerCase().replace(/\\/g, '/');
  return s === 'ui/sprites/worldtransrate_4.png' || s.endsWith('/worldtransrate_4.png');
}

function normalizeInfoAssetPath(raw) {
  return normalizeInfoInlineIconPath(raw);
}

function normalizeInfoTextFollowLayerId(raw) {
  return String(raw == null ? '' : raw).trim().slice(0, 80);
}

function normalizeInfoBar48States(raw) {
  const out = [];
  if (Array.isArray(raw)) {
    for (const item of raw) out.push(item ? 1 : 0);
  } else if (typeof raw === 'string') {
    for (const ch of raw) {
      if (ch === '0' || ch === '1') out.push(ch === '1' ? 1 : 0);
    }
  }
  while (out.length < INFO_BAR48_COUNT) out.push(0);
  if (out.length > INFO_BAR48_COUNT) out.length = INFO_BAR48_COUNT;
  return out;
}

function parseImageIdFromLayerToken(raw) {
  const src = String(raw == null ? '' : raw).trim();
  if (!src) return null;
  const direct = src.match(/^(\d+)$/);
  if (direct) {
    const n = Number(direct[1]);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  const tail = src.match(/(\d+)(?:_hr\d+)?(?:\.[A-Za-z0-9]+)?$/);
  if (!tail) return null;
  const n = Number(tail[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function splitCsvLineWithQuotes(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  const text = String(line || '');
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === ',') {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseInfoActivityRowsFromCsvText(csvText) {
  const lines = String(csvText || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(line => String(line || '').trim())
    .filter(Boolean);
  if (!lines.length) return [];
  let schemaIdx = lines.findIndex(line => line.startsWith('int32,'));
  if (schemaIdx < 0) schemaIdx = 2;
  const out = [];
  for (let i = schemaIdx + 1; i < lines.length; i += 1) {
    const cols = splitCsvLineWithQuotes(lines[i]);
    if (cols.length < 4) continue;
    const key = Number.parseInt(cols[0], 10);
    const image = Number.parseInt(cols[1], 10);
    if (!Number.isFinite(key) || key < 0) continue;
    if (!Number.isFinite(image) || image <= 0) continue;
    const name = String(cols[3] || '').trim();
    out.push({ key, image, name });
  }
  return out;
}

function buildInfoActivityFilesFromCsvRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const num = Math.trunc(Number(row && row.image));
    if (!Number.isFinite(num) || num <= 0) continue;
    const id = String(num).padStart(6, '0');
    if (!/^\d{6}$/.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const file = `${id}_hr1.png`;
    out.push({
      id,
      file,
      path: `ui/icon/${INFO_ICON_ACTIVITY_FOLDER}/${file}`,
      name: String(row && row.name ? row.name : '').trim() || id,
    });
  }
  return out;
}

async function ensureInfoActivityIconCategoryLoaded() {
  const nameplate = fileData && fileData.nameplate && typeof fileData.nameplate === 'object'
    ? fileData.nameplate
    : null;
  if (!nameplate) return;
  const existing = nameplate[INFO_ICON_ACTIVITY_CATEGORY];
  if (Array.isArray(existing) && existing.length > 0) return;
  try {
    const resp = await fetch(appPath(CHARA_CARD_PLAY_STYLE_MIXED_CSV_PATH + `?_=${Date.now()}`));
    if (!resp.ok) return;
    const text = await resp.text();
    const rows = parseInfoActivityRowsFromCsvText(text);
    const built = buildInfoActivityFilesFromCsvRows(rows);
    if (built.length > 0) {
      nameplate[INFO_ICON_ACTIVITY_CATEGORY] = built;
    }
  } catch (_) {
    // keep silent: old server may not expose this csv path
  }
}

function parseImageFontColorMap(csvText, imageColIndex, fontColorColIndex) {
  const map = new Map();
  const lines = String(csvText || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();
    if (!line || !/^\d+,/.test(line)) continue;
    const cols = line.split(',');
    const minLen = Math.max(imageColIndex, fontColorColIndex) + 1;
    if (cols.length < minLen) continue;
    const imageId = Number(cols[imageColIndex]);
    const fontColor = Number(cols[fontColorColIndex]);
    if (!Number.isInteger(imageId) || imageId <= 0) continue;
    if (fontColor !== 1 && fontColor !== 2) continue;
    map.set(imageId, fontColor);
  }
  return map;
}

function parseCharaCardBaseFontColorMap(csvText) {
  return parseImageFontColorMap(csvText, 1, 2);
}

function parseCharaCardHeaderTopFontColorMap(csvText) {
  // CharaCardHeader: col[1]=TopImage, col[3]=FontColor
  return parseImageFontColorMap(csvText, 1, 3);
}

async function ensureNameplateBaseFontColorMapLoaded() {
  if (nameplateBaseFontColorByImageId) return nameplateBaseFontColorByImageId;
  if (!nameplateBaseFontColorLoadPromise) {
    nameplateBaseFontColorLoadPromise = (async () => {
      try {
        const resp = await fetch(appPath(CHARA_CARD_BASE_CSV_PATH));
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const csvText = await resp.text();
        nameplateBaseFontColorByImageId = parseCharaCardBaseFontColorMap(csvText);
      } catch (e) {
        console.warn('[info-text-color] 加载 CharaCardBase.csv 失败:', e);
        nameplateBaseFontColorByImageId = new Map();
      }
      return nameplateBaseFontColorByImageId;
    })();
  }
  return nameplateBaseFontColorLoadPromise;
}

async function ensureNameplateHeaderFontColorMapLoaded() {
  if (nameplateHeaderFontColorByTopImageId) return nameplateHeaderFontColorByTopImageId;
  if (!nameplateHeaderFontColorLoadPromise) {
    nameplateHeaderFontColorLoadPromise = (async () => {
      try {
        const resp = await fetch(appPath(CHARA_CARD_HEADER_CSV_PATH));
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const csvText = await resp.text();
        nameplateHeaderFontColorByTopImageId = parseCharaCardHeaderTopFontColorMap(csvText);
      } catch (e) {
        console.warn('[info-text-color] 加载 CharaCardHeader.csv 失败:', e);
        nameplateHeaderFontColorByTopImageId = new Map();
      }
      return nameplateHeaderFontColorByTopImageId;
    })();
  }
  return nameplateHeaderFontColorLoadPromise;
}

function resolveSelectedNameplateBaseImageId() {
  const item = selected && selected[NAMEPLATE_BASE_CATEGORY];
  if (!item || typeof item !== 'object') return null;
  return (
    parseImageIdFromLayerToken(item.id) ||
    parseImageIdFromLayerToken(item.file) ||
    parseImageIdFromLayerToken(item.path) ||
    null
  );
}

async function resolveSelectedNameplateBaseFontColorByte() {
  const imageId = resolveSelectedNameplateBaseImageId();
  if (!imageId) return null;
  const map = await ensureNameplateBaseFontColorMapLoaded();
  const val = map ? map.get(imageId) : null;
  return val === 1 || val === 2 ? val : null;
}

function resolveSelectedNameplateHeaderImageId() {
  const item = selected && selected[NAMEPLATE_HEADER_CATEGORY];
  if (!item || typeof item !== 'object') return null;
  return (
    parseImageIdFromLayerToken(item.id) ||
    parseImageIdFromLayerToken(item.file) ||
    parseImageIdFromLayerToken(item.path) ||
    null
  );
}

async function resolveSelectedNameplateHeaderFontColorByte() {
  const imageId = resolveSelectedNameplateHeaderImageId();
  if (!imageId) return null;
  const map = await ensureNameplateHeaderFontColorMapLoaded();
  const val = map ? map.get(imageId) : null;
  return val === 1 || val === 2 ? val : null;
}

function normalizeInfoTextAdaptiveColorSource(raw) {
  if (raw === INFO_TEXT_ADAPTIVE_COLOR_SOURCE_NONE) {
    return INFO_TEXT_ADAPTIVE_COLOR_SOURCE_NONE;
  }
  if (raw === INFO_TEXT_ADAPTIVE_COLOR_SOURCE_HEADER_THEN_BASE) {
    return INFO_TEXT_ADAPTIVE_COLOR_SOURCE_HEADER_THEN_BASE;
  }
  return INFO_TEXT_ADAPTIVE_COLOR_SOURCE_BASE;
}

async function resolveAdaptiveInfoTextColorByteBySource(source) {
  const normalizedSource = normalizeInfoTextAdaptiveColorSource(source);
  if (normalizedSource === INFO_TEXT_ADAPTIVE_COLOR_SOURCE_HEADER_THEN_BASE) {
    const fromHeader = await resolveSelectedNameplateHeaderFontColorByte();
    if (fromHeader === 1 || fromHeader === 2) return fromHeader;
    return resolveSelectedNameplateBaseFontColorByte();
  }
  return resolveSelectedNameplateBaseFontColorByte();
}

function isAutoAdaptiveInfoTextColor(hexColor) {
  const c = normalizeHexColor(hexColor, '#ffffff');
  return c === '#000000' || c === '#ffffff';
}

async function resolveAdaptiveInfoTextColor(
  hexColor,
  adaptiveColorSource = INFO_TEXT_ADAPTIVE_COLOR_SOURCE_BASE,
  options = null
) {
  const base = normalizeHexColor(hexColor, '#ffffff');
  const normalizedSource = normalizeInfoTextAdaptiveColorSource(adaptiveColorSource);
  if (normalizedSource === INFO_TEXT_ADAPTIVE_COLOR_SOURCE_NONE) return base;
  const opt = options && typeof options === 'object' ? options : {};
  const adaptiveColorFont1 = normalizeOptionalHexColor(opt.adaptiveColorFont1);
  const adaptiveColorFont2 = normalizeOptionalHexColor(opt.adaptiveColorFont2);
  const hasCustomAdaptiveColorMap = !!(adaptiveColorFont1 || adaptiveColorFont2);
  if (!hasCustomAdaptiveColorMap && !isAutoAdaptiveInfoTextColor(base)) return base;
  const fontColor = await resolveAdaptiveInfoTextColorByteBySource(normalizedSource);
  if (hasCustomAdaptiveColorMap) {
    if (fontColor === 1 && adaptiveColorFont1) return adaptiveColorFont1;
    if (fontColor === 2 && adaptiveColorFont2) return adaptiveColorFont2;
    return base;
  }
  // CharaCard*.FontColor: 1 => rgb(255,255,255), 2 => rgb(0,0,0)
  if (fontColor === 1) return '#ffffff';
  if (fontColor === 2) return '#000000';
  return base;
}

function normalizeTextLayerFontFamily(raw, fallback = 'Eorzea') {
  const source = typeof raw === 'string' ? raw : '';
  const cleaned = source
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TEXT_LAYER_FONT_FAMILY_MAX_LENGTH);
  return cleaned || fallback;
}

function isJupiterProFontFamily(fontFamily) {
  return String(fontFamily || '').trim().toLowerCase() === 'jupiter pro';
}

function getTextFontVariantOptions(fontFamily) {
  const key = String(fontFamily || '').trim().toLowerCase();
  return TEXT_FONT_VARIANT_BY_FAMILY[key] || TEXT_FONT_VARIANT_DEFAULT;
}

function normalizeTextLayerFontVariant(fontFamily, rawVariant, legacyBold = false) {
  const options = getTextFontVariantOptions(fontFamily);
  const fallbackKey = legacyBold ? 'bold' : 'regular';
  const raw = String(rawVariant == null ? '' : rawVariant).trim().toLowerCase();
  const hasRaw = options.some(item => item.key === raw);
  if (hasRaw) return raw;
  const hasFallback = options.some(item => item.key === fallbackKey);
  return hasFallback ? fallbackKey : (options[0] ? options[0].key : 'regular');
}

function resolveTextLayerFontVariantMeta(fontFamily, fontVariant) {
  const options = getTextFontVariantOptions(fontFamily);
  const key = String(fontVariant || '').trim().toLowerCase();
  return options.find(item => item.key === key) || options[0] || { key: 'regular', label: 'Regular', weight: 400 };
}

function normalizeTextLayerRenderEffect(rawEffect) {
  const raw = String(rawEffect == null ? '' : rawEffect).trim();
  return TEXT_RENDER_EFFECT_OPTIONS.includes(raw) ? raw : TEXT_RENDER_EFFECT_NONE;
}

function normalizeAndDedupeFontFamilies(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const family = normalizeTextLayerFontFamily(item, '');
    if (!family) continue;
    const key = family.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(family);
  }
  return out;
}

function knownTextLayerFontFamilySet() {
  const known = normalizeAndDedupeFontFamilies([
    ...TEXT_LAYER_PRESET_FONT_FAMILIES,
    ...textLayerLocalFontFamilies,
  ]);
  return new Set(known.map(name => String(name || '').trim().toLowerCase()).filter(Boolean));
}

function buildPresetTextLayerFallbackFontMap(presetName, side = portraitSide) {
  const targetName = normalizeInfoPresetName(presetName) || INFO_PRESET_DEFAULT_NAME;
  const preset = getInfoPresetDefinitionByName(targetName);
  const layers = preset
    ? buildInfoLayersFromPresetDefinition(preset, side)
    : normalizeInfoLayers([]);
  const fallbackMap = new Map();
  for (const layer of layers) {
    if (!layer || layer.type !== 'text') continue;
    const family = normalizeTextLayerFontFamily(layer.fontFamily, createDefaultTextLayerState().fontFamily);
    fallbackMap.set(layer.id, family);
  }
  return fallbackMap;
}

function sanitizeInfoTextLayerFontsForCurrentDevice(rawLayers, presetName, side = portraitSide) {
  const layers = normalizeInfoLayers(rawLayers);
  const knownSet = knownTextLayerFontFamilySet();
  const fallbackById = buildPresetTextLayerFallbackFontMap(presetName, side);
  return layers.map(layer => {
    if (!layer || layer.type !== 'text') return layer;
    const currentFamily = normalizeTextLayerFontFamily(layer.fontFamily, '');
    const known = currentFamily && knownSet.has(currentFamily.toLowerCase());
    if (known) return layer;
    const fallbackFamily = normalizeTextLayerFontFamily(
      fallbackById.get(layer.id),
      createDefaultTextLayerState().fontFamily
    );
    return normalizeInfoLayer({ ...layer, fontFamily: fallbackFamily }, 'text');
  });
}

function sanitizeInfoPresetStatesFontsForCurrentDevice(rawStates, side = portraitSide) {
  const normalizedStates = normalizeInfoPresetLayerStates(rawStates);
  const out = {};
  for (const name of INFO_PRESET_NAME_SET) {
    const layers = normalizedStates[name];
    if (!Array.isArray(layers)) continue;
    out[name] = sanitizeInfoTextLayerFontsForCurrentDevice(layers, name, side);
  }
  return out;
}

function sanitizeInfoLayerName(raw, fallback) {
  const v = String(raw == null ? '' : raw)
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return v || fallback;
}

function normalizeInfoLayerDisplayName(layerId, rawName, fallbackName) {
  const fallback = sanitizeInfoLayerName(fallbackName, '图层');
  const id = String(layerId == null ? '' : layerId).trim();
  const source = sanitizeInfoLayerName(rawName, fallback);
  if (id !== 'special-1') return source;
  const legacy = sanitizeInfoLayerName(rawName, '');
  if (legacy === '寓意图层' || legacy === '寓意图层 1') return 'bd队徽';
  return source;
}

function allocateInfoLayerId(type = 'text') {
  const prefixByType = {
    text: 'text',
    icon: 'icon',
    special: 'special',
    fixed: 'fixed',
    bar48: 'bar',
  };
  const prefix = prefixByType[type] || 'text';
  const id = `${prefix}-${infoLayerIdSeed++}`;
  return id;
}

function normalizeInfoLayerId(raw, type = 'text') {
  const v = String(raw == null ? '' : raw).trim().slice(0, 80);
  return v || allocateInfoLayerId(type);
}

function syncInfoLayerIdSeedFromLayers(layers) {
  let maxSeed = infoLayerIdSeed;
  for (const layer of layers) {
    const id = String(layer && layer.id ? layer.id : '');
    const m = id.match(/-(\d+)$/);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n)) maxSeed = Math.max(maxSeed, n + 1);
  }
  infoLayerIdSeed = maxSeed;
}

function infoIconCategories() {
  return [...INFO_ICON_EXTRA_CATS];
}

function normalizeInfoIconCategory(raw) {
  const cats = infoIconCategories();
  if (!cats.length) return '';
  let v = String(raw == null ? '' : raw);
  if (v === INFO_ICON_LEGACY_CATEGORY) v = INFO_ICON_LIMITED_CATEGORY;
  return cats.includes(v) ? v : cats[0];
}

function forcedInfoIconCategoryByLayerId(layerId) {
  const id = String(layerId == null ? '' : layerId).trim();
  return INFO_ICON_FORCED_CATEGORY_BY_LAYER_ID[id] || '';
}

function resolveInfoIconCategoryForLayer(layerOrId, rawCategory) {
  const layerId =
    layerOrId && typeof layerOrId === 'object'
      ? layerOrId.id
      : layerOrId;
  const forced = forcedInfoIconCategoryByLayerId(layerId);
  if (forced) return forced;
  return normalizeInfoIconCategory(rawCategory);
}

function normalizeInfoIconItemIds(raw, limit = INFO_ACTIVITY_ICON_MAX_COUNT) {
  const maxCount = Math.max(0, Math.round(Number(limit) || 0));
  const pool = Array.isArray(raw)
    ? raw
    : raw == null || raw === ''
      ? []
      : [raw];
  const out = [];
  const seen = new Set();
  for (const entry of pool) {
    if (out.length >= maxCount) break;
    const id = String(entry == null ? '' : entry).trim().slice(0, 120);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function isInfoActivityIconLayer(layer) {
  if (!layer || layer.type !== 'icon') return false;
  const cat = resolveInfoIconCategoryForLayer(layer, layer.sourceCat);
  return cat === INFO_ICON_ACTIVITY_CATEGORY;
}

function resolveInfoIconLayerItems(layer) {
  if (!layer || layer.type !== 'icon') return [];
  const cat = resolveInfoIconCategoryForLayer(layer, layer.sourceCat);
  if (!cat) return [];
  const files = layerListFor(cat);
  if (!Array.isArray(files) || files.length === 0) return [];
  const byId = new Map();
  for (const item of files) {
    if (!item || item.id == null) continue;
    const id = String(item.id);
    if (!byId.has(id)) byId.set(id, item);
  }
  if (isInfoActivityIconLayer(layer)) {
    const ids = normalizeInfoIconItemIds(
      Array.isArray(layer.itemIds) && layer.itemIds.length > 0
        ? layer.itemIds
        : layer.itemId
          ? [layer.itemId]
          : []
    );
    const out = [];
    for (const id of ids) {
      const hit = byId.get(String(id));
      if (hit) out.push(hit);
    }
    return out;
  }
  const id = String(layer.itemId == null ? '' : layer.itemId);
  if (!id) return [];
  const hit = byId.get(id);
  return hit ? [hit] : [];
}

function resolveInfoIconLayerItem(layer) {
  const items = resolveInfoIconLayerItems(layer);
  return items.length > 0 ? items[0] : null;
}

function normalizeInfoSpecialItemId(raw) {
  return String(raw == null ? '' : raw).trim().slice(0, 120);
}

function normalizeInfoSpecialLegacyItemId(raw) {
  const v = normalizeInfoSpecialItemId(raw);
  if (!v) return '';
  const m = v.match(/(?:^|[\\/])(\d{6})(?:_[^\\/]+)?(?:\.[A-Za-z0-9]+)?$/);
  return m ? m[1] : v;
}

function infoSpecialFieldKeyByKind(kind) {
  if (kind === 'background') return 'bgItemId';
  if (kind === 'mask') return 'maskItemId';
  return 'symbolItemId';
}

function infoSpecialCategoryByKind(kind) {
  if (kind === 'background') return INFO_SPECIAL_BG_CATEGORY;
  if (kind === 'mask') return INFO_SPECIAL_MASK_CATEGORY;
  return INFO_SPECIAL_SYMBOL_CATEGORY;
}

function listInfoSpecialCategoryItems(category) {
  const files = layerListFor(category);
  const out = [];
  for (const item of files) {
    if (!item || item.id == null || !item.path) continue;
    out.push({
      id: String(item.id),
      path: String(item.path),
      name: item.name || item.file || String(item.id),
      file: item.file || '',
    });
  }
  return out;
}

function resolveInfoSpecialLayerItemByCategory(category, itemId) {
  const id = normalizeInfoSpecialLegacyItemId(itemId);
  if (!id) return null;
  const files = listInfoSpecialCategoryItems(category);
  return files.find(item => {
    if (!item) return false;
    const candidateId = normalizeInfoSpecialLegacyItemId(item.id);
    const candidateFile = normalizeInfoSpecialLegacyItemId(item.file);
    return candidateId === id || candidateFile === id;
  }) || null;
}

function resolveInfoSpecialLayerItem(layer, kind = 'symbol') {
  if (!layer || layer.type !== 'special') return null;
  const fieldKey = infoSpecialFieldKeyByKind(kind);
  const category = infoSpecialCategoryByKind(kind);
  return resolveInfoSpecialLayerItemByCategory(category, layer[fieldKey]);
}

function resolveDefaultInfoSpecialSymbolItemId(fallback = '') {
  const files = listInfoSpecialCategoryItems(INFO_SPECIAL_SYMBOL_CATEGORY);
  const preferredId = normalizeInfoSpecialLegacyItemId(INFO_SPECIAL_DEFAULT_SYMBOL_ITEM_TOKEN);
  if (preferredId) {
    const preferredItem = files.find(item => {
      if (!item) return false;
      const byId = normalizeInfoSpecialLegacyItemId(item.id);
      const byFile = normalizeInfoSpecialLegacyItemId(item.file);
      return byId === preferredId || byFile === preferredId;
    });
    if (preferredItem) return preferredId;
  }
  if (files.length > 0) {
    const first = files[0];
    return normalizeInfoSpecialLegacyItemId(first.id || first.file);
  }
  return normalizeInfoSpecialLegacyItemId(fallback || INFO_SPECIAL_DEFAULT_SYMBOL_ITEM_TOKEN);
}

function hexColorToRgbObject(hexColor, fallback = '#ffffff') {
  const hex = normalizeHexColor(hexColor, fallback);
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function rgbObjectToHexColor(rgb, fallback = '#ffffff') {
  const src = rgb && typeof rgb === 'object' ? rgb : {};
  const r = Math.round(clampNumberInRange(src.r, 0, 255, NaN));
  const g = Math.round(clampNumberInRange(src.g, 0, 255, NaN));
  const b = Math.round(clampNumberInRange(src.b, 0, 255, NaN));
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return normalizeHexColor(fallback, '#ffffff');
  return (
    '#' +
    [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')
  ).toLowerCase();
}

function createDefaultInfoTextLayer(options = {}) {
  const src = options && typeof options === 'object' ? options : {};
  const defaults = createDefaultTextLayerState();
  return normalizeInfoLayer(
    {
      id: src.id,
      type: 'text',
      name: sanitizeInfoLayerName(src.name, '文字图层'),
      enabled: src.enabled == null ? true : src.enabled === true,
      text: src.text == null ? defaults.text : src.text,
      fontFamily: src.fontFamily == null ? defaults.fontFamily : src.fontFamily,
      bold: src.bold == null ? defaults.bold : src.bold,
      italic: src.italic == null ? defaults.italic : src.italic,
      underline: src.underline == null ? defaults.underline : src.underline,
      smallCaps: src.smallCaps == null ? defaults.smallCaps : src.smallCaps,
      freeLigatures: src.freeLigatures == null ? defaults.freeLigatures : src.freeLigatures,
      renderEffect: src.renderEffect == null ? defaults.renderEffect : src.renderEffect,
      fontVariant: src.fontVariant == null ? defaults.fontVariant : src.fontVariant,
      align: src.align == null ? defaults.align : src.align,
      x: src.x == null ? defaults.x : src.x,
      y: src.y == null ? defaults.y : src.y,
      fontSize: src.fontSize == null ? defaults.fontSize : src.fontSize,
      lineHeightMode: src.lineHeightMode == null ? defaults.lineHeightMode : src.lineHeightMode,
      lineHeight: src.lineHeight == null ? defaults.lineHeight : src.lineHeight,
      tracking: src.tracking == null ? defaults.tracking : src.tracking,
      kerningVA: src.kerningVA == null ? defaults.kerningVA : src.kerningVA,
      scaleXPercent: src.scaleXPercent == null ? defaults.scaleXPercent : src.scaleXPercent,
      scaleYPercent: src.scaleYPercent == null ? defaults.scaleYPercent : src.scaleYPercent,
      baselineShift: src.baselineShift == null ? defaults.baselineShift : src.baselineShift,
      adaptiveColorSource: src.adaptiveColorSource == null ? defaults.adaptiveColorSource : src.adaptiveColorSource,
      adaptiveColorFont1: src.adaptiveColorFont1 == null ? defaults.adaptiveColorFont1 : src.adaptiveColorFont1,
      adaptiveColorFont2: src.adaptiveColorFont2 == null ? defaults.adaptiveColorFont2 : src.adaptiveColorFont2,
      svgTextCalt: src.svgTextCalt == null ? defaults.svgTextCalt : src.svgTextCalt,
      followLayerId: src.followLayerId == null ? defaults.followLayerId : src.followLayerId,
      followXGap: src.followXGap == null ? defaults.followXGap : src.followXGap,
      color: src.color == null ? defaults.color : src.color,
      inlineIconPath: src.inlineIconPath == null ? defaults.inlineIconPath : src.inlineIconPath,
      inlineIconSize: src.inlineIconSize == null ? defaults.inlineIconSize : src.inlineIconSize,
      inlineIconWidth: src.inlineIconWidth == null ? defaults.inlineIconWidth : src.inlineIconWidth,
      inlineIconHeight: src.inlineIconHeight == null ? defaults.inlineIconHeight : src.inlineIconHeight,
      inlineIconGap: src.inlineIconGap == null ? defaults.inlineIconGap : src.inlineIconGap,
      strokeEnabled: src.strokeEnabled == null ? defaults.strokeEnabled : src.strokeEnabled,
      strokePosition: src.strokePosition == null ? defaults.strokePosition : src.strokePosition,
      strokeWidth: src.strokeWidth == null ? defaults.strokeWidth : src.strokeWidth,
      strokeColor: src.strokeColor == null ? defaults.strokeColor : src.strokeColor,
      opacity: src.opacity == null ? defaults.opacity : src.opacity,
    },
    'text'
  );
}

function createDefaultInfoIconLayer(options = {}) {
  const src = options && typeof options === 'object' ? options : {};
  const cats = infoIconCategories();
  const forcedSourceCat = forcedInfoIconCategoryByLayerId(src.id);
  const fallbackSourceCat = forcedSourceCat || cats[0] || '';
  const resolvedSourceCat = resolveInfoIconCategoryForLayer(
    src.id,
    src.sourceCat == null ? fallbackSourceCat : src.sourceCat
  );
  return normalizeInfoLayer(
    {
      id: src.id,
      type: 'icon',
      name: sanitizeInfoLayerName(src.name, '图标图层'),
      enabled: src.enabled == null ? true : src.enabled === true,
      sourceCat: resolvedSourceCat,
      itemId: src.itemId == null ? '' : src.itemId,
      x: src.x == null ? 0 : src.x,
      y: src.y == null ? 0 : src.y,
      sizeMode: src.sizeMode,
      targetSize: src.targetSize,
      scale: src.scale == null ? 1 : src.scale,
      opacity: src.opacity == null ? 1 : src.opacity,
    },
    'icon'
  );
}

function createDefaultInfoSpecialLayer(options = {}) {
  const src = options && typeof options === 'object' ? options : {};
  return normalizeInfoLayer(
    {
      id: src.id,
      type: 'special',
      name: normalizeInfoLayerDisplayName(src.id, src.name, 'bd队徽'),
      enabled: src.enabled == null ? false : src.enabled === true,
      bgItemId: src.bgItemId == null ? '' : src.bgItemId,
      maskItemId: src.maskItemId == null ? '' : src.maskItemId,
      symbolItemId: src.symbolItemId == null ? '' : src.symbolItemId,
      maskDarkColor: src.maskDarkColor == null ? '#5f3c22' : src.maskDarkColor,
      maskLightColor: src.maskLightColor == null ? '#f6d9a7' : src.maskLightColor,
      x: src.x == null ? 0 : src.x,
      y: src.y == null ? 0 : src.y,
      sizeMode: src.sizeMode,
      targetSize: src.targetSize,
      scale: src.scale == null ? 1 : src.scale,
      opacity: src.opacity == null ? 1 : src.opacity,
    },
    'special'
  );
}

function createDefaultInfoFixedLayer(options = {}) {
  const src = options && typeof options === 'object' ? options : {};
  return normalizeInfoLayer(
    {
      id: src.id,
      type: 'fixed',
      name: sanitizeInfoLayerName(src.name, '固定图层'),
      enabled: src.enabled == null ? false : src.enabled === true,
      path: src.path == null ? '' : src.path,
      x: src.x == null ? 0 : src.x,
      y: src.y == null ? 0 : src.y,
      width: src.width,
      height: src.height,
      opacity: src.opacity == null ? 1 : src.opacity,
    },
    'fixed'
  );
}

function createDefaultInfoBar48Layer(options = {}) {
  const src = options && typeof options === 'object' ? options : {};
  return normalizeInfoLayer(
    {
      id: src.id,
      type: 'bar48',
      name: sanitizeInfoLayerName(src.name, '48条形图层'),
      enabled: src.enabled == null ? false : src.enabled === true,
      x: src.x == null ? 0 : src.x,
      y: src.y == null ? 0 : src.y,
      columns: src.columns == null ? INFO_BAR48_DEFAULT_COLUMNS : src.columns,
      cellWidth: src.cellWidth == null ? 20 : src.cellWidth,
      cellHeight: src.cellHeight == null ? 44 : src.cellHeight,
      gapX: src.gapX == null ? 4 : src.gapX,
      gapY: src.gapY == null ? 4 : src.gapY,
      emptyPath: src.emptyPath == null ? INFO_BAR48_DEFAULT_EMPTY_PATH : src.emptyPath,
      fillPath: src.fillPath == null ? INFO_BAR48_DEFAULT_FILL_PATH : src.fillPath,
      states: src.states,
      opacity: src.opacity == null ? 1 : src.opacity,
    },
    'bar48'
  );
}

function createFixedInfoLayerTemplate() {
  const layers = [];
  for (const slot of INFO_LAYER_SLOT_DEFINITIONS) {
    if (!slot || !slot.id || !slot.type) continue;
    const slotEnabled =
      typeof slot.enabled === 'boolean'
        ? { enabled: slot.enabled }
        : {};
    if (slot.type === 'icon') {
      layers.push(
        createDefaultInfoIconLayer({
          id: slot.id,
          name: sanitizeInfoLayerName(slot.name, '图标图层'),
          ...slotEnabled,
        })
      );
      continue;
    }
    if (slot.type === 'special') {
      layers.push(
        createDefaultInfoSpecialLayer({
          id: slot.id,
          name: normalizeInfoLayerDisplayName(slot.id, slot.name, 'bd队徽'),
          ...slotEnabled,
        })
      );
      continue;
    }
    if (slot.type === 'fixed') {
      layers.push(
        createDefaultInfoFixedLayer({
          id: slot.id,
          name: sanitizeInfoLayerName(slot.name, '固定图层'),
          ...slotEnabled,
        })
      );
      continue;
    }
    if (slot.type === 'bar48') {
      layers.push(
        createDefaultInfoBar48Layer({
          id: slot.id,
          name: sanitizeInfoLayerName(slot.name, '48条形图层'),
          ...slotEnabled,
        })
      );
      continue;
    }
    layers.push(
      createDefaultInfoTextLayer({
        id: slot.id,
        name: sanitizeInfoLayerName(slot.name, '文字图层'),
        ...slotEnabled,
      })
    );
  }
  return layers;
}

function normalizeTextLayerState(raw) {
  const base = createDefaultTextLayerState();
  if (!raw || typeof raw !== 'object') return base;
  const fontFamily = normalizeTextLayerFontFamily(raw.fontFamily, base.fontFamily);
  const fontVariant = normalizeTextLayerFontVariant(fontFamily, raw.fontVariant, raw.bold === true);
  const lockBasicGlyphs = isJupiterProFontFamily(fontFamily);
  const legacyInlineIconSize = clampNumberInRange(raw.inlineIconSize, 0, 4096, base.inlineIconSize);
  const inlineIconWidth = clampNumberInRange(
    raw.inlineIconWidth,
    0,
    4096,
    legacyInlineIconSize
  );
  const inlineIconHeight = clampNumberInRange(
    raw.inlineIconHeight,
    0,
    4096,
    legacyInlineIconSize
  );
  return {
    enabled: raw.enabled === true,
    text: typeof raw.text === 'string' ? raw.text.slice(0, 2000) : '',
    fontFamily,
    fontVariant,
    bold: raw.bold === true,
    italic: raw.italic === true,
    underline: raw.underline === true,
    smallCaps: raw.smallCaps === true,
    freeLigatures: lockBasicGlyphs ? false : raw.freeLigatures === true,
    renderEffect: normalizeTextLayerRenderEffect(raw.renderEffect),
    align: TEXT_LAYER_ALIGN_OPTIONS.includes(raw.align) ? raw.align : base.align,
    x: Math.round(clampNumberInRange(raw.x, -8192, 8192, base.x)),
    y: Math.round(clampNumberInRange(raw.y, -8192, 8192, base.y)),
    fontSize: Math.round(clampNumberInRange(raw.fontSize, 12, 1024, base.fontSize)),
    lineHeightMode: raw.lineHeightMode === 'manual' ? 'manual' : 'auto',
    lineHeight: clampNumberInRange(raw.lineHeight, 0.8, 3, base.lineHeight),
    tracking: clampNumberInRange(raw.tracking, TEXT_LAYER_TRACKING_MIN, TEXT_LAYER_TRACKING_MAX, base.tracking),
    kerningVA: clampNumberInRange(raw.kerningVA, TEXT_LAYER_TRACKING_MIN, TEXT_LAYER_TRACKING_MAX, base.kerningVA),
    scaleXPercent: clampNumberInRange(raw.scaleXPercent, TEXT_LAYER_SCALE_PERCENT_MIN, TEXT_LAYER_SCALE_PERCENT_MAX, base.scaleXPercent),
    scaleYPercent: clampNumberInRange(raw.scaleYPercent, TEXT_LAYER_SCALE_PERCENT_MIN, TEXT_LAYER_SCALE_PERCENT_MAX, base.scaleYPercent),
    baselineShift: clampNumberInRange(raw.baselineShift, TEXT_LAYER_BASELINE_SHIFT_MIN, TEXT_LAYER_BASELINE_SHIFT_MAX, base.baselineShift),
    adaptiveColorSource: normalizeInfoTextAdaptiveColorSource(raw.adaptiveColorSource),
    adaptiveColorFont1: normalizeOptionalHexColor(raw.adaptiveColorFont1),
    adaptiveColorFont2: normalizeOptionalHexColor(raw.adaptiveColorFont2),
    svgTextCalt: raw.svgTextCalt === true,
    followLayerId: normalizeInfoTextFollowLayerId(raw.followLayerId),
    followXGap: clampNumberInRange(raw.followXGap, -4096, 4096, base.followXGap),
    color: normalizeHexColor(raw.color, base.color),
    inlineIconPath: normalizeInfoInlineIconPath(raw.inlineIconPath),
    inlineIconSize: legacyInlineIconSize,
    inlineIconWidth,
    inlineIconHeight,
    inlineIconGap: clampNumberInRange(raw.inlineIconGap, 0, 512, base.inlineIconGap),
    strokeEnabled: raw.strokeEnabled === true,
    strokePosition:
      raw.strokePosition === 'outside' || raw.strokePosition === 'center'
        ? raw.strokePosition
        : base.strokePosition,
    strokeWidth: clampNumberInRange(raw.strokeWidth, TEXT_LAYER_STROKE_WIDTH_MIN, TEXT_LAYER_STROKE_WIDTH_MAX, base.strokeWidth),
    strokeColor: normalizeHexColor(raw.strokeColor, base.strokeColor),
    opacity: clampNumberInRange(raw.opacity, 0, 1, base.opacity),
  };
}

function normalizeInfoLayer(raw, forcedType = null) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const rawType = String(src.type == null ? '' : src.type).trim().toLowerCase();
  const inferredType = INFO_LAYER_TYPES.includes(rawType) ? rawType : 'text';
  const type = INFO_LAYER_TYPES.includes(forcedType) ? forcedType : inferredType;

  if (type === 'icon') {
    const layerId = normalizeInfoLayerId(src.id, 'icon');
    const sourceCat = resolveInfoIconCategoryForLayer(layerId, src.sourceCat);
    const itemId = String(src.itemId == null ? '' : src.itemId).slice(0, 120);
    const itemIds = normalizeInfoIconItemIds(src.itemIds);
    const isActivityLayer = sourceCat === INFO_ICON_ACTIVITY_CATEGORY;
    const sizeModeRaw = String(src.sizeMode == null ? '' : src.sizeMode).trim().toLowerCase();
    const sizeMode = sizeModeRaw === 'fixed' ? 'fixed' : '';
    const targetSizeNum = Number(src.targetSize);
    const targetSize = Number.isFinite(targetSizeNum) && targetSizeNum > 0
      ? Math.max(1, Math.round(targetSizeNum))
      : null;
    const mergedActivityItemIds = isActivityLayer
      ? normalizeInfoIconItemIds(itemIds.length > 0 ? itemIds : (itemId ? [itemId] : []))
      : [];
    const finalItemId = isActivityLayer
      ? (mergedActivityItemIds[0] || '')
      : itemId;
    const finalSizeMode = isActivityLayer ? 'fixed' : sizeMode;
    const finalTargetSize = isActivityLayer
      ? INFO_ACTIVITY_ICON_SIZE_PX
      : targetSize;
    return {
      id: layerId,
      type: 'icon',
      name: sanitizeInfoLayerName(src.name, '图标图层'),
      enabled: src.enabled == null ? true : src.enabled === true,
      sourceCat,
      itemId: finalItemId,
      itemIds: mergedActivityItemIds,
      x: Math.round(clampNumberInRange(src.x, -8192, 8192, 0)),
      y: Math.round(clampNumberInRange(src.y, -8192, 8192, 0)),
      ...(finalSizeMode ? { sizeMode: finalSizeMode } : {}),
      ...(finalTargetSize != null ? { targetSize: finalTargetSize } : {}),
      scale: clampNumberInRange(src.scale, INFO_ICON_SCALE_MIN, INFO_ICON_SCALE_MAX, 1),
      opacity: clampNumberInRange(src.opacity, 0, 1, 1),
    };
  }

  if (type === 'special') {
    const sizeModeRaw = String(src.sizeMode == null ? '' : src.sizeMode).trim().toLowerCase();
    const sizeMode = sizeModeRaw === 'fixed' ? 'fixed' : '';
    const targetSizeNum = Number(src.targetSize);
    const targetSize = Number.isFinite(targetSizeNum) && targetSizeNum > 0
      ? Math.max(1, Math.round(targetSizeNum))
      : null;
    const bgItemId = normalizeInfoSpecialLegacyItemId(src.bgItemId);
    const maskItemId = normalizeInfoSpecialLegacyItemId(src.maskItemId);
    const symbolItemIdRaw = normalizeInfoSpecialLegacyItemId(src.symbolItemId);
    const symbolItemId = symbolItemIdRaw || resolveDefaultInfoSpecialSymbolItemId(symbolItemIdRaw);
    return {
      id: normalizeInfoLayerId(src.id, 'special'),
      type: 'special',
      name: normalizeInfoLayerDisplayName(src.id, src.name, 'bd队徽'),
      enabled: src.enabled == null ? false : src.enabled === true,
      bgItemId,
      maskItemId,
      symbolItemId: normalizeInfoSpecialLegacyItemId(symbolItemId),
      maskDarkColor: normalizeHexColor(src.maskDarkColor, '#5f3c22'),
      maskLightColor: normalizeHexColor(src.maskLightColor, '#f6d9a7'),
      x: Math.round(clampNumberInRange(src.x, -8192, 8192, 0)),
      y: Math.round(clampNumberInRange(src.y, -8192, 8192, 0)),
      ...(sizeMode ? { sizeMode } : {}),
      ...(targetSize != null ? { targetSize } : {}),
      scale: clampNumberInRange(src.scale, INFO_SPECIAL_SCALE_MIN, INFO_SPECIAL_SCALE_MAX, 1),
      opacity: clampNumberInRange(src.opacity, 0, 1, 1),
    };
  }

  if (type === 'fixed') {
    const widthRaw = Number(src.width);
    const heightRaw = Number(src.height);
    const width = Number.isFinite(widthRaw) && widthRaw > 0
      ? Math.max(1, Math.round(clampNumberInRange(widthRaw, 1, 8192, widthRaw)))
      : null;
    const height = Number.isFinite(heightRaw) && heightRaw > 0
      ? Math.max(1, Math.round(clampNumberInRange(heightRaw, 1, 8192, heightRaw)))
      : null;
    return {
      id: normalizeInfoLayerId(src.id, 'fixed'),
      type: 'fixed',
      name: sanitizeInfoLayerName(src.name, '固定图层'),
      enabled: src.enabled == null ? false : src.enabled === true,
      path: normalizeInfoAssetPath(String(src.path == null ? '' : src.path).slice(0, INFO_FIXED_LAYER_PATH_MAX_LENGTH)),
      x: Math.round(clampNumberInRange(src.x, -8192, 8192, 0)),
      y: Math.round(clampNumberInRange(src.y, -8192, 8192, 0)),
      ...(width != null ? { width } : {}),
      ...(height != null ? { height } : {}),
      opacity: clampNumberInRange(src.opacity, 0, 1, 1),
    };
  }

  if (type === 'bar48') {
    const columnsRaw = Number(src.columns);
    const columns = Number.isFinite(columnsRaw)
      ? Math.max(1, Math.min(INFO_BAR48_COUNT, Math.round(columnsRaw)))
      : INFO_BAR48_DEFAULT_COLUMNS;
    return {
      id: normalizeInfoLayerId(src.id, 'bar48'),
      type: 'bar48',
      name: sanitizeInfoLayerName(src.name, '48条形图层'),
      enabled: src.enabled == null ? false : src.enabled === true,
      x: Math.round(clampNumberInRange(src.x, -8192, 8192, 0)),
      y: Math.round(clampNumberInRange(src.y, -8192, 8192, 0)),
      columns,
      cellWidth: Math.round(
        clampNumberInRange(src.cellWidth, INFO_BAR48_CELL_SIZE_MIN, INFO_BAR48_CELL_SIZE_MAX, 20)
      ),
      cellHeight: Math.round(
        clampNumberInRange(src.cellHeight, INFO_BAR48_CELL_SIZE_MIN, INFO_BAR48_CELL_SIZE_MAX, 44)
      ),
      gapX: Math.round(clampNumberInRange(src.gapX, INFO_BAR48_GAP_MIN, INFO_BAR48_GAP_MAX, 4)),
      gapY: Math.round(clampNumberInRange(src.gapY, INFO_BAR48_GAP_MIN, INFO_BAR48_GAP_MAX, 4)),
      emptyPath: normalizeInfoAssetPath(src.emptyPath == null ? INFO_BAR48_DEFAULT_EMPTY_PATH : src.emptyPath),
      fillPath: normalizeInfoAssetPath(src.fillPath == null ? INFO_BAR48_DEFAULT_FILL_PATH : src.fillPath),
      states: normalizeInfoBar48States(src.states),
      opacity: clampNumberInRange(src.opacity, 0, 1, 1),
    };
  }

  const normalizedText = normalizeTextLayerState({
    ...src,
    enabled: src.enabled == null ? true : src.enabled === true,
  });
  return {
    id: normalizeInfoLayerId(src.id, 'text'),
    type: 'text',
    name: sanitizeInfoLayerName(src.name, '文字图层'),
    ...normalizedText,
  };
}

function normalizeInfoLayers(raw) {
  const template = createFixedInfoLayerTemplate();
  if (!Array.isArray(raw) || raw.length === 0) {
    syncInfoLayerIdSeedFromLayers(template);
    return template;
  }

  const normalizedRaw = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const candidateType = String(item.type == null ? '' : item.type).trim().toLowerCase();
    const type = INFO_LAYER_TYPES.includes(candidateType) ? candidateType : 'text';
    normalizedRaw.push(normalizeInfoLayer(item, type));
  }

  const templateIdSet = new Set(template.map(layer => layer.id));
  const rawById = new Map();
  const poolsByType = new Map(INFO_LAYER_TYPES.map(type => [type, []]));
  let hasTemplateIdMatch = false;
  for (const layer of normalizedRaw) {
    if (templateIdSet.has(layer.id)) hasTemplateIdMatch = true;
    if (layer.id && !rawById.has(layer.id)) rawById.set(layer.id, layer);
    const typePool = poolsByType.get(layer.type);
    if (typePool) typePool.push(layer);
  }

  const poolIdxByType = new Map(INFO_LAYER_TYPES.map(type => [type, 0]));
  const out = template.map(slot => {
    let source = rawById.get(slot.id);
    if (!source && !hasTemplateIdMatch) {
      const pool = poolsByType.get(slot.type) || [];
      const idx = poolIdxByType.get(slot.type) || 0;
      source = pool[idx];
      poolIdxByType.set(slot.type, idx + 1);
    }
    if (!source) return slot;
    return normalizeInfoLayer(
      {
        ...slot,
        ...source,
        id: slot.id,
        type: slot.type,
        name: normalizeInfoLayerDisplayName(slot.id, source.name, slot.name),
      },
      slot.type
    );
  });

  syncInfoLayerIdSeedFromLayers(out);
  return out;
}

function setTextLayerLocalFontsStatus(text) {
  const statusEl = document.getElementById('textLayerLocalFontsStatus');
  if (statusEl) statusEl.textContent = String(text || '');
}

function buildTextLayerFontOptionsHtml(layer) {
  const normalized = normalizeTextLayerState(layer);
  const preferred = normalizeTextLayerFontFamily(normalized.fontFamily, 'Eorzea');
  const presetFonts = normalizeAndDedupeFontFamilies(TEXT_LAYER_PRESET_FONT_FAMILIES);
  const presetKeys = new Set(presetFonts.map(name => name.toLowerCase()));
  const localFonts = normalizeAndDedupeFontFamilies(textLayerLocalFontFamilies)
    .filter(name => !presetKeys.has(name.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { sensitivity: 'base' }));

  const allKnown = [...presetFonts, ...localFonts];
  const knownSet = new Set(allKnown.map(name => name.toLowerCase()));
  const currentExtra = knownSet.has(preferred.toLowerCase()) ? [] : [preferred];
  const renderOptions = names =>
    names
      .map(name => {
        const selected = name.toLowerCase() === preferred.toLowerCase() ? ' selected' : '';
        return `<option value="${escapeHtml(name)}"${selected}>${escapeHtml(name)}</option>`;
      })
      .join('');

  let html = '';
  if (presetFonts.length) html += `<optgroup label="预设字体">${renderOptions(presetFonts)}</optgroup>`;
  if (localFonts.length) html += `<optgroup label="本机字体">${renderOptions(localFonts)}</optgroup>`;
  if (currentExtra.length) html += `<optgroup label="当前字体">${renderOptions(currentExtra)}</optgroup>`;
  return html;
}

function buildTextLayerFontVariantOptionsHtml(layer) {
  const normalized = normalizeTextLayerState(layer);
  const options = getTextFontVariantOptions(normalized.fontFamily);
  const active = resolveTextLayerFontVariantMeta(normalized.fontFamily, normalized.fontVariant);
  return options
    .map(item => {
      const selected = item.key === active.key ? ' selected' : '';
      return `<option value="${escapeHtml(item.key)}"${selected}>${escapeHtml(item.label)}</option>`;
    })
    .join('');
}

function textLayerLines(text) {
  return String(text || '').replace(/\r\n/g, '\n').split('\n');
}

function measureTextLayerLineWidth(ctx, normalized, fontSpec, text) {
  const value = String(text || '');
  if (!value) return 0;
  if (normalized.smallCaps) {
    let width = 0;
    const runs = buildSmallCapsRuns(value);
    for (const run of runs) {
      const runFontSize = Math.max(1, normalized.fontSize * (Number(run.scale) || 1));
      ctx.font = buildTextLayerFontSpecWithSize(normalized, runFontSize);
      width += ctx.measureText(run.text).width;
    }
    ctx.font = fontSpec;
    return width;
  }
  return ctx.measureText(value).width;
}

function wrapTextLayerLinesByWidth(normalized, ctx, fontSpec, maxWidthPx) {
  const baseLines = textLayerLines(normalized.text);
  const limit = Number(maxWidthPx);
  if (!Number.isFinite(limit) || limit <= 0) return baseLines;
  const wrapped = [];
  for (const baseLine of baseLines) {
    const source = String(baseLine || '');
    if (!source) {
      wrapped.push('');
      continue;
    }
    let current = '';
    for (const ch of source) {
      const candidate = current + ch;
      const width = measureTextLayerLineWidth(ctx, normalized, fontSpec, candidate);
      if (width <= limit || !current) {
        current = candidate;
        continue;
      }
      wrapped.push(current);
      current = ch;
    }
    wrapped.push(current);
  }
  return wrapped.length ? wrapped : [''];
}

function hasRenderableTextLayer(layer) {
  const normalized = normalizeTextLayerState(layer);
  if (!normalized.enabled) return false;
  return textLayerLines(normalized.text).some(line => line.trim().length > 0);
}

function hasRenderableInfoIconLayer(layer) {
  const normalized = normalizeInfoLayer(layer, 'icon');
  if (!normalized.enabled) return false;
  return resolveInfoIconLayerItems(normalized).length > 0;
}

function hasRenderableInfoSpecialLayer(layer) {
  const normalized = normalizeInfoLayer(layer, 'special');
  if (!normalized.enabled) return false;
  return !!resolveInfoSpecialLayerItem(normalized, 'symbol');
}

function hasRenderableInfoFixedLayer(layer) {
  const normalized = normalizeInfoLayer(layer, 'fixed');
  if (!normalized.enabled) return false;
  return !!normalizeInfoAssetPath(normalized.path);
}

function hasRenderableInfoBar48Layer(layer) {
  const normalized = normalizeInfoLayer(layer, 'bar48');
  if (!normalized.enabled) return false;
  return !!normalizeInfoAssetPath(normalized.emptyPath);
}
