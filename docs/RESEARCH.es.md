# El formato de mapas de Killing Floor

[English](../RESEARCH.md) · [Русский](./RESEARCH.ru.md) · **Español** · [Português](./RESEARCH.pt.md) · [Lietuvių](./RESEARCH.lt.md) · [Polski](./RESEARCH.pl.md) · [Français](./RESEARCH.fr.md) · [中文](./RESEARCH.zh.md) · [日本語](./RESEARCH.ja.md)

Estas son mis notas de cuando descifré el formato de mapas de Killing Floor lo suficiente como para dibujarlo en un navegador. KFEd (el editor oficial) puede abrir un mapa, pero es pesado y torpe si lo único que quieres es volar por ahí y mirar, así que en su lugar escribí un pequeño visor WebGL. Todo esto es Unreal Engine 2.5: los mapas son paquetes `.rom`, las texturas son `.utx`, los static meshes son `.usx`, todos con el mismo formato de contenedor.

La versión corta de lo que encontré:

- Ninguna herramienta existente dibuja el BSP del nivel. umodel y los demás exportan recursos individuales (meshes, texturas) o los brushes de origen del editor, no el mundo compilado que realmente ves en el juego, así que la geometría del mundo hay que sacarla a mano del objeto `Model`.
- La parte de renderizado se parece a la de un visor de BSP de Counter-Strike / GoldSrc: construir triángulos a partir de las caras, subir texturas, mover la cámara. La parte de parseo no se parece en nada. GoldSrc es un puñado de lumps planos; UE2.5 es un paquete de objetos con tablas de nombres/imports/exports, y el BSP vive dentro de un objeto `Model`.
- Las piezas que acabé decodificando: las tablas del paquete, el `Model` del mundo (Vectors/Points/Nodes/Surfs/Verts), el formato de textura (disposición de mips, DXT1/3/5), cómo el material de una superficie se resuelve hasta un `.utx`, los static meshes y dónde se colocan, y el terreno por heightmap.

## 1. Lo que ya existe

### Visores de GoldSrc / CS 1.6, como referencia

El BSP de GoldSrc (versión 30) es un contenedor simple de 15 lumps (entities, planes, vertices, nodes, texinfo, faces, edges, surfedges, models, textures, lighting…). Renderizar uno va así:

1. Parsear los lumps: cabecera más un directorio, cada lump un array tipado sobre el buffer.
2. Ensamblar el mesh: por cada cara, recorrer sus surfedges (índice con signo, `+`→edge.v0, `−`→edge.v1 invertido) para obtener un anillo ordenado de vértices, y luego triangular en abanico.
3. Las UVs no se almacenan, se calculan: `u = (dot(P, texinfo.vS) + shiftS) / width`, igual para `v`.
4. Las texturas son miptex paletizadas de 8 bits (en el BSP o en un WAD externo), expandidas de índice→RGBA.
5. La cámara es pointer-lock más WASD noclip, sin colisión.

Los visores web que vale la pena leer son `urgorri/goldsrc-bsp-viewer` (TypeScript + Three.js, texturas WAD, lightmaps en atlas, noclip completo), `sbuggay/bspview` (un parser mínimo + geometría + cámara), y `skyrim/hlviewer.js` / `x8BitRain/webhl` / `rein4ce/hlbsp` sobre WebGL puro. En el lado del escritorio, Crafty (Nem's Tools) y newbspguy son buenas referencias para la sensación de "texturizado, vuelo libre".

La parte útil que se traslada es la forma del pipeline — parser → constructor de geometría → decodificador de texturas → renderer + cámara, manteniendo el parser independiente del renderer — y la cámara pointer-lock + WASD, que es básicamente el control de ejemplo de three.js.

### Unreal / KF

umodel (UE Viewer de Gildor) lee paquetes de UT2004/KF, pero solo exporta recursos: skeletal y static meshes, texturas, animaciones. No reconstruye el BSP del nivel ni el terreno (no hay un parser de `Model`/`Level` en su código). UnrealEd, y `ucc batchexport … T3D`, te dan los brushes CSG de origen como texto (FPoly), no el BSP compilado, y esa es exactamente la ruta del editor pesado que intentaba evitar. UT4X-Converter y los importadores T3D de Blender también trabajan a nivel de brush/T3D. Así que, para mostrar la geometría que el juego realmente renderiza, el lector de BSP tuvo que ser propio.

## 2. El formato `.rom`

Descifré las disposiciones de abajo leyéndolas directamente de los mapas incluidos y comprobando que se sostienen. Para el BSP la comprobación es fácil: cada plano de nodo debería salir como una normal unitaria, cada índice de superficie debería caer dentro del rango, y el polígono que reconstruyes para un nodo debería quedar plano sobre el plano de ese nodo. Donde pude contrastar un campo con fuentes públicas de UE2, lo hice; están en las referencias del final. `kfrom.js` implementa todo esto y funciona igual en el navegador y en Node.

### 2.1 Paquete

`.rom`/`.utx`/`.usx`/`.u` son paquetes UE2.5 (`file_version 128 / licensee 29`, magic `0x9E2A83C2`). Cabecera, luego tablas de nombres/imports/exports. Todo se indexa con un *compact index* (primer byte: bit `0x80` = signo, `0x40` = continuar, 6 bits bajos; bytes de continuación `0x80` = continuar más 7 bits). Una referencia a objeto es uno de esos: `0` es null, `+n` es el export `n−1` (en este paquete), `−n` es el import `−n−1` (en algún otro paquete).

### 2.2 BSP del mundo: el objeto `Model`

La geometría del nivel es el export `Model` más grande marcado con `LoadForServer`. Los objetos `Model` pequeños son los brushes CSG de origen del editor y el motor nunca los carga en tiempo de juego. Los datos del Model del mundo se disponen así:

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

`FBspNode` en v128 es la disposición habitual de UE1/UE2 más 12 bytes finales que parecen específicos del build de Red Orchestra / KF. Encontré los bytes extra parseando N nodos y comprobando que el cursor cae exactamente en el contador de `Surfs`:

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

`FBspSurf` en v128 también difiere de UE1: en lugar de `PanU`/`PanV`/`Actor` almacena el `Plane` de la superficie y un `ShadowMapScale`:

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

`FVert` es simplemente `pVertex` (cidx en POINTS) e `iSide` (cidx).

### 2.3 Polígonos y UVs

Recorre `Nodes`, quédate con los que tienen `NumVertices ≥ 3`, toma el surf del nodo y su abanico de verts `Verts[iVertPool … +NumVertices]`, mapea cada uno a `Points[pVertex]`, y triangula en abanico. Las UVs usan la proyección planar de Unreal, la misma idea que el vS/vT del texinfo de GoldSrc:

```
Base = Points[surf.pBase];  Uax = Vectors[surf.vTextureU];  Vax = Vectors[surf.vTextureV];
for vertex P:  u = dot(P−Base, Uax) / Texture.USize ;  v = dot(P−Base, Vax) / Texture.VSize
```

Cuidado aquí: `pBase` indexa **Points**, mientras que `vNormal/vTextureU/vTextureV` indexan **Vectors** — dos tablas distintas. Omito las superficies marcadas con `PF_Invisible`, `PF_Portal`, o `PF_FakeBackdrop` (estas últimas son las superficies de la "ventana al cielo", tratadas más abajo en el apartado del skybox).

### 2.4 Texturas (`.utx`, mismo formato de paquete)

Un objeto `Texture` es un bloque de propiedades etiquetadas (`Format`, `USize`, `VSize`, ref `Palette`, `bMasked`, `bAlphaTexture`…) seguido de un trailer nativo, `Mips : TArray<FMipmap>`. Cada `FMipmap`:

```
int  SkipPos          — lazy-array offset (present for ArVer>61); read and ignore
TArray<byte> Data     — cidx N + N bytes of pixel/block data
int  USize, int VSize
byte UBits, byte VBits
```

Longitud de `Data`: DXT es `ceil(U/4)*ceil(V/4)*(8|16)`; P8/L8 es `U*V`; RGB8 es `U*V*3`; RGBA8 es `U*V*4`; G16 (heightmaps de terreno) es `U*V*2`.

`Format` (ETextureFormat, UE2): `0=P8, 3=DXT1, 4=RGB8 (BGR on disk), 5=RGBA8 (BGRA on disk), 7=DXT3, 8=DXT5, 9=L8, 10=G16`. La mayoría de las texturas de KF son DXT1/3/5, que van directas a la GPU vía `WEBGL_compressed_texture_s3tc` sin decodificar. P8 necesita una `UPalette` (`TArray<FColor>` de 256, orden de bytes RGBA; con `bMasked`, el índice 0 es transparente). Una DXT1 con máscara lleva un alpha de 1 bit, así que sube como RGBA_DXT1.

### 2.5 Resolver el material de una superficie a un `.utx`

`surf.Material` es una ref con signo a un registro de import `{ ObjectName, ClassName, Outer }`. Recorre la cadena `Outer` hasta el paquete de nivel superior, que es el nombre de archivo (`KillingFloorOfficeTextures.utx`); los nombres intermedios son grupos (p. ej., `Carpet` vive en el grupo `OfficeCommon` dentro de ese archivo). Abre el archivo, encuentra el export con ese nombre y una clase de textura.

Un material suele ser un envoltorio, no una textura cruda: `Shader`→`Diffuse`, `Combiner`→`Material1`, `FinalBlend`/`TexScaler`/`TexRotator`/`TexModifier`→`Material`, y así, bajando recursivamente hasta el primer `Texture`/`BitmapMaterial`. Los envoltorios son objetos planos (bloque de propiedades → refs de objeto), y también llevan el blend mode de la superficie, que importa para la transparencia (ver §3).

### 2.6 Static meshes (`UStaticMesh`) y colocación (`StaticMeshActor`)

Los mapas portados de CS meten casi toda su geometría en static meshes (el BSP es solo un skybox), y los mapas de serie llevan miles de `StaticMeshActor`s encima del BSP, así que los meshes no son opcionales. La serialización de `UStaticMesh`:

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

Los triángulos vienen de `IndexStream1` agrupados por sección (`FirstIndex … +NumFaces*3`); la sección `i` usa `Materials[i]`; las UVs son `UVStream[0]` por vértice, ya normalizadas.

Un registro `StaticMeshActor` es un bloque de propiedades etiquetadas, pero va precedido de un `FStateFrame` (el actor tiene `RF_HasStack`): `Node`(cidx), `StateNode`(cidx), `ProbeMask`(QWORD 8B), `LatentAction`(INT 4B), y — solo si `Node ≠ 0` — `Offset` como **cidx**. Ese último me costó una tarde: leerlo como int32 desincroniza todos los actores. Tras el frame, las propiedades etiquetadas dan `StaticMesh` (objref), `Location` (Vector), `Rotation` (Rotator, 3×int32 con `rad = u·π/32768`), `DrawScale` (float), `DrawScale3D` (Vector), `PrePivot` (Vector), `bHidden`. La transformación al mundo es `Location + FRotationMatrix(Rotation) · (DrawScale·DrawScale3D ∘ (v − PrePivot))`.

### 2.7 Terreno (`TerrainInfo`)

En muchos de los mapas de serie el suelo es un terreno por heightmap (`TerrainInfo` más `TerrainSector`s), no BSP. Las propiedades de `TerrainInfo` dan `TerrainMap` (una textura heightmap G16), `TerrainScale` (Vector), `Location` (Vector), y una struct `Layers[0]` con la `Texture` base y sus `UScale`/`VScale`. Los vértices de la rejilla son:

```
vertex(x,y): X = Location.X + (x − W/2)·scaleX ; Y = Location.Y + (y − H/2)·scaleY ;
             Z = Location.Z + (height16 − 32768)·scaleZ / 256
```

## 3. Cómo lo dibuja el visor

Es un único archivo HTML autocontenido más Three.js (incluido, para que funcione sin conexión desde `file://`), con `kfrom.js` haciendo todo el parseo.

- **Entrada.** Arrastra un `.rom` sobre la ventana, o elige uno de la carpeta del juego. Los paquetes `.utx`/`.usx` se cargan de forma perezosa desde esa carpeta; lo que falte se omite o se muestra con color plano.
- **Geometría.** `buildMesh` (BSP), `readStaticMesh`/`readStaticMeshActors` (meshes), y `readTerrainInfo`/`buildTerrainMesh` (terreno) producen `THREE.BufferGeometry`. Todo se queda en coordenadas de Unreal bajo un `mapRoot` rotado −90° sobre X (Unreal es Z-up, three.js es Y-up); las instancias de mesh reciben la transformación del actor como su matriz. Unreal es zurdo y three.js es diestro, así que el winding se invierte — dibujo todo a doble cara en vez de pelearme con ello.
- **Texturas.** El mip 0 de DXT va directo a un `THREE.CompressedTexture`; P8/RGBA8 (raros) se expanden en la CPU. La transparencia sigue el blend mode del material, que viene del envoltorio: aditivo y translúcido (`FinalBlend.FrameBufferBlending`, `Shader.OutputBlending`) obtienen blending por GPU, los recortes (`bMasked`, `FinalBlend.AlphaTest`, o una superficie `PF_Masked`) obtienen un alpha test. Esto es lo que hace que la lluvia, el cristal, las vallas y el follaje se vean bien en lugar de mostrar una caja negra.
- **Skybox.** Un cielo de KF es una pequeña caja aparte que el juego ve a través de las superficies `PF_FakeBackdrop`. Lo encuentro como la zona del BSP cuyo centroide está más cerca del actor `SkyZoneInfo` (las zonas de nodo vienen de `iZone`), extraigo esa zona a su propio grupo, y en cada frame mantengo el punto SkyZoneInfo bajo la cámara para que se lea como un fondo infinito. Las superficies FakeBackdrop de relleno se descartan del nivel principal para que se vea el cielo real a través.
- **Iluminación.** Desactivada por defecto. La iluminación real del juego está horneada (ver §4), pero como aproximación leo los actores `Light`/`Spotlight` (color HSV, radio, brillo), los coloco en una rejilla uniforme, y horneo una suma barata por vértice en el BSP y el terreno, además de un tinte por instancia en los meshes.
- **Superposiciones.** `readActors(pkg, classes)` lee cualquier clase de actor como props etiquetadas + Location, reutilizando el salto del state-frame. Eso alimenta marcadores conmutables para los spawns de jugadores (`PlayerStart`), los puestos del comerciante (`KFTraderTeleporter`/`ShopVolume`/`WeaponLocker`/`KFTraderDoor`) y los nodos de ruta de los monstruos (`PathNode`), dibujados con el depth-test desactivado para que sigan visibles a través de las paredes.
- **Cámara.** Una cámara en perspectiva sencilla con un pequeño control de vuelo pointer-lock + WASD y un botón de reinicio.

## 4. Asperezas / TODO

- **Iluminación exacta del juego.** La luz aproximada viene de los actores `Light`; el aspecto real está horneado en el mapa. Los lightmaps del BSP viven en el trailer del `Model` (`LightMap`/`LightBits`, que omito), y la iluminación por instancia de los meshes está en los objetos `StaticMeshInstance`. Ninguno está decodificado todavía, y el trailer del Model v128 no es la disposición canónica, así que necesita la misma ingeniería inversa que hicieron las disposiciones de node/surf.
- **Sky meshes.** Si un mapa construye su cielo con static meshes (un sprite de sol, planos de nubes) en lugar de una caja BSP, esos todavía no se mueven al grupo del cielo.
- **Capas de terreno.** Solo la capa base está texturizada; el alpha blending multicapa y las capas de deco (meshes de hierba/detalle) no están hechos.
- **Máscaras estilo valla.** Un `Shader` con una textura de opacidad *separada* usa por ahora el propio alpha del diffuse; conectar la textura de opacidad como un `alphaMap` las recortaría correctamente.
- **Rendimiento.** Los mapas grandes dibujan un mesh por actor, así que muchas draw calls. El instancing o el merging ayudaría si empieza a importar.

## Archivos

| Archivo | Qué es |
|------|-----------|
| `kfrom.js` | el núcleo: parseo de paquetes UE2.5, BSP del mundo, static meshes, terreno, texturas. Funciona en el navegador y en Node. |
| `viewer.html` | el visor: Three.js + una pequeña cámara de vuelo con pointer-lock/WASD. |
| `cli.js` | una pequeña CLI de Node: estadísticas de geometría y exportación a OBJ. |
| `vendor/three.min.js` | Three.js r136 (MIT), incluido para que el visor funcione sin conexión. |

```bash
node cli.js <map.rom>            # package version, geometry counts, referenced texture packages
node cli.js <map.rom> out.obj    # + export the BSP as OBJ (opens in Blender / Windows 3D Viewer)
```

## Referencias

- Referencias de renderizado de GoldSrc: `urgorri/goldsrc-bsp-viewer`, `sbuggay/bspview`, `x8BitRain/webhl`.
- Structs y serialización de UE2: `stephank/surreal` (`Engine/Inc/UnModel.h`, `UnObj.h`), `RedPandaProjects/UnrealEngine`, `EliotVU/Unreal-Library`.
- Texturas y meshes de UE2: `gildor2/UEViewer` (`Unreal/UnrealMaterial/UnMaterial2.*`, `Unreal/UnrealMesh/UnMesh2.*`, y `Unreal/UnObject.cpp` para las propiedades etiquetadas y el state frame), además del artículo de Eliot Van Uytfanghe sobre el formato de paquete en `eliotvu.com/page/unreal-package-file-format`.
- Confirmación de que umodel no maneja niveles: su propio `Docs/FAQ.md`.
