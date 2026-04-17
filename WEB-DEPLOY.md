# 推送到 GitHub：icon-composer-web

目标仓库：<https://github.com/Yozakura9364/icon-composer-web>

以下文件为**网页版运行所需**（不含 Electron、不含本机解包素材）：

- `index.html`
- `server.js`
- `csv-whitelist.js`
- `csv-valid-icon-ids.json`（可选，有则优先作白名单缓存）
- `presets.json`
- `id-names.json`
- `package.json`
- `package-lock.json`
- `psd-writer.js`
- `jsx-writer.js`

不包含：`electron/`、`node_modules/`、`vendor/`（CSV 白名单可走网络拉取）、本机路径素材。

## 首次推送示例

在本仓库根目录（与 `server.js` 同级）执行：

```bash
git init
git remote add origin https://github.com/Yozakura9364/icon-composer-web.git
git add index.html server.js csv-whitelist.js csv-valid-icon-ids.json presets.json id-names.json package.json package-lock.json psd-writer.js jsx-writer.js README.md WEB-DEPLOY.md .gitignore
git commit -m "Initial web deployment"
git branch -M main
git push -u origin main
```

若远程已有提交，先 `git pull origin main --allow-unrelated-histories` 再推送。

## 服务器上

```bash
npm install
node server.js
```

环境变量（可选）：`ICON_COMPOSER_PORT`、`METRICS_SECRET`。
