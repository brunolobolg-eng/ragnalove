import * as THREE from 'three';
import { PACK_CIRCLE, type ElementVisual } from '../../../config/fx/efeitosPack';
import { CIRCLE_GEO } from './packPool';
import type { PackEffect, PackHost } from './packTypes';

/**
 * Círculo mágico no chão (Magic Circles 3D, CC BY 4.0): forma-se (o desenho fecha girando), segura e apaga.
 * Enquanto está formado, solta faíscas que sobem da borda, como o CPUParticles3D do Godot.
 */
export class MagicCircleFX implements PackEffect {
  readonly group = new THREE.Group();
  done = false;
  private readonly mesh: THREE.Mesh;
  /** 0 forma, 1 segura, 2 apaga. */
  private phase = 0;
  private t = 0;
  private age = 0;
  private emitAcc = 0;

  constructor(
    private readonly host: PackHost,
    private readonly mat: THREE.ShaderMaterial,
    private readonly onRelease: () => void,
    pos: THREE.Vector3,
    private readonly el: ElementVisual,
    private readonly radius: number,
    seed: number,
    /** Segundos mantido formado (padrão do pacote; magias longas passam o próprio tempo). */
    private readonly hold: number = PACK_CIRCLE.hold,
  ) {
    const u = mat.uniforms;
    u.uColor.value.set(el.core[0], el.core[1], el.core[2]);
    u.uEdge.value.set(el.edge[0], el.edge[1], el.edge[2]);
    u.uSides.value = el.sides;
    u.uTurb.value = el.turbulence;
    u.uSeed.value = seed;
    u.uAge.value = 0;
    u.uGrow.value = 0;
    u.uIntensity.value = 0;
    this.mesh = new THREE.Mesh(CIRCLE_GEO, mat);
    this.mesh.scale.set(radius, 1, radius);
    this.mesh.position.set(pos.x, PACK_CIRCLE.lift, pos.z);
    this.mesh.renderOrder = 3;
    this.group.add(this.mesh);
    host.track(this);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    this.age += dt * PACK_CIRCLE.speed;
    let grow = 1;
    let env = 1;
    if (this.phase === 0) {
      grow = Math.min(1, this.t / PACK_CIRCLE.appear);
      env = grow;
      if (this.t >= PACK_CIRCLE.appear) this.enter(1);
    } else if (this.phase === 1) {
      if (this.t >= this.hold) this.enter(2);
    } else {
      env = 1 - Math.min(1, this.t / PACK_CIRCLE.fade);
      if (this.t >= PACK_CIRCLE.fade) {
        this.dispose();
        return;
      }
    }
    const u = this.mat.uniforms;
    u.uAge.value = this.age;
    u.uGrow.value = grow;
    u.uIntensity.value = env;
    if (this.phase < 2) {
      // faíscas só enquanto o círculo está formado ou segurado (o Godot para de emitir ao apagar)
      this.emitAcc += dt * (PACK_CIRCLE.sparkAmount / PACK_CIRCLE.sparkLife) * this.host.density();
      while (this.emitAcc >= 1 && this.host.sparks.room > 0) {
        this.emitAcc -= 1;
        this.spawnSpark();
      }
    }
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    this.group.removeFromParent();
    this.onRelease();
    this.host.untrack(this);
  }

  private enter(phase: number): void {
    this.phase = phase;
    this.t = 0;
  }

  /** Faísca da borda: sai do anel (92% a 100% do raio), sobe com abertura de 12° e tamanho do elemento. */
  private spawnSpark(): void {
    const el = this.el;
    const inner = this.radius * PACK_CIRCLE.sparkRing * 0.92;
    const outer = this.radius * PACK_CIRCLE.sparkRing;
    const a = Math.random() * Math.PI * 2;
    const r = inner + (outer - inner) * Math.random();
    const up = PACK_CIRCLE.rise * el.rise * (0.5 + 0.5 * Math.random());
    const spread = Math.tan((Math.random() * 2 - 1) * ((12 * Math.PI) / 180));
    const b = Math.random() * Math.PI * 2;
    const size = el.sparkSize * Math.min(2, Math.max(0.6, this.radius / 1.5)) * (0.6 + 0.6 * Math.random());
    this.host.sparks.emit({
      x: this.mesh.position.x + Math.cos(a) * r,
      y: PACK_CIRCLE.lift + 0.05,
      z: this.mesh.position.z + Math.sin(a) * r,
      vx: Math.cos(b) * spread * up,
      vy: up,
      vz: Math.sin(b) * spread * up,
      lift: el.lift,
      life: PACK_CIRCLE.sparkLife,
      size,
      shape: el.sparkShape,
      core: el.core,
      edge: el.edge,
      seed: Math.random(),
    });
  }
}
