# Killing Floor Map Viewer

[English](../README.md) · [Русский](./README.ru.md) · [Español](./README.es.md) · [Português](./README.pt.md) · **Lietuvių** · [Polski](./README.pl.md) · [Français](./README.fr.md) · [中文](./README.zh.md) · [日本語](./README.ja.md)

Darbalaukio programa (Windows / macOS / Linux) — Killing Floor žemėlapių peržiūros įrankis (`*.rom`, Unreal Engine 2.5). Jis piešia pasaulį su tekstūromis ir leidžia po jį skraidyti neatidarant sunkaus KFEd redaktoriaus. Tas pats peržiūros įrankis veikia ir kaip vienas `viewer.html` puslapis naršyklėje. `.rom` formatą iššifravau savo rankomis; visos detalės — [`RESEARCH.lt.md`](./RESEARCH.lt.md) faile.

![Killing Floor Map Viewer](../screenshot.jpg)

## Ko reikia

- Vietinės **Killing Floor** žaidimo instaliacijos (peržiūros įrankis skaito tavo paties žaidimo failus: `.rom` žemėlapius ir šalia esančius `.utx`/`.usx` paketus).
- Arba toliau esančios **darbalaukio programos**, arba naujesnės Chromium pagrindo naršyklės (Chrome / Edge) — peržiūros įrankis naudoja aplankų parinkiklį ir S3TC suspaustų tekstūrų plėtinį.

Su šia repozitorija joks žaidimo turinys nepateikiamas. Peržiūros įrankį nukreipi į savo paties instaliaciją.

## Darbalaukio programa (Windows / macOS / Linux)

Iš anksto sukompiliuotos, savarankiškos programos yra [Releases](https://github.com/geekrainian/killingfloor-map-viewer/releases) puslapyje — naršyklės nereikia:

- **Windows** — `…-setup.exe` (diegimo programa) arba `…-portable.exe` (paleidžiama nediegiant).
- **macOS** — `…-mac-x64.dmg` (Intel) arba `…-mac-arm64.dmg` (Apple Silicon).
- **Linux** — `…-linux-x64.AppImage` (paleidžiama bet kur) arba `…-linux-x64.deb`.

Jos supakuoja lygiai tą patį peržiūros įrankį į [Electron](https://www.electronjs.org/); valdymas ir darbo eiga tokie patys kaip toliau aprašytoje naršyklės versijoje. Šie dariniai nepasirašyti, tad operacinė sistema pirmą kartą paleidžiant gali įspėti (Windows SmartScreen → *Daugiau informacijos → Vis tiek paleisti*; macOS → dešinysis pelės klavišas → *Atidaryti*).

### Susikompiliuok pats

```bash
pnpm install
pnpm start         # run the app from source
pnpm run dist      # build installers for the current OS into dist/
```

## Kaip naudotis peržiūros įrankiu

1. Atidaryk darbalaukio programą arba `viewer.html` naršyklėje (dukart spustelėk). Jis veikia be interneto; Three.js yra sudėtas į `vendor/`.
2. Spustelėk **Game folder** ir pasirink savo KF instaliacijos šakninį aplanką (`…/common/KillingFloor`). Iš karto indeksuojami tik paketų pavadinimai; `.utx`/`.usx` failai skaitomi pagal poreikį.
3. Spustelėk **Map .rom** ir pasirink žemėlapį (arba tempk `.rom` ant lango).

Valdymas: spustelėk, kad užfiksuotum pelę, `WASD` judėti, `Space`/`Ctrl` aukštyn/žemyn, `Shift` bėgti, `R` (arba mygtukas Reset view) grįžti į pradžią, `Esc` atleisti pelę.

Kairiajame skydelyje yra jungikliai `wireframe`, `BSP`, `meshes`, `terrain`, `sky` ir `light`, taip pat perdangos jungikliai `spawns`, `trader` ir `paths` (žaidėjų atsiradimo vietos, prekeivio vietos, monstrų kelio mazgai) bei judėjimo greičio slankiklis.

Ką jis piešia: pasaulio BSP (sienas/grindis/lubas), statines tinklelio geometrijas (rekvizitą ir detales — CS portų žemėlapiuose tai beveik visa geometrija) ir aukščių žemėlapio reljefą, viską su tekstūromis. Iškirptinės tekstūros (augalija, grotelės, tvoros) naudoja alfa testą; stiklas, lietus ir kiti maišyti efektai seka medžiagos maišymo režimą. Dangaus dėžė yra tikroji žemėlapio `SkyZoneInfo` zona, piešiama kaip prie kameros pririštas fonas, o vietoje laikomos „dangaus lango“ paviršiaus sritys pašalinamos, kad pro jas matytųsi dangus. `light` jungiklis iškepa apytikslį apšvietimo perėjimą iš žemėlapio Light/Spotlight aktorių — pagal numatymą jis išjungtas ir tai nėra tikrieji žaidimo iškepti šviesos žemėlapiai.

Keletas neaptašytų vietų išvardytos [`RESEARCH.lt.md`](./RESEARCH.lt.md) pabaigoje. Ypač: tinkleliai, kurių `.usx` neįdiegtas, praleidžiami (parodoma žurnale), o reljefo aukštis naudoja standartinį UE2 atvaizdavimą, tad jei žemėlapio reljefas atrodo per plokščias ar per aukštas, dalikliai kode yra reguliavimo rankenėlė.

## CLI (Node)

```bash
node cli.js <map.rom>            # package version, geometry counts, referenced texture packages
node cli.js <map.rom> out.obj    # + export the BSP as OBJ (opens in Blender / Windows 3D Viewer)
```

OBJ turi pozicijas, briaunas ir UV, bet neturi tekstūrų — greitas būdas patikrinti geometriją bet kuriame 3D įrankyje.

## Failai

| Failas | Kas tai |
|------|-----------|
| `viewer.html` | peržiūros įrankis (Three.js + nedidelė pointer-lock/WASD skraidymo kamera) |
| `kfrom.js` | branduolys: UE2.5 paketų analizė, pasaulio BSP, statiniai tinkleliai, reljefas, tekstūros (naršyklėje ir Node) |
| `cli.js` | Node CLI: statistika ir OBJ eksportas |
| `electron/main.js` | Electron apvalkalas, kuriame `viewer.html` veikia kaip darbalaukio programa |
| `vendor/three.min.js` | Three.js r136 (sudėtas, kad peržiūros įrankis veiktų be interneto) |
| `RESEARCH.md` | užrašai apie `.rom` formatą ir kaip peržiūros įrankis jį atvaizduoja |

## Licencija

Šis projektas licencijuotas pagal **MIT License**. Visą tekstą žr. [`LICENSE`](../LICENSE).

### Trečiųjų šalių

- `vendor/three.min.js` — [three.js](https://threejs.org) r136, © three.js authors, MIT licencija. Sudėta be pakeitimų; jos licencijos pranešimas paliktas faile.

## Prekės ženklo pastaba

Killing Floor ir Unreal yra atitinkamų savininkų (Tripwire Interactive ir Epic Games) prekės ženklai. Tai neoficialus, gerbėjų sukurtas įrankis, nesusijęs su jais ir jų nepatvirtintas. Jis nepateikia jokių žaidimo išteklių; jis tik skaito failus iš tavo jau turimos žaidimo kopijos.
