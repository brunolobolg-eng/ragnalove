import type { Orientation, Vec2 } from './types';

/**
 * Padrões de tiles para habilidades. Tudo é definido como listas de tiles —
 * adicionar um padrão novo não exige mexer no Board nem no combate.
 */

const LINE_STEP: Record<Orientation, Vec2> = {
  H: { x: 1, y: 0 },
  V: { x: 0, y: 1 },
  DIAG_DOWN: { x: 1, y: 1 }, // ↘
  DIAG_UP: { x: 1, y: -1 }, // ↗
};

/** Linha centrada em `center`. */
export function linePattern(center: Vec2, orientation: Orientation, length: number): Vec2[] {
  const step = LINE_STEP[orientation];
  const start = -Math.floor((length - 1) / 2);
  const out: Vec2[] = [];
  for (let i = 0; i < length; i++) {
    const k = start + i;
    out.push({ x: center.x + step.x * k, y: center.y + step.y * k });
  }
  return out;
}

/**
 * Cone discreto: todos os tiles até `range` (Chebyshev) cujo ângulo em relação
 * a `facing` é <= halfAngleDeg. Funciona para as 8 direções.
 */
export function conePattern(origin: Vec2, facing: Vec2, range: number, halfAngleDeg: number): Vec2[] {
  const out: Vec2[] = [];
  const fl = Math.hypot(facing.x, facing.y) || 1;
  const cosLimit = Math.cos((halfAngleDeg * Math.PI) / 180) - 1e-6;
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      if (dx === 0 && dy === 0) continue;
      const cos = (dx * facing.x + dy * facing.y) / (Math.hypot(dx, dy) * fl);
      if (cos >= cosLimit) out.push({ x: origin.x + dx, y: origin.y + dy });
    }
  }
  return out;
}

/** Área quadrada (para futuras habilidades). */
export function squarePattern(center: Vec2, radius: number): Vec2[] {
  const out: Vec2[] = [];
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) out.push({ x: center.x + dx, y: center.y + dy });
  return out;
}
