import * as THREE from 'three';
import type { ParsedZone } from '../../config/zones';
import type { Vec2 } from '../../core/grid/types';

/**
 * Matemática dos chãos em camadas (floresta e deserto): ruído, desfoque e caminhos até o portão.
 * Só visual: nada aqui entra na simulação.
 */

/** Hash inteiro determinístico (só visual): o mesmo mapa sai sempre igual. */
export function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Ruído de valor suave (0 a 1), com interpolação em S. */
function valueNoise(x: number, y: number, s: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, s);
  const b = hash(x0 + 1, y0, s);
  const c = hash(x0, y0 + 1, s);
  const d = hash(x0 + 1, y0 + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Ruído em três oitavas (0 a 1): bordas orgânicas e manchas irregulares. */
export function noise(x: number, y: number, s: number): number {
  return 0.6 * valueNoise(x, y, s) + 0.3 * valueNoise(x * 2.03, y * 2.03, s + 1) + 0.1 * valueNoise(x * 4.1, y * 4.1, s + 2);
}

/** Degrau suave: 0 abaixo de `a`, 1 acima de `b`. */
export function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Desfoque de caixa (média móvel) de raio `r`, em linhas ou em colunas. As bordas repetem o pixel da borda.
 * Duas passadas (linhas e depois colunas) dão um desfoque suave, bem mais leve que o filtro do canvas.
 */
export function boxBlur(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, vertical = false): void {
  const n = vertical ? h : w;
  const lines = vertical ? w : h;
  const step = vertical ? w : 1;
  const lineStep = vertical ? 1 : w;
  const inv = 1 / (2 * r + 1);
  for (let l = 0; l < lines; l++) {
    const base = l * lineStep;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[base + Math.min(n - 1, Math.max(0, k)) * step];
    for (let k = 0; k < n; k++) {
      dst[base + k * step] = acc * inv;
      acc += src[base + Math.min(n - 1, k + r + 1) * step] - src[base + Math.max(0, k - r) * step];
    }
  }
}

/** Caminho mais curto de cada entrada até o portão, por tiles livres (sem muro, vazio ou árvore). */
export function trailRoutes(zone: ParsedZone): Vec2[][] {
  const W = zone.width;
  const blocked = new Set([...zone.walls, ...zone.voids].map((p) => p.y * W + p.x));
  const goals = new Set(zone.city.map((p) => p.y * W + p.x));
  const steps: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const routes: Vec2[][] = [];
  for (const s of zone.spawnPoints) {
    const start = s.y * W + s.x;
    const prev = new Map<number, number>([[start, -1]]);
    const queue = [start];
    let goal = -1;
    for (let i = 0; i < queue.length && goal < 0; i++) {
      const cur = queue[i];
      if (goals.has(cur)) {
        goal = cur;
        break;
      }
      const x = cur % W;
      const y = (cur - x) / W;
      for (const [dx, dy] of steps) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= zone.height) continue;
        const n = ny * W + nx;
        if (blocked.has(n) || prev.has(n)) continue;
        prev.set(n, cur);
        queue.push(n);
      }
    }
    if (goal < 0) continue;
    const path: Vec2[] = [];
    for (let c = goal; c >= 0; c = prev.get(c)!) path.push({ x: c % W, y: Math.floor(c / W) });
    routes.push(path);
  }
  return routes;
}

/** Chão pronto para a cena: o grupo com as camadas e a animação da água. */
export interface GroundHandle {
  group: THREE.Group;
  /** Anima a água: as ondas deslizam devagar sobre a textura. */
  update(dt: number): void;
}
