# O formato de mapa do jogo Killing Floor

[English](../RESEARCH.md) · [Русский](./RESEARCH.ru.md) · [Español](./RESEARCH.es.md) · **Português** · [Lietuvių](./RESEARCH.lt.md) · [Polski](./RESEARCH.pl.md) · [Français](./RESEARCH.fr.md) · [中文](./RESEARCH.zh.md) · [日本語](./RESEARCH.ja.md)

Estas são as minhas anotações de quando descobri o formato de mapa do Killing Floor o suficiente para desenhá-lo num navegador. O KFEd (o editor oficial) consegue abrir um mapa, mas é pesado e desajeitado se tudo o que você quer é voar por aí e olhar, então escrevi um pequeno visualizador WebGL no lugar. Tudo aqui é Unreal Engine 2.5: mapas são pacotes `.rom`, texturas são `.utx`, static meshes são `.usx`, tudo o mesmo formato de container.

A versão curta do que descobri:

- Nenhuma ferramenta existente desenha o BSP do nível. O umodel e os demais exportam assets individuais (meshes, texturas) ou os brushes de origem do editor, não o mundo compilado que você realmente vê no jogo, então a geometria do mundo tem que ser extraída à mão do objeto `Model`.
- O lado da renderização é parecido com um visualizador de BSP de Counter-Strike / GoldSrc: montar triângulos a partir das faces, subir texturas, voar com a câmera. O lado do parsing não tem nada a ver. O GoldSrc é um punhado de lumps planos; o UE2.5 é um pacote de objetos com tabelas de name/import/export, e o BSP fica dentro de um objeto `Model`.
- As peças que acabei decodificando: as tabelas do pacote, o `Model` do mundo (Vectors/Points/Nodes/Surfs/Verts), o formato de textura (layout de mips, DXT1/3/5), como o material de uma superfície é resolvido até um `.utx`, static meshes e onde elas são posicionadas, e o terreno de heightmap.

## 1. O que já existe por aí

### Visualizadores de GoldSrc / CS 1.6, para referência

O BSP do GoldSrc (versão 30) é um container simples de 15 lumps (entities, planes, vertices, nodes, texinfo, faces, edges, surfedges, models, textures, lighting…). Renderizar um deles funciona assim:

1. Parsear os lumps: header mais um diretório, cada lump um array tipado sobre o buffer.
2. Montar a mesh: para cada face, percorrer seus surfedges (índice com sinal, `+`→edge.v0, `−`→edge.v1 invertido) para obter um anel ordenado de vértices, depois fazer a triangulação em leque.
3. As UVs não são armazenadas, você as calcula: `u = (dot(P, texinfo.vS) + shiftS) / width`, mesma coisa para `v`.
4. As texturas são miptex palletizadas de 8 bits (no BSP ou num WAD externo), expandidas de índice→RGBA.
5. A câmera é pointer-lock mais WASD noclip, sem colisão.

Os visualizadores web que valem a leitura são `urgorri/goldsrc-bsp-viewer` (TypeScript + Three.js, texturas WAD, lightmaps em atlas, noclip completo), `sbuggay/bspview` (um parser mínimo + geometria + câmera), e `skyrim/hlviewer.js` / `x8BitRain/webhl` / `rein4ce/hlbsp` em WebGL puro. No lado desktop, o Crafty (Nem's Tools) e o newbspguy são boas referências para a sensação de "texturizado, voo livre".

A parte útil que se aproveita é o formato do pipeline — parser → construtor de geometria → decodificador de textura → renderizador + câmera, com o parser mantido independente do renderizador — e a câmera pointer-lock + WASD, que é basicamente o controle de exemplo do three.js.

### Unreal / KF

O umodel (Gildor's UE Viewer) lê pacotes de UT2004/KF, mas só exporta assets: skeletal e static meshes, texturas, animações. Ele não reconstrói o BSP do nível nem o terreno (não há parser de `Model`/`Level` no código dele). O UnrealEd, e `ucc batchexport … T3D`, te entregam os brushes CSG de origem como texto (FPoly), não o BSP compilado, e esse é exatamente o caminho do editor pesado que eu estava tentando evitar. O UT4X-Converter e os importadores T3D do Blender também trabalham no nível de brush/T3D. Então, para mostrar a geometria que o jogo de fato renderiza, o leitor de BSP teve que ser meu.

## 2. O formato `.rom`

Descobri os layouts abaixo lendo-os direto dos mapas distribuídos e conferindo se batem. Para o BSP a verificação é fácil: todo plano de nó deve sair como uma normal unitária, todo índice de superfície deve cair dentro do intervalo, e o polígono que você reconstrói para um nó deve ficar plano sobre o plano daquele nó. Onde eu pude cruzar um campo com fontes públicas de UE2, eu cruzei; elas estão nas referências no fim. O `kfrom.js` implementa tudo isso e roda igual no navegador e no Node.

### 2.1 Pacote

`.rom`/`.utx`/`.usx`/`.u` são pacotes UE2.5 (`file_version 128 / licensee 29`, magic `0x9E2A83C2`). Header, depois as tabelas name/import/export. Tudo é indexado com um *compact index* (primeiro byte: bit `0x80` = sinal, `0x40` = continuação, 6 bits baixos; bytes de continuação `0x80` = continuação mais 7 bits). Uma referência de objeto é um desses: `0` é null, `+n` é o export `n−1` (neste pacote), `−n` é o import `−n−1` (em algum outro pacote).

### 2.2 BSP do mundo: o objeto `Model`

A geometria do nível é o maior export `Model` marcado com `LoadForServer`. Os objetos `Model` pequenos são os brushes CSG de origem do editor e a engine nunca os carrega em tempo de jogo. Os dados do Model do mundo se organizam assim:

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

O `FBspNode` no v128 é o layout usual de UE1/UE2 mais 12 bytes finais que parecem específicos da build Red Orchestra / KF. Encontrei os bytes extras parseando N nós e conferindo se o cursor cai exatamente na contagem de `Surfs`:

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

O `FBspSurf` no v128 também difere do UE1: em vez de `PanU`/`PanV`/`Actor` ele armazena o `Plane` da superfície e um `ShadowMapScale`:

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

O `FVert` é só `pVertex` (cidx em POINTS) e `iSide` (cidx).

### 2.3 Polígonos e UVs

Percorra `Nodes`, mantenha os que têm `NumVertices ≥ 3`, pegue o surf do nó e seu leque de verts `Verts[iVertPool … +NumVertices]`, mapeie cada um para `Points[pVertex]`, e faça a triangulação em leque. As UVs usam a projeção planar do Unreal, a mesma ideia do vS/vT do texinfo do GoldSrc:

```
Base = Points[surf.pBase];  Uax = Vectors[surf.vTextureU];  Vax = Vectors[surf.vTextureV];
for vertex P:  u = dot(P−Base, Uax) / Texture.USize ;  v = dot(P−Base, Vax) / Texture.VSize
```

Cuidado aqui: `pBase` indexa **Points**, enquanto `vNormal/vTextureU/vTextureV` indexam **Vectors** — duas tabelas diferentes. Eu pulo as superfícies marcadas com `PF_Invisible`, `PF_Portal` ou `PF_FakeBackdrop` (estas últimas são as superfícies de "janela do céu", tratadas mais abaixo na parte do skybox).

### 2.4 Texturas (`.utx`, mesmo formato de pacote)

Um objeto `Texture` é um bloco de propriedades taggeadas (`Format`, `USize`, `VSize`, ref `Palette`, `bMasked`, `bAlphaTexture`…) seguido de um trailer nativo, `Mips : TArray<FMipmap>`. Cada `FMipmap`:

```
int  SkipPos          — lazy-array offset (present for ArVer>61); read and ignore
TArray<byte> Data     — cidx N + N bytes of pixel/block data
int  USize, int VSize
byte UBits, byte VBits
```

Tamanho de `Data`: DXT é `ceil(U/4)*ceil(V/4)*(8|16)`; P8/L8 é `U*V`; RGB8 é `U*V*3`; RGBA8 é `U*V*4`; G16 (heightmaps de terreno) é `U*V*2`.

`Format` (ETextureFormat, UE2): `0=P8, 3=DXT1, 4=RGB8 (BGR on disk), 5=RGBA8 (BGRA on disk), 7=DXT3, 8=DXT5, 9=L8, 10=G16`. A maioria das texturas de KF é DXT1/3/5, que vão direto para a GPU via `WEBGL_compressed_texture_s3tc` sem decodificação. P8 precisa de uma `UPalette` (`TArray<FColor>` de 256, ordem de bytes RGBA; com `bMasked`, o índice 0 é transparente). Um DXT1 masked carrega um alpha de 1 bit, então sobe como RGBA_DXT1.

### 2.5 Resolvendo o material de uma superfície até um `.utx`

`surf.Material` é uma ref com sinal para um registro de import `{ ObjectName, ClassName, Outer }`. Percorra a cadeia `Outer` até o pacote de nível superior, que é o nome do arquivo (`KillingFloorOfficeTextures.utx`); os nomes intermediários são grupos (por exemplo, `Carpet` fica no grupo `OfficeCommon` dentro daquele arquivo). Abra o arquivo, encontre o export com aquele nome e uma classe de textura.

Um material muitas vezes é um wrapper, não uma textura crua: `Shader`→`Diffuse`, `Combiner`→`Material1`, `FinalBlend`/`TexScaler`/`TexRotator`/`TexModifier`→`Material`, e assim por diante, recursando até o primeiro `Texture`/`BitmapMaterial`. Os wrappers são objetos simples (bloco de propriedades → refs de objeto), e também carregam o modo de blend da superfície, que importa para a transparência (veja §3).

### 2.6 Static meshes (`UStaticMesh`) e posicionamento (`StaticMeshActor`)

Os mapas portados do CS colocam quase toda a sua geometria em static meshes (o BSP é só um skybox), e os mapas originais carregam milhares de `StaticMeshActor`s por cima do BSP, então as meshes não são opcionais. A serialização de `UStaticMesh`:

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

Os triângulos vêm de `IndexStream1` agrupados por seção (`FirstIndex … +NumFaces*3`); a seção `i` usa `Materials[i]`; as UVs são `UVStream[0]` por vértice, já normalizadas.

Um registro `StaticMeshActor` é um bloco de propriedades taggeadas, mas é prefixado por um `FStateFrame` (o ator tem `RF_HasStack`): `Node`(cidx), `StateNode`(cidx), `ProbeMask`(QWORD 8B), `LatentAction`(INT 4B), e — só se `Node ≠ 0` — `Offset` como um **cidx**. Esse último me custou uma noite: lê-lo como int32 dessincroniza todos os atores. Depois do frame, as propriedades taggeadas dão `StaticMesh` (objref), `Location` (Vector), `Rotation` (Rotator, 3×int32 com `rad = u·π/32768`), `DrawScale` (float), `DrawScale3D` (Vector), `PrePivot` (Vector), `bHidden`. A transformação de mundo é `Location + FRotationMatrix(Rotation) · (DrawScale·DrawScale3D ∘ (v − PrePivot))`.

### 2.7 Terreno (`TerrainInfo`)

Em muitos dos mapas originais, o chão é um terreno de heightmap (`TerrainInfo` mais `TerrainSector`s), não BSP. As propriedades de `TerrainInfo` dão `TerrainMap` (uma textura de heightmap G16), `TerrainScale` (Vector), `Location` (Vector), e uma struct `Layers[0]` com a `Texture` base e seus `UScale`/`VScale`. Os vértices da grade são:

```
vertex(x,y): X = Location.X + (x − W/2)·scaleX ; Y = Location.Y + (y − H/2)·scaleY ;
             Z = Location.Z + (height16 − 32768)·scaleZ / 256
```

## 3. Como o visualizador desenha

É um único arquivo HTML autossuficiente mais o Three.js (empacotado, para rodar offline a partir de `file://`), com o `kfrom.js` fazendo todo o parsing.

- **Entrada.** Arraste um `.rom` para a janela, ou escolha um da pasta do jogo. Os pacotes `.utx`/`.usx` carregam sob demanda a partir dessa pasta; qualquer coisa faltando é pulada ou mostrada com cor chapada.
- **Geometria.** `buildMesh` (BSP), `readStaticMesh`/`readStaticMeshActors` (meshes) e `readTerrainInfo`/`buildTerrainMesh` (terreno) produzem `THREE.BufferGeometry`. Tudo fica em coordenadas do Unreal sob um `mapRoot` rotacionado −90° em torno de X (o Unreal é Z-up, o three.js é Y-up); as instâncias de mesh recebem a transformação do ator como matriz. O Unreal é left-handed e o three.js é right-handed, então o winding inverte — eu desenho tudo double-sided em vez de brigar com isso.
- **Texturas.** O mip 0 de DXT vai direto para uma `THREE.CompressedTexture`; P8/RGBA8 (raros) são expandidos na CPU. A transparência segue o modo de blend do material, que vem do wrapper: additive e translucent (`FinalBlend.FrameBufferBlending`, `Shader.OutputBlending`) recebem blending na GPU, os cutouts (`bMasked`, `FinalBlend.AlphaTest`, ou uma superfície `PF_Masked`) recebem um teste de alpha. É isso que faz chuva, vidro, cercas e folhagem aparecerem certos em vez de mostrar uma caixa preta.
- **Skybox.** Um céu de KF é uma caixinha separada que o jogo vê através das superfícies `PF_FakeBackdrop`. Eu o encontro como a zona do BSP cujo centroide está mais próximo do ator `SkyZoneInfo` (as zonas dos nós vêm de `iZone`), puxo essa zona para o seu próprio grupo, e a cada frame mantenho o ponto do SkyZoneInfo sob a câmera para que ele funcione como um fundo infinito. As superfícies FakeBackdrop de placeholder são removidas do nível principal para que o céu real apareça através delas.
- **Iluminação.** Desligada por padrão. A iluminação real no jogo é pré-calculada (veja §4), mas como aproximação eu leio os atores `Light`/`Spotlight` (cor HSV, raio, brilho), jogo-os numa grade uniforme, e faço o bake de uma soma barata por vértice no BSP e no terreno, além de uma tonalização por instância nas meshes.
- **Sobreposições.** `readActors(pkg, classes)` lê qualquer classe de ator como props taggeadas + Location, reutilizando o skip do state-frame. Isso alimenta marcadores alternáveis para os spawns dos jogadores (`PlayerStart`), pontos do trader (`KFTraderTeleporter`/`ShopVolume`/`WeaponLocker`/`KFTraderDoor`) e nós de caminho dos monstros (`PathNode`), desenhados com depth-test desligado para permanecerem visíveis através das paredes.
- **Câmera.** Uma câmera de perspectiva simples com um pequeno controle de voo pointer-lock + WASD e um botão de reset.

## 4. Arestas por aparar / TODO

- **Iluminação exata do jogo.** A luz aproximada vem dos atores `Light`; o visual real é pré-calculado no mapa. Os lightmaps do BSP ficam no trailer do `Model` (`LightMap`/`LightBits`, que eu pulo), e a iluminação por instância das meshes está nos objetos `StaticMeshInstance`. Nenhum dos dois foi decodificado ainda, e o trailer do Model no v128 não é o layout canônico, então precisa da mesma engenharia reversa que os layouts de node/surf precisaram.
- **Meshes de céu.** Se um mapa constrói o céu a partir de static meshes (um sprite de sol, planos de nuvem) em vez de uma caixa BSP, essas ainda não são movidas para o grupo do céu.
- **Camadas de terreno.** Só a camada base é texturizada; o alpha blending de múltiplas camadas e as deco layers (grama/meshes de detalhe) não estão feitos.
- **Máscaras estilo cerca.** Um `Shader` com uma textura de opacidade *separada* usa por enquanto o próprio alpha do diffuse; ligar a textura de opacidade como um `alphaMap` recortaria isso corretamente.
- **Performance.** Mapas grandes desenham uma mesh por ator, então muitas draw calls. Instancing ou merge ajudariam se isso começar a importar.

## Arquivos

| Arquivo | O que é |
|------|-----------|
| `kfrom.js` | o núcleo: parsing de pacotes UE2.5, BSP do mundo, static meshes, terreno, texturas. Roda no navegador e no Node. |
| `viewer.html` | o visualizador: Three.js + uma pequena câmera de voo com pointer-lock/WASD. |
| `cli.js` | uma pequena CLI de Node: estatísticas de geometria e exportação para OBJ. |
| `vendor/three.min.js` | Three.js r136 (MIT), empacotado para o visualizador funcionar offline. |

```bash
node cli.js <map.rom>            # package version, geometry counts, referenced texture packages
node cli.js <map.rom> out.obj    # + export the BSP as OBJ (opens in Blender / Windows 3D Viewer)
```

## Referências

- Referências de renderização GoldSrc: `urgorri/goldsrc-bsp-viewer`, `sbuggay/bspview`, `x8BitRain/webhl`.
- Structs e serialização de UE2: `stephank/surreal` (`Engine/Inc/UnModel.h`, `UnObj.h`), `RedPandaProjects/UnrealEngine`, `EliotVU/Unreal-Library`.
- Texturas e meshes de UE2: `gildor2/UEViewer` (`Unreal/UnrealMaterial/UnMaterial2.*`, `Unreal/UnrealMesh/UnMesh2.*`, e `Unreal/UnObject.cpp` para as propriedades taggeadas e o state frame), além do texto de Eliot Van Uytfanghe sobre o formato de pacote em `eliotvu.com/page/unreal-package-file-format`.
- Confirmação de que o umodel não lida com níveis: o próprio `Docs/FAQ.md` dele.
