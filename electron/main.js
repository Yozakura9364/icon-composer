const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// 单实例锁：只允许一个进程运行，第二个进程通知第一个并退出
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let serverProcess = null;
let serverPort = 3456;

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
  } catch {
    return { materialsPath: null, exportPath: null };
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf8');
}

async function pickMaterialsFolder() {
  const result = await dialog.showOpenDialog(win, {
    title: '选择素材文件夹',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

async function pickExportFolder() {
  const result = await dialog.showOpenDialog(win, {
    title: '选择导出目录',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

function startServer(materialsPath, exportPath) {
  if (serverProcess) { serverProcess.kill(); serverProcess = null; }

  const serverPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app', 'server.js')
    : path.join(__dirname, '..', 'server.js');

  const args = [serverPath];
  if (materialsPath) args.push('--materials', materialsPath);
  if (exportPath)    args.push('--export', exportPath);

  // 开发模式用系统 node，打包模式从 resources 找
  let nodeExe;
  if (process.execPath.includes('node.exe')) {
    nodeExe = process.execPath;
  } else {
    nodeExe = path.join(process.resourcesPath, 'node.exe');
    if (!fs.existsSync(nodeExe)) {
      // fallback: 尝试从 PATH 找
      const pathEnv = process.env.PATH || '';
      for (const dir of pathEnv.split(path.delimiter)) {
        const candidate = path.join(dir, 'node.exe');
        if (fs.existsSync(candidate)) { nodeExe = candidate; break; }
      }
    }
  }
  serverProcess = spawn(nodeExe, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ICON_COMPOSER_PORT: String(serverPort) },
    detached: false,
  });

  serverProcess.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
  serverProcess.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  serverProcess.on('error', (e) => {
    console.error('[server error]', e);
    dialog.showErrorBox('服务器启动失败', e.message);
  });
  serverProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error('[server exit]', code);
    }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900,
    minWidth: 900, minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
    title: 'Icon Composer',
  });

  win.once('ready-to-show', () => win.show());

  if (app.isPackaged) {
    win.loadFile(path.join(process.resourcesPath, 'app', 'index.html'));
  } else {
    win.loadFile(path.join(__dirname, '..', 'index.html'));
  }
}

// 第二个进程被阻止后，通知主进程并退出
app.on('second-instance', (event, commandLine) => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(async () => {
  const cfg = loadConfig();

  const bundledIcon = path.join(__dirname, '..', 'ui', 'icon');

  if (!cfg.materialsPath) {
    if (fs.existsSync(bundledIcon)) {
      cfg.materialsPath = bundledIcon;
      if (!cfg.exportPath) {
        cfg.exportPath = path.join(app.getPath('documents'), 'ffxivportable');
      }
      saveConfig(cfg);
    } else {
      await dialog.showMessageBox({
        type: 'info', title: 'Icon Composer',
        message:
          '首次使用，请选择素材文件夹（包含 19xxxx.png 等素材图片的目录）。\n\n若已将解包放在项目根目录的 ui\\icon 下，请复制完成后再启动。',
        buttons: ['选择文件夹'],
      });
      const picked = await pickMaterialsFolder();
      if (!picked) { app.quit(); return; }
      cfg.materialsPath = picked;
      cfg.exportPath = path.join(app.getPath('documents'), 'ffxivportable');
      saveConfig(cfg);
    }
  }

  startServer(cfg.materialsPath, cfg.exportPath);
  setTimeout(() => createWindow(), 1500);
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  app.quit();
});

// IPC handlers
ipcMain.handle('pick-materials', async () => {
  const picked = await pickMaterialsFolder();
  if (picked) {
    const cfg = loadConfig();
    cfg.materialsPath = picked;
    saveConfig(cfg);
    startServer(cfg.materialsPath, cfg.exportPath);
    return { success: true, path: picked };
  }
  return { success: false };
});

ipcMain.handle('pick-export', async () => {
  const picked = await pickExportFolder();
  if (picked) {
    const cfg = loadConfig();
    cfg.exportPath = picked;
    saveConfig(cfg);
    startServer(cfg.materialsPath, cfg.exportPath);
    return { success: true, path: picked };
  }
  return { success: false };
});

ipcMain.handle('open-export', () => {
  const cfg = loadConfig();
  if (cfg.exportPath) shell.openPath(cfg.exportPath);
});

ipcMain.handle('get-config', () => loadConfig());



