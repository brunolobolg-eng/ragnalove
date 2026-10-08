/**
 * Bancada de desempenho (só desenvolvimento): http://localhost:5173/perfbench.html?n=120&shadows=1
 * Coloca N unidades 3D (mistura de monstros do jogo + heróis) numa cena com sombra e mede o custo
 * por quadro: tempo de CPU da atualização das unidades, tempo de desenho e chamadas/triângulos.
 * As chamadas e triângulos não dependem da placa de vídeo, então servem para comparar antes/depois.
 */
import * as THREE from 'three';
import { loadMonsterModels } from '../render/units/model/glbMonsters';
import { ModelUnitView } from '../render/units/model/ModelUnitView';

const q = new URLSearchParams(location.search);
const N = Number(q.get('n') ?? 120);
const SHADOWS = q.get('shadows') !== '0';
const FRAMES = Number(q.get('frames') ?? 60);
const KINDS = (q.get('kinds') ?? 'rat,ratRunner,goblin,goblinRunner,zombie,zombieRunner,zombieBrute,zombieNecro,orcWarrior,goblinBrute').split(',');
const HEROES = ['warrior', 'mage', 'archer', 'assassin'];
const HERO_N = Number(q.get('heroes') ?? 4);
const CAM = Number(q.get('cam') ?? 22);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(960, 540);
renderer.shadowMap.enabled = SHADOWS;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202840);
scene.add(new THREE.HemisphereLight(0xfff4e0, 0x404860, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(6, 12, 8);
sun.castShadow = SHADOWS;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -14;
sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14;
sun.shadow.camera.bottom = -14;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a5a46 }));
ground.receiveShadow = true;
scene.add(ground);
const camera = new THREE.PerspectiveCamera(40, 960 / 540, 0.1, 200);
camera.position.set(0, CAM, CAM * 0.82);
camera.lookAt(0, 0, 0);

const views: ModelUnitView[] = [];
const out = document.getElementById('bench')!;

async function main(): Promise<void> {
  await loadMonsterModels();
  const cols = Math.ceil(Math.sqrt(N * 1.6));
  for (let i = 0; i < N; i++) {
    const hero = i < HERO_N;
    const kind = hero ? HEROES[i % HEROES.length] : KINDS[i % KINDS.length];
    const v = new ModelUnitView(kind, hero ? 'party' : 'enemy');
    const cx = (i % cols) - cols / 2;
    const cz = Math.floor(i / cols) - cols / 2;
    v.root.position.set(cx * 0.9, 0, cz * 0.9);
    v.setFacing(Math.sin(i), Math.cos(i), true);
    scene.add(v.root);
    views.push(v);
  }
  const qCam = camera.quaternion;
  let cpuUpdate = 0;
  let cpuRender = 0;
  let last = performance.now();
  const samples: number[] = [];
  for (let f = 0; f < FRAMES; f++) {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000 || 1 / 60);
    last = now;
    const t0 = performance.now();
    for (const v of views) {
      v.root.position.x += Math.sin(f * 0.05 + v.root.position.z) * 0.0015;
      v.update(dt, (f % 40) / 40, 1, qCam);
    }
    const t1 = performance.now();
    renderer.render(scene, camera);
    const t2 = performance.now();
    if (f >= 30) {
      cpuUpdate += t1 - t0;
      cpuRender += t2 - t1;
      samples.push(t2 - t0);
    }
  }
  const n = Math.max(1, samples.length);
  const info = renderer.info;
  const avg = (x: number) => x.toFixed(2);
  (window as unknown as Record<string, unknown>).__bench = {
    units: views.length,
    shadows: SHADOWS,
    updateMs: cpuUpdate / n,
    renderMs: cpuRender / n,
    calls: info.render.calls,
    triangles: info.render.triangles,
    programs: info.programs?.length,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
  };
  out.textContent =
    `unidades ${views.length} · sombra ${SHADOWS ? 'sim' : 'não'}\n` +
    `update CPU  ${avg(cpuUpdate / n)} ms/quadro\n` +
    `render CPU  ${avg(cpuRender / n)} ms/quadro (inclui envio de chamadas)\n` +
    `chamadas de desenho ${info.render.calls} · triângulos ${info.render.triangles}\n` +
    `geometrias ${info.memory.geometries} · texturas ${info.memory.textures} · programas ${info.programs?.length}`;
  console.log('BENCH', JSON.stringify((window as unknown as Record<string, unknown>).__bench));
}
void main();
