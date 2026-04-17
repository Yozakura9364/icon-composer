/**
 * Item.csv：SaintCoinach 格式；默认 Excel 列 K(下标10)=Name，L(下标11) 或类型 Image=图标编号。
 * 图标路径：{6位}/ {6位}_hr1.png（与铭牌项目图床一致）
 */

const ITEM_CSV_URL =
  'https://raw.githubusercontent.com/InfSein/ffxiv-datamining-mixed/master/chs/Item.csv';

const DEFAULT_ICON_BASE = 'https://portable-icon.2513985996.workers.dev';

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === ',') {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

function parseItemCsv(text, nameCol, iconCol) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  let schemaIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('int32,')) {
      schemaIdx = i;
      break;
    }
  }
  if (schemaIdx < 0) throw new Error('未找到表头行 int32,（SaintCoinach CSV）');
  const types = splitCsvLine(lines[schemaIdx]);
  let iconColUse = iconCol;
  if (iconColUse == null || iconColUse < 0) {
    const idx = types.indexOf('Image');
    iconColUse = idx >= 0 ? idx : 11;
  }
  const nameColUse = nameCol >= 0 ? nameCol : 10;
  const out = [];
  for (let i = schemaIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const parts = splitCsvLine(raw);
    const maxCol = Math.max(nameColUse, iconColUse);
    if (parts.length <= maxCol) continue;
    const name = (parts[nameColUse] || '').replace(/^"|"$/g, '').trim();
    const iconId = parseInt(parts[iconColUse], 10);
    if (!name || Number.isNaN(iconId) || iconId <= 0) continue;
    out.push({ name, iconId });
  }
  return out;
}

function iconRelPath(iconId) {
  const s = String(iconId).padStart(6, '0');
  return `${s}/${s}_hr1.png`;
}

function iconUrl(base, iconId) {
  const b = String(base || '').replace(/\/$/, '');
  return `${b}/${iconRelPath(iconId)}`;
}

let allRows = [];
let filtered = [];
let selected = null;
let iconImg = null;
let iconBase = DEFAULT_ICON_BASE;
let iconPos = { x: 40, y: 40 };
let textPos = { x: 280, y: 80 };
let fontSize = 28;
let canvasW = 920;
let canvasH = 520;
let drag = null;

const canvas = document.getElementById('preview');
const ctx = canvas.getContext('2d');

function getNameCol() {
  const v = parseInt(document.getElementById('nameCol').value, 10);
  return Number.isNaN(v) ? 10 : v;
}
function getIconCol() {
  const raw = document.getElementById('iconCol').value.trim();
  if (raw === '') return -1;
  const v = parseInt(raw, 10);
  return Number.isNaN(v) ? -1 : v;
}

async function loadCsv() {
  const url = document.getElementById('csvUrl').value.trim() || ITEM_CSV_URL;
  const status = document.getElementById('csvStatus');
  status.textContent = '正在下载 Item.csv…';
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  status.textContent = '正在解析…';
  await new Promise(r => setTimeout(r, 0));
  const nameCol = getNameCol();
  const iconCol = getIconCol();
  allRows = parseItemCsv(text, nameCol, iconCol);
  status.textContent = `已加载 ${allRows.length} 条物品`;
  document.getElementById('searchInput').disabled = false;
  document.getElementById('searchBtn').disabled = false;
}

function runSearch() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const list = document.getElementById('resultList');
  list.innerHTML = '';
  if (!q) {
    filtered = [];
    return;
  }
  filtered = allRows.filter(r => r.name.toLowerCase().includes(q)).slice(0, 200);
  const st = document.getElementById('csvStatus');
  if (filtered.length === 200) {
    st.textContent = `共 ${allRows.length} 条 · 仅显示前 200 条，请缩小关键词`;
  } else {
    st.textContent = `共 ${allRows.length} 条 · 命中 ${filtered.length} 条`;
  }
  filtered.forEach((row, i) => {
    const li = document.createElement('li');
    li.textContent = `${row.name}  [icon:${row.iconId}]`;
    li.onclick = () => selectRow(row);
    list.appendChild(li);
  });
}

async function selectRow(row) {
  selected = row;
  document.getElementById('selName').textContent = row.name;
  iconBase = document.getElementById('iconBase').value.trim() || DEFAULT_ICON_BASE;
  const url = iconUrl(iconBase, row.iconId);
  iconImg = await loadImg(url);
  if (!iconImg) {
    document.getElementById('csvStatus').textContent = `图标加载失败：${url}`;
    return;
  }
  document.getElementById('csvStatus').textContent = `已选：${row.name}`;
  render();
}

function loadImg(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function measureTextBlock(text, size) {
  ctx.save();
  ctx.font = `${size}px "Noto Sans SC", "Source Han Sans SC", sans-serif`;
  const m = ctx.measureText(text);
  ctx.restore();
  const h = size * 1.25;
  return { w: m.width, h };
}

function render() {
  canvas.width = canvasW;
  canvas.height = canvasH;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--card-bg').trim() || '#1a1d27';
  ctx.fillRect(0, 0, canvasW, canvasH);

  if (!selected) {
    ctx.fillStyle = '#6b7280';
    ctx.font = '16px sans-serif';
    ctx.fillText('搜索并选择一件装备', 24, 40);
    return;
  }

  if (iconImg) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(iconImg, iconPos.x, iconPos.y, iconImg.naturalWidth, iconImg.naturalHeight);
  }

  const fs = fontSize;
  ctx.font = `${fs}px "Noto Sans SC", "Source Han Sans SC", sans-serif`;
  ctx.fillStyle = '#f3f4f6';
  ctx.textBaseline = 'top';
  ctx.fillText(selected.name, textPos.x, textPos.y);

  drawHandles();
}

function drawHandles() {
  if (!selected) return;
  ctx.strokeStyle = 'rgba(96,165,250,0.85)';
  ctx.lineWidth = 1;
  if (iconImg) {
    ctx.strokeRect(
      iconPos.x - 2,
      iconPos.y - 2,
      iconImg.naturalWidth + 4,
      iconImg.naturalHeight + 4
    );
  }
  const { w, h } = measureTextBlock(selected.name, fontSize);
  ctx.strokeRect(textPos.x - 2, textPos.y - 2, w + 4, h + 4);
}

function hitIcon(mx, my) {
  if (!iconImg) return false;
  return (
    mx >= iconPos.x &&
    my >= iconPos.y &&
    mx <= iconPos.x + iconImg.naturalWidth &&
    my <= iconPos.y + iconImg.naturalHeight
  );
}

function hitText(mx, my) {
  if (!selected) return false;
  const { w, h } = measureTextBlock(selected.name, fontSize);
  return (
    mx >= textPos.x &&
    my >= textPos.y &&
    mx <= textPos.x + w &&
    my <= textPos.y + h
  );
}

function canvasCoords(ev) {
  const r = canvas.getBoundingClientRect();
  const cx = ev.clientX ?? (ev.touches && ev.touches[0] ? ev.touches[0].clientX : 0);
  const cy = ev.clientY ?? (ev.touches && ev.touches[0] ? ev.touches[0].clientY : 0);
  const scaleX = canvas.width / r.width;
  const scaleY = canvas.height / r.height;
  return {
    x: (cx - r.left) * scaleX,
    y: (cy - r.top) * scaleY,
  };
}

canvas.addEventListener('mousedown', ev => {
  if (!selected) return;
  const { x, y } = canvasCoords(ev);
  if (hitIcon(x, y)) {
    drag = { kind: 'icon', ox: x - iconPos.x, oy: y - iconPos.y };
  } else if (hitText(x, y)) {
    drag = { kind: 'text', ox: x - textPos.x, oy: y - textPos.y };
  }
});

window.addEventListener('mousemove', ev => {
  if (!drag) return;
  const { x, y } = canvasCoords(ev);
  if (drag.kind === 'icon') {
    iconPos.x = x - drag.ox;
    iconPos.y = y - drag.oy;
  } else {
    textPos.x = x - drag.ox;
    textPos.y = y - drag.oy;
  }
  render();
});

window.addEventListener('mouseup', () => {
  drag = null;
});

canvas.addEventListener(
  'touchstart',
  e => {
    if (!selected) return;
    e.preventDefault();
    const t = e.touches[0];
    const { x, y } = canvasCoords(t);
    if (hitIcon(x, y)) drag = { kind: 'icon', ox: x - iconPos.x, oy: y - iconPos.y };
    else if (hitText(x, y)) drag = { kind: 'text', ox: x - textPos.x, oy: y - textPos.y };
  },
  { passive: false }
);
window.addEventListener('touchmove', e => {
  if (!drag) return;
  e.preventDefault();
  const t = e.touches[0];
  const { x, y } = canvasCoords(t);
  if (drag.kind === 'icon') {
    iconPos.x = x - drag.ox;
    iconPos.y = y - drag.oy;
  } else {
    textPos.x = x - drag.ox;
    textPos.y = y - drag.oy;
  }
  render();
});
window.addEventListener('touchend', () => {
  drag = null;
});

document.getElementById('fontSize').addEventListener('input', () => {
  fontSize = Math.max(12, parseInt(document.getElementById('fontSize').value, 10) || 28);
  document.getElementById('fontSizeVal').textContent = fontSize;
  render();
});

document.getElementById('canvasW').addEventListener('input', () => {
  canvasW = Math.max(320, parseInt(document.getElementById('canvasW').value, 10) || 920);
  render();
});
document.getElementById('canvasH').addEventListener('input', () => {
  canvasH = Math.max(200, parseInt(document.getElementById('canvasH').value, 10) || 520);
  render();
});

document.getElementById('searchBtn').addEventListener('click', runSearch);
document.getElementById('searchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') runSearch();
});

document.getElementById('loadCsvBtn').addEventListener('click', () => {
  loadCsv().catch(err => {
    document.getElementById('csvStatus').textContent = '加载失败：' + err.message;
  });
});

document.getElementById('exportBtn').addEventListener('click', () => {
  if (!selected) {
    alert('请先选择装备');
    return;
  }
  render();
  canvas.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `equip-card-${selected.iconId}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, 'image/png');
});

document.getElementById('applyCanvasBtn').addEventListener('click', () => {
  canvasW = Math.max(320, parseInt(document.getElementById('canvasW').value, 10) || 920);
  canvasH = Math.max(200, parseInt(document.getElementById('canvasH').value, 10) || 520);
  render();
});

window.addEventListener('load', async () => {
  await document.fonts.ready;
  fontSize = Math.max(12, parseInt(document.getElementById('fontSize').value, 10) || 28);
  document.getElementById('fontSizeVal').textContent = fontSize;
  canvasW = Math.max(320, parseInt(document.getElementById('canvasW').value, 10) || 920);
  canvasH = Math.max(200, parseInt(document.getElementById('canvasH').value, 10) || 520);
  try {
    await loadCsv();
  } catch (e) {
    document.getElementById('csvStatus').textContent =
      '自动加载失败（可点「重新加载 CSV」）：' + e.message;
  }
  render();
});
