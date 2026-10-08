import * as THREE from 'three';
import { VISUAL_CONFIG } from '../../config/visualConfig';

type Mat = THREE.MeshStandardMaterial;

interface Rig {
  root: THREE.Group; // posição no mundo
  yaw: THREE.Group; // orientação
  body: THREE.Group; // respiração / quique / inclinação
  arm?: THREE.Group; // braço da arma
  glow?: Mat; // orbe do cajado / olhos
  glowBase: number;
  mats: Mat[];
}

function std(color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}): Mat {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...o });
}

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: Mat, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function baseRig(): Rig {
  const root = new THREE.Group();
  const yaw = new THREE.Group();
  const body = new THREE.Group();
  root.add(yaw);
  yaw.add(body);
  return { root, yaw, body, mats: [], glowBase: 0 };
}

function buildMage(): Rig {
  const r = baseRig();
  const robe = std(0x3a2466, { roughness: 0.85 });
  const trim = std(0xc9a24a, { metalness: 0.7, roughness: 0.35 });
  const skin = std(0xe0b392);
  const hat = std(0x2b1a4d, { roughness: 0.9 });
  const wood = std(0x5a3a22);
  const orb = std(0xff8a3a, { emissive: new THREE.Color(0xff6a1a), emissiveIntensity: 2.2, roughness: 0.2 });
  r.mats.push(robe, trim, skin, hat, wood, orb);
  add(r.body, new THREE.CylinderGeometry(0.17, 0.38, 0.85, 12), robe, 0, 0.43, 0);
  add(r.body, new THREE.TorusGeometry(0.36, 0.035, 6, 20).rotateX(Math.PI / 2), trim, 0, 0.06, 0);
  add(r.body, new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12), trim, 0, 0.62, 0);
  add(r.body, new THREE.SphereGeometry(0.16, 16, 12), skin, 0, 1.0, 0);
  add(r.body, new THREE.CylinderGeometry(0.34, 0.34, 0.03, 20), hat, 0, 1.12, 0);
  const cone = add(r.body, new THREE.ConeGeometry(0.2, 0.55, 14), hat, 0, 1.4, -0.03);
  cone.rotation.x = -0.25;
  const arm = new THREE.Group();
  arm.position.set(0.28, 0.78, 0.05);
  r.body.add(arm);
  add(arm, new THREE.CylinderGeometry(0.025, 0.03, 1.4, 6), wood, 0, 0.05, 0.08);
  add(arm, new THREE.SphereGeometry(0.09, 16, 12), orb, 0, 0.8, 0.08);
  r.arm = arm;
  r.glow = orb;
  r.glowBase = 2.2;
  return r;
}

function buildWarrior(): Rig {
  const r = baseRig();
  const steel = std(0x9aa3ad, { metalness: 0.9, roughness: 0.3 });
  const dark = std(0x2a2d33, { metalness: 0.6, roughness: 0.5 });
  const cloth = std(0x7a1f1f, { roughness: 0.9 });
  const gold = std(0xc9a24a, { metalness: 0.8, roughness: 0.3 });
  const blade = std(0xdfe6ee, { metalness: 1, roughness: 0.15, emissive: new THREE.Color(0x3355ff), emissiveIntensity: 0.25 });
  r.mats.push(steel, dark, cloth, gold, blade);
  add(r.body, new THREE.BoxGeometry(0.13, 0.42, 0.14), dark, -0.12, 0.21, 0);
  add(r.body, new THREE.BoxGeometry(0.13, 0.42, 0.14), dark, 0.12, 0.21, 0);
  add(r.body, new THREE.CylinderGeometry(0.26, 0.22, 0.25, 10), cloth, 0, 0.42, 0);
  add(r.body, new THREE.BoxGeometry(0.46, 0.42, 0.3), steel, 0, 0.72, 0);
  add(r.body, new THREE.BoxGeometry(0.48, 0.06, 0.32), gold, 0, 0.53, 0);
  add(r.body, new THREE.SphereGeometry(0.15, 12, 8).scale(1.1, 0.7, 1), steel, -0.3, 0.9, 0);
  add(r.body, new THREE.SphereGeometry(0.15, 12, 8).scale(1.1, 0.7, 1), steel, 0.3, 0.9, 0);
  add(r.body, new THREE.SphereGeometry(0.17, 16, 12), steel, 0, 1.08, 0);
  add(r.body, new THREE.BoxGeometry(0.22, 0.04, 0.05), dark, 0, 1.08, 0.15);
  add(r.body, new THREE.BoxGeometry(0.04, 0.18, 0.28), cloth, 0, 1.26, -0.02);
  // Escudo (braço esquerdo)
  const shield = add(r.body, new THREE.CylinderGeometry(0.28, 0.28, 0.05, 20).rotateX(Math.PI / 2), steel, -0.36, 0.7, 0.14);
  shield.rotation.y = -0.4;
  add(r.body, new THREE.SphereGeometry(0.06, 10, 8), gold, -0.38, 0.7, 0.19);
  // Braço da espada
  const arm = new THREE.Group();
  arm.position.set(0.34, 0.82, 0.02);
  r.body.add(arm);
  add(arm, new THREE.BoxGeometry(0.1, 0.34, 0.1), dark, 0, -0.14, 0);
  const sword = new THREE.Group();
  sword.position.set(0, -0.3, 0.05);
  sword.rotation.x = Math.PI / 2.2;
  arm.add(sword);
  add(sword, new THREE.BoxGeometry(0.035, 0.18, 0.035), dark, 0, 0, 0);
  add(sword, new THREE.BoxGeometry(0.2, 0.035, 0.05), gold, 0, 0.1, 0);
  add(sword, new THREE.BoxGeometry(0.07, 0.8, 0.018), blade, 0, 0.5, 0);
  r.arm = arm;
  return r;
}

function buildGrunt(): Rig {
  const r = baseRig();
  const hide = std(0x4d5a2c, { roughness: 0.8 });
  const leather = std(0x3b2a1c, { roughness: 0.9 });
  const bone = std(0xd9cfb4, { roughness: 0.6 });
  const eyes = std(0xff2a10, { emissive: new THREE.Color(0xff2200), emissiveIntensity: 3 });
  r.mats.push(hide, leather, bone, eyes);
  add(r.body, new THREE.SphereGeometry(0.26, 14, 10).scale(1, 1.1, 0.9), hide, 0, 0.42, 0);
  add(r.body, new THREE.CylinderGeometry(0.27, 0.24, 0.16, 10), leather, 0, 0.3, 0);
  add(r.body, new THREE.SphereGeometry(0.19, 14, 10), hide, 0, 0.72, 0.1);
  add(r.body, new THREE.SphereGeometry(0.035, 8, 6), eyes, -0.07, 0.75, 0.27);
  add(r.body, new THREE.SphereGeometry(0.035, 8, 6), eyes, 0.07, 0.75, 0.27);
  const h1 = add(r.body, new THREE.ConeGeometry(0.05, 0.2, 8), bone, -0.13, 0.9, 0.05);
  h1.rotation.z = 0.5;
  const h2 = add(r.body, new THREE.ConeGeometry(0.05, 0.2, 8), bone, 0.13, 0.9, 0.05);
  h2.rotation.z = -0.5;
  add(r.body, new THREE.BoxGeometry(0.1, 0.2, 0.1), leather, -0.12, 0.1, 0);
  add(r.body, new THREE.BoxGeometry(0.1, 0.2, 0.1), leather, 0.12, 0.1, 0);
  const arm = new THREE.Group();
  arm.position.set(0.27, 0.5, 0.05);
  r.body.add(arm);
  add(arm, new THREE.CylinderGeometry(0.05, 0.09, 0.45, 8), leather, 0, 0.05, 0.12).rotation.x = Math.PI / 2.5;
  r.body.rotation.x = 0.25; // postura curvada
  r.arm = arm;
  r.glow = eyes;
  r.glowBase = 3;
  r.root.scale.setScalar(0.9);
  return r;
}

const BUILDERS: Record<string, () => Rig> = { mage: buildMage, warrior: buildWarrior, grunt: buildGrunt };

/** Representação visual de uma unidade da simulação + animação procedural. */
export class UnitView {
  readonly rig: Rig;
  readonly root: THREE.Group;
  private readonly hpBar: THREE.Group;
  private readonly hpFill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private time = Math.random() * 10;
  private flash = 0;
  private actionT = -1; // ataque / cast em andamento
  private actionKind: 'attack' | 'cast' = 'attack';
  private dyingT = -1;
  private deathDir = 1;
  private yawTarget = 0;
  private hpShown = 1;
  private hpVisible: boolean;
  burning = 0;
  done = false;

  constructor(
    readonly kind: string,
    readonly team: 'party' | 'enemy',
  ) {
    this.rig = (BUILDERS[kind] ?? buildGrunt)();
    this.root = this.rig.root;
    this.hpVisible = team === 'party';

    this.hpBar = new THREE.Group();
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.hpFill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.66, 0.05).translate(0.33, 0, 0),
      new THREE.MeshBasicMaterial({ color: team === 'party' ? 0x4ee07a : 0xe0463a, depthWrite: false, transparent: true }),
    );
    this.hpFill.position.set(-0.33, 0, 0.001);
    this.hpBar.add(bg, this.hpFill);
    this.hpBar.position.y = kind === 'grunt' ? 1.25 : 1.75;
    this.hpBar.renderOrder = 10;
    bg.renderOrder = 10;
    this.hpFill.renderOrder = 11;
    this.hpBar.visible = this.hpVisible;
    this.root.add(this.hpBar);
  }

  setFacing(fx: number, fy: number, instant = false): void {
    if (fx === 0 && fy === 0) return;
    this.yawTarget = Math.atan2(fx, fy);
    if (instant) this.rig.yaw.rotation.y = this.yawTarget;
  }

  /** (sprites ignoram direção/gravidade do golpe) */
  hit(_info?: unknown): void {
    this.flash = VISUAL_CONFIG.unit.hitFlashTime;
    this.hpVisible = true;
  }

  /** Devolve o tempo até o impacto (0: sprites não adiam o dano). */
  attack(_style?: 'swing' | 'heavy', _opts?: unknown): number {
    this.actionT = 0;
    this.actionKind = 'attack';
    return 0;
  }

  cast(_opts?: unknown): number {
    this.actionT = 0;
    this.actionKind = 'cast';
    return 0;
  }

  die(_killer?: unknown): void {
    this.dyingT = 0;
    this.deathDir = Math.random() < 0.5 ? -1 : 1;
    this.hpBar.visible = false;
  }

  get dying(): boolean {
    return this.dyingT >= 0;
  }

  /** @param moving 0..1 progresso do passo atual (1 = parado) */
  update(dt: number, moveT: number, hpFrac: number, camQuat: THREE.Quaternion): void {
    this.time += dt;
    const r = this.rig;
    const moving = moveT < 1;

    // Giro suave até a direção alvo
    let dy = this.yawTarget - r.yaw.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    r.yaw.rotation.y += dy * Math.min(1, dt * 14);

    if (this.dyingT >= 0) {
      this.dyingT += dt;
      const T = VISUAL_CONFIG.unit.deathTime;
      const k = Math.min(1, this.dyingT / (T * 0.35));
      r.body.rotation.z = this.deathDir * k * 1.45;
      r.body.position.y = -Math.max(0, this.dyingT - T * 0.5) * 0.9;
      if (this.dyingT >= T) this.done = true;
      return;
    }

    // Idle (respiração) / andar (quique + balanço)
    const bob = moving ? Math.abs(Math.sin(moveT * Math.PI)) * 0.12 : Math.sin(this.time * 2.2) * 0.015;
    r.body.position.y = bob;
    r.body.rotation.z = moving ? Math.sin(moveT * Math.PI * 2) * 0.12 : 0;
    r.body.scale.y = 1 + (moving ? 0 : Math.sin(this.time * 2.2 + 1) * 0.012);

    // Ação
    if (r.arm) {
      let ax = 0;
      let ay = 0;
      if (this.actionT >= 0) {
        this.actionT += dt;
        const t = this.actionT;
        if (this.actionKind === 'attack') {
          if (this.kind === 'warrior') {
            // antecipação -> golpe largo -> recuperação
            const wind = Math.min(1, t / 0.06);
            const swing = THREE.MathUtils.clamp((t - 0.06) / 0.14, 0, 1);
            const rec = THREE.MathUtils.clamp((t - 0.3) / 0.25, 0, 1);
            ay = (wind * 1.2 - swing * 2.8) * (1 - rec);
            ax = -swing * 0.6 * (1 - rec);
            r.body.rotation.y = (wind * 0.3 - swing * 0.7) * (1 - rec);
            if (t > 0.55) this.actionT = -1;
          } else {
            const k = Math.sin(Math.min(1, t / 0.3) * Math.PI);
            ax = -k * 1.4;
            r.body.position.z = k * 0.15;
            if (t > 0.3) this.actionT = -1;
          }
        } else {
          const k = Math.sin(Math.min(1, t / 0.7) * Math.PI);
          ax = -k * 0.9;
          if (r.glow) r.glow.emissiveIntensity = r.glowBase * (1 + k * 3);
          if (t > 0.7) this.actionT = -1;
        }
      } else {
        r.body.rotation.y = 0;
        r.body.position.z = 0;
        if (r.glow) r.glow.emissiveIntensity = r.glowBase * (0.85 + 0.15 * Math.sin(this.time * 3));
      }
      r.arm.rotation.x = ax;
      r.arm.rotation.y = ay;
    }

    // Flash de dano (e brilho de queimadura)
    this.flash = Math.max(0, this.flash - dt);
    this.burning = Math.max(0, this.burning - dt);
    const f = this.flash / VISUAL_CONFIG.unit.hitFlashTime;
    for (const m of r.mats) {
      if (m === r.glow) continue;
      m.emissive.setRGB(f * 1.2 + this.burning * 0.6, f * 0.5 + this.burning * 0.15, f * 0.4);
    }

    // Barra de vida
    this.hpShown += (hpFrac - this.hpShown) * Math.min(1, dt * 10);
    this.hpFill.scale.x = Math.max(0.001, this.hpShown);
    this.hpBar.visible = this.hpVisible;
    this.hpBar.quaternion.copy(camQuat);
    // compensa a rotação/escala do pai
    const pq = new THREE.Quaternion();
    this.root.getWorldQuaternion(pq);
    this.hpBar.quaternion.premultiply(pq.invert());
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.root.removeFromParent();
  }
}
