// @ts-nocheck - valida o moveset UAL no rig Mixamo embutido do cultista
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { fitHips } from '../src/render/units/model/anims';
import { ualMixamoClips } from '../src/render/units/model/ualMixamo';
import { instantiateSkeleton } from '../src/render/units/model/ModelBuilder';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buf = readFileSync(join(root, 'public/models/cultist.glb'));
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
// BoneDefs como o toBuiltModel monta (joints + hierarquia real + translações relativas)
const joints = json.skins[0].joints;
const inSkin = new Set(joints);
const parOf = new Array(json.nodes.length).fill(null);
json.nodes.forEach((n, i) => (n.children || []).forEach((c) => { parOf[c] = i; }));
const bones = joints.map((j) => {
  let p = parOf[j];
  while (p !== null && !inSkin.has(p)) p = parOf[p];
  const n = json.nodes[j];
  const r = n.rotation;
  return {
    name: n.name,
    parent: p !== null ? json.nodes[p].name : undefined,
    pos: n.translation ?? [0, 0, 0],
    ...(r ? { rest: [r[0], r[1], r[2], r[3]] } : {}),
  };
});
// altura ABSOLUTA do quadril (cadeia até a raiz)
const byN = new Map(bones.map((b) => [b.name, b]));
let absY = 0;
let cur = byN.get('Hips');
while (cur) { absY += cur.pos[1]; cur = cur.parent ? byN.get(cur.parent) : undefined; }
console.log('Hips ABSOLUTO y:', absY.toFixed(3));
console.log('ossos:', bones.length, '| Hips pos:', JSON.stringify(bones.find((b) => b.name === 'Hips').pos));
const names = new Set(bones.map((b) => b.name));
const raw = ualMixamoClips();
const qdiff = (a, b) => a.angleTo(b);
for (const k of ['idle', 'walk', 'attack', 'cast', 'hit', 'death']) {
  const clip = fitHips(raw[k], bones, 'Hips');
  for (const t of clip.tracks) {
    if (!names.has(t.name.slice(0, t.name.lastIndexOf('.')))) throw new Error(`${k}: track sem osso ${t.name}`);
  }
}
const sk = instantiateSkeleton(bones);
const mixer = new THREE.AnimationMixer(sk.root);
// FK: mãos abaixo dos ombros no idle/walk?
{
  const byName = new Map(bones.map((b) => [b.name, b]));
  const children = new Map();
  for (const b of bones) {
    if (!b.parent) continue;
    if (!children.has(b.parent)) children.set(b.parent, []);
    children.get(b.parent).push(b.name);
  }
  const fk = (clip, t) => {
    const localQ = new Map();
    for (const tr of clip.tracks) {
      if (!tr.name.endsWith('.quaternion')) continue;
      const bn = tr.name.slice(0, tr.name.lastIndexOf('.'));
      const ts = tr.times; const vs = tr.values;
      let i = 0;
      while (i < ts.length - 2 && ts[i + 1] < t) i++;
      const f = Math.max(0, Math.min(1, (t - ts[i]) / Math.max(1e-6, ts[i + 1] - ts[i])));
      const a = new THREE.Quaternion(vs[i*4], vs[i*4+1], vs[i*4+2], vs[i*4+3]);
      const bq = new THREE.Quaternion(vs[i*4+4], vs[i*4+5], vs[i*4+6], vs[i*4+7]);
      localQ.set(bn, a.slerp(bq, f));
    }
    const W = new Map();
    const restQ = new Map(bones.map((b) => [b.name, b.rest ? new THREE.Quaternion(...b.rest) : new THREE.Quaternion()]));
    const rec = (bn, pp, pq) => {
      const def = byName.get(bn);
      const lq = localQ.get(bn) ?? restQ.get(bn).clone();
      const wq = pq.clone().multiply(lq);
      const wp = pp.clone().add(new THREE.Vector3(...def.pos).applyQuaternion(pq));
      W.set(bn, { p: wp, q: wq });
      for (const c of children.get(bn) ?? []) rec(c, wp, wq);
    };
    const rootB = bones.find((b) => !b.parent).name;
    rec(rootB, new THREE.Vector3(), new THREE.Quaternion());
    return new Map([...W.entries()].map(([k, v]) => [k, v.p]));
  };
  // descanso: esqueleto NÃO colapsado (regressão do bind: mãos longe da origem)?
  {
    const P = fk({ tracks: [] }, 0);
    const hx = Math.abs(P.get('LeftHand').x);
    console.log(`  descanso: mão x=${hx.toFixed(3)} cabeça y=${P.get('Head').y.toFixed(3)}`);
    if (hx < 0.2) throw new Error('esqueleto colapsado na origem!');
  }
  for (const k of ['idle', 'walk', 'attack', 'cast']) {
    const clip = fitHips(raw[k], bones, 'Hips');
    for (const t of [clip.duration * 0.3, clip.duration * 0.7]) {
      const P = fk(clip, t);
      const handY = (P.get('LeftHand').y + P.get('RightHand').y) / 2;
      const shY = (P.get('LeftShoulder').y + P.get('RightShoulder').y) / 2;
      const headY = P.get('Head').y;
      const tag = k === 'attack' ? '' : ' -> ' + (handY > shY ? 'MÃOS P/ CIMA (BUG)' : 'ok');
      console.log(`  FK ${k} t=${t.toFixed(2)}: mão ${handY.toFixed(3)} ombro ${shY.toFixed(3)} cabeça ${headY.toFixed(3)}${tag}`);
      if (k !== 'attack' && handY > shY) throw new Error(`braços levantados em ${k}!`);
    }
  }
  // movimento real no mixer
  for (const k of ['idle', 'walk', 'attack', 'cast', 'hit', 'death']) {
    const clip = fitHips(raw[k], bones, 'Hips');
    const a = mixer.clipAction(clip);
    a.play(); mixer.update(0);
    const q0 = sk.byName.get('LeftArm').quaternion.clone();
    mixer.update(Math.min(0.6, clip.duration / 2));
    console.log(`  mixer ${k}: braço ${q0.angleTo(sk.byName.get('LeftArm').quaternion).toFixed(3)} rad`);
    a.stop();
  }
}
console.log('CULTIST OK');
