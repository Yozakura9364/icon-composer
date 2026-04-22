function updateCustomPortraitUI() {
  const clearBtn = document.getElementById('customClearImageBtn');
  const nameEl = document.getElementById('customPortraitName');
  const scaleInput = document.getElementById('customPortraitScale');
  const scaleValue = document.getElementById('customPortraitScaleValue');
  const zipBtn = document.getElementById('exportLayeredZipBtn');
  const jsxBtn = document.getElementById('exportPsdJsxBtn');

  if (zipBtn) zipBtn.style.display = isWebRuntime() ? '' : 'none';
  if (jsxBtn) jsxBtn.style.display = isWebRuntime() ? 'none' : '';
  if (clearBtn) clearBtn.style.display = customPortraitImage ? '' : 'none';
  if (nameEl) nameEl.textContent = customPortraitImage ? customPortraitImage.fileName : '未上传自定义图片';
  if (scaleInput) scaleInput.value = customPortraitImage ? String(customPortraitImage.scale) : '1';
  if (scaleValue) scaleValue.textContent = Math.round((customPortraitImage ? customPortraitImage.scale : 1) * 100) + '%';
  const thumb = document.getElementById('customPortraitAvatarThumb');
  const glyph = document.getElementById('customPortraitAvatarGlyph');
  if (thumb && glyph) {
    if (customPortraitImage && customPortraitImage.dataUrl) {
      thumb.src = customPortraitImage.dataUrl;
      thumb.style.display = 'block';
      glyph.style.display = 'none';
    } else {
      thumb.removeAttribute('src');
      thumb.style.display = 'none';
      glyph.style.display = 'block';
    }
  }
}

/** 用 label 关联 file，避免 JS 里 input.click() 脱离用户手势导致要点两次；取消时靠 focus 收尾 */
function setupCustomPortraitFileInput() {
  const input = document.getElementById('customPortraitInput');
  if (!input || input.dataset.bound === '1') return;
  input.dataset.bound = '1';

  let dismissFocus = null;

  function clearDismissFocus() {
    if (dismissFocus) {
      window.removeEventListener('focus', dismissFocus);
      dismissFocus = null;
    }
  }

  input.addEventListener('click', () => {
    pendingCustomPick = true;
    updateCustomPortraitUI();
    clearDismissFocus();
    dismissFocus = () => {
      setTimeout(() => {
        if (!pendingCustomPick) return;
        const f = input.files && input.files[0];
        if (f) return;
        pendingCustomPick = false;
        updateCustomPortraitUI();
        clearDismissFocus();
      }, 80);
    };
    setTimeout(() => window.addEventListener('focus', dismissFocus), 0);
  });

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    clearDismissFocus();
    pendingCustomPick = false;
    updateCustomPortraitUI();
    if (file) await openCustomPortraitCropperFromFile(file);
  });

  input.addEventListener('cancel', () => {
    pendingCustomPick = false;
    updateCustomPortraitUI();
    clearDismissFocus();
  });
}

function updateCropMulLabel() {
  const el = document.getElementById('customCropMulValue');
  if (el && customCropState) el.textContent = Math.round(customCropState.mul * 100) + '%';
}

function clampCropOffset() {
  const st = customCropState;
  if (!st || !st.img) return;
  const iw = st.img.naturalWidth;
  const ih = st.img.naturalHeight;
  const s = st.s0 * st.mul;
  const w = iw * s;
  const h = ih * s;
  if (w >= CANVAS_PORTRAIT.w) {
    const lim = (w - CANVAS_PORTRAIT.w) / 2;
    st.offX = Math.max(-lim, Math.min(lim, st.offX));
  } else {
    st.offX = 0;
  }
  if (h >= CANVAS_PORTRAIT.h) {
    const lim = (h - CANVAS_PORTRAIT.h) / 2;
    st.offY = Math.max(-lim, Math.min(lim, st.offY));
  } else {
    st.offY = 0;
  }
}

function drawCropPreview() {
  const canvas = document.getElementById('customCropCanvas');
  const st = customCropState;
  if (!canvas || !st || !st.img) return;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0c12';
  ctx.fillRect(0, 0, CANVAS_PORTRAIT.w, CANVAS_PORTRAIT.h);
  const iw = st.img.naturalWidth;
  const ih = st.img.naturalHeight;
  const s = st.s0 * st.mul;
  const w = iw * s;
  const h = ih * s;
  const x = (CANVAS_PORTRAIT.w - w) / 2 + st.offX;
  const y = (CANVAS_PORTRAIT.h - h) / 2 + st.offY;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, CANVAS_PORTRAIT.w, CANVAS_PORTRAIT.h);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(st.img, x, y, w, h);
  ctx.restore();
}

async function openCustomPortraitCropperFromFile(file) {
  const reader = new FileReader();
  const dataUrl = await new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('图片解码失败'));
    img.src = dataUrl;
  });
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) {
    alert('无法读取该图片尺寸');
    return;
  }
  const s0 = Math.max(CANVAS_PORTRAIT.w / iw, CANVAS_PORTRAIT.h / ih);
  customCropState = {
    img,
    fileName: file.name,
    dataUrl,
    s0,
    mul: 1,
    offX: 0,
    offY: 0,
  };
  const range = document.getElementById('customCropMulRange');
  if (range) range.value = '1';
  updateCropMulLabel();
  clampCropOffset();
  const modal = document.getElementById('customCropModal');
  if (modal) {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }
  drawCropPreview();
}

function cancelCustomCrop() {
  const modal = document.getElementById('customCropModal');
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }
  customCropState = null;
}

async function applyCustomPortraitFromCropState(st) {
  if (!st || !st.img) return;
  const c = document.createElement('canvas');
  c.width = CANVAS_PORTRAIT.w;
  c.height = CANVAS_PORTRAIT.h;
  const ctx = c.getContext('2d');
  const iw = st.img.naturalWidth;
  const ih = st.img.naturalHeight;
  const s = st.s0 * st.mul;
  const w = iw * s;
  const h = ih * s;
  const x = (CANVAS_PORTRAIT.w - w) / 2 + st.offX;
  const y = (CANVAS_PORTRAIT.h - h) / 2 + st.offY;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, CANVAS_PORTRAIT.w, CANVAS_PORTRAIT.h);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(st.img, x, y, w, h);
  ctx.restore();
  const dataUrl = c.toDataURL('image/png');
  const outImg = new Image();
  await new Promise((resolve, reject) => {
    outImg.onload = () => resolve();
    outImg.onerror = reject;
    outImg.src = dataUrl;
  });
  customPortraitImage = {
    fileName: st.fileName,
    dataUrl,
    img: outImg,
    scale: 1,
  };
  updateCustomPortraitUI();
  await render();
  schedulePersistComposerConfig();
}

function confirmCustomCrop() {
  const st = customCropState;
  const modal = document.getElementById('customCropModal');
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }
  customCropState = null;
  if (st) void applyCustomPortraitFromCropState(st);
}

function setupCustomCropCanvasListeners() {
  const canvas = document.getElementById('customCropCanvas');
  const range = document.getElementById('customCropMulRange');
  if (!canvas) return;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('pointerdown', e => {
    if (!customCropState) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {}
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging || !customCropState) return;
    const rect = canvas.getBoundingClientRect();
    const sx = CANVAS_PORTRAIT.w / rect.width;
    const sy = CANVAS_PORTRAIT.h / rect.height;
    customCropState.offX += (e.clientX - lastX) * sx;
    customCropState.offY += (e.clientY - lastY) * sy;
    lastX = e.clientX;
    lastY = e.clientY;
    clampCropOffset();
    drawCropPreview();
  });
  canvas.addEventListener('pointerup', e => {
    dragging = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}
    canvas.classList.remove('dragging');
  });
  canvas.addEventListener('pointercancel', () => {
    dragging = false;
    canvas.classList.remove('dragging');
  });
  canvas.addEventListener('wheel', e => {
    if (!customCropState) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.06 : 0.06;
    customCropState.mul = Math.max(1, Math.min(3, customCropState.mul + delta));
    if (range) range.value = String(customCropState.mul);
    updateCropMulLabel();
    clampCropOffset();
    drawCropPreview();
  }, { passive: false });
  if (range) {
    range.addEventListener('input', () => {
      if (!customCropState) return;
      customCropState.mul = parseFloat(range.value);
      updateCropMulLabel();
      clampCropOffset();
      drawCropPreview();
    });
  }
}

function setCustomPortraitScale(value) {
  const scale = Math.max(0.2, Math.min(3, parseFloat(value || '1')));
  if (customPortraitImage) {
    customPortraitImage.scale = scale;
    render();
  }
  updateCustomPortraitUI();
  schedulePersistComposerConfig();
}

async function clearCustomPortraitImage() {
  if (!window.confirm('确定清空自定义图片吗？')) return;
  customPortraitImage = null;
  updateCustomPortraitUI();
  await render();
  schedulePersistComposerConfig();
}

/** 素材列表（必须是数组，否则 fd.find 会抛错导致预设应用中断、肖像层未写入） */
