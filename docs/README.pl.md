# Killing Floor Map Viewer

[English](../README.md) · [Русский](./README.ru.md) · [Español](./README.es.md) · [Português](./README.pt.md) · [Lietuvių](./README.lt.md) · **Polski** · [Français](./README.fr.md) · [中文](./README.zh.md) · [日本語](./README.ja.md)

Aplikacja desktopowa (Windows / macOS / Linux) do przeglądania map gry Killing Floor (`*.rom`, Unreal Engine 2.5). Rysuje świat z teksturami i pozwala latać po nim swobodnie, bez odpalania ciężkiego edytora KFEd. Ta sama przeglądarka działa też jako pojedyncza strona `viewer.html` w przeglądarce internetowej. Format `.rom` rozgryzłem ręcznie; szczegóły są w [`RESEARCH.md`](./RESEARCH.pl.md).

![Killing Floor Map Viewer](../screenshot.jpg)

## Czego potrzebujesz

- Lokalnej instalacji gry **Killing Floor** (przeglądarka czyta twoje własne pliki gry: mapy `.rom` oraz leżące obok nich pakiety `.utx`/`.usx`).
- Albo **aplikacji desktopowej** poniżej, albo świeżej przeglądarki opartej na Chromium (Chrome / Edge) — przeglądarka korzysta z okna wyboru folderu oraz z rozszerzenia skompresowanych tekstur S3TC.

To repozytorium nie zawiera żadnych zasobów gry. Wskazujesz przeglądarce swoją własną instalację.

## Aplikacja desktopowa (Windows / macOS / Linux)

Gotowe, samodzielne aplikacje znajdziesz na stronie [Releases](https://github.com/geekrainian/killingfloor-map-viewer/releases) — bez potrzeby przeglądarki:

- **Windows** — `…-setup.exe` (instalator) lub `…-portable.exe` (uruchamiane bez instalacji).
- **macOS** — `…-mac-x64.dmg` (Intel) lub `…-mac-arm64.dmg` (Apple Silicon).
- **Linux** — `…-linux-x64.AppImage` (uruchamiane wszędzie) lub `…-linux-x64.deb`.

Opakowują dokładnie tę samą przeglądarkę w [Electron](https://www.electronjs.org/); sterowanie i sposób pracy są identyczne jak w wersji przeglądarkowej poniżej. Buildy nie są podpisane, więc system może ostrzec przy pierwszym uruchomieniu (Windows SmartScreen → *Więcej informacji → Uruchom mimo to*; macOS → kliknij prawym przyciskiem → *Otwórz*).

### Zbuduj samodzielnie

```bash
pnpm install
pnpm start         # run the app from source
pnpm run dist      # build installers for the current OS into dist/
```

## Korzystanie z przeglądarki

1. Otwórz aplikację desktopową albo otwórz `viewer.html` w przeglądarce (kliknij go dwukrotnie). Działa offline; Three.js jest dołączony w `vendor/`.
2. Kliknij **Game folder** i wskaż katalog główny swojej instalacji KF (`…/common/KillingFloor`). Z góry indeksowane są tylko nazwy pakietów; pliki `.utx`/`.usx` są czytane na żądanie.
3. Kliknij **Map .rom** i wybierz mapę (albo przeciągnij `.rom` na okno).

Sterowanie: kliknij, aby przechwycić mysz, `WASD` do ruchu, `Space`/`Ctrl` w górę/w dół, `Shift` do sprintu, `R` (lub przycisk Reset view), aby wrócić na start, `Esc`, aby zwolnić mysz.

Lewy panel ma przełączniki dla `wireframe`, `BSP`, `meshes`, `terrain`, `sky` i `light`, plus przełączniki nakładek dla `spawns`, `trader` i `paths` (punkty startowe graczy, miejsca tradera, węzły ścieżek potworów) oraz suwak prędkości ruchu.

Co rysuje: BSP świata (ściany/podłoga/sufit), statyczne siatki (rekwizyty i detale — dla map portowanych z CS to niemal cała geometria) oraz teren z mapy wysokości, wszystko oteksturowane. Tekstury wycinane (roślinność, kraty, płoty) używają testu alfa; szkło, deszcz i inne efekty z mieszaniem podążają za trybem mieszania materiału. Skybox to prawdziwa strefa `SkyZoneInfo` mapy rysowana jako tło zablokowane na kamerze, przy czym zastępcze powierzchnie "okna nieba" są usuwane, żeby przez nie prześwitywało. Przełącznik `light` wypieka przybliżony przebieg oświetlenia z aktorów Light/Spotlight mapy — jest domyślnie wyłączony i nie jest dokładną wypieczoną mapą oświetlenia z gry.

Kilka niedoróbek jest wypisanych na końcu [`RESEARCH.md`](./RESEARCH.pl.md). W szczególności: siatki, których `.usx` nie jest zainstalowany, są pomijane (pokazane w logu), a wysokość terenu używa standardowego mapowania UE2, więc jeśli teren na mapie wygląda na zbyt płaski albo zbyt wysoki, dzielnik w kodzie jest pokrętłem do regulacji.

## CLI (Node)

```bash
node cli.js <map.rom>            # package version, geometry counts, referenced texture packages
node cli.js <map.rom> out.obj    # + export the BSP as OBJ (opens in Blender / Windows 3D Viewer)
```

Plik OBJ ma pozycje, ściany i UV, ale bez tekstur — szybki sposób na sprawdzenie geometrii w dowolnym narzędziu 3D.

## Pliki

| Plik | Co to jest |
|------|-----------|
| `viewer.html` | przeglądarka (Three.js + mała latająca kamera pointer-lock/WASD) |
| `kfrom.js` | rdzeń: parsowanie pakietów UE2.5, BSP świata, statyczne siatki, teren, tekstury (przeglądarka i Node) |
| `cli.js` | Node CLI: statystyki i eksport do OBJ |
| `electron/main.js` | powłoka Electron, która uruchamia `viewer.html` jako aplikację desktopową |
| `vendor/three.min.js` | Three.js r136 (dołączony, żeby przeglądarka działała offline) |
| `RESEARCH.md` | notatki o formacie `.rom` i o tym, jak przeglądarka go renderuje |

## Licencja

Ten projekt jest objęty licencją **MIT License**. Pełny tekst znajdziesz w [`LICENSE`](../LICENSE).

### Elementy firm trzecich

- `vendor/three.min.js` — [three.js](https://threejs.org) r136, © autorzy three.js, licencja MIT. Dołączony bez modyfikacji; jego nota licencyjna jest zachowana w pliku.

## Nota o znakach towarowych

Killing Floor i Unreal są znakami towarowymi ich właścicieli (Tripwire Interactive i Epic Games). To nieoficjalne, fanowskie narzędzie, niezwiązane z nimi ani przez nie nieautoryzowane. Nie dostarcza żadnych zasobów gry; czyta jedynie pliki z kopii gry, którą już posiadasz.
