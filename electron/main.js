const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

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
    ? path.join(process.resourcesPath, 'app.asar', 'server.js')
    : path.join(__dirname, '..', 'server.js');

  const args = [serverPath];
  if (materialsPath) args.push('--materials', materialsPath);
  if (exportPath)    args.push('--export', exportPath);

  const nodeExe = process.execPath.replace(/[\\\/][^\\\/]+$/, '\\node.exe');
  serverProcess = spawn(nodeExe, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ICON_COMPOSER_PORT: String(serverPort) },
    detached: false,
  });

  serverProcess.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
  serverProcess.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  serverProcess.on('error', (e) => console.error('[server error]', e));
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
    win.loadFile(path.join(process.resourcesPath, 'app.asar', 'index.html'));
  } else {
    win.loadFile(path.join(__dirname, '..', 'index.html'));
  }
}

app.whenReady().then(async () => {
  const cfg = loadConfig();

  if (!cfg.materialsPath) {
    dialog.showMessageBox({
      type: 'info', title: 'Icon Composer',
      message: '首次使用，请选择素材文件夹（包含 19xxxx.png 等素材图片的目录）。',
      buttons: ['选择文件夹'],
    });
    const picked = await pickMaterialsFolder();
    if (!picked) { app.quit(); return; }
    cfg.materialsPath = picked;
    cfg.exportPath = app.getPath('desktop');
    saveConfig(cfg);
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
