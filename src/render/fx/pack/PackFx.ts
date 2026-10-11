import * as THREE from 'three';
import {
  PACK_AURA,
  PACK_BUDGET,
  PACK_ELEMENTS,
  PACK_RING,
  PACK_SLASH,
  PACK_SPRITE,
  PACK_STATUS_SHAPE,
  type PackElement,
} from '../../../config/fx/efeitosPack';
import { ParticleSystem } from '../Particles';
import { AURA_GEO, AuraFX, StreamFX } from './AuraFX';
import { MagicCircleFX } from './MagicCircleFX';
import { MagicSparks } from './MagicSparks';
import { CIRCLE_GEO, MaterialPool, packTexture, QUAD_GEO } from './packPool';
import { SHADER_AURA, SHADER_CIRCLE, SHADER_FLASH, SHADER_RING, SHADER_SLASH, SHADER_SPRITE } from './packShaders';
import { SlashFX, type SlashMaterials } from './SlashFX';
import { SpriteFX } from './SpriteFX';
import type { PackEffect, PackHost } from './packTypes';

/** Texturas de brilho do pacote de buff (Buff Pickup VFX Lite, MIT). */
export type BrilhoTextura = 'levelup' | 'sparkglint' | 'smokepuff';

/**
 * Efeitos do pacote de VFX (círculos mágicos, golpes em fatia, anéis, auras e faíscas) para uma cena.
 * Tudo sai de pools com orçamento (config/fx/efeitosPack.ts): sem material livre, o efeito simplesmente não
 * aparece, e a batalha segue leve. Nada é criado por frame.
 */
export class PackFx implements PackHost {
  readonly sparks: MagicSparks;
  private readonly circles: MaterialPool;
  private readonly slashes: MaterialPool;
  private readonly flashes: MaterialPool;
  private readonly rings: MaterialPool;
  private readonly auras: MaterialPool;
  /** Um pool de materiais por textura de brilho (cada textura é um material próprio). */
  private readonly sprites = new Map<BrilhoTextura, MaterialPool>();
  private readonly live = new Set<PackEffect>();
  private readonly slashTex = packTexture('t_stylizedhit');

  constructor(scene: THREE.Object3D) {
    this.sparks = new MagicSparks(scene);
    this.circles = new MaterialPool(circleMaterial, PACK_BUDGET.circles);
    this.slashes = new MaterialPool(() => slashMaterial(this.slashTex), PACK_BUDGET.slashes);
    this.flashes = new MaterialPool(flashMaterial, PACK_BUDGET.slashes);
    this.rings = new MaterialPool(ringMaterial, PACK_BUDGET.slashes);
    this.auras = new MaterialPool(auraMaterial, PACK_BUDGET.auras);
    for (const textura of ['levelup', 'sparkglint', 'smokepuff'] as const) {
      const tex = packTexture(`t_${textura}`);
      this.sprites.set(textura, new MaterialPool(() => spriteMaterial(tex), PACK_BUDGET.sprites));
    }
  }

  /**
   * Compila os shaders do pacote antes da primeira batalha: sem isso, o primeiro uso de cada tipo trava um quadro.
   * Usa os próprios materiais dos pools (devolvidos logo depois), então nada extra fica em memória.
   */
  warm(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    const tmp = new THREE.Scene();
    const usados: [MaterialPool, THREE.ShaderMaterial][] = [];
    const tirar = (pool: MaterialPool, geo: THREE.BufferGeometry) => {
      const mat = pool.take();
      if (!mat) return;
      tmp.add(new THREE.Mesh(geo, mat));
      usados.push([pool, mat]);
    };
    tirar(this.circles, CIRCLE_GEO);
    tirar(this.slashes, QUAD_GEO);
    tirar(this.flashes, QUAD_GEO);
    tirar(this.rings, QUAD_GEO);
    tirar(this.auras, AURA_GEO);
    for (const pool of this.sprites.values()) tirar(pool, QUAD_GEO);
    renderer.compile(tmp, camera);
    for (const [pool, mat] of usados) pool.give(mat);
  }

  density(): number {
    return ParticleSystem.density;
  }

  track(e: PackEffect): void {
    this.live.add(e);
  }

  untrack(e: PackEffect): void {
    this.live.delete(e);
  }

  /** Pixels por metro a 1 m da câmera (o mesmo `stage.projScale()` das partículas do kit). */
  setScale(px: number): void {
    this.sparks.setScale(px);
  }

  update(dt: number): void {
    this.sparks.update(dt);
  }

  /** Encerra tudo (fim da batalha): devolve os materiais e limpa as faíscas. */
  reset(): void {
    for (const e of [...this.live]) e.dispose();
    this.live.clear();
    this.sparks.clear();
  }

  /** Círculo mágico no chão, no ponto `pos`. Devolve undefined se o orçamento de círculos acabou. */
  circle(parent: THREE.Object3D, pos: THREE.Vector3, element: PackElement, radius: number, hold?: number): MagicCircleFX | undefined {
    const mat = this.circles.take();
    if (!mat) return undefined;
    const fx = new MagicCircleFX(this, mat, () => this.circles.give(mat), pos, PACK_ELEMENTS[element], radius, Math.random() * 10, hold);
    parent.add(fx.group);
    return fx;
  }

  /** Golpe em fatia com flash no ponto `pos` (altura do corpo). `ring` > 0 acrescenta um anel de choque desse tamanho. */
  slash(parent: THREE.Object3D, pos: THREE.Vector3, element: PackElement, ring = 0): SlashFX | undefined {
    const slash = this.slashes.take();
    if (!slash) return undefined;
    const flash = this.flashes.take();
    if (!flash) {
      this.slashes.give(slash);
      return undefined;
    }
    let ringMat: THREE.ShaderMaterial | undefined;
    if (ring > 0) {
      ringMat = this.rings.take();
      if (!ringMat) {
        this.slashes.give(slash);
        this.flashes.give(flash);
        return undefined;
      }
    }
    const mats: SlashMaterials = { slash, flash, ring: ringMat };
    const release = () => {
      this.slashes.give(slash);
      this.flashes.give(flash);
      if (ringMat) this.rings.give(ringMat);
    };
    const fx = new SlashFX(this, mats, release, pos, PACK_ELEMENTS[element], Math.random() * Math.PI * 2, ring);
    parent.add(fx.group);
    return fx;
  }

  /** Aura em volta de uma unidade por `life` segundos (escudo, buff, debuff). Sem orçamento, não aparece. */
  aura(parent: THREE.Object3D, target: THREE.Object3D, element: PackElement, life: number): AuraFX | undefined {
    const mat = this.auras.take();
    if (!mat) return undefined;
    const fx = new AuraFX(this, mat, () => this.auras.give(mat), target, life, PACK_ELEMENTS[element]);
    parent.add(fx.group);
    return fx;
  }

  /** Brilho de buff no corpo da unidade (textura do pacote), por `life` segundos. Sem orçamento, não aparece. */
  brilho(parent: THREE.Object3D, pos: THREE.Vector3, element: PackElement, textura: BrilhoTextura, life: number, size: number): SpriteFX | undefined {
    const pool = this.sprites.get(textura);
    const mat = pool?.take();
    if (!pool || !mat) return undefined;
    const reserva = pool;
    const fx = new SpriteFX(this, mat, () => reserva.give(mat), pos, PACK_ELEMENTS[element], life, size);
    parent.add(fx.group);
    return fx;
  }

  /** Emissor em volta da unidade por `life` segundos: cruzes de cura (sobem) ou cristais de gelo (caem). */
  stream(target: THREE.Object3D, element: PackElement, life: number, kind: 'cross' | 'crystal'): StreamFX {
    const cura = kind === 'cross';
    return new StreamFX(
      this,
      target,
      life,
      PACK_ELEMENTS[element],
      cura ? PACK_STATUS_SHAPE.cross : PACK_STATUS_SHAPE.crystal,
      cura ? 0.8 : -0.5,
    );
  }
}

function circleMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SHADER_CIRCLE.vertex,
    fragmentShader: SHADER_CIRCLE.fragment,
    uniforms: {
      uColor: { value: new THREE.Vector3() },
      uEdge: { value: new THREE.Vector3() },
      // um pouco abaixo do original: com o bloom, o miolo claro estourava em mancha branca
      uEnergy: { value: 0.9 },
      uIntensity: { value: 1 },
      uGrow: { value: 0 },
      uAge: { value: 0 },
      uSeed: { value: 0 },
      uSides: { value: 6 },
      uTurb: { value: 0.3 },
    },
    transparent: true,
    depthWrite: false,
  });
}

function slashMaterial(tex: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SHADER_SLASH.vertex,
    fragmentShader: SHADER_SLASH.fragment,
    uniforms: {
      uTex: { value: tex },
      uColorA: { value: new THREE.Vector3() },
      uColorB: { value: new THREE.Vector3() },
      uDissolveEdge: { value: new THREE.Vector3() },
      uProgress: { value: 0 },
      uEmission: { value: PACK_SLASH.emission },
      uFadeIn: { value: 0.07 },
      uDissolveAmount: { value: 1 },
      uEdgeWidth: { value: 0.12 },
      uDistortion: { value: PACK_SLASH.distortion },
      uNoiseScale: { value: 1.6 },
      uSpin: { value: PACK_SLASH.spin },
      uAngleOffset: { value: 0 },
      uStretch: { value: new THREE.Vector2(PACK_SLASH.stretch[0], PACK_SLASH.stretch[1]) },
      uBlackCut: { value: 0.06 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
}

function flashMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SHADER_FLASH.vertex,
    fragmentShader: SHADER_FLASH.fragment,
    uniforms: {
      uFlashColor: { value: new THREE.Vector3() },
      uEmission: { value: PACK_SLASH.flashEmission },
      uProgress: { value: 0 },
      uFlashLife: { value: PACK_SLASH.flashLife },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
}

function ringMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SHADER_RING.vertex,
    fragmentShader: SHADER_RING.fragment,
    uniforms: {
      uRingColor: { value: new THREE.Vector3() },
      uHotColor: { value: new THREE.Vector3() },
      uIntensityMult: { value: 1 },
      uEmission: { value: PACK_RING.emission },
      uProgress: { value: 0 },
      uRingWidth: { value: PACK_RING.width },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
}

function spriteMaterial(tex: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SHADER_SPRITE.vertex,
    fragmentShader: SHADER_SPRITE.fragment,
    uniforms: {
      uTex: { value: tex },
      uTint: { value: new THREE.Vector3() },
      uEmission: { value: PACK_SPRITE.emission },
      uAlpha: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
}

function auraMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SHADER_AURA.vertex,
    fragmentShader: SHADER_AURA.fragment,
    uniforms: {
      uPrimary: { value: new THREE.Vector3() },
      uSecondary: { value: new THREE.Vector3() },
      uTertiary: { value: new THREE.Vector3() },
      uEmission: { value: PACK_AURA.emission },
      uTime: { value: 0 },
      uTwist: { value: PACK_AURA.twist },
      uScroll: { value: new THREE.Vector2(PACK_AURA.scroll[0], PACK_AURA.scroll[1]) },
      uWaviness: { value: PACK_AURA.waviness },
      uAlpha: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}
