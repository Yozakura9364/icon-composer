# Icon Composer — Electron 打包说明

## 目录结构

```
electron/
├── package.json   ← 依赖和构建配置
├── main.js         ← Electron 主进程
├── preload.js      ← 安全 IPC 桥接
├── build.js        ← 构建脚本（执行此文件即可）
└── README.md       ← 本说明
```

## 快速开始

### 1. 安装依赖

```powershell
cd icon-composer/electron
npm install
```

### 2. 开发调试

```powershell
npm start
```

> 首次运行会弹出窗口让你选择素材文件夹。

### 3. 构建 exe（生成单文件便携版）

```powershell
npm run build
```

构建完成后，`out/` 目录下会生成 `IconComposer-*-portable.exe`，可以直接复制到任意电脑运行。

## 功能说明

- **首次运行**：弹出对话框让你选择素材文件夹（包含 19xxxx.png 等图片的目录）
- **设置**：点击右上角 ⚙ 可随时更改素材文件夹或导出目录
- **导出**：PSD/PNG 文件会输出到设定的导出目录（默认桌面）
- **配置保存**：设置保存在 `AppData/Icon Composer/config.json`，下次启动自动加载

## 跨电脑使用

1. 把 `IconComposer-*-portable.exe` 复制到新电脑
2. 把素材文件夹（包含 19xxxx.png 等）复制到新电脑任意位置
3. 首次运行，选择素材文件夹即可

> 不需要安装 Node.js，不需要任何环境。
