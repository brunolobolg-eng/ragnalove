// Uso único: otimiza cultist.glb (JPG 2K + sem skins/anims mortos + BIN compacto).
const fs = require('fs');
const path = require('path');
const GLB = path.join(__dirname, '..', 'public/models/cultist.glb');
const JPG = 'C:/Users/Administrator/AppData/Local/Temp/opencode/cult_tex.jpg';
const pad = (n) => (4 - (n % 4)) % 4;

const buf = fs.readFileSync(GLB);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
const bin = buf.slice(20 + jsonLen + 8);

// 1. troca PNG -> JPG
const jpg = fs.readFileSync(JPG);
const iv = json.bufferViews[json.images[0].bufferView];
const imgOff = iv.byteOffset || 0;
const jpgPadded = Buffer.concat([jpg, Buffer.alloc(pad(jpg.length))]);
let newBin = Buffer.concat([bin.slice(0, imgOff), jpgPadded, bin.slice(imgOff + iv.byteLength)]);
const shift1 = jpgPadded.length - iv.byteLength;
for (const bv of json.bufferViews) if ((bv.byteOffset || 0) > imgOff) bv.byteOffset += shift1;
iv.byteLength = jpg.length;
json.images[0].mimeType = 'image/jpeg';

// 2. solta skins extras + animação showcase (moveset vem da UAL)
for (const m of json.meshes) for (const p of m.primitives) {
  delete p.attributes.JOINTS_1; delete p.attributes.JOINTS_2;
  delete p.attributes.WEIGHTS_1; delete p.attributes.WEIGHTS_2;
}
delete json.animations;

// 3. compacta o BIN (só referenciados + IBMs do skin, que o loader precisa)
const used = new Set();
for (const m of json.meshes) for (const p of m.primitives) {
  for (const ai of Object.values(p.attributes)) {
    const bv = json.accessors[ai].bufferView;
    if (bv !== undefined) used.add(bv);
  }
  if (p.indices !== undefined) used.add(json.accessors[p.indices].bufferView);
}
for (const im of json.images || []) if (im.bufferView !== undefined) used.add(im.bufferView);
for (const sk of json.skins || []) {
  if (sk.inverseBindMatrices !== undefined) {
    const bv = json.accessors[sk.inverseBindMatrices].bufferView;
    if (bv !== undefined) used.add(bv);
  }
}
const old2new = new Map(); const chunks = []; const kept = []; let off = 0;
for (let i = 0; i < json.bufferViews.length; i++) {
  if (!used.has(i)) continue;
  const bv = json.bufferViews[i];
  const data = newBin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  const padded = Buffer.concat([data, Buffer.alloc(pad(data.length))]);
  old2new.set(i, kept.length);
  kept.push({ ...bv, byteOffset: off, byteLength: data.length });
  chunks.push(padded); off += padded.length;
}
json.bufferViews = kept;
for (const a of json.accessors) if (a.bufferView !== undefined) a.bufferView = old2new.get(a.bufferView);
for (const im of json.images || []) if (im.bufferView !== undefined) im.bufferView = old2new.get(im.bufferView);
newBin = Buffer.concat(chunks);

const jsonStr = JSON.stringify(json);
const jsonPadded = Buffer.concat([Buffer.from(jsonStr), Buffer.from(' '.repeat(pad(jsonStr.length)))]);
const total = 12 + 8 + jsonPadded.length + 8 + newBin.length + pad(newBin.length);
const out = Buffer.alloc(total);
out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8);
out.writeUInt32LE(jsonPadded.length, 12); out.writeUInt32LE(0x4e4f534a, 16);
jsonPadded.copy(out, 20);
const o = 20 + jsonPadded.length;
out.writeUInt32LE(newBin.length + pad(newBin.length), o); out.writeUInt32LE(0x004e4942, o + 4);
newBin.copy(out, o + 8);
fs.writeFileSync(GLB, out);
console.log('cultist final:', (out.length / 1048576).toFixed(1) + 'MB (antes 35.9MB)');
