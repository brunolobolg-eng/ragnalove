import type { GraphicsOptions } from '../render/Stage';

/**
 * Preferências do jogador (áudio + vídeo). Salvas localmente e restauradas ao abrir;
 * cada mudança notifica os ouvintes e vale na hora, sem reiniciar.
 */
export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';
export type FpsCap = 30 | 60 | 0; // 0 = sem limite (acompanha o monitor)

export interface Settings {
  version: 1;
  audio: { master: number; music: number; sfx: number; ambient: number; muted: boolean };
  video: {
    preset: QualityPreset;
    particles: number; // 0.1..1 — multiplica a densidade do preset
    bloom: boolean;
    shake: number; // 0..1
    reduceFlashes: boolean;
    fpsCap: FpsCap;
    vsync: boolean;
    showFps: boolean;
    /** Personagens em modelo 3D (padrão) ou nos sprites 2D antigos (mais leve). */
    characters: '3d' | 'sprites';
    /** Aurenthal PostFX: color grading, gradiente da região, vinheta e nitidez. */
    cinematic: boolean;
    /** Grão de filme bem leve (parte do visual cinematográfico). */
    grain: boolean;
  };
}

export const QUALITY_LABEL: Record<QualityPreset, string> = { low: 'Baixo', medium: 'Médio', high: 'Alto', ultra: 'Ultra' };

/** O que cada preset liga. Ajustar aqui com base no FPS medido (painel de debug mostra FPS/partículas/luzes). */
export interface PresetDef {
  particleDensity: number;
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  maxLights: number;
  bloomStrength: number;
  /** Distorção de calor, aberração cromática, marcas no chão, contorno dos modelos. */
  heat: boolean;
  aberration: boolean;
  decals: boolean;
  outlines: boolean;
}

export const QUALITY_PRESETS: Record<QualityPreset, PresetDef> = {
  low: { particleDensity: 0.35, pixelRatio: 0.6, shadows: false, shadowMapSize: 512, maxLights: 0, bloomStrength: 0.7, heat: false, aberration: false, decals: false, outlines: false },
  medium: { particleDensity: 0.6, pixelRatio: 0.8, shadows: true, shadowMapSize: 1024, maxLights: 2, bloomStrength: 0.9, heat: false, aberration: true, decals: true, outlines: true },
  high: { particleDensity: 0.85, pixelRatio: 1, shadows: true, shadowMapSize: 2048, maxLights: 4, bloomStrength: 1, heat: true, aberration: true, decals: true, outlines: true },
  ultra: { particleDensity: 1, pixelRatio: 1, shadows: true, shadowMapSize: 4096, maxLights: 6, bloomStrength: 1, heat: true, aberration: true, decals: true, outlines: true },
};

const KEY = 'vanguarda.settings.v1';

export function defaultSettings(): Settings {
  return {
    version: 1,
    audio: { master: 0.8, music: 0.5, sfx: 0.8, ambient: 0.6, muted: false },
    video: { preset: 'high', particles: 1, bloom: true, shake: 1, reduceFlashes: false, fpsCap: 60, vsync: true, showFps: false, characters: '3d', cinematic: true, grain: true },
  };
}

export class SettingsStore {
  readonly value: Settings;
  private readonly listeners: ((s: Settings) => void)[] = [];

  constructor() {
    const d = defaultSettings();
    let v = d;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Settings>;
        if (p && p.version === 1) v = { version: 1, audio: { ...d.audio, ...p.audio }, video: { ...d.video, ...p.video } };
      }
    } catch {
      /* sem storage: usa o padrão */
    }
    this.value = v;
  }

  onChange(fn: (s: Settings) => void): void {
    this.listeners.push(fn);
    fn(this.value);
  }

  update(fn: (s: Settings) => void): void {
    fn(this.value);
    try {
      localStorage.setItem(KEY, JSON.stringify(this.value));
    } catch {
      /* ignora */
    }
    for (const l of this.listeners) l(this.value);
  }

  reset(): void {
    const d = defaultSettings();
    this.update((s) => {
      s.audio = d.audio;
      s.video = d.video;
    });
  }
}

/** Converte as preferências de vídeo no que o Stage entende. */
export function graphicsFrom(s: Settings): GraphicsOptions & { particleDensity: number; preset: PresetDef } {
  const q = QUALITY_PRESETS[s.video.preset];
  return {
    pixelRatio: q.pixelRatio,
    bloom: s.video.bloom,
    bloomStrength: q.bloomStrength * (s.video.reduceFlashes ? 0.55 : 1),
    shadows: q.shadows,
    shadowMapSize: q.shadowMapSize,
    shakeScale: s.video.shake * (s.video.reduceFlashes ? 0.5 : 1),
    maxLights: q.maxLights,
    particleDensity: q.particleDensity * s.video.particles,
    preset: q,
    cinematic: s.video.cinematic,
    grain: s.video.cinematic && s.video.grain,
    sharpen: s.video.preset !== 'low',
  };
}
