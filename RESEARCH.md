# The Killing Floor map format

**English** · [Русский](./docs/RESEARCH.ru.md) · [Español](./docs/RESEARCH.es.md) · [Português](./docs/RESEARCH.pt.md) · [Lietuvių](./docs/RESEARCH.lt.md) · [Polski](./docs/RESEARCH.pl.md) · [Français](./docs/RESEARCH.fr.md) · [中文](./docs/RESEARCH.zh.md) · [日本語](./docs/RESEARCH.ja.md)

These are my notes from working out the Killing Floor map format well enough to draw it in a browser. KFEd (the official editor) can open a map, but it is heavy and clumsy if all you want is to fly around and look, so I wrote a small WebGL viewer instead. Everything here is Unreal Engine 2.5: maps are `.rom` packages, textures are `.utx`, static meshes are `.usx`, all the same container format.

The short version of what I found:

- No existing tool draws the level BSP. umodel and the rest export individual assets (meshes, textures) or the editor's source brushes, not the compiled world you actually see in game, so the world geometry has to be pulled out of the `Model` object by hand.
- The rendering side is close to a Counter-Strike / GoldSrc BSP viewer: build triangles from faces, upload textures, fly the camera. The parsing side is nothing like it. GoldSrc is a handful of flat lumps; UE2.5 is an object package with name/import/export tables, and the BSP sits inside a `Model` object.
- The pieces I ended up decoding: the package tables, the world `Model` (Vectors/Points/Nodes/Surfs/Verts), the texture format (mip layout, DXT1/3/5), how a surface's material resolves down to a `.utx`, static meshes and where they are placed, and the heightmap terrain.

## 1. What's already out there

### GoldSrc / CS 1.6 viewers, for reference

GoldSrc BSP (version 30) is a simple container of 15 lumps (entities, planes, vertices, nodes, texinfo, faces, edges, surfedges, models, textures, lighting…). Rendering one goes:

1. Parse the lumps: header plus a directory, each lump a typed array over the buffer.
2. Assemble the mesh: for each face, walk its surfedges (signed index, `+`→edge.v0, `−`→edge.v1 reversed) to get an ordered vertex ring, then fan-triangulate.
3. UVs are not stored, you compute them: `u = (dot(P, texinfo.vS) + shiftS) / width`, same for `v`.
4. Textures are 8-bit palettized miptex (in the BSP or in an external WAD), expanded index→RGBA.
5. Camera is pointer-lock plus WASD noclip, no collision.

The web viewers worth reading are `urgorri/goldsrc-bsp-viewer` (TypeScript + Three.js, WAD textures, atlas lightmaps, full noclip), `sbuggay/bspview` (a minimal parser + geometry + camera), and `skyrim/hlviewer.js` / `x8BitRain/webhl` / `rein4ce/hlbsp` on raw WebGL. On the desktop side Crafty (Nem's Tools) and newbspguy are good references for the "textured, free-fly" feel.

The useful part that carries over is the shape of the pipeline — parser → geometry builder → texture decoder → renderer + camera, with the parser kept independent of the renderer — and the pointer-lock + WASD camera, which is basically the three.js example control.

### Unreal / KF

umodel (Gildor's UE Viewer) reads UT2004/KF packages, but it only exports assets: skeletal and static meshes, textures, animations. It does not reconstruct the level BSP or terrain (there is no `Model`/`Level` parser in its source). UnrealEd, and `ucc batchexport … T3D`, hand you the source CSG brushes as text (FPoly), not the compiled BSP, and that is exactly the heavy editor route I was trying to skip. UT4X-Converter and the Blender T3D importers also work at the brush/T3D level. So to show the geometry the game actually renders, the BSP reader had to be my own.

## 2. The `.rom` format

I worked the layouts below out by reading them straight off the shipped maps and checking they hold up. For the BSP the check is easy: every node plane should come out as a unit normal, every surface index should land in range, and the polygon you rebuild for a node should sit flat on that node's plane. Where I could cross-check a field against public UE2 sources I did; those are in the references at the end. `kfrom.js` implements all of it and runs the same in the browser and in Node.

### 2.1 Package

`.rom`/`.utx`/`.usx`/`.u` are UE2.5 packages (`file_version 128 / licensee 29`, magic `0x9E2A83C2`). Header, then name/import/export tables. Everything is indexed with a *compact index* (first byte: bit `0x80` = sign, `0x40` = continue, low 6 bits; continuation bytes `0x80` = continue plus 7 bits). An object reference is one of those: `0` is null, `+n` is export `n−1` (in this package), `−n` is import `−n−1` (in some other package).

### 2.2 World BSP: the `Model` object

The level geometry is the largest `Model` export flagged `LoadForServer`. The small `Model` objects are the editor's source CSG brushes and the engine never loads them at play time. The world Model's data lays out like this:

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

`FBspNode` in v128 is the usual UE1/UE2 layout plus 12 trailing bytes that seem specific to the Red Orchestra / KF build. I found the extra bytes by parsing N nodes and checking the cursor lands exactly on the `Surfs` count:

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

`FBspSurf` in v128 also differs from UE1: instead of `PanU`/`PanV`/`Actor` it stores the surface `Plane` and a `ShadowMapScale`:

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

`FVert` is just `pVertex` (cidx into POINTS) and `iSide` (cidx).

### 2.3 Polygons and UVs

Walk `Nodes`, keep the ones with `NumVertices ≥ 3`, take the node's surf and its fan of verts `Verts[iVertPool … +NumVertices]`, map each to `Points[pVertex]`, and fan-triangulate. UVs use Unreal's planar projection, the same idea as GoldSrc's texinfo vS/vT:

```
Base = Points[surf.pBase];  Uax = Vectors[surf.vTextureU];  Vax = Vectors[surf.vTextureV];
for vertex P:  u = dot(P−Base, Uax) / Texture.USize ;  v = dot(P−Base, Vax) / Texture.VSize
```

Careful here: `pBase` indexes **Points**, while `vNormal/vTextureU/vTextureV` index **Vectors** — two different tables. I skip surfaces flagged `PF_Invisible`, `PF_Portal`, or `PF_FakeBackdrop` (the last are the "sky window" surfaces, covered below under the skybox).

### 2.4 Textures (`.utx`, same package format)

A `Texture` object is a tagged property block (`Format`, `USize`, `VSize`, `Palette` ref, `bMasked`, `bAlphaTexture`…) followed by a native trailer, `Mips : TArray<FMipmap>`. Each `FMipmap`:

```
int  SkipPos          — lazy-array offset (present for ArVer>61); read and ignore
TArray<byte> Data     — cidx N + N bytes of pixel/block data
int  USize, int VSize
byte UBits, byte VBits
```

`Data` length: DXT is `ceil(U/4)*ceil(V/4)*(8|16)`; P8/L8 is `U*V`; RGB8 is `U*V*3`; RGBA8 is `U*V*4`; G16 (terrain heightmaps) is `U*V*2`.

`Format` (ETextureFormat, UE2): `0=P8, 3=DXT1, 4=RGB8 (BGR on disk), 5=RGBA8 (BGRA on disk), 7=DXT3, 8=DXT5, 9=L8, 10=G16`. Most KF textures are DXT1/3/5, which go straight to the GPU via `WEBGL_compressed_texture_s3tc` with no decode. P8 needs a `UPalette` (`TArray<FColor>` of 256, byte order RGBA; with `bMasked`, index 0 is transparent). A masked DXT1 carries a 1-bit alpha so it goes up as RGBA_DXT1.

### 2.5 Resolving a surface's material to a `.utx`

`surf.Material` is a signed ref into an import record `{ ObjectName, ClassName, Outer }`. Walk the `Outer` chain to the top-level package, which is the filename (`KillingFloorOfficeTextures.utx`); the intermediate names are groups (e.g. `Carpet` lives in group `OfficeCommon` inside that file). Open the file, find the export with that name and a texture class.

A material is often a wrapper, not a raw texture: `Shader`→`Diffuse`, `Combiner`→`Material1`, `FinalBlend`/`TexScaler`/`TexRotator`/`TexModifier`→`Material`, and so on, recursing down to the first `Texture`/`BitmapMaterial`. The wrappers are plain objects (property block → object refs), and they also carry the surface's blend mode, which matters for transparency (see §3).

### 2.6 Static meshes (`UStaticMesh`) and placement (`StaticMeshActor`)

CS-port maps put nearly all of their geometry into static meshes (the BSP is just a skybox), and the stock maps carry thousands of `StaticMeshActor`s on top of the BSP, so meshes are not optional. The `UStaticMesh` serialization:

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

Triangles come from `IndexStream1` grouped by section (`FirstIndex … +NumFaces*3`); section `i` uses `Materials[i]`; UVs are `UVStream[0]` per vertex, already normalized.

A `StaticMeshActor` record is a tagged property block, but it is prefixed by an `FStateFrame` (the actor has `RF_HasStack`): `Node`(cidx), `StateNode`(cidx), `ProbeMask`(QWORD 8B), `LatentAction`(INT 4B), and — only if `Node ≠ 0` — `Offset` as a **cidx**. That last one cost me an evening: reading it as an int32 desyncs every actor. After the frame the tagged properties give `StaticMesh` (objref), `Location` (Vector), `Rotation` (Rotator, 3×int32 with `rad = u·π/32768`), `DrawScale` (float), `DrawScale3D` (Vector), `PrePivot` (Vector), `bHidden`. The world transform is `Location + FRotationMatrix(Rotation) · (DrawScale·DrawScale3D ∘ (v − PrePivot))`.

### 2.7 Terrain (`TerrainInfo`)

On a lot of the stock maps the ground is a heightmap terrain (`TerrainInfo` plus `TerrainSector`s), not BSP. The `TerrainInfo` properties give `TerrainMap` (a G16 heightmap texture), `TerrainScale` (Vector), `Location` (Vector), and a `Layers[0]` struct with the base `Texture` and its `UScale`/`VScale`. The grid vertices are:

```
vertex(x,y): X = Location.X + (x − W/2)·scaleX ; Y = Location.Y + (y − H/2)·scaleY ;
             Z = Location.Z + (height16 − 32768)·scaleZ / 256
```

## 3. How the viewer draws it

It is one self-contained HTML file plus Three.js (vendored, so it runs offline from `file://`), with `kfrom.js` doing all the parsing.

- **Input.** Drag a `.rom` onto the window, or pick one from the game folder. The `.utx`/`.usx` packages load lazily from that folder; anything missing is skipped or shown flat-colored.
- **Geometry.** `buildMesh` (BSP), `readStaticMesh`/`readStaticMeshActors` (meshes), and `readTerrainInfo`/`buildTerrainMesh` (terrain) produce `THREE.BufferGeometry`. Everything stays in Unreal coordinates under a `mapRoot` rotated −90° about X (Unreal is Z-up, three.js is Y-up); mesh instances get the actor transform as their matrix. Unreal is left-handed and three.js is right-handed, so winding flips — I draw everything double-sided rather than fight it.
- **Textures.** DXT mip 0 goes straight to a `THREE.CompressedTexture`; P8/RGBA8 (rare) are expanded on the CPU. Transparency follows the material's blend mode, which comes from the wrapper: additive and translucent (`FinalBlend.FrameBufferBlending`, `Shader.OutputBlending`) get GPU blending, cutouts (`bMasked`, `FinalBlend.AlphaTest`, or a `PF_Masked` surface) get an alpha test. This is what makes rain, glass, fences and foliage read right instead of showing a black box.
- **Skybox.** A KF sky is a separate little box the game views through the `PF_FakeBackdrop` surfaces. I find it as the BSP zone whose centroid is nearest the `SkyZoneInfo` actor (node zones come from `iZone`), pull that zone into its own group, and each frame keep the SkyZoneInfo point under the camera so it reads as an infinite backdrop. The placeholder FakeBackdrop surfaces are dropped from the main level so the real sky shows through.
- **Lighting.** Off by default. The real in-game lighting is baked (see §4), but as an approximation I read the `Light`/`Spotlight` actors (HSV colour, radius, brightness), drop them into a uniform grid, and bake a cheap per-vertex sum into the BSP and terrain, plus a per-instance tint on meshes.
- **Overlays.** `readActors(pkg, classes)` reads any actor class as tagged props + Location, reusing the state-frame skip. That drives toggleable markers for player spawns (`PlayerStart`), trader spots (`KFTraderTeleporter`/`ShopVolume`/`WeaponLocker`/`KFTraderDoor`) and monster path nodes (`PathNode`), drawn depth-test-off so they stay visible through walls.
- **Camera.** A plain perspective camera with a small pointer-lock + WASD fly control and a reset button.

## 4. Rough edges / TODO

- **Exact in-game lighting.** The approximate light is from the `Light` actors; the real look is baked into the map. The BSP lightmaps live in the `Model` trailer (`LightMap`/`LightBits`, which I skip), and the per-instance mesh lighting is in the `StaticMeshInstance` objects. Neither is decoded yet, and the v128 Model trailer is not the canonical layout, so it needs the same reverse-engineering the node/surf layouts did.
- **Sky meshes.** If a map builds its sky from static meshes (a sun sprite, cloud planes) rather than a BSP box, those are not moved into the sky group yet.
- **Terrain layers.** Only the base layer is textured; the multi-layer alpha blending and the deco layers (grass/detail meshes) are not done.
- **Fence-style masks.** A `Shader` with a *separate* opacity texture uses the diffuse's own alpha for now; wiring the opacity texture in as an `alphaMap` would cut those out properly.
- **Perf.** Big maps draw one mesh per actor, so a lot of draw calls. Instancing or merging would help if it starts to matter.

## Files

| File | What it is |
|------|-----------|
| `kfrom.js` | the core: UE2.5 package parsing, world BSP, static meshes, terrain, textures. Runs in the browser and in Node. |
| `viewer.html` | the viewer: Three.js + a small pointer-lock/WASD fly camera. |
| `cli.js` | a small Node CLI: geometry stats and OBJ export. |
| `vendor/three.min.js` | Three.js r136 (MIT), vendored so the viewer works offline. |

```bash
node cli.js <map.rom>            # package version, geometry counts, referenced texture packages
node cli.js <map.rom> out.obj    # + export the BSP as OBJ (opens in Blender / Windows 3D Viewer)
```

## References

- GoldSrc render references: `urgorri/goldsrc-bsp-viewer`, `sbuggay/bspview`, `x8BitRain/webhl`.
- UE2 structs and serialization: `stephank/surreal` (`Engine/Inc/UnModel.h`, `UnObj.h`), `RedPandaProjects/UnrealEngine`, `EliotVU/Unreal-Library`.
- UE2 textures and meshes: `gildor2/UEViewer` (`Unreal/UnrealMaterial/UnMaterial2.*`, `Unreal/UnrealMesh/UnMesh2.*`, and `Unreal/UnObject.cpp` for tagged properties and the state frame), plus Eliot Van Uytfanghe's package-format writeup at `eliotvu.com/page/unreal-package-file-format`.
- Confirmation that umodel does not do levels: its own `Docs/FAQ.md`.
