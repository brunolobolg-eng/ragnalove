import * as THREE from 'three';
import { ApplyForce, CircleEmitter, ColorOverLife, ConeEmitter, OrbitOverLife, PointEmitter, RenderMode, SizeOverLife, SpeedOverLife } from 'three.quarks';
import type { VfxDefinition } from '../VFXManager';
import { additive, burst, fade, col, curve, cv, iv, upright, v3, v4 } from './common';

const LOCAL_UP = v3(0, 0, 1);

export const CHARACTERS: Record<string, VfxDefinition> = {
  /**
   * Subida de nível: dois anéis dourados abrindo no chão, faíscas em espiral subindo em volta
   * do herói, riscos verticais e um estouro de estrelas no alto. Acompanha o herói (follow).
   */
  levelUp: {
    category: 'characters',
    build(k) {
      const g = new THREE.Group();
      // anéis no chão (deitados), o segundo um pouco depois
      const rings = k.system({
        duration: 0.4,
        looping: false,
        worldSpace: false,
        startLife: cv(0.75),
        startSpeed: cv(0),
        startSize: cv(3.4),
        startColor: col(2.6, 1.9, 0.6, 1),
        emissionOverTime: cv(0),
        emissionBursts: [burst(1, 0), burst(1, 0.18)],
        shape: new PointEmitter(),
        material: additive(k, 'ring'),
        renderMode: RenderMode.HorizontalBillBoard,
        renderOrder: 7,
      });
      rings.addBehavior(new SizeOverLife(curve(0.12, 0.7, 0.95, 1)));
      rings.addBehavior(new ColorOverLife(fade(v4(1, 1, 1, 1), v4(1, 0.5, 0.2, 0))));
      rings.emitter.position.y = 0.06;
      // espiral de faíscas subindo em volta do corpo
      const spiral = k.system({
        duration: 0.7,
        looping: false,
        worldSpace: false,
        startLife: iv(0.8, 1.1),
        startSpeed: cv(0),
        startSize: iv(0.06, 0.12),
        startColor: col(3, 2.3, 0.8, 1),
        emissionOverTime: cv(k.count(70)),
        shape: new CircleEmitter({ radius: 0.55, thickness: 0.15 }),
        material: additive(k, 'spark'),
        renderOrder: 8,
      });
      // emissor deitado: no espaço local dele, +Z é "para cima" no mundo
      upright(spiral.emitter);
      spiral.addBehavior(new ApplyForce(LOCAL_UP, cv(3.2)));
      spiral.addBehavior(new OrbitOverLife(cv(5.5), LOCAL_UP));
      spiral.addBehavior(new SizeOverLife(curve(1, 1, 0.7, 0)));
      spiral.addBehavior(new ColorOverLife(fade(v4(1, 1, 1, 1), v4(1, 0.45, 0.1, 0.2))));
      // riscos verticais rápidos
      const streaks = k.system({
        duration: 0.5,
        looping: false,
        worldSpace: false,
        startLife: iv(0.35, 0.6),
        startSpeed: iv(4, 7),
        startSize: iv(0.04, 0.07),
        startColor: col(2.8, 2.4, 1.2, 1),
        emissionOverTime: cv(k.count(30)),
        shape: new ConeEmitter({ radius: 0.5, angle: 0.08, thickness: 1 }),
        material: additive(k, 'spark'),
        renderMode: RenderMode.StretchedBillBoard,
        speedFactor: 1.8,
        renderOrder: 8,
      });
      streaks.addBehavior(new SpeedOverLife(curve(1, 0.8, 0.4, 0.1)));
      streaks.addBehavior(new ColorOverLife(fade(v4(1, 1, 1, 1), v4(1, 0.6, 0.2, 0))));
      upright(streaks.emitter);
      // estouro de estrelas no alto
      const stars = k.system({
        duration: 0.6,
        looping: false,
        worldSpace: false,
        startLife: iv(0.5, 0.8),
        startSpeed: iv(1.2, 2.6),
        startSize: iv(0.12, 0.22),
        startRotation: iv(0, Math.PI),
        startColor: col(3, 2.6, 1.4, 1),
        emissionOverTime: cv(0),
        emissionBursts: [burst(k.count(16), 0.45)],
        shape: new PointEmitter(),
        material: additive(k, 'spark'),
        renderOrder: 8,
      });
      stars.addBehavior(new ApplyForce(v3(0, -1, 0), cv(1.5)));
      stars.addBehavior(new SizeOverLife(curve(1, 0.9, 0.5, 0)));
      stars.emitter.position.y = 2.1;
      g.add(rings.emitter, spiral.emitter, streaks.emitter, stars.emitter);
      return g;
    },
  },
};
