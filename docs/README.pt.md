# Killing Floor Map Viewer

[English](../README.md) · [Русский](./README.ru.md) · [Español](./README.es.md) · **Português** · [Lietuvių](./README.lt.md) · [Polski](./README.pl.md) · [Français](./README.fr.md) · [中文](./README.zh.md) · [日本語](./README.ja.md)

Um app de desktop (Windows / macOS / Linux) para visualizar mapas de Killing Floor (`*.rom`, Unreal Engine 2.5). Ele desenha o mundo com texturas e deixa você voar por aí, sem precisar abrir o pesado editor KFEd. O mesmo visualizador também roda como uma única página `viewer.html` no navegador. Eu descobri o formato `.rom` na mão; os detalhes estão em [`RESEARCH.pt.md`](./RESEARCH.pt.md).

![Visualizador de Mapas do Killing Floor](../screenshot.jpg)

## O que você precisa

- Uma instalação local do jogo **Killing Floor** (o visualizador lê os seus próprios arquivos do jogo: mapas `.rom` e os pacotes `.utx`/`.usx` ao lado deles).
- Ou o **app de desktop** abaixo, ou um navegador recente baseado em Chromium (Chrome / Edge) — o visualizador usa o seletor de pastas e a extensão de texturas comprimidas S3TC.

Nenhum conteúdo do jogo acompanha este repositório. Você aponta o visualizador para a sua própria instalação.

## App de desktop (Windows / macOS / Linux)

Apps pré-compilados e autossuficientes estão na página de [Releases](https://github.com/geekrainian/killingfloor-map-viewer/releases) — sem precisar de navegador:

- **Windows** — `…-setup.exe` (instalador) ou `…-portable.exe` (roda sem instalar).
- **macOS** — `…-mac-x64.dmg` (Intel) ou `…-mac-arm64.dmg` (Apple Silicon).
- **Linux** — `…-linux-x64.AppImage` (roda em qualquer lugar) ou `…-linux-x64.deb`.

Eles empacotam exatamente o mesmo visualizador no [Electron](https://www.electronjs.org/); os controles e o fluxo de trabalho são idênticos aos da versão no navegador abaixo. Os builds não são assinados, então o sistema operacional pode exibir um aviso no primeiro início (Windows SmartScreen → *Mais informações → Executar assim mesmo*; macOS → clique com o botão direito → *Abrir*).

### Compile você mesmo

```bash
pnpm install
pnpm start         # run the app from source
pnpm run dist      # build installers for the current OS into dist/
```

## Usando o visualizador

1. Abra o app de desktop, ou abra `viewer.html` em um navegador (dê um duplo-clique nele). Ele roda offline; o Three.js está incluído em `vendor/`.
2. Clique em **Game folder** e escolha a raiz da sua instalação do KF (`…/common/KillingFloor`). Só os nomes dos pacotes são indexados de antemão; os arquivos `.utx`/`.usx` são lidos sob demanda.
3. Clique em **Map .rom** e escolha um mapa (ou arraste um `.rom` para a janela).

Controles: clique para capturar o mouse, `WASD` para se mover, `Space`/`Ctrl` para subir/descer, `Shift` para correr, `R` (ou o botão Reset view) para voltar ao início, `Esc` para liberar o mouse.

O painel da esquerda tem alternadores para `wireframe`, `BSP`, `meshes`, `terrain`, `sky` e `light`, além de alternadores de sobreposição para `spawns`, `trader` e `paths` (pontos de nascimento dos jogadores, pontos do trader, nós de caminho dos monstros), e um controle deslizante de velocidade de movimento.

O que ele desenha: o BSP do mundo (paredes/chão/teto), static meshes (props e detalhes — nos mapas portados do CS isso é quase toda a geometria) e o terreno de heightmap, tudo texturizado. Texturas com recorte (folhagem, grades, cercas) usam um teste de alpha; vidro, chuva e outros efeitos com blending seguem o modo de blend do material. O skybox é a zona `SkyZoneInfo` real do mapa desenhada como um fundo travado na câmera, com as superfícies de "janela do céu" (placeholder) removidas para que ele apareça através delas. O alternador `light` faz o bake de uma passada de iluminação aproximada a partir dos atores Light/Spotlight do mapa — ele fica desligado por padrão e não são os lightmaps exatos pré-calculados do jogo.

Algumas arestas ainda por aparar estão listadas no fim de [`RESEARCH.pt.md`](./RESEARCH.pt.md). Notavelmente: meshes cujo `.usx` não está instalado são puladas (aparecem no log), e a altura do terreno usa o mapeamento padrão do UE2, então se o terreno de um mapa parecer achatado ou alto demais, o divisor no código é o botão de ajuste.

## CLI (Node)

```bash
node cli.js <map.rom>            # package version, geometry counts, referenced texture packages
node cli.js <map.rom> out.obj    # + export the BSP as OBJ (opens in Blender / Windows 3D Viewer)
```

O OBJ tem posições, faces e UVs, mas sem texturas — um jeito rápido de conferir a geometria em qualquer ferramenta 3D.

## Arquivos

| Arquivo | O que é |
|------|-----------|
| `viewer.html` | o visualizador (Three.js + uma pequena câmera de voo com pointer-lock/WASD) |
| `kfrom.js` | o núcleo: parsing de pacotes UE2.5, BSP do mundo, static meshes, terreno, texturas (navegador e Node) |
| `cli.js` | CLI do Node: estatísticas e exportação para OBJ |
| `electron/main.js` | shell do Electron que hospeda o `viewer.html` como um app de desktop |
| `vendor/three.min.js` | Three.js r136 (empacotado para o visualizador funcionar offline) |
| `RESEARCH.pt.md` | notas sobre o formato `.rom` e como o visualizador o renderiza |

## Licença

Este projeto está licenciado sob a **MIT License**. Veja [`LICENSE`](../LICENSE) para o texto completo.

### Terceiros

- `vendor/three.min.js` — [three.js](https://threejs.org) r136, © three.js authors, licença MIT. Empacotado sem modificações; o aviso de licença é mantido no arquivo.

## Aviso de marcas registradas

Killing Floor e Unreal são marcas registradas dos seus respectivos donos (Tripwire Interactive e Epic Games). Esta é uma ferramenta não oficial, feita por fãs, e não é afiliada a eles nem endossada por eles. Ela não distribui nenhum asset do jogo; apenas lê arquivos de uma cópia do jogo que você já possui.
