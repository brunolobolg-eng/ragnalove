import * as THREE from 'three';
import { bannerTexture, shardGeometry, stoneTexture } from './fx/kit/procedural';

/**
 * Bloco da Muralha do Guerreiro: pedra com friso dourado, pilares com pontas e bandeira azul. Tudo é geometria e
 * textura gerada por código. Quebrado, o bloco vira um monte de pedras (o ObjectView troca os dois grupos).
 */
export function buildWallBlock(parent: THREE.Group): { intact: THREE.Group; rubble: THREE.Group } {
  const stone = new THREE.MeshLambertMaterial({ map: stoneTexture(), color: 0xe0d8cc, flatShading: true });
  const darkStone = new THREE.MeshLambertMaterial({ color: 0x7a736a, flatShading: true });
  const gold = new THREE.MeshLambertMaterial({ color: 0xe0b44e, emissive: 0x4a3008, flatShading: true });
  const banner = new THREE.MeshLambertMaterial({ map: bannerTexture(), side: THREE.DoubleSide });

  const intact = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): void => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    intact.add(m);
  };
  add(new THREE.BoxGeometry(0.92, 0.9, 0.46), stone, 0, 0.45, 0); // corpo
  add(new THREE.BoxGeometry(0.98, 0.1, 0.52), darkStone, 0, 0.95, 0); // coroamento
  add(new THREE.BoxGeometry(0.94, 0.05, 0.48), gold, 0, 0.55, 0); // friso dourado no meio
  add(new THREE.BoxGeometry(0.94, 0.04, 0.48), gold, 0, 0.1, 0); // friso na base
  for (const x of [-0.42, 0.42]) {
    add(new THREE.BoxGeometry(0.16, 1.15, 0.5), darkStone, x, 0.575, 0); // pilar
    add(new THREE.ConeGeometry(0.1, 0.24, 5), gold, x, 1.27, 0); // ponta dourada
  }
  add(new THREE.BoxGeometry(0.34, 0.04, 0.05), gold, 0, 0.86, 0.26); // barra da bandeira
  add(new THREE.PlaneGeometry(0.3, 0.6), banner, 0, 0.54, 0.25); // bandeira azul
  parent.add(intact);

  const rubble = new THREE.Group();
  [41, 42, 43, 44, 45].forEach((seed, i) => {
    const m = new THREE.Mesh(shardGeometry(seed, 0.6), i % 2 ? darkStone : stone);
    const a = i * 1.3;
    m.position.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.2);
    m.rotation.set(0.2, a, 0.1 * i);
    m.scale.setScalar(0.45 + (i % 3) * 0.1);
    rubble.add(m);
  });
  rubble.visible = false;
  parent.add(rubble);
  return { intact, rubble };
}
