// @ts-nocheck - script de teste headless (verificado em runtime)
/**
 * Testa o pipeline autoRig com a malha REAL do goblin (sem GLTFLoader/DOM):
 * detectHumanoidJoints -> humanoidBones -> skinHumanoid -> bossClips -> mixer.
 * Uso: node node_modules/tsx/dist/cli.mjs scripts/testGoblinRig.ts
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { bossClips, detectHumanoidJoints, humanoidBones, skinHumanoid } from '../src/render/units/model/autoRig';
import { instantiateSkeleton } from '../src/render/units/model/ModelBuilder';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buf = readFileSync(join(root, 'public/models/goblin_warlord.glb'));
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
const binStart = 20 + jsonLen + 8;
const bin = buf.slice(binStart);

function acc(idx: number): Float32Array {
  const a = json.accessors[idx];
  const bv = json.bufferViews[a.bufferView];
  const off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const n = a.count * ({ SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type] as number);
  const out = new Float32Array(n);
  const dv = new DataView(bin.buffer, bin.byteOffset + off, n * 4);
  for (let i = 0; i < n; i++) out[i] = dv.getFloat32(i * 4, true);
  return out;
}

const prim = json.meshes[0].primitives[0];
const pos = acc(prim.attributes.POSITION);
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
if (prim.attributes.TEXCOORD_0) geo.setAttribute('uv', new THREE.BufferAttribute(acc(prim.attributes.TEXCOORD_0), 2));
console.log('verts:', pos.length / 3);

// 1. juntas
const J = detectHumanoidJoints(geo);
const v3 = (v: { toArray(): number[] }) => v.toArray().map((x) => +x.toFixed(2));
console.log('joints:', JSON.stringify({ root: v3(J.root), hips: v3(J.hips), spine: v3(J.spine), chest: v3(J.chest), neck: v3(J.neck), head: v3(J.head), shoulder: v3(J.shoulder), upperArm: v3(J.upperArm), foreArm: v3(J.foreArm), hand: v3(J.hand), thigh: v3(J.thigh), shin: v3(J.shin), foot: v3(J.foot), crotchY: +J.crotchY.toFixed(2), armX: +J.armX.toFixed(2) }));

// 2. ossos + skin
const bones = humanoidBones(J);
console.log('bones:', bones.map((b) => b.name).join(','));
skinHumanoid(geo, J, bones);
const si = geo.getAttribute('skinIndex') as THREE.BufferAttribute;
const sw = geo.getAttribute('skinWeight') as THREE.BufferAttribute;
const perBone = new Map<string, number>();
for (let i = 0; i < si.count; i++) {
  for (let k = 0; k < 4; k++) {
    if (sw.getX(i * 4 + k) > 0.01) perBone.set(bones[si.getX(i * 4 + k)].name, (perBone.get(bones[si.getX(i * 4 + k)].name) ?? 0) + 1);
  }
}
console.log('verts por osso:', [...perBone.entries()].map(([k, v]) => `${k}:${v}`).join(' '));

// 3. clipes + mixer de verdade
const clips = bossClips(bones);
for (const [n, c] of Object.entries(clips)) console.log(`clip ${n}: ${c.duration.toFixed(2)}s, ${c.tracks.length} tracks`);
const sk = instantiateSkeleton(bones);
const mixer = new THREE.AnimationMixer(sk.root);
for (const [n, c] of Object.entries(clips)) {
  const a = mixer.clipAction(c);
  a.play();
  mixer.update(0);
  const before = sk.byName.get('thigh.L')!.quaternion.clone();
  const beforeH = sk.byName.get('hips')!.position.clone();
  mixer.update(Math.min(0.5, c.duration / 2));
  const dq = before.angleTo(sk.byName.get('thigh.L')!.quaternion);
  const dp = beforeH.distanceTo(sk.byName.get('hips')!.position);
  console.log(`  ${n}: thigh moveu ${dq.toFixed(3)} rad, quadril ${dp.toFixed(4)}m`);
  a.stop();
}
// 4. rugido original com retargeting: liga nos ossos e se move?
import { krexxCastClip } from '../src/render/units/model/krexxCast';
{
  const names = new Set(bones.map((b) => b.name));
  const cast = krexxCastClip();
  console.log(`krexx cast: ${cast.duration.toFixed(2)}s, ${cast.tracks.length} tracks`);
  for (const t of cast.tracks) {
    const bone = t.name.slice(0, t.name.lastIndexOf('.'));
    if (!names.has(bone)) throw new Error(`track sem osso: ${t.name}`);
    const vals = (t as unknown as { values: ArrayLike<number> }).values;
    for (let i = 0; i < vals.length; i++) if (!Number.isFinite(vals[i])) throw new Error(`NaN em ${t.name}`);
  }
  const a = mixer.clipAction(cast);
  a.play();
  mixer.update(0);
  const q0 = sk.byName.get('upperArm.R')!.quaternion.clone();
  mixer.update(1.0);
  const q1 = sk.byName.get('upperArm.R')!.quaternion.clone();
  const q2 = sk.byName.get('thigh.L')!.quaternion.clone();
  mixer.update(cast.duration);
  const moved = q0.angleTo(q1);
  console.log(`  rugido: braço moveu ${moved.toFixed(3)} rad no 1º segundo`);
  if (moved < 0.1) throw new Error('rugido parado!');
  a.stop();
}
console.log('RIG OK');
