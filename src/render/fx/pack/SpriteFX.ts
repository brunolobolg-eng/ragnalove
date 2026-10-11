import * as THREE from 'three';
import { PACK_SPRITE, type ElementVisual } from '../../../config/fx/efeitosPack';
import { QUAD_GEO } from './packPool';
import type { PackEffect, PackHost } from './packTypes';

/**
 * Brilho de buff (texturas do Buff Pickup VFX Lite): um quadro de frente para a câmera que cresce e some
 * sobre o corpo da unidade, tingido pela cor do elemento.
 */
export class SpriteFX implements PackEffect {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private readonly mesh: THREE.Mesh;

  constructor(
    private readonly host: PackHost,
    private readonly mat: THREE.ShaderMaterial,
    private readonly onRelease: () => void,
    pos: THREE.Vector3,
    el: ElementVisual,
    private readonly life: number,
    private readonly size: number,
  ) {
    const u = mat.uniforms;
    u.uTint.value.set(el.core[0], el.core[1], el.core[2]);
    u.uEmission.value = PACK_SPRITE.emission;
    u.uAlpha.value = 0;
    this.mesh = new THREE.Mesh(QUAD_GEO, mat);
    this.mesh.position.copy(pos);
    this.mesh.scale.setScalar(size * PACK_SPRITE.growFrom);
    this.mesh.renderOrder = 6;
    this.group.add(this.mesh);
    host.track(this);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const p = Math.min(1, this.t / this.life);
    // cresce depressa no começo e desacelera (saída suave)
    const cresce = 1 - (1 - p) * (1 - p) * (1 - p);
    this.mesh.scale.setScalar(this.size * (PACK_SPRITE.growFrom + (1 - PACK_SPRITE.growFrom) * cresce));
    const entrada = Math.min(1, this.t / PACK_SPRITE.fadeIn);
    this.mat.uniforms.uAlpha.value = entrada * (1 - p * p);
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
