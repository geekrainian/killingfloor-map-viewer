# Format map Killing Floor

[English](../RESEARCH.md) · [Русский](./RESEARCH.ru.md) · [Español](./RESEARCH.es.md) · [Português](./RESEARCH.pt.md) · [Lietuvių](./RESEARCH.lt.md) · **Polski** · [Français](./RESEARCH.fr.md) · [中文](./RESEARCH.zh.md) · [日本語](./RESEARCH.ja.md)

To są moje notatki z rozgryzania formatu map Killing Floor na tyle, żeby narysować go w przeglądarce. KFEd (oficjalny edytor) potrafi otworzyć mapę, ale jest ciężki i niezgrabny, jeśli wszystko, czego chcesz, to polatać i popatrzeć, więc zamiast tego napisałem małą przeglądarkę WebGL. Wszystko tutaj to Unreal Engine 2.5: mapy to pakiety `.rom`, tekstury to `.utx`, statyczne siatki to `.usx`, wszystko w tym samym formacie kontenera.

Krótka wersja tego, co znalazłem:

- Żadne istniejące narzędzie nie rysuje BSP poziomu. umodel i cała reszta eksportują pojedyncze zasoby (siatki, tekstury) albo źródłowe brył edytora, a nie skompilowany świat, który faktycznie widzisz w grze, więc geometrię świata trzeba wyciągnąć z obiektu `Model` ręcznie.
- Strona renderowania jest bliska przeglądarce BSP z Counter-Strike / GoldSrc: buduj trójkąty ze ścian, wgraj tekstury, lataj kamerą. Strona parsowania nie ma z tym nic wspólnego. GoldSrc to garść płaskich lumpów; UE2.5 to pakiet obiektów z tablicami nazw/importów/eksportów, a BSP siedzi wewnątrz obiektu `Model`.
- Kawałki, które ostatecznie rozszyfrowałem: tablice pakietu, `Model` świata (Vectors/Points/Nodes/Surfs/Verts), format tekstur (układ mipmap, DXT1/3/5), jak materiał powierzchni sprowadza się do `.utx`, statyczne siatki i miejsca ich rozmieszczenia oraz teren z mapy wysokości.

## 1. Co już istnieje

### Przeglądarki GoldSrc / CS 1.6, dla porównania

GoldSrc BSP (wersja 30) to prosty kontener z 15 lumpów (entities, planes, vertices, nodes, texinfo, faces, edges, surfedges, models, textures, lighting…). Renderowanie jednego idzie tak:

1. Sparsuj lumpy: nagłówek plus katalog, każdy lump to typowana tablica nad buforem.
2. Zbuduj siatkę: dla każdej ściany przejdź jej surfedges (indeks ze znakiem, `+`→edge.v0, `−`→edge.v1 odwrócony), aby dostać uporządkowany pierścień wierzchołków, potem triangulacja wachlarzowa.
3. UV nie są przechowywane, obliczasz je: `u = (dot(P, texinfo.vS) + shiftS) / width`, tak samo dla `v`.
4. Tekstury to 8-bitowy paletyzowany miptex (w BSP albo w zewnętrznym WAD), rozwijane indeks→RGBA.
5. Kamera to pointer-lock plus WASD noclip, bez kolizji.

Warte przeczytania przeglądarki webowe to `urgorri/goldsrc-bsp-viewer` (TypeScript + Three.js, tekstury WAD, atlasowe mapy oświetlenia, pełny noclip), `sbuggay/bspview` (minimalny parser + geometria + kamera) oraz `skyrim/hlviewer.js` / `x8BitRain/webhl` / `rein4ce/hlbsp` na czystym WebGL. Po stronie desktopu Crafty (Nem's Tools) i newbspguy to dobre odniesienia dla wrażenia "oteksturowanego, swobodnego latania".

Przydatna część, która się przenosi, to kształt potoku — parser → budowniczy geometrii → dekoder tekstur → renderer + kamera, z parserem trzymanym niezależnie od renderera — oraz kamera pointer-lock + WASD, która jest w zasadzie kontrolką z przykładu three.js.

### Unreal / KF

umodel (Gildor's UE Viewer) czyta pakiety UT2004/KF, ale eksportuje tylko zasoby: siatki szkieletowe i statyczne, tekstury, animacje. Nie odtwarza BSP poziomu ani terenu (w jego źródłach nie ma parsera `Model`/`Level`). UnrealEd oraz `ucc batchexport … T3D` podają ci źródłowe bryły CSG jako tekst (FPoly), a nie skompilowany BSP, i to jest dokładnie ta ciężka droga przez edytor, którą próbowałem ominąć. UT4X-Converter i importery T3D dla Blendera też działają na poziomie brył/T3D. Więc żeby pokazać geometrię, którą gra faktycznie renderuje, czytnik BSP musiał być mój własny.

## 2. Format `.rom`

Układy poniżej rozgryzłem, czytając je wprost z dostarczonych map i sprawdzając, że się trzymają. Dla BSP sprawdzenie jest łatwe: każda płaszczyzna węzła powinna wyjść jako wektor jednostkowy normalny, każdy indeks powierzchni powinien wpaść w zakres, a wielokąt, który odbudowujesz dla węzła, powinien leżeć płasko na płaszczyźnie tego węzła. Tam, gdzie mogłem zweryfikować pole względem publicznych źródeł UE2, robiłem to; są one w odnośnikach na końcu. `kfrom.js` implementuje to wszystko i działa tak samo w przeglądarce i w Node.

### 2.1 Pakiet

`.rom`/`.utx`/`.usx`/`.u` to pakiety UE2.5 (`file_version 128 / licensee 29`, magic `0x9E2A83C2`). Nagłówek, potem tablice nazw/importów/eksportów. Wszystko jest indeksowane *kompaktowym indeksem* (pierwszy bajt: bit `0x80` = znak, `0x40` = kontynuacja, dolne 6 bitów; bajty kontynuacji `0x80` = kontynuacja plus 7 bitów). Referencja do obiektu jest jedną z takich wartości: `0` to null, `+n` to eksport `n−1` (w tym pakiecie), `−n` to import `−n−1` (w jakimś innym pakiecie).

### 2.2 BSP świata: obiekt `Model`

Geometria poziomu to największy eksport `Model` oflagowany jako `LoadForServer`. Małe obiekty `Model` to źródłowe bryły CSG edytora i silnik nigdy ich nie ładuje w czasie gry. Dane Modelu świata układają się tak:

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

`FBspNode` w v128 to zwykły układ UE1/UE2 plus 12 końcowych bajtów, które wydają się specyficzne dla builda Red Orchestra / KF. Dodatkowe bajty znalazłem, parsując N węzłów i sprawdzając, że kursor ląduje dokładnie na liczbie `Surfs`:

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

`FBspSurf` w v128 też różni się od UE1: zamiast `PanU`/`PanV`/`Actor` przechowuje `Plane` powierzchni oraz `ShadowMapScale`:

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

`FVert` to po prostu `pVertex` (cidx do POINTS) i `iSide` (cidx).

### 2.3 Wielokąty i UV

Przejdź `Nodes`, zachowaj te z `NumVertices ≥ 3`, weź surf węzła i jego wachlarz wierzchołków `Verts[iVertPool … +NumVertices]`, zmapuj każdy na `Points[pVertex]` i wykonaj triangulację wachlarzową. UV używają rzutowania płaskiego Unreala, tego samego pomysłu co vS/vT w texinfo GoldSrc:

```
Base = Points[surf.pBase];  Uax = Vectors[surf.vTextureU];  Vax = Vectors[surf.vTextureV];
for vertex P:  u = dot(P−Base, Uax) / Texture.USize ;  v = dot(P−Base, Vax) / Texture.VSize
```

Ostrożnie tutaj: `pBase` indeksuje **Points**, podczas gdy `vNormal/vTextureU/vTextureV` indeksują **Vectors** — dwie różne tablice. Pomijam powierzchnie oflagowane `PF_Invisible`, `PF_Portal` lub `PF_FakeBackdrop` (te ostatnie to powierzchnie "okna nieba", omówione niżej przy skyboxie).

### 2.4 Tekstury (`.utx`, ten sam format pakietu)

Obiekt `Texture` to otagowany blok właściwości (`Format`, `USize`, `VSize`, referencja `Palette`, `bMasked`, `bAlphaTexture`…), po którym następuje natywny trailer, `Mips : TArray<FMipmap>`. Każda `FMipmap`:

```
int  SkipPos          — lazy-array offset (present for ArVer>61); read and ignore
TArray<byte> Data     — cidx N + N bytes of pixel/block data
int  USize, int VSize
byte UBits, byte VBits
```

Długość `Data`: DXT to `ceil(U/4)*ceil(V/4)*(8|16)`; P8/L8 to `U*V`; RGB8 to `U*V*3`; RGBA8 to `U*V*4`; G16 (mapy wysokości terenu) to `U*V*2`.

`Format` (ETextureFormat, UE2): `0=P8, 3=DXT1, 4=RGB8 (BGR on disk), 5=RGBA8 (BGRA on disk), 7=DXT3, 8=DXT5, 9=L8, 10=G16`. Większość tekstur KF to DXT1/3/5, które trafiają prosto na GPU przez `WEBGL_compressed_texture_s3tc` bez dekodowania. P8 potrzebuje `UPalette` (`TArray<FColor>` 256 elementów, kolejność bajtów RGBA; przy `bMasked` indeks 0 jest przezroczysty). Maskowany DXT1 niesie 1-bitową alfę, więc idzie w górę jako RGBA_DXT1.

### 2.5 Sprowadzanie materiału powierzchni do `.utx`

`surf.Material` to referencja ze znakiem do rekordu importu `{ ObjectName, ClassName, Outer }`. Przejdź łańcuch `Outer` do pakietu najwyższego poziomu, którym jest nazwa pliku (`KillingFloorOfficeTextures.utx`); pośrednie nazwy to grupy (np. `Carpet` mieszka w grupie `OfficeCommon` wewnątrz tego pliku). Otwórz plik, znajdź eksport o tej nazwie i klasie tekstury.

Materiał jest często opakowaniem, a nie surową teksturą: `Shader`→`Diffuse`, `Combiner`→`Material1`, `FinalBlend`/`TexScaler`/`TexRotator`/`TexModifier`→`Material` i tak dalej, schodząc rekurencyjnie do pierwszej `Texture`/`BitmapMaterial`. Opakowania to zwykłe obiekty (blok właściwości → referencje do obiektów) i niosą też tryb mieszania powierzchni, który ma znaczenie dla przezroczystości (patrz §3).

### 2.6 Statyczne siatki (`UStaticMesh`) i rozmieszczenie (`StaticMeshActor`)

Mapy portowane z CS wrzucają niemal całą swoją geometrię do statycznych siatek (BSP to tylko skybox), a standardowe mapy niosą tysiące `StaticMeshActor`ów na wierzchu BSP, więc siatki nie są opcjonalne. Serializacja `UStaticMesh`:

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

Trójkąty pochodzą z `IndexStream1` pogrupowanego według sekcji (`FirstIndex … +NumFaces*3`); sekcja `i` używa `Materials[i]`; UV to `UVStream[0]` na wierzchołek, już znormalizowane.

Rekord `StaticMeshActor` to otagowany blok właściwości, ale jest poprzedzony przez `FStateFrame` (aktor ma `RF_HasStack`): `Node`(cidx), `StateNode`(cidx), `ProbeMask`(QWORD 8B), `LatentAction`(INT 4B) oraz — tylko jeśli `Node ≠ 0` — `Offset` jako **cidx**. To ostatnie kosztowało mnie wieczór: czytanie go jako int32 rozsynchronizowuje każdego aktora. Po ramce otagowane właściwości dają `StaticMesh` (objref), `Location` (Vector), `Rotation` (Rotator, 3×int32 z `rad = u·π/32768`), `DrawScale` (float), `DrawScale3D` (Vector), `PrePivot` (Vector), `bHidden`. Transformacja świata to `Location + FRotationMatrix(Rotation) · (DrawScale·DrawScale3D ∘ (v − PrePivot))`.

### 2.7 Teren (`TerrainInfo`)

Na wielu standardowych mapach ziemia to teren z mapy wysokości (`TerrainInfo` plus `TerrainSector`y), a nie BSP. Właściwości `TerrainInfo` dają `TerrainMap` (teksturę mapy wysokości G16), `TerrainScale` (Vector), `Location` (Vector) oraz strukturę `Layers[0]` z bazową `Texture` i jej `UScale`/`VScale`. Wierzchołki siatki to:

```
vertex(x,y): X = Location.X + (x − W/2)·scaleX ; Y = Location.Y + (y − H/2)·scaleY ;
             Z = Location.Z + (height16 − 32768)·scaleZ / 256
```

## 3. Jak przeglądarka to rysuje

To jeden samowystarczalny plik HTML plus Three.js (dołączony, więc działa offline z `file://`), z `kfrom.js` robiącym całe parsowanie.

- **Wejście.** Przeciągnij `.rom` na okno albo wybierz jeden z folderu gry. Pakiety `.utx`/`.usx` ładują się leniwie z tego folderu; cokolwiek brakuje, jest pomijane albo pokazywane w płaskim kolorze.
- **Geometria.** `buildMesh` (BSP), `readStaticMesh`/`readStaticMeshActors` (siatki) oraz `readTerrainInfo`/`buildTerrainMesh` (teren) produkują `THREE.BufferGeometry`. Wszystko zostaje w układzie współrzędnych Unreala pod `mapRoot` obróconym o −90° wokół X (Unreal ma Z do góry, three.js ma Y do góry); instancje siatek dostają transformację aktora jako swoją macierz. Unreal jest leworęczny, a three.js praworęczny, więc nawijanie się odwraca — rysuję wszystko dwustronnie, zamiast z tym walczyć.
- **Tekstury.** DXT mip 0 idzie prosto do `THREE.CompressedTexture`; P8/RGBA8 (rzadkie) są rozwijane na CPU. Przezroczystość podąża za trybem mieszania materiału, który pochodzi z opakowania: addytywne i półprzezroczyste (`FinalBlend.FrameBufferBlending`, `Shader.OutputBlending`) dostają mieszanie na GPU, wycinane (`bMasked`, `FinalBlend.AlphaTest` albo powierzchnia `PF_Masked`) dostają test alfa. To właśnie sprawia, że deszcz, szkło, płoty i roślinność czytają się poprawnie, zamiast pokazywać czarny kwadrat.
- **Skybox.** Niebo KF to osobne małe pudełko, przez które gra patrzy przez powierzchnie `PF_FakeBackdrop`. Znajduję je jako strefę BSP, której centroid jest najbliżej aktora `SkyZoneInfo` (strefy węzłów pochodzą z `iZone`), wyciągam tę strefę do jej własnej grupy i co klatkę trzymam punkt SkyZoneInfo pod kamerą, żeby czytał się jako nieskończone tło. Zastępcze powierzchnie FakeBackdrop są usuwane z głównego poziomu, żeby prawdziwe niebo prześwitywało.
- **Oświetlenie.** Domyślnie wyłączone. Prawdziwe oświetlenie w grze jest wypieczone (patrz §4), ale jako przybliżenie czytam aktorów `Light`/`Spotlight` (kolor HSV, promień, jasność), wrzucam ich do jednorodnej siatki i wypiekam tanią sumę na wierzchołek do BSP i terenu, plus barwienie na instancję dla siatek.
- **Nakładki.** `readActors(pkg, classes)` czyta dowolną klasę aktora jako otagowane właściwości + Location, wykorzystując ponownie pomijanie ramki stanu. To napędza przełączalne znaczniki dla punktów startowych graczy (`PlayerStart`), miejsc tradera (`KFTraderTeleporter`/`ShopVolume`/`WeaponLocker`/`KFTraderDoor`) oraz węzłów ścieżek potworów (`PathNode`), rysowanych z wyłączonym testem głębi, żeby pozostawały widoczne przez ściany.
- **Kamera.** Zwykła kamera perspektywiczna z małą latającą kontrolką pointer-lock + WASD i przyciskiem resetu.

## 4. Niedoróbki / TODO

- **Dokładne oświetlenie z gry.** Przybliżone światło pochodzi z aktorów `Light`; prawdziwy wygląd jest wypieczony w mapę. Mapy oświetlenia BSP mieszkają w trailerze `Model` (`LightMap`/`LightBits`, które pomijam), a oświetlenie siatek na instancję jest w obiektach `StaticMeshInstance`. Żadne z nich nie jest jeszcze zdekodowane, a trailer Model w v128 nie jest kanonicznym układem, więc wymaga tej samej inżynierii wstecznej co układy węzłów/powierzchni.
- **Siatki nieba.** Jeśli mapa buduje swoje niebo ze statycznych siatek (sprite słońca, płaszczyzny chmur) zamiast z pudełka BSP, te nie są jeszcze przenoszone do grupy nieba.
- **Warstwy terenu.** Tylko warstwa bazowa jest oteksturowana; wielowarstwowe mieszanie alfa i warstwy dekoracyjne (siatki trawy/detali) nie są zrobione.
- **Maski w stylu płotu.** `Shader` z *osobną* teksturą krycia używa na razie własnej alfy tekstury diffuse; podpięcie tekstury krycia jako `alphaMap` wycięłoby je poprawnie.
- **Wydajność.** Duże mapy rysują jedną siatkę na aktora, więc dużo wywołań rysowania. Instancjonowanie albo scalanie by pomogło, gdyby zaczęło mieć znaczenie.

## Pliki

| Plik | Co to jest |
|------|-----------|
| `kfrom.js` | rdzeń: parsowanie pakietów UE2.5, BSP świata, statyczne siatki, teren, tekstury. Działa w przeglądarce i w Node. |
| `viewer.html` | przeglądarka: Three.js + mała latająca kamera pointer-lock/WASD. |
| `cli.js` | mały Node CLI: statystyki geometrii i eksport do OBJ. |
| `vendor/three.min.js` | Three.js r136 (MIT), dołączony, żeby przeglądarka działała offline. |

```bash
node cli.js <map.rom>            # package version, geometry counts, referenced texture packages
node cli.js <map.rom> out.obj    # + export the BSP as OBJ (opens in Blender / Windows 3D Viewer)
```

## Odnośniki

- Odniesienia do renderowania GoldSrc: `urgorri/goldsrc-bsp-viewer`, `sbuggay/bspview`, `x8BitRain/webhl`.
- Struktury i serializacja UE2: `stephank/surreal` (`Engine/Inc/UnModel.h`, `UnObj.h`), `RedPandaProjects/UnrealEngine`, `EliotVU/Unreal-Library`.
- Tekstury i siatki UE2: `gildor2/UEViewer` (`Unreal/UnrealMaterial/UnMaterial2.*`, `Unreal/UnrealMesh/UnMesh2.*` oraz `Unreal/UnObject.cpp` dla otagowanych właściwości i ramki stanu), plus opis formatu pakietu autorstwa Eliota Van Uytfanghe pod `eliotvu.com/page/unreal-package-file-format`.
- Potwierdzenie, że umodel nie obsługuje poziomów: jego własny `Docs/FAQ.md`.
