import * as THREE from 'three';
import { Flash, FlickerLight, type FxKit } from './kit/FxKit';
import type { Ribbon } from './kit/Ribbons';
import { VFX } from './kit/vfxSettings';

const C_CORE = new THREE.Color(1.8, 2.8, 3.4);
const C_SHARD = new THREE.Color(1.1, 2.2, 3.2);
const C_TRAIL = new THREE.Color(0.35, 1.1, 2.2);
const C_MOTE = new THREE.Color(1.4, 2.2, 3.0);
const C_MOTE_END = new THREE.Color(0.1, 0.3, 0.8);
const C_MIST = new THREE.Color(0.75, 0.88, 1.0);
const C_RUNE = new THREE.Color(0.6, 1.5, 2.6);

const ANTICIPATION = 0.1;
const flightTime = (from: THREE.Vector3, to: THREE.Vector3) => Math.max(0.08, from.distanceTo(to) * 0.03);

/**
 * Raio Gélido (5 fases):
 *  antecipação (cristais convergindo ao orbe + runa de gelo nos pés) → lançamento (flash, luz)
 *  → trajetória (estilhaço de gelo com fita, névoa e luz própria) → impacto (flash, onda de choque,
 *  lascas caindo) → rescaldo (marca de gelo que derrete, névoa).
 */
export class FrostBoltFX {
  /** Quanto depois do evento o projétil acerta (o GameView adia a reação de dano do alvo até lá). */
  static impactDelay(from: THREE.Vector3, to: THREE.Vector3): number {
    return ANTICIPATION + flightTime(from, to);
  }

  readonly group = new THREE.Group();
  private readonly shard: THREE.Mesh;
  private readonly halo: THREE.Sprite;
  private readonly dur: number;
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
    private readonly onImpact?: () => void,
  ) {
    this.dur = flightTime(from, to);
    // estilhaço: octaedro alongado apontando para o alvo + halo
    const geo = new THREE.OctahedronGeometry(0.12, 0).scale(0.7, 0.7, 2.6);
    this.shard = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: C_SHARD, transparent: true }));
    this.shard.lookAt(to.clone().sub(from));
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: C_CORE, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.halo.scale.setScalar(0.55);
    this.shard.visible = this.halo.visible = false;
    this.group.add(this.shard, this.halo);
    this.group.position.copy(from);
    this.light = new FlickerLight(kit.stage, 0x7fd4ff, 0, 4, 0.1);

    // 1. antecipação
    kit.decals.spawn({ kind: 'runesFrost', pos: from.clone().setY(0), size: 1.1, color: C_RUNE, life: 0.5, additive: true, spin: -2.5, fadeIn: 0.06, fadeOut: 0.6 });
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const p = from.clone().add(new THREE.Vector3(Math.cos(a) * 0.55, (Math.random() - 0.5) * 0.5, Math.sin(a) * 0.55));
      kit.particles.spark.emit({ pos: p, vel: from.clone().sub(p).multiplyScalar(1 / ANTICIPATION), life: ANTICIPATION, size: 0.09, sizeEnd: 0.05, color: C_MOTE, colorEnd: C_CORE });
    }
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const P = this.kit.particles;
    for (const f of this.flashes) f.update(dt);
    if (this.t < ANTICIPATION) return;

    if (!this.shard.visible && !this.hit) {
      // 2. lançamento
      this.shard.visible = this.halo.visible = true;
      this.flashes.push(new Flash(this.group.parent ?? this.group, this.from, C_CORE, 0.9, 0.14));
      this.kit.stage.kick(0.05);
      this.ribbon = this.kit.ribbons.acquire(C_TRAIL, 0.22, 0.22);
    }

    if (!this.hit) {
      // 3. trajetória
      const k = Math.min(1, (this.t - ANTICIPATION) / this.dur);
      const p = this.from.clone().lerp(this.to, k);
      this.group.position.copy(p);
      this.shard.rotateZ(dt * 14);
      this.halo.material.rotation += dt * 6;
      this.ribbon?.push(p);
      this.light.set(p);
      this.light.update(dt, 2.2);
      P.smoke.emit({ pos: p, posJitter: 0.05, vel: new THREE.Vector3(0, 0.15, 0), velJitter: 0.1, life: 0.5, size: 0.18, sizeEnd: 0.45, color: C_MIST, alpha: 0.35, spin: 1 });
      P.glow.emit({ pos: p, posJitter: 0.1, vel: new THREE.Vector3(0, -0.3, 0), velJitter: 0.25, life: 0.5, size: 0.06, sizeEnd: 0.02, color: C_MOTE, colorEnd: C_MOTE_END, gravity: 0.6, count: 1.5 });
      if (k >= 1) this.impact(p);
      return;
    }

    // 5. rescaldo curto (luz apagando), depois some
    this.linger += dt;
    this.light.update(dt, Math.max(0, 2.6 * (1 - this.linger / 0.25)));
    if (this.linger > 0.3 && this.flashes.every((f) => f.done)) this.dispose();
  }

  private impact(p: THREE.Vector3): void {
    this.hit = true;
    this.shard.visible = this.halo.visible = false;
    this.ribbon?.stop();
    this.onImpact?.();
    const P = this.kit.particles;
    // 4. impacto
    this.flashes.push(new Flash(this.group.parent ?? this.group, p, C_CORE, 1.3, 0.16));
    P.spark.emit({ pos: p, posJitter: 0.06, vel: new THREE.Vector3(0, 1.6, 0), velJitter: 2.6, life: 0.55, size: 0.11, sizeEnd: 0.03, color: C_MOTE, colorEnd: C_MOTE_END, gravity: 7, drag: 1.2, count: 14 });
    P.smoke.emit({ pos: p, posJitter: 0.15, vel: new THREE.Vector3(0, 0.3, 0), velJitter: 0.4, life: 0.9, size: 0.4, sizeEnd: 1.0, color: C_MIST, alpha: 0.4, count: 3, spin: 0.8 });
    const ground = p.clone().setY(0);
    this.kit.decals.spawn({ kind: 'ring', pos: ground, size: 0.25, sizeEnd: 1.5, color: new THREE.Color(0.8, 1.6, 2.4).multiplyScalar(VFX.flash), life: 0.3, additive: true, fadeIn: 0.01, fadeOut: 0.7 });
    this.kit.decals.spawn({ kind: 'frost', pos: ground, size: 0.9 + Math.random() * 0.3, color: new THREE.Color(0.85, 0.95, 1.1), life: 3.5, fadeIn: 0.05, fadeOut: 0.5, dissolve: true, opacity: 0.8 });
    this.kit.stage.addShake(0.03);
    this.kit.stage.aberrate(0.002);
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    this.ribbon?.stop();
    this.light.release();
    this.shard.geometry.dispose();
    (this.shard.material as THREE.Material).dispose();
    this.halo.material.dispose();
    this.group.removeFromParent();
  }
}

let _halo: THREE.Texture | undefined;
function haloTex(): THREE.Texture {
  if (_halo) return _halo;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  // seis pontas de cristal
  g.translate(32, 32);
  g.fillStyle = 'rgba(255,255,255,0.6)';
  for (let i = 0; i < 6; i++) {
    g.rotate(Math.PI / 3);
    g.beginPath();
    g.moveTo(-2, 0);
    g.lineTo(0, -30);
    g.lineTo(2, 0);
    g.fill();
  }
  _halo = new THREE.CanvasTexture(c);
  return _halo;
}
