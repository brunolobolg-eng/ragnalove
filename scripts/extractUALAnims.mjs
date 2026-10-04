/**
 * Extrai animacoes da Universal Animation Library (UAL1_Standard.glb) com
 * RETARGETING para o esqueleto do jogo.
 *
 * Por que retargeting: os ossos da UAL tem rotacoes de descanso diferentes
 * (ex.: pelvis, thigh e root com -90graus em X). Copiar rotacoes locais
 * direto congela/deforma o boneco. Aqui calculamos a orientacao de MUNDO
 * de cada osso na UAL e convertemos para rotacao local do esqueleto do
 * jogo (que tem descanso identidade).
 *
 * Convencoes de track do Three.js: `<osso>.quaternion` e `hips.position`.
 * Nomes errados (ex.: `.rotation`) sao ignorados pelo mixer = boneco parado.
 *
 * Uso: node scripts/extractUALAnims.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const GLB_PATH = join(root, 'Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb');

/** Osso UAL -> osso do jogo (null = ignorar). */
const BONE_MAP = {
  pelvis: 'hips',
  spine_01: 'spine',
  spine_02: 'chest',
  spine_03: null, // sem equivalente; o movimento passa para os filhos via mundo
  neck_01: 'neck',
  Head: 'head',
  clavicle_l: 'shoulder.L',
  clavicle_r: 'shoulder.R',
  upperarm_l: 'upperArm.L',
  lowerarm_l: 'foreArm.L',
  hand_l: 'hand.L',
  upperarm_r: 'upperArm.R',
  lowerarm_r: 'foreArm.R',
  hand_r: 'hand.R',
  thigh_l: 'thigh.L',
  calf_l: 'shin.L',
  foot_l: 'foot.L',
  thigh_r: 'thigh.R',
  calf_r: 'shin.R',
  foot_r: 'foot.R',
  root: null, // movimento do no raiz: o jogo move as unidades via codigo
};

/** Ordem de processamento no esqueleto do jogo (pais antes dos filhos). */
const GAME_ORDER = [
  ['pelvis', 'hips'],
  ['spine_01', 'spine'],
  ['spine_02', 'chest'],
  ['neck_01', 'neck'],
  ['Head', 'head'],
  ['clavicle_l', 'shoulder.L'],
  ['upperarm_l', 'upperArm.L'],
  ['lowerarm_l', 'foreArm.L'],
  ['hand_l', 'hand.L'],
  ['clavicle_r', 'shoulder.R'],
  ['upperarm_r', 'upperArm.R'],
  ['lowerarm_r', 'foreArm.R'],
  ['hand_r', 'hand.R'],
  ['thigh_l', 'thigh.L'],
  ['calf_l', 'shin.L'],
  ['foot_l', 'foot.L'],
  ['thigh_r', 'thigh.R'],
  ['calf_r', 'shin.R'],
  ['foot_r', 'foot.R'],
];

/** Pai de cada osso no esqueleto do jogo. */
const GAME_PARENT = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  'shoulder.L': 'chest', 'upperArm.L': 'shoulder.L', 'foreArm.L': 'upperArm.L', 'hand.L': 'foreArm.L',
  'shoulder.R': 'chest', 'upperArm.R': 'shoulder.R', 'foreArm.R': 'upperArm.R', 'hand.R': 'foreArm.R',
  'thigh.L': 'hips', 'shin.L': 'thigh.L', 'foot.L': 'shin.L',
  'thigh.R': 'hips', 'shin.R': 'thigh.R', 'foot.R': 'shin.R',
};

/** Animacao UAL -> clipe do jogo. */
const CLIP_MAP = {
  Idle_Loop: 'idle',
  Walk_Loop: 'walk',
  Sword_Attack: 'attack',
  Spell_Simple_Shoot: 'cast',
  Hit_Chest: 'hit',
  Death01: 'death',
};

// ---------- matematica de quaternion ([x,y,z,w]) ----------
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
const qnorm = (q) => { const l = Math.hypot(...q) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };
const qnlerp = (a, b, t) => {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = d < 0 ? -1 : 1;
  return qnorm([a[0] * (1 - t) + s * b[0] * t, a[1] * (1 - t) + s * b[1] * t, a[2] * (1 - t) + s * b[2] * t, a[3] * (1 - t) + s * b[3] * t]);
};
const qrotV = (q, v) => {
  const [x, y, z, w] = q;
  const uv = [y * v[2] - z * v[1], z * v[0] - x * v[2], x * v[1] - y * v[0]];
  const uuv = [y * uv[2] - z * uv[1], z * uv[0] - x * uv[2], x * uv[1] - y * uv[0]];
  return [v[0] + 2 * (w * uv[0] + uuv[0]), v[1] + 2 * (w * uv[1] + uuv[1]), v[2] + 2 * (w * uv[2] + uuv[2])];
};

// ---------- leitura do GLB ----------
function readGLB(path) {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
  return { json, bin: buf.slice(20 + jsonLen + 8) };
}
function readAccessor(bin, json, idx) {
  const a = json.accessors[idx];
  const bv = json.bufferViews[a.bufferView];
  const off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const n = a.count * ({ SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type]);
  const out = new Float32Array(n);
  const dv = new DataView(bin.buffer, bin.byteOffset + off, n * 4);
  for (let i = 0; i < n; i++) out[i] = dv.getFloat32(i * 4, true);
  return out;
}

function main() {
  const { json, bin } = readGLB(GLB_PATH);
  const nodes = json.nodes;
  const parent = new Array(nodes.length).fill(-1);
  nodes.forEach((n, i) => (n.children || []).forEach((c) => { parent[c] = i; }));
  const rest = nodes.map((n) => ({
    t: n.translation ?? [0, 0, 0],
    r: qnorm(n.rotation ?? [0, 0, 0, 1]),
  }));
  // ordem topologica (pais antes dos filhos)
  const order = [];
  const visit = (i) => { if (order.includes(i)) return; if (parent[i] >= 0) visit(parent[i]); order.push(i); };
  nodes.forEach((_, i) => visit(i));

  const pelvisIdx = nodes.findIndex((n) => n.name === 'pelvis');
  const UAL_PELVIS_REST = rest[pelvisIdx].t;
  console.log('pelvis rest (UAL):', UAL_PELVIS_REST.map((v) => v.toFixed(4)).join(', '));

  const clips = {};
  for (const [ualName, gameName] of Object.entries(CLIP_MAP)) {
    const anim = json.animations.find((a) => a.name === ualName);
    if (!anim) throw new Error(`animacao ${ualName} nao encontrada`);
    // canais de rotacao por no + translacao da pelvis
    const rotCh = new Map(); // nodeIdx -> {times, quats}
    let pelvisT = null;
    for (const c of anim.channels) {
      const s = anim.samplers[c.sampler];
      const times = readAccessor(bin, json, s.input);
      const vals = readAccessor(bin, json, s.output);
      if (c.target.path === 'rotation') rotCh.set(c.target.node, { times, vals });
      else if (c.target.path === 'translation' && c.target.node === pelvisIdx) pelvisT = { times, vals };
    }
    // tempos unificados
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
          return qnlerp([vals[i * 4], vals[i * 4 + 1], vals[i * 4 + 2], vals[i * 4 + 3]], [vals[i * 4 + 4], vals[i * 4 + 5], vals[i * 4 + 6], vals[i * 4 + 7]], f);
        }
      }
      const n = vals.length / 4 - 1;
      return [vals[n * 4], vals[n * 4 + 1], vals[n * 4 + 2], vals[n * 4 + 3]];
    };
    const sampleV = (ch, t) => {
      const { times: ts, vals } = ch;
      if (t <= ts[0]) return [vals[0], vals[1], vals[2]];
      for (let i = 0; i < ts.length - 1; i++) {
        if (t <= ts[i + 1]) {
          const f = (t - ts[i]) / Math.max(1e-6, ts[i + 1] - ts[i]);
          return [0, 1, 2].map((j) => vals[i * 3 + j] * (1 - f) + vals[i * 3 + 3 + j] * f);
        }
      }
      const n = vals.length / 3 - 1;
      return [vals[n * 3], vals[n * 3 + 1], vals[n * 3 + 2]];
    };
    // orientacoes de mundo na UAL por frame
    const frames = times.map((t) => {
      const world = new Array(nodes.length);
      for (const i of order) {
        const local = rotCh.has(i) ? sampleQ(rotCh.get(i), t) : rest[i].r;
        world[i] = parent[i] >= 0 ? qmul(world[parent[i]], local) : [...local];
      }
      return world;
    });
    // validacao: personagem de pe (eixo up ~ +Y no mundo)
    for (const chk of ['pelvis', 'spine_02', 'Head']) {
      const i = nodes.findIndex((n) => n.name === chk);
      const up = qrotV(frames[0][i], [0, 1, 0]);
      console.log(`  ${ualName}: up(${chk}) = ${up.map((v) => v.toFixed(3)).join(', ')}`);
      if (up[1] < 0.8) throw new Error(`retarget falhou em ${ualName}: ${chk} nao esta de pe (up.y=${up[1].toFixed(2)})`);
    }
    // converte para locais do jogo
    const gameWorld = {}; // nome do osso do jogo -> quat (frame atual processado por clipe)
    const tracks = [];
    const qframes = []; // por osso do jogo, lista de quats por frame
    for (const [, g] of GAME_ORDER) qframes.push([]);
    times.forEach((_, fi) => {
      const W = frames[fi];
      const gw = {};
      for (const [u, g] of GAME_ORDER) {
        const ui = nodes.findIndex((n) => n.name === u);
        const gp = GAME_PARENT[g];
        const parentW = gp ? gw[gp] : [0, 0, 0, 1];
        const local = qmul(qinv(parentW), W[ui]);
        gw[g] = qmul(parentW, local); // == W[ui]
        qframes[GAME_ORDER.findIndex(([, x]) => x === g)].push(local);
      }
      void gw; void gameWorld;
    });
    GAME_ORDER.forEach(([u, g], gi) => {
      tracks.push({ name: `${g}.quaternion`, values: qframes[gi].flat() });
    });
    // quadril: deslocamento em relacao ao descanso (espaco UAL; escala aplicada no jogo)
    if (pelvisT) {
      const off = times.map((t) => {
        const p = sampleV(pelvisT, t);
        return [p[0] - UAL_PELVIS_REST[0], p[1] - UAL_PELVIS_REST[1], p[2] - UAL_PELVIS_REST[2]];
      });
      tracks.push({ name: 'hips.position', values: off.flat(), isHipsOffset: true });
    }
    const dur = times[times.length - 1];
    console.log(`${ualName} -> ${gameName}: ${times.length} frames, ${dur.toFixed(2)}s, ${tracks.length} tracks`);
    clips[gameName] = { duration: dur, times, tracks };
  }

  const ts = genTS(clips, UAL_PELVIS_REST);
  const outPath = join(root, 'src/render/units/model/ualClips.ts');
  writeFileSync(outPath, ts);
  console.log(`\nArquivo gerado: ${outPath}`);
}

function genTS(clips, pelvisRest) {
  const L = [
    '/**',
    ' * Animacoes da Universal Animation Library com retargeting para o esqueleto do jogo.',
    ' * Gerado automaticamente por scripts/extractUALAnims.mjs — NAO editar a mao.',
    ' *',
    ' * Rotacoes: orientacoes de mundo da UAL convertidas para locais do jogo.',
    ' * `hips.position` guarda DESLOCAMENTO em relacao ao descanso (espaco UAL,',
    ' * eixo Z = cima); a escala para o tamanho do boneco e aplicada em anims.ts.',
    ' */',
    "import * as THREE from 'three';",
    '',
    '/** Descanso da pelvis na UAL [x, y, z] (z = altura, ~0.92m). */',
    `export const UAL_PELVIS_REST: [number, number, number] = [${pelvisRest.map((v) => v.toFixed(4)).join(', ')}];`,
    '',
    'export type UALClipName = ' + Object.keys(clips).map((n) => `'${n}'`).join(' | ') + ';',
    '',
    'const D: Record<UALClipName, { duration: number; times: number[]; tracks: { name: string; values: number[]; hips?: boolean }[] }> = {',
  ];
  for (const [name, c] of Object.entries(clips)) {
    L.push(`  ${name}: {`);
    L.push(`    duration: ${c.duration.toFixed(3)},`);
    L.push(`    times: [${c.times.map((t) => t.toFixed(3)).join(', ')}],`);
    L.push(`    tracks: [`);
    for (const t of c.tracks) {
      L.push(`      { name: '${t.name}'${t.isHipsOffset ? ', hips: true' : ''}, values: [`);
      const v = t.values;
      for (let i = 0; i < v.length; i += 8) {
        L.push(`        ${v.slice(i, i + 8).map((x) => x.toFixed(4)).join(', ')}${i + 8 < v.length ? ',' : ''}`);
      }
      L.push(`      ] },`);
    }
    L.push(`    ],`);
    L.push(`  },`);
  }
  L.push('};');
  L.push('');
  L.push('/** Clipes Three.js a partir dos dados extraidos (hips.position em espaco UAL). */');
  L.push('export function ualRawClips(): Record<UALClipName, THREE.AnimationClip> {');
  L.push('  const out = {} as Record<UALClipName, THREE.AnimationClip>;');
  L.push('  for (const [name, c] of Object.entries(D)) {');
  L.push('    const tracks: THREE.KeyframeTrack[] = c.tracks.map((t) =>');
  L.push("      t.name.endsWith('.quaternion')");
  L.push('        ? new THREE.QuaternionKeyframeTrack(t.name, c.times, t.values)');
  L.push('        : new THREE.VectorKeyframeTrack(t.name, c.times, t.values),');
  L.push('    );');
  L.push("    out[name as UALClipName] = new THREE.AnimationClip(name, c.duration, tracks);");
  L.push('  }');
  L.push('  return out;');
  L.push('}');
  return L.join('\n') + '\n';
}

main();
