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
// 5. híbrido UAL (idle/walk/hit/death) no rig: braços fechados, sem T-pose?
import { fitHips } from '../src/render/units/model/anims';
import { ualRawClips } from '../src/render/units/model/ualClips';
{
  const raw = ualRawClips();
  const names = new Set(bones.map((b) => b.name));
  for (const k of ['idle', 'walk', 'hit', 'death'] as const) {
    const clip = fitHips(raw[k], bones);
    for (const t of clip.tracks) {
      if (!names.has(t.name.slice(0, t.name.lastIndexOf('.')))) throw new Error(`UAL ${k}: track sem osso ${t.name}`);
    }
    const a = mixer.clipAction(clip);
    a.play();
    mixer.update(0);
    const qArm0 = sk.byName.get('upperArm.R')!.quaternion.clone();
    const qLeg0 = sk.byName.get('thigh.L')!.quaternion.clone();
    mixer.update(Math.min(0.6, clip.duration / 2));
    const arm = qArm0.angleTo(sk.byName.get('upperArm.R')!.quaternion);
    const leg = qLeg0.angleTo(sk.byName.get('thigh.L')!.quaternion);
    console.log(`  UAL ${k}: braço ${arm.toFixed(3)} rad, perna ${leg.toFixed(3)} rad`);
    if (k === 'walk' && (arm < 0.15 || leg < 0.3)) throw new Error('walk UAL sem balanço!');
    a.stop();
  }
  // quadril acompanha a escala do modelo (sem flutuar nem afundar)
  const hipsTrack = (fitHips(raw.walk, bones).tracks.find((t) => t.name === 'hips.position') as unknown as { values: Float32Array });
  const ys = [];
  for (let i = 1; i < hipsTrack.values.length; i += 3) ys.push(hipsTrack.values[i]);
  const restY = bones.find((b) => b.name === 'hips')!.pos[1];
  console.log(`  quadril walk: descanso ${restY.toFixed(3)}, mín ${Math.min(...ys).toFixed(3)}, máx ${Math.max(...ys).toFixed(3)}`);
  if (Math.min(...ys) < restY - 0.15 || Math.max(...ys) > restY + 0.15) throw new Error('quadril UAL fora da faixa!');
}
// 6. FK: onde as mãos ficam no idle/walk UAL? (mãos p/ cima = bug confirmado)
{
  const raw = ualRawClips();
  const byName = new Map(bones.map((b) => [b.name, b] as [string, typeof b]));
  const children = new Map<string, string[]>();
  for (const b of bones) {
    if (!b.parent) continue;
    if (!children.has(b.parent)) children.set(b.parent, []);
    children.get(b.parent)!.push(b.name);
  }
  const fk = (clip: THREE.AnimationClip, t: number): Map<string, THREE.Vector3> => {
    const q = new THREE.Quaternion();
    const localQ = new Map<string, THREE.Quaternion>();
    for (const tr of clip.tracks) {
      if (!tr.name.endsWith('.quaternion')) continue;
      const bn = tr.name.slice(0, tr.name.lastIndexOf('.'));
      const track = tr as unknown as { times: ArrayLike<number>; values: ArrayLike<number> };
      const ts = track.times;
      let i = 0;
      while (i < ts.length - 2 && ts[i + 1] < t) i++;
      const f = Math.max(0, Math.min(1, (t - ts[i]) / Math.max(1e-6, ts[i + 1] - ts[i])));
      const a = new THREE.Quaternion(track.values[i * 4], track.values[i * 4 + 1], track.values[i * 4 + 2], track.values[i * 4 + 3]);
      const bq = new THREE.Quaternion(track.values[i * 4 + 4], track.values[i * 4 + 5], track.values[i * 4 + 6], track.values[i * 4 + 7]);
      localQ.set(bn, a.slerp(bq, f));
    }
    const W = new Map<string, { p: THREE.Vector3; q: THREE.Quaternion }>();
    const rec = (bn: string, pp: THREE.Vector3, pq: THREE.Quaternion) => {
      const def = byName.get(bn)!;
      const lq = localQ.get(bn) ?? new THREE.Quaternion();
      const wq = pq.clone().multiply(lq);
      const wp = pp.clone().add(new THREE.Vector3(...def.pos).applyQuaternion(pq));
      W.set(bn, { p: wp, q: wq });
      for (const c of children.get(bn) ?? []) rec(c, wp, wq);
    };
    rec('root', new THREE.Vector3(), new THREE.Quaternion());
    return new Map([...W.entries()].map(([k, v]) => [k, v.p]));
  };
  for (const k of ['idle', 'walk'] as const) {
    const clip = fitHips(raw[k], bones);
    for (const t of [clip.duration * 0.25, clip.duration * 0.6]) {
      const P = fk(clip, t);
      const handY = (P.get('hand.L')!.y + P.get('hand.R')!.y) / 2;
      const shY = (P.get('shoulder.L')!.y + P.get('shoulder.R')!.y) / 2;
      const headY = P.get('head')!.y;
      console.log(`  FK UAL ${k} t=${t.toFixed(2)}: mão ${handY.toFixed(3)} ombro ${shY.toFixed(3)} cabeça ${headY.toFixed(3)} -> ${handY > shY ? 'MÃOS P/ CIMA (BUG)' : 'braços baixos (ok)'}`);
    }
  }
}
console.log('RIG OK');
