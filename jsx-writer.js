/**
 * 生成 Adobe ExtendScript (JSX) 脚本
 * 由 Photoshop 执行，自动创建带图层的 PSD 文件
 *
 * 使用 app.open() 打开 PNG，然后复制图层到主文档
 * 比 placeEvent 更稳定可靠
 *
 * 输入 layers 格式:
 * { name, x, y, pngPath, opacity }
 * pngPath 是服务器已写入的 PNG 文件路径
 */
function generateJSXScript(layers, canvasWidth, canvasHeight, outputFilename, saveDir) {
  const jsxLines = [];

  jsxLines.push('// ============================================');
  jsxLines.push('// PSD 图层合成脚本 - 由 icon-composer 生成');
  jsxLines.push('// 使用方式: Photoshop > File > Scripts > Browse');
  jsxLines.push('// ============================================');
  jsxLines.push('');
  jsxLines.push('function sTID(s) { return stringIDToTypeID(s); }');
  jsxLines.push('');

  // 创建主文档
  jsxLines.push('var docWidth = ' + canvasWidth + ';');
  jsxLines.push('var docHeight = ' + canvasHeight + ';');
  jsxLines.push('var doc = app.documents.add(');
  jsxLines.push('  UnitValue(docWidth, "px"),');
  jsxLines.push('  UnitValue(docHeight, "px"),');
  jsxLines.push('  72, "composite", NewDocumentMode.RGB');
  jsxLines.push(');');
  jsxLines.push('');

  // 用 app.open() 打开每个 PNG，然后复制图层
  for (let i = 0; i < layers.length; i++) {
    const ly = layers[i];
    const layerName = ly.name.replace(/"/g, '\\"');
    const opacity = Math.round((ly.opacity !== undefined ? ly.opacity : 1) * 100);
    const escapedPath = ly.pngPath.replace(/\\/g, '/').replace(/"/g, '\\"');

    jsxLines.push('// --- Layer: ' + layerName + ' ---');
    jsxLines.push('(function() {');
    jsxLines.push('  var f = new File("' + escapedPath + '");');
    jsxLines.push('  if (!f.exists) {');
    jsxLines.push('    alert("File not found: ' + escapedPath + '");');
    jsxLines.push('    return;');
    jsxLines.push('  }');
    // 用 executeAction 打开文件，避免 UI
    jsxLines.push('  var openDesc = new ActionDescriptor();');
    jsxLines.push('  openDesc.putPath(sTID("target"), f);');
    jsxLines.push('  executeAction(sTID("open"), openDesc, DialogModes.NO);');
    jsxLines.push('  var srcDoc = app.activeDocument;');
    jsxLines.push('');
    // 全选并复制
    jsxLines.push('  srcDoc.selection.selectAll();');
    jsxLines.push('  srcDoc.selection.copy();');
    jsxLines.push('  srcDoc.close(SaveOptions.DONOTSAVECHANGES);');
    jsxLines.push('');
    // 粘贴到主文档
    jsxLines.push('  doc.activeLayer = doc.artLayers.add();');
    jsxLines.push('  doc.paste();');
    jsxLines.push('  var pasted = doc.activeLayer;');
    jsxLines.push('  pasted.name = "' + layerName + '";');
    jsxLines.push('  pasted.opacity = ' + opacity + ';');
    jsxLines.push('');
    // 缩放到导出声明的像素尺寸（与前端 rgbaData 画布一致）
    jsxLines.push('  var curW = pasted.bounds[2].value - pasted.bounds[0].value;');
    jsxLines.push('  var curH = pasted.bounds[3].value - pasted.bounds[1].value;');
    const tw = Number(ly.width);
    const th = Number(ly.height);
    const hasDims = Number.isFinite(tw) && Number.isFinite(th) && tw > 0 && th > 0;
    if (hasDims) {
      jsxLines.push('  var targetW = UnitValue(' + tw + ', "px");');
      jsxLines.push('  var targetH = UnitValue(' + th + ', "px");');
      jsxLines.push('  if (Math.abs(curW - targetW.value) > 0.1 || Math.abs(curH - targetH.value) > 0.1) {');
      jsxLines.push('    var scaleX = (targetW.value / curW) * 100;');
      jsxLines.push('    var scaleY = (targetH.value / curH) * 100;');
      jsxLines.push('    pasted.resize(scaleX, scaleY, AnchorPosition.TOPLEFT);');
      jsxLines.push('  }');
    }
    jsxLines.push('');
    // 移动到目标位置
    if (ly.x !== 0 || ly.y !== 0) {
      jsxLines.push('  var bx = pasted.bounds[0].value;');
      jsxLines.push('  var by = pasted.bounds[1].value;');
      jsxLines.push('  pasted.translate(');
      jsxLines.push('    UnitValue(' + ly.x + ' - bx, "px"),');
      jsxLines.push('    UnitValue(' + ly.y + ' - by, "px")');
      jsxLines.push('  );');
    }
    jsxLines.push('})();');
    jsxLines.push('');
  }

  // 保存为 PSD
  jsxLines.push('// --- 保存为 PSD ---');
  if (saveDir) {
    // 尽量使用 forward slash，减少 ExtendScript 在 Windows 下的路径解析问题
    const normalized = String(saveDir).replace(/\\/g, '/').replace(/\/+$/g, '');
    const escapedSaveDir = normalized.replace(/"/g, '\\"');
    const escapedOut = String(outputFilename).replace(/"/g, '\\"');
    jsxLines.push('// __icon-composer-saveDir=' + escapedSaveDir);
    jsxLines.push('var saveFile = new File("' + escapedSaveDir + '/' + escapedOut + '");');
  } else {
    jsxLines.push('var saveFile = new File(Folder.desktop + "/' + outputFilename + '");');
  }
  jsxLines.push('var saveOpts = new PhotoshopSaveOptions();');
  jsxLines.push('saveOpts.layers = true;');
  jsxLines.push('doc.saveAs(saveFile, saveOpts);');
  // 用 fsName 输出绝对路径，避免用户只看到 Desktop 字样而误判
  jsxLines.push('alert("PSD saved to: " + saveFile.fsName);');
  jsxLines.push('doc.close(SaveOptions.DONOTSAVECHANGES);');

  return jsxLines.join('\n');
}

module.exports = { generateJSXScript };
