import * as THREE from 'three';
import { fxTexture, type DecalKind, type FxTextureName } from './vfxTextures';
import type { FxKit, OneShotFx } from './FxKit';
import type { Ribbon } from './Ribbons';

/**
 * Peças de forma compartilhadas pelos efeitos de combate: sprites, projéteis com rastro, círculos no chão,
 * colunas de luz e raios. Só apresentação — nada aqui toca a simulação.
 * Tudo que é criado por um efeito é liberado no fim (materiais dos sprites; fitas voltam ao pool).
 */

export interface SpriteOpts {
  /** mistura normal (contorno escuro, sombra) em vez de aditiva (brilho) */
  dark?: boolean;
  opacity?: number;
  rot?: number;
  renderOrder?: number;
}

/** Sprite de textura do Kenney com cor HDR (acima de 1 vira brilho no bloom). */
export function fxSprite(parent: THREE.Object3D, tex: FxTextureName, color: THREE.Color, size: number, o: SpriteOpts = {}): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: fxTexture(tex),
    color: color.clone(),
    transparent: true,
    blending: o.dark ? THREE.NormalBlending : THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    opacity: o.opacity ?? 1,
    rotation: o.rot ?? 0,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  s.renderOrder = o.renderOrder ?? (o.dark ? 8 : 9);
  parent.add(s);
  return s;
}

/** Ângulo (em tela) do segmento a→b: alinha sprites ao movimento e ao corte. */
export function screenAngle(cam: THREE.Camera, a: THREE.Vector3, b: THREE.Vector3): number {
  const pa = a.clone().project(cam);
  const pb = b.clone().project(cam);
  return Math.atan2(pb.y - pa.y, pb.x - pa.x);
}

/** Remove o grupo de um efeito e libera os materiais dos sprites (as texturas ficam no cache). */
export function disposeFxGroup(group: THREE.Group): void {
  group.traverse((o) => {
    const m = (o as THREE.Sprite).material as THREE.Material | undefined;
    m?.dispose?.();
  });
  group.removeFromParent();
}

export interface ProjectileOpts {
  /** cor HDR da cabeça */
  color: THREE.Color;
  /** cor da fita de rastro (padrão: a mesma da cabeça) */
  trail?: THREE.Color;
  /** textura da cabeça (padrão: 'orb') */
  tex?: FxTextureName;
  /** tamanho da cabeça em unidades do mundo */
  size: number;
  /** tempo de voo em segundos */
  duration: number;
  /** altura do arco no meio do voo (0 = reto) */
  arc?: number;
  trailWidth?: number;
  trailLife?: number;
  /** faíscas que se soltam no caminho (opcional) */
  sparks?: THREE.Color;
  /** tempo que a cabeça continua visível depois de chegar, esmaecendo (s) */
  linger?: number;
  /** chamado uma vez ao chegar: é o instante do impacto */
  onArrive?: () => void;
}

/**
 * Projétil de A até B: cabeça luminosa, fita de rastro acompanhando a trajetória e faíscas opcionais.
 * O efeito só termina depois de chegar (não some no meio do caminho). Quem adiciona o grupo à cena é quem chama.
 */
export class Projectile implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private arrived = false;
  private readonly head: THREE.Sprite;
  private readonly ribbon?: Ribbon;
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly kit: FxKit,
    private readonly from: THREE.Vector3,
    private readonly to: THREE.Vector3,
    private readonly o: ProjectileOpts,
  ) {
    this.head = fxSprite(this.group, o.tex ?? 'orb', o.color, o.size);
    this.head.position.copy(from);
    this.ribbon = kit.ribbons.acquire((o.trail ?? o.color).clone(), o.trailWidth ?? 0.14, o.trailLife ?? 0.25);
    this.ribbon?.push(from);
  }

  /** Posição no instante k (0 a 1), com o arco opcional. */
  at(k: number, out: THREE.Vector3): THREE.Vector3 {
    out.lerpVectors(this.from, this.to, k);
    out.y += (this.o.arc ?? 0) * 4 * k * (1 - k);
    return out;
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const k = Math.min(1, this.t / this.o.duration);
    const p = this.at(k, this.tmp);
    if (!this.arrived) {
      this.head.position.copy(p);
      this.ribbon?.push(p);
      if (this.o.sparks) {
        this.kit.particles.spark.emit({ pos: p.clone(), posJitter: 0.05, vel: new THREE.Vector3(), velJitter: 0.8, life: 0.3, size: 0.07, sizeEnd: 0.01, color: this.o.sparks, drag: 2, count: 1 });
      }
    }
    if (k >= 1 && !this.arrived) {
      this.arrived = true;
      this.ribbon?.stop();
      this.o.onArrive?.();
    }
    if (this.arrived) {
      const linger = this.o.linger ?? 0.12;
      const f = (this.t - this.o.duration) / linger;
      this.head.material.opacity = Math.max(0, 1 - f);
      if (f >= 1) {
        this.done = true;
        disposeFxGroup(this.group);
      }
    }
  }
}

export interface GroundCircleOpts {
  radius: number;
  color: THREE.Color;
  life: number;
  kind?: Extract<DecalKind, 'runesFrost' | 'runesFire' | 'ring' | 'glow'>;
  /** tamanho inicial relativo ao raio (0.7 = começa menor e cresce) */
  grow?: number;
  spin?: number;
}

/** Círculo mágico / anel no chão (decalque aditivo que gira e some). Respeita a perspectiva do cenário. */
export function groundCircle(kit: FxKit, pos: THREE.Vector3, o: GroundCircleOpts): void {
  kit.decals.spawn({
    kind: o.kind ?? 'runesFrost',
    pos: pos.clone().setY(0.03),
    size: o.radius * (o.grow ?? 0.7),
    sizeEnd: o.radius,
    color: o.color,
    life: o.life,
    additive: true,
    fadeIn: Math.min(0.08, o.life * 0.2),
    fadeOut: o.life * 0.4,
    spin: o.spin ?? 1.6,
  });
}

/** Coluna de luz vertical (cruz sagrada, raio de cura, pilares de magia): cresce no começo e some. */
export class Pillar implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private readonly sprite: THREE.Sprite;

  constructor(
    pos: THREE.Vector3,
    color: THREE.Color,
    private readonly height: number,
    private readonly width: number,
    private readonly life: number,
    parent?: THREE.Object3D,
  ) {
    this.sprite = fxSprite(this.group, 'trace', color, 1);
    this.sprite.position.set(pos.x, pos.y + height / 2, pos.z);
    if (parent) parent.add(this.group);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const k = this.t / this.life;
    if (k >= 1) {
      this.done = true;
      disposeFxGroup(this.group);
      return;
    }
    const grow = Math.min(1, k / 0.25);
    this.sprite.scale.set(this.width * (0.6 + 0.4 * grow), this.height * grow, 1);
    this.sprite.material.opacity = (1 - k) * (1 - k);
  }
}

/**
 * Caminho em zigue-zague entre dois pontos (raios, feixes irregulares). Os pontos do meio são
 * deslocados ao acaso (só apresentação, não entra na simulação).
 */
export function jaggedPath(from: THREE.Vector3, to: THREE.Vector3, segments: number, jitter: number): THREE.Vector3[] {
  const dir = to.clone().sub(from);
  const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize();
  const pts = [from.clone()];
  for (let i = 1; i < segments; i++) {
    const p = from.clone().lerp(to, i / segments);
    p.addScaledVector(side, (Math.random() - 0.5) * 2 * jitter);
    p.y += (Math.random() - 0.5) * jitter * 0.6;
    pts.push(p);
  }
  pts.push(to.clone());
  return pts;
}
