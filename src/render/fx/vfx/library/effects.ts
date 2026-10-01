import * as THREE from 'three';
import { ApplyForce, ColorOverLife, ConeEmitter, PointEmitter, RenderMode, SizeOverLife, SpeedOverLife } from 'three.quarks';
import type { VfxDefinition } from '../VFXManager';
import { GRAVITY, additive, fade, burst, col, curve, cv, iv, v4 } from './common';

/**
 * Faíscas de impacto: riscos esticados na direção do voo (o sistema de partículas antigo só
 * tinha pontos redondos) + um clarão curto. Saem para o lado oposto de quem bateu.
 */
function hitSpark(hot: [number, number, number], tail: [number, number, number], sparks: number): VfxDefinition {
  return {
    category: 'effects',
    build(k) {
      const g = new THREE.Group();
      const streaks = k.system({
        duration: 0.2,
        looping: false,
        worldSpace: true,
        startLife: iv(0.14, 0.3),
        startSpeed: iv(3.5, 7.5),
        startSize: iv(0.045, 0.085),
        startColor: col(1, 1, 1, 1),
        emissionOverTime: cv(0),
        emissionBursts: [burst(k.count(sparks))],
        shape: new ConeEmitter({ radius: 0.05, angle: 0.75, thickness: 1 }),
        material: additive(k, 'spark'),
        renderMode: RenderMode.StretchedBillBoard,
        speedFactor: 1.2,
        renderOrder: 8,
      });
      streaks.addBehavior(new ApplyForce(GRAVITY, cv(9)));
      streaks.addBehavior(new SpeedOverLife(curve(1, 0.55, 0.3, 0.15)));
      streaks.addBehavior(new ColorOverLife(fade(v4(hot[0], hot[1], hot[2], 1), v4(tail[0], tail[1], tail[2], 0))));
      const flash = k.system({
        duration: 0.1,
        looping: false,
        worldSpace: true,
        startLife: cv(0.09),
        startSpeed: cv(0),
        startSize: iv(0.55, 0.8),
        startRotation: iv(0, Math.PI * 2),
        startColor: col(hot[0] * 0.7, hot[1] * 0.7, hot[2] * 0.7, 1),
        emissionOverTime: cv(0),
        emissionBursts: [burst(1)],
        shape: new PointEmitter(),
        material: additive(k, 'spark'),
        renderOrder: 8,
      });
      flash.addBehavior(new SizeOverLife(curve(0.6, 1, 1, 0.2)));
      g.add(streaks.emitter, flash.emitter);
      return g;
    },
  };
}

export const EFFECTS: Record<string, VfxDefinition> = {
  /** Golpes físicos (espada, investida, flecha). */
  hitSpark: hitSpark([3, 2.2, 1.1], [1.2, 0.25, 0.05], 9),
  /** Gelo e raios (azul-branco). */
  hitSparkFrost: hitSpark([1.4, 2.4, 3.2], [0.1, 0.4, 1.2], 8),
  /** Fogo (meteoro, combustão). */
  hitSparkFire: hitSpark([3.2, 1.5, 0.35], [0.8, 0.12, 0.02], 11),
};
