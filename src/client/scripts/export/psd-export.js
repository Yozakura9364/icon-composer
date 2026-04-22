async function exportPSD() {
  const w = CANVAS_FULL.w;
  const h = CANVAS_FULL.h;
  const layers = await collectLayeredExportData();

  if (layers.length === 0) {
    alert('请先选择至少一个图层');
    return;
  }

  const statusBar = document.getElementById('statusBar');
  statusBar.textContent = '正在生成 PSD 文件…';

  try {
    const resp = await fetch(appPath('/api/export-psd'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layers, canvasWidth: w, canvasHeight: h })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error('服务器错误: ' + (err.error || resp.status));
    }

    const blob = await resp.blob();
    if (blob.size < 1000) throw new Error('PSD 文件过小：' + blob.size + ' 字节');
    const link = document.createElement('a');
    link.download = 'composite_' + Date.now() + '.psd';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (e) {
    alert('PSD 导出失败：' + e.message);
  } finally {
    statusBar.textContent = '就绪';
  }
}

// ========== 导出 PSD (JSX) ==========
// 由 Photoshop 执行脚本生成 PSD，绕过二进制格式问题
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function exportPSDJSX() {
  const statusBar = document.getElementById('statusBar');
  try {
    statusBar.textContent = '正在生成 JSX 脚本…';

    const w = CANVAS_FULL.w;
    const h = CANVAS_FULL.h;
    const layers = await collectLayeredExportData();

    if (layers.length === 0) {
      alert('请先选择至少一个图层');
      return;
    }

    console.log('[exportPSDJSX] Total layers:', layers.length, layers.map(l => l.name + '@' + l.width + 'x' + l.height).join(', '));

    const resp = await fetch(appPath('/api/export-psd-jsx'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layers, canvasWidth: w, canvasHeight: h })
    });

    if (!resp.ok) throw new Error('服务器错误: ' + resp.status);

    const blob = await resp.blob();
    const link = document.createElement('a');
    link.download = 'composite_' + Date.now() + '.jsx';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (e) {
    console.error('[exportPSDJSX] failed:', e);
    alert('JSX 导出失败：' + (e?.message || e));
  } finally {
    statusBar.textContent = '就绪';
  }
}
