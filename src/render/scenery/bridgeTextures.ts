import type * as THREE from 'three';
import { CENARIO_DIR } from './sceneryTextures';
import { loadTexture } from './naturKit';

/**
 * Texturas da zona da ponte (Valdrec): blocos de muralha e a lateral com o arco. São imagens WebP geradas por
 * scripts/gerarTexturasCenario.py (public/textures/cenario/), carregadas como textura normal (nítidas de perto).
 * As variantes de muralha (seeds 12, 21 e 57) têm o mesmo desenho com outro arranjo de pedras.
 */

/** Arquivo de cada variante de muralha (a seed é só o nome da variante). */
const VARIANTES_MURALHA: Record<number, string> = {
  12: 'bloco_ponte_12',
  21: 'bloco_ponte_21',
  57: 'bloco_ponte_57',
};

/** Blocos grandes de muralha/parapeito (cinza frio). A variante escolhe o arranjo das pedras. */
export function wallBlockTexture(seed = 21): THREE.Texture {
  const nome = VARIANTES_MURALHA[seed] ?? VARIANTES_MURALHA[21];
  return loadTexture(`${CENARIO_DIR}${nome}.webp`);
}

/** Lateral da ponte: blocos + arcos escuros (o vão por onde a água passa). Repete ao longo da ponte. */
export function bridgeSideTexture(): THREE.Texture {
  return loadTexture(`${CENARIO_DIR}ponte_lateral.webp`);
}
