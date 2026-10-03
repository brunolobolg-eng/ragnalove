import * as THREE from 'three';
import { orbTexture } from './kit/vfxTextures';
import type { ParticleLayer } from './Particles';

const C_CORE = new THREE.Color(3, 1.6, 0.5);
const C_TRAIL = new THREE.Color(2.2, 0.7, 0.12);
const C_TRAIL_END = new THREE.Color(0.5, 0.08, 0.02);
const C_SMOKE = new THREE.Color(0.35, 0.32, 0.3);

/** Seta de Fogo do Mago: bola de fogo curta em arco leve do cajado até o alvo. */
export class FireBoltFX {
  readonly group = new THREE.Group();
  private readonly orb: THREE.Sprite;
  private t = 0;
  private readonly dur: number;
  done = false;

  constructor(
    private readonly from: THREE.Vector3,
    private readonly to: THREE.Vector3,
    private readonly particles: ParticleLayer,
  ) {
    this.dur = Math.max(0.12, from.distanceTo(to) * 0.045);
    this.orb = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: orbTexture(), color: C_CORE, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.orb.scale.setScalar(0.45);
    this.orb.renderOrder = 7;
    // sem PointLight própria: criar luzes em tempo real recompila shaders (engasgo)
    this.group.add(this.orb);
    this.group.position.copy(from);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const k = Math.min(1, this.t / this.dur);
    const p = this.from.clone().lerp(this.to, k);
    p.y += Math.sin(k * Math.PI) * 0.6;
    this.group.position.copy(p);
    this.particles.glow.emit({ pos: p, posJitter: 0.06, life: 0.25, size: 0.3, sizeEnd: 0.05, color: C_TRAIL, colorEnd: C_TRAIL_END, count: 3 });
    if (k >= 1) {
      this.particles.glow.emit({
        pos: p,
        posJitter: 0.1,
        velJitter: 2.2,
        vel: new THREE.Vector3(0, 1, 0),
        life: 0.35,
        size: 0.18,
        sizeEnd: 0.03,
        color: C_CORE,
        colorEnd: C_TRAIL_END,
        gravity: 3,
        drag: 2,
        count: 14,
      });
      this.particles.smoke.emit({ pos: p, posJitter: 0.1, vel: new THREE.Vector3(0, 0.6, 0), life: 0.6, size: 0.3, sizeEnd: 0.7, color: C_SMOKE, alpha: 0.35, count: 3 });
      this.dispose();
    }
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    (this.orb.material as THREE.SpriteMaterial).dispose();
    this.group.removeFromParent();
  }
}
