/**
 * Bancada de desempenho (só desenvolvimento): http://localhost:5173/perfbench.html?n=120&shadows=1
 * Coloca N unidades 3D (mistura de monstros do jogo + heróis) numa cena com sombra e mede o custo
 * por quadro: tempo de CPU da atualização das unidades, tempo de desenho e chamadas/triângulos.
 * As chamadas e triângulos não dependem da placa de vídeo, então servem para comparar antes/depois.
 */
import * as THREE from 'three';
import { loadMonsterModels } from '../render/units/model/glbMonsters';
import { ModelUnitView, MODELS } from '../render/units/model/ModelUnitView';
import type { WeaponAttach } from '../render/units/model/weapons';

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
camera.lookAt(0, Number(q.get('look') ?? 0), 0);

const views: ModelUnitView[] = [];
const out = document.getElementById('bench')!;

async function main(): Promise<void> {
  await loadMonsterModels();
  // armas de teste no guerreiro: ?weapons=sword:hand.R,shield:hand.L (só para conferir o visual)
  const wq = q.get('weapons');
  if (wq) MODELS.warrior.weapons = wq.split(',').map((x) => { const [type, bone, tilt] = x.split(':'); return { type: type as WeaponAttach['type'], bone, accent: 0xffd67a, tilt: tilt ? Number(tilt) : undefined }; });
  const cols = Math.ceil(Math.sqrt(N * 1.6));
  for (let i = 0; i < N; i++) {
    const hero = i < HERO_N;
    const kind = hero ? HEROES[i % HEROES.length] : KINDS[i % KINDS.length];
    const v = new ModelUnitView(kind, hero ? 'party' : 'enemy');
    const cx = (i % cols) - cols / 2;
    const cz = Math.floor(i / cols) - cols / 2;
    v.root.position.set(cx * 0.9, 0, cz * 0.9);
    v.setFacing(q.get('fx') !== null ? Number(q.get('fx')) : Math.sin(i), q.get('fz') !== null ? Number(q.get('fz')) : Math.cos(i), true);
    scene.add(v.root);
    views.push(v);
  }
  // pose de bind sem animação (diagnóstico): para o misturador e volta os ossos ao descanso
  if (q.get('bindtest')) for (const v of views as unknown as { mixer: THREE.AnimationMixer; mesh: THREE.SkinnedMesh }[]) { v.mixer.stopAllAction(); v.mesh.skeleton.pose(); }
  if (q.get('act') === 'attack') for (const v of views) v.attack('swing');
  if (q.get('act') === 'death') for (const v of views) v.die();
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
      if (!q.get('bindtest')) v.update(dt, (f % 40) / 40, 1, qCam);
    }
    if (q.get('trace') && views.length === 1) {
      // rastro por quadro: altura do pé esquerdo e do quadril (depuração de animação)
      const m = (views[0] as unknown as { mesh: THREE.SkinnedMesh }).mesh;
      m.updateMatrixWorld(true);
      const bn = (n: string) => m.skeleton.bones.find((b) => b.name === n);
      const y = (n: string) => {
        const b = bn(n);
        if (!b) return null;
        const p = new THREE.Vector3();
        b.getWorldPosition(p);
        return Math.round(p.y * 100) / 100;
      };
      console.log(`TRACE f${f} dt=${dt.toFixed(3)} pe=${y('LeftFoot')} perna=${y('LeftLeg')} coxa=${y('LeftUpLeg')} quadril=${y('Hips')}`);
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
  // medida da altura do primeiro monstro (só com 1 unidade): menor e maior ponto do corpo, em unidades do mundo
  if (views.length === 1) {
    // ossos dos pés e do quadril (pose real do esqueleto, no último quadro, que está em movimento)
    const v0 = views[0] as unknown as { mesh: THREE.SkinnedMesh };
    v0.mesh.updateMatrixWorld(true);
    const bone = (n: string) => v0.mesh.skeleton.bones.find((b) => b.name === n);
    const wy = (n: string) => {
      const b = bone(n);
      if (!b) return null;
      const p = new THREE.Vector3();
      b.getWorldPosition(p);
      return Math.round(p.y * 1000) / 1000;
    };
    const pick = (...n: string[]) => n.map((x) => wy(x)).find((y) => y !== null) ?? null;
    (window as unknown as Record<string, unknown>).__box = { leftFootY: pick('LeftFoot', 'foot.L', 'Foot_L'), rightFootY: pick('RightFoot', 'foot.R', 'Foot_R'), hipsY: pick('Hips', 'hips', 'Hips_'), headY: pick('Head'), spineY: pick('Spine1'), leftKneeY: pick('LeftLeg'), leftThighY: pick('LeftUpLeg') };
    const geo = v0.mesh.geometry;
    const mat = v0.mesh.material as THREE.MeshToonMaterial;
    // diagnóstico do bind: pose de descanso × inversa do bind (identidade = malha no lugar certo)
    {
      const sk = v0.mesh.skeleton;
      const bi = sk.bones.findIndex((b) => b.name === 'Hips');
      if (bi >= 0) {
        sk.bones[bi].updateMatrixWorld(true);
        const prod = new THREE.Matrix4().multiplyMatrices(sk.bones[bi].matrixWorld, sk.boneInverses[bi]);
        (window as unknown as Record<string, unknown>).__bind = { hipsProd: Array.from(prod.elements).map((x) => +x.toFixed(2)), hipsWorldPos: sk.bones[bi].getWorldPosition(new THREE.Vector3()).toArray().map((x) => +x.toFixed(2)), inverseHipsPos: new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[bi].clone().invert()).toArray().map((x) => +x.toFixed(2)) };
      }
    }
    (window as unknown as Record<string, unknown>).__mat = { attrs: Object.keys(geo.attributes), vertexColors: mat.vertexColors, hasMap: !!mat.map };
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
  console.log('BENCH', JSON.stringify((window as unknown as Record<string, unknown>).__bench), JSON.stringify((window as unknown as Record<string, unknown>).__box ?? null), JSON.stringify((window as unknown as Record<string, unknown>).__mat ?? null));
}
void main();
