import * as THREE from 'three';
import type { Board } from '../../core/grid/Board';
import { GAME_CONFIG, ZONE_STATE } from '../../config/gameConfig';
import { REGIONS } from '../../config/world';
import { ACT_DRESSING, type ActPeca } from '../../config/visualConfig';
import { tileToWorld } from '../coords';
import { instanceProps } from './props';

/**
 * Cenário dos monstros do ato, em volta de cada portal de spawn (só visual). Todas as peças são arte do dono
 * (GLB com textura em public/models/props, kit em `ACT_DRESSING.atos` no visualConfig.ts):
 *   Ato I  — toca de ratos: toco, montes de pedra, cama de palha, caixas e barricas rasgadas.
 *   Ato II — acampamento goblin: totens de madeira, cercas de estacas, fogueira apagada, baldes e tábuas.
 *   Ato III — acampamento orc: estandartes, barricadas, fogueiras queimadas e tábuas.
 * Peças baixas podem ficar no chão andável; peças altas só em tiles bloqueados (não enganam o jogador).
 */

const UP = new THREE.Vector3(0, 1, 0);

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
  const kit = act === undefined ? undefined : ACT_DRESSING.atos[act];
  if (!kit) return group;
  let seed = 7;
  for (const ch of zone.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = mulberry(seed);
  const used = new Set<string>();
  /** Cópias de cada modelo (caminho do GLB) no mundo: desenhadas com InstancedMesh, uma chamada por malha. */
  const copias = new Map<string, THREE.Matrix4[]>();
  const place = (peca: ActPeca, x: number, y: number) => {
    const p = tileToWorld(x, y);
    const { path, escala, base } = ACT_DRESSING.pecas[peca];
    const s = escala * (0.85 + rnd() * 0.35);
    const mx = new THREE.Matrix4().compose(
      new THREE.Vector3(p.x + (rnd() - 0.5) * 0.35, -base * s, p.z + (rnd() - 0.5) * 0.35),
      new THREE.Quaternion().setFromAxisAngle(UP, rnd() * Math.PI * 2),
      new THREE.Vector3(s, s, s),
    );
    const lista = copias.get(path);
    if (lista) lista.push(mx);
    else copias.set(path, [mx]);
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
        place(kit.altas[tall % kit.altas.length], t.x, t.y);
        tall++;
      } else if (t.walk && flat < ACT_DRESSING.flatPerSpawn) {
        place(kit.baixas[flat % kit.baixas.length], t.x, t.y);
        flat++;
      }
      if (flat >= ACT_DRESSING.flatPerSpawn && tall >= ACT_DRESSING.tallPerSpawn) break;
    }
  }
  // cada modelo entra depois de carregar (o cenário aparece na hora; as peças chegam um instante depois)
  for (const [path, mats] of copias) instanceProps(group, path, mats);
  return group;
}
