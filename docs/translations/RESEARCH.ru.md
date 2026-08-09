# Формат игровых карт Killing Floor

[English](../RESEARCH.md) · **Русский** · [Español](./RESEARCH.es.md) · [Português](./RESEARCH.pt.md) · [Lietuvių](./RESEARCH.lt.md) · [Polski](./RESEARCH.pl.md) · [Français](./RESEARCH.fr.md) · [中文](./RESEARCH.zh.md) · [日本語](./RESEARCH.ja.md)

Это мои заметки о том, как я разбирал формат карт Killing Floor — ровно настолько, чтобы нарисовать их в браузере. KFEd (официальный редактор) карту открыть умеет, но он тяжёлый и неуклюжий, если всё, что тебе нужно, — это полетать и посмотреть, поэтому я вместо него написал небольшой WebGL-просмотрщик. Всё здесь — Unreal Engine 2.5: карты это пакеты `.rom`, текстуры — `.utx`, статик-меши — `.usx`, всё один и тот же контейнерный формат.

Коротко о том, что я выяснил:

- Ни один существующий инструмент не рисует BSP уровня. umodel и остальные экспортируют отдельные ассеты (меши, текстуры) или исходные браши редактора, а не собранный мир, который ты видишь в игре, так что геометрию мира приходится вытаскивать из объекта `Model` вручную.
- Сторона рендеринга близка к просмотрщику BSP Counter-Strike / GoldSrc: строим треугольники из граней, грузим текстуры, летаем камерой. А вот сторона разбора не похожа совсем. GoldSrc — это горстка плоских lump'ов; UE2.5 — это объектный пакет с таблицами name/import/export, а BSP лежит внутри объекта `Model`.
- Что в итоге пришлось декодировать: таблицы пакета, мировой `Model` (Vectors/Points/Nodes/Surfs/Verts), формат текстур (раскладка мипов, DXT1/3/5), как материал поверхности резолвится до `.utx`, статик-меши и их расстановку, и хайтмап-террейн.

## 1. Что уже есть

### Просмотрщики GoldSrc / CS 1.6, для сравнения

BSP GoldSrc (версия 30) — простой контейнер из 15 lump'ов (entities, planes, vertices, nodes, texinfo, faces, edges, surfedges, models, textures, lighting…). Рендер одного идёт так:

1. Разобрать lump'ы: заголовок плюс директория, каждый lump — типизированный массив поверх буфера.
2. Собрать меш: для каждой грани обойти её surfedges (знаковый индекс, `+`→edge.v0, `−`→edge.v1 в обратном порядке), получить упорядоченное кольцо вершин, затем fan-триангуляция.
3. UV не хранятся, ты их вычисляешь: `u = (dot(P, texinfo.vS) + shiftS) / width`, аналогично для `v`.
4. Текстуры — 8-битные палитровые miptex (в BSP или во внешнем WAD), разворачиваются index→RGBA.
5. Камера — pointer-lock плюс WASD noclip, без коллизий.

Веб-просмотрщики, которые стоит почитать: `urgorri/goldsrc-bsp-viewer` (TypeScript + Three.js, WAD-текстуры, атласные лайтмапы, полный noclip), `sbuggay/bspview` (минимальный парсер + геометрия + камера) и `skyrim/hlviewer.js` / `x8BitRain/webhl` / `rein4ce/hlbsp` на голом WebGL. Из десктопных — Crafty (Nem's Tools) и newbspguy хорошие референсы по ощущению «текстуры, свободный полёт».

Что реально переносится — это форма конвейера: parser → сборщик геометрии → декодер текстур → рендерер + камера, где парсер держится независимо от рендерера, — и pointer-lock + WASD камера, которая по сути тот самый пример-контрол из three.js.

### Unreal / KF

umodel (Gildor's UE Viewer) читает пакеты UT2004/KF, но экспортирует только ассеты: скелетные и статик-меши, текстуры, анимации. Он не восстанавливает BSP уровня или террейн (парсера `Model`/`Level` в его исходниках нет). UnrealEd и `ucc batchexport … T3D` отдают тебе исходные CSG-браши текстом (FPoly), а не собранный BSP, и это ровно тот тяжёлый путь через редактор, который я пытался обойти. UT4X-Converter и импортёры T3D для Blender тоже работают на уровне брашей/T3D. Так что чтобы показать геометрию, которую игра реально рендерит, ридер BSP пришлось написать свой.

## 2. Формат `.rom`

Раскладки ниже я вывел, читая их прямо с поставляемых карт и проверяя, что они сходятся. Для BSP проверка простая: каждая плоскость нода должна выходить единичной нормалью, каждый индекс поверхности — попадать в диапазон, а полигон, восстановленный для нода, — лежать плоско на плоскости этого нода. Где мог сверить поле с публичными исходниками UE2 — сверял; ссылки в конце. `kfrom.js` реализует всё это и работает одинаково в браузере и в Node.

### 2.1 Пакет

`.rom`/`.utx`/`.usx`/`.u` — это пакеты UE2.5 (`file_version 128 / licensee 29`, magic `0x9E2A83C2`). Заголовок, затем таблицы name/import/export. Всё индексируется *компактным индексом* (первый байт: бит `0x80` = знак, `0x40` = продолжение, младшие 6 бит; байты продолжения `0x80` = продолжение плюс 7 бит). Ссылка на объект — один из таких индексов: `0` — null, `+n` — export `n−1` (в этом пакете), `−n` — import `−n−1` (в каком-то другом пакете).

### 2.2 Мировой BSP: объект `Model`

Геометрия уровня — это самый большой export `Model` с флагом `LoadForServer`. Мелкие объекты `Model` — это исходные CSG-браши редактора, и движок никогда не грузит их во время игры. Данные мирового Model лежат так:

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

`FBspNode` в v128 — это обычная раскладка UE1/UE2 плюс 12 хвостовых байт, которые, похоже, специфичны для сборки Red Orchestra / KF. Я нашёл эти лишние байты, разобрав N нодов и проверив, что курсор встаёт ровно на счётчик `Surfs`:

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

`FBspSurf` в v128 тоже отличается от UE1: вместо `PanU`/`PanV`/`Actor` он хранит `Plane` поверхности и `ShadowMapScale`:

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

`FVert` — это просто `pVertex` (cidx в POINTS) и `iSide` (cidx).

### 2.3 Полигоны и UV

Идём по `Nodes`, оставляем те, у кого `NumVertices ≥ 3`, берём surf нода и его веер вершин `Verts[iVertPool … +NumVertices]`, отображаем каждую в `Points[pVertex]` и делаем fan-триангуляцию. UV используют планарную проекцию Unreal — та же идея, что texinfo vS/vT в GoldSrc:

```
Base = Points[surf.pBase];  Uax = Vectors[surf.vTextureU];  Vax = Vectors[surf.vTextureV];
for vertex P:  u = dot(P−Base, Uax) / Texture.USize ;  v = dot(P−Base, Vax) / Texture.VSize
```

Осторожно: `pBase` индексирует **Points**, а `vNormal/vTextureU/vTextureV` индексируют **Vectors** — это две разные таблицы. Поверхности с флагами `PF_Invisible`, `PF_Portal` или `PF_FakeBackdrop` я пропускаю (последние — поверхности «окна в небо», о них ниже, в разделе про скайбокс).

### 2.4 Текстуры (`.utx`, тот же формат пакета)

Объект `Texture` — это блок тегированных свойств (`Format`, `USize`, `VSize`, ссылка `Palette`, `bMasked`, `bAlphaTexture`…), за которым идёт нативный трейлер `Mips : TArray<FMipmap>`. Каждый `FMipmap`:

```
int  SkipPos          — lazy-array offset (present for ArVer>61); read and ignore
TArray<byte> Data     — cidx N + N bytes of pixel/block data
int  USize, int VSize
byte UBits, byte VBits
```

Длина `Data`: для DXT — `ceil(U/4)*ceil(V/4)*(8|16)`; для P8/L8 — `U*V`; для RGB8 — `U*V*3`; для RGBA8 — `U*V*4`; для G16 (хайтмапы террейна) — `U*V*2`.

`Format` (ETextureFormat, UE2): `0=P8, 3=DXT1, 4=RGB8 (BGR on disk), 5=RGBA8 (BGRA on disk), 7=DXT3, 8=DXT5, 9=L8, 10=G16`. Большинство текстур KF — DXT1/3/5, они идут прямо в GPU через `WEBGL_compressed_texture_s3tc` без декодирования. P8 требует `UPalette` (`TArray<FColor>` из 256, порядок байт RGBA; при `bMasked` индекс 0 прозрачный). Маскированный DXT1 несёт 1-битную альфу, так что грузится как RGBA_DXT1.

### 2.5 Резолвинг материала поверхности до `.utx`

`surf.Material` — это знаковая ссылка на import-запись `{ ObjectName, ClassName, Outer }`. Идём по цепочке `Outer` до пакета верхнего уровня — это и есть имя файла (`KillingFloorOfficeTextures.utx`); промежуточные имена — это группы (например, `Carpet` лежит в группе `OfficeCommon` внутри этого файла). Открываем файл, находим export с этим именем и классом текстуры.

Материал часто оказывается обёрткой, а не сырой текстурой: `Shader`→`Diffuse`, `Combiner`→`Material1`, `FinalBlend`/`TexScaler`/`TexRotator`/`TexModifier`→`Material` и так далее, спускаясь до первой `Texture`/`BitmapMaterial`. Обёртки — это обычные объекты (блок свойств → ссылки на объекты), и они же несут blend-режим поверхности, что важно для прозрачности (см. §3).

### 2.6 Статик-меши (`UStaticMesh`) и расстановка (`StaticMeshActor`)

CS-порты кладут почти всю геометрию в статик-меши (BSP у них — просто скайбокс), а стоковые карты несут тысячи `StaticMeshActor`'ов поверх BSP, так что меши не опциональны. Сериализация `UStaticMesh`:

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

Треугольники берутся из `IndexStream1`, сгруппированного по секциям (`FirstIndex … +NumFaces*3`); секция `i` использует `Materials[i]`; UV берутся из `UVStream[0]` на вершину, уже нормализованные.

Запись `StaticMeshActor` — это блок тегированных свойств, но перед ним идёт `FStateFrame` (у актора есть `RF_HasStack`): `Node`(cidx), `StateNode`(cidx), `ProbeMask`(QWORD 8B), `LatentAction`(INT 4B) и — только если `Node ≠ 0` — `Offset` как **cidx**. Вот это последнее стоило мне вечера: если читать его как int32, рассинхронизируется каждый актор. После фрейма тегированные свойства дают `StaticMesh` (objref), `Location` (Vector), `Rotation` (Rotator, 3×int32 с `rad = u·π/32768`), `DrawScale` (float), `DrawScale3D` (Vector), `PrePivot` (Vector), `bHidden`. Мировая трансформация: `Location + FRotationMatrix(Rotation) · (DrawScale·DrawScale3D ∘ (v − PrePivot))`.

### 2.7 Террейн (`TerrainInfo`)

На многих стоковых картах земля — это хайтмап-террейн (`TerrainInfo` плюс `TerrainSector`'ы), а не BSP. Свойства `TerrainInfo` дают `TerrainMap` (текстуру-хайтмап G16), `TerrainScale` (Vector), `Location` (Vector) и структуру `Layers[0]` с базовой `Texture` и её `UScale`/`VScale`. Вершины сетки:

```
vertex(x,y): X = Location.X + (x − W/2)·scaleX ; Y = Location.Y + (y − H/2)·scaleY ;
             Z = Location.Z + (height16 − 32768)·scaleZ / 256
```

## 3. Как просмотрщик это рисует

Это один самодостаточный HTML-файл плюс Three.js (вложен, так что работает офлайн из `file://`), а весь разбор делает `kfrom.js`.

- **Ввод.** Перетащи `.rom` в окно или выбери из папки игры. Пакеты `.utx`/`.usx` грузятся из этой папки лениво; чего нет — пропускается или показывается плоским цветом.
- **Геометрия.** `buildMesh` (BSP), `readStaticMesh`/`readStaticMeshActors` (меши) и `readTerrainInfo`/`buildTerrainMesh` (террейн) выдают `THREE.BufferGeometry`. Всё остаётся в координатах Unreal под `mapRoot`, повёрнутым на −90° вокруг X (Unreal — Z-up, three.js — Y-up); инстансам мешей их трансформ актора кладётся матрицей. Unreal левосторонний, three.js правосторонний, поэтому winding переворачивается — я рисую всё двусторонним, а не борюсь с этим.
- **Текстуры.** DXT mip 0 идёт прямо в `THREE.CompressedTexture`; P8/RGBA8 (редко) разворачиваются на CPU. Прозрачность следует blend-режиму материала, который берётся из обёртки: аддитив и translucent (`FinalBlend.FrameBufferBlending`, `Shader.OutputBlending`) получают GPU-смешивание, вырезы (`bMasked`, `FinalBlend.AlphaTest` или поверхность с `PF_Masked`) получают alpha-test. Именно это заставляет дождь, стекло, заборы и листву читаться правильно, а не показываться чёрным квадратом.
- **Скайбокс.** Небо KF — это отдельная небольшая коробка, на которую игра смотрит через поверхности `PF_FakeBackdrop`. Я нахожу её как BSP-зону, чей центроид ближе всего к актору `SkyZoneInfo` (зоны нодов берутся из `iZone`), выношу эту зону в отдельную группу и каждый кадр держу точку SkyZoneInfo под камерой, чтобы она читалась бесконечным задником. Поверхности-заглушки FakeBackdrop выбрасываются из основного уровня, чтобы сквозь них было видно настоящее небо.
- **Освещение.** По умолчанию выключено. Реальное игровое освещение запечено (см. §4), но как приближение я читаю акторы `Light`/`Spotlight` (цвет HSV, радиус, яркость), раскладываю их в равномерную сетку и запекаю дешёвую повершинную сумму в BSP и террейн, плюс поинстансный оттенок на меши.
- **Оверлеи.** `readActors(pkg, classes)` читает любой класс акторов как тегированные свойства + Location, переиспользуя пропуск state-frame. Это питает переключаемые маркеры точек спавна игроков (`PlayerStart`), мест торговца (`KFTraderTeleporter`/`ShopVolume`/`WeaponLocker`/`KFTraderDoor`) и path-нодов монстров (`PathNode`), нарисованные с выключенным depth-test, чтобы оставаться видимыми сквозь стены.
- **Камера.** Обычная перспективная камера с небольшим pointer-lock + WASD управлением полётом и кнопкой сброса.

## 4. Шероховатости / TODO

- **Точное игровое освещение.** Приближённый свет — из акторов `Light`; реальный вид запечён в карту. Лайтмапы BSP лежат в трейлере `Model` (`LightMap`/`LightBits`, которые я пропускаю), а поинстансное освещение мешей — в объектах `StaticMeshInstance`. Ни то, ни другое пока не декодировано, а трейлер Model в v128 — не каноническая раскладка, так что понадобится тот же реверс-инжиниринг, что и с раскладками node/surf.
- **Небесные меши.** Если карта строит небо из статик-мешей (спрайт солнца, плоскости облаков), а не из BSP-коробки, они пока не переносятся в группу неба.
- **Слои террейна.** Текстурируется только базовый слой; многослойное alpha-смешивание и деко-слои (трава/детальные меши) не сделаны.
- **Маски типа забора.** `Shader` с *отдельной* opacity-текстурой пока использует собственную альфу диффуза; подключение opacity-текстуры как `alphaMap` вырезало бы такие поверхности правильно.
- **Производительность.** Большие карты рисуют по одному мешу на актор, то есть много draw call'ов. Инстансинг или мерж помогли бы, если станет тормозить.

## Файлы

| Файл | Что это |
|------|---------|
| `kfrom.js` | ядро: разбор пакетов UE2.5, мировой BSP, статик-меши, террейн, текстуры. Работает в браузере и в Node. |
| `viewer.html` | просмотрщик: Three.js + небольшая pointer-lock/WASD камера свободного полёта. |
| `cli.js` | небольшой Node CLI: статистика геометрии и экспорт в OBJ. |
| `vendor/three.min.js` | Three.js r136 (MIT), вложен, чтобы просмотрщик работал офлайн. |

```bash
node cli.js <map.rom>            # package version, geometry counts, referenced texture packages
node cli.js <map.rom> out.obj    # + export the BSP as OBJ (opens in Blender / Windows 3D Viewer)
```

## Ссылки

- Референсы рендера GoldSrc: `urgorri/goldsrc-bsp-viewer`, `sbuggay/bspview`, `x8BitRain/webhl`.
- Структуры и сериализация UE2: `stephank/surreal` (`Engine/Inc/UnModel.h`, `UnObj.h`), `RedPandaProjects/UnrealEngine`, `EliotVU/Unreal-Library`.
- Текстуры и меши UE2: `gildor2/UEViewer` (`Unreal/UnrealMaterial/UnMaterial2.*`, `Unreal/UnrealMesh/UnMesh2.*` и `Unreal/UnObject.cpp` для тегированных свойств и state-frame), плюс разбор формата пакета от Eliot Van Uytfanghe на `eliotvu.com/page/unreal-package-file-format`.
- Подтверждение, что umodel не умеет уровни: его собственный `Docs/FAQ.md`.
