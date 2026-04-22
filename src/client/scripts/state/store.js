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

// ============================================================
// 初始化
// ============================================================
async function init() {
  try {
    const nc = `?_=${Date.now()}`;
    const [filesResp, presetsResp] = await Promise.all([
      fetch(appPath('/api/files' + nc)),
      fetch(appPath('/api/presets' + nc)),
    ]);
    const filesPayload = await filesResp.json();
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
    await ensureInfoActivityIconCategoryLoaded();
    const rawPresets = await presetsResp.json();
    presets = {
      banner: Array.isArray(rawPresets.banner) ? rawPresets.banner : [],
      charcard: Array.isArray(rawPresets.charcard) ? rawPresets.charcard : [],
    };
  } catch(e) {
    applyThemeFromStorage();
    alert('无法连接服务器！请先运行：node server.js\n\n' + e);
    document.getElementById('loadingOverlay').classList.add('hidden');
    return;
  }
  [...PORTRAIT_CATS, ...NAMEPLATE_CATS, '肖像外框'].forEach(c => { selected[c] = null; });
  renderPresetSelects();
  setupCustomPortraitFileInput();
  updateCustomPortraitUI();
  setupTextLayerControls();
  const pb = document.getElementById('presetBanner');
  const pc = document.getElementById('presetChar');
  if (pb) pb.disabled = false;
  if (pc) pc.disabled = false;
  await renderAll();
  let hasStoredConfigBeforeRestore = false;
  try {
    hasStoredConfigBeforeRestore = !!localStorage.getItem(COMPOSER_CONFIG_STORAGE_KEY);
  } catch (_) {
    hasStoredConfigBeforeRestore = false;
  }
  await tryRestoreComposerConfigFromLocalStorage();
  migratePhantomTideInfoPresetDefaultsOnce();
  initializeInfoPresetForFirstVisitOnly(hasStoredConfigBeforeRestore);
  await Promise.all([
    ensureNameplateBaseFontColorMapLoaded(),
    ensureNameplateHeaderFontColorMapLoaded(),
  ]);
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
