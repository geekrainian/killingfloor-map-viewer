# Le format de carte de Killing Floor

[English](../RESEARCH.md) · [Русский](./RESEARCH.ru.md) · [Español](./RESEARCH.es.md) · [Português](./RESEARCH.pt.md) · [Lietuvių](./RESEARCH.lt.md) · [Polski](./RESEARCH.pl.md) · **Français** · [中文](./RESEARCH.zh.md) · [日本語](./RESEARCH.ja.md)

Voici mes notes prises en décortiquant le format de carte de Killing Floor suffisamment pour le dessiner dans un navigateur. KFEd (l'éditeur officiel) peut ouvrir une carte, mais il est lourd et pénible si tout ce que tu veux c'est voler autour et regarder, alors j'ai plutôt écrit un petit visualiseur WebGL. Tout ici est de l'Unreal Engine 2.5 : les cartes sont des paquets `.rom`, les textures des `.utx`, les static meshes des `.usx`, tous dans le même format de conteneur.

La version courte de ce que j'ai trouvé :

- Aucun outil existant ne dessine le BSP du niveau. umodel et les autres exportent des assets individuels (meshes, textures) ou les brushes sources de l'éditeur, pas le monde compilé que tu vois réellement en jeu, donc la géométrie du monde doit être extraite de l'objet `Model` à la main.
- Côté rendu, c'est proche d'un visualiseur BSP Counter-Strike / GoldSrc : construire des triangles à partir des faces, envoyer les textures, faire voler la caméra. Côté parsing, rien à voir. GoldSrc, c'est une poignée de lumps plats ; UE2.5 est un paquet d'objets avec des tables name/import/export, et le BSP est logé dans un objet `Model`.
- Les morceaux que j'ai fini par décoder : les tables du paquet, le `Model` du monde (Vectors/Points/Nodes/Surfs/Verts), le format de texture (agencement des mips, DXT1/3/5), comment le matériau d'une surface se résout jusqu'à un `.utx`, les static meshes et où ils sont placés, et le terrain heightmap.

## 1. Ce qui existe déjà

### Visualiseurs GoldSrc / CS 1.6, pour référence

Le BSP GoldSrc (version 30) est un simple conteneur de 15 lumps (entities, planes, vertices, nodes, texinfo, faces, edges, surfedges, models, textures, lighting…). En dessiner un se passe comme suit :

1. Parser les lumps : un header plus un répertoire, chaque lump étant un tableau typé sur le buffer.
2. Assembler le mesh : pour chaque face, parcourir ses surfedges (indice signé, `+`→edge.v0, `−`→edge.v1 inversé) pour obtenir un anneau de sommets ordonné, puis trianguler en éventail.
3. Les UV ne sont pas stockées, tu les calcules : `u = (dot(P, texinfo.vS) + shiftS) / width`, pareil pour `v`.
4. Les textures sont des miptex palettisées 8 bits (dans le BSP ou dans un WAD externe), index→RGBA à l'expansion.
5. La caméra est en pointer-lock plus WASD noclip, sans collision.

Les visualiseurs web qui valent la lecture sont `urgorri/goldsrc-bsp-viewer` (TypeScript + Three.js, textures WAD, atlas lightmaps, noclip complet), `sbuggay/bspview` (un parser minimal + géométrie + caméra), et `skyrim/hlviewer.js` / `x8BitRain/webhl` / `rein4ce/hlbsp` en WebGL brut. Côté desktop, Crafty (Nem's Tools) et newbspguy sont de bonnes références pour le ressenti « texturé, vol libre ».

La partie utile qui se transpose, c'est la forme du pipeline — parser → constructeur de géométrie → décodeur de textures → renderer + caméra, en gardant le parser indépendant du renderer — et la caméra pointer-lock + WASD, qui est en gros le contrôle des exemples three.js.

### Unreal / KF

umodel (Gildor's UE Viewer) lit les paquets UT2004/KF, mais il n'exporte que des assets : skeletal et static meshes, textures, animations. Il ne reconstruit ni le BSP du niveau ni le terrain (il n'y a pas de parser `Model`/`Level` dans ses sources). UnrealEd, et `ucc batchexport … T3D`, te donnent les brushes CSG sources sous forme de texte (FPoly), pas le BSP compilé, et c'est exactement la route par le lourd éditeur que je cherchais à éviter. UT4X-Converter et les importateurs T3D pour Blender travaillent aussi au niveau brush/T3D. Donc pour montrer la géométrie que le jeu rend réellement, le lecteur de BSP a dû être le mien.

## 2. Le format `.rom`

J'ai décortiqué les agencements ci-dessous en les lisant directement sur les cartes livrées et en vérifiant qu'ils tiennent la route. Pour le BSP la vérification est facile : le plan de chaque node doit ressortir comme une normale unitaire, chaque indice de surface doit tomber dans la plage, et le polygone que tu reconstruis pour un node doit reposer bien à plat sur le plan de ce node. Là où je pouvais recouper un champ avec des sources UE2 publiques je l'ai fait ; elles sont dans les références à la fin. `kfrom.js` implémente tout ça et tourne pareil dans le navigateur et dans Node.

### 2.1 Paquet

`.rom`/`.utx`/`.usx`/`.u` sont des paquets UE2.5 (`file_version 128 / licensee 29`, magic `0x9E2A83C2`). Un header, puis les tables name/import/export. Tout est indexé avec un *compact index* (premier octet : bit `0x80` = signe, `0x40` = continuation, 6 bits de poids faible ; octets de continuation `0x80` = continuation plus 7 bits). Une référence d'objet est l'un de ceux-là : `0` est nul, `+n` est l'export `n−1` (dans ce paquet), `−n` est l'import `−n−1` (dans un autre paquet).

### 2.2 BSP du monde : l'objet `Model`

La géométrie du niveau est le plus grand export `Model` marqué `LoadForServer`. Les petits objets `Model` sont les brushes CSG sources de l'éditeur et le moteur ne les charge jamais au moment de jouer. Les données du Model du monde s'agencent comme ceci :

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

`FBspNode` en v128 est l'agencement habituel UE1/UE2 plus 12 octets de fin qui semblent spécifiques au build Red Orchestra / KF. J'ai trouvé les octets supplémentaires en parsant N nodes et en vérifiant que le curseur tombe exactement sur le compteur `Surfs` :

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

`FBspSurf` en v128 diffère aussi d'UE1 : au lieu de `PanU`/`PanV`/`Actor` il stocke le `Plane` de la surface et un `ShadowMapScale` :

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

`FVert` est juste `pVertex` (cidx dans POINTS) et `iSide` (cidx).

### 2.3 Polygones et UV

Parcours `Nodes`, garde ceux dont `NumVertices ≥ 3`, prends le surf du node et son éventail de verts `Verts[iVertPool … +NumVertices]`, mappe chacun vers `Points[pVertex]`, et triangule en éventail. Les UV utilisent la projection planaire d'Unreal, la même idée que le vS/vT du texinfo de GoldSrc :

```
Base = Points[surf.pBase];  Uax = Vectors[surf.vTextureU];  Vax = Vectors[surf.vTextureV];
for vertex P:  u = dot(P−Base, Uax) / Texture.USize ;  v = dot(P−Base, Vax) / Texture.VSize
```

Attention ici : `pBase` indexe **Points**, tandis que `vNormal/vTextureU/vTextureV` indexent **Vectors** — deux tables différentes. Je saute les surfaces marquées `PF_Invisible`, `PF_Portal`, ou `PF_FakeBackdrop` (ces dernières sont les surfaces « fenêtre de ciel », traitées plus bas sous la skybox).

### 2.4 Textures (`.utx`, même format de paquet)

Un objet `Texture` est un property block balisé (`Format`, `USize`, `VSize`, réf `Palette`, `bMasked`, `bAlphaTexture`…) suivi d'un trailer natif, `Mips : TArray<FMipmap>`. Chaque `FMipmap` :

```
int  SkipPos          — lazy-array offset (present for ArVer>61); read and ignore
TArray<byte> Data     — cidx N + N bytes of pixel/block data
int  USize, int VSize
byte UBits, byte VBits
```

Longueur de `Data` : DXT vaut `ceil(U/4)*ceil(V/4)*(8|16)` ; P8/L8 vaut `U*V` ; RGB8 vaut `U*V*3` ; RGBA8 vaut `U*V*4` ; G16 (heightmaps de terrain) vaut `U*V*2`.

`Format` (ETextureFormat, UE2) : `0=P8, 3=DXT1, 4=RGB8 (BGR on disk), 5=RGBA8 (BGRA on disk), 7=DXT3, 8=DXT5, 9=L8, 10=G16`. La plupart des textures KF sont en DXT1/3/5, qui vont directement au GPU via `WEBGL_compressed_texture_s3tc` sans décodage. P8 a besoin d'une `UPalette` (`TArray<FColor>` de 256, ordre des octets RGBA ; avec `bMasked`, l'index 0 est transparent). Un DXT1 masqué porte un alpha 1 bit et monte donc en RGBA_DXT1.

### 2.5 Résoudre le matériau d'une surface vers un `.utx`

`surf.Material` est une réf signée vers un enregistrement d'import `{ ObjectName, ClassName, Outer }`. Remonte la chaîne `Outer` jusqu'au paquet de niveau supérieur, qui est le nom de fichier (`KillingFloorOfficeTextures.utx`) ; les noms intermédiaires sont des groupes (par ex. `Carpet` vit dans le groupe `OfficeCommon` à l'intérieur de ce fichier). Ouvre le fichier, trouve l'export portant ce nom et une classe de texture.

Un matériau est souvent un wrapper, pas une texture brute : `Shader`→`Diffuse`, `Combiner`→`Material1`, `FinalBlend`/`TexScaler`/`TexRotator`/`TexModifier`→`Material`, et ainsi de suite, en descendant récursivement jusqu'au premier `Texture`/`BitmapMaterial`. Les wrappers sont de simples objets (property block → object refs), et ils portent aussi le blend mode de la surface, ce qui compte pour la transparence (voir §3).

### 2.6 Static meshes (`UStaticMesh`) et placement (`StaticMeshActor`)

Les cartes portées de CS mettent presque toute leur géométrie dans des static meshes (le BSP n'est qu'une skybox), et les cartes d'origine portent des milliers de `StaticMeshActor` par-dessus le BSP, donc les meshes ne sont pas optionnels. La sérialisation de `UStaticMesh` :

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

Les triangles viennent de `IndexStream1` groupés par section (`FirstIndex … +NumFaces*3`) ; la section `i` utilise `Materials[i]` ; les UV sont `UVStream[0]` par sommet, déjà normalisées.

Un enregistrement `StaticMeshActor` est un property block balisé, mais il est préfixé par un `FStateFrame` (l'acteur a `RF_HasStack`) : `Node`(cidx), `StateNode`(cidx), `ProbeMask`(QWORD 8B), `LatentAction`(INT 4B), et — seulement si `Node ≠ 0` — `Offset` sous forme de **cidx**. Ce dernier m'a coûté une soirée : le lire comme un int32 désynchronise chaque acteur. Après la frame, les propriétés balisées donnent `StaticMesh` (objref), `Location` (Vector), `Rotation` (Rotator, 3×int32 avec `rad = u·π/32768`), `DrawScale` (float), `DrawScale3D` (Vector), `PrePivot` (Vector), `bHidden`. La transformation dans le monde est `Location + FRotationMatrix(Rotation) · (DrawScale·DrawScale3D ∘ (v − PrePivot))`.

### 2.7 Terrain (`TerrainInfo`)

Sur beaucoup des cartes d'origine, le sol est un terrain heightmap (`TerrainInfo` plus des `TerrainSector`), pas du BSP. Les propriétés de `TerrainInfo` donnent `TerrainMap` (une texture heightmap G16), `TerrainScale` (Vector), `Location` (Vector), et une structure `Layers[0]` avec la `Texture` de base et ses `UScale`/`VScale`. Les sommets de la grille sont :

```
vertex(x,y): X = Location.X + (x − W/2)·scaleX ; Y = Location.Y + (y − H/2)·scaleY ;
             Z = Location.Z + (height16 − 32768)·scaleZ / 256
```

## 3. Comment le visualiseur le dessine

C'est un unique fichier HTML autonome plus Three.js (embarqué, donc il tourne hors ligne depuis `file://`), avec `kfrom.js` qui fait tout le parsing.

- **Entrée.** Glisse un `.rom` sur la fenêtre, ou choisis-en un depuis le dossier du jeu. Les paquets `.utx`/`.usx` se chargent paresseusement depuis ce dossier ; tout ce qui manque est sauté ou affiché en couleur plate.
- **Géométrie.** `buildMesh` (BSP), `readStaticMesh`/`readStaticMeshActors` (meshes), et `readTerrainInfo`/`buildTerrainMesh` (terrain) produisent des `THREE.BufferGeometry`. Tout reste en coordonnées Unreal sous un `mapRoot` tourné de −90° autour de X (Unreal est Z-up, three.js est Y-up) ; les instances de mesh reçoivent la transformation de l'acteur comme matrice. Unreal est gaucher et three.js est droitier, donc le winding s'inverse — je dessine tout en double face plutôt que de me battre avec.
- **Textures.** Le mip 0 des DXT va directement à une `THREE.CompressedTexture` ; les P8/RGBA8 (rares) sont expansés côté CPU. La transparence suit le blend mode du matériau, qui vient du wrapper : additif et translucide (`FinalBlend.FrameBufferBlending`, `Shader.OutputBlending`) obtiennent le blending GPU, les découpes (`bMasked`, `FinalBlend.AlphaTest`, ou une surface `PF_Masked`) obtiennent un alpha test. C'est ce qui fait que la pluie, le verre, les clôtures et le feuillage s'affichent correctement au lieu de montrer une boîte noire.
- **Skybox.** Un ciel KF est une petite boîte séparée que le jeu regarde à travers les surfaces `PF_FakeBackdrop`. Je la repère comme la zone BSP dont le centroïde est le plus proche de l'acteur `SkyZoneInfo` (les zones des nodes viennent d'`iZone`), je tire cette zone dans son propre groupe, et à chaque frame je garde le point SkyZoneInfo sous la caméra pour qu'elle se lise comme un décor infini. Les surfaces FakeBackdrop de remplacement sont retirées du niveau principal pour que le vrai ciel apparaisse à travers.
- **Éclairage.** Désactivé par défaut. Le vrai éclairage en jeu est précalculé (voir §4), mais comme approximation je lis les acteurs `Light`/`Spotlight` (couleur HSV, rayon, intensité), je les dépose dans une grille uniforme, et je précalcule une somme par sommet peu coûteuse dans le BSP et le terrain, plus une teinte par instance sur les meshes.
- **Surcouches.** `readActors(pkg, classes)` lit n'importe quelle classe d'acteur en props balisées + Location, en réutilisant le saut de state-frame. Ça pilote des marqueurs commutables pour les points d'apparition des joueurs (`PlayerStart`), les emplacements du trader (`KFTraderTeleporter`/`ShopVolume`/`WeaponLocker`/`KFTraderDoor`) et les nœuds de chemin des monstres (`PathNode`), dessinés avec le depth-test désactivé pour qu'ils restent visibles à travers les murs.
- **Caméra.** Une simple caméra en perspective avec un petit contrôle de vol pointer-lock + WASD et un bouton de reset.

## 4. Aspérités / TODO

- **Éclairage exact en jeu.** La lumière approximative vient des acteurs `Light` ; le vrai rendu est précalculé dans la carte. Les lightmaps du BSP vivent dans le trailer du `Model` (`LightMap`/`LightBits`, que je saute), et l'éclairage par instance des meshes est dans les objets `StaticMeshInstance`. Ni l'un ni l'autre n'est encore décodé, et le trailer du Model en v128 n'est pas l'agencement canonique, donc ça demande le même reverse engineering que les agencements node/surf.
- **Meshes de ciel.** Si une carte construit son ciel à partir de static meshes (un sprite de soleil, des plans de nuages) plutôt qu'une boîte BSP, ceux-ci ne sont pas encore déplacés dans le groupe du ciel.
- **Couches de terrain.** Seule la couche de base est texturée ; le blending alpha multi-couches et les couches de déco (herbe/meshes de détail) ne sont pas faits.
- **Masques style clôture.** Un `Shader` avec une texture d'opacité *séparée* utilise pour l'instant l'alpha du diffuse ; brancher la texture d'opacité comme un `alphaMap` les découperait proprement.
- **Perf.** Les grandes cartes dessinent un mesh par acteur, donc beaucoup de draw calls. L'instancing ou le merging aiderait si ça commence à peser.

## Fichiers

| Fichier | Ce que c'est |
|------|-----------|
| `kfrom.js` | le cœur : parsing des paquets UE2.5, BSP du monde, static meshes, terrain, textures. Tourne dans le navigateur et dans Node. |
| `viewer.html` | le visualiseur : Three.js + une petite caméra libre pointer-lock/WASD. |
| `cli.js` | une petite CLI Node : statistiques de géométrie et export OBJ. |
| `vendor/three.min.js` | Three.js r136 (MIT), embarqué pour que le visualiseur fonctionne hors ligne. |

```bash
node cli.js <map.rom>            # package version, geometry counts, referenced texture packages
node cli.js <map.rom> out.obj    # + export the BSP as OBJ (opens in Blender / Windows 3D Viewer)
```

## Références

- Références de rendu GoldSrc : `urgorri/goldsrc-bsp-viewer`, `sbuggay/bspview`, `x8BitRain/webhl`.
- Structs et sérialisation UE2 : `stephank/surreal` (`Engine/Inc/UnModel.h`, `UnObj.h`), `RedPandaProjects/UnrealEngine`, `EliotVU/Unreal-Library`.
- Textures et meshes UE2 : `gildor2/UEViewer` (`Unreal/UnrealMaterial/UnMaterial2.*`, `Unreal/UnrealMesh/UnMesh2.*`, et `Unreal/UnObject.cpp` pour les propriétés balisées et la state frame), plus le compte rendu du format de paquet par Eliot Van Uytfanghe à `eliotvu.com/page/unreal-package-file-format`.
- Confirmation qu'umodel ne gère pas les niveaux : son propre `Docs/FAQ.md`.
