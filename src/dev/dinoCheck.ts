/**
 * Vitrine temporária do dino (dev, fora do build final): o modelo do jogo com cada animação, ao lado de um
 * cultista e de um zumbi para comparar o tamanho. Uso: __dino.show('andando'), __dino.advance(segundos), __dino.snap().
 */
import * as THREE from 'three';
import { loadMonsterModels } from '../render/units/model/glbMonsters';
import { Stage } from '../render/Stage';
import { ModelUnitView } from '../render/units/model/ModelUnitView';
import { ACTIVE_ZONE } from '../config/zones';
import { tileToWorld } from '../render/coords';

const DT = 1 / 60;
type State = 'parado' | 'andando' | 'ataque' | 'dano' | 'morte';
const ROW: { kind: string; x: number }[] = [
  { kind: 'zombieNecro', x: -2.2 },
  { kind: 'dino', x: 0 },
  { kind: 'zombie', x: 2.2 },
];

async function main(): Promise<void> {
  await loadMonsterModels();
  const container = document.getElementById('stage')!;
  const stage = new Stage(container, 14, 14);
  stage.applyTheme(ACTIVE_ZONE.theme);
  stage.setBoardSize(200, 200);
  const center = tileToWorld(1.5, 0.3);
  stage.setFocus(center, true);
  stage.zoomBy(-3);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(24, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3f5a3a, roughness: 0.95 }));
  ground.position.set(center.x, 0, center.z);
  stage.scene.add(ground);
  const camQ = stage.camera.quaternion;

  let views: ModelUnitView[] = [];
  let moving = false;
  const build = (): void => {
    for (const v of views) {
      v.root.removeFromParent();
      v.dispose();
    }
    views = ROW.map((r) => {
      const v = new ModelUnitView(r.kind, 'party');
      v.root.position.set(center.x + r.x, 0, center.z);
      v.setFacing(1, 0, true);
      stage.scene.add(v.root);
      return v;
    });
  };
  build();

  const step = (dt: number): void => {
    for (const v of views) v.update(dt, moving ? 1 : 0, 1, camQ);
  };
  const show = (state: State): void => {
    build();
    moving = state === 'andando';
    for (const v of views) {
      if (state === 'ataque') v.attack();
      if (state === 'dano') v.hit();
      if (state === 'morte') v.die();
    }
    step(0);
  };
  const advance = (sec: number): void => {
    const n = Math.round(sec / DT);
    for (let i = 0; i < n; i++) step(DT);
  };
  const snap = (): void => stage.render(0);

  (window as unknown as { __dino: unknown }).__dino = { show, advance, snap, states: ['parado', 'andando', 'ataque', 'dano', 'morte'] };
  snap();
  (window as unknown as { __dinoReady?: boolean }).__dinoReady = true;
}

void main();
