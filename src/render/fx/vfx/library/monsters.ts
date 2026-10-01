import * as THREE from 'three';
import { ApplyForce, AxisAngleGenerator, CircleEmitter, ColorOverLife, ConeEmitter, FrameOverLife, PointEmitter, RandomQuatGenerator, RenderMode, Rotation3DOverLife, SizeOverLife, SpeedOverLife } from 'three.quarks';
import type { VfxDefinition } from '../VFXManager';
import { GRAVITY, additive, fade, burst, chipGeometry, chips, col, curve, cv, dust, iv, upright, v3, v4 } from './common';

export const MONSTERS: Record<string, VfxDefinition> = {
  /**
   * Morte de inimigo (camada extra sobre a fumaça/alma de sempre): anel de poeira rasteira
   * abrindo no chão e lascas sólidas (malha) saltando e caindo. `scale` = porte do inimigo.
   */
  enemyDeath: {
    category: 'monsters',
    build(k) {
      const g = new THREE.Group();
      const ring = k.system({
        duration: 0.2,
        looping: false,
        worldSpace: false,
        startLife: iv(0.55, 0.85),
        startSpeed: iv(1.2, 2.2),
        startSize: iv(0.35, 0.55),
        startRotation: iv(0, Math.PI * 2),
        startColor: col(0.42, 0.37, 0.32, 0.55),
        emissionOverTime: cv(0),
        emissionBursts: [burst(k.count(12))],
        shape: new CircleEmitter({ radius: 0.25, thickness: 0.2 }),
        material: dust(k),
        uTileCount: 4,
        vTileCount: 4,
        renderOrder: 5,
      });
      upright(ring.emitter);
      ring.emitter.position.y = 0.12;
      ring.addBehavior(new SpeedOverLife(curve(1, 0.4, 0.15, 0.05)));
      ring.addBehavior(new SizeOverLife(curve(0.6, 1.1, 1.5, 1.8)));
      ring.addBehavior(new ColorOverLife(fade(v4(1, 1, 1, 1), v4(1, 1, 1, 0))));
      ring.addBehavior(new FrameOverLife(curve(0, 5, 10, 15)));
      const bits = k.system({
        duration: 0.1,
        looping: false,
        worldSpace: true,
        startLife: iv(0.45, 0.6),
        startSpeed: iv(2.4, 4.2),
        startSize: iv(0.06, 0.12),
        startRotation: new RandomQuatGenerator(),
        startColor: col(1, 1, 1, 1),
        emissionOverTime: cv(0),
        emissionBursts: [burst(k.count(6))],
        shape: new ConeEmitter({ radius: 0.2, angle: 0.7, thickness: 1 }),
        material: chips(k, 'flesh', 0x4a3a32),
        instancingGeometry: chipGeometry('shard'),
        renderMode: RenderMode.Mesh,
        renderOrder: 4,
      });
      upright(bits.emitter);
      bits.emitter.position.y = 0.5;
      bits.addBehavior(new ApplyForce(GRAVITY, cv(13)));
      bits.addBehavior(new Rotation3DOverLife(new AxisAngleGenerator(v3(0.6, 0.8, 0), iv(-12, 12))));
      bits.addBehavior(new SizeOverLife(curve(1, 1, 0.8, 0)));
      g.add(ring.emitter, bits.emitter);
      return g;
    },
  },

  /** Entrada do chefe: coluna de riscos roxos subindo, anel escuro no chão e brasas pairando. */
  bossSpawn: {
    category: 'monsters',
    build(k) {
      const g = new THREE.Group();
      const pillar = k.system({
        duration: 1.0,
        looping: false,
        worldSpace: false,
        startLife: iv(0.5, 0.9),
        startSpeed: iv(5, 9),
        startSize: iv(0.08, 0.16),
        startColor: col(1.6, 0.35, 2.6, 1),
        emissionOverTime: cv(k.count(90)),
        shape: new ConeEmitter({ radius: 1.1, angle: 0.05, thickness: 1 }),
        material: additive(k, 'spark'),
        renderMode: RenderMode.StretchedBillBoard,
        speedFactor: 1.1,
        renderOrder: 8,
      });
      upright(pillar.emitter);
      pillar.addBehavior(new SpeedOverLife(curve(1, 0.9, 0.6, 0.2)));
      pillar.addBehavior(new ColorOverLife(fade(v4(1, 1, 1, 1), v4(0.4, 0.1, 0.8, 0))));
      const ring = k.system({
        duration: 0.6,
        looping: false,
        worldSpace: false,
        startLife: cv(1.1),
        startSpeed: cv(0),
        startSize: cv(5.5),
        startColor: col(1.4, 0.2, 2.2, 1),
        emissionOverTime: cv(0),
        emissionBursts: [burst(1, 0), burst(1, 0.35)],
        shape: new PointEmitter(),
        material: additive(k, 'ring'),
        renderMode: RenderMode.HorizontalBillBoard,
        renderOrder: 7,
      });
      ring.emitter.position.y = 0.06;
      ring.addBehavior(new SizeOverLife(curve(0.15, 0.7, 0.95, 1)));
      ring.addBehavior(new ColorOverLife(fade(v4(1, 1, 1, 1), v4(0.5, 0.2, 1, 0))));
      const embers = k.system({
        duration: 1.2,
        looping: false,
        worldSpace: true,
        startLife: iv(1.0, 1.6),
        startSpeed: iv(0.3, 1.2),
        startSize: iv(0.07, 0.14),
        startColor: col(2.2, 0.5, 2.8, 1),
        emissionOverTime: cv(k.count(40)),
        shape: new CircleEmitter({ radius: 1.6, thickness: 1 }),
        material: additive(k, 'soft'),
        renderOrder: 8,
      });
      upright(embers.emitter);
      embers.addBehavior(new ApplyForce(v3(0, 1, 0), cv(1.2)));
      embers.addBehavior(new SizeOverLife(curve(0.4, 1, 0.8, 0)));
      g.add(pillar.emitter, ring.emitter, embers.emitter);
      return g;
    },
  },
};
