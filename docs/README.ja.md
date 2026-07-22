# Killing Floor Map Viewer

[English](../README.md) · [Русский](./README.ru.md) · [Español](./README.es.md) · [Português](./README.pt.md) · [Lietuvių](./README.lt.md) · [Polski](./README.pl.md) · [Français](./README.fr.md) · [中文](./README.zh.md) · **日本語**

Killing Floor のマップ（`*.rom`、Unreal Engine 2.5）を表示する小さなブラウザ内ビューアです。重い KFEd エディタを開かずに、テクスチャ付きでワールドを描画し、その中を飛び回れます。`.rom` フォーマットは自力で解析しました。詳細は [`RESEARCH.md`](./RESEARCH.ja.md) にあります。

![Killing Floor Map Viewer](../screenshot.jpg)

## 必要なもの

- ローカルにインストールした **Killing Floor**（ビューアは自分のゲームファイル、つまり `.rom` マップとその隣にある `.utx`/`.usx` パッケージを読み込みます）。
- 最近の Chromium ベースのブラウザ（Chrome / Edge）。File System Access のフォルダ選択と S3TC 圧縮テクスチャ拡張を使います。

このリポジトリにはゲームコンテンツは一切含まれていません。自分のインストール先をビューアに指定して使います。

## ビューアの使い方

1. `viewer.html` を開きます（ダブルクリック）。オフラインで動作し、three.js は `vendor/` に同梱されています。
2. **Game folder** をクリックして KF のインストールルート（`…/common/KillingFloor`）を選びます。最初にインデックスされるのはパッケージ名だけで、`.utx`/`.usx` ファイルは必要に応じて読み込まれます。
3. **Map .rom** をクリックしてマップを選びます（またはウィンドウに `.rom` をドラッグします）。

操作: クリックでマウスをキャプチャ、`WASD` で移動、`Space`/`Ctrl` で上下、`Shift` でスプリント、`R`（または Reset view ボタン）で開始位置に戻る、`Esc` でマウスを解放します。

左パネルには `wireframe`、`BSP`、`meshes`、`terrain`、`sky`、`light` のトグルに加えて、`spawns`、`trader`、`paths`（プレイヤー開始地点、トレーダーの位置、モンスターのパスノード）のオーバーレイトグルと、移動速度のスライダーがあります。

描画するもの: ワールド BSP（壁・床・天井）、スタティックメッシュ（プロップやディテール。CS 移植マップではほぼすべてのジオメトリがこれ）、そしてハイトマップ地形で、すべてテクスチャ付きです。切り抜きテクスチャ（草木、格子、フェンス）はアルファテストを使い、ガラスや雨などのブレンド系エフェクトはマテリアルのブレンドモードに従います。スカイボックスはマップ本来の `SkyZoneInfo` ゾーンをカメラに固定した背景として描画したもので、プレースホルダの「sky window」サーフェスは取り除いて向こうが透けて見えるようにしています。`light` トグルはマップの Light/Spotlight アクターからおおよそのライティングパスをベイクします。デフォルトはオフで、ゲーム本来のベイク済みライトマップとは異なります。

いくつかの粗い部分は [`RESEARCH.md`](./RESEARCH.ja.md) の末尾にまとめてあります。特に、`.usx` がインストールされていないメッシュはスキップされ（ログに表示されます）、地形の高さは標準的な UE2 のマッピングを使っているため、マップの地形が平すぎたり高すぎたりする場合はコード中の除数が調整用のつまみになります。

## CLI (Node)

```bash
node cli.js <map.rom>            # package version, geometry counts, referenced texture packages
node cli.js <map.rom> out.obj    # + export the BSP as OBJ (opens in Blender / Windows 3D Viewer)
```

OBJ には頂点座標・面・UV は含まれますがテクスチャは含まれません。任意の 3D ツールでジオメトリをさっと確認するのに便利です。

## ファイル

| ファイル | 内容 |
|------|-----------|
| `viewer.html` | ビューア本体（three.js + 小さな pointer-lock/WASD 飛行カメラ） |
| `kfrom.js` | 中核: UE2.5 パッケージの解析、ワールド BSP、スタティックメッシュ、地形、テクスチャ（ブラウザと Node の両方） |
| `cli.js` | Node CLI: 統計情報と OBJ エクスポート |
| `vendor/three.min.js` | three.js r136（ビューアがオフラインで動くよう同梱） |
| `RESEARCH.ja.md` | `.rom` フォーマットとビューアの描画方法に関するノート |

## ライセンス

このプロジェクトは **MIT License** の下でライセンスされています。全文は [`LICENSE`](../LICENSE) を参照してください。

### サードパーティ

- `vendor/three.min.js` — [three.js](https://threejs.org) r136、© three.js authors、MIT ライセンス。無改変で同梱しており、ライセンス表示はファイル内に残しています。

## 商標について

Killing Floor と Unreal はそれぞれの所有者（Tripwire Interactive と Epic Games）の商標です。これは非公式のファンメイドツールであり、これらの企業とは提携も承認もされていません。ゲームアセットは一切同梱しておらず、あなたがすでに所有しているゲームのコピーからファイルを読み込むだけです。
