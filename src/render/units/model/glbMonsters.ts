import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HERO_MODELS, MONSTER_MODELS } from '../../../config/visualConfig';
import { archerClips, gruntClips, mageClips, warriorClips, type ClipName } from './anims';
import type { BoneDef, BuiltModel } from './ModelBuilder';
import { registerModel } from './ModelUnitView';

const CLIP_NAMES: ClipName[] = ['idle', 'walk', 'attack', 'heavy', 'cast', 'hit', 'death'];

interface LoadedGlb {
  model: BuiltModel;
  clips: Record<ClipName, THREE.AnimationClip>;
}

/** Animações do próprio jogo para GLBs que trazem só malha + esqueleto (mesmos nomes de ossos). */
const GAME_CLIPS = {
  warrior: warriorClips,
  mage: mageClips,
  archer: archerClips,
  zombie: (b: BoneDef[]) => gruntClips(b, 'grunt'),
  zombieRunner: (b: BoneDef[]) => gruntClips(b, 'runner'),
  zombieBrute: (b: BoneDef[]) => gruntClips(b, 'brute'),
  brute: (b: BoneDef[]) => gruntClips(b, 'brute'),
};

/** Textura alternativa no mesmo atlas: herda orientação, espaço de cor e filtros da textura do GLB. */
const skinLoader = new THREE.TextureLoader();
const skinCache = new Map<string, Promise<THREE.Texture>>();
function loadSkin(url: string, like: THREE.Texture): Promise<THREE.Texture> {
  const cached = skinCache.get(url);
  if (cached) return cached;
  const p: Promise<THREE.Texture> = skinLoader.loadAsync(url).then((t: THREE.Texture) => {
    t.flipY = like.flipY;
    t.colorSpace = like.colorSpace;
    t.wrapS = like.wrapS;
    t.wrapT = like.wrapT;
    t.magFilter = like.magFilter;
    t.minFilter = like.minFilter;
    t.anisotropy = like.anisotropy;
    t.needsUpdate = true;
    return t;
  });
  skinCache.set(url, p);
  return p;
}

/** Nome registrado de cada variante de cor: "zombie~1", "zombie~2"... (a original fica no próprio tipo). */
export const skinKind = (kind: string, i: number): string => `${kind}~${i}`;

/**
 * Converte um GLB do esqueleto padrão (já riggado, cor por vértice, pés em y = 0, frente em +Z)
 * no formato dos modelos do jogo: geometria skinada + lista de ossos + clipes por nome.
 * Modelos com textura (cor por vértice branca) levam a textura junto.
 */
function toBuiltModel(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }, gameClips?: keyof typeof GAME_CLIPS): LoadedGlb {
  const found: THREE.SkinnedMesh[] = [];
  gltf.scene.traverse((o: THREE.Object3D) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) found.push(o as THREE.SkinnedMesh);
  });
  const mesh = found[0];
  if (!mesh) throw new Error('GLB sem SkinnedMesh');
  const src = mesh.geometry;
  const geometry = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color', 'uv', 'skinIndex', 'skinWeight']) {
    const a = src.getAttribute(k);
    if (a) geometry.setAttribute(k, a.clone());
  }
  if (src.index) geometry.setIndex(src.index.clone());
  geometry.setAttribute('aSmoothNormal', geometry.getAttribute('normal').clone());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  // o GLTFLoader tira o "." dos nomes (upperArm.L → upperArmL); o nome original vem nos extras do nó
  const boneName = (b: THREE.Object3D) => (b.userData.name as string | undefined) ?? b.name;
  const bones: BoneDef[] = mesh.skeleton.bones.map((b: THREE.Bone) => ({
    name: boneName(b),
    parent: (b.parent as THREE.Bone | null)?.isBone ? boneName(b.parent!) : undefined,
    pos: [b.position.x, b.position.y, b.position.z],
  }));
  const map = (mesh.material as THREE.MeshStandardMaterial).map ?? undefined;
  const model: BuiltModel = { geometry, bones, glows: [], height: geometry.boundingBox!.max.y, map };
  if (gameClips) {
    // clipes do jogo; os que o GLB trouxer pelo nome (ex.: "attack" do V2Fun) entram por cima
    const clips = GAME_CLIPS[gameClips](bones);
    const own = ownClips(gltf);
    for (const n of CLIP_NAMES) if (own.has(n)) clips[n] = own.get(n)!;
    if (own.has('attack') && !own.has('heavy')) clips.heavy = own.get('attack')!;
    return { model, clips };
  }
  const byName = new Map(gltf.animations.map((c) => [c.name.toLowerCase(), c]));
  const clips = {} as Record<ClipName, THREE.AnimationClip>;
  for (const n of CLIP_NAMES) {
    const c = byName.get(n) ?? byName.get(n === 'heavy' || n === 'cast' ? 'attack' : 'idle');
    if (!c) throw new Error(`GLB sem o clipe ${n}`);
    clips[n] = c;
  }
  return { model, clips };
}

/**
 * Clipes que vieram no GLB, com as trilhas renomeadas para os nomes de osso do jogo
 * (o GLTFLoader tira o "." de "upperArm.L"; o nome original está no userData do nó).
 */
function ownClips(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }): Map<string, THREE.AnimationClip> {
  const names = new Map<string, string>();
  gltf.scene.traverse((o: THREE.Object3D) => {
    const real = o.userData.name as string | undefined;
    if (real) names.set(o.name, real);
  });
  const out = new Map<string, THREE.AnimationClip>();
  for (const c of gltf.animations) {
    const clip = c.clone();
    for (const t of clip.tracks) {
      const dot = t.name.lastIndexOf('.');
      const node = t.name.slice(0, dot);
      t.name = `${names.get(node) ?? node}${t.name.slice(dot)}`;
    }
    out.set(clip.name.toLowerCase(), clip);
  }
  return out;
}

/** Carrega cada arquivo uma vez e registra todas as variantes (tamanho/aura) definidas no MONSTER_MODELS. */
export async function loadMonsterModels(onLoaded?: (kind: string) => void): Promise<void> {
  const loader = new GLTFLoader();
  const files = new Map<string, Promise<LoadedGlb>>();
  await Promise.all(
    Object.entries({ ...MONSTER_MODELS, ...HERO_MODELS }).map(async ([kind, v]) => {
      try {
        // mesmo arquivo com animações diferentes (zumbi comum/rápido/pesado) = entradas separadas no cache
        const key = `${v.file}|${v.clips ?? ''}`;
        if (!files.has(key)) files.set(key, loader.loadAsync(v.file).then((g: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }) => toBuiltModel(g, v.clips)));
        const { model, clips } = await files.get(key)!;
        const def = {
          build: () => model,
          clips: () => clips,
          scale: v.height / model.height,
          outline: v.outline,
          walkRate: v.walkRate,
          aura: v.aura ? new THREE.Color(...v.aura) : undefined,
          ghost: v.ghost ? new THREE.Color(...v.ghost) : undefined,
          weapons: v.weapons,
        };
        registerModel(kind, def);
        onLoaded?.(kind);
        if (v.skins && model.map) {
          const base = model.map;
          await Promise.all(
            v.skins.map(async (url, i) => {
              try {
                const map = await loadSkin(url, base);
                const skinned = { ...model, map };
                registerModel(skinKind(kind, i + 1), { ...def, build: () => skinned });
              } catch (err) {
                console.warn(`Variante de cor "${url}" indisponível.`, err);
              }
            }),
          );
        }
      } catch (err) {
        console.warn(`Monstro GLB "${kind}" indisponível (${v.file}); usando o modelo procedural.`, err);
      }
    }),
  );
}
