# Killing Floor Map Viewer

[English](../README.md) · [Русский](./README.ru.md) · [Español](./README.es.md) · [Português](./README.pt.md) · [Lietuvių](./README.lt.md) · [Polski](./README.pl.md) · [Français](./README.fr.md) · **中文** · [日本語](./README.ja.md)

一个用于查看 Killing Floor 地图（`*.rom`，Unreal Engine 2.5）的桌面应用（Windows / macOS / Linux）。它把关卡连同贴图一起绘制出来，让你自由飞行观察，而不必打开笨重的 KFEd 编辑器。同一个查看器也能作为单个 `viewer.html` 页面在浏览器中运行。`.rom` 格式是我手工逆向出来的，细节都写在 [`RESEARCH.md`](./RESEARCH.zh.md) 里。

![Killing Floor Map Viewer](../screenshot.jpg)

## 你需要准备什么

- 本地安装的 **Killing Floor** 游戏（查看器读取的是你自己的游戏文件：`.rom` 地图以及旁边的 `.utx`/`.usx` 包）。
- 下方的 **桌面应用**，或者一个较新的基于 Chromium 的浏览器（Chrome / Edge）——查看器用到了文件夹选择器和 S3TC 压缩贴图扩展。

本仓库不附带任何游戏内容。你需要把查看器指向自己的游戏安装目录。

## 桌面应用（Windows / macOS / Linux）

预构建的、自包含的应用可以在 [Releases](https://github.com/geekrainian/killingfloor-map-viewer/releases) 页面获取——无需浏览器：

- **Windows** —— `…-setup.exe`（安装程序）或 `…-portable.exe`（免安装运行）。
- **macOS** —— `…-mac-x64.dmg`（Intel）或 `…-mac-arm64.dmg`（Apple Silicon）。
- **Linux** —— `…-linux-x64.AppImage`（随处运行）或 `…-linux-x64.deb`。

它们用 [Electron](https://www.electronjs.org/) 把完全相同的查看器封装起来；操作方式和工作流程与下方的浏览器版本完全一致。这些构建未经签名，所以操作系统在首次启动时可能会弹出警告（Windows SmartScreen → *更多信息 → 仍要运行*；macOS → 右键点击 → *打开*）。

### 自行构建

```bash
pnpm install
pnpm start         # run the app from source
pnpm run dist      # build installers for the current OS into dist/
```

## 使用查看器

1. 打开桌面应用，或者在浏览器中打开 `viewer.html`（双击即可）。它可以离线运行；Three.js 已内置在 `vendor/` 下。
2. 点击 `Game folder`，选择你的 KF 安装根目录（`…/common/KillingFloor`）。一开始只会索引包的名字；`.utx`/`.usx` 文件按需读取。
3. 点击 `Map .rom` 选择一张地图（或者把 `.rom` 拖到窗口里）。

操作方式：点击以捕获鼠标，`WASD` 移动，`Space`/`Ctrl` 上下升降，`Shift` 冲刺，`R`（或 `Reset view` 按钮）回到起点，`Esc` 释放鼠标。

左侧面板提供 `wireframe`、`BSP`、`meshes`、`terrain`、`sky` 和 `light` 的开关，还有 `spawns`、`trader` 和 `paths`（玩家出生点、商人点位、怪物寻路节点）的叠加显示开关，以及一个移动速度滑块。

它绘制的内容：世界 BSP（墙壁/地板/天花板）、静态网格（道具和细节——对于那些 CS 移植地图，几乎所有几何体都在这里）、以及高度图地形，全部带贴图。镂空贴图（植被、格栅、栅栏）使用 alpha 测试；玻璃、雨水和其他混合效果则遵循材质的 blend mode。天空盒是地图真正的 `SkyZoneInfo` 区域，作为锁定在摄像机上的背景绘制，那些占位用的“天空窗口”表面会被去掉，好让天空透出来。`light` 开关会从地图的 Light/Spotlight actor 烘焙出一遍近似光照——它默认关闭，并不是游戏那套精确烘焙的光照贴图。

一些粗糙之处列在 [`RESEARCH.md`](./RESEARCH.zh.md) 的末尾。值得注意的是：如果某个网格所需的 `.usx` 没有安装，就会被跳过（会在日志里显示），并且地形高度用的是标准 UE2 映射，所以如果某张地图的地形看起来太平或太高，代码里的那个除数就是可以调的旋钮。

## CLI（Node）

```bash
node cli.js <map.rom>            # package version, geometry counts, referenced texture packages
node cli.js <map.rom> out.obj    # + export the BSP as OBJ (opens in Blender / Windows 3D Viewer)
```

导出的 OBJ 带有顶点位置、面和 UV，但没有贴图——用来在任意 3D 工具里快速检查几何体。

## 文件

| 文件 | 是什么 |
|------|-----------|
| `viewer.html` | 查看器（Three.js + 一个小巧的 pointer-lock/WASD 飞行摄像机） |
| `kfrom.js` | 核心：UE2.5 包解析、世界 BSP、静态网格、地形、贴图（浏览器和 Node 通用） |
| `cli.js` | Node CLI：统计信息和 OBJ 导出 |
| `electron/main.js` | 把 `viewer.html` 作为桌面应用托管的 Electron 外壳 |
| `vendor/three.min.js` | Three.js r136（内置打包，让查看器可以离线工作） |
| `RESEARCH.md` | 关于 `.rom` 格式以及查看器如何渲染它的笔记 |

## 许可证

本项目采用 **MIT License** 授权。完整文本见 [`LICENSE`](../LICENSE)。

### 第三方

- `vendor/three.min.js` — [three.js](https://threejs.org) r136，© three.js authors，MIT 许可证。原封不动地打包在内；其许可声明保留在文件中。

## 商标声明

Killing Floor 和 Unreal 是各自所有者（Tripwire Interactive 和 Epic Games）的商标。这是一个非官方的、粉丝制作的工具，与他们没有任何关联，也未获得他们的认可。它不附带任何游戏素材；它只读取你已经拥有的游戏副本中的文件。
