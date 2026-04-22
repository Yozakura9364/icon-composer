function collapseAllInfoLayerDropdownState() {
  const normalizedLayers = normalizeInfoLayers(infoLayers);
  infoLayers = normalizedLayers;
  const nextCardState = {};
  const nextSubmenuState = {};
  for (let i = 0; i < normalizedLayers.length; i += 1) {
    nextCardState[i] = false;
    const layer = normalizedLayers[i];
    if (!layer) continue;
    if (layer.type === 'icon') {
      nextSubmenuState[infoIconSubmenuStateKey(i, 'material')] = false;
      nextSubmenuState[infoIconSubmenuStateKey(i, 'props')] = false;
      continue;
    }
    if (layer.type === 'special') {
      nextSubmenuState[infoIconSubmenuStateKey(i, 'special-bg')] = false;
      nextSubmenuState[infoIconSubmenuStateKey(i, 'special-mask')] = false;
      nextSubmenuState[infoIconSubmenuStateKey(i, 'special-symbol')] = false;
      nextSubmenuState[infoIconSubmenuStateKey(i, 'special-props')] = false;
    }
  }
  infoLayerCardOpenState = nextCardState;
  infoIconSubmenuOpenState = nextSubmenuState;
}

function setAllInfoLayersEnabled(enabled) {
  const nextEnabled = !!enabled;
  infoLayers = normalizeInfoLayers(infoLayers).map(layer =>
    normalizeInfoLayer({ ...layer, enabled: nextEnabled }, layer.type)
  );
}

function initializeInfoPresetDefaultHiddenState() {
  applyInfoPresetByName(INFO_PRESET_DEFAULT_NAME);
  setAllInfoLayersEnabled(false);
  collapseAllInfoLayerDropdownState();
  saveActiveInfoPresetLayerState();
  renderInfoPresetButtons();
  renderInfoLayersPanel();
  queueInfoLayerRender(true);
}

function initializeInfoPresetForFirstVisitOnly(hasStoredConfigBeforeRestore) {
  if (hasStoredConfigBeforeRestore) return;
  let hiddenDone = false;
  try {
    hiddenDone = localStorage.getItem(INFO_PRESET_FIRST_VISIT_HIDDEN_KEY) === '1';
  } catch (_) {
    hiddenDone = false;
  }
  if (!hiddenDone) {
    initializeInfoPresetDefaultHiddenState();
    try {
      localStorage.setItem(INFO_PRESET_FIRST_VISIT_HIDDEN_KEY, '1');
    } catch (_) {}
    return;
  }
  // 非首次：不强制隐藏，只保证有可用预设
  if (!normalizeInfoPresetName(infoPresetActiveName)) {
    applyInfoPresetByName(INFO_PRESET_DEFAULT_NAME);
  }
}

function normalizeInfoLayerCardOpenState() {
  const next = {};
  for (let i = 0; i < infoLayers.length; i += 1) {
    next[i] = typeof infoLayerCardOpenState[i] === 'boolean' ? infoLayerCardOpenState[i] : true;
  }
  infoLayerCardOpenState = next;
}

function infoIconSubmenuStateKey(index, section) {
  return `${index}:${section}`;
}

function normalizeInfoIconSubmenuOpenState() {
  const next = {};
  for (let i = 0; i < infoLayers.length; i += 1) {
    const layer = infoLayers[i];
    if (!layer) continue;
    if (layer.type === 'icon') {
      const materialKey = infoIconSubmenuStateKey(i, 'material');
      const propsKey = infoIconSubmenuStateKey(i, 'props');
      next[materialKey] =
        typeof infoIconSubmenuOpenState[materialKey] === 'boolean'
          ? infoIconSubmenuOpenState[materialKey]
          : true;
      next[propsKey] =
        typeof infoIconSubmenuOpenState[propsKey] === 'boolean'
          ? infoIconSubmenuOpenState[propsKey]
          : true;
      continue;
    }
    if (layer.type === 'special') {
      const sections = ['special-bg', 'special-mask', 'special-symbol', 'special-props'];
      for (const section of sections) {
        const key = infoIconSubmenuStateKey(i, section);
        next[key] =
          typeof infoIconSubmenuOpenState[key] === 'boolean'
            ? infoIconSubmenuOpenState[key]
            : true;
      }
    }
  }
  infoIconSubmenuOpenState = next;
}

function isInfoIconSubmenuOpen(index, section) {
  const key = infoIconSubmenuStateKey(index, section);
  if (typeof infoIconSubmenuOpenState[key] !== 'boolean') {
    infoIconSubmenuOpenState[key] = true;
  }
  return infoIconSubmenuOpenState[key];
}

function toggleInfoIconSubmenu(index, section) {
  const key = infoIconSubmenuStateKey(index, section);
  infoIconSubmenuOpenState[key] = !isInfoIconSubmenuOpen(index, section);
  renderInfoLayersPanel();
}

function listInfoIconMaterialItems() {
  const out = [];
  const categories = infoIconCategories();
  for (const cat of categories) {
    const files = layerListFor(cat);
    if (!Array.isArray(files)) continue;
    for (const item of files) {
      if (!item || item.id == null || !item.path) continue;
      out.push({
        sourceCat: cat,
        id: String(item.id),
        name: item.name || item.file || String(item.id),
        path: String(item.path),
      });
    }
  }
  return out;
}

function isInfoLayerCardOpen(index) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0) return true;
  if (typeof infoLayerCardOpenState[i] !== 'boolean') infoLayerCardOpenState[i] = true;
  return infoLayerCardOpenState[i];
}

function toggleInfoLayerCard(index) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  infoLayerCardOpenState[i] = !isInfoLayerCardOpen(i);
  renderInfoLayersPanel();
}

function resetAllInfoTextLayerContents() {
  const ok = window.confirm('会恢复为当前预设的示例数据，你的修改将会丢失，是否执行？');
  if (!ok) return;

  const activePreset = getInfoPresetDefinitionByName(infoPresetActiveName);
  const baselineLayers = activePreset
    ? maskInfoLayersToPreset(
        infoPresetActiveName,
        buildInfoLayersFromPresetDefinition(activePreset, portraitSide)
      )
    : normalizeInfoLayers([]);
  infoLayers = cloneInfoLayerStateList(baselineLayers);

  renderInfoLayersPanel();
  queueInfoLayerRender(true);
}

function isInfoPanelNumberInput(target) {
  if (!(target instanceof HTMLInputElement)) return false;
  if (target.type !== 'number') return false;
  return !!target.closest('#infoPanel');
}

function setupInfoPanelNumberInputAutoSelect() {
  if (infoPanelNumberAutoSelectBound) return;
  const panel = document.getElementById('infoPanel');
  if (!panel) return;

  panel.addEventListener('focusin', event => {
    const input = event.target;
    if (!isInfoPanelNumberInput(input)) return;
    input.dataset.autoSelectArmed = '1';
    input.select();
    requestAnimationFrame(() => {
      if (document.activeElement === input) input.select();
    });
  });

  panel.addEventListener('mouseup', event => {
    const input = event.target;
    if (!isInfoPanelNumberInput(input)) return;
    if (input.dataset.autoSelectArmed !== '1') return;
    event.preventDefault();
    input.select();
    delete input.dataset.autoSelectArmed;
  });

  panel.addEventListener('focusout', event => {
    const input = event.target;
    if (!isInfoPanelNumberInput(input)) return;
    delete input.dataset.autoSelectArmed;
  });

  infoPanelNumberAutoSelectBound = true;
}

function setupTextLayerControls() {
  const panel = document.getElementById('infoPanel');
  if (!panel) return;
  setupInfoPanelNumberInputAutoSelect();
  setTextLayerLocalFontsStatus('');
  infoPresetActiveName = resolveEffectiveInfoPresetName(infoPresetActiveName);
  if (infoPresetActiveName) {
    infoLayers = maskInfoLayersToPreset(
      infoPresetActiveName,
      getInfoPresetLayerState(infoPresetActiveName, portraitSide)
    );
    saveInfoPresetLayerState(infoPresetActiveName, infoLayers);
  } else {
    infoLayers = normalizeInfoLayers(infoLayers);
  }
  renderInfoPresetButtons();
  renderInfoLayersPanel();
}

function queueInfoLayerRender(immediate = false) {
  saveActiveInfoPresetLayerState();
  if (immediate) {
    if (infoLayerRenderTimer) {
      clearTimeout(infoLayerRenderTimer);
      infoLayerRenderTimer = null;
    }
    void render();
    schedulePersistComposerConfig();
    return;
  }
  if (infoLayerRenderTimer) clearTimeout(infoLayerRenderTimer);
  infoLayerRenderTimer = setTimeout(() => {
    infoLayerRenderTimer = null;
    void render();
    schedulePersistComposerConfig();
  }, 120);
}

function addInfoTextLayer() {
  // 固定槽位模式：不允许用户新增图层
  return;
}

function addInfoIconLayer() {
  // 固定槽位模式：不允许用户新增图层
  return;
}

function moveInfoLayer(index, delta) {
  // 固定槽位模式：不允许用户调整图层数量/顺序
  return;
}

function removeInfoLayer(index) {
  // 固定槽位模式：不允许用户删除图层
  return;
}

function updateInfoLayerEnabled(index, enabled) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  const layer = infoLayers[i];
  infoLayers[i] = normalizeInfoLayer({ ...layer, enabled: !!enabled }, layer.type);
  // 启用/隐藏图标来自渲染模板，需要立即重绘面板才能反映当前状态
  renderInfoLayersPanel();
  queueInfoLayerRender(false);
}

function updateInfoLayerName(index, name) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  const layer = infoLayers[i];
  infoLayers[i] = normalizeInfoLayer({ ...layer, name }, layer.type);
  queueInfoLayerRender(false);
}

function updateInfoTextLayerField(index, key, value) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  const layer = infoLayers[i];
  if (!layer || layer.type !== 'text') return;
  infoLayers[i] = normalizeInfoLayer({ ...layer, [key]: value }, 'text');
  queueInfoLayerRender(false);
}

function updateInfoTextLayerFontFamily(index, fontFamily) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  const layer = infoLayers[i];
  if (!layer || layer.type !== 'text') return;
  const next = normalizeInfoLayer({ ...layer, fontFamily }, 'text');
  infoLayers[i] = next;
  renderInfoLayersPanel();
  queueInfoLayerRender(false);
}

function updateInfoTextLayerFontVariant(index, fontVariant) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  const layer = infoLayers[i];
  if (!layer || layer.type !== 'text') return;
  const next = normalizeInfoLayer({ ...layer, fontVariant }, 'text');
  infoLayers[i] = next;
  queueInfoLayerRender(false);
}

function updateInfoIconLayerField(index, key, value) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  const layer = infoLayers[i];
  if (!layer || layer.type !== 'icon') return;
  infoLayers[i] = normalizeInfoLayer({ ...layer, [key]: value }, 'icon');
  queueInfoLayerRender(false);
}

function updateInfoSpecialLayerField(index, key, value) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  const layer = infoLayers[i];
  if (!layer || layer.type !== 'special') return;
  infoLayers[i] = normalizeInfoLayer({ ...layer, [key]: value }, 'special');
  queueInfoLayerRender(false);
}

function updateInfoSpecialLayerColorChannel(index, key, channel, value) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  const layer = infoLayers[i];
  if (!layer || layer.type !== 'special') return;
  const allowedKey = key === 'maskDarkColor' || key === 'maskLightColor' ? key : '';
  const allowedChannel = channel === 'r' || channel === 'g' || channel === 'b' ? channel : '';
  if (!allowedKey || !allowedChannel) return;
  const rgb = hexColorToRgbObject(layer[allowedKey], allowedKey === 'maskDarkColor' ? '#5f3c22' : '#f6d9a7');
  rgb[allowedChannel] = Math.round(clampNumberInRange(value, 0, 255, rgb[allowedChannel]));
  infoLayers[i] = normalizeInfoLayer(
    {
      ...layer,
      [allowedKey]: rgbObjectToHexColor(rgb, layer[allowedKey]),
    },
    'special'
  );
  renderInfoLayersPanel();
  queueInfoLayerRender(true);
}

function updateInfoFixedLayerField(index, key, value) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  const layer = infoLayers[i];
  if (!layer || layer.type !== 'fixed') return;
  infoLayers[i] = normalizeInfoLayer({ ...layer, [key]: value }, 'fixed');
  queueInfoLayerRender(false);
}

function updateInfoBar48LayerField(index, key, value) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  const layer = infoLayers[i];
  if (!layer || layer.type !== 'bar48') return;
  infoLayers[i] = normalizeInfoLayer({ ...layer, [key]: value }, 'bar48');
  queueInfoLayerRender(false);
}

function toggleInfoBar48Cell(index, cellIndex) {
  const i = Number(index);
  const c = Number(cellIndex);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  if (!Number.isInteger(c) || c < 0 || c >= INFO_BAR48_COUNT) return;
  const layer = infoLayers[i];
  if (!layer || layer.type !== 'bar48') return;
  const states = normalizeInfoBar48States(layer.states);
  states[c] = states[c] ? 0 : 1;
  infoLayers[i] = normalizeInfoLayer({ ...layer, states }, 'bar48');
  renderInfoLayersPanel();
  queueInfoLayerRender(true);
}

function setInfoBar48All(index, value) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  const layer = infoLayers[i];
  if (!layer || layer.type !== 'bar48') return;
  const bit = Number(value) === 1 ? 1 : 0;
  const states = Array.from({ length: INFO_BAR48_COUNT }, () => bit);
  infoLayers[i] = normalizeInfoLayer({ ...layer, states }, 'bar48');
  renderInfoLayersPanel();
  queueInfoLayerRender(true);
}

function setInfoIconLayerMaterial(index, sourceCat, itemId) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  const scrollState = captureInfoIconMaterialMenuScroll(i);
  const layer = infoLayers[i];
  if (!layer || layer.type !== 'icon') return;
  const forcedSourceCat = resolveInfoIconCategoryForLayer(layer.id, sourceCat);
  const nextRaw = {
    ...layer,
    sourceCat: forcedSourceCat,
    itemId,
  };
  if (forcedSourceCat === INFO_ICON_ACTIVITY_CATEGORY) {
    const itemIds = normalizeInfoIconItemIds(itemId ? [itemId] : []);
    nextRaw.itemIds = itemIds;
    nextRaw.itemId = itemIds[0] || '';
  } else {
    nextRaw.itemIds = [];
  }
  const next = normalizeInfoLayer(nextRaw, 'icon');
  infoLayers[i] = next;
  renderInfoLayersPanel();
  restoreInfoIconMaterialMenuScroll(i, scrollState);
  queueInfoLayerRender(true);
}

function toggleInfoIconLayerMaterial(index, sourceCat, itemId) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  const layer = infoLayers[i];
  if (!layer || layer.type !== 'icon') return;
  const forcedSourceCat = resolveInfoIconCategoryForLayer(layer.id, sourceCat);
  if (forcedSourceCat !== INFO_ICON_ACTIVITY_CATEGORY) {
    setInfoIconLayerMaterial(index, forcedSourceCat, itemId);
    return;
  }
  const scrollState = captureInfoIconMaterialMenuScroll(i);
  const normalized = normalizeInfoLayer(
    {
      ...layer,
      sourceCat: forcedSourceCat,
    },
    'icon'
  );
  const currentIds = normalizeInfoIconItemIds(
    Array.isArray(normalized.itemIds) && normalized.itemIds.length > 0
      ? normalized.itemIds
      : normalized.itemId
        ? [normalized.itemId]
        : []
  );
  const targetId = String(itemId == null ? '' : itemId).trim();
  if (!targetId) return;

  const exists = currentIds.includes(targetId);
  let nextIds;
  if (exists) {
    nextIds = currentIds.filter(id => id !== targetId);
  } else {
    if (currentIds.length >= INFO_ACTIVITY_ICON_MAX_COUNT) {
      alert(`最多可选择 ${INFO_ACTIVITY_ICON_MAX_COUNT} 个活动图标`);
      return;
    }
    nextIds = [...currentIds, targetId];
  }
  nextIds = normalizeInfoIconItemIds(nextIds, INFO_ACTIVITY_ICON_MAX_COUNT);
  infoLayers[i] = normalizeInfoLayer(
    {
      ...layer,
      sourceCat: forcedSourceCat,
      itemIds: nextIds,
      itemId: nextIds[0] || '',
    },
    'icon'
  );
  renderInfoLayersPanel();
  restoreInfoIconMaterialMenuScroll(i, scrollState);
  queueInfoLayerRender(true);
}

function setInfoSpecialLayerMaterial(index, kind, itemId) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  const sectionByKind = {
    background: 'special-bg',
    mask: 'special-mask',
    symbol: 'special-symbol',
  };
  const submenuKey = sectionByKind[kind] || 'special-symbol';
  const scrollState = captureInfoLayerSubmenuScroll(i, submenuKey);
  const layer = infoLayers[i];
  if (!layer || layer.type !== 'special') return;
  const fieldKey = infoSpecialFieldKeyByKind(kind);
  const nextRawId = normalizeInfoSpecialLegacyItemId(itemId);
  let nextId = nextRawId;
  if (kind === 'symbol') {
    nextId = nextRawId || resolveDefaultInfoSpecialSymbolItemId(nextRawId);
  }
  const next = normalizeInfoLayer({ ...layer, [fieldKey]: nextId }, 'special');
  infoLayers[i] = next;
  renderInfoLayersPanel();
  restoreInfoLayerSubmenuScroll(i, scrollState, submenuKey);
  queueInfoLayerRender(true);
  persistComposerConfigNow();
}

function captureInfoLayerSubmenuScroll(index, submenuKey = '') {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0) return null;
  const panelScroll = document.getElementById('panelScroll');
  const card = getInfoLayerCardElement(i);
  if (!card) return null;
  const key = String(submenuKey || '').trim();
  const menuSelector = key ? `.info-submenu[data-submenu-key="${key}"]` : '.info-submenu';
  const menu = card.querySelector(menuSelector) || card.querySelector('.info-submenu');
  const body = menu ? menu.querySelector('.info-submenu-body') : null;
  const row = menu ? menu.querySelector('.thumb-row') : null;
  return {
    panelTop: panelScroll ? panelScroll.scrollTop : null,
    bodyTop: body ? body.scrollTop : null,
    rowTop: row ? row.scrollTop : null,
    rowLeft: row ? row.scrollLeft : null,
  };
}

function restoreInfoLayerSubmenuScroll(index, state, submenuKey = '') {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || !state || typeof state !== 'object') return;
  requestAnimationFrame(() => {
    const panelScroll = document.getElementById('panelScroll');
    if (panelScroll && Number.isFinite(Number(state.panelTop))) {
      panelScroll.scrollTop = Math.max(0, Number(state.panelTop));
    }

    const card = getInfoLayerCardElement(i);
    if (!card) return;
    const key = String(submenuKey || '').trim();
    const menuSelector = key ? `.info-submenu[data-submenu-key="${key}"]` : '.info-submenu';
    const menu = card.querySelector(menuSelector) || card.querySelector('.info-submenu');
    if (!menu) return;
    const body = menu.querySelector('.info-submenu-body');
    if (body && Number.isFinite(Number(state.bodyTop))) {
      body.scrollTop = Math.max(0, Number(state.bodyTop));
    }
    const row = menu.querySelector('.thumb-row');
    if (row) {
      if (Number.isFinite(Number(state.rowTop))) row.scrollTop = Math.max(0, Number(state.rowTop));
      if (Number.isFinite(Number(state.rowLeft))) row.scrollLeft = Math.max(0, Number(state.rowLeft));
    }
  });
}

function captureInfoIconMaterialMenuScroll(index) {
  return captureInfoLayerSubmenuScroll(index, 'material');
}

function restoreInfoIconMaterialMenuScroll(index, state) {
  restoreInfoLayerSubmenuScroll(index, state, 'material');
}

function setInfoIconLayerCategory(index, cat) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  const layer = infoLayers[i];
  if (!layer || layer.type !== 'icon') return;
  const forcedSourceCat = resolveInfoIconCategoryForLayer(layer.id, cat);
  const next = normalizeInfoLayer(
    { ...layer, sourceCat: forcedSourceCat, itemId: '', itemIds: [] },
    'icon'
  );
  infoLayers[i] = next;
  renderInfoLayersPanel();
  queueInfoLayerRender(true);
}

function toggleInfoTextLayerStyle(index, kind) {
  if (!['smallCaps', 'freeLigatures', 'shadowGray'].includes(kind)) return;
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  const layer = infoLayers[i];
  if (!layer || layer.type !== 'text') return;
  if (kind === 'freeLigatures' && isJupiterProFontFamily(layer.fontFamily)) return;
  if (kind === 'shadowGray') {
    const normalized = normalizeInfoLayer(layer, 'text');
    const enabled =
      normalized.renderEffect === TEXT_RENDER_EFFECT_SHADOW_GRAY ||
      normalized.renderEffect === TEXT_RENDER_EFFECT_EMBOSS_SOFT;
    infoLayers[i] = normalizeInfoLayer(
      {
        ...layer,
        renderEffect: enabled ? TEXT_RENDER_EFFECT_NONE : TEXT_RENDER_EFFECT_SHADOW_GRAY,
      },
      'text'
    );
  } else {
    infoLayers[i] = normalizeInfoLayer({ ...layer, [kind]: !layer[kind] }, 'text');
  }
  renderInfoLayersPanel();
  queueInfoLayerRender(true);
}

function getInfoTextLayerSlotIndices() {
  const indices = [];
  for (let i = 0; i < infoLayers.length; i += 1) {
    const layer = infoLayers[i];
    if (layer && layer.type === 'text') indices.push(i);
  }
  return indices;
}

function findReusableInfoTextLayerSlotIndex(sourceIndex, side = 'right') {
  const textLayerIndices = getInfoTextLayerSlotIndices();
  const sourcePos = textLayerIndices.indexOf(sourceIndex);
  if (sourcePos < 0) return -1;

  if (side === 'left') {
    for (let pos = sourcePos - 1; pos >= 0; pos -= 1) {
      const i = textLayerIndices[pos];
      const layer = infoLayers[i];
      if (!layer || layer.type !== 'text') continue;
      const normalized = normalizeInfoLayer(layer, 'text');
      if (!String(normalized.text || '').trim()) return i;
    }
    return -1;
  }

  for (let pos = sourcePos + 1; pos < textLayerIndices.length; pos += 1) {
    const i = textLayerIndices[pos];
    const layer = infoLayers[i];
    if (!layer || layer.type !== 'text') continue;
    const normalized = normalizeInfoLayer(layer, 'text');
    if (!String(normalized.text || '').trim()) return i;
  }
  return -1;
}

function focusInfoTextLayerEditor(index) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0) return;
  requestAnimationFrame(() => {
    const card = getInfoLayerCardElement(i);
    if (!card) return;
    const textarea = card.querySelector('textarea.text-layer-textarea');
    if (!textarea) return;
    textarea.focus();
    textarea.select();
  });
}

function appendInfoTextLayerAtSide(index, side = 'right') {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  const layer = infoLayers[i];
  if (!layer || layer.type !== 'text') return;
  const normalizedSide = side === 'left' ? 'left' : 'right';
  const source = normalizeInfoLayer(layer, 'text');
  if (!String(source.text || '').trim()) {
    alert('请先填写当前文字图层内容。');
    return;
  }

  const targetIndex = findReusableInfoTextLayerSlotIndex(i, normalizedSide);
  if (targetIndex < 0) {
    const sideLabel = normalizedSide === 'left' ? '左侧' : '右侧';
    alert(`当前${sideLabel}没有可用的空白文字图层（按固定槽位顺序分配）。`);
    return;
  }

  const isLeft = normalizedSide === 'left';
  const layout = computeTextLayerLayout(source);
  const nextAlign = isLeft ? 'right' : 'left';
  const nextX = Math.round(
    isLeft
      ? (layout.bounds.minX - INFO_TEXT_APPEND_GAP)
      : (layout.bounds.maxX + INFO_TEXT_APPEND_GAP)
  );
  const nextNameSuffix = isLeft ? 'L' : 'R';
  const targetLayer = infoLayers[targetIndex];

  infoLayers[targetIndex] = normalizeInfoLayer(
    {
      ...targetLayer,
      enabled: true,
      name: sanitizeInfoLayerName(`${source.name} ${nextNameSuffix}`, `文字图层 ${targetIndex + 1}`),
      text: '',
      fontFamily: source.fontFamily,
      bold: source.bold,
      italic: source.italic,
      underline: source.underline,
      smallCaps: source.smallCaps,
      freeLigatures: source.freeLigatures,
      renderEffect: source.renderEffect,
      fontVariant: source.fontVariant,
      align: nextAlign,
      x: nextX,
      y: source.y,
      fontSize: source.fontSize,
      lineHeightMode: source.lineHeightMode,
      lineHeight: source.lineHeight,
      tracking: source.tracking,
      kerningVA: source.kerningVA,
      scaleXPercent: source.scaleXPercent,
      scaleYPercent: source.scaleYPercent,
      baselineShift: source.baselineShift,
      adaptiveColorSource: source.adaptiveColorSource,
      adaptiveColorFont1: source.adaptiveColorFont1,
      adaptiveColorFont2: source.adaptiveColorFont2,
      svgTextCalt: source.svgTextCalt,
      followLayerId: source.followLayerId,
      followXGap: source.followXGap,
      color: source.color,
      inlineIconPath: source.inlineIconPath,
      inlineIconSize: source.inlineIconSize,
      inlineIconWidth: source.inlineIconWidth,
      inlineIconHeight: source.inlineIconHeight,
      inlineIconGap: source.inlineIconGap,
      strokeEnabled: source.strokeEnabled,
      strokePosition: source.strokePosition,
      strokeWidth: source.strokeWidth,
      strokeColor: source.strokeColor,
      opacity: source.opacity,
    },
    'text'
  );

  infoLayerCardOpenState[targetIndex] = true;
  renderInfoLayersPanel();
  queueInfoLayerRender(true);
  focusInfoTextLayerEditor(targetIndex);
}

function centerInfoTextLayer(index) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  const layer = infoLayers[i];
  if (!layer || layer.type !== 'text') return;
  infoLayers[i] = normalizeInfoLayer(
    {
      ...layer,
      x: Math.round(CANVAS_FULL.w / 2),
      y: Math.round(CANVAS_FULL.h / 2),
    },
    'text'
  );
  renderInfoLayersPanel();
  queueInfoLayerRender(true);
}

function resetInfoTextLayer(index) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= infoLayers.length) return;
  const normalizedLayers = normalizeInfoLayers(infoLayers);
  const layer = normalizedLayers[i];
  if (!layer || layer.type !== 'text') return;

  // 目标：回到“当前预设”该槽位参数；若无预设则回到固定模板默认参数。
  const activePreset = getInfoPresetDefinitionByName(infoPresetActiveName);
  const baselineLayers = activePreset
    ? maskInfoLayersToPreset(
        infoPresetActiveName,
        buildInfoLayersFromPresetDefinition(activePreset, portraitSide)
      )
    : normalizeInfoLayers([]);
  const baselineById = new Map(
    baselineLayers
      .filter(item => item && item.type === 'text')
      .map(item => [item.id, item])
  );
  const baseline = baselineById.get(layer.id) || baselineLayers[i] || createDefaultInfoTextLayer({ id: layer.id, name: layer.name });

  // 不清空输入文字；同时保留当前启用状态和图层名称。
  infoLayers[i] = normalizeInfoLayer(
    {
      ...baseline,
      id: layer.id,
      type: 'text',
      name: layer.name,
      enabled: layer.enabled,
      text: layer.text,
    },
    'text'
  );
  renderInfoLayersPanel();
  queueInfoLayerRender(true);
}
