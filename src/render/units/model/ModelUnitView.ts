import * as THREE from 'three';
import { VISUAL_CONFIG } from '../../../config/visualConfig';
import { GAME_CONFIG } from '../../../config/gameConfig';
import { facingToYaw } from '../../coords';
import { softCircle } from '../../textures';
import { archerClips, gruntClips, mageClips, warriorClips, type ClipName } from './anims';
import { buildArcher, buildBrute, buildGrunt, buildMage, buildRunner, buildWarrior } from './characters';
import { instantiateSkeleton, type BuiltModel } from './ModelBuilder';
import { attachWeapon, type WeaponAttach } from './weapons';
import { createBodyMaterial, createGlowMaterial, createSpectreMaterial, createUnitUniforms, type UnitUniforms } from './toonMaterials';

/** Definição de cada personagem 3D. A escala compensa a câmera alta (vista de cima encolhe a altura). */
export interface ModelDef {
  build: () => BuiltModel;
  clips: (b: BuiltModel['bones']) => Record<ClipName, THREE.AnimationClip>;
  scale: number;
  ghost?: THREE.Color;
  /** Aura permanente (chefe): o mesmo casco do espectro, sempre aceso. */
  aura?: THREE.Color;
  /** Pés batem no chão ao andar em quantos "passos por tile". */
  walkRate: number;
  /** Armas presas nos ossos (modelos importados que vêm de mãos vazias). */
  weapons?: WeaponAttach[];
}

export const MODELS: Record<string, ModelDef> = {
  warrior: { build: buildWarrior, clips: warriorClips, scale: 1.42, ghost: new THREE.Color(0.35, 1.25, 1.0), walkRate: 1 },
  mage: { build: buildMage, clips: mageClips, scale: 1.4, ghost: new THREE.Color(0.55, 0.8, 1.6), walkRate: 1 },
  archer: { build: buildArcher, clips: archerClips, scale: 1.4, ghost: new THREE.Color(0.6, 1.5, 0.5), walkRate: 1.05 },
  grunt: { build: buildGrunt, clips: gruntClips, scale: 1.28, walkRate: 1.3 },
  runner: { build: buildRunner, clips: (b) => gruntClips(b, 'runner'), scale: 1.2, walkRate: 2.4 },
  brute: { build: () => buildBrute(false), clips: (b) => gruntClips(b, 'brute'), scale: 1.5, walkRate: 0.85 },
  boss: { build: () => buildBrute(true), clips: (b) => gruntClips(b, 'brute'), scale: 2.25, walkRate: 0.9, aura: new THREE.Color(1.6, 0.15, 0.4) },
  /** Mini-chefe dos nós de Elite: brutamonte maior com aura violeta. */
  elite: { build: () => buildBrute(false), clips: (b) => gruntClips(b, 'brute'), scale: 1.85, walkRate: 0.85, aura: new THREE.Color(0.9, 0.3, 1.8) },
  /** Colosso Solar (chefe do Ato II): aura dourada. */
  boss2: { build: () => buildBrute(true), clips: (b) => gruntClips(b, 'brute'), scale: 2.45, walkRate: 0.9, aura: new THREE.Color(2.0, 1.3, 0.25) },
};
/** Necromante: zumbi conjurador com aura violeta. */
MODELS.necro = { ...MODELS.grunt, scale: 1.3, aura: new THREE.Color(0.7, 0.2, 1.6) };
// Heróis avançados: até o GLB carregar, usam o corpo de uma classe parecida (cor do espectro própria).
MODELS.sorcerer = { ...MODELS.mage, ghost: new THREE.Color(1.2, 0.55, 1.8) };
MODELS.warlock = { ...MODELS.mage, ghost: new THREE.Color(1.6, 0.25, 0.6) };
MODELS.assassin = { ...MODELS.archer, ghost: new THREE.Color(1.6, 1.3, 0.3) };
// Até o GLB do orc carregar, o chefe final usa o Colosso com aura vermelha.
MODELS.orcboss = { ...MODELS.boss, scale: 2.6 };
// Krexx (mini-chefe goblin em duas formas): até o GLB carregar, usa corpo parecido.
MODELS.goblinImp = { ...MODELS.runner };
MODELS.goblinWarlord = { ...MODELS.brute, aura: new THREE.Color(1.6, 0.15, 0.4) };

/** Registra (ou troca) o modelo de um tipo — usado pelos modelos importados (GLB) ao terminar de carregar. */
export function registerModel(kind: string, def: ModelDef): void {
  MODELS[kind] = def;
  cache.delete(kind);
}

/** Geometria e clipes são construídos uma vez por tipo e compartilhados por todas as instâncias. */
const cache = new Map<string, { model: BuiltModel; clips: Record<ClipName, THREE.AnimationClip> }>();
function assets(kind: string) {
  let a = cache.get(kind);
  if (!a) {
    const d = MODELS[kind];
    const model = d.build();
    a = { model, clips: d.clips(model.bones) };
    cache.set(kind, a);
  }
  return a;
}

const IDENTITY = new THREE.Matrix4();
/** Radianos que o boneco inclina para trás, encarando melhor a câmera alta (só visual). */
const MODEL_LEAN = -0.38;
const ONE_SHOTS: ClipName[] = ['attack', 'heavy', 'cast', 'hit', 'death'];

/** Geometria e materiais iguais em todas as unidades (um conjunto para a horda inteira). */
let shared: ReturnType<typeof buildShared> | undefined;
function buildShared() {
  return {
    contactGeo: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    barBgGeo: new THREE.PlaneGeometry(0.7, 0.08),
    barFillGeo: new THREE.PlaneGeometry(0.66, 0.05).translate(0.33, 0, 0),
    barBg: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }),
    barFillParty: new THREE.MeshBasicMaterial({ color: 0x4ee07a, depthWrite: false, transparent: true }),
    barFillEnemy: new THREE.MeshBasicMaterial({ color: 0xe0463a, depthWrite: false, transparent: true }),
  };
}
const sharedUnitRes = () => (shared ??= buildShared());

/**
 * Unidade 3D: SkinnedMesh toon + contorno + espectro, animada por AnimationMixer.
 * Mesma interface do SpriteUnitView (o GameView não precisa saber qual é qual).
 */
export class ModelUnitView {
  /** Liga/desliga o contorno de todos os modelos (preset de qualidade). */
  readonly root = new THREE.Group();
  /** Inclinação para a câmera (truque de jogo isométrico: mostra o rosto sob a câmera alta). */
  private readonly lean = new THREE.Group();
  private readonly model = new THREE.Group();
  private readonly mesh: THREE.SkinnedMesh;
  private readonly spectre?: THREE.SkinnedMesh;
  private readonly spectreMat?: ReturnType<typeof createSpectreMaterial>;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<ClipName, THREE.AnimationAction>;
  private current: THREE.AnimationAction;
  private base: THREE.AnimationAction;
  private readonly u: UnitUniforms;
  private readonly materials: THREE.Material[] = [];
  private readonly capeBones: THREE.Bone[] = [];
  private readonly weapons: THREE.Object3D[] = [];
  private readonly contact: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly hpBar = new THREE.Group();
  private readonly hpFill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  readonly height: number;
  /** Projeta sombra (heróis e chefes). */
  private readonly castsShadow: boolean;
  private readonly def: ModelDef;
  private time = Math.random() * 10;
  private yaw = 0;
  private targetYaw = 0;
  private flash = 0;
  private absorbT = 0;
  private levelT = 0;
  private actionT = -1;
  private actionDur = 0.5;
  private dyingT = -1;
  private walkHold = 0;
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
    const { model, clips } = assets(kind);
    this.hpVisible = team === 'party';
    this.u = createUnitUniforms();
    if (team === 'enemy') {
      this.u.uRim.value = 0.3;
      this.u.uRimColor.value.setRGB(0.75, 1.0, 0.85);
    }

    const sk = instantiateSkeleton(model.bones, model.inverses);
    const body = createBodyMaterial(this.u);
    if (model.map) body.map = model.map;
    // cor por vértice só se o modelo tem o atributo: sem ele o WebGL usa preto e a textura some (ex.: Bongun)
    body.vertexColors = !!model.geometry.getAttribute('color');
    this.mesh = new THREE.SkinnedMesh(model.geometry, body);
    this.mesh.add(sk.root);
    this.mesh.bind(sk.skeleton, IDENTITY);
    // sombra projetada só de heróis e chefes: a horda não paga a 2ª passagem de desenho (a sombra de contato já existe)
    this.castsShadow = team === 'party' || GAME_CONFIG.bossKinds.includes(kind);
    this.mesh.castShadow = this.castsShadow;
    this.mesh.frustumCulled = false;
    this.materials.push(body);
    this.model.add(this.mesh);

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
    this.root.add(this.lean);

    this.mixer = new THREE.AnimationMixer(this.mesh);
    this.actions = {} as Record<ClipName, THREE.AnimationAction>;
    for (const [name, clip] of Object.entries(clips) as [ClipName, THREE.AnimationClip][]) {
      const a = this.mixer.clipAction(clip);
      if (ONE_SHOTS.includes(name)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions[name] = a;
    }
    this.base = this.current = this.actions.idle;
    this.current.time = Math.random() * clips.idle.duration; // horda fora de sincronia
    this.current.play();
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.actions.death) return;
      if (e.action === this.current) this.to(this.base, 0.15);
    });

    // sombra de contato (a sombra projetada é real, do sol)
    const sh = sharedUnitRes();
    this.contact = new THREE.Mesh(
      sh.contactGeo,
      new THREE.MeshBasicMaterial({ map: softCircle(), color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }),
    );
    this.contact.scale.set(0.6, 1, 0.45);
    this.contact.position.y = 0.014;
    this.root.add(this.contact);

    const bg = new THREE.Mesh(sh.barBgGeo, sh.barBg);
    this.hpFill = new THREE.Mesh(
      sh.barFillGeo,
      team === 'party' ? sh.barFillParty : sh.barFillEnemy,
    );
    this.hpFill.position.set(-0.33, 0, 0.001);
    bg.renderOrder = 10;
    this.hpFill.renderOrder = 11;
    this.hpBar.add(bg, this.hpFill);
    // topo do boneco já inclinado para trás
    this.hpBar.position.set(0, this.height * Math.cos(MODEL_LEAN) + 0.14, this.height * Math.sin(MODEL_LEAN));
    this.root.add(this.hpBar);
  }

  private to(a: THREE.AnimationAction, fade: number): void {
    if (a === this.current) return;
    a.reset();
    a.setEffectiveWeight(1);
    a.play();
    this.current.crossFadeTo(a, fade, false);
    this.current = a;
  }

  private oneShot(name: ClipName, fade = 0.06): void {
    if (this.dyingT >= 0) return;
    this.to(this.actions[name], fade);
  }

  setFacing(fx: number, fy: number, instant = false): void {
    if (fx === 0 && fy === 0) return;
    this.targetYaw = facingToYaw(fx, fy);
    if (instant) this.yaw = this.targetYaw;
  }

  hit(): void {
    this.flash = VISUAL_CONFIG.unit.hitFlashTime;
    if (!this.hpLocked) this.hpVisible = true;
    // não interrompe golpe/magia: o tranco só entra se estiver parado ou andando
    if (this.current === this.base) this.oneShot('hit');
  }

  attack(style: 'swing' | 'heavy' = 'swing'): void {
    this.actionT = 0;
    this.actionDur = this.team === 'party' ? 0.55 : 0.4;
    this.oneShot(style === 'heavy' ? 'heavy' : 'attack');
  }

  cast(): void {
    this.actionT = 0;
    this.actionDur = 0.85;
    this.oneShot('cast');
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

  die(): void {
    this.hpBar.visible = false;
    this.to(this.actions.death, 0.08);
    this.dyingT = 0;
    for (const m of this.materials) {
      m.transparent = true;
    }
  }

  get dying(): boolean {
    return this.dyingT >= 0;
  }

  update(dt: number, moveT: number, hpFrac: number, camQuat: THREE.Quaternion): void {
    this.time += dt;
    // Virar suave para a direção da grade (caminho mais curto no círculo)
    let d = this.targetYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 12);
    this.model.rotation.y = this.yaw;

    // Andar ↔ parado (com pequena tolerância entre passos para não "piscar" o idle)
    const moving = moveT < 1;
    this.walkHold = moving ? 0.18 : Math.max(0, this.walkHold - dt);
    const wantBase = moving || this.walkHold > 0 ? this.actions.walk : this.actions.idle;
    if (this.dyingT < 0 && wantBase !== this.base) {
      const onBase = this.current === this.base;
      this.base = wantBase;
      if (onBase) this.to(wantBase, 0.2);
    }
    this.actions.walk.timeScale = this.def.walkRate;
    this.mixer.update(dt);

    // Capa: mola simples guiada pela velocidade + brisa (camada física por cima da animação)
    if (this.capeBones.length) {
      const p = this.root.position;
      const speed = dt > 0 ? p.distanceTo(this.lastPos) / dt : 0;
      const acting = this.actionT >= 0 ? 0.35 : 0;
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
      const T = VISUAL_CONFIG.unit.deathTime * 1.6;
      const k = Math.min(1, this.dyingT / 0.5);
      const op = Math.max(0, 1 - Math.max(0, this.dyingT - T * 0.55) / (T * 0.45));
      this.u.uOpacity.value = op;
      this.u.uTint.value.setRGB(1 - k * 0.35, 1 - k * 0.45, 1 - k * 0.45);
      this.u.uRim.value = 0.4 * (1 - k);
      this.contact.material.opacity = 0.38 * op;
      this.mesh.castShadow = this.castsShadow && op > 0.5;
      if (this.spectre) this.spectre.visible = false;
      if (this.dyingT >= T) this.done = true;
      return;
    }

    // Espectro de combate: emana no preparo, pico no impacto, recolhe depois
    let ghost = 0;
    if (this.actionT >= 0) {
      this.actionT += dt;
      const a = Math.min(1, this.actionT / this.actionDur);
      ghost = a < 0.45 ? (a / 0.45) * 0.6 : a < 0.65 ? 0.6 + ((a - 0.45) / 0.2) * 0.4 : Math.max(0, 1 - (a - 0.65) / 0.35);
      if (this.actionT >= this.actionDur) this.actionT = -1;
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
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mesh);
    for (const m of this.materials) m.dispose();
    this.mesh.skeleton.dispose();
    this.contact.material.dispose(); // (a geometria é compartilhada entre as unidades)
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
