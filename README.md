# 铭牌生成器（Icon Composer）

FFXIV 铭牌 / 肖像图层合成：网页版与 Electron 桌面版。

## 网页版部署（推荐）

托管仓库：<https://github.com/Yozakura9364/icon-composer-web>

```bash
git clone https://github.com/Yozakura9364/icon-composer-web.git
cd icon-composer-web
npm install
node server.js
```

浏览器访问控制台提示的端口（默认 `http://localhost:3456`）。素材目录可通过 `--materials <路径>` 指定；图床/CDN 在 `index.html` 中的 `ICON_IMG_BASE` 与 `/api/files` 返回的 `_meta.imgBase` 配置。

## Electron 桌面版

### 下载 Release

见 [Releases](https://github.com/InfSein/icon-composer/releases) 中的 `IconComposer.exe`（若上游仍维护）。

### 从源码运行

```bash
git clone <本仓库地址>
cd icon-composer/electron
npm install
npm start
```

PSD 导出需本机安装 **Adobe Photoshop**。

## 素材与 ID 范围

素材 PNG 命名形如 `{6位ID}_hr1.png`，数据参考 [ffxiv-datamining-mixed/chs](https://github.com/InfSein/ffxiv-datamining-mixed/tree/master/chs)。

| 分类 | ID 范围 |
|------|--------|
| 肖像背景 | 190002~190999 |
| 肖像装饰框 | 191002~191999 |
| 肖像装饰物 | 192002~192999 |
| 铭牌底色 | 193002~193999 |
| 铭牌花纹 | 194002~194999 |
| 铭牌背衬 | 195002~195999 |
| 铭牌顶部装饰 | 196002~196249 |
| 铭牌底部装饰 | 196252~196499 |
| 肖像外框 | 197002~197999 |
| 铭牌外框 | 198002~198999 |
| 铭牌装饰物 | 199002~199999 |
| 铭牌装饰物B | 234401~234499 |

## 技术栈

- Node.js HTTP（`server.js`）
- 可选：Electron（`electron/`）
- Photoshop ExtendScript（PSD/JSX 导出）
