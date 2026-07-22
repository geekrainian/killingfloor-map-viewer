# Killing Floor Map Viewer

[English](../README.md) · [Русский](./README.ru.md) · [Español](./README.es.md) · [Português](./README.pt.md) · [Lietuvių](./README.lt.md) · [Polski](./README.pl.md) · **Français** · [中文](./README.zh.md) · [日本語](./README.ja.md)

Une application de bureau (Windows / macOS / Linux) pour visualiser les cartes du jeu Killing Floor (`*.rom`, Unreal Engine 2.5). Il dessine le monde avec ses textures et te laisse voler librement, sans ouvrir le lourd éditeur KFEd. Le même visualiseur tourne aussi comme une simple page `viewer.html` dans le navigateur. J'ai décortiqué le format `.rom` à la main ; les détails sont dans [`RESEARCH.md`](./RESEARCH.fr.md).

![Killing Floor Map Viewer](../screenshot.jpg)

## Ce dont tu as besoin

- Une installation locale du jeu **Killing Floor** (le visualiseur lit tes propres fichiers de jeu : les cartes `.rom` et les paquets `.utx`/`.usx` qui les accompagnent).
- Soit l'**application de bureau** ci-dessous, soit un navigateur récent basé sur Chromium (Chrome / Edge) — le visualiseur utilise le sélecteur de dossier et l'extension de textures compressées S3TC.

Aucun contenu du jeu n'est fourni avec ce dépôt. Tu pointes le visualiseur vers ta propre installation.

## Application de bureau (Windows / macOS / Linux)

Des applications précompilées et autonomes sont disponibles sur la page [Releases](https://github.com/geekrainian/killingfloor-map-viewer/releases) — aucun navigateur nécessaire :

- **Windows** — `…-setup.exe` (installateur) ou `…-portable.exe` (à lancer sans installation).
- **macOS** — `…-mac-x64.dmg` (Intel) ou `…-mac-arm64.dmg` (Apple Silicon).
- **Linux** — `…-linux-x64.AppImage` (à lancer n'importe où) ou `…-linux-x64.deb`.

Elles embarquent exactement le même visualiseur dans [Electron](https://www.electronjs.org/) ; les contrôles et le fonctionnement sont identiques à la version navigateur ci-dessous. Les builds ne sont pas signés, donc le système d'exploitation peut afficher un avertissement au premier lancement (Windows SmartScreen → *Informations complémentaires → Exécuter quand même* ; macOS → clic droit → *Ouvrir*).

### Le compiler soi-même

```bash
pnpm install
pnpm start         # run the app from source
pnpm run dist      # build installers for the current OS into dist/
```

## Utiliser le visualiseur

1. Ouvre l'application de bureau, ou ouvre `viewer.html` dans un navigateur (double-clic dessus). Il fonctionne hors ligne ; Three.js est embarqué dans `vendor/`.
2. Clique sur **Game folder** et choisis la racine de ton installation KF (`…/common/KillingFloor`). Seuls les noms de paquets sont indexés au départ ; les fichiers `.utx`/`.usx` sont lus à la demande.
3. Clique sur **Map .rom** et choisis une carte (ou glisse un `.rom` sur la fenêtre).

Contrôles : clique pour capturer la souris, `WASD` pour bouger, `Space`/`Ctrl` pour monter/descendre, `Shift` pour sprinter, `R` (ou le bouton Reset view) pour revenir au point de départ, `Esc` pour libérer la souris.

Le panneau de gauche propose des interrupteurs pour `wireframe`, `BSP`, `meshes`, `terrain`, `sky` et `light`, plus des interrupteurs de surcouche pour `spawns`, `trader` et `paths` (points d'apparition des joueurs, emplacements du trader, nœuds de chemin des monstres), et un curseur de vitesse de déplacement.

Ce qu'il dessine : le BSP du monde (murs/sol/plafond), les static meshes (décors et détails — pour les cartes portées de CS c'est presque toute la géométrie), et le terrain heightmap, le tout texturé. Les textures découpées (feuillage, grilles, clôtures) utilisent un alpha test ; le verre, la pluie et les autres effets mélangés suivent le blend mode du matériau. La skybox est la vraie zone `SkyZoneInfo` de la carte dessinée comme un décor verrouillé à la caméra, les surfaces « fenêtres de ciel » de remplacement étant retirées pour qu'elle apparaisse à travers. L'interrupteur `light` calcule une passe d'éclairage approximative à partir des acteurs Light/Spotlight de la carte — il est désactivé par défaut et ne correspond pas aux lightmaps précalculées exactes du jeu.

Quelques limitations sont listées à la fin de [`RESEARCH.md`](./RESEARCH.fr.md). Notamment : les meshes dont le `.usx` n'est pas installé sont ignorés (indiqués dans le journal), et la hauteur du terrain utilise le mapping standard UE2, donc si le terrain d'une carte paraît trop plat ou trop haut, le diviseur dans le code est le bouton de réglage.

## CLI (Node)

```bash
node cli.js <map.rom>            # package version, geometry counts, referenced texture packages
node cli.js <map.rom> out.obj    # + export the BSP as OBJ (opens in Blender / Windows 3D Viewer)
```

L'OBJ contient les positions, les faces et les UV mais pas de textures — une façon rapide de vérifier la géométrie dans n'importe quel outil 3D.

## Fichiers

| Fichier | Ce que c'est |
|------|-----------|
| `viewer.html` | le visualiseur (Three.js + une petite caméra libre pointer-lock/WASD) |
| `kfrom.js` | le cœur : parsing des paquets UE2.5, BSP du monde, static meshes, terrain, textures (navigateur et Node) |
| `cli.js` | CLI Node : statistiques et export OBJ |
| `electron/main.js` | enveloppe Electron qui héberge `viewer.html` comme application de bureau |
| `vendor/three.min.js` | Three.js r136 (embarqué pour que le visualiseur fonctionne hors ligne) |
| `RESEARCH.md` | notes sur le format `.rom` et sur la façon dont le visualiseur le rend |

## Licence

Ce projet est sous licence **MIT License**. Voir [`LICENSE`](../LICENSE) pour le texte complet.

### Tierces parties

- `vendor/three.min.js` — [three.js](https://threejs.org) r136, © three.js authors, licence MIT. Embarqué sans modification ; son avis de licence est conservé dans le fichier.

## Avis de marque déposée

Killing Floor et Unreal sont des marques déposées de leurs propriétaires respectifs (Tripwire Interactive et Epic Games). Ceci est un outil non officiel, fait par un fan, sans aucune affiliation ni approbation de leur part. Il ne fournit aucun asset du jeu ; il lit uniquement les fichiers d'une copie du jeu que tu possèdes déjà.
