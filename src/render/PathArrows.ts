import * as THREE from 'three';
import type { Board } from '../core/grid/Board';
import { FlowField, canStep } from '../core/grid/pathfinding';
import { DIRS8, type Vec2 } from '../core/grid/types';
import { GAME_CONFIG, ZONE_STATE } from '../config/gameConfig';
import { PATH_ARROWS } from '../config/visualConfig';
import { tileToWorld } from './coords';

/** Textura da seta: chevron branco suave apontando para +Y (o tint vem do material). */
let arrowTex: THREE.Texture | undefined;
function arrowTexture(): THREE.Texture {
  if (arrowTex) return arrowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = 'rgba(255,255,255,0.8)';
  g.shadowBlur = 6;
  g.beginPath();
  g.moveTo(14, 42);
  g.lineTo(32, 22);
  g.lineTo(50, 42);
  g.stroke();
  arrowTex = new THREE.CanvasTexture(c);
  return arrowTex;
}

/** Caminho (em tiles) descendo o campo de fluxo a partir de `from` até um alvo. */
function trace(board: Board, flow: FlowField, from: Vec2): Vec2[] {
  const path: Vec2[] = [{ ...from }];
  let cur = { ...from };
  for (let i = 0; i < PATH_ARROWS.maxSteps && flow.at(cur.x, cur.y) > 0; i++) {
    let best: Vec2 | undefined;
    let bestD = flow.at(cur.x, cur.y);
    for (const d of DIRS8) {
      if (!canStep(board, cur, d)) continue;
      const nd = flow.at(cur.x + d.x, cur.y + d.y);
      if (nd < bestD) {
        bestD = nd;
        best = { x: cur.x + d.x, y: cur.y + d.y };
      }
    }
    if (!best) break;
    cur = best;
    path.push(cur);
  }
  return path;
}

/**
 * Setas transparentes no chão, do portal de spawn até o alvo da horda (portão da cidade ou a
 * posição inicial da party). Só leitura do mapa: não muda nada da simulação.
 */
export class PathArrows {
  readonly mesh?: THREE.InstancedMesh;
  private t = 0;

  constructor(board: Board) {
    if (!PATH_ARROWS.enabled) return;
    const city = board.cityTiles();
    const goals: Vec2[] = city.length > 0 ? city : ZONE_STATE.current.defaultSetup.members.map((m) => ({ x: m.x, y: m.y }));
    const flow = new FlowField(board);
    flow.compute(goals, GAME_CONFIG.pathing);

    const marks: { pos: THREE.Vector3; yaw: number }[] = [];
    for (const sp of GAME_CONFIG.wave.spawnPoints) {
      if (flow.at(sp.x, sp.y) >= FlowField.INF) continue;
      const path = trace(board, flow, sp);
      const end = path.length - 1 - PATH_ARROWS.skipEnd;
      for (let i = PATH_ARROWS.skipStart; i <= end; i += PATH_ARROWS.spacing) {
        const a = path[Math.max(0, i - 1)];
        const b = path[Math.min(path.length - 1, i + 1)];
        const dx = b.x - a.x;
        const dz = b.y - a.y;
        if (dx === 0 && dz === 0) continue;
        marks.push({ pos: tileToWorld(path[i].x, path[i].y, undefined, PATH_ARROWS.height), yaw: Math.atan2(-dx, -dz) });
      }
    }
    if (marks.length === 0) return;

    const geo = new THREE.PlaneGeometry(PATH_ARROWS.size, PATH_ARROWS.size).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: arrowTexture(),
      color: PATH_ARROWS.color,
      transparent: true,
      opacity: PATH_ARROWS.opacity,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, marks.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    marks.forEach((k, i) => mesh.setMatrixAt(i, m.compose(k.pos, q.setFromAxisAngle(up, k.yaw), one)));
    mesh.renderOrder = 1;
    this.mesh = mesh;
  }

  /** Pulso lento e discreto. */
  update(dt: number): void {
    if (!this.mesh) return;
    this.t += dt;
    const mat = this.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = PATH_ARROWS.opacity * (1 - PATH_ARROWS.pulse * 0.5 + Math.sin(this.t * PATH_ARROWS.pulseSpeed) * PATH_ARROWS.pulse * 0.5);
  }
}
