function layerListFor(cat) {
  if (PORTRAIT_CATS.includes(cat)) {
    const a = fileData.portrait[cat];
    return Array.isArray(a) ? a : [];
  }
  if (cat === INFO_ICON_LIMITED_CATEGORY) {
    const direct = fileData.nameplate[cat];
    if (Array.isArray(direct)) return direct;
    const legacy = fileData.nameplate[INFO_ICON_LEGACY_CATEGORY];
    return Array.isArray(legacy) ? legacy : [];
  }
  const a = fileData.nameplate[cat];
  return Array.isArray(a) ? a : [];
}

async function applyPreset(type, name) {
  if (!name) return;
  if (!presets || !Array.isArray(presets.banner) || !Array.isArray(presets.charcard)) return;

  const list = type === 'banner' ? presets.banner : presets.charcard;
  const preset = list.find(p => p.name === name);
  if (!preset) return;

  if (type === 'charcard') {
    // 铭牌预设：仅更新铭牌侧图层，不改肖像侧三层
    [...NAMEPLATE_CATS, '肖像外框'].forEach(c => {
      selected[c] = null;
      const el = document.getElementById('selected-' + c);
      if (el) { el.src = ''; el.style.display = 'none'; }
    });
    const assignList = [];
    const pushLayer = (layer) => {
      const cat = layer.cat;
      const id = layer.id;
      if (!id) return;
      if (PORTRAIT_CATS.includes(cat)) return; // 保留当前肖像三层
      const fd = layerListFor(cat);
      const item = fd.find(f => f.id === String(id));
      if (!item) { console.log('[preset] 未找到', cat, id); return; }
      assignList.push({ cat, item });
    };
    for (const layer of preset.layers) pushLayer(layer);
    await prefetchImgPaths(assignList.map(a => a.item.path));
    for (const { cat, item } of assignList) {
      selected[cat] = item;
      const el = document.getElementById('selected-' + cat);
      if (el) { el.src = item.path; el.style.display = 'block'; }
    }
  } else {
    // 肖像预设：只清空和加载肖像图层，不动铭牌
    [...PORTRAIT_CATS].forEach(c => {
      selected[c] = null;
      const el = document.getElementById('selected-' + c);
      if (el) { el.src = ''; el.style.display = 'none'; }
    });
    const assignList = [];
    for (const layer of preset.layers) {
      const cat = layer.cat;
      const id = layer.id;
      if (!id) continue;
      const fd = layerListFor(cat);
      const item = fd.find(f => f.id === String(id));
      if (!item) { console.log('[preset] 未找到', cat, id); continue; }
      assignList.push({ cat, item });
    }
    await prefetchImgPaths(assignList.map(a => a.item.path));
    for (const { cat, item } of assignList) {
      selected[cat] = item;
      const el = document.getElementById('selected-' + cat);
      if (el) { el.src = item.path; el.style.display = 'block'; }
    }
  }

  renderPortraitSections();
  renderNameplateSections();
  if (type === 'charcard') await switchTab('full');
  else await switchTab('portrait');
  schedulePersistComposerConfig();
}

function prevPreset(type) {
  const sel = document.getElementById(type === 'banner' ? 'presetBanner' : 'presetChar');
  const opts = Array.from(sel.options).filter(o => o.value);
  if (opts.length === 0) return;
  const curIdx = opts.findIndex(o => o.value === sel.value);
  const prevIdx = curIdx <= 0 ? opts.length - 1 : curIdx - 1;
  sel.value = opts[prevIdx].value;
  void applyPreset(type, sel.value);
}

function nextPreset(type) {
  const sel = document.getElementById(type === 'banner' ? 'presetBanner' : 'presetChar');
  const opts = Array.from(sel.options).filter(o => o.value);
  if (opts.length === 0) return;
  const curIdx = opts.findIndex(o => o.value === sel.value);
  const nextIdx = curIdx >= opts.length - 1 ? 0 : curIdx + 1;
  sel.value = opts[nextIdx].value;
  void applyPreset(type, sel.value);
}
