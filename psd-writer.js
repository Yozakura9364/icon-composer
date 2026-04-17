/**
 * PSD 生成器 - 纯手写二进制格式，确保 PSD 规范正确
 * 通道顺序: channel 0=R, 1=G, 2=B, 3=A
 * 压缩方式: 未压缩 (compression=0)
 */
const { PNG } = require('pngjs');

function createLayeredPSD(layers, canvasWidth, canvasHeight) {
  // ---- 1. 先把所有图层合成一张 RGBA 大图 ----
  const canvas = Buffer.alloc(canvasWidth * canvasHeight * 4);
  // 初始化为透明 (0,0,0,0)
  canvas.fill(0);

  for (const ly of layers) {
    let rgbaData = ly.rgbaData;
    // base64 解码
    if (typeof rgbaData === 'string') {
      rgbaData = Buffer.from(rgbaData, 'base64');
    }
    // 如果是 PNG 格式，先解码
    let pxData = rgbaData;
    if (ly.width && ly.height && rgbaData.length !== ly.width * ly.height * 4) {
      // 当尺寸不匹配时，尝试当作 PNG 解码
      try {
        const png = PNG.sync.read(rgbaData);
        pxData = png.data;
        // 如果解码后的尺寸和声明不符，更新图层尺寸
        if (ly.width !== png.width || ly.height !== png.height) {
          ly.width = png.width;
          ly.height = png.height;
        }
      } catch (e) {
        // 解码失败，跳过
        continue;
      }
    }

    // 把图层像素合成到大图
    const lw = ly.width, lh = ly.height;
    for (let row = 0; row < lh; row++) {
      const dy = ly.y + row;
      if (dy < 0 || dy >= canvasHeight) continue;
      for (let col = 0; col < lw; col++) {
        const dx = ly.x + col;
        if (dx < 0 || dx >= canvasWidth) continue;
        const si = (row * lw + col) * 4;
        const di = (dy * canvasWidth + dx) * 4;
        const srcA = pxData[si + 3];
        if (srcA === 0) continue; // 全透明，跳过
        if (srcA === 255) {
          // 不透明，直接覆盖
          canvas[di]     = pxData[si];
          canvas[di + 1] = pxData[si + 1];
          canvas[di + 2] = pxData[si + 2];
          canvas[di + 3] = 255;
        } else {
          // 半透明，Alpha 合成
          const dstA = canvas[di + 3] / 255;
          const srcA2 = srcA / 255;
          const outA = srcA2 + dstA * (1 - srcA2);
          if (outA > 0) {
            canvas[di]     = Math.min(255, (pxData[si]     * srcA2 + canvas[di]     * dstA * (1 - srcA2)) / outA);
            canvas[di + 1] = Math.min(255, (pxData[si + 1] * srcA2 + canvas[di + 1] * dstA * (1 - srcA2)) / outA);
            canvas[di + 2] = Math.min(255, (pxData[si + 2] * srcA2 + canvas[di + 2] * dstA * (1 - srcA2)) / outA);
            canvas[di + 3] = Math.round(outA * 255);
          }
        }
      }
    }
  }

  // ---- 2. 提取 RGBA 通道 ----
  const n = canvasWidth * canvasHeight;
  const chR = Buffer.alloc(n), chG = Buffer.alloc(n), chB = Buffer.alloc(n), chA = Buffer.alloc(n);
  for (let i = 0; i < n; i++) {
    chR[i] = canvas[i * 4];
    chG[i] = canvas[i * 4 + 1];
    chB[i] = canvas[i * 4 + 2];
    chA[i] = canvas[i * 4 + 3];
  }

  // ---- 3. 构建 PSD 二进制 ----
  const chunks = [];

  // === 文件头 (26 bytes) ===
  chunks.push(Buffer.from('8BPS'));                   // signature
  chunks.push(buf16(1));                               // version=1 (PSD)
  chunks.push(Buffer.alloc(6));                        // reserved=0
  chunks.push(buf16(0));                               // numChannels=0 (merged only)
  chunks.push(buf32(canvasHeight));                    // height
  chunks.push(buf32(canvasWidth));                     // width
  chunks.push(buf16(8));                               // depth=8 bits
  chunks.push(buf16(3));                               // colorMode=RGB

  // === 颜色模式数据段 (length=0) ===
  chunks.push(buf32(0));

  // === 图像资源段 (length=0) ===
  chunks.push(buf32(0));

  // === 图层蒙版数据段 ===
  // 纯合成图，无图层 → 只有全局长度字段
  chunks.push(buf32(0));

  // === 合并图像数据 ===
  // compression=0 (未压缩)
  chunks.push(buf16(0));
  chunks.push(chR);
  chunks.push(chG);
  chunks.push(chB);
  chunks.push(chA);

  return Buffer.concat(chunks);
}

function buf16(v) {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(v, 0);
  return b;
}

function buf32(v) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(v, 0);
  return b;
}

module.exports = { createLayeredPSD };
