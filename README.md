# Killing Floor Map Viewer

**English** · [Русский](./docs/README.ru.md) · [Español](./docs/README.es.md) · [Português](./docs/README.pt.md) · [Lietuvių](./docs/README.lt.md) · [Polski](./docs/README.pl.md) · [Français](./docs/README.fr.md) · [中文](./docs/README.zh.md) · [日本語](./docs/README.ja.md)

A desktop app (Windows / macOS / Linux) for viewing Killing Floor game maps (`*.rom`, Unreal Engine 2.5). It draws the world with textures and lets you fly around, without opening the heavy KFEd editor. The same viewer also runs as a single `viewer.html` page in the browser. I worked the `.rom` format out by hand; the details are in [`RESEARCH.md`](./RESEARCH.md).

![Killing Floor Map Viewer](screenshot.jpg)

## What you need

- A local **Killing Floor** game install (the viewer reads your own game files: `.rom` maps and the `.utx`/`.usx` packages next to them).
- Either the **desktop app** below, or a recent Chromium-based browser (Chrome / Edge) — the viewer uses the folder picker and the S3TC compressed-texture extension.

No game content ships with this repo. You point the viewer at your own install.

## Desktop app (Windows / macOS / Linux)

Prebuilt, self-contained apps are on the [Releases](https://github.com/geekrainian/killingfloor-map-viewer/releases) page — no browser needed:

- **Windows** — `…-setup.exe` (installer) or `…-portable.exe` (run without installing).
- **macOS** — `…-mac-x64.dmg` (Intel) or `…-mac-arm64.dmg` (Apple Silicon).
- **Linux** — `…-linux-x64.AppImage` (run anywhere) or `…-linux-x64.deb`.

They wrap the exact same viewer in [Electron](https://www.electronjs.org/); the controls and workflow are identical to the browser version below. The builds are unsigned, so the OS may warn on first launch (Windows SmartScreen → *More info → Run anyway*; macOS → right-click → *Open*).

### Build it yourself

```bash
pnpm install
pnpm start         # run the app from source
pnpm run dist      # build installers for the current OS into dist/
```

## Using the viewer

1. Open the desktop app, or open `viewer.html` in a browser (double-click it). It runs offline; Three.js is vendored under `vendor/`.
2. Click **Game folder** and pick your KF install root (`…/common/KillingFloor`). Only the package names are indexed up front; `.utx`/`.usx` files are read on demand.
3. Click **Map .rom** and choose a map (or drag a `.rom` onto the window).

Controls: click to capture the mouse, `WASD` to move, `Space`/`Ctrl` for up/down, `Shift` to sprint, `R` (or the Reset view button) to return to the start, `Esc` to release the mouse.

The left panel has toggles for `wireframe`, `BSP`, `meshes`, `terrain`, `sky` and `light`, plus overlay toggles for `spawns`, `trader` and `paths` (player starts, trader spots, monster path nodes), and a movement-speed slider.

What it draws: the world BSP (walls/floor/ceiling), static meshes (props and detail — for the CS-port maps this is nearly all the geometry), and heightmap terrain, all textured. Cutout textures (foliage, grilles, fences) use an alpha test; glass, rain and other blended effects follow the material's blend mode. The skybox is the map's real `SkyZoneInfo` zone drawn as a camera-locked backdrop, with the placeholder "sky window" surfaces dropped so it shows through. The `light` toggle bakes an approximate lighting pass from the map's Light/Spotlight actors — it is off by default and is not the game's exact baked lightmaps.

A few rough edges are listed at the end of [`RESEARCH.md`](./RESEARCH.md). Notably: meshes whose `.usx` isn't installed are skipped (shown in the log), and terrain height uses the standard UE2 mapping, so if a map's terrain looks too flat or too tall the divisor in the code is the knob.

## CLI (Node)

```bash
node cli.js <map.rom>            # package version, geometry counts, referenced texture packages
node cli.js <map.rom> out.obj    # + export the BSP as OBJ (opens in Blender / Windows 3D Viewer)
```

The OBJ has positions, faces and UVs but no textures — a quick way to check geometry in any 3D tool.

## Files

| File | What it is |
|------|-----------|
| `viewer.html` | the viewer (Three.js + a small pointer-lock/WASD fly camera) |
| `kfrom.js` | the core: UE2.5 package parsing, world BSP, static meshes, terrain, textures (browser & Node) |
| `cli.js` | Node CLI: stats and OBJ export |
| `electron/main.js` | Electron shell that hosts `viewer.html` as a desktop app |
| `vendor/three.min.js` | Three.js r136 (bundled so the viewer works offline) |
| `RESEARCH.md` | notes on the `.rom` format and how the viewer renders it |

## License

This project is licensed under the **MIT License**. See [`LICENSE`](./LICENSE) for the full text.

### Third-party

- `vendor/three.min.js` — [three.js](https://threejs.org) r136, © three.js authors, MIT license. Bundled unmodified; its license notice is kept in the file.

## Trademark notice

Killing Floor and Unreal are trademarks of their respective owners (Tripwire Interactive and Epic Games). This is an unofficial, fan-made tool and is not affiliated with or endorsed by them. It ships no game assets; it only reads files from a copy of the game you already own.
