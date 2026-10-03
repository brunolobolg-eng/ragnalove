import * as THREE from 'three';
import { flashTexture } from './vfxTextures';
import type { Stage } from '../../Stage';
import type { ParticleLayer } from '../Particles';
import type { DecalLayer } from './Decals';
import type { RibbonPool } from './Ribbons';
import { VFX } from './vfxSettings';

/** Tudo que um efeito precisa, entregue pelo GameView. */
export interface FxKit {
  stage: Stage;
  particles: ParticleLayer;
  ribbons: RibbonPool;
  decals: DecalLayer;
  /** Congela o visual por alguns frames no impacto (não afeta a simulação). */
  hitStop(seconds: number): void;
}

/** Efeito "de uma vez" controlado pelo GameView. */
export interface OneShotFx {
  group: THREE.Group;
  update(dt: number): void;
  done: boolean;
}

/**
 * Luz pontual do pool do Stage com tremulação. Se o orçamento de luzes do preset acabou,
 * o efeito segue só com brilho aditivo (sem luz real) — é assim que as hordas ficam leves.
 */
export class FlickerLight {
  private light?: THREE.PointLight;
  private t = Math.random() * 10;
  intensity: number;
  constructor(
    private readonly stage: Stage,
    color: THREE.ColorRepresentation,
    intensity: number,
    distance: number,
    private readonly flicker = 0.25,
  ) {
    this.intensity = intensity;
    this.light = stage.acquireLight(color);
    if (this.light) {
      this.light.distance = distance;
      this.light.decay = 1.6;
    }
  }
  get active(): boolean {
    return !!this.light;
  }
  set(pos: THREE.Vector3): void {
    this.light?.position.copy(pos);
  }
  update(dt: number, k = 1): void {
    if (!this.light) return;
    this.t += dt;
    const f = 1 - this.flicker * 0.5 + (Math.sin(this.t * 17) * 0.5 + Math.sin(this.t * 7.3 + 1.3) * 0.5) * this.flicker * 0.5;
    this.light.intensity = this.intensity * k * f;
  }
  release(): void {
    if (this.light) this.stage.releaseLight(this.light);
    this.light = undefined;
  }
}

/** Brilho de flash (sprite aditivo que estoura e some), respeita "reduzir flashes". */
export class Flash {
  readonly sprite: THREE.Sprite;
  private t = 0;
  done = false;
  constructor(
    parent: THREE.Object3D,
    pos: THREE.Vector3,
    color: THREE.Color,
    private readonly size: number,
    private readonly life = 0.18,
  ) {
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex(), color: color.clone().multiplyScalar(VFX.flash), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }),
    );
    this.sprite.position.copy(pos);
    this.sprite.renderOrder = 9;
    this.sprite.scale.setScalar(size * 0.6);
    parent.add(this.sprite);
  }
  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const k = this.t / this.life;
    if (k >= 1) {
      this.done = true;
      this.sprite.removeFromParent();
      this.sprite.material.dispose();
      return;
    }
    this.sprite.scale.setScalar(this.size * (0.6 + k * 0.6));
    this.sprite.material.opacity = (1 - k) * (1 - k);
  }
}

/** Clarão do Kenney (mantém o nome antigo para quem importa). */
export const glowTex = flashTexture;

/** Linha do tempo simples: agenda callbacks em segundos a partir do início do efeito. */
export class Timeline {
  private t = 0;
  private readonly cues: { at: number; fn: () => void; fired: boolean }[] = [];
  at(sec: number, fn: () => void): this {
    this.cues.push({ at: sec, fn, fired: false });
    return this;
  }
  get time(): number {
    return this.t;
  }
  update(dt: number): void {
    this.t += dt;
    for (const c of this.cues)
      if (!c.fired && this.t >= c.at) {
        c.fired = true;
        c.fn();
      }
  }
}
