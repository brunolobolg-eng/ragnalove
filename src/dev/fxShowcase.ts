/**
 * Vitrine de efeitos de combate (dev, fora do build): cada habilidade roda com a classe e os inimigos reais,
 * passo fixo de 1/60 s, pelo mesmo despachante (`classVisual`) que o GameView usa.
 * Uso no console/Playwright: __fxShow.list(), __fxShow.play('mage/bolt'), __fxShow.advance(segundos).
 */
import * as THREE from 'three';
// a ordem importa (como na bancada): a configuração de modelos carrega antes do Stage
import { loadMonsterModels } from '../render/units/model/glbMonsters';
import { Stage } from '../render/Stage';
import { ParticleLayer } from '../render/fx/Particles';
import { RibbonPool } from '../render/fx/kit/Ribbons';
import { DecalLayer } from '../render/fx/kit/Decals';
import type { FxKit, OneShotFx } from '../render/fx/kit/FxKit';
import { ModelUnitView } from '../render/units/model/ModelUnitView';
import { FloatText } from '../render/fx/FloatText';
import { ACTIVE_ZONE } from '../config/zones';
import { warmFxTextures } from '../render/fx/kit/vfxTextures';
import { tileToWorld } from '../render/coords';
import { classVisual, ALL_DEMOS } from '../render/fx/combat/classVisual';
import type { CombatVisualCtx, VisualUnit } from '../render/fx/combat/CombatVisualCtx';
import type { DemoEntry, FxClass } from '../render/fx/combat/demos';
import type { SimEvent } from '../core/sim/types';

const DT = 1 / 60;
const CASTER = 1;
const GRUNTS = [2, 3, 4];
const GRUNT_TILES = [
  [3, 0],
  [3, 1],
  [4, -1],
];

interface Actor {
  view: ModelUnitView;
  kind: string;
}

async function main(): Promise<void> {
  await loadMonsterModels();
  const container = document.getElementById('stage')!;
  const stage = new Stage(container, 14, 14);
  stage.applyTheme(ACTIVE_ZONE.theme);
  // a câmera fica presa ao tabuleiro: a vitrine não tem tabuleiro, então o limite cobre as coordenadas de tile reais
  stage.setBoardSize(200, 200);
  stage.setFocus(tileToWorld(1.5, 0.3), true);
  stage.zoomBy(-6);
  // o chão fica sob a cena de demonstração (os tiles do jogo não estão perto da origem do mundo)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(24, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3f5a3a, roughness: 0.95 }));
  ground.position.copy(tileToWorld(1.5, 0.3));
  ground.receiveShadow = true;
  stage.scene.add(ground);

  const world = new THREE.Group();
  stage.scene.add(world);
  const particles = new ParticleLayer(stage.scene);
  particles.setScale(stage.projScale());
  const ribbons = new RibbonPool(stage.scene);
  const decals = new DecalLayer(stage.scene);
  const kit: FxKit = { stage, particles, ribbons, decals, hitStop: () => {} };

  const actors = new Map<number, Actor>();
  const oneShots: OneShotFx[] = [];
  let t = 0;
  let pending: { at: number; e: SimEvent }[] = [];
  let current: DemoEntry | undefined;
  const camQ = stage.camera.quaternion;

  const ctx: CombatVisualCtx = {
    kit,
    add(fx) {
      world.add(fx.group);
      oneShots.push(fx);
    },
    view: (id) => actors.get(id)?.view as VisualUnit | undefined,
    kindOf: (id) => actors.get(id)?.kind,
    pos: (id) => actors.get(id)?.view.root.position.clone(),
    tile: (x, y, lift) => tileToWorld(x, y, undefined, lift),
    // aproximações da vitrine: a ponta do cajado e do arco ficam perto da mão (o jogo usa o osso do modelo)
    staffTip: (id) => actors.get(id)?.view.root.position.clone().add(new THREE.Vector3(0.35, 1.2, 0.1)),
    bowTip: (id) => actors.get(id)?.view.root.position.clone().add(new THREE.Vector3(0, 1.3, 0)) ?? new THREE.Vector3(),
    spectre: () => {},
    // a vitrine não desenha armadilhas no chão (o disparo mostra só o efeito)
    trapGone: () => {},
    float: (text, pos, color, size = 0.3, life = 0.9, rise = 0.7) => {
      const f = new FloatText(text, pos, color, { size, life, rise });
      world.add(f.group);
      oneShots.push(f);
    },
    shake: (a) => stage.addShake(a),
    kick: (a) => stage.kick(a),
    aberrate: (a) => stage.aberrate(a),
  };

  function setup(cls: FxClass): void {
    for (const a of actors.values()) {
      a.view.root.removeFromParent();
      a.view.dispose();
    }
    actors.clear();
    const caster = new ModelUnitView(cls, 'party');
    caster.root.position.copy(tileToWorld(0, 0));
    caster.setFacing(1, 0, true);
    stage.scene.add(caster.root);
    actors.set(CASTER, { view: caster, kind: cls });
    GRUNTS.forEach((id, i) => {
      const g = new ModelUnitView('grunt', 'enemy');
      g.root.position.copy(tileToWorld(GRUNT_TILES[i][0], GRUNT_TILES[i][1]));
      g.setFacing(-1, 0, true);
      stage.scene.add(g.root);
      actors.set(id, { view: g, kind: 'grunt' });
    });
  }

  function play(key: string): boolean {
    const d = ALL_DEMOS.find((x) => `${x.cls}/${x.id}` === key);
    if (!d) return false;
    for (const fx of oneShots) fx.group.removeFromParent();
    oneShots.length = 0;
    setup(d.cls);
    current = d;
    t = 0;
    pending = d.steps({ caster: CASTER, t1: GRUNTS[0], t2: GRUNTS[1], t3: GRUNTS[2] }).slice().sort((a, b) => a.at - b.at);
    return true;
  }

  function step(dt: number): void {
    t += dt;
    while (pending.length && pending[0].at <= t) {
      const s = pending.shift()!;
      // o GameView também faz o recuo de vida do alvo em cada dano
      if (s.e.type === 'damage') actors.get(s.e.unitId)?.view.hit();
      classVisual(s.e, ctx);
    }
    particles.update(dt);
    ribbons.update(dt, stage.camera.position);
    decals.update(dt);
    for (const fx of oneShots) fx.update(dt);
    for (let i = oneShots.length - 1; i >= 0; i--) {
      if (oneShots[i].done) {
        oneShots[i].group.removeFromParent();
        oneShots.splice(i, 1);
      }
    }
    for (const a of actors.values()) a.view.update(dt, 0, 1, camQ);
    stage.render(dt);
  }

  await warmFxTextures();
  (window as unknown as { __fxShow: unknown }).__fxShow = {
    list: () => ALL_DEMOS.map((d) => `${d.cls}/${d.id}`),
    labels: () => ALL_DEMOS.map((d) => `${d.cls}/${d.id} — ${d.label} (${d.span}s)`),
    play,
    advance: (sec: number) => {
      const n = Math.round(sec / DT);
      for (let i = 0; i < n; i++) step(DT);
      return t;
    },
    span: () => current?.span ?? 0,
  };
  step(0);
  (window as unknown as { __fxReady?: boolean }).__fxReady = true;
}

void main();
