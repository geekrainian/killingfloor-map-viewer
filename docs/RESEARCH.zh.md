# Killing Floor 地图格式

[English](../RESEARCH.md) · [Русский](./RESEARCH.ru.md) · [Español](./RESEARCH.es.md) · [Português](./RESEARCH.pt.md) · [Lietuvių](./RESEARCH.lt.md) · [Polski](./RESEARCH.pl.md) · [Français](./RESEARCH.fr.md) · **中文** · [日本語](./RESEARCH.ja.md)

这是我在把 Killing Floor 地图格式逆向到足以在浏览器里画出来的过程中记下的笔记。KFEd（官方编辑器）能打开一张地图，但如果你只是想飞进去看看，它又重又笨，所以我干脆写了一个小小的 WebGL 查看器。这里的一切都是 Unreal Engine 2.5：地图是 `.rom` 包，贴图是 `.utx`，静态网格是 `.usx`，全都是同一种容器格式。

我发现的东西，简短版：

- 没有现成工具会画关卡 BSP。umodel 之类都是导出单个资源（网格、贴图）或者编辑器的源笔刷，而不是你在游戏里真正看到的那个编译后的世界，所以世界几何体必须从 `Model` 对象里手工抠出来。
- 渲染这一侧跟 Counter-Strike / GoldSrc 的 BSP 查看器很接近：从面构建三角形、上传贴图、飞动摄像机。解析这一侧则完全不是一回事。GoldSrc 是寥寥几个扁平的 lump；UE2.5 是一个带 name/import/export 表的对象包，而 BSP 就藏在一个 `Model` 对象里。
- 我最后解出来的几块：包的那几张表、世界 `Model`（Vectors/Points/Nodes/Surfs/Verts）、贴图格式（mip 布局、DXT1/3/5）、一个表面的材质如何一路解析到某个 `.utx`、静态网格及其摆放位置、还有高度图地形。

## 1. 现成的东西有哪些

### GoldSrc / CS 1.6 查看器，作为参考

GoldSrc BSP（version 30）是一个简单的容器，包含 15 个 lump（entities、planes、vertices、nodes、texinfo、faces、edges、surfedges、models、textures、lighting……）。渲染它的流程是：

1. 解析 lump：一个 header 加一个目录，每个 lump 都是缓冲区上的一个类型化数组。
2. 组装网格：对每个 face，沿着它的 surfedges 走（有符号索引，`+`→edge.v0，`−`→edge.v1 反向），得到一圈有序的顶点，然后扇形三角化。
3. UV 没有存储，需要自己算：`u = (dot(P, texinfo.vS) + shiftS) / width`，`v` 同理。
4. 贴图是 8 位调色板 miptex（在 BSP 里或在外部 WAD 里），把索引展开成 RGBA。
5. 摄像机是 pointer-lock 加 WASD 的 noclip，没有碰撞。

值得一读的 web 查看器有 `urgorri/goldsrc-bsp-viewer`（TypeScript + Three.js，WAD 贴图、图集 lightmap、完整 noclip）、`sbuggay/bspview`（一个精简的解析器 + 几何体 + 摄像机），以及跑在裸 WebGL 上的 `skyrim/hlviewer.js` / `x8BitRain/webhl` / `rein4ce/hlbsp`。桌面这边，Crafty（Nem's Tools）和 newbspguy 是“带贴图、自由飞行”那种手感的好参考。

能沿用过来的有用之处是整个管线的形状——parser → geometry builder → texture decoder → renderer + camera，并且让 parser 独立于 renderer——以及 pointer-lock + WASD 摄像机，那基本上就是 three.js 示例里的那个控件。

### Unreal / KF

umodel（Gildor's UE Viewer）能读 UT2004/KF 包，但它只导出资源：骨骼网格和静态网格、贴图、动画。它不会重建关卡 BSP 或地形（它的源码里没有 `Model`/`Level` 解析器）。UnrealEd 以及 `ucc batchexport … T3D` 给你的是文本形式的源 CSG 笔刷（FPoly），而不是编译后的 BSP，而这恰恰是我想绕开的那条笨重编辑器路线。UT4X-Converter 和 Blender 的 T3D 导入器同样工作在笔刷/T3D 这一层。所以要显示游戏真正渲染的几何体，BSP 读取器只能自己写。

## 2. `.rom` 格式

下面这些布局是我照着已发行的地图一点点读出来、并检验它们站得住脚才定下来的。对 BSP 来说检验很容易：每个 node 平面都应当算出一个单位法线，每个 surface 索引都应当落在有效范围内，而你为某个 node 重建出来的多边形应当平摊在那个 node 的平面上。凡是能拿字段跟公开的 UE2 源码交叉验证的地方我都做了；那些都列在最后的参考里。`kfrom.js` 实现了全部内容，并且在浏览器和 Node 里跑法一致。

### 2.1 Package

`.rom`/`.utx`/`.usx`/`.u` 都是 UE2.5 包（`file_version 128 / licensee 29`，magic `0x9E2A83C2`）。先是 header，然后是 name/import/export 表。所有东西都用一个 *compact index* 来索引（第一个字节：bit `0x80` = 符号，`0x40` = 继续，低 6 位；后续字节 `0x80` = 继续再加 7 位）。一个对象引用就是这种索引之一：`0` 是 null，`+n` 是本包内的 export `n−1`，`−n` 是（某个其他包里的）import `−n−1`。

### 2.2 世界 BSP：`Model` 对象

关卡几何体是那个最大的、带 `LoadForServer` 标记的 `Model` export。那些小的 `Model` 对象是编辑器的源 CSG 笔刷，引擎在游戏运行时根本不会加载它们。世界 Model 的数据布局是这样的：

```
[UObject]     1 byte  — property block; for a UModel just the "None" terminator name
[UPrimitive]  25 bytes — FBox BoundingBox (Min FVector, Max FVector, byte IsValid)
              16 bytes — FSphere BoundingSphere (FVector center, float radius)
Vectors : TArray<FVector>   — axes/normals (cidx N, then N×12B)
Points  : TArray<FVector>   — world vertices (cidx N, then N×12B)
Nodes   : TArray<FBspNode>
Surfs   : TArray<FBspSurf>
Verts   : TArray<FVert>
… (NumSharedSides, Polys ref, LightMap, Bounds, Leaves, Lights, Zones…) — not needed to draw the
  map; the object's end is known from the export table, so I stop after Verts.
```

v128 里的 `FBspNode` 是常见的 UE1/UE2 布局，外加 12 个尾部字节，那些似乎是 Red Orchestra / KF 版本特有的。我发现这些多出来的字节的办法是：解析 N 个 node，检查游标是否恰好落在 `Surfs` 计数上：

```
Plane            FPlane  16B   (X,Y,Z,W)  — unit normal + W
ZoneMask         QWORD    8B
NodeFlags        BYTE     1B
iVertPool        cidx           — index of this node's first Vert in Verts
iSurf            cidx           — index into Surfs
iBack,iFront,iPlane        cidx×3
iCollisionBound,iRenderBound cidx×2
ExclusiveSphereBound FSphere 16B  (RO/KF: the node carries its own bounding sphere)
iZone[0],iZone[1] BYTE×2
NumVertices      BYTE           — polygon vertex count (0 = a split-only node)
iLeaf[0],iLeaf[1] INT×2   8B
<12 bytes>       3×INT          — extra RO/KF node fields, unused for rendering
```

v128 里的 `FBspSurf` 也跟 UE1 不同：它不存 `PanU`/`PanV`/`Actor`，而是存表面的 `Plane` 和一个 `ShadowMapScale`：

```
Material   object-ref (cidx)  — UTexture/Shader/Combiner/…; +export embedded / −import in a .utx
PolyFlags  DWORD 4B           — PF_Masked(0x2), PF_Translucent(0x4), PF_Modulated(0x40),
                                PF_FakeBackdrop(0x80), PF_TwoSided(0x100), PF_Portal(0x4000000)…
pBase      cidx               — index into POINTS: where (U,V)=(0,0)
vNormal    cidx               — index into VECTORS: normal
vTextureU  cidx               — index into VECTORS: U axis (texels/unit)
vTextureV  cidx               — index into VECTORS: V axis
iLightMap,iBrushPoly  cidx×2
Plane      FPlane 16B
ShadowMapScale FLOAT 4B (usually 32.0)
```

`FVert` 就只是 `pVertex`（指向 POINTS 的 cidx）和 `iSide`（cidx）。

### 2.3 多边形和 UV

遍历 `Nodes`，留下那些 `NumVertices ≥ 3` 的，取这个 node 的 surf 和它那一扇 vert `Verts[iVertPool … +NumVertices]`，把每个映射到 `Points[pVertex]`，然后扇形三角化。UV 用的是 Unreal 的平面投影，跟 GoldSrc 的 texinfo vS/vT 是同一个思路：

```
Base = Points[surf.pBase];  Uax = Vectors[surf.vTextureU];  Vax = Vectors[surf.vTextureV];
for vertex P:  u = dot(P−Base, Uax) / Texture.USize ;  v = dot(P−Base, Vax) / Texture.VSize
```

这里要小心：`pBase` 索引的是 **Points**，而 `vNormal/vTextureU/vTextureV` 索引的是 **Vectors**——是两张不同的表。我会跳过标记了 `PF_Invisible`、`PF_Portal` 或 `PF_FakeBackdrop` 的表面（最后这种就是“天空窗口”表面，下文天空盒部分会讲）。

### 2.4 贴图（`.utx`，同样的包格式）

一个 `Texture` 对象是一个带标签的 property block（`Format`、`USize`、`VSize`、`Palette` 引用、`bMasked`、`bAlphaTexture`……），后面跟着一段原生 trailer，`Mips : TArray<FMipmap>`。每个 `FMipmap`：

```
int  SkipPos          — lazy-array offset (present for ArVer>61); read and ignore
TArray<byte> Data     — cidx N + N bytes of pixel/block data
int  USize, int VSize
byte UBits, byte VBits
```

`Data` 长度：DXT 是 `ceil(U/4)*ceil(V/4)*(8|16)`；P8/L8 是 `U*V`；RGB8 是 `U*V*3`；RGBA8 是 `U*V*4`；G16（地形高度图）是 `U*V*2`。

`Format`（ETextureFormat，UE2）：`0=P8, 3=DXT1, 4=RGB8 (BGR on disk), 5=RGBA8 (BGRA on disk), 7=DXT3, 8=DXT5, 9=L8, 10=G16`。KF 的大多数贴图是 DXT1/3/5，它们经由 `WEBGL_compressed_texture_s3tc` 直接进 GPU，无需解码。P8 需要一个 `UPalette`（256 个的 `TArray<FColor>`，字节序为 RGBA；带 `bMasked` 时索引 0 为透明）。带 mask 的 DXT1 携带 1 位 alpha，所以它以 RGBA_DXT1 的形式上传。

### 2.5 把一个表面的材质解析到某个 `.utx`

`surf.Material` 是一个指向 import 记录 `{ ObjectName, ClassName, Outer }` 的有符号引用。沿着 `Outer` 链一路走到顶层的 package，那就是文件名（`KillingFloorOfficeTextures.utx`）；中间那些名字是 group（比如 `Carpet` 位于该文件内的 `OfficeCommon` group 里）。打开那个文件，找到那个名字且类为贴图类的 export。

材质往往是一层包装器，而不是原始贴图：`Shader`→`Diffuse`、`Combiner`→`Material1`、`FinalBlend`/`TexScaler`/`TexRotator`/`TexModifier`→`Material`，如此这般，一路递归下去直到第一个 `Texture`/`BitmapMaterial`。这些包装器是普通对象（property block → 对象引用），它们还携带着表面的 blend mode，这对透明度很重要（见 §3）。

### 2.6 静态网格（`UStaticMesh`）和摆放（`StaticMeshActor`）

CS 移植地图几乎把它们全部的几何体都放进了静态网格（BSP 只是个天空盒），而原版地图会在 BSP 之上带着成千上万个 `StaticMeshActor`，所以网格不是可有可无的。`UStaticMesh` 的序列化：

```
[UObject] property block  — carries the tagged Materials array (each = {Material objref, EnableCollision})
[UPrimitive] FBox(25) + FSphere(16)
Sections   : TArray<FStaticMeshSection>  — 14B each: int32, u16 FirstIndex, u16 FirstVertex,
                                            u16 LastVertex, u16, u16 NumFaces
FBox(25) again
VertexStream : TArray<FStaticMeshVertex(24: Pos FVector + Normal FVector)> + int32 Revision
ColorStream, AlphaStream : TArray<FColor(4)> + int32 (usually empty)
UVStream : TArray<{ TArray<FMeshUVFloat(8: U,V, already normalized)> + int32 + int32 }>
IndexStream1 : TArray<u16> + int32   — the triangle list, 16-bit
… (IndexStream2, collision) — ignored
```

三角形来自 `IndexStream1`，按 section 分组（`FirstIndex … +NumFaces*3`）；section `i` 使用 `Materials[i]`；UV 是每个顶点的 `UVStream[0]`，已经归一化。

一条 `StaticMeshActor` 记录是一个带标签的 property block，但它前面还有一个 `FStateFrame`（该 actor 带 `RF_HasStack`）：`Node`(cidx)、`StateNode`(cidx)、`ProbeMask`(QWORD 8B)、`LatentAction`(INT 4B)，以及——仅当 `Node ≠ 0` 时——作为 **cidx** 的 `Offset`。最后这个坑了我一晚上：把它当 int32 读会让每一个 actor 都错位。frame 之后，那些带标签的属性给出 `StaticMesh`（objref）、`Location`（Vector）、`Rotation`（Rotator，3×int32，`rad = u·π/32768`）、`DrawScale`（float）、`DrawScale3D`（Vector）、`PrePivot`（Vector）、`bHidden`。世界变换是 `Location + FRotationMatrix(Rotation) · (DrawScale·DrawScale3D ∘ (v − PrePivot))`。

### 2.7 地形（`TerrainInfo`）

在很多原版地图上，地面是高度图地形（`TerrainInfo` 加上一堆 `TerrainSector`），而不是 BSP。`TerrainInfo` 的属性给出 `TerrainMap`（一张 G16 高度图贴图）、`TerrainScale`（Vector）、`Location`（Vector），以及一个带基础 `Texture` 和它的 `UScale`/`VScale` 的 `Layers[0]` 结构。网格顶点是：

```
vertex(x,y): X = Location.X + (x − W/2)·scaleX ; Y = Location.Y + (y − H/2)·scaleY ;
             Z = Location.Z + (height16 − 32768)·scaleZ / 256
```

## 3. 查看器如何绘制它

它是一个自包含的 HTML 文件，加上 Three.js（内置，所以能从 `file://` 离线运行），由 `kfrom.js` 完成全部解析。

- **输入。** 把一个 `.rom` 拖到窗口里，或者从游戏文件夹里选一个。`.utx`/`.usx` 包会从那个文件夹里惰性加载；任何缺失的东西都会被跳过或以纯色显示。
- **几何体。** `buildMesh`（BSP）、`readStaticMesh`/`readStaticMeshActors`（网格）、以及 `readTerrainInfo`/`buildTerrainMesh`（地形）生成 `THREE.BufferGeometry`。所有东西都停留在 Unreal 坐标系里，位于一个绕 X 轴旋转了 −90° 的 `mapRoot` 之下（Unreal 是 Z 朝上，three.js 是 Y 朝上）；网格实例把 actor 的变换作为自己的矩阵。Unreal 是左手系而 three.js 是右手系，所以绕序会翻转——我干脆把所有东西都双面绘制，而不是去跟它较劲。
- **贴图。** DXT 的 mip 0 直接进 `THREE.CompressedTexture`；P8/RGBA8（少见）在 CPU 上展开。透明度遵循材质的 blend mode，它来自包装器：additive 和 translucent（`FinalBlend.FrameBufferBlending`、`Shader.OutputBlending`）走 GPU 混合，镂空（`bMasked`、`FinalBlend.AlphaTest`、或者一个 `PF_Masked` 表面）走 alpha 测试。正是这一点让雨水、玻璃、栅栏和植被看起来是对的，而不是显示成一个黑框。
- **天空盒。** KF 的天空是一个独立的小盒子，游戏通过那些 `PF_FakeBackdrop` 表面往里看。我把它找出来的办法是：取那个质心离 `SkyZoneInfo` actor 最近的 BSP 区域（node 的区域来自 `iZone`），把那个区域拉进它自己的 group，并且每一帧都让 SkyZoneInfo 那个点保持在摄像机下方，好让它读起来像一个无限远的背景。那些占位的 FakeBackdrop 表面会从主关卡里去掉，好让真正的天空透出来。
- **光照。** 默认关闭。游戏里真正的光照是烘焙的（见 §4），但作为一种近似，我读取 `Light`/`Spotlight` actor（HSV 颜色、半径、亮度），把它们放进一个均匀网格里，然后把一个廉价的逐顶点求和烘焙进 BSP 和地形，再加上网格上的逐实例 tint。
- **叠加显示。** `readActors(pkg, classes)` 把任意 actor 类读作带标签的属性 + Location，复用了那个 state-frame 的跳过逻辑。它驱动着可切换的标记：玩家出生点（`PlayerStart`）、商人点位（`KFTraderTeleporter`/`ShopVolume`/`WeaponLocker`/`KFTraderDoor`）以及怪物寻路节点（`PathNode`），绘制时关掉深度测试，好让它们透过墙壁也保持可见。
- **摄像机。** 一个普通的透视摄像机，加上一个小巧的 pointer-lock + WASD 飞行控件和一个重置按钮。

## 4. 粗糙之处 / TODO

- **精确的游戏内光照。** 那套近似光照来自 `Light` actor；真正的观感是烘焙进地图里的。BSP 的 lightmap 位于 `Model` trailer 里（`LightMap`/`LightBits`，我跳过了它们），而逐实例的网格光照在 `StaticMeshInstance` 对象里。两者都还没解码，而且 v128 的 Model trailer 并不是那个规范布局，所以它需要跟 node/surf 布局一样的逆向工程。
- **天空网格。** 如果一张地图是用静态网格（一个太阳 sprite、几片云平面）而不是一个 BSP 盒子来搭它的天空，那些还没被移进天空 group 里。
- **地形图层。** 只有基础层有贴图；多层 alpha 混合和装饰层（草/细节网格）都还没做。
- **栅栏式的 mask。** 一个带有*独立*不透明度贴图的 `Shader` 目前用的是漫反射自己的 alpha；把那张不透明度贴图接进来当 `alphaMap` 能把它们正确镂空。
- **性能。** 大地图是每个 actor 画一个网格，所以有很多 draw call。如果这开始变得要紧，用 instancing 或者合并会有帮助。

## 文件

| 文件 | 是什么 |
|------|-----------|
| `kfrom.js` | 核心：UE2.5 包解析、世界 BSP、静态网格、地形、贴图。在浏览器和 Node 里都能跑。 |
| `viewer.html` | 查看器：Three.js + 一个小巧的 pointer-lock/WASD 飞行摄像机。 |
| `cli.js` | 一个小巧的 Node CLI：几何体统计和 OBJ 导出。 |
| `vendor/three.min.js` | Three.js r136（MIT），内置打包，让查看器可以离线工作。 |

```bash
node cli.js <map.rom>            # package version, geometry counts, referenced texture packages
node cli.js <map.rom> out.obj    # + export the BSP as OBJ (opens in Blender / Windows 3D Viewer)
```

## 参考

- GoldSrc 渲染参考：`urgorri/goldsrc-bsp-viewer`、`sbuggay/bspview`、`x8BitRain/webhl`。
- UE2 结构和序列化：`stephank/surreal`（`Engine/Inc/UnModel.h`、`UnObj.h`）、`RedPandaProjects/UnrealEngine`、`EliotVU/Unreal-Library`。
- UE2 贴图和网格：`gildor2/UEViewer`（`Unreal/UnrealMaterial/UnMaterial2.*`、`Unreal/UnrealMesh/UnMesh2.*`，以及负责带标签属性和 state frame 的 `Unreal/UnObject.cpp`），加上 Eliot Van Uytfanghe 在 `eliotvu.com/page/unreal-package-file-format` 的包格式详解。
- 关于 umodel 不处理关卡的确认：它自己的 `Docs/FAQ.md`。
