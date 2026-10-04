import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { bossClips, paintOrc, prepareRiggedModel } from './autoRig';
import { registerModel } from './ModelUnitView';
import type { WeaponAttach } from './weapons';

/** Altura do chefe no mundo (os heróis têm ~2,2 contando o cabelo). */
const BOSS_HEIGHT = 3.1;

/** O mesmo GLB pode vestir duas formas (Krexx pequeno e retorcido): carrega uma vez. */
import type { RiggedModel } from './autoRig';
const rigCache = new Map<string, Promise<RiggedModel>>();
function loadRig(url: string): Promise<RiggedModel> {
  let p = rigCache.get(url);
  if (!p) {
    p = new GLTFLoader().loadAsync(url).then((g) => prepareRiggedModel(g.scene));
    rigCache.set(url, p);
  }
  return p;
}

/**
 * Carrega o orc (GLB estático gerado por IA), cria esqueleto/pesos com o auto-rig e registra
 * como modelo do chefe. Se falhar, o Colosso procedural continua sendo usado.
 * Para outro modelo humanoide parecido basta trocar o arquivo (e a pintura, se vier sem textura).
 */
export async function loadBossModel(url = 'models/orc.glb'): Promise<void> {
  const g = await new GLTFLoader().loadAsync(url);
  const rig = prepareRiggedModel(g.scene, paintOrc);
  const clips = bossClips(rig.bones);
  registerModel('orcboss', {
    build: () => ({ geometry: rig.geometry, bones: rig.bones, glows: [], height: rig.height, map: rig.map }),
    clips: () => clips,
    scale: BOSS_HEIGHT / rig.height,
    outline: 0.008,
    walkRate: 0.8,
    aura: new THREE.Color(1.3, 0.12, 0.3),
  });
}

export interface HumanoidBossOpts {
  /** Altura no mundo. */
  height: number;
  walkRate?: number;
  outline?: number;
  ghost?: [number, number, number];
  aura?: [number, number, number];
  weapons?: WeaponAttach[];
  /** Rugido próprio (ex.: animação original do modelo com retargeting). */
  castClip?: THREE.AnimationClip;
}

/**
 * Mini-chefe humanoide de GLB com textura própria (ex.: goblin do V2Fun):
 * auto-rig + clipes genéricos de brutamonte. O GLB precisa ser humanoide
 * em pé (pés embaixo, frente em +Z); se falhar, o modelo procedural continua.
 */
export async function loadHumanoidBoss(url: string, kind: string, o: HumanoidBossOpts): Promise<void> {
  const rig = await loadRig(url);
  const base = bossClips(rig.bones);
  const clips = o.castClip ? { ...base, cast: o.castClip } : base;
  registerModel(kind, {
    build: () => ({ geometry: rig.geometry, bones: rig.bones, glows: [], height: rig.height, map: rig.map }),
    clips: () => clips,
    scale: o.height / rig.height,
    outline: o.outline ?? 0.01,
    walkRate: o.walkRate ?? 1,
    ghost: o.ghost ? new THREE.Color(...o.ghost) : undefined,
    aura: o.aura ? new THREE.Color(...o.aura) : undefined,
    weapons: o.weapons,
  });
}
