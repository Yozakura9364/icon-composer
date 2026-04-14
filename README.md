<<<<<<< HEAD
# Icon Composer

基于 Electron 的最终幻想 XIV 铭牌/肖像图层合成工具。

## 功能

- 可视化拖拽合成铭牌、肖像各图层
- 素材 ID 自动命名（中文化）
- 导出 PNG（1× / 4×）
- 导出 PSD（通过 Photoshop JSX 脚本，保留图层结构）

## 使用方法

### 方式一：下载 Release（推荐）

直接下载 [Releases](https://github.com/InfSein/icon-composer/releases) 中的 `IconComposer.exe`，双击运行即可。

首次运行时会让你选择**素材文件夹**（包含所有 PNG 文件的目录），之后随时点右上角 ⚙ 更改。

### 方式二：从源码运行

```bash
git clone https://github.com/InfSein/icon-composer.git
cd icon-composer/electron
npm install
npm start
```

然后打开 http://localhost:3456

### PSD 导出

PSD 导出依赖本机安装的 **Adobe Photoshop**，导出时会调用 JSX 脚本自动完成图层合成。

## 素材要求

- 素材文件夹包含 PNG 文件，命名格式为 `{ID}_hr1.png`
- 素材 ID 参考：[FFXIV Datamining](https://github.com/InfSein/ffxiv-datamining-mixed/tree/master/chs)

| 分类 | ID 范围 |
|------|---------|
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

- Electron 35
- Node.js HTTP 文件服务
- Adobe Photoshop ExtendScript (PSD 图层导出)
=======
# icon-composer
>>>>>>> 175878ae291ea2fc1954349ed906f27efb95aad9
