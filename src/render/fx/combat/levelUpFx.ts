import * as THREE from 'three';
import { LEVELUP_FX as K } from '../../../config/fx/levelup';
import { Flash, type FxKit, type OneShotFx } from '../kit/FxKit';
import { disposeFxGroup, fxSprite, groundCircle, Pillar, screenAngle } from '../kit/Shapes';

const rgb = (a: readonly number[]): THREE.Color => new THREE.Color(a[0], a[1], a[2]);
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

let angelCache: THREE.CanvasTexture | undefined;

/**
 * Anjo branco desenhado em canvas (procedural, sem asset externo): asas de penas em leque, auréola dourada,
 * túnica com fio dourado, braços abertos e cabeça. Gerado uma vez e reutilizado por todas as subidas de nível.
 */
export function angelTexture(): THREE.CanvasTexture {
  if (angelCache) return angelCache;
  const S = K.angel.textureSize;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d');
  const cx = S / 2;
  if (g) {
    g.shadowColor = 'rgba(255, 236, 170, 0.9)';
    g.shadowBlur = S * K.angel.glowBlur;
    // asas: penas em leque, para cima e para fora, a partir dos ombros
    const shoulderY = S * 0.4;
    for (const side of [-1, 1]) {
      for (let i = 0; i < K.angel.feathers; i++) {
        const f = i / (K.angel.feathers - 1);
        const ang = side > 0 ? -0.2 - f * 0.9 : Math.PI + 0.2 + f * 0.9;
        const len = S * (0.3 - 0.06 * f + 0.015 * Math.sin(i * 1.7));
        const px = cx + side * S * 0.09 + Math.cos(ang) * len * 0.55;
        const py = shoulderY + Math.sin(ang) * len * 0.55;
        g.save();
        g.translate(px, py);
        g.rotate(ang);
        const grad = g.createRadialGradient(0, 0, 0, 0, 0, len * 0.6);
        grad.addColorStop(0, 'rgba(255, 255, 250, 0.95)');
        grad.addColorStop(1, 'rgba(255, 214, 120, 0)');
        g.fillStyle = grad;
        g.beginPath();
        g.ellipse(0, 0, len * 0.55, S * 0.045, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
    // túnica afunilada, branca com fio dourado na barra
    const tg = g.createLinearGradient(0, S * 0.4, 0, S * 0.95);
    tg.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    tg.addColorStop(1, 'rgba(255, 230, 160, 0.85)');
    g.fillStyle = tg;
    g.beginPath();
    g.moveTo(cx - S * 0.1, S * 0.4);
    g.lineTo(cx + S * 0.1, S * 0.4);
    g.lineTo(cx + S * 0.19, S * 0.95);
    g.lineTo(cx - S * 0.19, S * 0.95);
    g.closePath();
    g.fill();
    // cabeça
    g.fillStyle = 'rgba(255, 250, 235, 1)';
    g.beginPath();
    g.arc(cx, S * 0.3, S * 0.07, 0, Math.PI * 2);
    g.fill();
    // auréola
    g.shadowBlur = S * 0.02;
    g.strokeStyle = 'rgba(255, 220, 110, 1)';
    g.lineWidth = S * 0.03;
    g.beginPath();
    g.ellipse(cx, S * 0.16, S * 0.12, S * 0.035, 0, 0, Math.PI * 2);
    g.stroke();
    // braços abertos, mostrando o gesto
    g.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    g.lineWidth = S * 0.035;
    g.lineCap = 'round';
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + side * S * 0.1, S * 0.42);
      g.quadraticCurveTo(cx + side * S * 0.24, S * 0.42, cx + side * S * 0.3, S * 0.36);
      g.stroke();
    }
    // brilho suave no centro, para o corpo não parecer recortado
    g.shadowBlur = 0;
    const cg = g.createRadialGradient(cx, S * 0.5, 0, cx, S * 0.5, S * 0.5);
    cg.addColorStop(0, `rgba(255, 255, 240, ${K.angel.centerGlow})`);
    cg.addColorStop(1, 'rgba(255, 255, 240, 0)');
    g.fillStyle = cg;
    g.fillRect(0, 0, S, S);
  }
  angelCache = new THREE.CanvasTexture(cv);
  return angelCache;
}

/**
 * Subida de nível: consagração no chão, coluna de luz, um anjo branco que aparece acima do herói e se mostra,
 * uma explosão divina (anel, raios, faíscas, clarão) e penas douradas caindo. No fim o anjo some subindo em luz.
 */
export class DivineRiseFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private burst = false;
  private burstAt = 0;
  private featherAcc = 0;
  private readonly kit: FxKit;
  private readonly feet: THREE.Vector3;
  private readonly center: THREE.Vector3;
  private readonly angel: THREE.Sprite;
  private readonly halo: THREE.Sprite;
  private readonly column: Pillar;
  private readonly rays: { s: THREE.Sprite; dir: THREE.Vector3 }[] = [];
  private readonly flashes: Flash[] = [];
  private readonly p0 = new THREE.Vector3();
  private readonly p1 = new THREE.Vector3();

  constructor(kit: FxKit, feet: THREE.Vector3) {
    this.kit = kit;
    this.feet = feet.clone().setY(0);
    this.center = new THREE.Vector3(this.feet.x, K.burst.halo.height, this.feet.z);
    groundCircle(kit, this.feet, { radius: K.consecration.radius, color: rgb(K.consecration.color), life: K.consecration.life, kind: 'ring', grow: K.consecration.grow, spin: 0 });
    this.column = new Pillar(this.feet, rgb(K.column.color), K.column.height, K.column.width, K.column.life, this.group);
    const mat = new THREE.SpriteMaterial({
      map: angelTexture(),
      color: rgb(K.angel.color),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      opacity: 0,
    });
    this.angel = new THREE.Sprite(mat);
    this.angel.scale.setScalar(K.angel.size);
    this.angel.renderOrder = 10;
    this.group.add(this.angel);
    this.halo = fxSprite(this.group, 'halo', rgb(K.burst.halo.color), K.burst.halo.size0, { opacity: 0 });
    for (let i = 0; i < K.burst.rays.count; i++) {
      const a = (i / K.burst.rays.count) * Math.PI * 2;
      const s = fxSprite(this.group, 'trace', rgb(K.burst.rays.color), 1, { opacity: 0 });
      this.rays.push({ s, dir: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)) });
    }
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    this.column.update(dt);
    this.updateAngel(t);
    if (!this.burst && t >= K.burst.at) this.doBurst(t);
    this.updateBurst(t);
    if (t >= K.feathers.start && t < K.feathers.end) {
      this.featherAcc += dt * K.feathers.perSec;
      while (this.featherAcc >= 1) {
        this.featherAcc -= 1;
        this.emitFeather();
      }
    }
    for (const f of this.flashes) f.update(dt);
    if (t >= K.life && this.flashes.every((f) => f.done) && this.column.done) this.dispose();
  }

  /** Anjo: entra crescendo, se mostra batendo as asas e some subindo em luz. */
  private updateAngel(t: number): void {
    const A = K.angel;
    const inK = clamp01((t - A.inAt) / A.inTime);
    const ease = 1 - (1 - inK) ** 3;
    let opacity = inK;
    let y = this.feet.y + A.y0 + (A.y1 - A.y0) * ease;
    const scale = A.size * (0.35 + 0.65 * ease);
    if (t > A.holdUntil) {
      const outK = clamp01((t - A.holdUntil) / A.fadeTime);
      opacity = 1 - outK;
      y += 0.6 * outK;
      // motes de luz que se soltam do anjo enquanto ele some
      if (outK < 1) {
        this.kit.particles.glow.emit({
          pos: this.angel.position.clone(),
          posJitter: 0.8,
          vel: new THREE.Vector3(0, 0.8, 0),
          velJitter: 0.3,
          life: 0.8,
          size: 0.12,
          sizeEnd: 0.02,
          color: rgb(A.color),
          alpha: 0.7,
          count: 1,
        });
      }
    }
    const flap = 1 + A.flapAmp * Math.sin(t * A.flapRate * Math.PI * 2);
    this.angel.position.set(this.feet.x, y, this.feet.z);
    this.angel.scale.set(scale * flap, scale, 1);
    this.angel.material.opacity = clamp01(opacity);
  }

  /** Explosão divina: anel no chão, clarão, faíscas radiais e tremor. */
  private doBurst(t: number): void {
    this.burst = true;
    this.burstAt = t;
    const B = K.burst;
    groundCircle(this.kit, this.feet, { radius: B.ring.radius, color: rgb(B.ring.color), life: B.ring.life, kind: 'ring', grow: 0.3, spin: 0 });
    this.flashes.push(new Flash(this.group, this.center, rgb(B.flash.color), B.flash.size, B.flash.life));
    this.kit.particles.spark.emit({
      pos: this.center.clone(),
      posJitter: 0.2,
      vel: new THREE.Vector3(),
      velJitter: B.sparks.speed,
      life: 0.5,
      size: 0.14,
      sizeEnd: 0.02,
      color: rgb(B.sparks.color),
      colorEnd: rgb(B.sparks.colorEnd),
      drag: 2.5,
      count: B.sparks.count,
    });
    this.kit.stage.addShake(B.shake);
    this.kit.stage.kick(B.kick);
  }

  /** Depois da explosão: o halo de ar se expande e os raios saem do centro e somem. */
  private updateBurst(t: number): void {
    if (!this.burst) return;
    const B = K.burst;
    const bt = t - this.burstAt;
    const hk = clamp01(bt / B.halo.life);
    this.halo.position.copy(this.center);
    this.halo.scale.setScalar(B.halo.size0 + (B.halo.size1 - B.halo.size0) * (1 - (1 - hk) ** 2));
    this.halo.material.opacity = 1 - hk;
    const rk = clamp01(bt / B.rays.life);
    const reach = B.rays.reach * (1 - (1 - rk) ** 2);
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

  /** Pena dourada que cai devagar sobre o herói. */
  private emitFeather(): void {
    const F = K.feathers;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * F.spread;
    this.kit.particles.glow.emit({
      pos: new THREE.Vector3(this.feet.x + Math.cos(a) * r, F.height, this.feet.z + Math.sin(a) * r),
      posJitter: 0.05,
      vel: new THREE.Vector3(0, -0.2, 0),
      velJitter: 0.1,
      life: F.life,
      size: F.size,
      sizeEnd: F.size * 0.6,
      color: rgb(F.color),
      colorEnd: rgb(F.colorEnd),
      gravity: F.gravity,
      drag: 0.4,
      count: 1,
      spin: 1.5,
    });
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    disposeFxGroup(this.group);
  }
}
