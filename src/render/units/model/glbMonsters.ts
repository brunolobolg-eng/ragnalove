import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HERO_MODELS, MONSTER_MODELS } from '../../../config/visualConfig';
import { archerClips, fitHips, gruntClips, hoverClips, mageClips, warriorClips, type ClipName } from './anims';
import { ualMixamoClips } from './ualMixamo';
import { warriorRigClips } from './warriorAnims';
import { MIXAMO_CULTIST_REST } from './mixamoRest';

/** Escala UAL->cultista pela altura (modelo nativo 1.82m, personagem UAL ~1.75m). */
const CULTIST_HIPS_SCALE = 1.82 / 1.75;
import type { BoneDef, BuiltModel } from './ModelBuilder';
import { registerModel } from './ModelUnitView';

const CLIP_NAMES: ClipName[] = ['idle', 'walk', 'attack', 'heavy', 'cast', 'hit', 'death'];

interface LoadedGlb {
  model: BuiltModel;
  clips: Record<ClipName, THREE.AnimationClip>;
}

/**
 * Retarget no ESPAÇO DO MUNDO (rig Mixamo de origem = cultista, com a mesma hierarquia de ossos do destino).
 * Para cada osso: quanto ele girou em relação ao descanso da origem (no mundo) é aplicado ao descanso do
 * destino (no mundo); depois volta para a rotação local do osso pai do destino. Assim um rig com outras
 * proporções de descanso (braço, antebraço, coluna) recebe o movimento sem girar o corpo inteiro.
 */
function retargetWorld(c: THREE.AnimationClip, bones: BoneDef[]): THREE.AnimationClip {
  const order = bones.map((b) => b.name);
  const parentOf = new Map(bones.map((b) => [b.name, b.parent]));
  const restB = new Map(bones.map((b) => [b.name, b.rest ? new THREE.Quaternion(...b.rest) : new THREE.Quaternion()]));
  const restC = new Map(order.map((n) => [n, MIXAMO_CULTIST_REST[n] ? new THREE.Quaternion(...MIXAMO_CULTIST_REST[n]) : new THREE.Quaternion()]));
  // rotação de descanso no mundo (origem e destino), pais antes dos filhos
  const worldB = new Map<string, THREE.Quaternion>();
  const worldC = new Map<string, THREE.Quaternion>();
  const worldOf = (n: string, rest: Map<string, THREE.Quaternion>, memo: Map<string, THREE.Quaternion>): THREE.Quaternion => {
    const got = memo.get(n);
    if (got) return got;
    const p = parentOf.get(n);
    const w = (p ? worldOf(p, rest, memo).clone() : new THREE.Quaternion()).multiply(rest.get(n) ?? new THREE.Quaternion());
    memo.set(n, w);
    return w;
  };
  for (const n of order) { worldOf(n, restB, worldB); worldOf(n, restC, worldC); }
  // trilhas de rotação da origem, por osso
  const tracks = new Map<string, THREE.QuaternionKeyframeTrack>();
  for (const t of c.tracks) if (t instanceof THREE.QuaternionKeyframeTrack) tracks.set(t.name.slice(0, -'.quaternion'.length), t);
  const times = [...new Set([...tracks.values()].flatMap((t) => Array.from(t.times)))].sort((x, y) => x - y);
  const valuesOut = new Map(order.map((n) => [n, [] as number[]]));
  const qc = new THREE.Quaternion();
  for (const time of times) {
    // rotação local da origem neste instante (osso sem trilha = descanso da origem)
    const local = new Map<string, THREE.Quaternion>();
    for (const n of order) {
      const t = tracks.get(n);
      if (t) {
        const i = Math.max(0, Math.min(t.times.length - 1, sampleIndex(Array.from(t.times), time)));
        const v = t.values;
        const j = i * 4;
        local.set(n, new THREE.Quaternion(v[j], v[j + 1], v[j + 2], v[j + 3]));
      } else local.set(n, MIXAMO_CULTIST_REST[n] ? new THREE.Quaternion(...MIXAMO_CULTIST_REST[n]) : new THREE.Quaternion());
    }
    // mundo da origem (animado) e do destino (animado) em ordem hierárquica
    const wC = new Map<string, THREE.Quaternion>();
    const wB = new Map<string, THREE.Quaternion>();
    for (const n of order) {
      const p = parentOf.get(n);
      const wcNow = (p ? wC.get(p)!.clone() : new THREE.Quaternion()).multiply(local.get(n)!);
      wC.set(n, wcNow);
      // delta no mundo = (mundo origem agora) × inv(mundo origem descanso); aplicado ao descanso do destino
      const delta = wcNow.clone().multiply(qc.copy(worldC.get(n)!).invert());
      const wbNow = delta.multiply(worldB.get(n)!.clone());
      wB.set(n, wbNow);
      const parentB = p ? wB.get(p)!.clone() : new THREE.Quaternion();
      const localB = parentB.invert().multiply(wbNow);
      const out = valuesOut.get(n)!;
      out.push(localB.x, localB.y, localB.z, localB.w);
    }
  }
  const newTracks = order.map((n) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, times, valuesOut.get(n)!));
  const hips = c.tracks.filter((t) => !(t instanceof THREE.QuaternionKeyframeTrack));
  return new THREE.AnimationClip(c.name, c.duration, [...newTracks, ...hips]);
}

/** Índice da última chave com tempo ≤ `time` (para amostrar a trilha da origem). */
function sampleIndex(ts: number[], time: number): number {
  let lo = 0;
  let hi = ts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ts[mid] <= time + 1e-6) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Clipes UAL retargetados no rig Mixamo do cultista (bongun). Para o Guerreiro, ver warriorAnims.ts. */
function cultistClips(bones: BoneDef[]): Record<ClipName, THREE.AnimationClip> {
  const raw = ualMixamoClips();
  const fit = (c: THREE.AnimationClip): THREE.AnimationClip => retargetWorld(fitHips(c, bones, 'Hips', CULTIST_HIPS_SCALE), bones);
  return {
    idle: fit(raw.idle),
    walk: fit(raw.walk),
    attack: fit(raw.attack),
    heavy: fit(raw.attack),
    cast: fit(raw.cast),
    hit: fit(raw.hit),
    death: fit(raw.death),
  };
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
  cultist: cultistClips,
  warriorRig: warriorRigClips,
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
 * Rigs com o segmento do braço de lado (T-pose: upperArm aponta ±X em vez de para
 * baixo). Os clipes procedurais assumem braço pendente (giro em X balança para
 * frente/trás); com o segmento de lado, o giro só "enrola" o braço parado e os
 * cotovelos ficam travados para fora — o zumbi/orc anda de braço aberto.
 * Detecta o segmento lateral e pendura (mantém comprimento e um leve desvio para
 * fora). Só vale para nomes do padrão do jogo (upperArm.L/R): rigs Mixamo
 * (LeftArm), modelos procedurais (já pendentes) e GLBs com animação própria
 * (feita para o próprio bind) não disparam. Retorna true se mexeu em algo.
 */
export function hangArms(bones: BoneDef[]): boolean {
  let fixed = false;
  for (const b of bones) {
    if (b.name !== 'upperArm.L' && b.name !== 'upperArm.R') continue;
    const [x, y, z] = b.pos;
    const len = Math.hypot(x, y, z);
    if (len <= 0 || Math.abs(x) < 2 * Math.abs(y)) continue; // já pendente
    const s = Math.sign(x) || 1;
    b.pos = [s * len * 0.25, -len * 0.97, z];
    fixed = true;
  }
  return fixed;
}

/**
 * Converte um GLB do esqueleto padrão (já riggado, cor por vértice, pés em y = 0, frente em +Z)
 * no formato dos modelos do jogo: geometria skinada + lista de ossos + clipes por nome.
 * Modelos com textura (cor por vértice branca) levam a textura junto.
 */
/**
 * Pose de descanso a partir das matrizes de bind do próprio arquivo: a posição de cada osso é a inversa
 * da sua matriz de bind (no espaço da malha). Usa-se quando a pose dos nós do GLB não bate com a malha.
 */
function bonesFromBind(skel: THREE.Skeleton, boneName: (b: THREE.Object3D) => string): BoneDef[] {
  const bind = skel.boneInverses.map((m) => m.clone().invert());
  const parentIdx = skel.bones.map((b) => skel.bones.indexOf(b.parent as THREE.Bone));
  // o bind do arquivo pode deixar o quadril na origem (pernas abaixo do chão): sobe o esqueleto
  // inteiro para os tornozelos/pés tocarem y = 0. A malha acompanha (skinning = bind × inversa).
  let lowest = Infinity;
  skel.bones.forEach((b, i) => {
    if (/foot|toe|ankle/i.test(b.name)) lowest = Math.min(lowest, bind[i].elements[13]);
  });
  const lift = Number.isFinite(lowest) ? -lowest : 0;
  return skel.bones.map((b, i) => {
    const p = parentIdx[i];
    const local = p >= 0 ? bind[p].clone().invert().multiply(bind[i]) : bind[i].clone();
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    local.decompose(pos, q, sc);
    if (p < 0) pos.y += lift;
    return { name: boneName(b), parent: p >= 0 ? boneName(skel.bones[p]) : undefined, pos: [pos.x, pos.y, pos.z], rest: [q.x, q.y, q.z, q.w] };
  });
}

function toBuiltModel(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }, gameClips?: keyof typeof GAME_CLIPS, bindFromFile = false): LoadedGlb {
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
  // GLBs de IA às vezes vêm sem normais: calcula antes do contorno (senão o load quebra e cai no fallback)
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  geometry.setAttribute('aSmoothNormal', geometry.getAttribute('normal').clone());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  // o GLTFLoader tira o "." dos nomes (upperArm.L → upperArmL); o nome original vem nos extras do nó
  const boneName = (b: THREE.Object3D) => (b.userData.name as string | undefined) ?? b.name;
  const bones: BoneDef[] = bindFromFile
    ? bonesFromBind(mesh.skeleton, boneName)
    : mesh.skeleton.bones.map((b: THREE.Bone) => ({
        name: boneName(b),
        parent: (b.parent as THREE.Bone | null)?.isBone ? boneName(b.parent!) : undefined,
        pos: [b.position.x, b.position.y, b.position.z],
        // descanso rotacionado (rigs Mixamo/V2Fun): sem ele o bind desmonta
        rest: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w],
      }));
  const map = (mesh.material as THREE.MeshStandardMaterial).map ?? undefined;
  const inverses = mesh.skeleton.boneInverses.map((m: THREE.Matrix4) => m.clone());
  const model: BuiltModel = { geometry, bones, glows: [], height: geometry.boundingBox!.max.y, map, inverses };
  if (gameClips) {
    // bind lateral (braço de lado) não combina com clipe procedural: pendura e
    // deriva as inversas (as do arquivo valiam para o bind antigo; sem elas, o
    // bind exato continua renderizando a malha modelada no descanso)
    if (hangArms(bones)) model.inverses = undefined;
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
        const key = `${v.file}|${v.clips ?? ''}|${v.bind ?? ''}`;
        if (!files.has(key)) files.set(key, loader.loadAsync(v.file).then((g: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }) => toBuiltModel(g, v.clips, v.bind === 'ibm')));
        const { model, clips: baseClips } = await files.get(key)!;
        // flutuação: o andar vira o balanço elevado (cópia: o arquivo pode ser compartilhado por outros tipos)
        const clips = v.hover ? hoverClips(baseClips, model.bones, v.hover) : baseClips;
        const def = {
          build: () => model,
          clips: () => clips,
          scale: v.height / model.height,
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
