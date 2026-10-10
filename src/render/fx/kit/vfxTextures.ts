import * as THREE from 'three';

/**
 * Texturas de efeito: arte do Kenney Particle Pack (CC0), preparada por
 * `scripts/build_kenney_fx.py` em `public/fx/kenney/`. Todas são brancas com a forma no alfa —
 * a cor vem do efeito (partícula, material ou decalque). Fogo e fumaça são atlas 4×4
 * (quadro = idade da partícula). Cada arquivo é carregado uma vez e reaproveitado.
 * Os `lu_*` são da subida de nível: recortes da arte de referência do dono, também brancos com a forma no
 * alfa (`scripts/build_levelup_fx.py` em `public/fx/levelup/`).
 */
export type FxTextureName =
  | 'flame_atlas'
  | 'smoke_atlas'
  | 'flame_strip'
  | 'spark'
  | 'impact'
  | 'glow'
  | 'flash'
  | 'orb'
  | 'soul'
  | 'halo'
  | 'slash'
  | 'twirl'
  | 'trace'
  | 'ribbon'
  | 'noise'
  | 'lu_wing' | 'lu_wing_r' | 'lu_beam' | 'lu_ring' | 'lu_halo' | 'lu_star' | 'lu_flare' | 'lu_streak'
  | 'lu_feather_a' | 'lu_feather_b' | 'lu_feather_c' | 'lu_feather_d'
  | `decal_${DecalKind}`;

const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();

/** Todas as texturas de efeito do pacote (para aquecer o cache antes do primeiro uso). */
const FX_NAMES: FxTextureName[] = [
  'flame_atlas', 'smoke_atlas', 'flame_strip', 'spark', 'impact', 'glow', 'flash', 'orb', 'soul', 'halo',
  'slash', 'twirl', 'trace', 'ribbon', 'noise',
  'decal_scorch', 'decal_frost', 'decal_crack', 'decal_runesFire', 'decal_runesFrost', 'decal_ring', 'decal_glow', 'decal_aoe', 'decal_disc',
  'lu_wing', 'lu_wing_r', 'lu_beam', 'lu_ring', 'lu_halo', 'lu_star', 'lu_flare', 'lu_streak',
  'lu_feather_a', 'lu_feather_b', 'lu_feather_c', 'lu_feather_d',
];

/**
 * Arte própria do dono (sprites de efeito que não são do Kenney): carregada por caminho, uma vez, como as
 * demais. O Ápice Sombrio usa a folha de magia negra em public/sprites/bruxa/apice/.
 */
const urlCache = new Map<string, THREE.Texture>();
export function fxImage(path: string): THREE.Texture {
  let t = urlCache.get(path);
  if (!t) {
    t = loader.load(path);
    t.name = path;
    urlCache.set(path, t);
  }
  return t;
}

let radial: THREE.Texture | undefined;
/**
 * Máscara radial (centro cheio, borda apagada) para as artes de chão: as folhas do dono têm um fundo quase invisível
 * que, em aditivo, desenha uma borda retangular em volta do efeito. Uma só textura, compartilhada.
 */
export function radialMask(): THREE.Texture {
  if (!radial) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d');
    if (g) {
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, '#fff');
      grad.addColorStop(0.75, '#fff');
      grad.addColorStop(1, '#000');
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
    }
    radial = new THREE.CanvasTexture(c);
  }
  return radial;
}

/** Quadros da abertura do Ápice (o círculo que se forma), em ordem. */
export const APICE_FRAMES = ['quadro_1', 'quadro_2', 'quadro_3', 'quadro_4', 'quadro_5', 'quadro_6', 'quadro_7', 'quadro_8'];
/** Arte do Ápice Sombrio (recortada da folha de magia negra). */
export const APICE_IMAGES = ['completo', 'anel', 'nevoa', 'espinhos', 'faces', 'pedras', ...APICE_FRAMES];
export const apiceImage = (name: string): THREE.Texture => fxImage(`sprites/bruxa/apice/${name}.webp`);

/**
 * Carrega todas as texturas de efeito antes do primeiro uso: sem isso, o primeiro golpe de cada tipo
 * desenha a sprite sem imagem (um quadro vazio). Resolve quando todas já têm imagem.
 */
export function warmFxTextures(): Promise<void> {
  const textures = [...FX_NAMES.map((n) => fxTexture(n)), ...APICE_IMAGES.map((n) => apiceImage(n))];
  return new Promise((resolve) => {
    const tick = (): void => {
      if (textures.every((t) => t.image)) resolve();
      else setTimeout(tick, 30);
    };
    tick();
  });
}

/** Textura do pacote de efeitos (carrega na primeira chamada; a mesma instância depois). */
export function fxTexture(name: FxTextureName): THREE.Texture {
  let t = cache.get(name);
  if (!t) {
    t = loader.load(`fx/${name.startsWith('lu_') ? 'levelup' : 'kenney'}/${name}.png`);
    t.name = name;
    cache.set(name, t);
  }
  return t;
}

/** Atlas 4×4 de labaredas: nasce denso, termina em fiapos. */
export const flameAtlas = () => fxTexture('flame_atlas');
/** Atlas 4×4 de fumaça: cresce e se abre com a idade. */
export const smokeAtlas = () => fxTexture('smoke_atlas');
/** Faísca em estrela de 4 pontas. */
export const sparkTexture = () => fxTexture('spark');
/** Estouro de impacto (mistura normal: cor chapada). */
export const impactTexture = () => fxTexture('impact');
/** Brilho redondo suave (halos, chão iluminado, orbes). */
export const glowTexture = () => fxTexture('glow');
/** Clarão de luz com anéis (flash de impacto/conjuração). */
export const flashTexture = () => fxTexture('flash');
/** Estrela brilhante (núcleo de projéteis). */
export const orbTexture = () => fxTexture('orb');
/** Brilho em cruz das almas. */
export const soulTexture = () => fxTexture('soul');
/** Estrela de gelo (halo do Raio Gélido). */
export const haloTexture = () => fxTexture('halo');
/** Feixe vertical (coluna de luz do loot). */
export const traceTexture = () => fxTexture('trace');
/** Perfil das fitas (rastros): forte no centro, some nas bordas (eixo v). */
export const ribbonTexture = () => fxTexture('ribbon');
/** 4 labaredas altas lado a lado (barreira de fogo). */
export const flameStripTexture = () => {
  const t = fxTexture('flame_strip');
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
};
/** Ruído de fumaça repetível (recorte/dissolve de lâminas e chamas). */
export const noiseTexture = () => {
  const t = fxTexture('noise');
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

export type DecalKind = 'scorch' | 'frost' | 'crack' | 'runesFire' | 'runesFrost' | 'ring' | 'glow' | 'aoe' | 'disc';

/** Decalques de chão (alfa na textura, cor/intensidade no material). Queimado e rachadura já vêm escuros. */
export const decalTexture = (kind: DecalKind) => fxTexture(`decal_${kind}`);
