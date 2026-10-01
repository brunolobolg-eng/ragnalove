import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { bossClips, paintOrc, prepareRiggedModel } from './autoRig';
import { registerModel } from './ModelUnitView';

/** Altura do chefe no mundo (os heróis têm ~2,2 contando o cabelo). */
const BOSS_HEIGHT = 3.1;

/**
 * Carrega o orc (GLB estático gerado por IA), cria esqueleto/pesos com o auto-rig e registra
 * como modelo do chefe. Se falhar, o Colosso procedural continua sendo usado.
 * Para outro modelo humanoide parecido basta trocar o arquivo (e a pintura, se vier sem textura).
 */
export async function loadBossModel(url = 'models/orcboss.glb'): Promise<void> {
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
