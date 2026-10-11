/**
 * Galeria dos efeitos do pacote de VFX (dev, fora do build): um círculo mágico e um golpe de cada elemento,
 * com o mesmo `PackFx` que o jogo usa. O tempo avança passo a passo, então os quadros são determinísticos.
 * Uso no Playwright: __efeitos.spawnAll(), __efeitos.advance(segundos).
 */
import * as THREE from 'three';
import { PACK_ELEMENTS, type PackElement } from '../config/fx/efeitosPack';
import { PackFx } from '../render/fx/pack/PackFx';
import type { PackEffect } from '../render/fx/pack/packTypes';

const DT = 1 / 60;
const ELEMENTOS = Object.keys(PACK_ELEMENTS) as PackElement[];

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('stage')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0b14);
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 12, 11);
camera.lookAt(0, 0, 0);

// chão escuro de referência (o jogo usa o chão do mapa; aqui só para ver o círculo sobre ele)
const chao = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1a1626 }));
scene.add(chao);

const pack = new PackFx(scene);
const mundo = new THREE.Group();
scene.add(mundo);
const escala = () => (window.innerHeight * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
pack.setScale(escala());

const vivos: PackEffect[] = [];
const espacamento = 2.4;
const x0 = -((ELEMENTOS.length - 1) * espacamento) / 2;

function spawnAll(): void {
  ELEMENTOS.forEach((el, i) => {
    const x = x0 + i * espacamento;
    const circulo = pack.circle(mundo, new THREE.Vector3(x, 0, -2.6), el, 1.0);
    if (circulo) vivos.push(circulo);
    // fileira do meio: uma aura por elemento; cura (cruzes) e gelo (cristais) como emissores
    const alvo = new THREE.Object3D();
    alvo.position.set(x, 0, 0);
    const aura = pack.aura(mundo, alvo, el, 2.5);
    if (aura) vivos.push(aura);
    if (el === 'holy' || el === 'nature') vivos.push(pack.stream(alvo, el, 2.5, 'cross'));
    if (el === 'frost') vivos.push(pack.stream(alvo, el, 2.5, 'crystal'));
    const golpe = pack.slash(mundo, new THREE.Vector3(x, 1.1, 2.6), el, 1.4);
    if (golpe) vivos.push(golpe);
  });
}

function advance(segundos: number): void {
  for (let t = 0; t < segundos - 1e-9; t += DT) {
    pack.update(DT);
    for (const e of vivos) e.update(DT);
    for (let i = vivos.length - 1; i >= 0; i--) if (vivos[i].done) vivos.splice(i, 1);
  }
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  pack.setScale(escala());
});

renderer.render(scene, camera);
(window as unknown as { __efeitos: unknown }).__efeitos = {
  spawnAll,
  advance,
  vivos: () => vivos.length,
  elementos: ELEMENTOS,
  limpar: () => {
    pack.reset();
    vivos.length = 0;
  },
};
