import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { POSTFX, type PostFxLook, type PostFxPreset } from '../../../config/visualConfig';

/**
 * AURENTHAL POST FX — acabamento cinematográfico da cena 3D (só apresentação).
 *
 *   cena → [passe de cor: calor, aberração, COLOR GRADING, GRADIENTE da região]
 *        → BLOOM (só o que passa do limiar: magia, fogo, almas — a "camada emissiva")
 *        → [passe final: NITIDEZ, VINHETA (+ pulso do chefe), GRÃO] → tone mapping
 *
 * O visual de cada momento é um preset (`POSTFX.presets`): o tema da zona escolhe o clima
 * (dia, pôr do sol, noite) e o gradiente; o combate troca para `battle` e o chefe para `boss`.
 * As trocas são suaves (interpolação em `POSTFX.blendSeconds`).
 */
export type PostFxSituation = 'calm' | 'battle' | 'boss';

/** Visual "clássico" (antes do PostFX), usado quando o jogador desliga o visual cinematográfico. */
const CLASSIC: PostFxLook = {
  saturation: 1.14, contrast: 1.07, brightness: 1, warmth: 0, shadowTint: [0.95, 0.98, 1.1], highlightTint: [1.06, 1.02, 0.94],
  gradient: 0, bloom: 1, vignette: 0.28, noise: 0, sharpen: 0, pulse: 0,
};

const KEYS = ['saturation', 'contrast', 'brightness', 'warmth', 'gradient', 'bloom', 'vignette', 'noise', 'sharpen', 'pulse'] as const;

/** Hex sRGB → componentes 0..1 sem conversão linear (o gradiente é um "tingimento" de pintura). */
function srgb(hex: string): THREE.Vector3 {
  const n = parseInt(hex.replace('#', ''), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Passe final: nitidez, vinheta (com pulso do chefe) e grão de filme — depois do bloom. */
export function createFinishPass(): ShaderPass {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
      uTime: { value: 0 },
      uVignette: { value: 0 },
      uNoise: { value: 0 },
      uSharpen: { value: 0 },
      uPulse: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec2 uTexel;
      uniform float uTime, uVignette, uNoise, uSharpen, uPulse;
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec3 col = texture2D(tDiffuse, vUv).rgb;
        // nitidez (unsharp mask com 4 vizinhos) — devolve definição depois do bloom
        if (uSharpen > 0.0) {
          vec3 b = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb
                 + texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb;
          col += (col - b * 0.25) * uSharpen;
        }
        // vinheta discreta; com chefe ela "respira" e puxa para o vermelho
        float v = smoothstep(0.45, 1.0, length((vUv - 0.5) * vec2(1.0, 0.85)) * 1.35);
        float beat = 0.5 + 0.5 * sin(uTime * 2.6);
        col *= 1.0 - v * uVignette * (1.0 + uPulse * 0.4 * beat);
        col = mix(col, col * vec3(1.18, 0.82, 0.8), v * uPulse * 0.3 * beat);
        // grão de filme (multiplicativo, quase imperceptível)
        float g = hash(vUv / uTexel + fract(uTime * 7.31) * 113.0) - 0.5;
        col *= 1.0 + g * uNoise * 2.0;
        gl_FragColor = vec4(max(col, 0.0), 1.0);
      }`,
  });
}

export class PostFX {
  private theme = 'bridge';
  private situation: PostFxSituation = 'calm';
  private cinematic = true;
  private grain = true;
  private sharpenOk = true;
  /** Look atual (interpolado) e cores do gradiente atuais/alvo. */
  private readonly cur: PostFxLook = { ...CLASSIC, shadowTint: [...CLASSIC.shadowTint], highlightTint: [...CLASSIC.highlightTint] };
  private readonly grad = [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1)];
  private readonly gradTarget = [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1)];
  private first = true;

  constructor(
    private readonly grade: ShaderPass,
    private readonly finish: ShaderPass,
  ) {}

  /** Tema da zona: clima e gradiente da região. */
  setTheme(theme: string): void {
    this.theme = theme;
    const g = POSTFX.gradients[theme] ?? POSTFX.gradients.bridge;
    g.forEach((hex, i) => this.gradTarget[i].copy(srgb(hex)));
  }

  /** Momento da cena: planejamento, combate ou chefe em campo. */
  setSituation(s: PostFxSituation): void {
    this.situation = s;
  }

  /** Opções do jogador (Configurações → Vídeo) e do preset de qualidade. */
  setOptions(cinematic: boolean, grain: boolean, sharpen: boolean): void {
    this.cinematic = cinematic;
    this.grain = grain;
    this.sharpenOk = sharpen;
  }

  get preset(): PostFxPreset {
    return this.situation === 'boss' ? 'boss' : this.situation === 'battle' ? 'battle' : ((POSTFX.mood[this.theme] ?? 'day') as PostFxPreset);
  }

  private target(): PostFxLook {
    if (!this.cinematic) return CLASSIC;
    const p = POSTFX.presets[this.preset];
    return { ...p, noise: this.grain ? p.noise : 0, sharpen: this.sharpenOk ? p.sharpen : 0 };
  }

  /** Avança a transição e escreve os uniforms. Devolve o multiplicador do bloom. */
  update(dt: number, time: number, width: number, height: number): number {
    const t = this.target();
    const k = this.first ? 1 : Math.min(1, dt / Math.max(0.01, POSTFX.blendSeconds) * 3);
    this.first = false;
    for (const key of KEYS) this.cur[key] += (t[key] - this.cur[key]) * k;
    for (let i = 0; i < 3; i++) {
      this.cur.shadowTint[i] += (t.shadowTint[i] - this.cur.shadowTint[i]) * k;
      this.cur.highlightTint[i] += (t.highlightTint[i] - this.cur.highlightTint[i]) * k;
      this.grad[i].lerp(this.gradTarget[i], k);
    }
    const c = this.cur;
    const G = this.grade.uniforms;
    G.uSat.value = c.saturation;
    G.uContrast.value = c.contrast;
    G.uBright.value = c.brightness;
    G.uWarmth.value = c.warmth;
    (G.uShadowTint.value as THREE.Color).setRGB(...c.shadowTint);
    (G.uHighTint.value as THREE.Color).setRGB(...c.highlightTint);
    G.uGrad.value = c.gradient;
    (G.uGradTop.value as THREE.Vector3).copy(this.grad[0]);
    (G.uGradMid.value as THREE.Vector3).copy(this.grad[1]);
    (G.uGradBot.value as THREE.Vector3).copy(this.grad[2]);
    G.uVignette.value = 0; // a vinheta vive no passe final (depois do bloom)
    const F = this.finish.uniforms;
    F.uTime.value = time;
    (F.uTexel.value as THREE.Vector2).set(1 / Math.max(1, width), 1 / Math.max(1, height));
    F.uVignette.value = c.vignette;
    F.uNoise.value = c.noise;
    F.uSharpen.value = c.sharpen;
    F.uPulse.value = c.pulse;
    return c.bloom;
  }
}
