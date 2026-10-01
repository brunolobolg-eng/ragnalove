import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig';

/** Tamanho da grade da zona ativa (muda por mapa — lido na hora, nunca fixo). */
const W = () => GAME_CONFIG.board.width;
const H = () => GAME_CONFIG.board.height;

/** Tile da grade (x, y) -> mundo (X, Z). y da grade cresce em direção à câmera. */
export function tileToWorld(x: number, y: number, out = new THREE.Vector3(), height = 0): THREE.Vector3 {
  return out.set(x - W() / 2 + 0.5, height, y - H() / 2 + 0.5);
}

export function worldToTile(p: THREE.Vector3): { x: number; y: number } {
  return { x: Math.floor(p.x + W() / 2), y: Math.floor(p.z + H() / 2) };
}

/** Ângulo Y para um objeto "olhar" na direção (fx, fy) da grade. */
export function facingToYaw(fx: number, fy: number): number {
  return Math.atan2(fx, fy);
}
