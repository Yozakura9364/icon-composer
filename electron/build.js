/**
 * Icon Composer Electron 构建脚本
 *
 * 用法: node build.js
 * 需要先: npm install
 *
 * 会自动:
 *   1. 检查 electron / electron-builder 是否安装
 *   2. 运行 electron-builder 生成 portable exe
 *   3. 报告输出路径
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const rootDir = __dirname;

function run(cmd, opts = {}) {
  console.log('\n>>>', cmd);
  return execSync(cmd, {
    cwd: rootDir,
    stdio: 'inherit',
    ...opts,
  });
}

function check(pkg) {
  try {
    require.resolve(pkg);
    return true;
  } catch {
    return false;
  }
}

console.log('========================================');
console.log(' Icon Composer Electron 构建脚本');
console.log('========================================');

// 1. 检查依赖
if (!check('electron') || !check('electron-builder')) {
  console.log('\n📦 正在安装 electron 和 electron-builder...');
  run('npm install');
} else {
  console.log('✅ 依赖已安装，跳过 npm install');
}

// 2. 构建
console.log('\n🔨 开始构建 portable exe...');
try {
  run('npx electron-builder --win portable --x64');
} catch (e) {
  console.error('构建失败:', e.message);
  process.exit(1);
}

// 3. 报告结果
const outDir = path.join(rootDir, 'out');
const files = fs.readdirSync(outDir).filter(f => f.endsWith('.exe'));
console.log('\n========================================');
console.log('✅ 构建完成！');
if (files.length > 0) {
  const exePath = path.join(outDir, files[0]);
  console.log('📁 文件:', exePath);
  console.log('📏 大小:', (fs.statSync(exePath).size / 1024 / 1024).toFixed(1), 'MB');
} else {
  console.log('❌ 未找到 exe 文件，请检查 out/ 目录');
}
console.log('========================================');
