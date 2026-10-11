import * as THREE from 'three';
import { PACK_AURA, PACK_STREAM, type ElementVisual } from '../../../config/fx/efeitosPack';
import type { PackEffect, PackHost } from './packTypes';

/** Geometria da aura: cilindro aberto, criado uma vez e compartilhado por todas as auras. */
export const AURA_GEO = new THREE.CylinderGeometry(PACK_AURA.radius, PACK_AURA.radius, PACK_AURA.height, 24, 1, true);

/**
 * Aura em volta de uma unidade (escudo, buff, debuff): faixa cilíndrica com ruído que escorre para cima.
 * Acompanha a unidade enquanto dura, entra e sai com um fade.
 */
export class AuraFX implements PackEffect {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;

  constructor(
    private readonly host: PackHost,
    private readonly mat: THREE.ShaderMaterial,
    private readonly onRelease: () => void,
    private readonly target: THREE.Object3D,
    private readonly life: number,
    el: ElementVisual,
  ) {
    const u = mat.uniforms;
    u.uPrimary.value.set(el.core[0], el.core[1], el.core[2]);
    u.uSecondary.value.set(el.edge[0], el.edge[1], el.edge[2]);
    u.uTertiary.value.set(el.edge[0] * 0.5, el.edge[1] * 0.5, el.edge[2] * 0.5);
    u.uEmission.value = PACK_AURA.emission;
    u.uTime.value = 0;
    u.uTwist.value = PACK_AURA.twist;
    u.uScroll.value.set(PACK_AURA.scroll[0], PACK_AURA.scroll[1]);
    u.uWaviness.value = PACK_AURA.waviness;
    u.uAlpha.value = 0;
    const mesh = new THREE.Mesh(AURA_GEO, mat);
    mesh.position.y = PACK_AURA.height / 2;
    mesh.renderOrder = 2;
    this.group.add(mesh);
    host.track(this);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    this.group.position.set(this.target.position.x, 0, this.target.position.z);
    let alpha = 1;
    if (this.t < PACK_AURA.fadeIn) alpha = this.t / PACK_AURA.fadeIn;
    const restante = this.life - this.t;
    if (restante < PACK_AURA.fadeOut) alpha = Math.min(alpha, Math.max(0, restante / PACK_AURA.fadeOut));
    this.mat.uniforms.uTime.value = this.t;
    this.mat.uniforms.uAlpha.value = alpha;
    if (this.t >= this.life) this.dispose();
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    this.group.removeFromParent();
    this.onRelease();
    this.host.untrack(this);
  }
}

/**
 * Emissor contínuo em volta de uma unidade: cruzes de cura que sobem ou cristais de gelo que caem.
 * Só usa faíscas (sem material próprio), então cabe no orçamento de partículas.
 */
export class StreamFX implements PackEffect {
  /** Sem geometria: o emissor só solta faíscas na camada compartilhada. */
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private acc = 0;

  constructor(
    private readonly host: PackHost,
    private readonly target: THREE.Object3D,
    private readonly life: number,
    private readonly el: ElementVisual,
    /** Forma das partículas (cruz = 8, cristal = 9) e subida (negativa cai). */
    private readonly shape: number,
    private readonly rise: number,
  ) {
    host.track(this);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    if (this.t >= this.life) {
      this.dispose();
      return;
    }
    this.acc += dt * PACK_STREAM.rate * this.host.density();
    while (this.acc >= 1 && this.host.sparks.room > 0) {
      this.acc -= 1;
      this.spawn();
    }
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    this.host.untrack(this);
  }

  private spawn(): void {
    const a = Math.random() * Math.PI * 2;
    const r = PACK_STREAM.radius * Math.sqrt(Math.random());
    const up = this.rise * (0.6 + 0.8 * Math.random());
    this.host.sparks.emit({
      x: this.target.position.x + Math.cos(a) * r,
      y: 0.1 + Math.random() * PACK_STREAM.height,
      z: this.target.position.z + Math.sin(a) * r,
      vx: 0,
      vy: up,
      vz: 0,
      lift: 0,
      life: PACK_STREAM.life,
      size: PACK_STREAM.size * (0.7 + 0.6 * Math.random()),
      shape: this.shape,
      core: this.el.core,
      edge: this.el.edge,
      seed: Math.random(),
    });
  }
}
