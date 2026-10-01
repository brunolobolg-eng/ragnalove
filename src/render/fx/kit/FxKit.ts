import * as THREE from 'three';
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

let _glow: THREE.Texture | undefined;
function glowTex(): THREE.Texture {
  if (_glow) return _glow;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}
export { glowTex };

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
