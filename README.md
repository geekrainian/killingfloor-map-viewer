# Killing Floor Map Viewer

A small in-browser viewer for Killing Floor maps (`*.rom`, Unreal Engine 2.5). It draws the world with textures and lets you fly around, without opening the heavy KFEd editor. I worked the `.rom` format out by hand; the details are in [`RESEARCH.md`](./RESEARCH.md).

![Killing Floor Map Viewer](screenshot.jpg)

## What you need

- A local **Killing Floor** game install (the viewer reads your own game files: `.rom` maps and the `.utx`/`.usx` packages next to them).
- A recent Chromium-based browser (Chrome / Edge) — it uses the File System Access folder picker and the S3TC compressed-texture extension.

No game content ships with this repo. You point the viewer at your own install.

## Using the viewer

1. Open `viewer.html` (double-click it). It runs offline; Three.js is vendored under `vendor/`.
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
| `vendor/three.min.js` | Three.js r136 (bundled so the viewer works offline) |
| `RESEARCH.md` | notes on the `.rom` format and how the viewer renders it |

## License

This project is licensed under the **MIT License**. See [`LICENSE`](./LICENSE) for the full text.

### Third-party

- `vendor/three.min.js` — [three.js](https://threejs.org) r136, © three.js authors, MIT license. Bundled unmodified; its license notice is kept in the file.

## Trademark notice

Killing Floor and Unreal are trademarks of their respective owners (Tripwire Interactive and Epic Games). This is an unofficial, fan-made tool and is not affiliated with or endorsed by them. It ships no game assets; it only reads files from a copy of the game you already own.
