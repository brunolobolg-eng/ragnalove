import * as THREE from 'three';
import { VISUAL_CONFIG } from '../../config/visualConfig';
import { softCircle } from '../textures';
import { createGhostMaterial, createShadowMaterial, createSpriteMaterial } from './spriteMaterials';

/**
 * Unidade desenhada como sprite 2D pintado (estilo MMO isométrico clássico):
 * plano sempre de frente para a câmera, âncora nos pés, sombra oval no chão.
 * Direções: pose de frente / de costas + espelhamento horizontal (como os 8 lados
 * dos sprites clássicos, reduzidos a 2 vistas espelhadas).
 * Animação procedural por cima dos quadros (respirar, quicar, avanço, queda).
 */

export interface SpriteFrame {
  url: string;
  /** Vista da pose: de frente para a câmera ou de costas. */
  view: 'front' | 'back';
  /** Para que lado da tela o personagem está virado nessa pose (define o espelho). */
  facesLeft: boolean;
}

export interface SpriteDef {
  /** Altura em unidades de mundo (1 = um tile) da pose "front"; as outras mantêm a mesma escala de pixel. */
  height: number;
  front: SpriteFrame;
  back: SpriteFrame;
  action: SpriteFrame;
  /** Sequências de quadros opcionais; o que faltar cai na animação por deformação. */
  anims?: Partial<Record<AnimName, SpriteAnim>>;
}

export type AnimName = 'walk' | 'attack' | 'death';

export interface SpriteAnim {
  frames: string[];
  view: 'front' | 'back';
  facesLeft: boolean;
  /** Quadros por segundo (walk/death); o ataque se ajusta à duração da ação. */
  fps?: number;
}

const seq = (prefix: string, n: number, view: 'front' | 'back', facesLeft: boolean, fps?: number): SpriteAnim => ({
  frames: Array.from({ length: n }, (_, i) => `sprites/${prefix}${i}.png`),
  view,
  facesLeft,
  fps,
});

const f = (name: string, view: 'front' | 'back', facesLeft: boolean): SpriteFrame => ({
  url: `sprites/${name}.png`,
  view,
  facesLeft,
});

export const SPRITES: Record<string, SpriteDef> = {
  mage: {
    height: 1.75,
    front: f('mage_front', 'front', true),
    back: f('mage_back', 'back', false),
    action: f('mage_action', 'front', true),
    anims: { attack: seq('mage_cast', 4, 'back', true) },
  },
  warrior: {
    height: 1.85,
    front: f('warrior_front', 'front', true),
    back: f('warrior_back', 'back', false),
    action: f('warrior_action', 'back', true),
    anims: { attack: seq('warrior_attack', 4, 'back', true) },
  },
  /** Monstro da horda: menor que a party, silhueta simples para leitura em massa. */
  grunt: {
    height: 1.3,
    front: f('grunt_front', 'front', true),
    back: f('grunt_back', 'back', false),
    action: f('grunt_action', 'front', true),
    anims: {
      walk: seq('grunt_walk', 4, 'front', true, 7),
      attack: seq('grunt_attack', 4, 'front', true),
      death: seq('grunt_death', 4, 'front', true, 6),
    },
  },
};
// Variantes da ponte no modo "Sprites 2D": mesmo desenho do zumbi comum em outra escala.
SPRITES.runner = { ...SPRITES.grunt, height: 1.15 };
SPRITES.brute = { ...SPRITES.grunt, height: 1.65 };
SPRITES.boss = { ...SPRITES.grunt, height: 2.4 };

/** Âncoras dos pés geradas por scripts/process_sprites.py. */
let META: Record<string, { anchorX: number }> = {};
fetch('sprites/meta.json')
  .then((r) => (r.ok ? r.json() : {}))
  .then((m) => (META = m))
  .catch(() => undefined);

const loader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();
function tex(url: string): THREE.Texture {
  let t = texCache.get(url);
  if (!t) {
    t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    texCache.set(url, t);
  }
  return t;
}

// Plano subdividido na vertical para o balanço de cabelo/capa no vertex shader.
const unitPlane = new THREE.PlaneGeometry(1, 1, 1, 10).translate(0, 0.5, 0);
const groundPlane = unitPlane.clone().rotateX(-Math.PI / 2);

/** Direção da luz do sol no plano do chão (a sombra cai para o lado oposto). */
const SUN_DIR = new THREE.Vector2(-7, 9).normalize();
const SHADOW_YAW = Math.atan2(SUN_DIR.x, SUN_DIR.y); // gira o "para cima" do sprite para longe do sol

/** Cor do espectro por personagem (azul-esverdeado sobrenatural / azul arcano). */
const GHOST_COLOR: Record<string, THREE.Color> = {
  warrior: new THREE.Color(0.35, 1.25, 1.0),
  mage: new THREE.Color(0.55, 0.8, 1.6),
};

export class SpriteUnitView {
  /** Câmera usada para o billboard em pé (definida pelo GameView). */
  static camera: THREE.Camera | undefined;
  readonly root = new THREE.Group();
  private readonly billboard = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly castShadowMesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly contact: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly ghosts: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
  private readonly hpBar = new THREE.Group();
  private readonly hpFill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly def: SpriteDef;
  private time = Math.random() * 10;
  private flash = 0;
  private actionT = -1;
  private actionDur = 0.35;
  private dyingT = -1;
  private walkPhase = 0;
  private wasMoving = false;
  private landT = 0;
  private absorbT = 0;
  private levelT = 0;
  private facing = { x: 0, y: 1 };
  private hpShown = 1;
  /** Inimigos só mostram a barra depois de levar dano (menos poluição na horda). */
  private hpVisible: boolean;
  burning = 0;
  done = false;

  constructor(
    readonly kind: string,
    readonly team: 'party' | 'enemy',
  ) {
    this.def = SPRITES[kind];
    this.hpVisible = team === 'party';
    // Pré-carrega os quadros das sequências.
    for (const a of Object.values(this.def.anims ?? {})) a?.frames.forEach((u) => tex(u));
    const phase = Math.random() * 6.28;
    this.mesh = new THREE.Mesh(unitPlane, createSpriteMaterial(phase));
    // Monstros balançam menos (horda legível); a party tem capa/cabelo mais vivos.
    this.mesh.material.uniforms.uSway.value = team === 'party' ? 1.2 : 0.6;
    this.mesh.renderOrder = 2;
    this.body.add(this.mesh);
    this.billboard.add(this.body);
    this.root.add(this.billboard);

    // Espectro de combate (só party): duas camadas aditivas, uma "atrasada" como rastro.
    const gc = GHOST_COLOR[kind];
    if (team === 'party' && gc) {
      for (let i = 0; i < 2; i++) {
        const g = new THREE.Mesh(unitPlane, createGhostMaterial(gc.clone().multiplyScalar(i ? 0.6 : 1)));
        g.material.uniforms.uPhase.value = phase + i;
        g.renderOrder = 6;
        g.visible = false;
        this.body.add(g);
        this.ghosts.push(g);
      }
    }

    // Sombra projetada com a silhueta do sprite, caindo para longe do sol...
    this.castShadowMesh = new THREE.Mesh(groundPlane, createShadowMaterial());
    this.castShadowMesh.material.uniforms.uPhase.value = phase;
    this.castShadowMesh.position.y = 0.012;
    this.castShadowMesh.rotation.y = SHADOW_YAW;
    this.castShadowMesh.renderOrder = 1;
    this.root.add(this.castShadowMesh);
    // ...e uma sombra de contato pequena e escura bem embaixo dos pés.
    this.contact = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: softCircle(), color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false }),
    );
    this.contact.scale.set(0.55, 1, 0.3);
    this.contact.position.y = 0.014;
    this.root.add(this.contact);

    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.hpFill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.66, 0.05).translate(0.33, 0, 0),
      new THREE.MeshBasicMaterial({ color: team === 'party' ? 0x4ee07a : 0xe0463a, depthWrite: false, transparent: true }),
    );
    this.hpFill.position.set(-0.33, 0, 0.001);
    bg.renderOrder = 10;
    this.hpFill.renderOrder = 11;
    this.hpBar.add(bg, this.hpFill);
    this.root.add(this.hpBar);
  }

  setFacing(fx: number, fy: number, _instant = false): void {
    if (fx === 0 && fy === 0) return;
    this.facing = { x: fx, y: fy };
  }

  hit(): void {
    this.flash = VISUAL_CONFIG.unit.hitFlashTime;
    this.hpVisible = true;
  }

  attack(): void {
    this.actionT = 0;
    // Party: golpe um pouco mais longo para o espectro "vestir" o momento (só visual).
    this.actionDur = this.team === 'party' ? 0.5 : 0.35;
  }

  cast(): void {
    this.actionT = 0;
    this.actionDur = 0.8;
  }

  /** Aura dourada de subida de nível. */
  levelUp(): void {
    this.levelT = 1.4;
  }

  /** Brilho curto quando uma alma roubada chega ao herói. */
  absorb(): void {
    this.absorbT = 0.3;
  }

  die(): void {
    this.dyingT = 0;
    this.hpBar.visible = false;
    this.mesh.material.transparent = true;
    this.mesh.material.depthWrite = false;
    this.mesh.material.needsUpdate = true;
  }

  get dying(): boolean {
    return this.dyingT >= 0;
  }

  update(dt: number, moveT: number, hpFrac: number, camQuat: THREE.Quaternion): void {
    this.time += dt;
    const U = this.mesh.material.uniforms;
    // Billboard "em pé": gira só no eixo Y (não inclina para trás e não invade a casa
    // vizinha) e estica na vertical para compensar a inclinação da câmera.
    let stretch = 1;
    const cam = SpriteUnitView.camera;
    if (cam) {
      const p = this.root.getWorldPosition(new THREE.Vector3());
      const dx = cam.position.x - p.x;
      const dz = cam.position.z - p.z;
      this.billboard.rotation.set(0, Math.atan2(dx, dz), 0);
      stretch = 1 / Math.max(0.35, Math.cos(Math.atan2(cam.position.y - p.y, Math.hypot(dx, dz))));
    }
    this.hpBar.quaternion.copy(camQuat);
    this.hpBar.visible = this.hpVisible && this.dyingT < 0;
    this.hpBar.position.y = (this.def.height + 0.12) * stretch;
    const moving = moveT < 1;

    // Escolha do quadro: a pose de ação só entra se for da mesma vista (frente/costas)
    // em que a unidade está; senão a vista atual "pulsa" (squash) durante a ação.
    const acting = this.actionT >= 0;
    const backView = this.facing.y < 0;
    const viewFrame = backView ? this.def.back : this.def.front;
    let frame: { url: string; facesLeft: boolean } =
      acting && this.def.action.view === viewFrame.view ? this.def.action : viewFrame;
    // Sequências de quadros têm prioridade: morte > ataque > caminhada.
    const A = this.def.anims;
    let framed = false;
    const pick = (a: SpriteAnim | undefined, idx: number): boolean => {
      if (!a || !a.frames.length) return false;
      const url = a.frames[Math.min(a.frames.length - 1, Math.max(0, idx))];
      // Só usa o quadro se a imagem já carregou (arquivo ausente => cai na animação antiga).
      if (!((tex(url).image as HTMLImageElement | undefined)?.width)) return false;
      frame = { url, facesLeft: a.facesLeft };
      return true;
    };
    if (this.dyingT >= 0 && A?.death) {
      framed = pick(A.death, Math.floor(this.dyingT * (A.death.fps ?? 8)));
    } else if (acting && A?.attack && A.attack.view === viewFrame.view) {
      framed = pick(A.attack, Math.floor((this.actionT / this.actionDur) * A.attack.frames.length));
    } else if (moving && A?.walk && A.walk.view === viewFrame.view) {
      this.walkPhase += dt * (A.walk.fps ?? 8);
      framed = pick(A.walk, Math.floor(this.walkPhase) % A.walk.frames.length);
    }
    const t = tex(frame.url);
    const img = t.image as HTMLImageElement | undefined;
    const ref = tex(this.def.front.url).image as HTMLImageElement | undefined;
    const pxToWorld = ref && ref.height ? this.def.height / ref.height : 0;
    const wWorld = img && img.width && pxToWorld ? img.width * pxToWorld : this.def.height * 0.6;
    const hWorld = img && img.height && pxToWorld ? img.height * pxToWorld : this.def.height;
    const wantsLeft = this.facing.x < 0;
    const flip = this.facing.x !== 0 && wantsLeft !== frame.facesLeft ? -1 : 1;
    const name = frame.url.replace(/^.*\/|\.png$/g, '');
    const anchorX = META[name]?.anchorX ?? 0.5;
    this.mesh.position.x = (0.5 - anchorX) * wWorld * flip;

    // Uniforms comuns (mesma textura no sprite, na sombra e no espectro).
    const texel = img && img.width ? U.uTexel.value.set(1 / img.width, 1 / img.height) : U.uTexel.value;
    U.map.value = t;
    U.uTime.value = this.time;
    // A luz vem de cima-esquerda da tela; com o sprite espelhado, inverte no espaço UV.
    U.uLight.value.set(-0.7 * flip, 0.7);
    const S = this.castShadowMesh.material.uniforms;
    S.map.value = t;
    S.uTime.value = this.time;
    S.uTexel.value.copy(texel);
    this.castShadowMesh.scale.set(wWorld * flip, 1, hWorld * 0.55);
    this.castShadowMesh.position.x = this.mesh.position.x * 0.5;

    if (this.dyingT >= 0) {
      this.dyingT += dt;
      // Com quadros de morte, espera o corpo cair antes de desvanecer.
      const T = VISUAL_CONFIG.unit.deathTime * (framed ? 1.7 : 1);
      const k = Math.min(1, this.dyingT / (T * 0.3));
      // Com quadros de morte, o próprio desenho cai; senão, tomba o sprite.
      this.body.rotation.z = framed ? 0 : -flip * k * 1.35;
      if (framed) {
        this.mesh.scale.set(wWorld * flip, hWorld * stretch, 1);
        this.body.position.y = 0;
      }
      const op = Math.max(0, 1 - Math.max(0, this.dyingT - T * 0.45) / (T * 0.55));
      U.uOpacity.value = op;
      U.uTint.value.setRGB(1 - k * 0.3, 1 - k * 0.45, 1 - k * 0.45);
      U.uRim.value = 0.55 * (1 - k);
      S.uOpacity.value = 0.32 * op * (1 - k * 0.6);
      this.contact.material.opacity = 0.42 * op;
      for (const g of this.ghosts) g.visible = false;
      if (this.dyingT >= T) this.done = true;
      return;
    }

    // Idle: respiração sutil. Andando: quique + balanço. Ao parar: "peso" do pouso.
    let sy = 1 + Math.sin(this.time * 2.4) * 0.018;
    let sx = 1 - Math.sin(this.time * 2.4) * 0.01;
    let lift = 0;
    let roll = 0;
    if (moving) {
      lift = Math.abs(Math.sin(moveT * Math.PI)) * (framed ? 0.03 : 0.1);
      roll = framed ? 0 : Math.sin(moveT * Math.PI * 2) * 0.06;
    }
    if (this.wasMoving && !moving) this.landT = 0.16;
    this.wasMoving = moving;
    if (this.landT > 0) {
      this.landT = Math.max(0, this.landT - dt);
      const l = Math.sin((1 - this.landT / 0.16) * Math.PI);
      sy *= 1 - l * 0.07;
      sx *= 1 + l * 0.05;
    }
    let ghost = 0;
    if (acting) {
      this.actionT += dt;
      const a = Math.min(1, this.actionT / this.actionDur);
      const pop = Math.sin(a * Math.PI);
      sy *= 1 + pop * 0.06;
      sx *= 1 + pop * 0.08;
      lift += pop * 0.05;
      // Envelope do espectro: emana no preparo, pico no impacto, recolhe na recuperação.
      ghost = a < 0.45 ? (a / 0.45) * 0.6 : a < 0.65 ? 0.6 + ((a - 0.45) / 0.2) * 0.4 : Math.max(0, 1 - (a - 0.65) / 0.35);
      if (this.actionT >= this.actionDur) this.actionT = -1;
    }
    this.mesh.scale.set(wWorld * sx * flip, hWorld * sy * stretch, 1);
    this.body.position.y = lift * stretch;
    this.body.rotation.z = roll;
    const shadowK = 1 - lift * 0.8;
    this.contact.scale.set(0.55 * shadowK, 1, 0.3 * shadowK);
    S.uOpacity.value = 0.32 * shadowK;

    // Espectro: mesma silhueta, maior, subindo levemente, com contorno brilhante.
    for (let i = 0; i < this.ghosts.length; i++) {
      const g = this.ghosts[i];
      const lag = i === 0 ? ghost : ghost * 0.7;
      g.visible = lag > 0.01;
      if (!g.visible) continue;
      const G = g.material.uniforms;
      G.map.value = t;
      G.uTexel.value.copy(texel);
      G.uTime.value = this.time;
      G.uIntensity.value = lag * (i === 0 ? 1 : 0.55);
      G.uGrow.value = lag * (i === 0 ? 0.16 : 0.3);
      g.position.set(this.mesh.position.x + (i === 0 ? 0 : -0.06 * flip), lag * 0.05, 0.02 + i * 0.01);
      g.scale.copy(this.mesh.scale);
    }

    // Flash de dano (clareia), queimadura (alaranjado), absorção de alma (ciano).
    this.flash = Math.max(0, this.flash - dt);
    this.burning = Math.max(0, this.burning - dt);
    this.absorbT = Math.max(0, this.absorbT - dt);
    const f = this.flash / VISUAL_CONFIG.unit.hitFlashTime;
    const ab = this.absorbT / 0.3;
    this.levelT = Math.max(0, this.levelT - dt);
    const lv = Math.min(1, this.levelT / 0.6) * (0.75 + 0.25 * Math.sin(this.time * 18));
    U.uTint.value.setRGB(
      1 + f * 1.2 + this.burning * 0.5 + ab * 0.2 + lv * 0.55,
      1 + f * 0.4 + this.burning * 0.15 + ab * 0.6 + lv * 0.4,
      1 + f * 0.4 + ab * 0.55 + lv * 0.05,
    );
    U.uRim.value = 0.55 + ghost * 0.6 + ab * 0.8 + lv * 1.6;
    U.uRimColor.value.setRGB(1.0, 0.9 - ab * 0.1, 0.7 - lv * 0.3);

    this.hpShown += (hpFrac - this.hpShown) * Math.min(1, dt * 10);
    this.hpFill.scale.x = Math.max(0.001, this.hpShown);
  }

  /** Posição de mundo aproximada do peito (alvo das almas). */
  chestWorld(out = new THREE.Vector3()): THREE.Vector3 {
    this.root.getWorldPosition(out);
    out.y += this.def.height * 0.9;
    return out;
  }

  dispose(): void {
    this.mesh.material.dispose();
    this.castShadowMesh.material.dispose();
    this.contact.material.dispose();
    this.contact.geometry.dispose();
    for (const g of this.ghosts) g.material.dispose();
    this.hpBar.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.root.removeFromParent();
  }
}
