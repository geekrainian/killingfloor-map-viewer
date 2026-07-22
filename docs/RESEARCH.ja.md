# Killing Floor のマップフォーマット

[English](../RESEARCH.md) · [Русский](./RESEARCH.ru.md) · [Español](./RESEARCH.es.md) · [Português](./RESEARCH.pt.md) · [Lietuvių](./RESEARCH.lt.md) · [Polski](./RESEARCH.pl.md) · [Français](./RESEARCH.fr.md) · [中文](./RESEARCH.zh.md) · **日本語**

これは、Killing Floor のマップフォーマットをブラウザで描画できる程度まで解析したときの自分のノートです。KFEd（公式エディタ）でマップを開くことはできますが、飛び回って眺めたいだけなら重くて扱いにくいので、代わりに小さな WebGL ビューアを書きました。ここで扱うのはすべて Unreal Engine 2.5 です。マップは `.rom` パッケージ、テクスチャは `.utx`、スタティックメッシュは `.usx` で、すべて同じコンテナフォーマットです。

分かったことを手短にまとめると:

- レベルの BSP を描画する既存ツールは存在しません。umodel などは個々のアセット（メッシュ、テクスチャ）やエディタのソースブラシをエクスポートするだけで、実際にゲーム内で見えるコンパイル済みのワールドは出力しません。そのため、ワールドジオメトリは `Model` オブジェクトから自力で取り出す必要があります。
- 描画側は Counter-Strike / GoldSrc の BSP ビューアに近く、面から三角形を作り、テクスチャをアップロードし、カメラを飛ばすだけです。解析側はまったく別物です。GoldSrc は少数のフラットな lump の集まりですが、UE2.5 は name/import/export テーブルを持つオブジェクトパッケージで、BSP は `Model` オブジェクトの中にあります。
- 最終的にデコードした要素: パッケージテーブル、ワールドの `Model`（Vectors/Points/Nodes/Surfs/Verts）、テクスチャフォーマット（mip レイアウト、DXT1/3/5）、サーフェスのマテリアルが `.utx` まで解決される仕組み、スタティックメッシュとその配置、そしてハイトマップ地形。

## 1. すでにあるもの

### 参考: GoldSrc / CS 1.6 ビューア

GoldSrc BSP（バージョン 30）は 15 個の lump（entities、planes、vertices、nodes、texinfo、faces、edges、surfedges、models、textures、lighting…）からなる単純なコンテナです。描画の流れはこうです:

1. lump を解析する: ヘッダとディレクトリがあり、各 lump はバッファ上の型付き配列。
2. メッシュを組み立てる: 各面について surfedges をたどり（符号付きインデックス、`+`→edge.v0、`−`→edge.v1 を反転）、順序付きの頂点リングを得てから、ファン三角形分割する。
3. UV は保存されておらず、自分で計算する: `u = (dot(P, texinfo.vS) + shiftS) / width`、`v` も同様。
4. テクスチャは 8 ビットのパレット化された miptex（BSP 内か外部 WAD 内）で、インデックスを RGBA に展開する。
5. カメラは pointer-lock + WASD の noclip で、コリジョンなし。

読む価値のある Web ビューアは、`urgorri/goldsrc-bsp-viewer`（TypeScript + Three.js、WAD テクスチャ、アトラスライトマップ、完全な noclip）、`sbuggay/bspview`（最小限のパーサ + ジオメトリ + カメラ）、そして生の WebGL を使う `skyrim/hlviewer.js` / `x8BitRain/webhl` / `rein4ce/hlbsp` です。デスクトップ側では、Crafty（Nem's Tools）と newbspguy が「テクスチャ付きで自由飛行」の感触の良い参考になります。

流用できる有用な部分はパイプラインの形、つまり parser → geometry builder → texture decoder → renderer + camera という流れ（パーサはレンダラから独立させておく）と、pointer-lock + WASD カメラで、これは基本的に three.js のサンプルコントロールそのものです。

### Unreal / KF

umodel（Gildor's UE Viewer）は UT2004/KF のパッケージを読めますが、エクスポートするのはアセット、つまりスケルタルメッシュ・スタティックメッシュ・テクスチャ・アニメーションだけです。レベルの BSP や地形は再構築しません（ソースに `Model`/`Level` のパーサはありません）。UnrealEd や `ucc batchexport … T3D` は、コンパイル済みの BSP ではなくソースの CSG ブラシをテキスト（FPoly）で渡してくるだけで、それこそが自分が避けようとしていた重いエディタの経路です。UT4X-Converter や Blender の T3D インポータもブラシ/T3D レベルで動作します。というわけで、ゲームが実際に描画するジオメトリを表示するには、BSP リーダーは自作するしかありませんでした。

## 2. `.rom` フォーマット

以下のレイアウトは、実際に配布されているマップから直接読み取り、それが破綻しないことを確認して割り出しました。BSP については確認は簡単です。すべてのノードの平面は単位法線になるはず、すべてのサーフェスインデックスは範囲内に収まるはず、ノードから再構築したポリゴンはそのノードの平面上に平らに乗るはずです。公開されている UE2 のソースとフィールドを突き合わせられるところは突き合わせました。それらは末尾の参考文献にあります。`kfrom.js` はそのすべてを実装しており、ブラウザでも Node でも同じように動きます。

### 2.1 パッケージ

`.rom`/`.utx`/`.usx`/`.u` は UE2.5 パッケージです（`file_version 128 / licensee 29`、マジック `0x9E2A83C2`）。ヘッダの後に name/import/export テーブルが続きます。すべては *compact index* でインデックスされます（先頭バイト: ビット `0x80` = 符号、`0x40` = 継続、下位 6 ビット。継続バイトは `0x80` = 継続と 7 ビット）。オブジェクト参照もそのひとつで、`0` は null、`+n` は（このパッケージ内の）export `n−1`、`−n` は（別のパッケージ内の）import `−n−1` を指します。

### 2.2 ワールド BSP: `Model` オブジェクト

レベルジオメトリは、`LoadForServer` フラグの付いた最大の `Model` export です。小さい `Model` オブジェクトはエディタのソース CSG ブラシで、エンジンはプレイ時にそれらを読み込みません。ワールド Model のデータは次のように並んでいます:

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

v128 の `FBspNode` は通常の UE1/UE2 レイアウトに、Red Orchestra / KF ビルド固有と思われる末尾 12 バイトが加わったものです。この余分なバイトは、N 個のノードを解析してカーソルがちょうど `Surfs` のカウントに着地することを確認して見つけました:

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

v128 の `FBspSurf` も UE1 とは異なり、`PanU`/`PanV`/`Actor` の代わりにサーフェスの `Plane` と `ShadowMapScale` を格納します:

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

`FVert` は単に `pVertex`（POINTS への cidx）と `iSide`（cidx）だけです。

### 2.3 ポリゴンと UV

`Nodes` をたどり、`NumVertices ≥ 3` のものを残し、そのノードの surf と頂点のファン `Verts[iVertPool … +NumVertices]` を取り、それぞれを `Points[pVertex]` にマッピングして、ファン三角形分割します。UV は Unreal の平面投影を使い、これは GoldSrc の texinfo vS/vT と同じ考え方です:

```
Base = Points[surf.pBase];  Uax = Vectors[surf.vTextureU];  Vax = Vectors[surf.vTextureV];
for vertex P:  u = dot(P−Base, Uax) / Texture.USize ;  v = dot(P−Base, Vax) / Texture.VSize
```

ここは注意が必要です。`pBase` は **Points** を参照しますが、`vNormal/vTextureU/vTextureV` は **Vectors** を参照します。この 2 つは別のテーブルです。`PF_Invisible`、`PF_Portal`、`PF_FakeBackdrop` のフラグが付いたサーフェスはスキップします（最後のものは「sky window」サーフェスで、後述のスカイボックスの項で扱います）。

### 2.4 テクスチャ（`.utx`、同じパッケージフォーマット）

`Texture` オブジェクトはタグ付きプロパティブロック（`Format`、`USize`、`VSize`、`Palette` の参照、`bMasked`、`bAlphaTexture`…）の後に、ネイティブのトレーラ `Mips : TArray<FMipmap>` が続くものです。各 `FMipmap` は:

```
int  SkipPos          — lazy-array offset (present for ArVer>61); read and ignore
TArray<byte> Data     — cidx N + N bytes of pixel/block data
int  USize, int VSize
byte UBits, byte VBits
```

`Data` の長さ: DXT は `ceil(U/4)*ceil(V/4)*(8|16)`、P8/L8 は `U*V`、RGB8 は `U*V*3`、RGBA8 は `U*V*4`、G16（地形ハイトマップ）は `U*V*2` です。

`Format`（ETextureFormat、UE2）: `0=P8, 3=DXT1, 4=RGB8 (BGR on disk), 5=RGBA8 (BGRA on disk), 7=DXT3, 8=DXT5, 9=L8, 10=G16`。KF のテクスチャの大半は DXT1/3/5 で、デコードせずに `WEBGL_compressed_texture_s3tc` 経由でそのまま GPU に送れます。P8 には `UPalette`（256 個の `TArray<FColor>`、バイト順は RGBA。`bMasked` の場合はインデックス 0 が透明）が必要です。マスク付き DXT1 は 1 ビットのアルファを持つので、RGBA_DXT1 としてアップロードします。

### 2.5 サーフェスのマテリアルを `.utx` に解決する

`surf.Material` は import レコード `{ ObjectName, ClassName, Outer }` への符号付き参照です。`Outer` チェーンをたどってトップレベルのパッケージ（これがファイル名 `KillingFloorOfficeTextures.utx`）まで行きます。途中の名前はグループです（例えば `Carpet` はそのファイル内のグループ `OfficeCommon` にあります）。そのファイルを開き、その名前とテクスチャクラスを持つ export を探します。

マテリアルは生のテクスチャではなくラッパーであることがよくあります。`Shader`→`Diffuse`、`Combiner`→`Material1`、`FinalBlend`/`TexScaler`/`TexRotator`/`TexModifier`→`Material` といった具合に、最初の `Texture`/`BitmapMaterial` まで再帰的にたどります。ラッパーは単なるオブジェクト（プロパティブロック → オブジェクト参照）で、サーフェスのブレンドモードも保持しており、これは透明度にとって重要です（§3 を参照）。

### 2.6 スタティックメッシュ（`UStaticMesh`）と配置（`StaticMeshActor`）

CS 移植マップはジオメトリのほぼすべてをスタティックメッシュに入れており（BSP はスカイボックスだけ）、標準マップは BSP の上に何千もの `StaticMeshActor` を持つので、メッシュは省略できません。`UStaticMesh` のシリアライズ:

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

三角形は `IndexStream1` からセクションごとにグループ化して得られます（`FirstIndex … +NumFaces*3`）。セクション `i` は `Materials[i]` を使い、UV は頂点ごとの `UVStream[0]` で、すでに正規化されています。

`StaticMeshActor` レコードはタグ付きプロパティブロックですが、その前に `FStateFrame` が付いています（アクターが `RF_HasStack` を持つため）: `Node`(cidx)、`StateNode`(cidx)、`ProbeMask`(QWORD 8B)、`LatentAction`(INT 4B)、そして — `Node ≠ 0` のときだけ — `Offset` が **cidx** として続きます。この最後のひとつには一晩取られました。int32 として読むとすべてのアクターがずれてしまいます。フレームの後、タグ付きプロパティが `StaticMesh`（objref）、`Location`（Vector）、`Rotation`（Rotator、3×int32 で `rad = u·π/32768`）、`DrawScale`（float）、`DrawScale3D`（Vector）、`PrePivot`（Vector）、`bHidden` を与えます。ワールド変換は `Location + FRotationMatrix(Rotation) · (DrawScale·DrawScale3D ∘ (v − PrePivot))` です。

### 2.7 地形（`TerrainInfo`）

標準マップの多くでは、地面は BSP ではなくハイトマップ地形（`TerrainInfo` と複数の `TerrainSector`）です。`TerrainInfo` のプロパティは `TerrainMap`（G16 ハイトマップテクスチャ）、`TerrainScale`（Vector）、`Location`（Vector）、そしてベースの `Texture` とその `UScale`/`VScale` を持つ `Layers[0]` 構造体を与えます。グリッドの頂点は:

```
vertex(x,y): X = Location.X + (x − W/2)·scaleX ; Y = Location.Y + (y − H/2)·scaleY ;
             Z = Location.Z + (height16 − 32768)·scaleZ / 256
```

## 3. ビューアの描画方法

これは 1 つの自己完結した HTML ファイルと three.js（同梱されているので `file://` からオフラインで動作）で構成され、解析はすべて `kfrom.js` が行います。

- **入力。** ウィンドウに `.rom` をドラッグするか、ゲームフォルダから選びます。`.utx`/`.usx` パッケージはそのフォルダから遅延読み込みされ、見つからないものはスキップされるか単色で表示されます。
- **ジオメトリ。** `buildMesh`（BSP）、`readStaticMesh`/`readStaticMeshActors`（メッシュ）、`readTerrainInfo`/`buildTerrainMesh`（地形）が `THREE.BufferGeometry` を生成します。すべては X 軸周りに −90° 回転させた `mapRoot` の下で Unreal 座標のまま保たれ（Unreal は Z 上、three.js は Y 上）、メッシュインスタンスはアクター変換を行列として受け取ります。Unreal は左手系、three.js は右手系なので巻き順が反転します。これに抗うのではなく、すべてを両面で描画しています。
- **テクスチャ。** DXT の mip 0 はそのまま `THREE.CompressedTexture` になり、P8/RGBA8（まれ）は CPU 上で展開します。透明度はマテリアルのブレンドモードに従い、これはラッパーから得られます。加算と半透明（`FinalBlend.FrameBufferBlending`、`Shader.OutputBlending`）は GPU ブレンディングになり、切り抜き（`bMasked`、`FinalBlend.AlphaTest`、または `PF_Masked` サーフェス）はアルファテストになります。これによって、雨・ガラス・フェンス・草木が黒い四角ではなく正しく見えるようになります。
- **スカイボックス。** KF の空は、ゲームが `PF_FakeBackdrop` サーフェス越しに覗く別の小さな箱です。これを、重心が `SkyZoneInfo` アクターに最も近い BSP ゾーンとして見つけ（ノードのゾーンは `iZone` から得られます）、そのゾーンを独自のグループに引き出し、各フレームで SkyZoneInfo の点をカメラの下に保つことで、無限遠の背景として見えるようにします。プレースホルダの FakeBackdrop サーフェスはメインレベルから取り除き、本物の空が透けて見えるようにします。
- **ライティング。** デフォルトはオフ。ゲーム内の本物のライティングはベイク済みですが（§4 を参照）、近似として `Light`/`Spotlight` アクター（HSV の色、半径、明るさ）を読み、均一なグリッドに配置し、BSP と地形には安価な頂点ごとの合計をベイクし、メッシュにはインスタンスごとの色合いを加えます。
- **オーバーレイ。** `readActors(pkg, classes)` は、ステートフレームのスキップを再利用して、任意のアクタークラスをタグ付きプロパティ + Location として読みます。これがプレイヤー開始地点（`PlayerStart`）、トレーダーの位置（`KFTraderTeleporter`/`ShopVolume`/`WeaponLocker`/`KFTraderDoor`）、モンスターのパスノード（`PathNode`）の切り替え可能なマーカーを駆動し、深度テストをオフにして描画するので壁越しでも見えたままになります。
- **カメラ。** 小さな pointer-lock + WASD 飛行コントロールとリセットボタンを備えた、素の透視投影カメラです。

## 4. 粗い部分 / TODO

- **ゲーム内の正確なライティング。** 近似的なライトは `Light` アクター由来ですが、本物の見た目はマップにベイクされています。BSP のライトマップは `Model` トレーラ（`LightMap`/`LightBits`、ここはスキップしています）にあり、インスタンスごとのメッシュライティングは `StaticMeshInstance` オブジェクトにあります。どちらもまだデコードしておらず、v128 の Model トレーラは正規のレイアウトではないので、node/surf のレイアウトと同じリバースエンジニアリングが必要です。
- **空のメッシュ。** マップが空を BSP の箱ではなくスタティックメッシュ（太陽のスプライト、雲の平面）で作っている場合、それらはまだ空のグループに移動されません。
- **地形レイヤー。** テクスチャが貼られるのはベースレイヤーだけで、複数レイヤーのアルファブレンディングやデコレイヤー（草/ディテールメッシュ）は未対応です。
- **フェンス風マスク。** *別個の* 不透明度テクスチャを持つ `Shader` は、今のところディフューズ自身のアルファを使っています。不透明度テクスチャを `alphaMap` として組み込めば、それらを適切に切り抜けるようになります。
- **パフォーマンス。** 大きなマップはアクターごとに 1 メッシュを描画するので、ドローコールが多くなります。問題になり始めたら、インスタンシングやマージが助けになります。

## ファイル

| ファイル | 内容 |
|------|-----------|
| `kfrom.js` | 中核: UE2.5 パッケージの解析、ワールド BSP、スタティックメッシュ、地形、テクスチャ。ブラウザと Node で動作。 |
| `viewer.html` | ビューア: three.js + 小さな pointer-lock/WASD 飛行カメラ。 |
| `cli.js` | 小さな Node CLI: ジオメトリ統計と OBJ エクスポート。 |
| `vendor/three.min.js` | three.js r136（MIT）、ビューアがオフラインで動くよう同梱。 |

```bash
node cli.js <map.rom>            # package version, geometry counts, referenced texture packages
node cli.js <map.rom> out.obj    # + export the BSP as OBJ (opens in Blender / Windows 3D Viewer)
```

## 参考文献

- GoldSrc の描画に関する参考: `urgorri/goldsrc-bsp-viewer`、`sbuggay/bspview`、`x8BitRain/webhl`。
- UE2 の構造体とシリアライズ: `stephank/surreal`（`Engine/Inc/UnModel.h`、`UnObj.h`）、`RedPandaProjects/UnrealEngine`、`EliotVU/Unreal-Library`。
- UE2 のテクスチャとメッシュ: `gildor2/UEViewer`（`Unreal/UnrealMaterial/UnMaterial2.*`、`Unreal/UnrealMesh/UnMesh2.*`、タグ付きプロパティとステートフレームについては `Unreal/UnObject.cpp`）、そして Eliot Van Uytfanghe によるパッケージフォーマットの解説 `eliotvu.com/page/unreal-package-file-format`。
- umodel がレベルを扱わないことの確認: umodel 自身の `Docs/FAQ.md`。
