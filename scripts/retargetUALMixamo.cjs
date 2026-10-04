/**
 * Retarget UAL -> esqueleto Mixamo (cultista): mesma matemática corrigida do
 * extractUALAnims.mjs (deformação relativa ao descanso), com mapa e
 * hierarquia do Mixamo. Gera src/render/units/model/ualMixamo.ts.
 * Uso único (regenerar se a UAL mudar): node scripts/retargetUALMixamo.cjs
 */
const fs = require('fs');
const path = require('path');

const UAL = path.join(__dirname, '..', 'Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb');
const CULT_ORIG = 'C:/Users/Administrator/AppData/Local/Temp/opencode/cult_orig.glb';
const OUT = path.join(__dirname, '..', 'src/render/units/model/ualMixamo.ts');

// UAL -> Mixamo (nomes do rig embutido no GLB)
const BONE_MAP = {
  pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2',
  neck_01: 'Neck', Head: 'Head',
  clavicle_l: 'LeftShoulder', upperarm_l: 'LeftArm', lowerarm_l: 'LeftForeArm', hand_l: 'LeftHand',
  clavicle_r: 'RightShoulder', upperarm_r: 'RightArm', lowerarm_r: 'RightForeArm', hand_r: 'RightHand',
  thigh_l: 'LeftUpLeg', calf_l: 'LeftLeg', foot_l: 'LeftFoot',
  thigh_r: 'RightUpLeg', calf_r: 'RightLeg', foot_r: 'RightFoot',
  root: null,
};
const CLIP_MAP = {
  Idle_Loop: 'idle', Walk_Loop: 'walk', Punch_Jab: 'attack',
  Spell_Simple_Shoot: 'cast', Hit_Chest: 'hit', Death01: 'death',
};

const qmul = (a, b) => [
  a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1], a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
  a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3], a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
const qnorm = (q) => { const l = Math.hypot(...q) || 1; return [q[0]/l, q[1]/l, q[2]/l, q[3]/l]; };
const qnlerp = (a, b, t) => {
  const s = (a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3]) < 0 ? -1 : 1;
  return qnorm([a[0]*(1-t)+s*b[0]*t, a[1]*(1-t)+s*b[1]*t, a[2]*(1-t)+s*b[2]*t, a[3]*(1-t)+s*b[3]*t]);
};
const qrotV = (q, v) => {
  const [x, y, z, w] = q;
  const uv = [y*v[2]-z*v[1], z*v[0]-x*v[2], x*v[1]-y*v[0]];
  const uuv = [y*uv[2]-z*uv[1], z*uv[0]-x*uv[2], x*uv[1]-y*uv[0]];
  return [v[0]+2*(w*uv[0]+uuv[0]), v[1]+2*(w*uv[1]+uuv[1]), v[2]+2*(w*uv[2]+uuv[2])];
};

const buf = fs.readFileSync(UAL);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
const bin = buf.slice(20 + jsonLen + 8);
function readAccessor(idx) {
  const a = json.accessors[idx]; const bv = json.bufferViews[a.bufferView];
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const n = a.count * ({ SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type]);
  const out = new Float32Array(n); const dv = new DataView(bin.buffer, bin.byteOffset + off, n * 4);
  for (let k = 0; k < n; k++) out[k] = dv.getFloat32(k * 4, true);
  return out;
}
const nodes = json.nodes;
const parent = new Array(nodes.length).fill(-1);
nodes.forEach((n, i) => (n.children || []).forEach((c) => { parent[c] = i; }));
const rest = nodes.map((n) => ({ t: n.translation || [0,0,0], r: qnorm(n.rotation || [0,0,0,1]) }));
const order = [];
const visit = (i) => { if (order.includes(i)) return; if (parent[i] >= 0) visit(parent[i]); order.push(i); };
nodes.forEach((_, i) => visit(i));
const restW = new Array(nodes.length);
for (const i of order) restW[i] = parent[i] >= 0 ? qmul(restW[parent[i]], rest[i].r) : [...rest[i].r];

// ordem Mixamo (pais antes dos filhos) só com ossos mapeados
const mixParent = {};
for (const [u, m] of Object.entries(BONE_MAP)) {
  if (!m) continue;
  const ui = nodes.findIndex((n) => n.name === u);
  const p = parent[ui] >= 0 ? nodes[parent[ui]].name : null;
  mixParent[m] = p && BONE_MAP[p] ? BONE_MAP[p] : null;
}
const mixOrder = [];
const seen = new Set();
const visitM = (m) => {
  if (seen.has(m)) return;
  if (mixParent[m]) visitM(mixParent[m]);
  seen.add(m); mixOrder.push(m);
};
Object.values(BONE_MAP).filter(Boolean).forEach(visitM);

const pelvisIdx = nodes.findIndex((n) => n.name === 'pelvis');
const UAL_PELVIS_REST = rest[pelvisIdx].t;

// descanso do alvo (cultista): rotação de mundo do bind, das IBMs do GLB original.
// A IBM guarda inverse(bindWorld); a rotação do bind é a transposta da 3x3.
const cultBuf = fs.readFileSync(CULT_ORIG);
const cultLen = cultBuf.readUInt32LE(12);
const cult = JSON.parse(cultBuf.slice(20, 20 + cultLen).toString());
const cultBin = cultBuf.slice(20 + cultLen + 8);
function cultRestWorld(jointIdx) {
  const sk = cult.skins[0];
  const a = cult.accessors[sk.inverseBindMatrices];
  const bv = cult.bufferViews[a.bufferView];
  const dv = new DataView(cultBin.buffer, cultBin.byteOffset + (bv.byteOffset || 0) + jointIdx * 64, 64);
  const m = [];
  for (let k = 0; k < 16; k++) m.push(dv.getFloat32(k * 4, true));
  // transposta da 3x3 (coluna-maior): linhas da IBM = colunas do bind
  const R = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]];
  const tr = R[0][0] + R[1][1] + R[2][2];
  let q;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [(R[2][1] - R[1][2]) / s, (R[0][2] - R[2][0]) / s, (R[1][0] - R[0][1]) / s, s / 4];
  } else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) {
    const s = Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2;
    q = [s / 4, (R[0][1] + R[1][0]) / s, (R[0][2] + R[2][0]) / s, (R[1][2] - R[2][1]) / s];
  } else if (R[1][1] > R[2][2]) {
    const s = Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2;
    q = [(R[0][1] + R[1][0]) / s, s / 4, (R[1][2] + R[2][1]) / s, (R[0][2] - R[2][0]) / s];
  } else {
    const s = Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2;
    q = [(R[0][2] + R[2][0]) / s, (R[1][2] + R[2][1]) / s, s / 4, (R[0][1] - R[1][0]) / s];
  }
  const l = Math.hypot(...q) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
const cultJoints = cult.skins[0].joints;
const cultJointIdx = (name) => cultJoints.indexOf(cult.nodes.findIndex((n) => n.name === name));
const restT = {};
for (const m of Object.values(BONE_MAP)) {
  if (m) restT[m] = cultRestWorld(cultJointIdx(m));
}
const clips = {};
for (const [ualName, gameName] of Object.entries(CLIP_MAP)) {
  const anim = json.animations.find((a) => a.name === ualName);
  const rotCh = new Map();
  let pelvisT = null;
  for (const c of anim.channels) {
    const s = anim.samplers[c.sampler];
    if (c.target.path === 'rotation') rotCh.set(c.target.node, { times: readAccessor(s.input), vals: readAccessor(s.output) });
    else if (c.target.path === 'translation' && c.target.node === pelvisIdx) pelvisT = { times: readAccessor(s.input), vals: readAccessor(s.output) };
  }
  const tset = new Set();
  for (const { times } of rotCh.values()) for (const t of times) tset.add(+t.toFixed(4));
  if (pelvisT) for (const t of pelvisT.times) tset.add(+t.toFixed(4));
  const times = [...tset].sort((a, b) => a - b);
  const sampleQ = (ch, t) => {
    const { times: ts, vals } = ch;
    if (t <= ts[0]) return [vals[0], vals[1], vals[2], vals[3]];
    for (let i = 0; i < ts.length - 1; i++) {
      if (t <= ts[i + 1]) {
        const f = (t - ts[i]) / Math.max(1e-6, ts[i + 1] - ts[i]);
        return qnlerp([vals[i*4],vals[i*4+1],vals[i*4+2],vals[i*4+3]], [vals[i*4+4],vals[i*4+5],vals[i*4+6],vals[i*4+7]], f);
      }
    }
    const n = vals.length / 4 - 1;
    return [vals[n*4], vals[n*4+1], vals[n*4+2], vals[n*4+3]];
  };
  const sampleV = (ch, t) => {
    const { times: ts, vals } = ch;
    if (t <= ts[0]) return [vals[0], vals[1], vals[2]];
    for (let i = 0; i < ts.length - 1; i++) {
      if (t <= ts[i + 1]) {
        const f = (t - ts[i]) / Math.max(1e-6, ts[i + 1] - ts[i]);
        return [0,1,2].map((j) => vals[i*3+j] * (1-f) + vals[i*3+3+j] * f);
      }
    }
    const n = vals.length / 3 - 1;
    return [vals[n*3], vals[n*3+1], vals[n*3+2]];
  };
  const frames = times.map((t) => {
    const world = new Array(nodes.length);
    for (const i of order) {
      const local = rotCh.has(i) ? sampleQ(rotCh.get(i), t) : rest[i].r;
      world[i] = parent[i] >= 0 ? qmul(world[parent[i]], local) : [...local];
    }
    return world;
  });
  for (const chk of ['pelvis', 'spine_02', 'Head']) {
    const up = qrotV(frames[0][nodes.findIndex((n) => n.name === chk)], [0, 1, 0]);
    if (up[1] < 0.8) throw new Error(`retarget falhou em ${ualName}: ${chk} (up.y=${up[1].toFixed(2)})`);
  }
  const ualIdx = {};
  for (const u of Object.keys(BONE_MAP)) ualIdx[u] = nodes.findIndex((n) => n.name === u);
  const tracks = [];
  const qframes = mixOrder.map(() => []);
  times.forEach((_, fi) => {
    const W = frames[fi];
    const gw = {};
    for (const m of mixOrder) {
      const u = Object.keys(BONE_MAP).find((k) => BONE_MAP[k] === m);
      const D = qmul(W[ualIdx[u]], qinv(restW[ualIdx[u]]));
      const gp = mixParent[m];
      const parentW = gp ? gw[gp] : [0, 0, 0, 1];
      // descanso do alvo: a deformação UAL pousa sobre o bind rotacionado do modelo
      const local = qmul(qmul(qinv(parentW), D), restT[m]);
      gw[m] = qmul(parentW, local);
      qframes[mixOrder.indexOf(m)].push(local);
    }
  });
  mixOrder.forEach((m, gi) => tracks.push({ name: `${m}.quaternion`, values: qframes[gi].flat() }));
  if (pelvisT) {
    const off = times.map((t) => {
      const p = sampleV(pelvisT, t);
      return [p[0] - UAL_PELVIS_REST[0], p[1] - UAL_PELVIS_REST[1], p[2] - UAL_PELVIS_REST[2]];
    });
    tracks.push({ name: 'Hips.position', values: off.flat(), isHipsOffset: true });
  }
  const dur = times[times.length - 1];
  console.log(`${ualName} -> ${gameName}: ${times.length} frames, ${dur.toFixed(2)}s`);
  clips[gameName] = { duration: dur, times, tracks };
}

const L = [
  '/**',
  ' * UAL com retargeting para o esqueleto Mixamo (cultista).',
  ' * Gerado por scripts/retargetUALMixamo.cjs — NÃO editar.',
  ' * `Hips.position` = offset em espaço UAL (escala aplicada em fitHips).',
  ' */',
  "import * as THREE from 'three';",
  '',
  'export type UALMixamoName = ' + Object.keys(clips).map((n) => `'${n}'`).join(' | ') + ';',
  '',
  'const D: Record<UALMixamoName, { duration: number; times: number[]; tracks: { name: string; values: number[] }[] }> = {',
];
for (const [name, c] of Object.entries(clips)) {
  L.push(`  ${name}: { duration: ${c.duration.toFixed(3)}, times: [${c.times.map((t) => t.toFixed(3)).join(',')}], tracks: [`);
  for (const t of c.tracks) {
    L.push(`    { name: '${t.name}', values: [`);
    for (let i = 0; i < t.values.length; i += 8) L.push(`      ${t.values.slice(i, i + 8).map((x) => x.toFixed(4)).join(', ')}${i + 8 < t.values.length ? ',' : ''}`);
    L.push('    ] },');
  }
  L.push('  ] },');
}
L.push('};');
L.push('');
L.push('export function ualMixamoClips(): Record<UALMixamoName, THREE.AnimationClip> {');
L.push('  const out = {} as Record<UALMixamoName, THREE.AnimationClip>;');
L.push('  for (const [name, c] of Object.entries(D)) {');
L.push('    const tracks: THREE.KeyframeTrack[] = c.tracks.map((t) => t.name.endsWith(\'.quaternion\') ? new THREE.QuaternionKeyframeTrack(t.name, c.times, t.values) : new THREE.VectorKeyframeTrack(t.name, c.times, t.values));');
L.push('    out[name as UALMixamoName] = new THREE.AnimationClip(name, c.duration, tracks);');
L.push('  }');
L.push('  return out;');
L.push('}');
fs.writeFileSync(OUT, L.join('\n') + '\n');
console.log('gerado:', OUT);
