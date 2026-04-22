let _persistComposerTimer = null;

function persistComposerConfigNow() {
  if (_persistComposerTimer) {
    clearTimeout(_persistComposerTimer);
    _persistComposerTimer = null;
  }
  try {
    localStorage.setItem(
      COMPOSER_CONFIG_STORAGE_KEY,
      JSON.stringify(collectComposerConfigObject())
    );
  } catch (_) {}
}

function schedulePersistComposerConfig() {
  if (_persistComposerTimer) clearTimeout(_persistComposerTimer);
  _persistComposerTimer = setTimeout(() => {
    _persistComposerTimer = null;
    try {
      localStorage.setItem(
        COMPOSER_CONFIG_STORAGE_KEY,
        JSON.stringify(collectComposerConfigObject())
      );
    } catch (_) {
      /* 配额不足时静默跳过，用户可用「下载 JSON」 */
    }
  }, 600);
}

function collectComposerConfigObject() {
  const normalizedInfoLayers = normalizeInfoLayers(infoLayers);
  infoLayers = normalizedInfoLayers;
  saveActiveInfoPresetLayerState();
  const selectedSnap = {};
  for (const c of COMPOSER_CONFIG_CATS) {
    const s = selected[c];
    selectedSnap[c] = s ? { id: s.id, file: s.file, path: s.path } : null;
  }
  const pb = document.getElementById('presetBanner');
  const pc = document.getElementById('presetChar');
  return {
    version: COMPOSER_CONFIG_FILE_VERSION,
    savedAt: new Date().toISOString(),
    theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
    portraitSide,
    activePanel,
    activeTab: 'full',
    zoomLevel,
    viewOffset: { x: 0, y: 0 },
    presetBanner: pb ? pb.value : '',
    presetChar: pc ? pc.value : '',
    infoPresetName: normalizeInfoPresetName(infoPresetActiveName),
    selected: selectedSnap,
    customPortrait:
      customPortraitImage && customPortraitImage.dataUrl
        ? {
            dataUrl: customPortraitImage.dataUrl,
            fileName: customPortraitImage.fileName || '',
            scale: customPortraitImage.scale != null ? customPortraitImage.scale : 1,
          }
        : null,
    infoLayers: normalizedInfoLayers,
    infoPresetStates: normalizeInfoPresetLayerStates(infoPresetLayerStates),
    // 向后兼容：旧版本只识别单个 textLayer
    textLayer: (() => {
      const firstText = normalizedInfoLayers.find(layer => layer.type === 'text');
      return firstText ? normalizeTextLayerState(firstText) : undefined;
    })(),
  };
}

function collectComposerConfigObjectForTransfer(options = {}) {
  const includeCustomPortrait = options.includeCustomPortrait === true;
  const base = collectComposerConfigObject();
  const nextPortraitSide = normalizePortraitSide(base.portraitSide);
  const presetName = normalizeInfoPresetName(base.infoPresetName) || INFO_PRESET_DEFAULT_NAME;
  const out = {
    ...base,
    customPortrait: includeCustomPortrait ? base.customPortrait : null,
  };
  out.infoLayers = sanitizeInfoTextLayerFontsForCurrentDevice(base.infoLayers, presetName, nextPortraitSide);
  out.infoPresetStates = sanitizeInfoPresetStatesFontsForCurrentDevice(
    base.infoPresetStates,
    nextPortraitSide
  );
  const firstText = out.infoLayers.find(layer => layer && layer.type === 'text');
  out.textLayer = firstText ? normalizeTextLayerState(firstText) : undefined;
  return out;
}

function collectComposerConfigCompactObject(options = {}) {
  const includeCustomPortrait = options.includeCustomPortrait !== false;
  const pb = document.getElementById('presetBanner');
  const pc = document.getElementById('presetChar');
  const compact = {
    v: COMPOSER_CONFIG_FILE_VERSION,
    t: document.documentElement.getAttribute('data-theme') === 'dark' ? 'd' : 'l',
    ps: portraitSide === 'left' ? 'l' : 'r',
    ap: activePanel === 'nameplate' ? 'n' : activePanel === 'info' ? 'i' : 'p',
    z: Number.isFinite(zoomLevel) ? Math.round(zoomLevel * 1000) / 1000 : 1,
    pb: pb ? pb.value : '',
    pc: pc ? pc.value : '',
    ip: normalizeInfoPresetName(infoPresetActiveName),
    sl: COMPOSER_CONFIG_CATS.map(cat => {
      const s = selected[cat];
      return s && s.id != null ? String(s.id) : '';
    }),
    cp: null,
  };
  if (includeCustomPortrait && customPortraitImage && customPortraitImage.dataUrl) {
    compact.cp = {
      d: customPortraitImage.dataUrl,
      n: customPortraitImage.fileName || '',
      s:
        typeof customPortraitImage.scale === 'number' && Number.isFinite(customPortraitImage.scale)
          ? Math.round(customPortraitImage.scale * 1000) / 1000
          : 1,
    };
  }
  return compact;
}

function serializeComposerConfigClipboardText() {
  const compact = collectComposerConfigCompactObject({ includeCustomPortrait: false });
  const params = new URLSearchParams();
  params.set('t', compact.t || 'd');
  params.set('ps', compact.ps || 'r');
  params.set('ap', compact.ap || 'p');
  params.set(
    'z',
    typeof compact.z === 'number' && Number.isFinite(compact.z)
      ? String(Math.round(compact.z * 1000) / 1000)
      : '1'
  );
  params.set('pb', typeof compact.pb === 'string' ? compact.pb : '');
  params.set('pc', typeof compact.pc === 'string' ? compact.pc : '');
  params.set('ip', typeof compact.ip === 'string' ? compact.ip : '');
  params.set('sl', Array.isArray(compact.sl) ? compact.sl.join(',') : '');
  return 'IC1?' + params.toString();
}

function parseComposerConfigFromText(raw) {
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      const hasZipManifestShape =
        obj.coordinateSpace === 'fullCanvasTopLeft' &&
        Array.isArray(obj.layers) &&
        Number(obj.version) !== COMPOSER_CONFIG_FILE_VERSION &&
        Number(obj.v) !== COMPOSER_CONFIG_FILE_VERSION;
      if (hasZipManifestShape) {
        throw new Error(
          '这是分层 ZIP 里的图层坐标说明（layers.json / manifest.json），用于说明每个 L*.png 在画布上的位置，不能作为网页配置导入。请解压后选择包内的 composer-config.json 导入。'
        );
      }
    }
    return obj;
  } catch (e) {
    if (e && e.message && /这是分层 ZIP/.test(e.message)) throw e;
    // ignore and try compact text format
  }
  const text = String(raw || '').trim();
  if (/^IC1\?/i.test(text)) {
    const qIdx = text.indexOf('?');
    const params = new URLSearchParams(qIdx >= 0 ? text.slice(qIdx + 1) : '');
    const zRaw = params.get('z');
    const z = zRaw == null || zRaw === '' ? 1 : Number(zRaw);
    return {
      v: COMPOSER_CONFIG_FILE_VERSION,
      t: params.get('t') || 'd',
      ps: params.get('ps') || 'r',
      ap: params.get('ap') || 'p',
      z: Number.isFinite(z) ? z : 1,
      pb: params.get('pb') || '',
      pc: params.get('pc') || '',
      ip: params.get('ip') || '',
      sl: (params.get('sl') || '').split(','),
      cp: null,
    };
  }
  throw new Error('无法识别配置格式（支持 JSON 或 IC1? 参数串）');
}

function normalizeComposerConfigObject(obj) {
  if (
    obj &&
    typeof obj === 'object' &&
    Number(obj.version) === COMPOSER_CONFIG_FILE_VERSION &&
    obj.selected &&
    typeof obj.selected === 'object'
  ) {
    return obj;
  }
  if (!obj || typeof obj !== 'object' || Number(obj.v) !== COMPOSER_CONFIG_FILE_VERSION) return null;
  const selectedSnap = {};
  const arr = Array.isArray(obj.sl) ? obj.sl : [];
  COMPOSER_CONFIG_CATS.forEach((cat, idx) => {
    const raw = arr[idx];
    selectedSnap[cat] = raw ? { id: String(raw) } : null;
  });
  const out = {
    version: COMPOSER_CONFIG_FILE_VERSION,
    theme: obj.t === 'dark' || obj.t === 'd' ? 'dark' : 'light',
    portraitSide: obj.ps === 'left' || obj.ps === 'l' ? 'left' : 'right',
    activePanel:
      obj.ap === 'info' || obj.ap === 'i'
        ? 'info'
        : obj.ap === 'nameplate' || obj.ap === 'n'
          ? 'nameplate'
          : 'portrait',
    activeTab: 'full',
    zoomLevel: (() => {
      const z = typeof obj.z === 'number' ? obj.z : Number(obj.z);
      return Number.isFinite(z) ? z : 1;
    })(),
    viewOffset: { x: 0, y: 0 },
    presetBanner: typeof obj.pb === 'string' ? obj.pb : '',
    presetChar: typeof obj.pc === 'string' ? obj.pc : '',
    infoPresetName: typeof obj.ip === 'string' ? obj.ip : '',
    selected: selectedSnap,
    customPortrait: null,
    infoLayers: Array.isArray(obj.infoLayers) ? obj.infoLayers : undefined,
    infoPresetStates: obj.infoPresetStates && typeof obj.infoPresetStates === 'object' ? obj.infoPresetStates : undefined,
    textLayer: obj.textLayer && typeof obj.textLayer === 'object' ? obj.textLayer : undefined,
  };
  if (obj.cp && typeof obj.cp === 'object' && typeof obj.cp.d === 'string' && obj.cp.d) {
    out.customPortrait = {
      dataUrl: obj.cp.d,
      fileName: typeof obj.cp.n === 'string' ? obj.cp.n : 'custom.png',
      scale:
        typeof obj.cp.s === 'number' && Number.isFinite(obj.cp.s)
          ? obj.cp.s
          : 1,
    };
  }
  return out;
}

async function applyComposerConfigFromObject(obj, options = {}) {
  const preserveCustomPortraitWhenMissing = options.preserveCustomPortraitWhenMissing === true;
  const preserveInfoLayersWhenMissing = options.preserveInfoLayersWhenMissing === true || options.preserveTextLayerWhenMissing === true;
  const normalized = normalizeComposerConfigObject(obj);
  if (!normalized) {
    alert('配置格式不受支持（需要 version 或 v 为 ' + COMPOSER_CONFIG_FILE_VERSION + '）。');
    return;
  }
  obj = normalized;
  if (obj.theme === 'light' || obj.theme === 'dark') {
    localStorage.setItem(THEME_KEY, obj.theme);
    applyThemeFromStorage();
  }
  if (obj.portraitSide === 'left' || obj.portraitSide === 'right') {
    portraitSide = obj.portraitSide;
    document.getElementById('sideLeft').classList.toggle('active', portraitSide === 'left');
    document.getElementById('sideRight').classList.toggle('active', portraitSide === 'right');
  }
  const pb = document.getElementById('presetBanner');
  const pc = document.getElementById('presetChar');
  if (pb && typeof obj.presetBanner === 'string') pb.value = obj.presetBanner;
  if (pc && typeof obj.presetChar === 'string') pc.value = obj.presetChar;

  if (obj.selected && typeof obj.selected === 'object') {
    for (const c of COMPOSER_CONFIG_CATS) {
      const snap = obj.selected[c];
      if (!snap || snap.id == null || snap.id === '') {
        selected[c] = null;
        continue;
      }
      const fd = layerListFor(c);
      const item =
        fd.find(f => f.id === String(snap.id) && f.path === snap.path) ||
        fd.find(f => f.id === String(snap.id));
      selected[c] = item || null;
      if (selected[c]) await loadImgHd(selected[c].path);
    }
  }

  if (obj.customPortrait && typeof obj.customPortrait.dataUrl === 'string' && obj.customPortrait.dataUrl) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('自定义图解码失败'));
      img.src = obj.customPortrait.dataUrl;
    });
    customPortraitImage = {
      fileName: obj.customPortrait.fileName || 'custom.png',
      dataUrl: obj.customPortrait.dataUrl,
      img,
      scale:
        typeof obj.customPortrait.scale === 'number' && !Number.isNaN(obj.customPortrait.scale)
          ? obj.customPortrait.scale
          : 1,
    };
  } else if (!preserveCustomPortraitWhenMissing) {
    customPortraitImage = null;
  }
  updateCustomPortraitUI();
  infoPresetLayerStates = sanitizeInfoPresetStatesFontsForCurrentDevice(
    obj.infoPresetStates,
    portraitSide
  );
  const targetInfoPresetName = normalizeInfoPresetName(obj.infoPresetName);
  const sanitizePresetName = targetInfoPresetName || INFO_PRESET_DEFAULT_NAME;
  if (Array.isArray(obj.infoLayers)) {
    infoLayers = sanitizeInfoTextLayerFontsForCurrentDevice(
      obj.infoLayers,
      sanitizePresetName,
      portraitSide
    );
    if (targetInfoPresetName) saveInfoPresetLayerState(targetInfoPresetName, infoLayers);
  } else if (obj.textLayer && typeof obj.textLayer === 'object') {
    infoLayers = sanitizeInfoTextLayerFontsForCurrentDevice(
      [{ type: 'text', ...obj.textLayer }],
      sanitizePresetName,
      portraitSide
    );
    if (targetInfoPresetName) saveInfoPresetLayerState(targetInfoPresetName, infoLayers);
  } else if (!preserveInfoLayersWhenMissing) {
    infoLayers = [];
  }
  infoPresetActiveName = resolveEffectiveInfoPresetName(targetInfoPresetName);
  if (infoPresetActiveName) {
    infoLayers = getInfoPresetLayerState(infoPresetActiveName, portraitSide);
  }
  infoLayers = sanitizeInfoTextLayerFontsForCurrentDevice(
    infoLayers,
    infoPresetActiveName || sanitizePresetName,
    portraitSide
  );
  if (infoPresetActiveName) {
    infoLayers = maskInfoLayersToPreset(infoPresetActiveName, infoLayers);
    saveInfoPresetLayerState(infoPresetActiveName, infoLayers);
  }
  setupTextLayerControls();

  if (obj.activePanel === 'nameplate' || obj.activePanel === 'portrait' || obj.activePanel === 'info') {
    await switchPanelTab(obj.activePanel);
  }
  await switchTab('full');
  if (typeof obj.zoomLevel === 'number' && Number.isFinite(obj.zoomLevel)) {
    setZoom(obj.zoomLevel, false);
  } else {
    setZoom(1, false);
  }

  renderPortraitSections();
  renderNameplateSections();
  applyTransform();
  await render();
  updateStatus();
}

async function tryRestoreComposerConfigFromLocalStorage() {
  try {
    const raw = localStorage.getItem(COMPOSER_CONFIG_STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    await applyComposerConfigFromObject(obj);
  } catch (e) {
    console.warn('[icon-composer] 恢复本地配置失败:', e);
  }
}

function migratePhantomTideInfoPresetDefaultsOnce() {
  try {
    if (localStorage.getItem(INFO_PRESET_PHANTOM_TIDE_MIGRATION_KEY) === '1') return;
    const preset = getInfoPresetDefinitionByName(INFO_PRESET_DEFAULT_NAME);
    if (!preset) {
      localStorage.setItem(INFO_PRESET_PHANTOM_TIDE_MIGRATION_KEY, '1');
      return;
    }
    const rebuilt = maskInfoLayersToPreset(
      INFO_PRESET_DEFAULT_NAME,
      buildInfoLayersFromPresetDefinition(preset, portraitSide)
    );
    saveInfoPresetLayerState(INFO_PRESET_DEFAULT_NAME, rebuilt);
    if (normalizeInfoPresetName(infoPresetActiveName) === INFO_PRESET_DEFAULT_NAME) {
      infoLayers = cloneInfoLayerStateList(rebuilt);
      collapseAllInfoLayerDropdownState();
      renderInfoPresetButtons();
      renderInfoLayersPanel();
      queueInfoLayerRender(true);
    } else {
      schedulePersistComposerConfig();
    }
    localStorage.setItem(INFO_PRESET_PHANTOM_TIDE_MIGRATION_KEY, '1');
  } catch (_) {
    // ignore migration storage failures
  }
}

function downloadComposerConfigJson() {
  const data = collectComposerConfigObjectForTransfer({ includeCustomPortrait: true });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href = URL.createObjectURL(blob);
  a.download = 'icon-composer-config-' + stamp + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function writeTextToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (e) {
    // ignore and fallback
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', 'readonly');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, ta.value.length);
  const ok = document.execCommand && document.execCommand('copy');
  document.body.removeChild(ta);
  if (!ok) throw new Error('当前环境不支持自动写入剪贴板');
}

async function readTextFromClipboardOrPrompt() {
  try {
    if (navigator.clipboard && window.isSecureContext && navigator.clipboard.readText) {
      return await navigator.clipboard.readText();
    }
  } catch (e) {
    // ignore and fallback
  }
  return window.prompt('当前环境无法直接读取剪贴板，请粘贴配置文本（JSON 或 IC1）：', '') || '';
}

async function exportComposerConfigToClipboard() {
  try {
    const text = JSON.stringify(
      collectComposerConfigObjectForTransfer({ includeCustomPortrait: false }),
      null,
      2
    );
    await writeTextToClipboard(text);
    alert('已导出到剪贴板（JSON，包含信息图层，不包含自定义图片）。');
  } catch (e) {
    alert('导出失败：' + (e && e.message ? e.message : e));
  }
}

async function importComposerConfigFromClipboard() {
  try {
    const raw = (await readTextFromClipboardOrPrompt()).trim();
    if (!raw) {
      alert('剪贴板为空或未粘贴内容。');
      return;
    }
    await applyComposerConfigFromObject(
      parseComposerConfigFromText(raw),
      { preserveCustomPortraitWhenMissing: true, preserveTextLayerWhenMissing: true }
    );
    closeSettings();
    alert('已从剪贴板导入配置。');
  } catch (e) {
    alert('导入失败：' + (e && e.message ? e.message : e));
  }
}

function triggerLoadComposerConfigFile() {
  const inp = document.getElementById('composerConfigFileInput');
  if (inp) inp.click();
}
