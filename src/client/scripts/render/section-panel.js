// ============================================================
// 渲染
// ============================================================
async function renderAll() {
  renderPortraitSections();
  renderNameplateSections();
  await render();
  centerView();
}

function renderPortraitSections() {
  const container = document.getElementById('portraitSections');
  container.innerHTML = '';
  PORTRAIT_CATS.forEach(cat => {
    const files = fileData.portrait[cat] || [];
    container.appendChild(buildSection(cat, files));
  });
}

function renderNameplateSections() {
  const container = document.getElementById('nameplateSections');
  container.innerHTML = '';
  // 铭牌内的分类
  const npCats = [...NAMEPLATE_CATS, '肖像外框'];
  npCats.forEach(cat => {
    const files = fileData.nameplate[cat] || [];
    container.appendChild(buildSection(cat, files));
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function selectedLabelForCategory(cat) {
  const cur = selected[cat];
  if (!cur) return '未选择';
  return cur.name || cur.file || String(cur.id || '未选择');
}

function isSeasonLayerItem(item) {
  const label = String((item && (item.name || item.file || item.id)) || '');
  return label.includes('赛季');
}

function sortFilesForSection(cat, files) {
  if (!Array.isArray(files)) return [];
  if (files.length <= 1) return files;
  const isSortableLayerGroup =
    PORTRAIT_CATS.includes(cat) || NAMEPLATE_CATS.includes(cat) || cat === '肖像外框';
  if (!isSortableLayerGroup) return files;
  return files
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aSeason = isSeasonLayerItem(a.item);
      const bSeason = isSeasonLayerItem(b.item);
      if (aSeason !== bSeason) return aSeason ? 1 : -1;
      return a.index - b.index;
    })
    .map(v => v.item);
}

function updateSelectedLayerLabel(cat) {
  const el = document.getElementById('selname-' + cat);
  if (!el) return;
  const label = selectedLabelForCategory(cat);
  el.textContent = label;
  el.title = label;
  el.classList.toggle('empty', !selected[cat]);
}

function buildSection(cat, files) {
  const sel = selected[cat];
  const displayFiles = sortFilesForSection(cat, files);
  const selectedName = selectedLabelForCategory(cat);
  const selectedNameEscaped = escapeHtml(selectedName);

  const section = document.createElement('div');
  section.className = 'layer-section';
  section.id = 'sec-' + cat;
  section.innerHTML = `
    <div class="section-header" onclick="toggleSection('${cat}')">
      <div class="sname">
        <div class="check-dot ${sel ? 'checked' : ''}" id="chk-${cat}"></div>
        <span>${cat}</span>
      </div>
      <div class="section-right">
        <span class="selected-layer-tag ${sel ? '' : 'empty'}" id="selname-${cat}" title="${selectedNameEscaped}">${selectedNameEscaped}</span>
        <span class="arrow">&#9654;</span>
      </div>
    </div>
    <div class="section-body">
      <div class="thumb-row" id="row-${cat}">
        ${displayFiles.length === 0 ? '<div class="no-imgs">暂无素材</div>' : ''}
      </div>
    </div>
  `;

  const row = section.querySelector(`[id="row-${cat}"]`);
  displayFiles.forEach(item => {
    const thumb = document.createElement('div');
    thumb.className = 'thumb-item' + (sel && sel.id === item.id ? ' selected' : '');
    thumb.dataset.thumbId = String(item.id);
    thumb.title = item.name || item.file;

    const img = document.createElement('img');
    img.alt = item.name || item.id;
    img.decoding = 'async';
    // 手机上原生 lazy 在滚动容器里经常不触发，导致后半段缩略图空白。
    img.loading = 'auto';
    img.src = iconImgSrcPreview(item.path);
    img.onerror = () => {
      if (!img.dataset.fallbackTried) {
        img.dataset.fallbackTried = '1';
        img.src = iconImgSrcHd(item.path);
        return;
      }
      thumb.classList.add('thumb-missing');
    };
    img.onload = () => {
      thumb.classList.remove('thumb-missing');
    };

    const tnum = document.createElement('div');
    tnum.className = 'tnum';
    tnum.textContent = item.name || item.id;

    thumb.appendChild(img);
    thumb.appendChild(tnum);
    thumb.onclick = () => pickItem(cat, item);
    row.appendChild(thumb);
  });
  return section;
}

function filesForCategory(cat) {
  if (PORTRAIT_CATS.includes(cat)) return Array.isArray(fileData.portrait[cat]) ? fileData.portrait[cat] : [];
  return Array.isArray(fileData.nameplate[cat]) ? fileData.nameplate[cat] : [];
}

function toggleSection(cat) {
  const el = document.getElementById('sec-' + cat);
  if (!el) return;
  const willOpen = !el.classList.contains('open');
  el.classList.toggle('open');
  if (!willOpen) return;
  const files = filesForCategory(cat);
  const n = Math.min(28, files.length);
  if (n === 0) return;
  const paths = files.slice(0, n).map(f => f.path);
  const run = () => { void prefetchImgPaths(paths); };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 1200 });
  } else {
    setTimeout(run, 60);
  }
}

async function pickItem(cat, item) {
  const wasSelected = selected[cat] && selected[cat].id === item.id;
  
  // 铭牌装饰物/B 互斥
  if (cat === '铭牌装饰物') {
    selected['铭牌装饰物B'] = null;
    const r2 = document.getElementById('row-铭牌装饰物B');
    if (r2) r2.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('selected'));
    const chk2 = document.getElementById('chk-铭牌装饰物B');
    if (chk2) chk2.className = 'check-dot';
    updateSelectedLayerLabel('铭牌装饰物B');
  } else if (cat === '铭牌装饰物B') {
    selected['铭牌装饰物'] = null;
    const r2 = document.getElementById('row-铭牌装饰物');
    if (r2) r2.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('selected'));
    const chk2 = document.getElementById('chk-铭牌装饰物');
    if (chk2) chk2.className = 'check-dot';
    updateSelectedLayerLabel('铭牌装饰物');
  }
  
  // 先清除该分类下所有缩略图的高亮
  const row = document.getElementById('row-' + cat);
  if (row) {
    row.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('selected'));
  }
  
  if (wasSelected) {
    // 点击已选中的 → 取消选择
    selected[cat] = null;
  } else {
    // 选中新的
    selected[cat] = item;
    if (row) {
      row.querySelectorAll('.thumb-item').forEach(t => {
        if (t.dataset.thumbId === String(item.id)) t.classList.add('selected');
      });
    }
  }
  
  const chk = document.getElementById('chk-' + cat);
  if (chk) chk.className = 'check-dot' + (selected[cat] ? ' checked' : '');
  updateSelectedLayerLabel(cat);

  await render();
  schedulePersistComposerConfig();
}

function setPortraitSide(side) {
  const nextSide = normalizePortraitSide(side);
  const prevSide = portraitSide;
  portraitSide = nextSide;
  document.getElementById('sideLeft').classList.toggle('active', nextSide === 'left');
  document.getElementById('sideRight').classList.toggle('active', nextSide === 'right');
  if (prevSide !== nextSide) {
    syncInfoPresetLayerPositionsForPortraitSideChange(prevSide, nextSide);
  }
  render();
  schedulePersistComposerConfig();
}

async function switchTab(_tab) {
  activeTab = 'full';
  await render();
  centerView();
  schedulePersistComposerConfig();
}

function collapseAllDropdownMenusForInfoPanel() {
  const openedSections = document.querySelectorAll('.layer-section.open');
  openedSections.forEach(section => section.classList.remove('open'));
  collapseAllInfoLayerDropdownState();
  closeMobileActionMenu();
  closeSettingsMenu();
  renderInfoLayersPanel();
}

async function switchPanelTab(panel) {
  const nextPanel =
    panel === 'nameplate' || panel === 'info' || panel === 'portrait'
      ? panel
      : 'portrait';
  if (nextPanel === 'info') {
    if (!infoPanelOpenedOnce) {
      // 仅负责首次进入信息页时收起下拉；预设与图层已在 init() 预加载。
      collapseAllDropdownMenusForInfoPanel();
      infoPanelOpenedOnce = true;
    } else {
      closeMobileActionMenu();
      closeSettingsMenu();
    }
  }
  activePanel = nextPanel;
  document.getElementById('pTabPortrait').classList.toggle('active', nextPanel === 'portrait');
  document.getElementById('pTabNameplate').classList.toggle('active', nextPanel === 'nameplate');
  document.getElementById('pTabInfo').classList.toggle('active', nextPanel === 'info');
  document.getElementById('portraitPanel').style.display  = nextPanel === 'portrait'  ? '' : 'none';
  document.getElementById('nameplatePanel').style.display = nextPanel === 'nameplate' ? '' : 'none';
  document.getElementById('infoPanel').style.display      = nextPanel === 'info'      ? '' : 'none';
  if (nextPanel !== 'info') setHoveredInfoLayerIndex(-1);
  if (nextPanel === 'portrait') await switchTab('portrait');
  else await switchTab('full');
  drawHoveredInfoLayerOverlay();
  schedulePersistComposerConfig();
}

async function clearAll() {
  if (!window.confirm('确定清空吗？')) return;
  [...PORTRAIT_CATS, ...NAMEPLATE_CATS, '肖像外框'].forEach(c => { selected[c] = null; });
  infoPresetActiveName = '';
  infoPresetLayerStates = {};
  infoLayers = [];
  infoLayerCardOpenState = {};
  infoIconSubmenuOpenState = {};
  infoPanelOpenedOnce = false;
  renderInfoPresetButtons();
  renderInfoLayersPanel();
  if (infoLayerRenderTimer) {
    clearTimeout(infoLayerRenderTimer);
    infoLayerRenderTimer = null;
  }
  updateCustomPortraitUI();
  await renderAll();
  schedulePersistComposerConfig();
}

// ============================================================
// 画布渲染
// ============================================================
/** 仅当渲染超过该毫秒数后才显示遮罩，避免缓存命中时一闪而过 */
