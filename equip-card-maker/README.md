# equip-card-maker

根据 [InfSein/ffxiv-datamining-mixed](https://github.com/InfSein/ffxiv-datamining-mixed) 的 `chs/Item.csv`（默认 **K 列名称、L 列或 `Image` 列图标编号**），搜索装备名，在画布上组合 **原版图标 + 装备名**（**Noto Sans SC**，即思源黑体系列），支持拖拽位置并导出 PNG。

图标 URL 规则与铭牌项目相同：`{6位ID}/{6位ID}_hr1.png`，图床根 URL 可在页面中填写（R2 / Worker）。

## 运行

```bash
cd equip-card-maker
npm start
```

浏览器打开：<http://localhost:8766>

（也可直接用浏览器打开 `index.html`，但若因安全策略无法拉取 GitHub 上的 CSV，请用本地 `server.js`。）

## 推送到 GitHub（新建仓库 equip-card-maker）

在 `equip-card-maker` 目录内：

```bash
git init
git add index.html app.js server.js package.json README.md .gitignore
git commit -m "Initial equip-card-maker"
git remote add origin https://github.com/<你的账号>/equip-card-maker.git
git branch -M main
git push -u origin main
```

## 说明

- 列下标为 **0 起**：Excel **K 列 = 10**，**L 列 = 11**。若留空 Icon 列，将使用表头中类型为 `Image` 的列。
- 导出依赖图标响应 **CORS**（`crossOrigin=anonymous`），请保证图床允许跨域，否则画布会被污染无法导出。
