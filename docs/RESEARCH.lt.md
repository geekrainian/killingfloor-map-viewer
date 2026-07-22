# Killing Floor žemėlapių formatas

[English](../RESEARCH.md) · [Русский](./RESEARCH.ru.md) · [Español](./RESEARCH.es.md) · [Português](./RESEARCH.pt.md) · **Lietuvių** · [Polski](./RESEARCH.pl.md) · [Français](./RESEARCH.fr.md) · [中文](./RESEARCH.zh.md) · [日本語](./RESEARCH.ja.md)

Tai mano užrašai, iššifravus Killing Floor žemėlapių formatą tiek, kad galėčiau jį nupiešti naršyklėje. KFEd (oficialus redaktorius) gali atidaryti žemėlapį, bet jis sunkus ir gremėzdiškas, jei tereikia paskraidyti ir pasižvalgyti, tad vietoj to parašiau nedidelį WebGL peržiūros įrankį. Viskas čia yra Unreal Engine 2.5: žemėlapiai yra `.rom` paketai, tekstūros yra `.utx`, statiniai tinkleliai yra `.usx`, visi tas pats konteinerio formatas.

Trumpai, ką radau:

- Joks esamas įrankis nepiešia lygio BSP. umodel ir visi kiti eksportuoja pavienius išteklius (tinklelius, tekstūras) arba redaktoriaus šaltinio brush'us, o ne sukompiliuotą pasaulį, kurį iš tikrųjų matai žaidime, tad pasaulio geometriją reikia ištraukti iš `Model` objekto rankomis.
- Atvaizdavimo pusė artima Counter-Strike / GoldSrc BSP peržiūros įrankiui: sukurk trikampius iš paviršių, įkelk tekstūras, skraidink kamerą. Analizės pusė nė iš tolo į tai nepanaši. GoldSrc yra sauja plokščių lump'ų; UE2.5 yra objektų paketas su pavadinimų/importų/eksportų lentelėmis, o BSP yra `Model` objekto viduje.
- Dalys, kurias galiausiai iššifravau: paketų lentelės, pasaulio `Model` (Vectors/Points/Nodes/Surfs/Verts), tekstūros formatas (mip išdėstymas, DXT1/3/5), kaip paviršiaus medžiaga išsprendžiama iki `.utx`, statiniai tinkleliai ir kur jie išdėstyti bei aukščių žemėlapio reljefas.

## 1. Kas jau egzistuoja

### GoldSrc / CS 1.6 peržiūros įrankiai, palyginimui

GoldSrc BSP (versija 30) yra paprastas konteineris iš 15 lump'ų (entities, planes, vertices, nodes, texinfo, faces, edges, surfedges, models, textures, lighting…). Vieno atvaizdavimas vyksta taip:

1. Išanalizuok lump'us: antraštė plius katalogas, kiekvienas lump — tipizuotas masyvas virš buferio.
2. Surink tinklelį: kiekvienam paviršiui apeik jo surfedges (ženklinis indeksas, `+`→edge.v0, `−`→edge.v1 atvirkščiai), kad gautum sutvarkytą viršūnių žiedą, tada trikampiuok vėduokle.
3. UV nėra saugomi, juos apskaičiuoji: `u = (dot(P, texinfo.vS) + shiftS) / width`, taip pat ir `v`.
4. Tekstūros yra 8 bitų paletizuotos miptex (BSP viduje arba išoriniame WAD), išplėstos indeksas→RGBA.
5. Kamera — pointer-lock plius WASD noclip, be kolizijų.

Verti perskaityti žiniatinklio peržiūros įrankiai yra `urgorri/goldsrc-bsp-viewer` (TypeScript + Three.js, WAD tekstūros, atlaso šviesos žemėlapiai, pilnas noclip), `sbuggay/bspview` (minimalus analizatorius + geometrija + kamera) ir `skyrim/hlviewer.js` / `x8BitRain/webhl` / `rein4ce/hlbsp` ant gryno WebGL. Darbalaukio pusėje Crafty (Nem's Tools) ir newbspguy yra geri „tekstūruoto, laisvo skrydžio“ pojūčio pavyzdžiai.

Naudinga dalis, kuri persikelia, yra konvejerio forma — analizatorius → geometrijos kūrėjas → tekstūrų dekoderis → atvaizdavimo variklis + kamera, laikant analizatorių nepriklausomą nuo atvaizdavimo variklio — ir pointer-lock + WASD kamera, kuri iš esmės yra three.js pavyzdžio valdiklis.

### Unreal / KF

umodel (Gildor's UE Viewer) skaito UT2004/KF paketus, bet eksportuoja tik išteklius: skeletinius ir statinius tinklelius, tekstūras, animacijas. Jis neatkuria lygio BSP ar reljefo (jo šaltiniuose nėra `Model`/`Level` analizatoriaus). UnrealEd ir `ucc batchexport … T3D` pateikia tau šaltinio CSG brush'us kaip tekstą (FPoly), o ne sukompiliuotą BSP, ir tai būtent tas sunkusis redaktoriaus kelias, kurio bandžiau išvengti. UT4X-Converter ir Blender T3D importuotojai taip pat dirba brush/T3D lygyje. Tad norint parodyti geometriją, kurią žaidimas iš tikrųjų atvaizduoja, BSP skaitytuvą teko rašyti pačiam.

## 2. `.rom` formatas

Žemiau esančius išdėstymus iššifravau skaitydamas juos tiesiai iš pateiktų žemėlapių ir tikrindamas, ar jie atitinka. BSP atveju patikra paprasta: kiekvienas mazgo plane turi išeiti kaip vienetinis normalas, kiekvienas paviršiaus indeksas turi patekti į ribas, o poligonas, kurį atkuri mazgui, turi gulėti plokščiai ant to mazgo plane. Kur galėjau sutikrinti lauką su viešais UE2 šaltiniais — tai padariau; jie yra nuorodose pabaigoje. `kfrom.js` visa tai įgyvendina ir veikia vienodai naršyklėje ir Node.

### 2.1 Paketas

`.rom`/`.utx`/`.usx`/`.u` yra UE2.5 paketai (`file_version 128 / licensee 29`, magic `0x9E2A83C2`). Antraštė, tada pavadinimų/importų/eksportų lentelės. Viskas indeksuojama *kompaktiniu indeksu* (pirmasis baitas: bitas `0x80` = ženklas, `0x40` = tęsti, žemieji 6 bitai; tęsinio baitai `0x80` = tęsti plius 7 bitai). Objekto nuoroda yra viena iš tokių: `0` yra null, `+n` yra eksportas `n−1` (šiame pakete), `−n` yra importas `−n−1` (kokiame nors kitame pakete).

### 2.2 Pasaulio BSP: `Model` objektas

Lygio geometrija yra didžiausias `Model` eksportas, pažymėtas `LoadForServer`. Maži `Model` objektai yra redaktoriaus šaltinio CSG brush'ai ir variklis niekada jų neįkelia žaidimo metu. Pasaulio Model duomenys išsidėsto taip:

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

`FBspNode` v128 versijoje yra įprastas UE1/UE2 išdėstymas plius 12 pabaigos baitų, kurie, atrodo, būdingi Red Orchestra / KF versijai. Papildomus baitus radau analizuodamas N mazgų ir tikrindamas, ar žymeklis nusileidžia tiksliai ant `Surfs` skaičiaus:

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

`FBspSurf` v128 versijoje taip pat skiriasi nuo UE1: vietoj `PanU`/`PanV`/`Actor` jis saugo paviršiaus `Plane` ir `ShadowMapScale`:

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

`FVert` yra tiesiog `pVertex` (cidx į POINTS) ir `iSide` (cidx).

### 2.3 Poligonai ir UV

Apeik `Nodes`, pasilik tuos, kurių `NumVertices ≥ 3`, paimk mazgo surf ir jo verts vėduoklę `Verts[iVertPool … +NumVertices]`, atvaizduok kiekvieną į `Points[pVertex]` ir trikampiuok vėduokle. UV naudoja Unreal plokštuminę projekciją — ta pati idėja kaip GoldSrc texinfo vS/vT:

```
Base = Points[surf.pBase];  Uax = Vectors[surf.vTextureU];  Vax = Vectors[surf.vTextureV];
for vertex P:  u = dot(P−Base, Uax) / Texture.USize ;  v = dot(P−Base, Vax) / Texture.VSize
```

Atsargiai čia: `pBase` indeksuoja **Points**, o `vNormal/vTextureU/vTextureV` indeksuoja **Vectors** — dvi skirtingos lentelės. Praleidžiu paviršius, pažymėtus `PF_Invisible`, `PF_Portal` arba `PF_FakeBackdrop` (pastarieji yra „dangaus lango“ paviršiai, aptariami toliau prie dangaus dėžės).

### 2.4 Tekstūros (`.utx`, tas pats paketo formatas)

`Texture` objektas yra pažymėtas property block (`Format`, `USize`, `VSize`, `Palette` nuoroda, `bMasked`, `bAlphaTexture`…), po kurio eina natyvi pabaiga, `Mips : TArray<FMipmap>`. Kiekvienas `FMipmap`:

```
int  SkipPos          — lazy-array offset (present for ArVer>61); read and ignore
TArray<byte> Data     — cidx N + N bytes of pixel/block data
int  USize, int VSize
byte UBits, byte VBits
```

`Data` ilgis: DXT yra `ceil(U/4)*ceil(V/4)*(8|16)`; P8/L8 yra `U*V`; RGB8 yra `U*V*3`; RGBA8 yra `U*V*4`; G16 (reljefo aukščių žemėlapiai) yra `U*V*2`.

`Format` (ETextureFormat, UE2): `0=P8, 3=DXT1, 4=RGB8 (BGR on disk), 5=RGBA8 (BGRA on disk), 7=DXT3, 8=DXT5, 9=L8, 10=G16`. Dauguma KF tekstūrų yra DXT1/3/5, kurios eina tiesiai į GPU per `WEBGL_compressed_texture_s3tc` be dekodavimo. P8 reikia `UPalette` (`TArray<FColor>` iš 256, baitų tvarka RGBA; su `bMasked` indeksas 0 yra permatomas). Pažymėtas DXT1 turi 1 bito alfą, tad įkeliamas kaip RGBA_DXT1.

### 2.5 Paviršiaus medžiagos išsprendimas iki `.utx`

`surf.Material` yra ženklinė nuoroda į importo įrašą `{ ObjectName, ClassName, Outer }`. Apeik `Outer` grandinę iki aukščiausio lygio paketo, kuris yra failo pavadinimas (`KillingFloorOfficeTextures.utx`); tarpiniai pavadinimai yra grupės (pvz., `Carpet` gyvena grupėje `OfficeCommon` tame faile). Atidaryk failą, rask eksportą su tuo pavadinimu ir tekstūros klase.

Medžiaga dažnai yra apvalkalas, o ne gryna tekstūra: `Shader`→`Diffuse`, `Combiner`→`Material1`, `FinalBlend`/`TexScaler`/`TexRotator`/`TexModifier`→`Material` ir taip toliau, rekursyviai leidžiantis iki pirmosios `Texture`/`BitmapMaterial`. Apvalkalai yra paprasti objektai (property block → object refs), ir jie taip pat neša paviršiaus maišymo režimą, kuris svarbus permatomumui (žr. §3).

### 2.6 Statiniai tinkleliai (`UStaticMesh`) ir išdėstymas (`StaticMeshActor`)

CS portų žemėlapiai deda beveik visą savo geometriją į statinius tinklelius (BSP tėra dangaus dėžė), o standartiniai žemėlapiai turi tūkstančius `StaticMeshActor`ų virš BSP, tad tinkleliai nėra neprivalomi. `UStaticMesh` serializacija:

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

Trikampiai gaunami iš `IndexStream1`, sugrupuoti pagal section (`FirstIndex … +NumFaces*3`); section `i` naudoja `Materials[i]`; UV yra `UVStream[0]` kiekvienai viršūnei, jau normalizuoti.

`StaticMeshActor` įrašas yra pažymėtas property block, bet jam iš priekio uždėtas `FStateFrame` (aktorius turi `RF_HasStack`): `Node`(cidx), `StateNode`(cidx), `ProbeMask`(QWORD 8B), `LatentAction`(INT 4B) ir — tik jei `Node ≠ 0` — `Offset` kaip **cidx**. Tas paskutinis man kainavo vieną vakarą: skaitant jį kaip int32 desinchronizuojasi kiekvienas aktorius. Po frame pažymėtos savybės duoda `StaticMesh` (objref), `Location` (Vector), `Rotation` (Rotator, 3×int32 su `rad = u·π/32768`), `DrawScale` (float), `DrawScale3D` (Vector), `PrePivot` (Vector), `bHidden`. Pasaulio transformacija yra `Location + FRotationMatrix(Rotation) · (DrawScale·DrawScale3D ∘ (v − PrePivot))`.

### 2.7 Reljefas (`TerrainInfo`)

Daugelyje standartinių žemėlapių žemė yra aukščių žemėlapio reljefas (`TerrainInfo` plius `TerrainSector`ai), o ne BSP. `TerrainInfo` savybės duoda `TerrainMap` (G16 aukščių žemėlapio tekstūra), `TerrainScale` (Vector), `Location` (Vector) ir `Layers[0]` struktūrą su baze `Texture` bei jos `UScale`/`VScale`. Tinklelio viršūnės yra:

```
vertex(x,y): X = Location.X + (x − W/2)·scaleX ; Y = Location.Y + (y − H/2)·scaleY ;
             Z = Location.Z + (height16 − 32768)·scaleZ / 256
```

## 3. Kaip peržiūros įrankis jį piešia

Tai vienas savarankiškas HTML failas plius Three.js (sudėtas, kad veiktų be interneto iš `file://`), o `kfrom.js` atlieka visą analizę.

- **Įvestis.** Tempk `.rom` ant lango arba pasirink jį iš žaidimo aplanko. `.utx`/`.usx` paketai kraunami tingiai iš to aplanko; viskas, ko trūksta, praleidžiama arba parodoma plokščia spalva.
- **Geometrija.** `buildMesh` (BSP), `readStaticMesh`/`readStaticMeshActors` (tinkleliai) ir `readTerrainInfo`/`buildTerrainMesh` (reljefas) sukuria `THREE.BufferGeometry`. Viskas lieka Unreal koordinatėse po `mapRoot`, pasuktu −90° apie X (Unreal yra Z-aukštyn, three.js yra Y-aukštyn); tinklelių egzemplioriai gauna aktoriaus transformaciją kaip savo matricą. Unreal yra kairiarankė, o three.js dešiniarankė, tad apvijimas apsiverčia — piešiu viską dvipusiškai, o ne kovoju su tuo.
- **Tekstūros.** DXT mip 0 eina tiesiai į `THREE.CompressedTexture`; P8/RGBA8 (retai) išplečiami CPU. Permatomumas seka medžiagos maišymo režimą, kuris ateina iš apvalkalo: addityvūs ir translucent (`FinalBlend.FrameBufferBlending`, `Shader.OutputBlending`) gauna GPU maišymą, iškirptiniai (`bMasked`, `FinalBlend.AlphaTest` arba `PF_Masked` paviršius) gauna alfa testą. Būtent tai leidžia lietui, stiklui, tvoroms ir augalijai atrodyti teisingai, o ne rodyti juodą dėžę.
- **Dangaus dėžė.** KF dangus yra atskira nedidelė dėžė, į kurią žaidimas žiūri pro `PF_FakeBackdrop` paviršius. Randu ją kaip BSP zoną, kurios centroidas arčiausiai `SkyZoneInfo` aktoriaus (mazgų zonos ateina iš `iZone`), įtraukiu tą zoną į jos pačios grupę ir kiekviename kadre laikau SkyZoneInfo tašką po kamera, kad ji atrodytų kaip begalinis fonas. Vietoje laikomi FakeBackdrop paviršiai pašalinami iš pagrindinio lygio, kad matytųsi tikrasis dangus.
- **Apšvietimas.** Pagal numatymą išjungtas. Tikrasis žaidimo apšvietimas yra iškeptas (žr. §4), bet kaip apytiksliavimą skaitau `Light`/`Spotlight` aktorius (HSV spalva, spindulys, ryškis), dedu juos į vienodą tinklelį ir iškepu pigų per-viršūnę sumą į BSP ir reljefą, plius per-egzempliorių atspalvį ant tinklelių.
- **Perdangos.** `readActors(pkg, classes)` skaito bet kokią aktorių klasę kaip pažymėtas savybes + Location, panaudodamas state-frame praleidimą. Tai valdo perjungiamus žymeklius žaidėjų atsiradimo vietoms (`PlayerStart`), prekeivio vietoms (`KFTraderTeleporter`/`ShopVolume`/`WeaponLocker`/`KFTraderDoor`) ir monstrų kelio mazgams (`PathNode`), piešiamus su išjungtu gylio testu, kad jie liktų matomi pro sienas.
- **Kamera.** Paprasta perspektyvos kamera su nedidele pointer-lock + WASD skraidymo valdymo priemone ir atstatymo mygtuku.

## 4. Neaptašytos vietos / TODO

- **Tikslus žaidimo apšvietimas.** Apytikslė šviesa yra iš `Light` aktorių; tikroji išvaizda iškepta į žemėlapį. BSP šviesos žemėlapiai gyvena `Model` pabaigoje (`LightMap`/`LightBits`, kuriuos praleidžiu), o per-egzempliorių tinklelių apšvietimas yra `StaticMeshInstance` objektuose. Nei vienas dar neiššifruotas, o v128 Model pabaiga nėra kanoninis išdėstymas, tad jam reikia to paties atvirkštinio inžineringo, kokio prireikė node/surf išdėstymams.
- **Dangaus tinkleliai.** Jei žemėlapis kuria savo dangų iš statinių tinklelių (saulės sprite, debesų plokštumos), o ne iš BSP dėžės, jie dar nėra perkelti į dangaus grupę.
- **Reljefo sluoksniai.** Tekstūruojamas tik bazinis sluoksnis; kelių sluoksnių alfa maišymas ir dekoro sluoksniai (žolės/detalės tinkleliai) neatlikti.
- **Tvorų stiliaus kaukės.** `Shader` su *atskira* neskaidrumo tekstūra kol kas naudoja paties diffuse alfą; neskaidrumo tekstūros prijungimas kaip `alphaMap` juos tinkamai iškirptų.
- **Našumas.** Dideli žemėlapiai piešia po vieną tinklelį kiekvienam aktoriui, tad daug draw call'ų. Instancing arba sujungimas padėtų, jei tai imtų būti aktualu.

## Failai

| Failas | Kas tai |
|------|-----------|
| `kfrom.js` | branduolys: UE2.5 paketų analizė, pasaulio BSP, statiniai tinkleliai, reljefas, tekstūros. Veikia naršyklėje ir Node. |
| `viewer.html` | peržiūros įrankis: Three.js + nedidelė pointer-lock/WASD skraidymo kamera. |
| `cli.js` | nedidelis Node CLI: geometrijos statistika ir OBJ eksportas. |
| `vendor/three.min.js` | Three.js r136 (MIT), sudėtas, kad peržiūros įrankis veiktų be interneto. |

```bash
node cli.js <map.rom>            # package version, geometry counts, referenced texture packages
node cli.js <map.rom> out.obj    # + export the BSP as OBJ (opens in Blender / Windows 3D Viewer)
```

## Nuorodos

- GoldSrc atvaizdavimo nuorodos: `urgorri/goldsrc-bsp-viewer`, `sbuggay/bspview`, `x8BitRain/webhl`.
- UE2 struktūros ir serializacija: `stephank/surreal` (`Engine/Inc/UnModel.h`, `UnObj.h`), `RedPandaProjects/UnrealEngine`, `EliotVU/Unreal-Library`.
- UE2 tekstūros ir tinkleliai: `gildor2/UEViewer` (`Unreal/UnrealMaterial/UnMaterial2.*`, `Unreal/UnrealMesh/UnMesh2.*` ir `Unreal/UnObject.cpp` pažymėtoms savybėms bei state frame), plius Eliot Van Uytfanghe paketo formato aprašymas adresu `eliotvu.com/page/unreal-package-file-format`.
- Patvirtinimas, kad umodel nedaro lygių: jo paties `Docs/FAQ.md`.
