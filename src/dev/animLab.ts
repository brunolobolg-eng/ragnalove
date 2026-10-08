/**
 * Laboratório de animações (só desenvolvimento): http://localhost:5173/animlab.html
 * Mostra os personagens 3D com o controlador de animação real (ModelUnitView) e permite testar
 * locomoção, golpes/combos, magia, dano por direção, knockback e morte. Também expõe uma API
 * (window.__lab) para testes automáticos com o Playwright (tempo avançado quadro a quadro).
 */
import * as THREE from 'three';
import { loadMonsterModels } from '../render/units/model/glbMonsters';
import { ModelUnitView } from '../render/units/model/ModelUnitView';
import type { AnimEvent, HitSeverity } from '../render/units/model/anim/AnimController';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3350);
scene.add(new THREE.HemisphereLight(0xfff4e0, 0x404860, 1.8));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(3, 6, 5);
scene.add(sun);
scene.add(new THREE.GridHelper(20, 20, 0x8890a8, 0x4a5270));
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 7.5, 9.5);
camera.lookAt(0, 0.8, 0);

const KINDS = ['warrior', 'mage', 'archer', 'assassin', 'zombie', 'orcWarrior'];
interface Actor {
  kind: string;
  v: ModelUnitView;
  home: THREE.Vector3;
  /** caminho: posição em função do tempo (ou undefined = parado) */
  path?: (t: number) => THREE.Vector3;
  pathT: number;
}
const actors: Actor[] = [];
const log: string[] = [];
const logEl = document.getElementById('lab-log')!;
function note(s: string): void {
  log.push(s);
  if (log.length > 14) log.shift();
  logEl.textContent = log.join('\n');
}

function place(): void {
  actors.forEach((a, i) => {
    a.home.set((i - (actors.length - 1) / 2) * 1.6, 0, 0);
    a.v.root.position.copy(a.home);
  });
}

let auto = true;
let last = performance.now();
function step(dt: number): void {
  for (const a of actors) {
    if (a.path) {
      a.pathT += dt;
      const p = a.path(a.pathT);
      const d = p.clone().sub(a.v.root.position);
      if (d.lengthSq() > 1e-6) a.v.setFacing(d.x, d.z);
      a.v.root.position.copy(p);
    }
    a.v.update(dt, 1, 1, camera.quaternion);
  }
}
function render(): void {
  renderer.render(scene, camera);
}
function loop(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (auto) {
    step(dt);
    render();
  }
  requestAnimationFrame(loop);
}

/** Atacante imaginário: posição de onde vem o golpe (ângulo em graus em volta do alvo; 0 = de frente). */
function from(a: Actor, deg: number): THREE.Vector3 {
  const r = (deg * Math.PI) / 180; // atores olham para +Z (câmera)
  return a.v.root.position.clone().add(new THREE.Vector3(Math.sin(r), 0, Math.cos(r)).multiplyScalar(1.2));
}

const api = {
  ready: false,
  kinds: KINDS,
  auto(on: boolean) {
    auto = on;
  },
  step(seconds: number, fps = 60) {
    const n = Math.max(1, Math.round(seconds * fps));
    for (let i = 0; i < n; i++) step(seconds / n);
    render();
  },
  reset() {
    for (const a of actors) {
      scene.remove(a.v.root);
      a.v.dispose();
    }
    actors.length = 0;
    for (const k of KINDS) {
      const v = new ModelUnitView(k, k === 'zombie' || k === 'orcWarrior' ? 'enemy' : 'party');
      v.setFacing(0, 1, true);
      v.onAnimEvent = (e: AnimEvent) => note(`${k}: ${e.type}${e.interrupted ? ' (interrompido)' : ''}`);
      scene.add(v.root);
      actors.push({ kind: k, v, home: new THREE.Vector3(), pathT: 0 });
    }
    place();
    this.step(0.6);
  },
  /** Anda em linha reta (velocidade em tiles/s), indo e voltando; 0 = para. */
  walk(speed: number, dir: [number, number] = [0, 1]) {
    for (const a of actors) {
      if (speed <= 0) {
        a.path = undefined;
        continue;
      }
      const start = a.v.root.position.clone();
      const d = new THREE.Vector3(dir[0], 0, dir[1]).normalize();
      a.pathT = 0;
      a.path = (t) => start.clone().addScaledVector(d, Math.sin((t * speed) / 2) * 2);
    }
  },
  /** Anda em círculo (8 direções aparecem ao longo da volta). */
  circle(speed: number) {
    for (const a of actors) {
      const c = a.home.clone().add(new THREE.Vector3(0, 0, 0.0));
      const r = 0.7;
      a.pathT = 0;
      a.path = (t) => c.clone().add(new THREE.Vector3(Math.sin((t * speed) / r) * r, 0, Math.cos((t * speed) / r) * r - r));
    }
  },
  attack(style: 'swing' | 'heavy' = 'swing') {
    return actors.map((a) => a.v.attack(style));
  },
  cast() {
    return actors.map((a) => a.v.cast());
  },
  hit(severity: HitSeverity, deg = 0) {
    for (const a of actors) a.v.hit({ from: from(a, deg), severity });
  },
  knockback(deg = 0) {
    for (const a of actors) {
      const f = from(a, deg);
      a.v.knockback(a.v.root.position.clone().sub(f).setY(0).normalize());
    }
  },
  die(deg = 0) {
    for (const a of actors) a.v.die(from(a, deg));
  },
  render,
  _actors: () => actors,
  _step: (dt: number) => step(dt),
  debug() {
    return actors.map((a) => `${a.kind} ${JSON.stringify(a.v.anim.debugInfo())}`).join('\n');
  },
  /** Câmera perto de um personagem (índice em KINDS); lado = vista lateral (marcha). */
  view(i: number, side = false, dist = 3.2) {
    const a = actors[i];
    const p = a.v.root.position;
    if (side) camera.position.set(p.x + dist, 1.3, p.z + 0.4);
    else camera.position.set(p.x + 0.4, 1.9, p.z + dist);
    camera.lookAt(p.x, 0.8, p.z);
    for (const o of actors) o.v.root.visible = o === a;
    render();
  },
  viewAll() {
    camera.position.set(0, 7.5, 9.5);
    camera.lookAt(0, 0.8, 0);
    for (const o of actors) o.v.root.visible = true;
    render();
  },
  /**
   * Deslizamento dos pés: anda em linha reta a `speed` tiles/s por `seconds` e mede a velocidade
   * horizontal do pé quando ele está apoiado (mais baixo). Devolve a razão pé/corpo (0 = pé plantado).
   */
  footSlide(speed: number, seconds = 3) {
    const res: Record<string, number> = {};
    for (const a of actors) {
      a.v.root.position.copy(a.home);
      a.path = undefined;
    }
    for (let k = 0; k < 30; k++) step(1 / 60);
    const feet = actors.map((a) => ['foot.L', 'foot.R', 'Foot_L', 'Foot_R'].map((n) => a.v.root.getObjectByName(n)).filter(Boolean) as THREE.Object3D[]);
    // apoio detectado na altura do pé NO MODELO (o boneco é inclinado para a câmera: a altura no mundo engana)
    const meshOf = (o: THREE.Object3D) => {
      let m: THREE.Object3D | null = o;
      while (m && !(m as THREE.SkinnedMesh).isSkinnedMesh) m = m.parent;
      return m ?? o;
    };
    const samples = actors.map(() => [] as { y: number; v: number }[]);
    const prev = feet.map((fs) => fs.map((f) => f.getWorldPosition(new THREE.Vector3())));
    const dt = 1 / 60;
    for (let n = 0; n < seconds * 60; n++) {
      for (const a of actors) {
        a.v.root.position.z += speed * dt;
        a.v.setFacing(0, 1);
      }
      step(dt);
      actors.forEach((_, i) =>
        feet[i].forEach((f, j) => {
          const w = f.getWorldPosition(new THREE.Vector3());
          const ly = meshOf(f).worldToLocal(w.clone()).y;
          if (n > 30) samples[i].push({ y: ly + j * 1000, v: Math.hypot(w.x - prev[i][j].x, w.z - prev[i][j].z) / dt });
          prev[i][j] = w;
        }),
      );
    }
    actors.forEach((a, i) => {
      // cada pé separado (j * 1000 acima só separa os dois na mesma lista)
      let tot = 0;
      let cnt = 0;
      for (const j of [0, 1]) {
        const mine = samples[i].filter((s) => Math.floor(s.y / 500) === j * 2);
        const ys = mine.map((s) => s.y);
        const lo = Math.min(...ys);
        const range = Math.max(...ys) - lo;
        for (const s of mine)
          if (s.y < lo + range * 0.12) {
            tot += s.v;
            cnt++;
          }
      }
      res[a.kind] = Math.round((tot / Math.max(1, cnt) / speed) * 100) / 100;
    });
    for (const a of actors) a.v.root.position.copy(a.home);
    return res;
  },
};
(window as unknown as { __lab: typeof api }).__lab = api;

function ui(): void {
  const el = document.getElementById('lab-ui')!;
  const b = (label: string, fn: () => void) => {
    const x = document.createElement('button');
    x.textContent = label;
    x.onclick = fn;
    el.appendChild(x);
  };
  b('Reiniciar', () => api.reset());
  b('Parado', () => api.walk(0));
  b('Andar (1 t/s)', () => api.walk(1));
  b('Normal (2 t/s)', () => api.walk(2));
  b('Correr (3,3 t/s)', () => api.walk(3.3));
  b('Círculo', () => api.circle(2));
  b('Ataque/combo', () => api.attack());
  b('Golpe pesado', () => api.attack('heavy'));
  b('Magia', () => api.cast());
  b('Dano leve (frente)', () => api.hit('light', 0));
  b('Dano médio (lado)', () => api.hit('medium', 90));
  b('Dano forte (costas)', () => api.hit('heavy', 180));
  b('Knockback', () => api.knockback(0));
  b('Morte', () => api.die(0));
}

async function main(): Promise<void> {
  await loadMonsterModels();
  ui();
  api.reset();
  api.ready = true;
  requestAnimationFrame(loop);
}
void main();
