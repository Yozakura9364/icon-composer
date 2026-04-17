# 铭牌生成器（网页端）

在浏览器里合成 FF14 铭牌 / 肖像图层，预览并导出图片。

## 环境要求

- [Node.js](https://nodejs.org/)（建议 LTS）

## 使用步骤

### 1. 获取代码并安装依赖

```bash
git clone https://github.com/Yozakura9364/icon-composer.git
cd icon-composer
npm install
```

### 2. 启动服务

```bash
node server.js
```

终端里会打印访问地址，默认为：

**http://localhost:3456**

用浏览器打开即可使用。

### 3. 素材目录（本机 PNG）

默认会扫描服务端配置里的「解包图标」目录。若你的素材在别的路径，启动时指定：

```bash
node server.js --materials "D:\path\to\ui\icon"
```

（路径请改成你本机实际目录。）

### 4. 图床 / CDN

缩略图与预览默认可走图床。本机用 `node server.js` 且使用本地素材时，接口会返回 `imgBase: /img`，由当前服务提供图片。

若需改为自己的 R2 / Worker 地址，在 **`index.html`** 里修改 **`ICON_IMG_BASE`**（或按你部署方式由服务端返回的 `_meta.imgBase` 覆盖）。

### 5. 可选：端口与环境变量

| 变量 | 说明 |
|------|------|
| `ICON_COMPOSER_PORT` | 端口，默认 `3456` |
| `METRICS_SECRET` | 若设置，访问 `/api/metrics` 需带 `?secret=` |

### 6. 界面说明（简要）

- **肖像 / 铭牌**：侧栏切换分类，点选图层；可切换完整预览与单画布预览。
- **昼夜**：顶栏 **「昼夜」** 切换浅色/深色，设置保存在浏览器本地。
- **导出（网页端）**：**导出 PNG**、**导出分层 ZIP**（具体以页面按钮为准）。

---

素材 PNG 命名一般为 `{6位ID}_hr1.png`，ID 与游戏表对应关系可参考 [ffxiv-datamining-mixed/chs](https://github.com/InfSein/ffxiv-datamining-mixed/tree/master/chs)。
