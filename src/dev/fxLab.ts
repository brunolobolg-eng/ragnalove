/**
 * Lab de efeitos (dev): o golpe de uma habilidade com o Stage e o kit reais do jogo, um assassino de verdade
 * e um inimigo à frente. Parâmetros: ?at=<segundos> (avança até esse instante e congela), ?fwd=<x,y> (direção).
 * Não entra no build do jogo.
 */
import * as THREE from 'three';
// a ordem importa (como na bancada): a configuração de modelos carrega antes do Stage
import { loadMonsterModels } from '../render/units/model/glbMonsters';
import { Stage } from '../render/Stage';
import { ParticleLayer } from '../render/fx/Particles';
import { RibbonPool } from '../render/fx/kit/Ribbons';
import { DecalLayer } from '../render/fx/kit/Decals';
import type { FxKit } from '../render/fx/kit/FxKit';
import { AssassinStrikeFX } from '../render/fx/StrikeFX';
import { ModelUnitView } from '../render/units/model/ModelUnitView';
import { ACTIVE_ZONE } from '../config/zones';
import { warmFxTextures } from '../render/fx/kit/vfxTextures';

const q = new URLSearchParams(location.search);
const AT = q.has('at') ? Number(q.get('at')) : undefined;
const DT = 1 / 60;

async function main(): Promise<void> {
  await loadMonsterModels();
  const container = document.getElementById('stage')!;
  const stage = new Stage(container, 14, 14);
  // mesma atmosfera da batalha (luz, névoa, fundo) e enquadramento próximo do jogo
  stage.applyTheme(ACTIVE_ZONE.theme);
  stage.setFocus(new THREE.Vector3(0.15, 1.0, 0), true);
  stage.zoomBy(-8);
  // chão do tabuleiro, para a luz e a sombra terem onde cair
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3f5a3a, roughness: 0.95 }));
  ground.receiveShadow = true;
  stage.scene.add(ground);

  const particles = new ParticleLayer(stage.scene);
  particles.setScale(stage.projScale());
  const ribbons = new RibbonPool(stage.scene);
  const decals = new DecalLayer(stage.scene);
  const kit: FxKit = { stage, particles, ribbons, decals, hitStop: () => {} };
  (window as unknown as { __kit?: unknown }).__kit = { particles, ribbons, decals, stage };

  const assassin = new ModelUnitView('assassin', 'party');
  assassin.root.position.set(-0.6, 0, 0);
  assassin.setFacing(1, 0, true);
  stage.scene.add(assassin.root);
  const dummy = new ModelUnitView('grunt', 'enemy');
  dummy.root.position.set(0.9, 0, 0);
  dummy.setFacing(-1, 0, true);
  stage.scene.add(dummy.root);

  const fwd = new THREE.Vector3(1, 0, 0);
  const attacker = assassin.root.position.clone();
  const target = dummy.root.position.clone();
  const fx = new AssassinStrikeFX(attacker, target, fwd, kit);
  stage.scene.add(fx.group);
  (window as unknown as { __fx?: unknown }).__fx = fx;
  assassin.attack();
  dummy.hit();

  const camQ = stage.camera.quaternion;
  let t = 0;
  const step = (dt: number): void => {
    t += dt;
    particles.update(dt);
    ribbons.update(dt, stage.camera.position);
    decals.update(dt);
    fx.update(dt);
    assassin.update(dt, 1, 1, camQ);
    dummy.update(dt, 1, 1, camQ);
    stage.render(dt);
  };

  if (AT !== undefined) {
    // as texturas do Kenney carregam de forma assíncrona: espera tudo carregar antes de avançar
    await warmFxTextures();
    while (t < AT) step(DT);
    stage.render(0);
    (window as unknown as { __fxReady?: boolean }).__fxReady = true;
    return;
  }
  const loop = (): void => {
    step(DT);
    requestAnimationFrame(loop);
  };
  loop();
  (window as unknown as { __fxReady?: boolean }).__fxReady = true;
}

void main();
