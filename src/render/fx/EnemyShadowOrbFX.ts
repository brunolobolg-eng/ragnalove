import * as THREE from 'three';
import { ENEMY_SHADOW_FX as C } from '../../config/fx/enemyShadow';
import { Flash, FlickerLight, type FxKit } from './kit/FxKit';
import type { Ribbon } from './kit/Ribbons';
import { haloTexture } from './kit/vfxTextures';

const rgb = (v: readonly number[]) => new THREE.Color(v[0], v[1], v[2]);
const CORE = rgb(C.colors.core);
const HALO = rgb(C.colors.halo);
const RING = rgb(C.colors.ring);
const SMOKE = rgb(C.colors.smoke);
const MOTE = rgb(C.colors.mote);
const MOTE_END = rgb(C.colors.moteEnd);
const FLASH = rgb(C.colors.flash);

/** Tempo de voo (depois da antecipação): distância dividida pela velocidade do orbe. */
const flightTime = (from: THREE.Vector3, to: THREE.Vector3) => from.distanceTo(to) / C.speed;

/**
 * Orbe de sombra do Necromante (inimigo), em fases: antecipação (runa e fumaça convergindo) → lançamento
 * (flash, fita e luz) → voo (núcleo escuro, halo pulsando, anel girando, fumaça e brilho) → impacto (flash,
 * onda de choque roxa, lascas e marca no chão) → rescaldo curto. O GameView adia o dano do alvo até a batida
 * (`impactDelay`). Só apresentação.
 */
export class EnemyShadowOrbFX {
  /** Quanto depois do evento o orbe acerta (o GameView adia a reação de dano do alvo até lá). */
  static impactDelay(from: THREE.Vector3, to: THREE.Vector3): number {
    return C.anticipation + flightTime(from, to);
  }

  readonly group = new THREE.Group();
  private readonly core: THREE.Mesh;
  private readonly halo: THREE.Sprite;
  private readonly ring: THREE.Mesh;
  private readonly flight: number;
  private readonly light: FlickerLight;
  private ribbon?: Ribbon;
  private readonly flashes: Flash[] = [];
  private t = 0;
  private hit = false;
  private linger = 0;
  done = false;

  constructor(
    private readonly from: THREE.Vector3,
    private readonly to: THREE.Vector3,
    private readonly kit: FxKit,
  ) {
    this.flight = flightTime(from, to);
    // núcleo escuro, com o halo aditivo por fora e o anel rúnico inclinado em volta
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(C.coreRadius, 2), new THREE.MeshBasicMaterial({ color: CORE }));
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: HALO, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.halo.scale.setScalar(C.haloSize);
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(C.ringRadius, C.ringTube, 8, 40),
      new THREE.MeshBasicMaterial({ color: RING, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.ring.rotation.x = Math.PI / 2.4;
    this.core.visible = this.halo.visible = this.ring.visible = false;
    this.group.add(this.core, this.halo, this.ring);
    this.group.position.copy(from);
    this.light = new FlickerLight(kit.stage, 0xa040ff, 0, 5, 0.15);

    // 1. antecipação: runa roxa no chão e fumaça escura convergindo para a mão do Necromante
    kit.decals.spawn({ kind: 'runesFrost', pos: from.clone().setY(0), size: 1.4, color: RING, life: C.anticipation + 0.2, additive: true, spin: 2.2, fadeIn: 0.05, fadeOut: 0.5 });
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const p = from.clone().add(new THREE.Vector3(Math.cos(a) * 0.9, (Math.random() - 0.5) * 0.6, Math.sin(a) * 0.9));
      kit.particles.smoke.emit({ pos: p, vel: from.clone().sub(p).multiplyScalar(1 / C.anticipation), life: C.anticipation, size: 0.35, sizeEnd: 0.1, color: SMOKE, alpha: 0.5 });
    }
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    for (const f of this.flashes) f.update(dt);
    if (this.t < C.anticipation) return;

    if (!this.core.visible && !this.hit) {
      // 2. lançamento: flash, fita de rastro e luz
      this.core.visible = this.halo.visible = this.ring.visible = true;
      this.flashes.push(new Flash(this.group.parent ?? this.group, this.from, FLASH, 1.5, 0.2));
      this.kit.stage.kick(C.kick * 0.6);
      this.ribbon = this.kit.ribbons.acquire(RING, C.ribbon.width, C.ribbon.life);
    }

    if (!this.hit) {
      // 3. voo: o orbe segue a linha com uma curva leve
      const k = Math.min(1, (this.t - C.anticipation) / this.flight);
      const p = this.from.clone().lerp(this.to, k);
      p.y += Math.sin(k * Math.PI) * C.arc;
      this.group.position.copy(p);
      this.ring.rotation.y += dt * 4;
      this.core.rotation.y += dt * 3;
      this.halo.scale.setScalar(C.haloSize * (1 + Math.sin(this.t * 14) * C.haloPulse));
      this.ribbon?.push(p);
      this.light.set(p);
      this.light.update(dt, 2.6);
      const P = this.kit.particles;
      P.smoke.emit({ pos: p, posJitter: 0.12, vel: new THREE.Vector3(0, 0.2, 0), velJitter: 0.2, life: 0.7, size: 0.5, sizeEnd: 1.1, color: SMOKE, alpha: 0.45, spin: 0.8 });
      P.glow.emit({ pos: p, posJitter: 0.25, vel: new THREE.Vector3(0, 0.4, 0), velJitter: 0.7, life: 0.45, size: 0.2, sizeEnd: 0.04, color: MOTE, colorEnd: MOTE_END, count: 2 });
      if (k >= 1) this.impact(p);
      return;
    }

    // 5. rescaldo curto (luz apagando), depois some
    this.linger += dt;
    this.light.update(dt, Math.max(0, 2.6 * (1 - this.linger / C.impact.linger)));
    if (this.linger > C.impact.linger && this.flashes.every((f) => f.done)) this.dispose();
  }

  private impact(p: THREE.Vector3): void {
    this.hit = true;
    this.core.visible = this.halo.visible = this.ring.visible = false;
    this.ribbon?.stop();
    // 4. impacto: flash grande, lascas de sombra, fumaça escura, onda de choque roxa e marca no chão
    this.flashes.push(new Flash(this.group.parent ?? this.group, p, FLASH, C.impact.flashSize, 0.2));
    const P = this.kit.particles;
    P.spark.emit({ pos: p, posJitter: 0.1, vel: new THREE.Vector3(0, 1.8, 0), velJitter: 3, life: 0.6, size: 0.16, sizeEnd: 0.03, color: MOTE, colorEnd: MOTE_END, gravity: 6, drag: 1.1, count: 18 });
    P.smoke.emit({ pos: p, posJitter: 0.2, vel: new THREE.Vector3(0, 0.4, 0), velJitter: 0.6, life: 1.0, size: 0.7, sizeEnd: 1.6, color: SMOKE, alpha: 0.55, count: 5, spin: 0.9 });
    const ground = p.clone().setY(0);
    this.kit.decals.spawn({ kind: 'ring', pos: ground, size: C.impact.shockwaveStart, sizeEnd: C.impact.shockwaveEnd, color: RING, life: 0.45, additive: true, fadeIn: 0.01, fadeOut: 0.7 });
    this.kit.decals.spawn({ kind: 'scorch', pos: ground, size: 1.6, color: new THREE.Color(0.5, 0.2, 0.7), life: 3.5, fadeIn: 0.05, fadeOut: 0.5, dissolve: true, opacity: 0.8 });
    this.kit.stage.addShake(C.shake);
    this.kit.stage.kick(C.kick);
    this.kit.hitStop(C.hitStop);
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    this.ribbon?.stop();
    this.light.release();
    this.core.geometry.dispose();
    (this.core.material as THREE.Material).dispose();
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
    this.halo.material.dispose();
    this.group.removeFromParent();
  }
}
