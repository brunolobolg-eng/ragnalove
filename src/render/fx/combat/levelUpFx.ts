import * as THREE from 'three';
import { LEVELUP_FX as K } from '../../../config/fx/levelup';
import { HERO_INFO, isHeroKind } from '../../../config/heroes';
import { Flash, type FxKit, type OneShotFx } from '../kit/FxKit';
import { disposeFxGroup, fxSprite, groundCircle, screenAngle } from '../kit/Shapes';
import { fxTexture, type FxTextureName } from '../kit/vfxTextures';

/** Cores de uma classe: `main` é o brilho, `hot` o miolo quase branco e `text` a cor do número do nível. */
export interface LevelUpPalette {
  main: THREE.Color;
  hot: THREE.Color;
  text: string;
}

const WHITE = new THREE.Color(1, 1, 1);
const palettes = new Map<number, LevelUpPalette>();

/** Cor da subida de nível: a cor de destaque da classe (a mesma da UI), com um miolo mais claro. */
export function levelUpPalette(kind: string | undefined): LevelUpPalette {
  const hex = kind !== undefined && isHeroKind(kind) ? HERO_INFO[kind].color : K.defaultColor;
  let p = palettes.get(hex);
  if (!p) {
    const main = new THREE.Color(((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255);
    p = { main, hot: main.clone().lerp(WHITE, K.hotMix), text: `#${hex.toString(16).padStart(6, '0')}` };
    palettes.set(hex, p);
  }
  return p;
}

/** Plano 1 × 1 dos discos de chão (escalado por efeito). A geometria é compartilhada: nunca é descartada. */
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

/** Sequência pseudoaleatória fixa (mulberry32): a subida sai igual em toda execução, a vitrine fica reproduzível. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const easeOut = (x: number): number => 1 - (1 - clamp01(x)) ** 3;

/** Camada de um efeito: sprite ou disco, com a opacidade máxima dela (a camada de miolo é mais fraca). */
interface Layer {
  o: THREE.Sprite | THREE.Mesh;
  base: number;
}

/** Opacidade da camada = base × fração de visibilidade (0 a 1) do instante. */
function setAlpha(l: Layer, k: number): void {
  (l.o.material as THREE.Material).opacity = clamp01(l.base * k);
}

/** Sprite aditivo que encara a câmera. Com `depth`, o herói tapa o sprite (asas ficam atrás dele). */
function sprite(parent: THREE.Object3D, tex: FxTextureName, color: THREE.Color, depth: boolean, order: number): THREE.Sprite {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: fxTexture(tex),
      color: color.clone(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: depth,
      opacity: 0,
    }),
  );
  s.renderOrder = order;
  parent.add(s);
  return s;
}

/** Disco deitado no chão (círculo de runas): o alfa vem da textura, a cor vem do material. */
function disc(parent: THREE.Object3D, tex: FxTextureName, color: THREE.Color): THREE.Mesh {
  const m = new THREE.Mesh(
    UNIT_PLANE,
    new THREE.MeshBasicMaterial({
      map: fxTexture(tex),
      color: color.clone(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      opacity: 0,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 4;
  parent.add(m);
  return m;
}

/** Pena do pool: vive `life` segundos, cai balançando e gira. */
interface Feather {
  s: THREE.Sprite;
  live: boolean;
  age: number;
  x: number;
  y: number;
  z: number;
  phase: number;
}

/**
 * Subida de nível, no estilo da arte de referência: o feixe de luz sobe do chão, as asas se abrem atrás do herói,
 * o círculo de runas gira no chão e a auréola aparece sobre a cabeça. Na explosão há clarão, raios, faíscas e
 * tremor; depois caem penas e brilhos. Tudo na cor da classe, com os recortes de `public/fx/levelup/`.
 */
export class DivineRiseFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private burst = false;
  private burstAt = 0;
  private acc = 0;
  private readonly rng = seeded(7);
  private readonly kit: FxKit;
  private readonly feet: THREE.Vector3;
  private readonly center: THREE.Vector3;
  private readonly pal: LevelUpPalette;
  /** direção horizontal da tela: as asas se abrem para os dois lados, qualquer que seja o ângulo da câmera */
  private readonly right = new THREE.Vector3();
  private readonly ground: Layer[] = [];
  private readonly beam: Layer[] = [];
  private readonly wings: { l: Layer; side: number }[] = [];
  private readonly halo: Layer;
  private readonly flare: Layer;
  private readonly streak: Layer;
  private readonly rays: { s: THREE.Sprite; dir: THREE.Vector3 }[] = [];
  private readonly feathers: Feather[] = [];
  private readonly glints: { l: Layer; at: number; pos: THREE.Vector3 }[] = [];
  private readonly flashes: Flash[] = [];
  private readonly p0 = new THREE.Vector3();
  private readonly p1 = new THREE.Vector3();

  constructor(kit: FxKit, feet: THREE.Vector3, pal: LevelUpPalette) {
    this.kit = kit;
    this.pal = pal;
    this.feet = feet.clone().setY(0);
    this.center = new THREE.Vector3(this.feet.x, K.burst.flare.y, this.feet.z);
    this.right.setFromMatrixColumn(kit.stage.camera.matrixWorld, 0).setY(0).normalize();

    // círculo de runas no chão: uma camada da cor e um miolo mais claro por cima
    for (const [color, base] of [
      [pal.main, 0.6],
      [pal.hot, 0.3],
    ] as const) {
      const m = disc(this.group, 'lu_ring', color);
      m.position.set(this.feet.x, 0.03, this.feet.z);
      this.ground.push({ o: m, base });
    }

    // feixe atrás do herói (teste de profundidade, como as asas): a camada larga da cor e o miolo estreito
    this.beam.push({ o: sprite(this.group, 'lu_beam', pal.main, true, 8), base: 0.4 });
    this.beam.push({ o: sprite(this.group, 'lu_beam', pal.hot, true, 8), base: 0.25 });

    // asas: a esquerda é o recorte, a direita o espelho; cada uma com uma camada de miolo
    for (const side of [-1, 1]) {
      const tex: FxTextureName = side < 0 ? 'lu_wing' : 'lu_wing_r';
      this.wings.push({ l: { o: sprite(this.group, tex, pal.main, true, 7), base: 0.6 }, side });
      this.wings.push({ l: { o: sprite(this.group, tex, pal.hot, true, 7), base: 0.3 }, side });
    }

    this.halo = { o: sprite(this.group, 'lu_halo', pal.main, false, 9), base: 0.8 };
    this.flare = { o: sprite(this.group, 'lu_flare', pal.hot, false, 11), base: 0.8 };
    this.streak = { o: sprite(this.group, 'lu_streak', pal.main, false, 11), base: 0.6 };

    for (let i = 0; i < K.burst.rays.count; i++) {
      const a = (i / K.burst.rays.count) * Math.PI * 2;
      const s = fxSprite(this.group, 'trace', pal.hot, 1, { opacity: 0 });
      this.rays.push({ s, dir: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)) });
    }

    // penas: um pool pequeno, usado de novo enquanto caem (quatro desenhos do recorte, em rodízio)
    const featherTex: FxTextureName[] = ['lu_feather_a', 'lu_feather_b', 'lu_feather_c', 'lu_feather_d'];
    for (let i = 0; i < K.feathers.pool; i++) {
      const s = sprite(this.group, featherTex[i % featherTex.length], pal.hot, false, 10);
      this.feathers.push({ s, live: false, age: 0, x: 0, y: 0, z: 0, phase: 0 });
    }

    K.glints.times.forEach((at, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const pos = new THREE.Vector3(this.feet.x + side * K.glints.offsetX, K.glints.height[i], this.feet.z);
      this.glints.push({ l: { o: sprite(this.group, 'lu_star', pal.hot, false, 10), base: 1 }, at, pos });
    });
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    this.updateGround(t);
    this.updateBeam(t);
    this.updateWings(t);
    this.updateHalo(t);
    this.updateGlints(t);
    if (!this.burst && t >= K.burst.at) this.doBurst(t);
    this.updateBurst(t);
    this.updateFeathers(dt, t);
    for (const f of this.flashes) f.update(dt);
    if (t >= K.life && this.flashes.every((f) => f.done)) this.dispose();
  }

  /** Círculo de runas: cresce no começo, gira devagar e some. */
  private updateGround(t: number): void {
    const G = K.ground;
    const grow = G.start + (1 - G.start) * easeOut(t / G.inTime);
    const fade = clamp01(t / G.inTime) * (1 - clamp01((t - G.holdUntil) / G.fadeTime));
    for (const l of this.ground) {
      l.o.scale.setScalar(G.size * grow);
      l.o.rotation.z = t * G.spin;
      setAlpha(l, fade);
    }
  }

  /** Feixe: sobe do chão até a altura cheia, fica e some. A base fica no chão. */
  private updateBeam(t: number): void {
    const B = K.beam;
    const h = Math.max(0.001, B.height * easeOut(t / B.inTime));
    const fade = 1 - clamp01((t - B.holdUntil) / B.fadeTime);
    this.beam.forEach((l, i) => {
      l.o.position.set(this.feet.x, h / 2, this.feet.z);
      l.o.scale.set(i === 0 ? B.width : B.width * 0.4, h, 1);
      setAlpha(l, fade);
    });
  }

  /** Asas: abrem a partir do centro do herói, batem devagar e somem. */
  private updateWings(t: number): void {
    const W = K.wings;
    const open = easeOut((t - W.openAt) / W.openTime);
    const fade = clamp01((t - W.openAt) / 0.25) * (1 - clamp01((t - W.holdUntil) / W.fadeTime));
    const flap = 1 + W.flapAmp * Math.sin(t * W.flapRate * Math.PI * 2);
    for (const w of this.wings) {
      const off = W.offset * (0.3 + 0.7 * open) * w.side;
      w.l.o.position.set(this.feet.x + this.right.x * off, W.y, this.feet.z + this.right.z * off);
      w.l.o.scale.set(W.width * (0.25 + 0.75 * open) * flap, W.height * flap, 1);
      setAlpha(w.l, fade);
    }
  }

  /** Auréola: aparece sobre a cabeça, sobe um pouco e some. */
  private updateHalo(t: number): void {
    const H = K.halo;
    const inK = clamp01((t - H.inAt) / H.inTime);
    this.halo.o.position.set(this.feet.x, H.y + H.rise * inK, this.feet.z);
    this.halo.o.scale.set(H.width, H.width * 0.63, 1);
    setAlpha(this.halo, inK * (1 - clamp01((t - H.holdUntil) / H.fadeTime)));
  }

  /** Brilhos de estrela: pulsam uma vez em instantes fixos ao redor do feixe. */
  private updateGlints(t: number): void {
    const G = K.glints;
    for (const g of this.glints) {
      const k = (t - g.at) / G.life;
      const pulse = k > 0 && k < 1 ? Math.sin(Math.PI * k) : 0;
      g.l.o.position.copy(g.pos);
      g.l.o.scale.setScalar(G.size * (0.3 + 0.7 * pulse));
      setAlpha(g.l, pulse);
    }
  }

  /** Explosão divina: anel de choque no chão, clarão, faíscas radiais e tremor. */
  private doBurst(t: number): void {
    this.burst = true;
    this.burstAt = t;
    const B = K.burst;
    groundCircle(this.kit, this.feet, { radius: B.ring.radius, color: this.pal.main, life: B.ring.life, kind: 'ring', grow: 0.3, spin: 0 });
    this.flashes.push(new Flash(this.group, new THREE.Vector3(this.feet.x, B.flash.y, this.feet.z), this.pal.main.clone().multiplyScalar(0.3), B.flash.size, B.flash.life));
    this.kit.particles.spark.emit({
      pos: this.center.clone(),
      posJitter: 0.2,
      vel: new THREE.Vector3(),
      velJitter: B.sparks.speed,
      life: 0.5,
      size: 0.14,
      sizeEnd: 0.02,
      color: this.pal.hot.clone(),
      colorEnd: this.pal.main.clone(),
      drag: 2.5,
      count: B.sparks.count,
    });
    this.kit.stage.addShake(B.shake);
    this.kit.stage.kick(B.kick);
  }

  /** Depois da explosão: o clarão incha e some, o risco de lente abre e os raios saem do centro e somem. */
  private updateBurst(t: number): void {
    if (!this.burst) return;
    const B = K.burst;
    const bt = t - this.burstAt;
    const fk = clamp01(bt / B.flare.life);
    this.flare.o.position.copy(this.center);
    this.flare.o.scale.setScalar(B.flare.size0 + (B.flare.size1 - B.flare.size0) * easeOut(fk));
    setAlpha(this.flare, 1 - fk);
    const sk = clamp01(bt / B.streak.life);
    this.streak.o.position.copy(this.center);
    this.streak.o.scale.set(B.streak.width * (0.3 + 0.7 * easeOut(sk)), B.streak.height, 1);
    setAlpha(this.streak, 1 - sk);
    const rk = clamp01(bt / B.rays.life);
    const reach = B.rays.reach * easeOut(rk);
    const cam = this.kit.stage.camera;
    for (const r of this.rays) {
      this.p0.copy(this.center).addScaledVector(r.dir, reach * 0.85);
      this.p1.copy(this.center).addScaledVector(r.dir, reach);
      r.s.position.copy(this.p1);
      r.s.material.rotation = screenAngle(cam, this.p0, this.p1) + Math.PI / 2;
      r.s.scale.set(B.rays.width, B.rays.length * (1 - rk * 0.5), 1);
      r.s.material.opacity = 1 - rk;
    }
  }

  /** Penas: nascem em volta do alto do herói, caem balançando e giram; o pool se reaproveita. */
  private updateFeathers(dt: number, t: number): void {
    const F = K.feathers;
    if (t >= F.start && t < F.end) {
      this.acc += dt * F.perSec;
      while (this.acc >= 1) {
        this.acc -= 1;
        this.spawnFeather();
      }
    }
    for (const f of this.feathers) {
      if (!f.live) continue;
      f.age += dt;
      if (f.age >= F.life) {
        f.live = false;
        f.s.material.opacity = 0;
        continue;
      }
      f.y -= F.fall * dt;
      f.x += Math.sin(f.phase + f.age * 2) * F.sway * dt;
      f.s.position.set(f.x, f.y, f.z);
      f.s.material.rotation += F.spin * dt;
      f.s.material.opacity = Math.min(1, f.age / 0.2) * (1 - f.age / F.life);
    }
  }

  /** Solta uma pena do pool (se houver uma livre). */
  private spawnFeather(): void {
    const f = this.feathers.find((x) => !x.live);
    if (!f) return;
    const F = K.feathers;
    const a = this.rng() * Math.PI * 2;
    const r = Math.sqrt(this.rng()) * F.spread;
    f.live = true;
    f.age = 0;
    f.x = this.feet.x + Math.cos(a) * r;
    f.y = F.height + this.rng() * 0.3;
    f.z = this.feet.z + Math.sin(a) * r;
    f.phase = this.rng() * Math.PI * 2;
    f.s.material.rotation = this.rng() * Math.PI * 2;
    f.s.scale.setScalar(F.size * (0.7 + 0.6 * this.rng()));
    f.s.position.set(f.x, f.y, f.z);
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    disposeFxGroup(this.group);
  }
}
