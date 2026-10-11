import * as THREE from 'three';
import { PACK_RING, PACK_SLASH, type ElementVisual } from '../../../config/fx/efeitosPack';
import { VFX } from '../kit/vfxSettings';
import { QUAD_GEO } from './packPool';
import type { PackEffect, PackHost } from './packTypes';

/** Materiais de um golpe: fatia, flash e (opcional) anel. Devolvidos ao pool ao terminar. */
export interface SlashMaterials {
  slash: THREE.ShaderMaterial;
  flash: THREE.ShaderMaterial;
  ring?: THREE.ShaderMaterial;
}

/** Ease de saída com salto (o "pop" do Free Hit VFX): passa de 1 e volta, com a força do `overshoot`. */
function easeOutBack(p: number, overshoot: number): number {
  const c3 = overshoot + 1;
  const q = p - 1;
  return 1 + c3 * q * q * q + overshoot * q * q;
}

/**
 * Golpe em fatia (Free Hit VFX): textura do pacote que estoura com salto e se dissolve, com flash no centro,
 * faíscas do impacto e, se pedido, um anel de choque que se expande. Tudo billboard, virado para a câmera.
 */
export class SlashFX implements PackEffect {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private readonly slash: THREE.Mesh;
  private readonly flash: THREE.Mesh;
  private readonly ring?: THREE.Mesh;

  constructor(
    private readonly host: PackHost,
    private readonly mats: SlashMaterials,
    private readonly onRelease: () => void,
    pos: THREE.Vector3,
    el: ElementVisual,
    angle: number,
    ringSize = 0,
  ) {
    const s = mats.slash.uniforms;
    s.uColorA.value.set(el.slashCore[0], el.slashCore[1], el.slashCore[2]);
    s.uColorB.value.set(el.slashMain[0], el.slashMain[1], el.slashMain[2]);
    s.uDissolveEdge.value.set(el.slashAccent[0], el.slashAccent[1], el.slashAccent[2]);
    s.uAngleOffset.value = angle;
    s.uProgress.value = 0;
    this.slash = new THREE.Mesh(QUAD_GEO, mats.slash);
    this.slash.position.copy(pos);
    this.slash.renderOrder = 6;
    this.group.add(this.slash);

    const f = mats.flash.uniforms;
    f.uFlashColor.value.set(el.slashCore[0], el.slashCore[1], el.slashCore[2]);
    f.uProgress.value = 0;
    this.flash = new THREE.Mesh(QUAD_GEO, mats.flash);
    this.flash.position.copy(pos);
    this.flash.scale.setScalar(PACK_SLASH.flashSize);
    this.flash.renderOrder = 7;
    this.group.add(this.flash);

    if (mats.ring && ringSize > 0) {
      const r = mats.ring.uniforms;
      r.uRingColor.value.set(el.edge[0], el.edge[1], el.edge[2]);
      r.uHotColor.value.set(el.core[0], el.core[1], el.core[2]);
      r.uProgress.value = 0;
      this.ring = new THREE.Mesh(QUAD_GEO, mats.ring);
      this.ring.position.copy(pos);
      this.ring.scale.setScalar(ringSize);
      this.ring.renderOrder = 5;
      this.group.add(this.ring);
    }

    this.burstSparks(pos, el);
    host.track(this);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const p = Math.min(1, this.t / PACK_SLASH.life);
    const pop = PACK_SLASH.popFrom + (1 - PACK_SLASH.popFrom) * easeOutBack(p, PACK_SLASH.overshoot);
    this.slash.scale.setScalar(PACK_SLASH.size * pop);
    this.mats.slash.uniforms.uProgress.value = p;
    this.mats.flash.uniforms.uProgress.value = this.t;
    // "reduzir flashes" das Configurações atenua o clarão, como nos outros efeitos do jogo
    this.mats.flash.uniforms.uEmission.value = PACK_SLASH.flashEmission * VFX.flash;
    if (this.ring && this.mats.ring) {
      this.mats.ring.uniforms.uProgress.value = Math.min(1, this.t / PACK_RING.life);
    }
    const end = Math.max(PACK_SLASH.life, PACK_SLASH.flashLife, this.ring ? PACK_RING.life : 0);
    if (this.t >= end) this.dispose();
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    this.group.removeFromParent();
    this.onRelease();
    this.host.untrack(this);
  }

  /** Faíscas que saem do impacto em leque (velocidade e vida do Slash Crimson). */
  private burstSparks(pos: THREE.Vector3, el: ElementVisual): void {
    for (let i = 0; i < PACK_SLASH.sparkAmount; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = PACK_SLASH.sparkSpeed * (0.45 + 0.55 * Math.random());
      this.host.sparks.emit({
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: Math.cos(a) * v,
        vy: v * (0.2 + 0.5 * Math.random()),
        vz: Math.sin(a) * v,
        lift: el.lift,
        life: PACK_SLASH.sparkLife,
        size: PACK_SLASH.sparkSize * (0.6 + 0.6 * Math.random()),
        shape: el.sparkShape,
        core: el.core,
        edge: el.edge,
        seed: Math.random(),
      });
    }
  }
}
