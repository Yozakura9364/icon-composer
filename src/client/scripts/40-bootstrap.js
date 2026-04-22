// ============================================================
// 启动
// ============================================================
setupCustomCropCanvasListeners();
setupInfoLayerCanvasHoverHandlers();
applyHeaderIconPaths();
applyThemeFromStorage();
init();

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const cropModal = document.getElementById('customCropModal');
  if (cropModal && cropModal.classList.contains('open')) {
    cancelCustomCrop();
    return;
  }
  const mobileActionMenu = document.getElementById('mobileActionList');
  if (mobileActionMenu && mobileActionMenu.classList.contains('open')) {
    closeMobileActionMenu();
    return;
  }
  const settingsMenu = document.getElementById('settingsActionList');
  if (settingsMenu && settingsMenu.classList.contains('open')) {
    closeSettingsMenu();
    return;
  }
  if (pendingCustomPick) {
    pendingCustomPick = false;
    updateCustomPortraitUI();
    return;
  }
});

(function setupComposerConfigFileInput() {
  const inp = document.getElementById('composerConfigFileInput');
  if (!inp || inp.dataset.bound === '1') return;
  inp.dataset.bound = '1';
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0];
    inp.value = '';
    if (!f) return;
    try {
      const text = await f.text();
      await applyComposerConfigFromObject(parseComposerConfigFromText(text));
      closeSettingsMenu();
      alert('已从JSON导入配置。');
    } catch (e) {
      alert('导入失败：' + (e && e.message ? e.message : e));
    }
  });
})();

