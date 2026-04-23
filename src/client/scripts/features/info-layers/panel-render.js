function buildInfoLayerEnableHtml(normalized, index) {
  const visible = normalized && normalized.enabled === true;
  const iconPath = visible ? appPath('/assets/icons/invisible.svg') : appPath('/assets/icons/visible.svg');
  const action = visible ? '隐藏图层' : '显示图层';
  return `
    <button
      type="button"
      class="info-layer-enable"
      onclick="event.stopPropagation(); updateInfoLayerEnabled(${index}, ${visible ? 'false' : 'true'});"
      title="${action}"
      aria-label="${action}"
    >
      <img src="${escapeHtml(iconPath)}" alt="" aria-hidden="true">
    </button>
  `;
}

function buildInfoTextLayerCardHtml(layer, index) {
  const normalized = normalizeInfoLayer(layer, 'text');
  const opacityPercent = Math.round(normalized.opacity * 100);
  const basicGlyphLocked = isJupiterProFontFamily(normalized.fontFamily);
  const isOpen = isInfoLayerCardOpen(index);
  const enableHtml = buildInfoLayerEnableHtml(normalized, index);
  return `
    <div class="info-layer-card ${isOpen ? 'open' : ''}" data-layer-index="${index}">
      <div class="info-layer-head" onclick="toggleInfoLayerCard(${index})">
        ${enableHtml}
        <input class="info-layer-name" value="${escapeHtml(normalized.name)}" onclick="event.stopPropagation()" oninput="updateInfoLayerName(${index}, this.value)" placeholder="图层名称">
        <div class="info-layer-right">
          <span class="info-layer-kind">文字</span>
          <span class="arrow info-layer-arrow">&#9654;</span>
        </div>
      </div>
      <div class="info-layer-body">
        <div class="text-layer-field">
          <label>文字内容</label>
          <textarea class="text-layer-textarea" placeholder="在这里输入要叠加到画布上的文字" oninput="updateInfoTextLayerField(${index}, 'text', this.value)">${escapeHtml(normalized.text)}</textarea>
        </div>
        <div class="text-layer-grid">
          <div class="text-layer-field">
            <label>字体</label>
            <select class="text-layer-input info-select-like-preset" onchange="updateInfoTextLayerFontFamily(${index}, this.value)">
              ${buildTextLayerFontOptionsHtml(normalized)}
            </select>
          </div>
          <div class="text-layer-field">
            <label>变体</label>
            <select class="text-layer-input info-select-like-preset" onchange="updateInfoTextLayerFontVariant(${index}, this.value)">
              ${buildTextLayerFontVariantOptionsHtml(normalized)}
            </select>
          </div>
          <div class="text-layer-field text-layer-full">
            <label>样式</label>
            <div class="text-layer-style-bar" role="group" aria-label="文字样式">
              <button type="button" class="text-layer-style-btn ${normalized.smallCaps ? 'active' : ''}" onclick="toggleInfoTextLayerStyle(${index}, 'smallCaps')" title="小型大写字母">SC</button>
              <button type="button" class="text-layer-style-btn ${normalized.freeLigatures ? 'active' : ''}" onclick="toggleInfoTextLayerStyle(${index}, 'freeLigatures')" title="${basicGlyphLocked ? 'Jupiter Pro 已锁定基础字形' : '自由连字'}" ${basicGlyphLocked ? 'disabled' : ''}>FL</button>
              <button type="button" class="text-layer-style-btn ${(normalized.renderEffect === TEXT_RENDER_EFFECT_SHADOW_GRAY || normalized.renderEffect === TEXT_RENDER_EFFECT_EMBOSS_SOFT) ? 'active' : ''}" onclick="toggleInfoTextLayerStyle(${index}, 'shadowGray')" title="灰色投影（可开关）">SD</button>
            </div>
          </div>
          <div class="text-layer-field">
            <label>字号</label>
            <input type="number" min="12" max="1024" step="1" value="${normalized.fontSize}" oninput="updateInfoTextLayerField(${index}, 'fontSize', this.value)">
          </div>
          <div class="text-layer-field">
            <label>行高倍率</label>
            <input type="number" min="0.8" max="3" step="0.05" value="${normalized.lineHeight}" oninput="updateInfoTextLayerField(${index}, 'lineHeight', this.value)">
          </div>
          <div class="text-layer-field">
            <label>水平缩放 (%)</label>
            <input
              type="number"
              min="${TEXT_LAYER_SCALE_PERCENT_MIN}"
              max="${TEXT_LAYER_SCALE_PERCENT_MAX}"
              step="1"
              value="${Math.round(Number(normalized.scaleXPercent) || 100)}"
              oninput="updateInfoTextLayerField(${index}, 'scaleXPercent', this.value)"
            >
          </div>
          <div class="text-layer-field">
            <label>垂直缩放 (%)</label>
            <input
              type="number"
              min="${TEXT_LAYER_SCALE_PERCENT_MIN}"
              max="${TEXT_LAYER_SCALE_PERCENT_MAX}"
              step="1"
              value="${Math.round(Number(normalized.scaleYPercent) || 100)}"
              oninput="updateInfoTextLayerField(${index}, 'scaleYPercent', this.value)"
            >
          </div>
          <div class="text-layer-field">
            <label>X</label>
            <input type="number" min="-8192" max="8192" step="1" value="${normalized.x}" oninput="updateInfoTextLayerField(${index}, 'x', this.value)">
          </div>
          <div class="text-layer-field">
            <label>Y</label>
            <input type="number" min="-8192" max="8192" step="1" value="${normalized.y}" oninput="updateInfoTextLayerField(${index}, 'y', this.value)">
          </div>
          <div class="text-layer-field text-layer-full text-color-opacity-row">
            <div class="color-opacity-item color-item">
              <label>颜色</label>
              <input
                type="color"
                class="color-square-input"
                value="${normalized.color}"
                oninput="updateInfoTextLayerField(${index}, 'color', this.value)"
              >
            </div>
            <div class="color-opacity-item opacity-item">
              <label>透明度（%）</label>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value="${opacityPercent}"
                oninput="updateInfoTextLayerField(${index}, 'opacity', Math.max(0, Math.min(100, Number(this.value) || 0)) / 100)"
              >
            </div>
          </div>
          <div class="text-layer-field text-layer-full text-layer-actions">
            <button type="button" class="btn btn-ghost" onclick="resetInfoTextLayer(${index})">重置预设数值</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildInfoIconLayerCardHtml(layer, index) {
  const normalized = normalizeInfoLayer(layer, 'icon');
  const allowedSourceCat = resolveInfoIconCategoryForLayer(normalized.id, normalized.sourceCat);
  const materials = listInfoIconMaterialItems().filter(item => item.sourceCat === allowedSourceCat);
  const isActivity = isInfoActivityIconLayer(normalized);
  const sizeMode = normalized && normalized.sizeMode === 'fixed' ? 'fixed' : '';
  const targetSize = Number.isFinite(Number(normalized.targetSize)) ? Math.round(Number(normalized.targetSize)) : '';
  const opacityPercent = Math.round(normalized.opacity * 100);
  const selectedItems = resolveInfoIconLayerItems(normalized);
  const selectedIds = isActivity
    ? normalizeInfoIconItemIds(
        Array.isArray(normalized.itemIds) && normalized.itemIds.length > 0
          ? normalized.itemIds
          : normalized.itemId
            ? [normalized.itemId]
            : []
      )
    : (normalized.itemId ? [String(normalized.itemId)] : []);
  const selectedIdSet = new Set(selectedIds.map(id => String(id)));
  const selectedItemIdSet = new Set(
    selectedItems
      .filter(item => item && item.id != null)
      .map(item => String(item.id))
  );
  const missingIds = selectedIds.filter(id => !selectedItemIdSet.has(String(id)));
  const isOpen = isInfoLayerCardOpen(index);
  const materialOpen = isInfoIconSubmenuOpen(index, 'material');
  const propsOpen = isInfoIconSubmenuOpen(index, 'props');
  const enableHtml = buildInfoLayerEnableHtml(normalized, index);
  let materialThumbs = materialOpen ? '' : '<div class="no-imgs">展开后加载素材</div>';
  if (materialOpen) {
    for (const missingId of missingIds) {
      const missingLabel = `[已失效] ${String(missingId)}`;
      materialThumbs += `
        <div class="thumb-item thumb-missing selected" title="${escapeHtml(missingLabel)}">
          <div class="tnum">${escapeHtml(missingLabel)}</div>
        </div>
      `;
    }
    materialThumbs += materials
      .map(item => {
        const selected = selectedIdSet.has(String(item.id));
        const previewSrc = iconImgSrcPreview(item.path);
        const hdSrc = iconImgSrcHd(item.path);
        const onclick = isActivity
          ? `toggleInfoIconLayerMaterial(${index}, ${JSON.stringify(item.sourceCat)}, ${JSON.stringify(item.id)})`
          : `setInfoIconLayerMaterial(${index}, ${JSON.stringify(item.sourceCat)}, ${JSON.stringify(item.id)})`;
        const title = `[${item.sourceCat}] ${item.name}`;
        return `
          <div class="thumb-item ${selected ? 'selected' : ''}" title="${escapeHtml(title)}" onclick='${onclick}'>
            <img
              alt="${escapeHtml(item.name)}"
              loading="lazy"
              decoding="async"
              src="${escapeHtml(previewSrc)}"
              onerror="if(!this.dataset.fallbackTried){this.dataset.fallbackTried='1';this.src='${escapeHtml(hdSrc)}';return;} this.closest('.thumb-item') && this.closest('.thumb-item').classList.add('thumb-missing');"
              onload="this.closest('.thumb-item') && this.closest('.thumb-item').classList.remove('thumb-missing');"
            >
            <div class="tnum">${escapeHtml(item.name)}</div>
          </div>
        `;
      })
      .join('');
    if (!materialThumbs) materialThumbs = '<div class="no-imgs">暂无素材</div>';
  }
  const materialHint = isActivity
    ? `<p class="info-fixed-note">已选 ${selectedIds.length}/${INFO_ACTIVITY_ICON_MAX_COUNT}。点击图标可取消，按选择顺序从左到右排列。</p>`
    : '';
  const activityLayoutHint = isActivity
    ? `
      <div class="text-layer-field text-layer-full">
        <label>布局规则</label>
        <p class="info-fixed-note">固定 ${INFO_ACTIVITY_ICON_SIZE_PX}×${INFO_ACTIVITY_ICON_SIZE_PX}px，横向间隔 ${INFO_ACTIVITY_ICON_GAP_PX}px，最多 ${INFO_ACTIVITY_ICON_MAX_COUNT} 个。</p>
      </div>
    `
    : '';
  const sizeControlsHtml = isActivity
    ? ''
    : `
      <div class="text-layer-field">
        <label>尺寸模式</label>
        <select class="text-layer-input info-select-like-preset" onchange="updateInfoIconLayerField(${index}, 'sizeMode', this.value)">
          <option value="" ${sizeMode === '' ? 'selected' : ''}>跟随缩放</option>
          <option value="fixed" ${sizeMode === 'fixed' ? 'selected' : ''}>固定边长</option>
        </select>
      </div>
      <div class="text-layer-field">
        <label>边长（像素）</label>
        <input type="number" min="1" max="8192" step="1" value="${targetSize}" placeholder="留空" oninput="updateInfoIconLayerField(${index}, 'targetSize', this.value)">
      </div>
      <div class="text-layer-field">
        <label>缩放</label>
        <input type="number" min="${INFO_ICON_SCALE_MIN}" max="${INFO_ICON_SCALE_MAX}" step="0.01" value="${normalized.scale}" oninput="updateInfoIconLayerField(${index}, 'scale', this.value)">
      </div>
    `;

  return `
    <div class="info-layer-card ${isOpen ? 'open' : ''}" data-layer-index="${index}">
      <div class="info-layer-head" onclick="toggleInfoLayerCard(${index})">
        ${enableHtml}
        <input class="info-layer-name" value="${escapeHtml(normalized.name)}" onclick="event.stopPropagation()" oninput="updateInfoLayerName(${index}, this.value)" placeholder="图层名称">
        <div class="info-layer-right">
          <span class="info-layer-kind">图标</span>
          <span class="arrow info-layer-arrow">&#9654;</span>
        </div>
      </div>
      <div class="info-layer-body">
        <div class="info-submenu ${materialOpen ? 'open' : ''}" data-submenu-key="material">
          <button type="button" class="info-submenu-head" onclick="toggleInfoIconSubmenu(${index}, 'material')">
            <span>素材</span>
            <span class="info-submenu-arrow">▼</span>
          </button>
          <div class="info-submenu-body">
            ${materialHint}
            <div class="thumb-row">
              ${materialThumbs}
            </div>
          </div>
        </div>
        <div class="info-submenu ${propsOpen ? 'open' : ''}" data-submenu-key="props">
          <button type="button" class="info-submenu-head" onclick="toggleInfoIconSubmenu(${index}, 'props')">
            <span>属性</span>
            <span class="info-submenu-arrow">▼</span>
          </button>
          <div class="info-submenu-body">
            <div class="text-layer-grid">
              <div class="text-layer-field">
                <label>X</label>
                <input type="number" min="-8192" max="8192" step="1" value="${normalized.x}" oninput="updateInfoIconLayerField(${index}, 'x', this.value)">
              </div>
              <div class="text-layer-field">
                <label>Y</label>
                <input type="number" min="-8192" max="8192" step="1" value="${normalized.y}" oninput="updateInfoIconLayerField(${index}, 'y', this.value)">
              </div>
              ${sizeControlsHtml}
              ${activityLayoutHint}
              <div class="text-layer-field text-layer-full">
                <label>透明度</label>
                <div class="text-layer-range-wrap">
                  <input type="range" min="0" max="100" step="1" value="${opacityPercent}" oninput="updateInfoIconLayerField(${index}, 'opacity', Number(this.value) / 100); this.parentElement.querySelector('.val').textContent = this.value + '%';">
                  <span class="val">${opacityPercent}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildInfoSpecialMaterialThumbsHtml(index, kind, items, selectedId, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const allowNone = opts.allowNone === true;
  const noneLabel = opts.noneLabel ? String(opts.noneLabel) : '不使用';
  const normalizedSelectedId = normalizeInfoSpecialLegacyItemId(selectedId);
  const selectedItem = items.find(
    item => item && normalizeInfoSpecialLegacyItemId(item.id) === normalizedSelectedId
  ) || null;
  let html = '';
  if (allowNone) {
    const noneSelected = !normalizedSelectedId;
    const clearOnclick = `setInfoSpecialLayerMaterial(${index}, ${JSON.stringify(kind)}, ${JSON.stringify('')})`;
    html += `
      <div
        class="thumb-item ${noneSelected ? 'selected' : ''}"
        title="${escapeHtml(noneLabel)}"
        onclick='${clearOnclick}'
      >
        <div class="tnum">${escapeHtml(noneLabel)}</div>
      </div>
    `;
  }
  if (!selectedItem && normalizedSelectedId) {
    const missingLabel = `[已失效] ${normalizedSelectedId}`;
    html += `
      <div class="thumb-item thumb-missing selected" title="${escapeHtml(missingLabel)}">
        <div class="tnum">${escapeHtml(missingLabel)}</div>
      </div>
    `;
  }
  html += items
    .map(item => {
      if (!item || !item.path || !item.id) return '';
      const selected = normalizeInfoSpecialLegacyItemId(item.id) === normalizedSelectedId;
      const previewSrc = iconImgSrcPreview(item.path);
      const hdSrc = iconImgSrcHd(item.path);
      const onclick = `setInfoSpecialLayerMaterial(${index}, ${JSON.stringify(kind)}, ${JSON.stringify(item.id)})`;
      return `
        <div class="thumb-item ${selected ? 'selected' : ''}" title="${escapeHtml(item.name)}" onclick='${onclick}'>
          <img
            alt="${escapeHtml(item.name)}"
            loading="lazy"
            decoding="async"
            src="${escapeHtml(previewSrc)}"
            onerror="if(!this.dataset.fallbackTried){this.dataset.fallbackTried='1';this.src='${escapeHtml(hdSrc)}';return;} this.closest('.thumb-item') && this.closest('.thumb-item').classList.add('thumb-missing');"
            onload="this.closest('.thumb-item') && this.closest('.thumb-item').classList.remove('thumb-missing');"
          >
          <div class="tnum">${escapeHtml(item.name)}</div>
        </div>
      `;
    })
    .join('');
  if (!html) return '<div class="no-imgs">暂无素材</div>';
  return html;
}

function buildInfoSpecialLayerCardHtml(layer, index) {
  const normalized = normalizeInfoLayer(layer, 'special');
  const bgItems = listInfoSpecialCategoryItems(INFO_SPECIAL_BG_CATEGORY);
  const maskItems = listInfoSpecialCategoryItems(INFO_SPECIAL_MASK_CATEGORY);
  const symbolItems = listInfoSpecialCategoryItems(INFO_SPECIAL_SYMBOL_CATEGORY);
  const selectedBg = resolveInfoSpecialLayerItem(normalized, 'background');
  const selectedMask = resolveInfoSpecialLayerItem(normalized, 'mask');
  const selectedSymbol = resolveInfoSpecialLayerItem(normalized, 'symbol');
  const sizeMode = normalized && normalized.sizeMode === 'fixed' ? 'fixed' : '';
  const targetSize = Number.isFinite(Number(normalized.targetSize)) ? Math.round(Number(normalized.targetSize)) : '';
  const opacityPercent = Math.round(normalized.opacity * 100);
  const isOpen = isInfoLayerCardOpen(index);
  const bgOpen = isInfoIconSubmenuOpen(index, 'special-bg');
  const maskOpen = isInfoIconSubmenuOpen(index, 'special-mask');
  const symbolOpen = isInfoIconSubmenuOpen(index, 'special-symbol');
  const propsOpen = isInfoIconSubmenuOpen(index, 'special-props');
  const enableHtml = buildInfoLayerEnableHtml(normalized, index);
  const maskEnabledByBg = !!selectedBg;
  const maskVisibleHint = maskEnabledByBg
    ? '已选择背景：可选上色蒙版，黑白区域会分别填充下方两种颜色。'
    : '先选择背景后，才会显示上色蒙版效果。';
  const bgThumbs = bgOpen
    ? buildInfoSpecialMaterialThumbsHtml(index, 'background', bgItems, normalized.bgItemId, {
      allowNone: true,
      noneLabel: '不使用背景',
    })
    : '<div class="no-imgs">展开后加载素材</div>';
  const maskThumbs = maskOpen
    ? buildInfoSpecialMaterialThumbsHtml(index, 'mask', maskItems, normalized.maskItemId, {
      allowNone: true,
      noneLabel: '不使用蒙版',
    })
    : '<div class="no-imgs">展开后加载素材</div>';
  const symbolThumbs = symbolOpen
    ? buildInfoSpecialMaterialThumbsHtml(index, 'symbol', symbolItems, normalized.symbolItemId, {
      allowNone: false,
    })
    : '<div class="no-imgs">展开后加载素材</div>';

  return `
    <div class="info-layer-card ${isOpen ? 'open' : ''}" data-layer-index="${index}">
      <div class="info-layer-head" onclick="toggleInfoLayerCard(${index})">
        ${enableHtml}
        <input class="info-layer-name" value="${escapeHtml(normalized.name)}" onclick="event.stopPropagation()" oninput="updateInfoLayerName(${index}, this.value)" placeholder="图层名称">
        <div class="info-layer-right">
          <span class="info-layer-kind">队徽</span>
          <span class="arrow info-layer-arrow">&#9654;</span>
        </div>
      </div>
      <div class="info-layer-body">
        <div class="info-submenu ${bgOpen ? 'open' : ''}" data-submenu-key="special-bg">
          <button type="button" class="info-submenu-head" onclick="toggleInfoIconSubmenu(${index}, 'special-bg')">
            <span>盾纹（可选）</span>
            <span class="info-submenu-arrow">▼</span>
          </button>
          <div class="info-submenu-body">
            <div class="thumb-row">
              ${bgThumbs}
            </div>
          </div>
        </div>
        <div class="info-submenu ${maskOpen ? 'open' : ''}" data-submenu-key="special-mask">
          <button type="button" class="info-submenu-head" onclick="toggleInfoIconSubmenu(${index}, 'special-mask')">
            <span>背景（可选）</span>
            <span class="info-submenu-arrow">▼</span>
          </button>
          <div class="info-submenu-body">
            ${maskEnabledByBg ? `
              <div class="thumb-row">
                ${maskThumbs}
              </div>
            ` : '<p class="info-fixed-note">先选择盾纹后，再选择背景。</p>'}
            <p class="info-fixed-note">${escapeHtml(maskVisibleHint)}</p>
          </div>
        </div>
        <div class="info-submenu ${symbolOpen ? 'open' : ''}" data-submenu-key="special-symbol">
          <button type="button" class="info-submenu-head" onclick="toggleInfoIconSubmenu(${index}, 'special-symbol')">
            <span>寓意物（必选）</span>
            <span class="info-submenu-arrow">▼</span>
          </button>
          <div class="info-submenu-body">
            <div class="thumb-row">
              ${symbolThumbs}
            </div>
            ${selectedSymbol ? '' : '<p class="info-fixed-note">请至少选择一个寓意物。</p>'}
          </div>
        </div>
        <div class="info-submenu ${propsOpen ? 'open' : ''}" data-submenu-key="special-props">
          <button type="button" class="info-submenu-head" onclick="toggleInfoIconSubmenu(${index}, 'special-props')">
            <span>属性</span>
            <span class="info-submenu-arrow">▼</span>
          </button>
          <div class="info-submenu-body">
            <div class="text-layer-grid">
              <div class="text-layer-field">
                <label>X</label>
                <input type="number" min="-8192" max="8192" step="1" value="${normalized.x}" oninput="updateInfoSpecialLayerField(${index}, 'x', this.value)">
              </div>
              <div class="text-layer-field">
                <label>Y</label>
                <input type="number" min="-8192" max="8192" step="1" value="${normalized.y}" oninput="updateInfoSpecialLayerField(${index}, 'y', this.value)">
              </div>
              <div class="text-layer-field">
                <label>尺寸模式</label>
                <select class="text-layer-input info-select-like-preset" onchange="updateInfoSpecialLayerField(${index}, 'sizeMode', this.value)">
                  <option value="" ${sizeMode === '' ? 'selected' : ''}>跟随缩放</option>
                  <option value="fixed" ${sizeMode === 'fixed' ? 'selected' : ''}>固定边长</option>
                </select>
              </div>
              <div class="text-layer-field">
                <label>边长（像素）</label>
                <input type="number" min="1" max="8192" step="1" value="${targetSize}" placeholder="留空" oninput="updateInfoSpecialLayerField(${index}, 'targetSize', this.value)">
              </div>
              <div class="text-layer-field">
                <label>缩放</label>
                <input type="number" min="${INFO_SPECIAL_SCALE_MIN}" max="${INFO_SPECIAL_SCALE_MAX}" step="0.01" value="${normalized.scale}" oninput="updateInfoSpecialLayerField(${index}, 'scale', this.value)">
              </div>
              <div class="text-layer-field text-layer-full special-color-opacity-row">
                <div class="color-opacity-item color-item">
                  <label>颜色1</label>
                  <input
                    type="color"
                    class="color-square-input"
                    value="${normalized.maskDarkColor}"
                    oninput="updateInfoSpecialLayerField(${index}, 'maskDarkColor', this.value)"
                  >
                </div>
                <div class="color-opacity-item color-item">
                  <label>颜色2</label>
                  <input
                    type="color"
                    class="color-square-input"
                    value="${normalized.maskLightColor}"
                    oninput="updateInfoSpecialLayerField(${index}, 'maskLightColor', this.value)"
                  >
                </div>
                <div class="color-opacity-item opacity-item">
                  <label>透明度（%）</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value="${opacityPercent}"
                    oninput="updateInfoSpecialLayerField(${index}, 'opacity', Math.max(0, Math.min(100, Number(this.value) || 0)) / 100)"
                  >
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildInfoFixedLayerCardHtml(layer, index) {
  const normalized = normalizeInfoLayer(layer, 'fixed');
  const enableHtml = buildInfoLayerEnableHtml(normalized, index);
  return `
    <div class="info-layer-card" data-layer-index="${index}">
      <div class="info-layer-head info-layer-head-static">
        ${enableHtml}
        <div class="info-layer-name">${escapeHtml(normalized.name)}</div>
        <div class="info-layer-right">
          <span class="info-layer-kind">固定</span>
        </div>
      </div>
    </div>
  `;
}

function buildInfoBar48LayerCardHtml(layer, index) {
  const normalized = normalizeInfoLayer(layer, 'bar48');
  const opacityPercent = Math.round(normalized.opacity * 100);
  const isOpen = isInfoLayerCardOpen(index);
  const enableHtml = buildInfoLayerEnableHtml(normalized, index);
  const cellsHtml = normalized.states
    .map((state, cellIndex) => {
      const active = state ? 'on' : '';
      const title = `第 ${cellIndex + 1} 格：${state ? '实心' : '空心'}`;
      return `<button type="button" class="bar48-cell ${active}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}" onclick="toggleInfoBar48Cell(${index}, ${cellIndex}); event.stopPropagation();"></button>`;
    })
    .join('');
  return `
    <div class="info-layer-card ${isOpen ? 'open' : ''}" data-layer-index="${index}">
      <div class="info-layer-head" onclick="toggleInfoLayerCard(${index})">
        ${enableHtml}
        <input class="info-layer-name" value="${escapeHtml(normalized.name)}" onclick="event.stopPropagation()" oninput="updateInfoLayerName(${index}, this.value)" placeholder="图层名称">
        <div class="info-layer-right">
          <span class="info-layer-kind">多选</span>
          <span class="arrow info-layer-arrow">&#9654;</span>
        </div>
      </div>
      <div class="info-layer-body">
        <div class="text-layer-grid">
          <div class="text-layer-field">
            <label>X</label>
            <input type="number" min="-8192" max="8192" step="1" value="${normalized.x}" oninput="updateInfoBar48LayerField(${index}, 'x', this.value)">
          </div>
          <div class="text-layer-field">
            <label>Y</label>
            <input type="number" min="-8192" max="8192" step="1" value="${normalized.y}" oninput="updateInfoBar48LayerField(${index}, 'y', this.value)">
          </div>
          <div class="text-layer-field">
            <label>单格宽度</label>
            <input type="number" min="${INFO_BAR48_CELL_SIZE_MIN}" max="${INFO_BAR48_CELL_SIZE_MAX}" step="1" value="${normalized.cellWidth}" oninput="updateInfoBar48LayerField(${index}, 'cellWidth', this.value)">
          </div>
          <div class="text-layer-field">
            <label>单格高度</label>
            <input type="number" min="${INFO_BAR48_CELL_SIZE_MIN}" max="${INFO_BAR48_CELL_SIZE_MAX}" step="1" value="${normalized.cellHeight}" oninput="updateInfoBar48LayerField(${index}, 'cellHeight', this.value)">
          </div>
          <div class="text-layer-field">
            <label>横向间距</label>
            <input type="number" min="${INFO_BAR48_GAP_MIN}" max="${INFO_BAR48_GAP_MAX}" step="1" value="${normalized.gapX}" oninput="updateInfoBar48LayerField(${index}, 'gapX', this.value)">
          </div>
          <div class="text-layer-field">
            <label>纵向间距</label>
            <input type="number" min="${INFO_BAR48_GAP_MIN}" max="${INFO_BAR48_GAP_MAX}" step="1" value="${normalized.gapY}" oninput="updateInfoBar48LayerField(${index}, 'gapY', this.value)">
          </div>
          <div class="text-layer-field text-layer-full">
            <label>状态操作</label>
            <div class="bar48-actions">
              <button type="button" class="btn btn-ghost" onclick="setInfoBar48All(${index}, 0)">全空</button>
              <button type="button" class="btn btn-ghost" onclick="setInfoBar48All(${index}, 1)">全亮</button>
            </div>
          </div>
          <div class="text-layer-field text-layer-full">
            <label>状态栏选择</label>
            <div class="bar48-grid-wrap">
              <div class="bar48-grid">
                ${cellsHtml}
              </div>
            </div>
          </div>
          <div class="text-layer-field text-layer-full">
            <label>透明度</label>
            <div class="text-layer-range-wrap">
              <input type="range" min="0" max="100" step="1" value="${opacityPercent}" oninput="updateInfoBar48LayerField(${index}, 'opacity', Number(this.value) / 100); this.parentElement.querySelector('.val').textContent = this.value + '%';">
              <span class="val">${opacityPercent}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function resolveEffectiveInfoPresetName(name = infoPresetActiveName) {
  const direct = normalizeInfoPresetName(name);
  if (direct) return direct;
  return normalizeInfoPresetName(INFO_PRESET_DEFAULT_NAME);
}

function getPresetLayerIdSet(name = infoPresetActiveName) {
  const preset = getInfoPresetDefinitionByName(resolveEffectiveInfoPresetName(name));
  if (!preset || !Array.isArray(preset.layers) || !preset.layers.length) return null;
  const ids = new Set();
  for (const layer of preset.layers) {
    const id = String(layer && layer.id != null ? layer.id : '').trim();
    if (id) ids.add(id);
  }
  return ids.size ? ids : null;
}

function maskInfoLayersToPreset(name, layers) {
  const normalized = normalizeInfoLayers(layers);
  const presetIds = getPresetLayerIdSet(name);
  if (!presetIds) return normalized;
  return normalized.map(layer => {
    if (!layer || !layer.id || presetIds.has(String(layer.id))) return layer;
    if (layer.enabled !== true) return layer;
    return normalizeInfoLayer({ ...layer, enabled: false }, layer.type);
  });
}

function getInfoLayerListIndicesForCurrentPreset(layers = infoLayers) {
  const src = Array.isArray(layers) ? layers : [];
  const preset = getInfoPresetDefinitionByName(resolveEffectiveInfoPresetName(infoPresetActiveName));
  if (!preset || !Array.isArray(preset.layers) || !preset.layers.length) {
    return src.map((_, index) => index);
  }
  let panelPresetLayers = preset.layers;
  const presetName = normalizeInfoPresetName(preset.name);
  if (presetName === '\u56fd\u670d' || presetName === '\u56fd\u9645\u670d') {
    const findLayerIndex = (targetId) => panelPresetLayers.findIndex(
      layer => String(layer && layer.id != null ? layer.id : '').trim() === targetId
    );
    const moveLayerAfter = (layerId, anchorId) => {
      const layerIdx = findLayerIndex(layerId);
      const anchorIdx = findLayerIndex(anchorId);
      if (layerIdx < 0 || anchorIdx < 0 || layerIdx === anchorIdx + 1) return;
      const reordered = panelPresetLayers.slice();
      const [movedLayer] = reordered.splice(layerIdx, 1);
      if (!movedLayer) return;
      const anchorIdxAfterRemove = reordered.findIndex(
        layer => String(layer && layer.id != null ? layer.id : '').trim() === anchorId
      );
      if (anchorIdxAfterRemove < 0) return;
      reordered.splice(anchorIdxAfterRemove + 1, 0, movedLayer);
      panelPresetLayers = reordered;
    };
    const moveLayerBefore = (layerId, anchorId) => {
      const layerIdx = findLayerIndex(layerId);
      const anchorIdx = findLayerIndex(anchorId);
      if (layerIdx < 0 || anchorIdx < 0 || layerIdx === anchorIdx - 1) return;
      const reordered = panelPresetLayers.slice();
      const [movedLayer] = reordered.splice(layerIdx, 1);
      if (!movedLayer) return;
      const anchorIdxAfterRemove = reordered.findIndex(
        layer => String(layer && layer.id != null ? layer.id : '').trim() === anchorId
      );
      if (anchorIdxAfterRemove < 0) return;
      reordered.splice(anchorIdxAfterRemove, 0, movedLayer);
      panelPresetLayers = reordered;
    };
    moveLayerAfter('icon-2', 'bar-1');
    moveLayerBefore('fixed-1', 'fixed-2');
  }
  const indexById = new Map();
  for (let i = 0; i < src.length; i += 1) {
    const layer = src[i];
    const id = String(layer && layer.id != null ? layer.id : '').trim();
    if (!id || indexById.has(id)) continue;
    indexById.set(id, i);
  }
  const out = [];
  const seen = new Set();
  for (const presetLayer of panelPresetLayers) {
    const id = String(presetLayer && presetLayer.id != null ? presetLayer.id : '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const idx = indexById.get(id);
    if (Number.isInteger(idx)) out.push(idx);
  }
  return out;
}

function renderInfoLayersPanel() {
  infoLayers = normalizeInfoLayers(infoLayers);
  updateToggleAllInfoLayerVisibilityButton();
  const listEl = document.getElementById('infoLayerList');
  if (!listEl) return;
  normalizeInfoLayerCardOpenState();
  normalizeInfoIconSubmenuOpenState();

  const visibleIndices = getInfoLayerListIndicesForCurrentPreset(infoLayers);
  if (!visibleIndices.length) {
    listEl.innerHTML = '<div class="no-imgs">当前未配置信息图层槽位。</div>';
    return;
  }

  listEl.innerHTML = visibleIndices
    .map(index => {
      const layer = infoLayers[index];
      if (layer.type === 'icon') return buildInfoIconLayerCardHtml(layer, index);
      if (layer.type === 'special') return buildInfoSpecialLayerCardHtml(layer, index);
      if (layer.type === 'fixed') return buildInfoFixedLayerCardHtml(layer, index);
      if (layer.type === 'bar48') return buildInfoBar48LayerCardHtml(layer, index);
      return buildInfoTextLayerCardHtml(layer, index);
    })
    .join('');
}

function hasAnyEnabledInfoLayer(layers = infoLayers, indices = null) {
  if (!Array.isArray(layers) || layers.length === 0) return false;
  const targetIndices = Array.isArray(indices) ? indices : getInfoLayerListIndicesForCurrentPreset(layers);
  for (const idx of targetIndices) {
    const layer = layers[idx];
    if (layer && layer.enabled === true) return true;
  }
  return false;
}

function updateToggleAllInfoLayerVisibilityButton() {
  const btn = document.getElementById('toggleAllInfoLayerVisibilityBtn');
  const icon = document.getElementById('toggleAllInfoLayerVisibilityIcon');
  if (!btn || !icon) return;
  const hasVisibleLayer = hasAnyEnabledInfoLayer(infoLayers);
  const actionLabel = hasVisibleLayer ? '隐藏所有图层' : '显示所有图层';
  btn.title = actionLabel;
  btn.setAttribute('aria-label', actionLabel);
  icon.src = appPath(
    hasVisibleLayer ? '/assets/icons/visible.svg' : '/assets/icons/invisible.svg'
  );
}

function toggleAllInfoLayersVisibility() {
  infoLayers = normalizeInfoLayers(infoLayers);
  const visibleIndices = getInfoLayerListIndicesForCurrentPreset(infoLayers);
  const indexSet = new Set(visibleIndices);
  const hasVisibleLayer = hasAnyEnabledInfoLayer(infoLayers, visibleIndices);
  const ask = hasVisibleLayer ? '是否隐藏所有图层？' : '是否显示所有图层？';
  if (!window.confirm(ask)) return;
  const nextEnabled = !hasVisibleLayer;
  infoLayers = infoLayers.map((layer, index) => {
    if (!indexSet.has(index)) return layer;
    return normalizeInfoLayer({ ...layer, enabled: nextEnabled }, layer.type);
  });
  renderInfoLayersPanel();
  queueInfoLayerRender(true);
}

async function loadLocalTextLayerFonts() {
  const btn = document.getElementById('textLayerLoadLocalFontsBtn');
  const promptManualFamilies = () => {
    const raw = window.prompt(
      '请输入本机字体 family 名称（可多项，逗号/分号/换行分隔）。\n示例：Miedinger, HarmonyOS Sans SC, AXIS',
      ''
    );
    if (raw == null) {
      setTextLayerLocalFontsStatus('已取消添加本机字体');
      return;
    }
    const manualFamilies = normalizeAndDedupeFontFamilies(
      String(raw || '')
        .split(/[\n,;]+/)
        .map(s => s.trim())
        .filter(Boolean)
    );
    if (!manualFamilies.length) {
      setTextLayerLocalFontsStatus('未识别到有效字体名称');
      return;
    }
    textLayerLocalFontFamilies = normalizeAndDedupeFontFamilies([
      ...textLayerLocalFontFamilies,
      ...manualFamilies,
    ]).slice(0, TEXT_LAYER_LOCAL_FONT_LIMIT);
    renderInfoLayersPanel();
    setTextLayerLocalFontsStatus(`已添加本机字体 ${manualFamilies.length} 个（按名称使用）`);
  };

  if (typeof window.queryLocalFonts !== 'function' || !window.isSecureContext) {
    promptManualFamilies();
    return;
  }
  if (btn) btn.disabled = true;
  setTextLayerLocalFontsStatus('正在读取本机字体...');
  try {
    const entries = await window.queryLocalFonts();
    const families = entries
      .map(item => (item && typeof item.family === 'string' ? item.family : ''))
      .filter(Boolean);
    textLayerLocalFontFamilies = normalizeAndDedupeFontFamilies([
      ...textLayerLocalFontFamilies,
      ...families,
    ]).slice(0, TEXT_LAYER_LOCAL_FONT_LIMIT);
    renderInfoLayersPanel();
    setTextLayerLocalFontsStatus(`已加载本机字体 ${textLayerLocalFontFamilies.length} 个`);
  } catch (e) {
    promptManualFamilies();
  } finally {
    if (btn) btn.disabled = false;
  }
}
