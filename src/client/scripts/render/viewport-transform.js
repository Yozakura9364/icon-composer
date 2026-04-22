function applyTransform() {
  const container = document.getElementById('canvasContainer');
  const canvas   = document.getElementById('mainCanvas');
  const vp       = document.getElementById('canvasViewport');
  const vw = vp.clientWidth, vh = vp.clientHeight;
  const cw = canvas.width, ch = canvas.height;

  const fitScale = (cw > 0 && ch > 0) ? Math.min(vw / cw, vh / ch) : 1;
  const scale = fitScale * zoomLevel;
  const dx = (vw - cw * scale) / 2;
  const dy = (vh - ch * scale) / 2;

  container.style.width = cw + 'px';
  container.style.height = ch + 'px';
  container.style.transform = `scale(${scale})`;
  container.style.transformOrigin = '0 0';
  container.style.position = 'absolute';
  container.style.left = Math.round(dx) + 'px';
  container.style.top  = Math.round(dy) + 'px';
}

function centerView() {
  applyTransform();
}

function clampZoom(z) {
  if (!Number.isFinite(z)) return 1;
  return Math.max(0.5, Math.min(3, z));
}

function syncZoomSelect() {
  const zs = document.getElementById('zoomSelect');
  if (!zs) return;
  zs.value = String(zoomLevel);
  if (![...zs.options].some(o => o.value === zs.value)) {
    let nearest = zs.options[0]?.value || '1';
    let best = Infinity;
    for (const opt of zs.options) {
      const v = parseFloat(opt.value);
      const d = Math.abs(v - zoomLevel);
      if (d < best) {
        best = d;
        nearest = opt.value;
      }
    }
    zs.value = nearest;
  }
}

function setZoom(val, persist = true) {
  const parsed = parseFloat(val);
  zoomLevel = clampZoom(parsed);
  syncZoomSelect();
  applyTransform();
  if (persist) schedulePersistComposerConfig();
}

function zoom(dir) {
  const steps = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
  const cur = zoomLevel;
  let idx = steps.findIndex(s => s >= cur);
  if (idx < 0) idx = steps.length - 1;
  idx = Math.max(0, Math.min(steps.length - 1, idx + (dir > 0 ? 1 : -1)));
  setZoom(steps[idx]);
}

function resetView() {
  setZoom(1);
}

function toggleMobileActionMenu() {
  const list = document.getElementById('mobileActionList');
  if (!list) return;
  closeSettingsMenu();
  const open = list.classList.toggle('open');
  list.setAttribute('aria-hidden', open ? 'false' : 'true');
}

function closeMobileActionMenu() {
  const list = document.getElementById('mobileActionList');
  if (!list || !list.classList.contains('open')) return;
  list.classList.remove('open');
  list.setAttribute('aria-hidden', 'true');
}

function toggleSettingsMenu() {
  const list = document.getElementById('settingsActionList');
  if (!list) return;
  closeMobileActionMenu();
  const open = list.classList.toggle('open');
  list.setAttribute('aria-hidden', open ? 'false' : 'true');
}

function closeSettingsMenu() {
  const list = document.getElementById('settingsActionList');
  if (!list || !list.classList.contains('open')) return;
  list.classList.remove('open');
  list.setAttribute('aria-hidden', 'true');
}

function openSettings() {
  toggleSettingsMenu();
}

function closeSettings() {
  closeSettingsMenu();
}

const ABOUT_MODAL_CONTENT_PATH = '/src/client/content/about-modal-content.html';
let aboutModalContentLoaded = false;
let aboutModalContentLoadPromise = null;

async function ensureAboutModalContentLoaded(forceReload = false) {
  const container = document.getElementById('aboutModalContent');
  if (!container) return;
  if (!forceReload && aboutModalContentLoaded) return;
  if (aboutModalContentLoadPromise) {
    await aboutModalContentLoadPromise;
    return;
  }
  aboutModalContentLoadPromise = (async () => {
    try {
      const contentUrl = forceReload
        ? `${appPath(ABOUT_MODAL_CONTENT_PATH)}?_=${Date.now()}`
        : appPath(ABOUT_MODAL_CONTENT_PATH);
      const resp = await fetch(contentUrl, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const html = await resp.text();
      container.innerHTML = html;
      aboutModalContentLoaded = true;
    } catch (e) {
      container.textContent = '关于内容加载失败，请检查 src/client/content/about-modal-content.html。';
      console.warn('[about-modal] 加载内容失败:', e);
    } finally {
      aboutModalContentLoadPromise = null;
    }
  })();
  await aboutModalContentLoadPromise;
}

function openAboutModal() {
  const modal = document.getElementById('aboutModal');
  if (!modal) return;
  void ensureAboutModalContentLoaded(true);
  closeMobileActionMenu();
  closeSettingsMenu();
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeAboutModal() {
  const modal = document.getElementById('aboutModal');
  if (!modal || !modal.classList.contains('open')) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

document.addEventListener('click', event => {
  const mobileList = document.getElementById('mobileActionList');
  const mobileButton = document.getElementById('mobileActionBtn');
  if (mobileList && mobileButton && mobileList.classList.contains('open') && !event.target.closest('#mobileActionBtn') && !event.target.closest('#mobileActionList')) {
    closeMobileActionMenu();
  }
  const settingsList = document.getElementById('settingsActionList');
  const settingsButton = document.getElementById('settingsBtn');
  if (settingsList && settingsButton && settingsList.classList.contains('open') && !event.target.closest('#settingsBtn') && !event.target.closest('#settingsActionList')) {
    closeSettingsMenu();
  }
});

window.addEventListener('resize', () => applyTransform());
