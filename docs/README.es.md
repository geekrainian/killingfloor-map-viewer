# Killing Floor Map Viewer

[English](../README.md) · [Русский](./README.ru.md) · **Español** · [Português](./README.pt.md) · [Lietuvių](./README.lt.md) · [Polski](./README.pl.md) · [Français](./README.fr.md) · [中文](./README.zh.md) · [日本語](./README.ja.md)

Una aplicación de escritorio (Windows / macOS / Linux) para ver mapas del juego de Killing Floor (`*.rom`, Unreal Engine 2.5). Dibuja el mundo con texturas y te deja volar por él, sin abrir el pesado editor KFEd. El mismo visor también funciona como una única página `viewer.html` en el navegador. Descifré el formato `.rom` a mano; los detalles están en [`RESEARCH.md`](./RESEARCH.es.md).

![Killing Floor Map Viewer](../screenshot.jpg)

## Qué necesitas

- Una instalación local del juego **Killing Floor** (el visor lee tus propios archivos del juego: mapas `.rom` y los paquetes `.utx`/`.usx` que hay junto a ellos).
- La **aplicación de escritorio** de abajo, o un navegador reciente basado en Chromium (Chrome / Edge) — el visor usa el selector de carpetas y la extensión de texturas comprimidas S3TC.

Este repositorio no incluye contenido del juego. Apuntas el visor a tu propia instalación.

## Aplicación de escritorio (Windows / macOS / Linux)

Hay aplicaciones precompiladas y autónomas en la página de [Releases](https://github.com/geekrainian/killingfloor-map-viewer/releases) — sin necesidad de navegador:

- **Windows** — `…-setup.exe` (instalador) o `…-portable.exe` (ejecutar sin instalar).
- **macOS** — `…-mac-x64.dmg` (Intel) o `…-mac-arm64.dmg` (Apple Silicon).
- **Linux** — `…-linux-x64.AppImage` (ejecutar en cualquier sitio) o `…-linux-x64.deb`.

Envuelven exactamente el mismo visor en [Electron](https://www.electronjs.org/); los controles y el flujo de trabajo son idénticos a la versión de navegador de abajo. Las compilaciones no están firmadas, así que el sistema operativo puede avisar en el primer arranque (Windows SmartScreen → *Más información → Ejecutar de todas formas*; macOS → clic derecho → *Abrir*).

### Compilarla tú mismo

```bash
pnpm install
pnpm start         # run the app from source
pnpm run dist      # build installers for the current OS into dist/
```

## Cómo usar el visor

1. Abre la aplicación de escritorio, o abre `viewer.html` en un navegador (haz doble clic). Funciona sin conexión; Three.js viene incluido en `vendor/`.
2. Haz clic en **Game folder** y elige la raíz de tu instalación de KF (`…/common/KillingFloor`). Solo se indexan por adelantado los nombres de los paquetes; los archivos `.utx`/`.usx` se leen bajo demanda.
3. Haz clic en **Map .rom** y elige un mapa (o arrastra un `.rom` sobre la ventana).

Controles: haz clic para capturar el ratón, `WASD` para moverte, `Space`/`Ctrl` para subir/bajar, `Shift` para esprintar, `R` (o el botón Reset view) para volver al inicio, `Esc` para soltar el ratón.

El panel izquierdo tiene interruptores para `wireframe`, `BSP`, `meshes`, `terrain`, `sky` y `light`, además de interruptores de superposición para `spawns`, `trader` y `paths` (puntos de aparición de jugadores, puestos del comerciante, nodos de ruta de los monstruos), y un deslizador de velocidad de movimiento.

Lo que dibuja: el BSP del mundo (paredes/suelo/techo), los static meshes (props y detalles — en los mapas portados de CS esto es casi toda la geometría), y el terreno por heightmap, todo texturizado. Las texturas recortadas (follaje, rejillas, vallas) usan un alpha test; el cristal, la lluvia y otros efectos mezclados siguen el blend mode del material. El skybox es la zona `SkyZoneInfo` real del mapa dibujada como un fondo fijado a la cámara, con las superficies de relleno de la "ventana al cielo" descartadas para que se vea a través. El interruptor `light` hornea una pasada de iluminación aproximada a partir de los actores Light/Spotlight del mapa — está desactivado por defecto y no son los lightmaps horneados exactos del juego.

Al final de [`RESEARCH.md`](./RESEARCH.es.md) hay una lista de algunas asperezas. En particular: los meshes cuyo `.usx` no está instalado se omiten (se muestran en el registro), y la altura del terreno usa el mapeo estándar de UE2, así que si el terreno de un mapa se ve demasiado plano o demasiado alto, el divisor en el código es la palanca.

## CLI (Node)

```bash
node cli.js <map.rom>            # package version, geometry counts, referenced texture packages
node cli.js <map.rom> out.obj    # + export the BSP as OBJ (opens in Blender / Windows 3D Viewer)
```

El OBJ tiene posiciones, caras y UVs pero sin texturas — una forma rápida de comprobar la geometría en cualquier herramienta 3D.

## Archivos

| Archivo | Qué es |
|------|-----------|
| `viewer.html` | el visor (Three.js + una pequeña cámara de vuelo con pointer-lock/WASD) |
| `kfrom.js` | el núcleo: parseo de paquetes UE2.5, BSP del mundo, static meshes, terreno, texturas (navegador y Node) |
| `cli.js` | CLI de Node: estadísticas y exportación a OBJ |
| `electron/main.js` | envoltorio Electron que aloja `viewer.html` como aplicación de escritorio |
| `vendor/three.min.js` | Three.js r136 (incluido para que el visor funcione sin conexión) |
| `RESEARCH.es.md` | notas sobre el formato `.rom` y cómo lo renderiza el visor |

## Licencia

Este proyecto se distribuye bajo la **Licencia MIT**. Consulta [`LICENSE`](../LICENSE) para ver el texto completo.

### Terceros

- `vendor/three.min.js` — [three.js](https://threejs.org) r136, © autores de three.js, licencia MIT. Incluido sin modificar; su aviso de licencia se conserva en el archivo.

## Aviso de marcas registradas

Killing Floor y Unreal son marcas registradas de sus respectivos propietarios (Tripwire Interactive y Epic Games). Esta es una herramienta no oficial hecha por fans, sin afiliación ni respaldo de ellos. No incluye ningún recurso del juego; solo lee archivos de una copia del juego que ya posees.
