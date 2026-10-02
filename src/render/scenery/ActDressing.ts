import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Board } from '../../core/grid/Board';
import { GAME_CONFIG, ZONE_STATE } from '../../config/gameConfig';
import { REGIONS } from '../../config/world';
import { ACT_DRESSING } from '../../config/visualConfig';
import { tileToWorld } from '../coords';

/**
 * Cenário dos monstros do ato, em volta de cada portal de spawn (só visual):
 *   Ato I  — toca de ratos: buracos, montes de terra, palha, ossinhos, sacos de grão rasgados.
 *   Ato II — acampamento goblin: totens de caveira, estacas afiadas, fogueira apagada.
 *   Ato III — acampamento orc: estandartes vermelhos, barricadas de espinhos, chão queimado.
 * Peças baixas podem ficar no chão andável; peças altas só em tiles bloqueados (não enganam o jogador).
 */

type Piece = (rnd: () => number) => THREE.BufferGeometry;

function colored(geo: THREE.BufferGeometry, hex: number, jitter = 0.08, rnd: () => number = Math.random): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const base = new THREE.Color(hex);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const k = 1 - jitter + rnd() * jitter * 2;
    for (let j = 0; j < 3 && i + j < n; j++) col.set([base.r * k, base.g * k, base.b * k], (i + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) =>
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts, false)!;

// ---------- Ato I: ratos ----------
const burrow: Piece = (r) =>
  merge([
    colored(at(new THREE.TorusGeometry(0.34, 0.12, 5, 12).scale(1, 1, 0.45), 0, 0.03, 0, -Math.PI / 2), 0x5a4330, 0.1, r),
    colored(at(new THREE.CircleGeometry(0.3, 12), 0, 0.02, 0, -Math.PI / 2), 0x0d0907, 0.02, r),
    colored(at(new THREE.SphereGeometry(0.16, 6, 4).scale(1, 0.4, 1), 0.42, 0.03, 0.12), 0x6a5038, 0.1, r),
  ]);
const straw: Piece = (r) => colored(new THREE.ConeGeometry(0.42, 0.22, 9).translate(0, 0.11, 0), 0xb59a52, 0.15, r);
const bonesSmall: Piece = (r) =>
  merge([
    colored(at(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 5), 0, 0.03, 0, 0, 0, Math.PI / 2), 0xe2d8bf, 0.06, r),
    colored(at(new THREE.CylinderGeometry(0.022, 0.022, 0.28, 5), 0.03, 0.035, 0.02, 0, 0.9, Math.PI / 2), 0xd8cdb2, 0.06, r),
    colored(at(new THREE.SphereGeometry(0.07, 6, 5), -0.17, 0.05, 0.05), 0xe6dcc4, 0.05, r),
  ]);
const grainSack: Piece = (r) =>
  merge([
    colored(new THREE.SphereGeometry(0.22, 7, 5).scale(1, 0.75, 0.85).translate(0, 0.15, 0), 0x9a7d55, 0.1, r),
    colored(at(new THREE.CircleGeometry(0.3, 10), 0.22, 0.015, 0.1, -Math.PI / 2), 0xd8c07a, 0.12, r),
  ]);
const dirtMound: Piece = (r) => colored(new THREE.SphereGeometry(0.3, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1), 0x4e3a28, 0.12, r);

// ---------- Ato II: goblins ----------
const skullTotem: Piece = (r) =>
  merge([
    colored(new THREE.CylinderGeometry(0.07, 0.09, 1.5, 6).translate(0, 0.75, 0), 0x5a3b22, 0.1, r),
    colored(new THREE.SphereGeometry(0.15, 7, 6).scale(1, 0.95, 1.05).translate(0, 1.58, 0.02), 0xe5dcc5, 0.05, r),
    colored(at(new THREE.ConeGeometry(0.05, 0.3, 5), -0.17, 1.68, 0, 0, 0, 0.7), 0xd9cfb5, 0.05, r),
    colored(at(new THREE.ConeGeometry(0.05, 0.3, 5), 0.17, 1.68, 0, 0, 0, -0.7), 0xd9cfb5, 0.05, r),
    colored(new THREE.BoxGeometry(0.34, 0.08, 0.06).translate(0, 1.2, 0.06), 0x8b2a1e, 0.1, r),
  ]);
const stakes: Piece = (r) =>
  merge(
    [-0.25, 0, 0.25].map((x, i) =>
      colored(at(new THREE.ConeGeometry(0.08, 1.1 + i * 0.12, 6).translate(0, 0.5, 0), x, 0, 0, 0.35, 0, (i - 1) * 0.1), 0x6b4a2c, 0.12, r),
    ),
  );
const deadFire: Piece = (r) =>
  merge([
    colored(at(new THREE.CircleGeometry(0.36, 12), 0, 0.015, 0, -Math.PI / 2), 0x2a2420, 0.1, r),
    ...Array.from({ length: 7 }, (_, i) => {
      const a = (i / 7) * Math.PI * 2;
      return colored(new THREE.DodecahedronGeometry(0.09, 0).scale(1, 0.7, 1).translate(Math.cos(a) * 0.4, 0.05, Math.sin(a) * 0.4), 0x6e6a62, 0.12, r);
    }),
    colored(at(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 5), 0, 0.06, 0, 0, 0.6, Math.PI / 2), 0x1e1612, 0.08, r),
  ]);
const bonePile: Piece = (r) => merge([bonesSmall(r), at(bonesSmall(r), 0.1, 0.03, -0.12, 0, 1.7, 0)]);

// ---------- Ato III: orcs ----------
const banner: Piece = (r) =>
  merge([
    colored(new THREE.CylinderGeometry(0.05, 0.06, 2.0, 6).translate(0, 1.0, 0), 0x3a2a1c, 0.1, r),
    colored(new THREE.BoxGeometry(0.62, 0.05, 0.05).translate(0, 1.9, 0), 0x3a2a1c, 0.1, r),
    colored(new THREE.BoxGeometry(0.56, 0.9, 0.02).translate(0, 1.42, 0.04), 0x8a1a14, 0.1, r),
    colored(new THREE.ConeGeometry(0.28, 0.25, 3).rotateZ(Math.PI).translate(0, 0.86, 0.04).scale(1, 1, 0.08), 0x8a1a14, 0.1, r),
    colored(new THREE.SphereGeometry(0.1, 6, 5).translate(0, 1.5, 0.07), 0xd8ccb0, 0.05, r),
  ]);
const spikeBarricade: Piece = (r) =>
  merge([
    colored(at(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), 0, 0.35, 0, 0, 0, 0.75), 0x4a3422, 0.1, r),
    colored(at(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), 0, 0.35, 0, 0, 0, -0.75), 0x4a3422, 0.1, r),
    ...[-0.4, 0, 0.4].map((x) => colored(at(new THREE.ConeGeometry(0.05, 0.4, 5), x, 0.55, 0.12, Math.PI / 2.4, 0, 0), 0x9a9a9a, 0.08, r)),
  ]);
const scorch: Piece = (r) => colored(at(new THREE.CircleGeometry(0.5, 12).scale(1, 0.75, 1), 0, 0.013, 0, -Math.PI / 2), 0x1a100c, 0.15, r);
const skullPile: Piece = (r) =>
  merge(
    Array.from({ length: 4 }, (_, i) =>
      colored(new THREE.SphereGeometry(0.11, 6, 5).translate((i % 2) * 0.18 - 0.09, 0.09 + (i === 3 ? 0.15 : 0), Math.floor(i / 2) * 0.16 - 0.08), 0xddd2b8, 0.06, r),
    ),
  );

const KIT: Record<number, { flat: Piece[]; tall: Piece[] }> = {
  0: { flat: [burrow, burrow, straw, bonesSmall, grainSack, dirtMound], tall: [straw, dirtMound, grainSack] },
  1: { flat: [deadFire, bonePile, bonesSmall], tall: [skullTotem, stakes, skullTotem] },
  2: { flat: [scorch, skullPile, scorch], tall: [banner, spikeBarricade, banner] },
};

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Grupo com o cenário temático do ato atual (vazio fora dos atos). */
export function buildActDressing(board: Board): THREE.Group {
  const group = new THREE.Group();
  const zone = ZONE_STATE.current;
  const act = REGIONS.find((r) => r.zone === zone.id && r.act !== undefined)?.act;
  const kit = act === undefined ? undefined : KIT[act];
  if (!kit) return group;
  let seed = 7;
  for (const ch of zone.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = mulberry(seed);
  const used = new Set<string>();
  const parts: THREE.BufferGeometry[] = [];
  const place = (piece: Piece, x: number, y: number) => {
    const p = tileToWorld(x, y);
    const g = piece(rnd);
    const s = 0.85 + rnd() * 0.35;
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(p.x + (rnd() - 0.5) * 0.35, 0, p.z + (rnd() - 0.5) * 0.35), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2), new THREE.Vector3(s, s, s)));
    parts.push(g);
    used.add(`${x},${y}`);
  };
  for (const sp of GAME_CONFIG.wave.spawnPoints) {
    const ring: { x: number; y: number; walk: boolean }[] = [];
    const R = Math.ceil(ACT_DRESSING.radiusMax);
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dy);
        const x = sp.x + dx;
        const y = sp.y + dy;
        if (d < ACT_DRESSING.radiusMin || d > ACT_DRESSING.radiusMax || !board.inBounds(x, y) || board.isCity(x, y)) continue;
        ring.push({ x, y, walk: board.isWalkable(x, y) });
      }
    // embaralha (determinístico por zona)
    for (let i = ring.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [ring[i], ring[j]] = [ring[j], ring[i]];
    }
    let flat = 0;
    let tall = 0;
    for (const t of ring) {
      if (used.has(`${t.x},${t.y}`)) continue;
      if (!t.walk && tall < ACT_DRESSING.tallPerSpawn) {
        place(kit.tall[tall % kit.tall.length], t.x, t.y);
        tall++;
      } else if (t.walk && flat < ACT_DRESSING.flatPerSpawn) {
        place(kit.flat[flat % kit.flat.length], t.x, t.y);
        flat++;
      }
      if (flat >= ACT_DRESSING.flatPerSpawn && tall >= ACT_DRESSING.tallPerSpawn) break;
    }
  }
  if (parts.length === 0) return group;
  const geo = merge(parts);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
