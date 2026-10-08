import * as THREE from 'three';
import { VISUAL_CONFIG } from '../../../config/visualConfig';
import { facingToYaw } from '../../coords';
import { softCircle } from '../../textures';
import { archerClips, gruntClips, mageClips, warriorClips, type ClipName } from './anims';
import { ANIM_CONFIG, ANIM_PROFILES, OWN_PROFILE } from '../../../config/animConfig';
import { AnimController, type ActionKind, type AnimEvent, type HitSeverity, type PlayOptions } from './anim/AnimController';
import { buildAnimSet, type AnimSet } from './anim/AnimSet';
import { loadedUalLibrary, onUalLibrary } from './anim/retarget';
import { buildArcher, buildBrute, buildGrunt, buildMage, buildRunner, buildWarrior } from './characters';
import { instantiateSkeleton, type BuiltModel } from './ModelBuilder';
import { attachWeapon, type WeaponAttach } from './weapons';
import { createBodyMaterial, createGlowMaterial, createOutlineMaterial, createSpectreMaterial, createUnitUniforms, type UnitUniforms } from './toonMaterials';

/** Definição de cada personagem 3D. A escala compensa a câmera alta (vista de cima encolhe a altura). */
export interface ModelDef {
  build: () => BuiltModel;
  clips: (b: BuiltModel['bones']) => Record<ClipName, THREE.AnimationClip>;
  scale: number;
  outline: number;
  ghost?: THREE.Color;
  /** Aura permanente (chefe): o mesmo casco do espectro, sempre aceso. */
  aura?: THREE.Color;
  /** Pés batem no chão ao andar em quantos "passos por tile". */
  walkRate: number;
  /** Armas presas nos ossos (modelos importados que vêm de mãos vazias). */
  weapons?: WeaponAttach[];
  /** Perfil de animação (ANIM_PROFILES em animConfig.ts); sem perfil = clipes próprios. */
  anim?: string;
}

export const MODELS: Record<string, ModelDef> = {
  warrior: { build: buildWarrior, clips: warriorClips, scale: 1.42, outline: 0.012, ghost: new THREE.Color(0.35, 1.25, 1.0), walkRate: 1, anim: 'sword' },
  mage: { build: buildMage, clips: mageClips, scale: 1.4, outline: 0.012, ghost: new THREE.Color(0.55, 0.8, 1.6), walkRate: 1, anim: 'staff' },
  archer: { build: buildArcher, clips: archerClips, scale: 1.4, outline: 0.012, ghost: new THREE.Color(0.6, 1.5, 0.5), walkRate: 1.05, anim: 'bow' },
  grunt: { build: buildGrunt, clips: gruntClips, scale: 1.28, outline: 0.013, walkRate: 1.3, anim: 'zombie' },
  runner: { build: buildRunner, clips: (b) => gruntClips(b, 'runner'), scale: 1.2, outline: 0.012, walkRate: 2.4, anim: 'zombie' },
  brute: { build: () => buildBrute(false), clips: (b) => gruntClips(b, 'brute'), scale: 1.5, outline: 0.012, walkRate: 0.85 },
  boss: { build: () => buildBrute(true), clips: (b) => gruntClips(b, 'brute'), scale: 2.25, outline: 0.009, walkRate: 0.9, aura: new THREE.Color(1.6, 0.15, 0.4) },
  /** Mini-chefe dos nós de Elite: brutamonte maior com aura violeta. */
  elite: { build: () => buildBrute(false), clips: (b) => gruntClips(b, 'brute'), scale: 1.85, outline: 0.011, walkRate: 0.85, aura: new THREE.Color(0.9, 0.3, 1.8) },
  /** Colosso Solar (chefe do Ato II): aura dourada. */
  boss2: { build: () => buildBrute(true), clips: (b) => gruntClips(b, 'brute'), scale: 2.45, outline: 0.009, walkRate: 0.9, aura: new THREE.Color(2.0, 1.3, 0.25) },
};
/** Necromante: zumbi conjurador com aura violeta. */
MODELS.necro = { ...MODELS.grunt, scale: 1.3, aura: new THREE.Color(0.7, 0.2, 1.6) };
// Heróis avançados: até o GLB carregar, usam o corpo de uma classe parecida (cor do espectro própria).
MODELS.sorcerer = { ...MODELS.mage, ghost: new THREE.Color(1.2, 0.55, 1.8) };
MODELS.warlock = { ...MODELS.mage, ghost: new THREE.Color(1.6, 0.25, 0.6) };
MODELS.assassin = { ...MODELS.archer, ghost: new THREE.Color(1.6, 1.3, 0.3), anim: 'daggers' };
// Até o GLB do orc carregar, o chefe final usa o Colosso com aura vermelha.
MODELS.orcboss = { ...MODELS.boss, scale: 2.6 };

/** Registra (ou troca) o modelo de um tipo — usado pelos modelos importados (GLB) ao terminar de carregar. */
export function registerModel(kind: string, def: ModelDef): void {
  MODELS[kind] = def;
  cache.delete(kind);
}

/** Geometria e animações são construídas uma vez por tipo e compartilhadas por todas as instâncias. */
const cache = new Map<string, { model: BuiltModel; anims: AnimSet }>();
function assets(kind: string) {
  let a = cache.get(kind);
  if (!a) {
    const d = MODELS[kind];
    const model = d.build();
    const own = d.clips(model.bones);
    const profile = (d.anim && ANIM_PROFILES[d.anim]) || OWN_PROFILE;
    a = { model, anims: buildAnimSet(model.bones, own, profile, loadedUalLibrary()) };
    cache.set(kind, a);
  }
  return a;
}
// a biblioteca chegou depois de algum modelo ser montado: os próximos já saem com ela
onUalLibrary(() => cache.clear());

/** Gravidade do golpe pela fração da vida perdida (e fontes que sempre derrubam). */
export function hitSeverity(amount: number, maxHp: number, source: string, crit = false): HitSeverity {
  const H = ANIM_CONFIG.hit;
  const f = amount / Math.max(1, maxHp);
  let s: HitSeverity = H.heavySources.includes(source) || f >= H.heavyAt ? 'heavy' : f >= H.mediumAt ? 'medium' : 'light';
  if (crit && H.critBump) s = s === 'light' ? 'medium' : 'heavy';
  return s;
}

const IDENTITY = new THREE.Matrix4();
/** Radianos que o boneco inclina para trás, encarando melhor a câmera alta (só visual). */
const MODEL_LEAN = -0.38;

/**
 * Unidade 3D: SkinnedMesh toon + contorno + espectro, animada por AnimationMixer.
 * Mesma interface do SpriteUnitView (o GameView não precisa saber qual é qual).
 */
export class ModelUnitView {
  /** Liga/desliga o contorno de todos os modelos (preset de qualidade). */
  static outlines = true;
  readonly root = new THREE.Group();
  /** Empurrão visual (golpe forte): desloca o corpo e volta com mola, sem mexer na posição da grade. */
  private readonly push = new THREE.Group();
  /** Inclinação para a câmera (truque de jogo isométrico: mostra o rosto sob a câmera alta). */
  private readonly lean = new THREE.Group();
  private readonly model = new THREE.Group();
  private readonly mesh: THREE.SkinnedMesh;
  private readonly outline: THREE.SkinnedMesh;
  private readonly spectre?: THREE.SkinnedMesh;
  private readonly spectreMat?: ReturnType<typeof createSpectreMaterial>;
  /** Camadas de animação, prioridades, eventos e reações físicas. */
  readonly anim: AnimController;
  /** Eventos de animação (attackStart/attackImpact/attackEnd, castStart/castRelease/castEnd...). */
  onAnimEvent?: (e: AnimEvent) => void;
  private readonly u: UnitUniforms;
  private readonly materials: THREE.Material[] = [];
  private readonly capeBones: THREE.Bone[] = [];
  private readonly weapons: THREE.Object3D[] = [];
  private readonly contact: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly hpBar = new THREE.Group();
  private readonly hpFill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  readonly height: number;
  private readonly def: ModelDef;
  private time = Math.random() * 10;
  private yaw = 0;
  private targetYaw = 0;
  private flash = 0;
  private absorbT = 0;
  private levelT = 0;
  /** espectro de combate: tempo desde o início do golpe e quando é o impacto */
  private ghostT = -1;
  private ghostImpact = 0.3;
  private dyingT = -1;
  private deathTotal = 2;
  private prevYaw = 0;
  private hpShown = 1;
  private hpVisible: boolean;
  private readonly lastPos = new THREE.Vector3();
  private capeSwing = 0;
  private capeVel = 0;
  burning = 0;
  done = false;

  constructor(
    readonly kind: string,
    readonly team: 'party' | 'enemy',
  ) {
    this.def = MODELS[kind];
    const { model, anims } = assets(kind);
    this.hpVisible = team === 'party';
    this.u = createUnitUniforms();
    if (team === 'enemy') {
      this.u.uRim.value = 0.3;
      this.u.uRimColor.value.setRGB(0.75, 1.0, 0.85);
    }

    const sk = instantiateSkeleton(model.bones);
    const body = createBodyMaterial(this.u);
    if (model.map) body.map = model.map;
    this.mesh = new THREE.SkinnedMesh(model.geometry, body);
    this.mesh.add(sk.root);
    this.mesh.bind(sk.skeleton, IDENTITY);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    const ol = createOutlineMaterial(this.u, this.def.outline);
    this.outline = new THREE.SkinnedMesh(model.geometry, ol);
    this.outline.bind(sk.skeleton, IDENTITY);
    this.outline.frustumCulled = false;
    this.materials.push(body, ol);
    this.model.add(this.mesh, this.outline);

    const spectreColor = team === 'party' ? this.def.ghost : this.def.aura;
    if (spectreColor) {
      this.spectreMat = createSpectreMaterial(spectreColor);
      this.spectre = new THREE.SkinnedMesh(model.geometry, this.spectreMat);
      this.spectre.bind(sk.skeleton, IDENTITY);
      this.spectre.frustumCulled = false;
      this.spectre.visible = false;
      this.spectre.renderOrder = 6;
      this.materials.push(this.spectreMat);
      this.model.add(this.spectre);
    }
    for (const g of model.glows) {
      const m = createGlowMaterial(this.u, g.color);
      const gm = new THREE.Mesh(g.geometry, m);
      gm.position.copy(g.pos);
      sk.byName.get(g.bone)!.add(gm);
      this.materials.push(m);
    }
    for (const w of this.def.weapons ?? []) {
      const o = attachWeapon(sk.byName, w);
      if (o) this.weapons.push(o);
    }
    for (const n of ['cape0', 'cape1', 'cape2']) {
      const b = sk.byName.get(n);
      if (b) this.capeBones.push(b);
    }
    this.height = model.height * this.def.scale;
    this.model.scale.setScalar(this.def.scale);
    this.lean.rotation.x = MODEL_LEAN;
    this.lean.add(this.model);
    this.push.add(this.lean);
    this.root.add(this.push);

    this.anim = new AnimController(this.mesh, anims, sk.byName);
    this.anim.onEvent = (e) => {
      if (e.type === 'attackStart' || e.type === 'castStart') this.ghostT = 0;
      this.onAnimEvent?.(e);
    };

    // sombra de contato (a sombra projetada é real, do sol)
    this.contact = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: softCircle(), color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }),
    );
    this.contact.scale.set(0.6, 1, 0.45);
    this.contact.position.y = 0.014;
    this.push.add(this.contact);

    const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.08), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
    this.hpFill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.66, 0.05).translate(0.33, 0, 0),
      new THREE.MeshBasicMaterial({ color: team === 'party' ? 0x4ee07a : 0xe0463a, depthWrite: false, transparent: true }),
    );
    this.hpFill.position.set(-0.33, 0, 0.001);
    bg.renderOrder = 10;
    this.hpFill.renderOrder = 11;
    this.hpBar.add(bg, this.hpFill);
    // topo do boneco já inclinado para trás
    this.hpBar.position.set(0, this.height * Math.cos(MODEL_LEAN) + 0.14, this.height * Math.sin(MODEL_LEAN));
    this.root.add(this.hpBar);
  }

  setFacing(fx: number, fy: number, instant = false): void {
    if (fx === 0 && fy === 0) return;
    if (this.dyingT >= 0) return; // caído: quem decide o lado da queda é o golpe final
    this.targetYaw = facingToYaw(fx, fy);
    if (instant) this.yaw = this.targetYaw;
  }

  /** Direção (espaço do personagem: x = esquerda, z = frente) do empurrão de um golpe vindo de `from`. */
  private localPush(from: THREE.Vector3 | undefined, out = new THREE.Vector2()): THREE.Vector2 {
    if (!from) return out.set(0, -1); // sem origem: tranco para trás
    const dx = this.root.position.x - from.x;
    const dz = this.root.position.z - from.z;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    // gira o vetor do mundo para o espaço do personagem (inverso do yaw)
    return out.set(dx * c - dz * s, dx * s + dz * c);
  }

  /**
   * Dano: tranco na direção do golpe. `from` = posição de quem bateu; gravidade leve/média/forte
   * (forte = cambaleio com o corpo empurrado e recuperação).
   */
  hit(info: { from?: THREE.Vector3; severity?: HitSeverity; head?: boolean } = {}): void {
    this.flash = VISUAL_CONFIG.unit.hitFlashTime;
    if (!this.hpLocked) this.hpVisible = true;
    if (this.dyingT >= 0) return;
    const sev = info.severity ?? 'light';
    const local = this.localPush(info.from);
    if (sev === 'heavy' && info.from) {
      const w = new THREE.Vector2(this.root.position.x - info.from.x, this.root.position.z - info.from.z);
      this.anim.knockback(local, w, false);
    } else this.anim.hit(sev, local, info.head);
  }

  /** Empurrão de verdade (a simulação moveu o personagem de tile): `dir` = direção do deslocamento no mundo. */
  knockback(dir: THREE.Vector3): void {
    if (this.dyingT >= 0) return;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const local = new THREE.Vector2(dir.x * c - dir.z * s, dir.x * s + dir.z * c);
    this.anim.knockback(local, new THREE.Vector2(dir.x, dir.z), true);
  }

  /**
   * Golpe. Devolve o tempo (s) até o impacto visual (o dano/partículas/som esperam por ele).
   * `impactAt` força o impacto num instante (para casar com um efeito que já tem tempo próprio).
   */
  attack(style: 'swing' | 'heavy' = 'swing', opts: PlayOptions = {}): number {
    const t = this.anim.play(style === 'heavy' ? 'heavy' : 'attack', opts);
    this.ghostImpact = t || 0.3;
    return t;
  }

  /** Magia (preparação → conjuração → lançamento → recuperação). Devolve o tempo até o lançamento. */
  cast(opts: PlayOptions = {}): number {
    const t = this.anim.play('cast', opts);
    this.ghostImpact = t || 0.4;
    return t;
  }

  /** Anda no lugar (marcador do mapa / retratos). Devolve a duração de um ciclo de passos (laço perfeito). */
  walkInPlace(on: boolean): number {
    this.anim.inPlaceSpeed = on ? ANIM_CONFIG.locomotion.walkAt : undefined;
    return this.anim.walkLoopSeconds;
  }

  /** Tempo (s) até o impacto, sem tocar (o GameView agenda o dano antes de disparar o golpe). */
  impactDelay(kind: ActionKind = 'attack', opts: PlayOptions = {}): number {
    return this.anim.previewImpact(kind, opts);
  }

  /** Tela de seleção/retratos: sem barra de vida. */
  hideHp(): void {
    this.hpVisible = false;
    this.hpLocked = true;
  }
  private hpLocked = false;
  /** Silhueta escura (personagem bloqueado na tela de seleção). */
  dark = false;

  levelUp(): void {
    this.levelT = 1.4;
  }

  absorb(): void {
    this.absorbT = 0.3;
  }

  /** Morte: vira para quem deu o golpe final e cai para longe dele; fica caído e só depois afunda. */
  die(killer?: THREE.Vector3): void {
    this.hpBar.visible = false;
    if (killer) {
      const dx = killer.x - this.root.position.x;
      const dz = killer.z - this.root.position.z;
      if (dx * dx + dz * dz > 1e-4) this.targetYaw = Math.atan2(dx, dz);
    }
    this.anim.play('death');
    this.dyingT = 0;
    const D = ANIM_CONFIG.death;
    this.deathTotal = this.anim.deathDuration + D.linger + D.fade;
    for (const m of this.materials) {
      m.transparent = true;
    }
  }

  get dying(): boolean {
    return this.dyingT >= 0;
  }

  update(dt: number, moveT: number, hpFrac: number, camQuat: THREE.Quaternion): void {
    void moveT; // a locomoção usa a velocidade real do boneco na tela (moveT fica para os sprites)
    this.time += dt;
    // Virar suave para a direção da grade (caminho mais curto no círculo); na morte vira mais rápido
    let d = this.targetYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const turn = this.dyingT >= 0 ? ANIM_CONFIG.death.turnToKiller : 12;
    this.yaw += d * Math.min(1, dt * turn);
    this.model.rotation.y = this.yaw;
    this.outline.visible = ModelUnitView.outlines;

    // velocidade real (o empurrão visual não conta: é o corpo, não os pés)
    const p = this.root.position;
    const speed = dt > 1e-4 ? Math.min(12, Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z) / dt) : 0;
    let dyaw = this.yaw - this.prevYaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    this.prevYaw = this.yaw;
    this.anim.update(dt, speed, dt > 1e-4 ? dyaw / dt : 0, this.def.scale);
    this.push.position.copy(this.anim.bodyOffset);

    // Capa: mola simples guiada pela velocidade + brisa (camada física por cima da animação)
    if (this.capeBones.length) {
      const p = this.root.position;
      const speed = dt > 0 ? p.distanceTo(this.lastPos) / dt : 0;
      const acting = this.anim.busy ? 0.35 : 0;
      const target = Math.min(0.7, speed * 0.35) + acting + Math.sin(this.time * 1.7) * 0.05 + 0.04;
      this.capeVel += (target - this.capeSwing) * 60 * dt - this.capeVel * 8 * dt;
      this.capeSwing += this.capeVel * dt;
      this.capeBones.forEach((b, i) => {
        const wave = Math.sin(this.time * 3.1 - i * 0.9) * 0.05 * (i + 1);
        b.rotation.set(this.capeSwing * (0.35 + i * 0.3) + wave, 0, Math.sin(this.time * 2.3 - i) * 0.03);
      });
    }
    this.lastPos.copy(this.root.position);

    this.hpBar.quaternion.copy(camQuat);
    this.hpBar.visible = this.hpVisible && this.dyingT < 0;

    if (this.dyingT >= 0) {
      this.dyingT += dt;
      // cai, fica caído um tempo e só então afunda no chão e some
      const T = this.deathTotal;
      const fadeT = ANIM_CONFIG.death.fade;
      const k = Math.min(1, this.dyingT / 0.8);
      const sink = Math.max(0, this.dyingT - (T - fadeT)) / fadeT;
      const op = Math.max(0, 1 - sink);
      this.push.position.y = -sink * 0.35;
      this.u.uOpacity.value = op;
      this.u.uTint.value.setRGB(1 - k * 0.35, 1 - k * 0.45, 1 - k * 0.45);
      this.u.uRim.value = 0.4 * (1 - k);
      this.contact.material.opacity = 0.38 * op;
      this.mesh.castShadow = op > 0.5;
      if (this.spectre) this.spectre.visible = false;
      if (this.dyingT >= T) this.done = true;
      return;
    }

    // Espectro de combate: emana no preparo, pico no impacto, recolhe depois
    // (sobe na antecipação, pico no impacto/lançamento, recolhe na recuperação)
    let ghost = 0;
    if (this.ghostT >= 0) {
      this.ghostT += dt;
      const imp = Math.max(0.05, this.ghostImpact);
      const t = this.ghostT;
      ghost = t < imp ? (t / imp) * 0.75 : t < imp + 0.08 ? 1 : Math.max(0, 1 - (t - imp - 0.08) / 0.3);
      if (t > imp + 0.4) this.ghostT = -1;
    }
    if (this.def.aura && this.team === 'enemy') ghost = 0.4 + Math.sin(this.time * 3) * 0.12; // aura do chefe
    if (this.spectre && this.spectreMat) {
      this.spectre.visible = ghost > 0.01;
      const U = this.spectreMat.userData;
      U.intensity.value = ghost * (this.team === 'party' ? 0.6 : 1);
      U.grow.value = 0.03 + ghost * 0.06;
      U.time.value = this.time;
    }

    // Tintas: dano (clareia), queimadura (laranja), alma (ciano), nível (dourado)
    this.flash = Math.max(0, this.flash - dt);
    this.burning = Math.max(0, this.burning - dt);
    this.absorbT = Math.max(0, this.absorbT - dt);
    this.levelT = Math.max(0, this.levelT - dt);
    const f = this.flash / VISUAL_CONFIG.unit.hitFlashTime;
    const ab = this.absorbT / 0.3;
    const lv = Math.min(1, this.levelT / 0.6) * (0.75 + 0.25 * Math.sin(this.time * 18));
    this.u.uTint.value.setRGB(1 + f * 1.3 + this.burning * 0.6 + ab * 0.2 + lv * 0.5, 1 + f * 0.5 + this.burning * 0.18 + ab * 0.6 + lv * 0.35, 1 + f * 0.5 + ab * 0.55);
    const baseRim = this.team === 'party' ? 0.35 : 0.25;
    this.u.uRim.value = baseRim + ghost * 0.6 + ab * 0.9 + lv * 1.6;
    if (this.team === 'party') this.u.uRimColor.value.setRGB(1.0, 0.92 - ab * 0.1, 0.75 - lv * 0.3);
    if (this.dark) {
      this.u.uTint.value.setRGB(0.04, 0.04, 0.06);
      this.u.uRim.value = 0.9;
      this.u.uRimColor.value.setRGB(0.35, 0.4, 0.6);
    }

    this.hpShown += (hpFrac - this.hpShown) * Math.min(1, dt * 10);
    this.hpFill.scale.x = Math.max(0.001, this.hpShown);
  }

  /** Posição de mundo de um ponto preso a um osso (ex.: orbe do cajado na mão direita). */
  socketWorld(bone: string, local: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 | undefined {
    const b = this.mesh.skeleton.bones.find((x) => x.name === bone);
    if (!b) return undefined;
    this.root.updateMatrixWorld(true);
    return b.localToWorld(out.copy(local));
  }

  /** Posição de mundo aproximada do peito (alvo das almas e origem dos projéteis). */
  chestWorld(out = new THREE.Vector3()): THREE.Vector3 {
    this.root.getWorldPosition(out);
    out.y += this.height * 0.55 * Math.cos(MODEL_LEAN);
    out.z += this.height * 0.55 * Math.sin(MODEL_LEAN);
    return out;
  }

  dispose(): void {
    this.anim.dispose();
    this.anim.mixer.uncacheRoot(this.mesh);
    for (const m of this.materials) m.dispose();
    this.mesh.skeleton.dispose();
    this.contact.material.dispose();
    this.contact.geometry.dispose();
    for (const g of [this.hpBar, ...this.weapons])
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    this.root.removeFromParent();
  }
}
