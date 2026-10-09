import * as THREE from 'three';
import { VISUAL_CONFIG } from '../../config/visualConfig';
import { FlickerLight, Flash, type FxKit, type OneShotFx } from './kit/FxKit';
import { fxTexture } from './kit/vfxTextures';
import type { Ribbon } from './kit/Ribbons';

/**
 * Golpe Furtivo do Assassino — quatro fases bem separadas:
 *  1. CARGA (0 → charge): a energia violeta converge para a mão da adaga; espiral girando e runas no chão;
 *     fumaça escura gira para dentro (a borda escura dá contraste ao núcleo claro).
 *  2. INVESTIDA (charge → impactAt): a lâmina risca o ar em duas fitas (violeta e branca), com rastro de
 *     sombra e riscos de velocidade alinhados ao movimento.
 *  3. IMPACTO (impactAt): arco de corte crescente (claro sobre um arco escuro), estrela de impacto, flash
 *     branco-violeta, anel de choque, lâminas espectrais que voltam ao alvo, faíscas radiais, tremor, aberração
 *     e hit-stop. O alvo reage neste instante (o GameView adia o dano visual até aqui).
 *  4. DISSIPAÇÃO (impactAt → life): os fragmentos se espalham e somem; fica uma poça de energia no chão por
 *     alguns instantes.
 *
 * Só apresentação: usa o kit (partículas, fitas, decalques, luz, tremor). Sprites e materiais são criados por
 * efeito e liberados ao fim.
 */

// cores HDR (acima de 1 o bloom transforma em brilho)
const VIOLET = new THREE.Color(1.8, 0.5, 2.6);
const WHITE_VIOLET = new THREE.Color(2.8, 2.2, 3.4);
const DEEP = new THREE.Color(0.9, 0.2, 1.6);
const DARK = new THREE.Color(0.12, 0.03, 0.22);

const UP = new THREE.Vector3(0, 1, 0);

/** Ângulo (em tela) do segmento a→b: usado para alinhar sprites ao movimento e ao corte. */
function screenAngle(cam: THREE.Camera, a: THREE.Vector3, b: THREE.Vector3): number {
  const pa = a.clone().project(cam);
  const pb = b.clone().project(cam);
  return Math.atan2(pb.y - pa.y, pb.x - pa.x);
}

/** Sprite aditivo (ou escuro, com mistura normal) com textura do Kenney e cor HDR. */
function sprite(parent: THREE.Object3D, tex: string, color: THREE.Color, size: number, dark = false): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: fxTexture(tex as Parameters<typeof fxTexture>[0]),
    color: color.clone(),
    transparent: true,
    blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  s.renderOrder = dark ? 8 : 9;
  parent.add(s);
  return s;
}

interface Streak {
  sprite: THREE.Sprite;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t0: number;
  dur: number;
}

export class AssassinStrikeFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private readonly cfg = VISUAL_CONFIG.strike;
  private readonly hand: THREE.Vector3;
  private readonly hit: THREE.Vector3;
  private readonly fwd: THREE.Vector3;
  private readonly lateral: THREE.Vector3;
  private readonly kit: FxKit;
  private readonly ribbons: Ribbon[] = [];
  private readonly flashes: Flash[] = [];
  private readonly light: FlickerLight;
  private readonly sprites: { s: THREE.Sprite; t0: number; life: number; scale0: number; scale1: number; fadeOut: boolean }[] = [];
  private readonly streaks: Streak[] = [];
  private gather?: THREE.Sprite;
  private arc?: THREE.Sprite;
  private arcDark?: THREE.Sprite;
  private impacted = false;
  private readonly onImpact?: () => void;

  constructor(attacker: THREE.Vector3, target: THREE.Vector3, facing: THREE.Vector3, kit: FxKit, onImpact?: () => void) {
    this.kit = kit;
    this.onImpact = onImpact;
    this.fwd = facing.clone().setY(0).normalize();
    this.lateral = new THREE.Vector3().crossVectors(UP, this.fwd).normalize();
    // a adaga sai da mão do lado do movimento; o golpe pega o peito do alvo
    this.hand = attacker.clone().add(new THREE.Vector3(0, 1.0, 0)).addScaledVector(this.fwd, 0.35).addScaledVector(this.lateral, -0.25);
    this.hit = target.clone().add(new THREE.Vector3(0, 1.0, 0));
    this.light = new FlickerLight(kit.stage, 0xa050ff, 0, 3.2, 0.25);
    this.carve();
  }

  /** Preparação visual que não depende do tempo: runas, espiral e fumaça escura começam já na carga. */
  private carve(): void {
    const ground = this.hand.clone().setY(0.03);
    this.kit.decals.spawn({
      kind: 'runesFrost', pos: ground, size: 0.8, sizeEnd: 1.7, color: DEEP.clone().multiplyScalar(1.1),
      life: this.cfg.charge + 0.3, additive: true, fadeIn: 0.05, fadeOut: 0.55, spin: 2.2,
    });
    this.gather = sprite(this.group, 'twirl', VIOLET, 0.25);
    this.gather.position.copy(this.hand);
  }

  /** Início da investida: fitas e riscos de velocidade saindo da mão em direção ao alvo. */
  private startDash(): void {
    // o pool de fitas é limitado: sem fita livre, o golpe segue só com sprites e partículas
    const core = this.kit.ribbons.acquire(VIOLET.clone(), 0.16, 0.32);
    const edge = this.kit.ribbons.acquire(WHITE_VIOLET.clone(), 0.05, 0.22);
    if (core) this.ribbons.push(core);
    if (edge) this.ribbons.push(edge);
    for (let i = 0; i < 3; i++) {
      const s = sprite(this.group, 'trace', i === 0 ? WHITE_VIOLET : VIOLET, 0.14 + i * 0.03);
      this.streaks.push({ sprite: s, from: this.hand.clone(), to: this.hit.clone(), t0: this.cfg.charge + i * 0.02, dur: this.cfg.impactAt - this.cfg.charge - 0.02 });
    }
  }

  /** Impacto: tudo que acontece no instante do golpe, uma vez só. */
  private strike(): void {
    this.impacted = true;
    this.onImpact?.();
    const cam = this.kit.stage.camera;
    const P = this.kit.particles;
    const hit = this.hit;
    // arco de corte: claro sobre um arco escuro, alinhado com a direção do golpe
    const ang = screenAngle(cam, hit.clone().addScaledVector(this.fwd, -0.5), hit.clone().addScaledVector(this.fwd, 0.5)) + Math.PI / 2;
    const size = this.cfg.slashSize;
    this.arcDark = sprite(this.group, 'slash', DARK, size * 1.08, true);
    this.arcDark.position.copy(hit).addScaledVector(this.fwd, -0.15).setY(hit.y - 0.04);
    this.arcDark.material.rotation = ang;
    this.arc = sprite(this.group, 'slash', WHITE_VIOLET, size);
    this.arc.position.copy(hit).addScaledVector(this.fwd, -0.12);
    this.arc.material.rotation = ang;
    this.sprites.push({ s: this.arc, t0: this.cfg.impactAt, life: 0.42, scale0: size * 0.8, scale1: size * 1.0, fadeOut: true });
    this.sprites.push({ s: this.arcDark, t0: this.cfg.impactAt, life: 0.44, scale0: size * 0.84, scale1: size * 1.04, fadeOut: true });

    // estrela de impacto e flash branco-violeta
    const star = sprite(this.group, 'impact', WHITE_VIOLET.clone().multiplyScalar(0.7), 1.25);
    star.position.copy(hit);
    star.material.rotation = Math.random() * Math.PI;
    this.sprites.push({ s: star, t0: this.cfg.impactAt, life: 0.26, scale0: 1.0, scale1: 1.5, fadeOut: true });
    this.flashes.push(new Flash(this.group, hit, WHITE_VIOLET.clone().multiplyScalar(0.6), 1.3, 0.2));

    // lâminas espectrais: três fitas curtas que voltam ao alvo de ângulos diferentes
    for (let i = 0; i < 3; i++) {
      const off = new THREE.Vector3(Math.cos(i * 2.1) * 1.3, 0.25 + i * 0.35, Math.sin(i * 2.1) * 1.3);
      const from = hit.clone().add(off);
      const s = sprite(this.group, 'trace', i === 1 ? WHITE_VIOLET : VIOLET, 0.26);
      this.streaks.push({ sprite: s, from, to: hit.clone(), t0: this.cfg.impactAt + 0.02 * i, dur: 0.16 });
    }

    // anel de choque no chão e poça de energia que fica
    this.kit.decals.spawn({ kind: 'ring', pos: hit.clone().setY(0.05), size: 0.4, sizeEnd: 3.4, color: VIOLET.clone().multiplyScalar(1.2), life: 0.45, additive: true, fadeIn: 0.01, fadeOut: 0.8 });
    this.kit.decals.spawn({ kind: 'aoe', pos: hit.clone().setY(0.04), size: 1.2, color: DEEP.clone().multiplyScalar(0.8), life: 0.9, additive: true, fadeIn: 0.02, fadeOut: 0.7, opacity: 0.75 });

    // faíscas radiais e brilho, e fumaça escura abrindo
    P.spark.emit({ pos: hit, posJitter: 0.1, vel: new THREE.Vector3(0, 0, 0), velJitter: 5.5, life: 0.55, size: 0.16, sizeEnd: 0.02, color: WHITE_VIOLET, colorEnd: DEEP, gravity: 0, drag: 3.2, count: 40 });
    P.glow.emit({ pos: hit, posJitter: 0.2, vel: new THREE.Vector3(0, 0.4, 0), velJitter: 2.2, life: 0.7, size: 0.35, sizeEnd: 0.05, color: VIOLET, colorEnd: DARK, drag: 2.4, count: 18 });
    P.smoke.emit({ pos: hit.clone().setY(0.2), posJitter: 0.5, vel: new THREE.Vector3(0, 0.5, 0), velJitter: 1.6, life: 1.0, size: 0.5, sizeEnd: 1.3, color: DARK, alpha: 0.6, drag: 2.2, count: 7, spin: 1.2 });

    // distorção e impacto de tela
    this.kit.stage.addShake(this.cfg.shake);
    this.kit.stage.kick(this.cfg.kick);
    this.kit.stage.aberrate(this.cfg.aberrate);
    this.kit.hitStop(this.cfg.hitStop);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    const cfg = this.cfg;
    const P = this.kit.particles;
    const cam = this.kit.stage.camera;

    // 1. carga
    if (t < cfg.charge) {
      const k = t / cfg.charge;
      if (this.gather) {
        this.gather.scale.setScalar(0.4 + 0.9 * k);
        this.gather.material.rotation += dt * 9;
        this.gather.material.opacity = 0.4 + 0.6 * k;
      }
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.9 * (1 - k * 0.8);
        const p = this.hand.clone().add(new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 0.4, Math.sin(a) * r));
        P.glow.emit({ pos: p, vel: this.hand.clone().sub(p).multiplyScalar(1 / Math.max(0.05, cfg.charge - t)), life: 0.18, size: 0.12, sizeEnd: 0.02, color: VIOLET });
      }
      P.smoke.emit({ pos: this.hand.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.1, 0, (Math.random() - 0.5) * 1.1)), vel: new THREE.Vector3(), velJitter: 0.2, life: 0.4, size: 0.22, sizeEnd: 0.05, color: DARK, alpha: 0.4, drag: 1.5, count: 1 });
      this.light.set(this.hand);
      this.light.update(dt, 0.35 * k);
    }

    // 2. investida
    // a energia da carga deixa a mão quando a lâmina sai
    if (this.gather && t >= cfg.charge) this.gather.material.opacity = Math.max(0, this.gather.material.opacity - dt * 10);
    if (t >= cfg.charge && t < cfg.impactAt && this.streaks.length === 0) this.startDash();
    if (t >= cfg.charge && t < cfg.impactAt) {
      const s = (t - cfg.charge) / (cfg.impactAt - cfg.charge);
      const e = s * s;
      const p = this.hand.clone().lerp(this.hit, e);
      // a lâmina descreve um arco: a curva vem do lado da mão
      p.addScaledVector(this.lateral, Math.sin(Math.PI * s) * -0.5);
      if (e > 0.2) for (const r of this.ribbons) r.push(p);
      P.smoke.emit({ pos: p, posJitter: 0.1, vel: new THREE.Vector3(0, 0.3, 0), life: 0.45, size: 0.2, sizeEnd: 0.6, color: DARK, alpha: 0.4, count: 2 });
      this.light.set(p);
      this.light.update(dt, 0.5);
    }

    // 3. impacto
    if (t >= cfg.impactAt && !this.impacted) {
      this.strike();
      for (const r of this.ribbons) r.stop();
      this.light.update(dt, 0.9);
    }
    for (const f of this.flashes) f.update(dt);
    if (this.impacted && t >= cfg.impactAt + 0.25) this.light.update(dt, 0);

    // riscos de velocidade e lâminas espectrais: posição e ângulo no movimento
    for (const st of this.streaks) {
      const k = (t - st.t0) / st.dur;
      if (k < 0) continue;
      if (k >= 1) {
        st.sprite.material.opacity = Math.max(0, st.sprite.material.opacity - dt * 6);
        continue;
      }
      const e = k * k;
      const p = st.from.clone().lerp(st.to, e);
      st.sprite.position.copy(p);
      const q = st.from.clone().lerp(st.to, Math.min(1, e + 0.12));
      st.sprite.material.rotation = screenAngle(cam, p, q) + Math.PI / 2;
      st.sprite.scale.set(0.16, 0.9 + 0.8 * (1 - k), 1);
      st.sprite.material.opacity = 1 - k * 0.6;
    }

    // sprites com vida curta: crescem e somem (arco, estrela, lâminas do impacto)
    for (const it of this.sprites) {
      const k = (t - it.t0) / it.life;
      if (k < 0) continue;
      if (k >= 1) {
        it.s.visible = false;
        continue;
      }
      it.s.scale.setScalar(it.scale0 + (it.scale1 - it.scale0) * Math.sin(Math.min(1, k) * Math.PI / 2));
      it.s.material.opacity = it.fadeOut ? (1 - k) * (1 - k) : 1;
    }

    // 4. dissipação: fumaça subindo e brasas, até o fim da vida
    if (this.impacted && t >= cfg.impactAt + 0.12 && t < cfg.life) {
      if (Math.random() < 0.5) P.glow.emit({ pos: this.hit.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6)), vel: new THREE.Vector3(0, 0.6, 0), velJitter: 0.4, life: 0.6, size: 0.1, sizeEnd: 0.02, color: VIOLET, drag: 1.2 });
    }

    if (t >= cfg.life && this.flashes.every((f) => f.done)) this.dispose();
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    for (const r of this.ribbons) r.stop();
    this.light.release();
    for (const s of this.group.children) {
      const sp = s as THREE.Sprite;
      sp.material?.dispose?.();
    }
    this.group.removeFromParent();
  }
}
