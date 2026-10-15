import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadTexture } from './naturKit';

/**
 * Muralhas com a peça `muros.glb` do dono (public/models/muros.glb): um módulo de 1 m com torres e ameias nas
 * pontas, 0,38 de altura e 0,2 de espessura. Cada trecho reto é coberto por módulos esticados até a altura da
 * muralha (escala uniforme: a pedra não se deforma). Todos os módulos de uma chamada saem num só InstancedMesh.
 */

/** Trecho reto: vai de `a` até `b` ao longo do eixo; `linha` é a posição fixa no outro eixo (z se `eixo` = 'x'). */
export interface TrechoMuralha {
  a: number;
  b: number;
  linha: number;
  eixo: 'x' | 'z';
}

interface Peca {
  geometria: THREE.BufferGeometry;
  /** Altura e comprimento do módulo original, em tiles (1 unidade = 1 tile). */
  altura: number;
  comprimento: number;
}

const loader = new GLTFLoader();
let peca: Promise<Peca> | null = null;
/** Material compartilhado: a pedra entra quando o GLB chega (os pilares do portão usam o mesmo material). */
const material = new THREE.MeshLambertMaterial({ color: 0xffffff });

/** Material da pedra do muro, também para peças que não são módulos (ex.: pilares do portão). */
export function muroMaterial(): THREE.MeshLambertMaterial {
  return material;
}

function carregarPeca(): Promise<Peca> {
  if (!peca) {
    peca = loader.loadAsync('models/muros.glb').then((g) => {
      const malhas: THREE.Mesh[] = [];
      g.scene.updateMatrixWorld(true);
      g.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) malhas.push(o as THREE.Mesh);
      });
      const malha = malhas[0];
      if (!malha) throw new Error('muros.glb sem malha');
      // a pedra da barreira é a arte do dono (pedra de blocos clara, WebP); o mapa embutido no GLB era escuro
      material.map = loadTexture('textures/cidade/pedra_bloco_claro.webp');
      material.needsUpdate = true;
      // o módulo é comprido em Z: gira para X (os trechos correm em X) e assenta a base em y = 0
      const geometria = malha.geometry.clone().applyMatrix4(malha.matrixWorld).rotateY(Math.PI / 2);
      geometria.computeBoundingBox();
      const caixa = geometria.boundingBox!;
      geometria.translate(0, -caixa.min.y, 0);
      return { geometria, altura: caixa.max.y - caixa.min.y, comprimento: caixa.max.x - caixa.min.x };
    });
  }
  return peca;
}

/**
 * Cobre cada trecho com módulos da peça. `altura` é a altura da muralha em tiles: a peça é esticada
 * uniformemente até ela. Os módulos entram na cena quando o GLB chega (como as peças do props).
 */
export function muralhaRetas(parent: THREE.Object3D, trechos: TrechoMuralha[], altura: number): void {
  if (!trechos.length) return;
  carregarPeca()
    .then(({ geometria, altura: alturaPeca, comprimento }) => {
      const escala = altura / alturaPeca;
      const girada = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const esc = new THREE.Vector3();
      const mats: THREE.Matrix4[] = [];
      for (const t of trechos) {
        const L = Math.abs(t.b - t.a);
        if (L <= 0) continue;
        const lo = Math.min(t.a, t.b);
        // número inteiro de módulos, divididos igualmente no trecho (a ponta da peça fica no fim dele)
        const n = Math.max(1, Math.round(L / (comprimento * escala)));
        const passo = L / n;
        for (let i = 0; i < n; i++) {
          const c = lo + (i + 0.5) * passo;
          if (t.eixo === 'x') {
            pos.set(c, 0, t.linha);
            quat.identity();
          } else {
            pos.set(t.linha, 0, c);
            quat.copy(girada);
          }
          esc.set(passo / comprimento, escala, escala);
          mats.push(new THREE.Matrix4().compose(pos, quat, esc));
        }
      }
      if (!mats.length) return;
      const im = new THREE.InstancedMesh(geometria, material, mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = true;
      im.receiveShadow = true;
      parent.add(im);
    })
    .catch((e) => console.warn('muros.glb não carregou; a muralha fica sem peça', e));
}

/**
 * Junta tiles de muralha em trechos retos. Sequências de 2 ou mais tiles na mesma fileira viram trechos horizontais;
 * os tiles que sobram formam trechos verticais por coluna. `folga` estende cada ponta (meia espessura da peça), para
 * as esquinas fecharem sem vão. `X` e `Z` convertem tile em coordenada do mundo (centro do tile).
 */
export function trechosDeTiles(tiles: { x: number; y: number }[], X: (x: number) => number, Z: (y: number) => number, folga = 0.35): TrechoMuralha[] {
  const sequencias = (v: number[]): number[][] => {
    const out: number[][] = [];
    for (const n of [...v].sort((a, b) => a - b)) {
      const ult = out[out.length - 1];
      if (ult && ult[ult.length - 1] === n - 1) ult.push(n);
      else out.push([n]);
    }
    return out;
  };
  const trechos: TrechoMuralha[] = [];
  const porLinha = new Map<number, number[]>();
  for (const t of tiles) porLinha.set(t.y, [...(porLinha.get(t.y) ?? []), t.x]);
  const horizontal = new Set<string>();
  for (const [y, xs] of porLinha) {
    for (const seq of sequencias(xs)) {
      if (seq.length < 2) continue;
      trechos.push({ a: X(seq[0]) - 0.5 - folga, b: X(seq[seq.length - 1]) + 0.5 + folga, linha: Z(y), eixo: 'x' });
      for (const x of seq) horizontal.add(`${x},${y}`);
    }
  }
  const porColuna = new Map<number, number[]>();
  for (const t of tiles) if (!horizontal.has(`${t.x},${t.y}`)) porColuna.set(t.x, [...(porColuna.get(t.x) ?? []), t.y]);
  for (const [x, ys] of porColuna) {
    for (const seq of sequencias(ys)) trechos.push({ a: Z(seq[0]) - 0.5 - folga, b: Z(seq[seq.length - 1]) + 0.5 + folga, linha: X(x), eixo: 'z' });
  }
  return trechos;
}
