// ============================================================
// 状态
// ============================================================
let fileData = { portrait: {}, nameplate: {} };
let selected = {};         // { 分类名: 素材项（与 fileData 中对象同形，含 name）| null }
let portraitSide = 'right';
let activeTab = 'full'; // 预览固定为完整画布
let activePanel = 'portrait';
let zoomLevel = 1; // 1 = 适配容器后的 100%
/** 画布与导出均用原图像素尺寸参与 LAYER_COORDS 计算；缩略图单独走 iconImgSrcPreview */
let imgCacheHd = {};
let presets = { banner: [], charcard: [] };
let customPortraitImage = null;
let infoLayers = [];
let infoLayerIdSeed = 1;
let infoLayerCardOpenState = {};
let infoIconSubmenuOpenState = {};
let infoPresetActiveName = '';
let infoPresetLayerStates = {};
let textLayerLocalFontFamilies = [];
let pendingCustomPick = false;
/** @type {{ img: HTMLImageElement, fileName: string, dataUrl: string, s0: number, mul: number, offX: number, offY: number } | null} */
let customCropState = null;
let layerRenderDepth = 0;
let layerLoadingShowTimer = null;
let infoLayerRenderTimer = null;
let renderRequestSerial = 0;
let infoPanelOpenedOnce = false;
let nameplateBaseFontColorByImageId = null;
let nameplateBaseFontColorLoadPromise = null;
let nameplateHeaderFontColorByTopImageId = null;
let nameplateHeaderFontColorLoadPromise = null;
let infoPanelNumberAutoSelectBound = false;
let infoLayerHitRegions = [];
let hoveredInfoLayerIndex = -1;
const INIT_API_RETRIES = 2;
const INIT_API_RETRY_DELAY_MS = 220;
const INIT_LOADING_STATUS_DEFAULT = '正在扫描素材文件…';

function setPrimaryLoadingStatus(text) {
  const el = document.getElementById('loadingStatusText');
  if (!el) return;
  el.textContent = String(text || INIT_LOADING_STATUS_DEFAULT);
}

async function setPrimaryLoadingStatusAndYield(text) {
  setPrimaryLoadingStatus(text);
  await new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function sleepMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function appendCacheBust(pathname, token) {
  const src = String(pathname || '');
  if (!src) return src;
  return src.includes('?') ? `${src}&_=${token}` : `${src}?_=${token}`;
}

function buildInitApiErrorDetail(error) {
  const err = error && typeof error === 'object' ? error : {};
  const msg = [];
  if (err.endpoint) msg.push(`接口: ${err.endpoint}`);
  if (err.url) msg.push(`URL: ${err.url}`);
  if (Number.isInteger(err.status)) {
    msg.push(`HTTP: ${err.status}${err.statusText ? ` ${err.statusText}` : ''}`);
  }
  const reason = err.message || String(error || '未知错误');
  msg.push(`原因: ${reason}`);
  return msg.join('\n');
}

async function fetchJsonWithRetry(endpoint, options = {}) {
  const retries = Number.isInteger(options.retries) ? Math.max(0, options.retries) : INIT_API_RETRIES;
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const requestPath = appendCacheBust(endpoint, `${Date.now()}_${attempt}`);
    const requestUrl = appPath(requestPath);
    try {
      const resp = await fetch(requestUrl, { cache: 'no-store' });
      if (!resp.ok) {
        const err = new Error(`请求失败`);
        err.endpoint = endpoint;
        err.url = requestUrl;
        err.status = resp.status;
        err.statusText = resp.statusText || '';
        throw err;
      }
      const text = await resp.text();
      if (!String(text || '').trim()) {
        const err = new Error('响应体为空');
        err.endpoint = endpoint;
        err.url = requestUrl;
        err.status = resp.status;
        err.statusText = resp.statusText || '';
        throw err;
      }
      try {
        return JSON.parse(text);
      } catch (_) {
        const err = new Error('JSON 解析失败（可能是返回内容被截断）');
        err.endpoint = endpoint;
        err.url = requestUrl;
        err.status = resp.status;
        err.statusText = resp.statusText || '';
        throw err;
      }
    } catch (e) {
      lastError = e;
      if (attempt < retries) {
        await sleepMs(INIT_API_RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
  throw lastError || new Error('请求失败');
}

// ============================================================
// 初始化
// ============================================================
async function init() {
  let initStage = '';
  try {
    initStage = '加载预设中';
    await setPrimaryLoadingStatusAndYield('加载预设中…');
    const presetsPromise = fetchJsonWithRetry('/api/presets', { retries: INIT_API_RETRIES });

    initStage = '加载肖像中';
    await setPrimaryLoadingStatusAndYield('加载肖像中…');
    const filesPromise = fetchJsonWithRetry('/api/files', { retries: INIT_API_RETRIES });

    const rawPresets = await presetsPromise;

    initStage = '加载铭牌中';
    await setPrimaryLoadingStatusAndYield('加载铭牌中…');
    const filesPayload = await filesPromise;
    if (filesPayload._meta && typeof filesPayload._meta.imgBase === 'string') {
      ICON_IMG_BASE = filesPayload._meta.imgBase;
    } else {
      ICON_IMG_BASE = CDN;
    }
    if (
      filesPayload._meta &&
      typeof filesPayload._meta.previewImgBase === 'string' &&
      filesPayload._meta.previewImgBase.trim()
    ) {
      ICON_PREVIEW_BASE = filesPayload._meta.previewImgBase.trim().replace(/\/$/, '');
    } else {
      ICON_PREVIEW_BASE = null;
    }
    fileData = {
      portrait: filesPayload.portrait || {},
      nameplate: filesPayload.nameplate || {},
    };
    // 兼容旧服务端键名：职业图标图层组 -> 职业图标
    if (
      !Array.isArray(fileData.nameplate[INFO_ICON_LIMITED_CATEGORY]) &&
      Array.isArray(fileData.nameplate[INFO_ICON_LEGACY_CATEGORY])
    ) {
      fileData.nameplate[INFO_ICON_LIMITED_CATEGORY] = fileData.nameplate[INFO_ICON_LEGACY_CATEGORY];
    }
    initStage = '加载活动图标中';
    await setPrimaryLoadingStatusAndYield('加载活动图标中…');
    await ensureInfoActivityIconCategoryLoaded();
    presets = {
      banner: Array.isArray(rawPresets.banner) ? rawPresets.banner : [],
      charcard: Array.isArray(rawPresets.charcard) ? rawPresets.charcard : [],
    };
  } catch(e) {
    setPrimaryLoadingStatus(initStage ? `${initStage}失败` : '初始化失败');
    applyThemeFromStorage();
    alert(
      '初始化数据加载失败，请稍后重试。\n\n' +
      buildInitApiErrorDetail(e) +
      '\n\n请检查 /api/files 与 /api/presets 是否返回完整 JSON。'
    );
    document.getElementById('loadingOverlay').classList.add('hidden');
    return;
  }
  [...PORTRAIT_CATS, ...NAMEPLATE_CATS, '肖像外框'].forEach(c => { selected[c] = null; });
  await setPrimaryLoadingStatusAndYield('初始化界面中…');
  renderPresetSelects();
  setupCustomPortraitFileInput();
  updateCustomPortraitUI();
  setupTextLayerControls();
  const pb = document.getElementById('presetBanner');
  const pc = document.getElementById('presetChar');
  if (pb) pb.disabled = false;
  if (pc) pc.disabled = false;
  await setPrimaryLoadingStatusAndYield('渲染预览中…');
  await renderAll();
  let hasStoredConfigBeforeRestore = false;
  try {
    hasStoredConfigBeforeRestore = !!localStorage.getItem(COMPOSER_CONFIG_STORAGE_KEY);
  } catch (_) {
    hasStoredConfigBeforeRestore = false;
  }
  await setPrimaryLoadingStatusAndYield('恢复预设中…');
  await tryRestoreComposerConfigFromLocalStorage();
  migratePhantomTideInfoPresetDefaultsOnce();
  initializeInfoPresetForFirstVisitOnly(hasStoredConfigBeforeRestore);
  await setPrimaryLoadingStatusAndYield('加载字体中…');
  await Promise.all([
    ensureNameplateBaseFontColorMapLoaded(),
    ensureNameplateHeaderFontColorMapLoaded(),
  ]);
  setPrimaryLoadingStatus('加载完成');
  document.getElementById('loadingOverlay').classList.add('hidden');
}

function renderPresetSelects() {
  const bannerSel = document.getElementById('presetBanner');
  const charSel = document.getElementById('presetChar');
  while (bannerSel.options.length > 1) bannerSel.remove(1);
  while (charSel.options.length > 1) charSel.remove(1);

  // 肖像预设：名称包含“赛季”的项后置（保持各分组内原始顺序）
  const bannerList = (Array.isArray(presets.banner) ? presets.banner : [])
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const aSeason = String((a.p && a.p.name) || '').includes('赛季');
      const bSeason = String((b.p && b.p.name) || '').includes('赛季');
      if (aSeason !== bSeason) return aSeason ? 1 : -1;
      return a.i - b.i;
    })
    .map(v => v.p);

  bannerList.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    bannerSel.appendChild(opt);
  });

  presets.charcard.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    charSel.appendChild(opt);
  });
}

function isWebRuntime() {
  return true;
}

const THEME_KEY = 'iconComposerTheme';
/** 网页端：图层/预设/视图等完整 UI 状态（localStorage，清除站点数据即消失） */
const COMPOSER_CONFIG_STORAGE_KEY = 'iconComposer.ui.config.v1';
const COMPOSER_CONFIG_FILE_VERSION = 1;
const COMPOSER_CONFIG_CATS = [...PORTRAIT_CATS, ...NAMEPLATE_CATS, '肖像外框'];
const INFO_PRESET_PHANTOM_TIDE_MIGRATION_KEY = 'iconComposer.infoPreset.phantomTideDefaults.v4';
const INFO_PRESET_FIRST_VISIT_HIDDEN_KEY = 'iconComposer.infoPreset.firstVisitHiddenDone.v1';
