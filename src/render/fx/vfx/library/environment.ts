import * as THREE from 'three';
import { ApplyForce, AxisAngleGenerator, ColorOverLife, ConeEmitter, FrameOverLife, Gradient, PointEmitter, RandomQuatGenerator, RectangleEmitter, RenderMode, Rotation3DOverLife, SizeOverLife, SpeedOverLife, WidthOverLength } from 'three.quarks';
import type { VfxBuildKit, VfxDefinition } from '../VFXManager';
import { GRAVITY, additive, fade, burst, chipGeometry, chips, col, curve, cv, dust, iv, upright, v3, v4 } from './common';

/** Lascas sólidas que saltam e caem (madeira, pedra, arenito). */
function debris(k: VfxBuildKit, o: { key: string; color: number; geo: 'shard' | 'splinter' | 'rock'; count: number; size: [number, number]; speed: [number, number]; spread: number; radius: number }) {
  const s = k.system({
    duration: 0.1,
    looping: false,
    worldSpace: true,
    startLife: iv(0.6, 0.9),
    startSpeed: iv(o.speed[0], o.speed[1]),
    startSize: iv(o.size[0], o.size[1]),
    startRotation: new RandomQuatGenerator(),
    startColor: col(1, 1, 1, 1),
    emissionOverTime: cv(0),
    emissionBursts: [burst(k.count(o.count))],
    shape: new ConeEmitter({ radius: o.radius, angle: o.spread, thickness: 1 }),
    material: chips(k, o.key, o.color),
    instancingGeometry: chipGeometry(o.geo),
    renderMode: RenderMode.Mesh,
    renderOrder: 4,
  });
  upright(s.emitter);
  s.addBehavior(new ApplyForce(GRAVITY, cv(12)));
  s.addBehavior(new Rotation3DOverLife(new AxisAngleGenerator(v3(0.6, 0.8, 0), iv(-10, 10))));
  s.addBehavior(new SizeOverLife(curve(1, 1, 0.85, 0)));
  return s;
}

/** Nuvem de poeira curta (mistura normal). */
function puff(k: VfxBuildKit, color: [number, number, number], count: number, size: [number, number], radius: number) {
  const s = k.system({
    duration: 0.15,
    looping: false,
    worldSpace: true,
    startLife: iv(0.8, 1.3),
    startSpeed: iv(0.4, 1.4),
    startSize: iv(size[0], size[1]),
    startRotation: iv(0, Math.PI * 2),
    startColor: col(color[0], color[1], color[2], 0.6),
    emissionOverTime: cv(0),
    emissionBursts: [burst(k.count(count))],
    shape: new ConeEmitter({ radius, angle: 1.2, thickness: 1 }),
    material: dust(k),
    uTileCount: 4,
    vTileCount: 4,
    renderOrder: 5,
  });
  upright(s.emitter);
  s.addBehavior(new SpeedOverLife(curve(1, 0.4, 0.1, 0)));
  s.addBehavior(new SizeOverLife(curve(0.5, 1, 1.4, 1.7)));
  s.addBehavior(new ColorOverLife(fade(v4(1, 1, 1, 1), v4(1, 1, 1, 0))));
  s.addBehavior(new FrameOverLife(curve(0, 5, 10, 15)));
  return s;
}

function objectBreak(key: string, color: number, geo: 'splinter' | 'rock', dustColor: [number, number, number]): VfxDefinition {
  return {
    category: 'environment',
    build(k) {
      const g = new THREE.Group();
      const d = debris(k, { key, color, geo, count: 14, size: geo === 'splinter' ? [0.12, 0.3] : [0.1, 0.22], speed: [2.5, 5], spread: 0.9, radius: 0.35 });
      const p = puff(k, dustColor, 8, [0.5, 0.9], 0.4);
      d.emitter.position.y = 0.5;
      p.emitter.position.y = 0.3;
      g.add(d.emitter, p.emitter);
      return g;
    },
  };
}

export const ENVIRONMENT: Record<string, VfxDefinition> = {
  /** Objeto de madeira quebrado (carroça, raízes, tocha): farpas voando + poeira. */
  objectBreakWood: objectBreak('wood', 0x6a4a2e, 'splinter', [0.45, 0.36, 0.26]),
  /** Objeto de pedra quebrado (coluna, muralha): cascalho + poeira clara. */
  objectBreakStone: objectBreak('stone', 0xb89a70, 'rock', [0.72, 0.6, 0.44]),

  /** Desabamento de ruína: blocos grandes de pedra rolando para fora. `scale` = raio. */
  ruinDebris: {
    category: 'environment',
    build(k) {
      const g = new THREE.Group();
      const d = debris(k, { key: 'stone', color: 0xb89a70, geo: 'rock', count: 18, size: [0.16, 0.38], speed: [3, 6], spread: 1.0, radius: 0.6 });
      d.emitter.position.y = 0.8;
      g.add(d.emitter);
      return g;
    },
  },

  /** Inimigo invadindo a cidade: clarão vermelho subindo no portão + brasas. */
  cityBreach: {
    category: 'environment',
    build(k) {
      const g = new THREE.Group();
      const flare = k.system({
        duration: 0.3,
        looping: false,
        worldSpace: false,
        startLife: iv(0.35, 0.6),
        startSpeed: iv(3, 6),
        startSize: iv(0.06, 0.12),
        startColor: col(3, 0.5, 0.25, 1),
        emissionOverTime: cv(0),
        emissionBursts: [burst(k.count(20))],
        shape: new ConeEmitter({ radius: 0.5, angle: 0.35, thickness: 1 }),
        material: additive(k, 'spark'),
        renderMode: RenderMode.StretchedBillBoard,
        speedFactor: 1.2,
        renderOrder: 8,
      });
      upright(flare.emitter);
      flare.addBehavior(new SpeedOverLife(curve(1, 0.6, 0.3, 0.1)));
      flare.addBehavior(new ColorOverLife(fade(v4(1, 1, 1, 1), v4(0.6, 0.1, 0.05, 0))));
      const ring = k.system({
        duration: 0.2,
        looping: false,
        worldSpace: false,
        startLife: cv(0.55),
        startSpeed: cv(0),
        startSize: cv(2.6),
        startColor: col(2.6, 0.35, 0.15, 1),
        emissionOverTime: cv(0),
        emissionBursts: [burst(1)],
        shape: new PointEmitter(),
        material: additive(k, 'ring'),
        renderMode: RenderMode.HorizontalBillBoard,
        renderOrder: 7,
      });
      ring.emitter.position.y = 0.06;
      ring.addBehavior(new SizeOverLife(curve(0.2, 0.75, 0.95, 1)));
      ring.addBehavior(new ColorOverLife(fade(v4(1, 1, 1, 1), v4(1, 0.3, 0.1, 0))));
      g.add(flare.emitter, ring.emitter);
      return g;
    },
  },

  /** Barril de óleo pegando fogo: brasas com rastro em arco + clarão. */
  oilBurst: {
    category: 'environment',
    build(k) {
      const g = new THREE.Group();
      const embers = k.system({
        duration: 0.1,
        looping: false,
        worldSpace: true,
        startLife: iv(0.6, 1.0),
        startSpeed: iv(4, 7.5),
        startSize: iv(0.025, 0.045),
        startColor: col(2.4, 1.1, 0.25, 1),
        emissionOverTime: cv(0),
        emissionBursts: [burst(k.count(16))],
        shape: new ConeEmitter({ radius: 0.3, angle: 0.75, thickness: 1 }),
        material: additive(k, 'ribbon'),
        renderMode: RenderMode.Trail,
        rendererEmitterSettings: { startLength: cv(14), followLocalOrigin: false },
        renderOrder: 8,
      });
      upright(embers.emitter);
      embers.emitter.position.y = 0.4;
      embers.addBehavior(new ApplyForce(GRAVITY, cv(9)));
      embers.addBehavior(new WidthOverLength(curve(0, 0.6, 0.9, 1)));
      embers.addBehavior(new ColorOverLife(fade(v4(1, 1, 1, 1), v4(0.6, 0.12, 0.02, 0))));
      const flash = k.system({
        duration: 0.1,
        looping: false,
        worldSpace: false,
        startLife: cv(0.25),
        startSpeed: cv(0),
        startSize: cv(3.2),
        startColor: col(2.4, 1.0, 0.25, 1),
        emissionOverTime: cv(0),
        emissionBursts: [burst(1)],
        shape: new PointEmitter(),
        material: additive(k, 'soft'),
        renderOrder: 8,
      });
      flash.emitter.position.y = 0.7;
      flash.addBehavior(new SizeOverLife(curve(0.5, 1, 0.9, 0.3)));
      flash.addBehavior(new ColorOverLife(fade(v4(1, 1, 1, 1), v4(1, 0.4, 0.1, 0))));
      g.add(embers.emitter, flash.emitter);
      return g;
    },
  },

  /**
   * Tempestade de areia (loop): uma "parede" emissora no lado de onde vem o vento solta riscos
   * de areia que varrem a área da câmera. Complementa as rajadas de poeira que já existiam.
   * O GameView posiciona a parede (follow) e para o efeito quando a tempestade acaba.
   */
  sandstorm: {
    category: 'environment',
    build(k) {
      const g = new THREE.Group();
      const streaks = k.system({
        duration: 1,
        looping: true,
        worldSpace: true,
        startLife: iv(2.2, 3.0),
        startSpeed: iv(11, 16),
        startSize: iv(0.03, 0.06),
        startColor: col(1.0, 0.82, 0.55, 0.55),
        emissionOverTime: cv(k.count(150)),
        shape: new RectangleEmitter({ width: 34, height: 3.2 }),
        material: additive(k, 'soft'),
        renderMode: RenderMode.StretchedBillBoard,
        speedFactor: 1.4,
        renderOrder: 9,
      });
      streaks.emitter.position.y = 1.6;
      streaks.addBehavior(
        new ColorOverLife(
          new Gradient(
            [[v3(1, 1, 1), 0], [v3(1, 1, 1), 1]],
            [[0, 0], [1, 0.15], [1, 0.75], [0, 1]],
          ),
        ),
      );
      g.add(streaks.emitter);
      return g;
    },
  },
};
