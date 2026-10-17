import * as THREE from 'three';
import type { Board } from '../../core/grid/Board';
import { loadTexture } from './naturKit';

/**
 * Texturas do cenário da vila e do muro. Antes eram pintadas em canvas na hora do carregamento (borravam de
 * perto); agora são imagens WebP geradas por scripts/gerarTexturasCenario.py e carregadas como textura normal.
 * Repetem como antes: grama, pavimento e arenito cobrem 4 casas por imagem.
 */

/** Pasta das imagens do cenário gerado (public/textures/cenario). */
export const CENARIO_DIR = 'textures/cenario/';

/** Todas as imagens do cenário gerado: o jogo começa a carregá-las logo no arranque (ver BoardView.ts). */
export const TEXTURAS_CENARIO: readonly string[] = [
  'chao_planicie', 'chao_fora', 'grama_vila', 'losango_vila', 'arenito', 'tufo_grama', 'raio_floresta',
  'bloco_ponte_12', 'bloco_ponte_21', 'bloco_ponte_57', 'ponte_lateral', 'runa_portal', 'grade_casa', 'laje_portao',
  'pedra_praca',
].map((nome) => `${CENARIO_DIR}${nome}.webp`);

/** Cor da terra batida da trilha da horda (a mesma do canvas antigo). */
const COR_TERRA = '#a48a5c';
/** Máscara da trilha: 8 px por casa (suave, como as manchas antigas). */
const RES_TRILHA = 8;

function cenario(nome: string): THREE.Texture {
  return loadTexture(`${CENARIO_DIR}${nome}.webp`);
}

/** Gerador determinístico (LCG): a mesma semente sempre gera a mesma trilha. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Grama repetível (4 casas por imagem). */
export function grassTileTexture(): THREE.Texture {
  return cenario('grama_vila');
}

/** Pavimento em losangos repetível (4 casas por imagem). */
export function pavingTileTexture(): THREE.Texture {
  return cenario('losango_vila');
}

/** Blocos de arenito para muros e construções. */
export function sandstoneBrickTexture(): THREE.Texture {
  return cenario('arenito');
}

/** Tufo de grama (billboard com alpha). */
export function grassTuftTexture(): THREE.Texture {
  return cenario('tufo_grama');
}

/**
 * Chão do tabuleiro da vila: campo de grama ao norte, pavimento ao sul, meio-fio entre os dois, trilha de terra
 * que a horda abriu até o portão (manchas suaves) e a grade sutil. Só apresentação: a grade não muda.
 */
export function boardGround(board: Board, wallRow: number): THREE.Group {
  const W = board.width;
  const H = board.height;
  const grupo = new THREE.Group();
  const norte = wallRow + 1; // linhas do campo (de cima até o muro)
  const sul = H - norte; // linhas da praça
  const zCorte = -H / 2 + norte; // divisa campo / praça (z do mundo)

  const grama = grassTileTexture();
  grama.repeat.set(W / 4, norte / 4);
  const campo = new THREE.Mesh(
    new THREE.PlaneGeometry(W, norte).rotateX(-Math.PI / 2).translate(0, 0, -H / 2 + norte / 2),
    new THREE.MeshLambertMaterial({ map: grama }),
  );
  campo.receiveShadow = true;

  const pavimento = pavingTileTexture();
  pavimento.repeat.set(W / 4, sul / 4);
  const praca = new THREE.Mesh(
    new THREE.PlaneGeometry(W, sul).rotateX(-Math.PI / 2).translate(0, 0, zCorte + sul / 2),
    new THREE.MeshLambertMaterial({ map: pavimento }),
  );
  praca.receiveShadow = true;
  grupo.add(campo, praca);

  // meio-fio: faixa de arenito na divisa, com a sombra fina logo abaixo
  let gapMin = board.width;
  let gapMax = -1;
  for (let x = 0; x < board.width; x++)
    if (board.isWalkable(x, wallRow)) {
      gapMin = Math.min(gapMin, x);
      gapMax = Math.max(gapMax, x);
    }
  const meio = cenario('arenito');
  meio.repeat.set(W / 2, 1);
  const meioFio = new THREE.Mesh(
    new THREE.PlaneGeometry(W, 9 / 64).rotateX(-Math.PI / 2).translate(0, 0.005, zCorte - 0.5 / 64),
    new THREE.MeshLambertMaterial({ map: meio }),
  );
  const sombraMeio = new THREE.Mesh(
    new THREE.PlaneGeometry(W, 2 / 64).rotateX(-Math.PI / 2).translate(0, 0.004, zCorte + 4 / 64),
    new THREE.MeshLambertMaterial({ color: 0x504632, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  grupo.add(meioFio, sombraMeio);

  // trilha de terra batida: manchas suaves desde o muro até o portão (máscara em baixa resolução)
  const gateCx = (gapMin + gapMax + 1) / 2;
  const r = rng(7);
  const manchas: { cx: number; cy: number; rr: number }[] = [];
  for (let y = 0; y <= wallRow && gapMax >= 0; y++) {
    const spread = 0.8 + (y / wallRow) * ((gapMax - gapMin + 1) * 0.35);
    const cx0 = gateCx + Math.sin(y * 1.3) * 0.6;
    for (let k = 0; k < 6; k++) {
      const cx = cx0 + (r() - 0.5) * spread;
      const cy = y + 0.5 + (r() - 0.5) * spread;
      manchas.push({ cx, cy, rr: spread * (0.35 + r() * 0.4) });
    }
  }
  const TW = W * RES_TRILHA;
  const TH = H * RES_TRILHA;
  const dados = new Uint8Array(TW * TH * 4);
  for (let j = 0; j < TH; j++) {
    // v cresce para o norte: a linha j da máscara é a casa (1 - v) * H de cima para baixo
    const yTile = (1 - (j + 0.5) / TH) * H;
    for (let i = 0; i < TW; i++) {
      const xTile = (i + 0.5) / RES_TRILHA;
      let a = 0;
      for (const m of manchas) {
        const d = Math.hypot(xTile - m.cx, yTile - m.cy) / m.rr;
        if (d < 1) a = Math.max(a, 0.87 * (1 - d) * 1.4);
      }
      const v = Math.min(1, a) * 255;
      const o = (j * TW + i) * 4;
      dados[o] = dados[o + 1] = dados[o + 2] = v;
      dados[o + 3] = 255;
    }
  }
  const mascara = new THREE.DataTexture(dados, TW, TH, THREE.RGBAFormat);
  mascara.minFilter = THREE.LinearFilter;
  mascara.magFilter = THREE.LinearFilter;
  mascara.colorSpace = THREE.NoColorSpace;
  mascara.needsUpdate = true;
  const trilha = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2).translate(0, 0.003, 0),
    new THREE.MeshLambertMaterial({ color: COR_TERRA, alphaMap: mascara, transparent: true, depthWrite: false, opacity: 0.85 }),
  );
  trilha.receiveShadow = true;
  grupo.add(trilha);

  // grade sutil (uma linha por casa, repetida): só a sugestão das casas
  const grade = cenario('grade_casa');
  grade.repeat.set(W, H);
  const grelha = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2).translate(0, 0.006, 0),
    new THREE.MeshLambertMaterial({ map: grade, transparent: true, depthWrite: false }),
  );
  grupo.add(grelha);
  return grupo;
}
