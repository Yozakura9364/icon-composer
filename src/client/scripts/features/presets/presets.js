function normalizeInfoPresetName(raw) {
  const v = String(raw == null ? '' : raw).trim();
  return INFO_PRESET_NAME_SET.has(v) ? v : '';
}

function normalizePortraitSide(side) {
  return side === 'left' ? 'left' : 'right';
}

function getInfoPresetDefinitionByName(name) {
  const target = normalizeInfoPresetName(name);
  if (!target) return null;
  return INFO_PRESET_DEFINITIONS.find(item => item && item.name === target) || null;
}

function cloneInfoLayerStateList(layers) {
  return normalizeInfoLayers(layers).map(layer => normalizeInfoLayer({ ...layer }, layer.type));
}

function normalizeInfoPresetLayerStates(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const name of INFO_PRESET_NAME_SET) {
    const val = raw[name];
    if (Array.isArray(val)) out[name] = cloneInfoLayerStateList(val);
  }
  return out;
}

function saveInfoPresetLayerState(name, layers) {
  const target = normalizeInfoPresetName(name);
  if (!target) return;
  infoPresetLayerStates[target] = cloneInfoLayerStateList(maskInfoLayersToPreset(target, layers));
}

function saveActiveInfoPresetLayerState() {
  const active = normalizeInfoPresetName(infoPresetActiveName);
  if (!active) return;
  saveInfoPresetLayerState(active, infoLayers);
}

function mergePresetDefaultsIntoExistingInfoLayers(existingLayers, preset, side = portraitSide) {
  const current = normalizeInfoLayers(existingLayers);
  if (!preset || !Array.isArray(preset.layers) || !preset.layers.length) {
    return { layers: current, changed: false };
  }
  const template = normalizeInfoLayers([]);
  const presetBuilt = buildInfoLayersFromPresetDefinition(preset, side);
  const templateById = new Map(template.map(layer => [layer.id, layer]));
  const presetById = new Map(presetBuilt.map(layer => [layer.id, layer]));
  let changed = false;
  const merged = current.map(layer => {
    if (!layer || !layer.id) return layer;
    const presetLayer = presetById.get(layer.id);
    const templateLayer = templateById.get(layer.id);
    if (!presetLayer || !templateLayer) return layer;
    const currentJson = JSON.stringify(layer);
    const templateJson = JSON.stringify(templateLayer);
    if (currentJson !== templateJson) return layer;
    const presetJson = JSON.stringify(presetLayer);
    if (presetJson === templateJson) return layer;
    changed = true;
    return presetLayer;
  });
  return { layers: merged, changed };
}

function infoLayerContentSignature(layer) {
  if (!layer || typeof layer !== 'object') return '';
  const copy = { ...layer };
  delete copy.id;
  delete copy.name;
  return JSON.stringify(copy);
}

function cleanPresetLayerContaminationBySignature(name, layers) {
  const target = normalizeInfoPresetName(name);
  const normalized = normalizeInfoLayers(layers);
  if (!target) return { layers: normalized, changed: false };
  const preset = getInfoPresetDefinitionByName(target);
  if (!preset || !Array.isArray(preset.layers) || !preset.layers.length) {
    return { layers: normalized, changed: false };
  }
  const template = normalizeInfoLayers([]);
  const templateById = new Map(template.map(layer => [layer.id, layer]));
  const patchIdSet = new Set(
    preset.layers
      .map(layer => String(layer && layer.id != null ? layer.id : '').trim())
      .filter(Boolean)
  );
  const patchSignatureSet = new Set(
    normalized
      .filter(layer => layer && patchIdSet.has(layer.id))
      .map(infoLayerContentSignature)
      .filter(Boolean)
  );
  let changed = false;
  const out = normalized.map(layer => {
    if (!layer || !layer.id) return layer;
    if (patchIdSet.has(layer.id)) return layer;
    const templateLayer = templateById.get(layer.id);
    if (!templateLayer) return layer;
    const sig = infoLayerContentSignature(layer);
    const templateSig = infoLayerContentSignature(templateLayer);
    if (!sig || sig === templateSig) return layer;
    if (!patchSignatureSet.has(sig)) return layer;
    changed = true;
    return templateLayer;
  });
  return { layers: out, changed };
}

function getInfoPresetLayerState(name, side = portraitSide) {
  const target = resolveEffectiveInfoPresetName(name);
  if (!target) return normalizeInfoLayers([]);
  const existing = infoPresetLayerStates[target];
  if (Array.isArray(existing) && existing.length) {
    const preset = getInfoPresetDefinitionByName(target);
    const merged = mergePresetDefaultsIntoExistingInfoLayers(existing, preset, side);
    let nextLayers = merged.layers;
    let changed = merged.changed;
    const cleaned = cleanPresetLayerContaminationBySignature(target, nextLayers);
    if (cleaned.changed) {
      nextLayers = cleaned.layers;
      changed = true;
    }
    const aligned = alignInfoLayersToPortraitSideForPreset(nextLayers, preset, side);
    if (aligned.changed) {
      nextLayers = aligned.layers;
      changed = true;
    }
    const masked = maskInfoLayersToPreset(target, nextLayers);
    if (JSON.stringify(masked) !== JSON.stringify(nextLayers)) {
      nextLayers = masked;
      changed = true;
    }
    if (changed) saveInfoPresetLayerState(target, nextLayers);
    return cloneInfoLayerStateList(nextLayers);
  }
  const preset = getInfoPresetDefinitionByName(target);
  const built = preset ? buildInfoLayersFromPresetDefinition(preset, side) : normalizeInfoLayers([]);
  const maskedBuilt = maskInfoLayersToPreset(target, built);
  saveInfoPresetLayerState(target, maskedBuilt);
  return cloneInfoLayerStateList(maskedBuilt);
}

function getOrderedInfoPresetDefinitions() {
  const orderMap = new Map(INFO_PRESET_BUTTON_ORDER.map((name, idx) => [name, idx]));
  return INFO_PRESET_DEFINITIONS
    .map((preset, idx) => ({ preset, idx }))
    .sort((a, b) => {
      const oa = orderMap.has(a.preset.name) ? orderMap.get(a.preset.name) : Number.MAX_SAFE_INTEGER;
      const ob = orderMap.has(b.preset.name) ? orderMap.get(b.preset.name) : Number.MAX_SAFE_INTEGER;
      if (oa !== ob) return oa - ob;
      return a.idx - b.idx;
    })
    .map(item => item.preset);
}

function resolveInfoPresetLayerPosition(definition, layerPatch, side) {
  if (!layerPatch || typeof layerPatch !== 'object') return null;
  const normalizedSide = normalizePortraitSide(side);
  const fallbackXRaw = Number(layerPatch.x);
  const fallbackYRaw = Number(layerPatch.y);
  const fallbackX = Number.isFinite(fallbackXRaw) ? Math.round(fallbackXRaw) : null;
  const fallbackY = Number.isFinite(fallbackYRaw) ? Math.round(fallbackYRaw) : null;

  const sideMap = layerPatch.positionBySide;
  if (sideMap && typeof sideMap === 'object') {
    const sidePos = sideMap[normalizedSide];
    if (sidePos && typeof sidePos === 'object') {
      const sx = Number(sidePos.x);
      const sy = Number(sidePos.y);
      const x = Number.isFinite(sx) ? Math.round(sx) : fallbackX;
      const y = Number.isFinite(sy) ? Math.round(sy) : fallbackY;
      if (x != null && y != null) return { x, y };
    }
  }

  if (fallbackX != null && fallbackY != null) return { x: fallbackX, y: fallbackY };
  return null;
}

function alignInfoLayersToPortraitSideForPreset(layers, preset, side = portraitSide) {
  const normalizedLayers = normalizeInfoLayers(layers);
  if (!preset || !Array.isArray(preset.layers) || !preset.layers.length) {
    return { layers: normalizedLayers, changed: false };
  }
  const targetSide = normalizePortraitSide(side);
  const patchById = new Map();
  for (const layer of preset.layers) {
    if (!layer || typeof layer !== 'object') continue;
    const id = String(layer.id == null ? '' : layer.id).trim();
    if (!id || patchById.has(id)) continue;
    patchById.set(id, layer);
  }
  let changed = false;
  const nextLayers = normalizedLayers.map(layer => {
    if (!layer || !layer.id) return layer;
    const patch = patchById.get(layer.id);
    if (!patch) return layer;
    const leftPos = resolveInfoPresetLayerPosition(preset, patch, 'left');
    const rightPos = resolveInfoPresetLayerPosition(preset, patch, 'right');
    const targetPos = resolveInfoPresetLayerPosition(preset, patch, targetSide);
    if (!leftPos || !rightPos || !targetPos) return layer;
    const curX = Number(layer.x);
    const curY = Number(layer.y);
    if (!Number.isFinite(curX) || !Number.isFinite(curY)) return layer;
    const x = Math.round(curX);
    const y = Math.round(curY);
    const matchesPresetLeft = x === leftPos.x && y === leftPos.y;
    const matchesPresetRight = x === rightPos.x && y === rightPos.y;
    if (!matchesPresetLeft && !matchesPresetRight) {
      // Keep user-customized coordinates.
      return layer;
    }
    if (x === targetPos.x && y === targetPos.y) return layer;
    changed = true;
    return normalizeInfoLayer({ ...layer, x: targetPos.x, y: targetPos.y }, layer.type);
  });
  return { layers: nextLayers, changed };
}

function buildInfoLayersFromPresetDefinition(definition, side = portraitSide) {
  const base = normalizeInfoLayers([]);
  if (!definition || !Array.isArray(definition.layers)) return base;
  const patchById = new Map();
  for (const layer of definition.layers) {
    if (!layer || typeof layer !== 'object') continue;
    const id = String(layer.id == null ? '' : layer.id).trim();
    if (!id || patchById.has(id)) continue;
    patchById.set(id, layer);
  }
  return base.map(slot => {
    const patch = patchById.get(slot.id);
    if (!patch) return slot;
    const pos = resolveInfoPresetLayerPosition(definition, patch, side);
    return normalizeInfoLayer(
      {
        ...slot,
        ...patch,
        ...(pos ? { x: pos.x, y: pos.y } : {}),
        id: slot.id,
        type: slot.type,
        name: normalizeInfoLayerDisplayName(slot.id, patch.name, slot.name),
      },
      slot.type
    );
  });
}

function syncInfoPresetLayerPositionsForPortraitSideChange(prevSide, nextSide) {
  const preset = getInfoPresetDefinitionByName(infoPresetActiveName);
  if (!preset || !Array.isArray(preset.layers)) return;
  const fromSide = normalizePortraitSide(prevSide);
  const toSide = normalizePortraitSide(nextSide);
  if (fromSide === toSide) return;

  const patchById = new Map();
  for (const layer of preset.layers) {
    if (!layer || typeof layer !== 'object') continue;
    const id = String(layer.id == null ? '' : layer.id).trim();
    if (!id || patchById.has(id)) continue;
    patchById.set(id, layer);
  }

  let changed = false;
  infoLayers = normalizeInfoLayers(infoLayers).map(layer => {
    const patch = patchById.get(layer.id);
    if (!patch) return layer;
    const fromPos = resolveInfoPresetLayerPosition(preset, patch, fromSide);
    const toPos = resolveInfoPresetLayerPosition(preset, patch, toSide);
    if (!fromPos || !toPos) return layer;

    const curX = Number(layer.x);
    const curY = Number(layer.y);
    if (!Number.isFinite(curX) || !Number.isFinite(curY)) return layer;
    if (Math.round(curX) !== fromPos.x || Math.round(curY) !== fromPos.y) {
      // 用户改过 XY：保持自定义，不跟随左右切换迁移
      return layer;
    }
    if (fromPos.x === toPos.x && fromPos.y === toPos.y) return layer;
    changed = true;
    return normalizeInfoLayer({ ...layer, x: toPos.x, y: toPos.y }, layer.type);
  });

  if (changed) {
    renderInfoLayersPanel();
    saveActiveInfoPresetLayerState();
  }
}

function renderInfoPresetButtons() {
  const row = document.getElementById('infoPresetRow');
  if (!row) return;
  const ordered = getOrderedInfoPresetDefinitions();
  row.innerHTML = ordered.map((preset, idx) => {
    const active = normalizeInfoPresetName(infoPresetActiveName) === preset.name;
    return `<button type="button" class="btn btn-ghost info-preset-btn ${active ? 'active' : ''}" aria-pressed="${active ? 'true' : 'false'}" onclick="toggleInfoPresetByIndex(${idx})">${escapeHtml(preset.name)}</button>`;
  }).join('');
}

function applyInfoPresetByName(name) {
  const target = resolveEffectiveInfoPresetName(name);
  const preset = getInfoPresetDefinitionByName(target);
  if (!preset) return;
  saveActiveInfoPresetLayerState();
  infoPresetActiveName = target;
  infoLayers = maskInfoLayersToPreset(target, getInfoPresetLayerState(target, portraitSide));
  saveInfoPresetLayerState(target, infoLayers);
  collapseAllInfoLayerDropdownState();
  renderInfoPresetButtons();
  renderInfoLayersPanel();
  queueInfoLayerRender(true);
}

function toggleInfoPresetByIndex(index) {
  const ordered = getOrderedInfoPresetDefinitions();
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= ordered.length) return;
  const preset = ordered[idx];
  if (!preset || !preset.name) return;
  if (normalizeInfoPresetName(infoPresetActiveName) === preset.name) return;
  applyInfoPresetByName(preset.name);
}
