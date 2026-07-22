#!/usr/bin/env node
"use strict";
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Geekrainian
//
// kfrom CLI — geometry stats and Wavefront OBJ export for a KF .rom map (the Node side of kfrom.js).
//   node cli.js <map.rom>            # print geometry stats + referenced texture packages
//   node cli.js <map.rom> out.obj    # also write geometry as OBJ (grouped by material)
// The OBJ carries positions/faces/UVs but no textures; the browser viewer does the texturing.
const fs = require("fs");
const KF = require("./kfrom");

const mapPath = process.argv[2];
if (!mapPath) { console.error("usage: node cli.js <map.rom> [out.obj]"); process.exit(1); }

const pkg = KF.parsePackage(new Uint8Array(fs.readFileSync(mapPath)));
const world = KF.findWorldModel(pkg);
if (!world) { console.error("no world Model (LoadForServer) found"); process.exit(1); }
const model = KF.readModel(pkg, world);
const groups = KF.buildMesh(pkg, model);

let tris = 0, verts = 0;
const pkgs = new Set();
for (const g of groups.values()) {
  tris += g.indices.length / 3;
  verts += g.positions.length / 3;
  const m = g.material;
  if (m && !m.embedded && m.file) pkgs.add(m.file);
}
console.log(`map: ${model.name}  (ver ${pkg.header.fileVersion}/${pkg.header.licenseeVersion})`);
console.log(`points=${model.points.length} nodes=${model.nodes.length} surfs=${model.surfs.length} verts=${model.verts.length}`);
console.log(`mesh: ${groups.size} material groups, ${verts} vertices, ${tris} triangles`);
console.log(`texture packages referenced: ${[...pkgs].sort().join(", ") || "(none / embedded)"}`);

const outPath = process.argv[3];
if (outPath) {
  const vLines = [`# exported by kfrom from ${model.name}`], vtLines = [], fLines = [];
  let base = 0;
  for (const [key, g] of groups) {
    const m = g.material;
    const gname = m ? (m.embedded ? m.name : `${m.file || "?"}.${m.group ? m.group + "." : ""}${m.name}`) : `mat_${key}`;
    fLines.push(`g ${gname.replace(/\s+/g, "_")}`);
    const n = g.positions.length / 3;
    for (let i = 0; i < n; i++) vLines.push(`v ${g.positions[i * 3]} ${g.positions[i * 3 + 1]} ${g.positions[i * 3 + 2]}`);
    for (let i = 0; i < n; i++) vtLines.push(`vt ${g.uvs[i * 2]} ${g.uvs[i * 2 + 1]}`);
    for (let i = 0; i < g.indices.length; i += 3) {
      const a = base + g.indices[i] + 1, b = base + g.indices[i + 1] + 1, c = base + g.indices[i + 2] + 1;
      fLines.push(`f ${a}/${a} ${b}/${b} ${c}/${c}`);
    }
    base += n;
  }
  fs.writeFileSync(outPath, vLines.concat(vtLines, fLines).join("\n") + "\n");
  console.log(`wrote ${outPath}  (${(fs.statSync(outPath).size / 1048576).toFixed(1)} MB)`);
}
