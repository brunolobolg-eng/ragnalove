import * as THREE from 'three';
import type { Simulation } from '../core/sim/Simulation';
import type { SimEvent } from '../core/sim/types';
import { BoardView } from './BoardView';
import { tileToWorld } from './coords';
import { CLEAVE_IMPACT, CleaveFX } from './fx/CleaveFX';
import { BASH_IMPACT, BashFX } from './fx/BashFX';
import { SpectreFX } from './fx/SpectreFX';
import { DecalLayer } from './fx/kit/Decals';
import { RibbonPool } from './fx/kit/Ribbons';
import { VFX } from './fx/kit/vfxSettings';
import type { FxKit } from './fx/kit/FxKit';
import { FireBarrierFX } from './fx/FireBarrierFX';
import { ParticleLayer } from './fx/Particles';
import { SoulFX } from './fx/SoulFX';
import { FloatText } from './fx/FloatText';
import { FrostBoltFX } from './fx/FrostBoltFX';
import { LootFX } from './fx/LootFX';
import { MeteorFX, ShadowBoltFX, StompFX, telegraph, ArrowFX, FocusFX, FuryFX, NovaFX, PierceFX, RainFX, ShockwaveFX, StormFX, TauntFX, combustBurst, focusTick, frostTick, furyTick, healTick, refineAuraTick, refineRing, holyBurst, sanctuaryDecal, shieldBurst, trapBlast } from './fx/SkillFX';
import { RARITY_INFO } from '../core/progression/equipment';
import { GAME_CONFIG } from '../config/gameConfig';
import type { Stage } from './Stage';
import { createUnitView, type AnyUnitView } from './units/createUnitView';
import { SpriteUnitView } from './units/SpriteUnitView';
import { hitSeverity, ModelUnitView } from './units/model/ModelUnitView';
import { ObjectView } from './ObjectView';
import { FogView } from './FogView';
import { OBJECT_RULES } from '../core/sim/objects';
import { VFXManager, type VfxHandle } from './fx/vfx/VFXManager';
import { registerVfxLibrary } from './fx/vfx/library';
import { isHeroKind } from '../config/heroes';
import { VISUAL_CONFIG } from '../config/visualConfig';

/** Armadilha no chão: aro de ferro com dentes (só visual). */
/** Cor da placa de cada armadilha: comum (bronze), mina (vermelha), congelante (azul), claymore (laranja). */
const TRAP_PLATE: Record<string, number> = { snare: 0x8a6a3a, mine: 0xc0402a, freeze: 0x4aa0ff, claymore: 0xff8a1a };

function trapMesh(kind = 'snare'): THREE.Group {
  const g = new THREE.Group();
  const iron = new THREE.MeshLambertMaterial({ color: 0x6e6a62, flatShading: true });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 5, 16).rotateX(-Math.PI / 2), iron);
  ring.position.y = 0.03;
  g.add(ring);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 4), iron);
    tooth.position.set(Math.cos(a) * 0.24, 0.08, Math.sin(a) * 0.24);
    tooth.rotation.z = Math.cos(a) * 0.5;
    tooth.rotation.x = -Math.sin(a) * 0.5;
    g.add(tooth);
  }
  const plate = new THREE.Mesh(new THREE.CircleGeometry(kind === 'snare' ? 0.12 : 0.17, 10).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: TRAP_PLATE[kind] ?? TRAP_PLATE.snare, emissive: kind === 'snare' ? 0x000000 : TRAP_PLATE[kind], emissiveIntensity: 0.35 }));
  plate.position.y = 0.025;
  g.add(plate);
  g.traverse((o: THREE.Object3D) => (o.castShadow = true));
  return g;
}

registerVfxLibrary();

const C_ICHOR = new THREE.Color(0.25, 0.05, 0.04);
const C_ICHOR_END = new THREE.Color(0.08, 0.02, 0.02);
/** Faíscas curtas do golpe final (a alma em si é o SoulFX). */
const C_SOUL = new THREE.Color(2.5, 0.6, 0.2);
const C_SOUL_END = new THREE.Color(0.4, 0.05, 0.02);
const C_SPAWN = new THREE.Color(0.9, 0.2, 1.6);
const AURA_MAGE = new THREE.Color(0.45, 0.8, 1.6);
const AURA_WARRIOR = new THREE.Color(1.6, 0.25, 0.25);
const AURA_ARCHER = new THREE.Color(0.5, 1.6, 0.45);
/** Faíscas do Quarks por origem do dano (DoT e chuva ficam de fora: seriam ruído na horda). */
const HIT_VFX: Partial<Record<string, string>> = { melee: 'hitSpark', cleave: 'hitSpark', bash: 'hitSpark', arrow: 'hitSpark', pierce: 'hitSpark', bolt: 'hitSparkFrost', nova: 'hitSparkFrost', storm: 'hitSparkFrost', shock: 'hitSparkFrost', combust: 'hitSparkFire', meteor: 'hitSparkFire', spell: 'hitSparkFire' };
/** Objetos que soltam farpas de madeira ao quebrar (o resto solta pedra). */
const WOOD_OBJECTS = new Set(['cart', 'roots', 'torch', 'altar', 'campfire', 'oilBarrel']);
const WIND = new THREE.Vector3(1, 0, 0.11).normalize();

/**
 * Eventos que começam com uma animação de quem age. A animação toca na hora e o efeito (projétil,
 * explosão, dano no alvo, som) sai no instante do impacto/lançamento dela (AttackImpact / CastRelease).
 * `impactAt`: o efeito já tem tempo próprio (o golpe é que se ajusta a ele); `now`: aviso que sai na hora.
 */
const ANIM_SYNC: Partial<Record<SimEvent['type'], { kind: 'attack' | 'heavy' | 'cast'; impactAt?: number; now?: boolean; instantFacing?: boolean }>> = {
  melee: { kind: 'attack' },
  bolt: { kind: 'attack' },
  arrow: { kind: 'attack' },
  pierce: { kind: 'heavy' },
  cleave: { kind: 'attack', impactAt: CLEAVE_IMPACT, instantFacing: true },
  bash: { kind: 'heavy', impactAt: BASH_IMPACT, instantFacing: true },
  execute: { kind: 'heavy' },
  shockwave: { kind: 'heavy' },
  stomp: { kind: 'heavy' },
  cast: { kind: 'cast' },
  nova: { kind: 'cast' },
  storm: { kind: 'cast' },
  taunt: { kind: 'cast' },
  fury: { kind: 'cast' },
  focus: { kind: 'cast' },
  rain: { kind: 'cast' },
  curse: { kind: 'cast' },
  shadowBolt: { kind: 'cast' },
  divineHeal: { kind: 'cast' },
  holyShield: { kind: 'cast' },
  blessing: { kind: 'cast' },
  sanctuary: { kind: 'cast' },
  telegraph: { kind: 'cast', now: true },
};
/** Abaixo disso (s) o efeito sai junto com a animação. */
const MIN_LEAD = 0.03;
/** Suavização do deslocamento entre tiles (s): andar contínuo, aceleração e frenagem naturais. */
const MOVE_SMOOTH = 0.07;

/**
 * Espelho visual da simulação. Lê o estado (somente leitura) e consome os
 * eventos de cada tick para disparar efeitos. Nunca altera a simulação.
 */
export class GameView {
  boardView!: BoardView;
  readonly particles: ParticleLayer;
  private units = new Map<number, AnyUnitView>();
  private kinds = new Map<number, string>();
  private corpses: AnyUnitView[] = [];
  private fires = new Map<number, FireBarrierFX>();
  /** Barreiras que já terminaram na simulação mas ainda fazem fade-out. */
  private fading: FireBarrierFX[] = [];
  private flashTiles: { tiles: { x: number; y: number }[]; t: number } | undefined;
  private oneShots: { update(dt: number): void; done: boolean; group: THREE.Group }[] = [];
  /** Kit compartilhado pelos efeitos (partículas, fitas, decalques, luzes, hit-stop). */
  readonly kit: FxKit;
  /** Efeitos do three.quarks (pool central, tocados por nome). */
  readonly vfx: VFXManager;
  private sandVfx?: VfxHandle;
  private readonly ribbons: RibbonPool;
  private readonly decals: DecalLayer;
  private hitStopT = 0;
  /** Reações de dano esperando o golpe/projétil acertar (sincroniza impacto com a animação). */
  private deferred: { t: number; events: SimEvent[] }[] = [];
  /** Tempo (s) até o impacto/lançamento da animação disparada neste tick, por unidade (som e dano esperam). */
  private leads = new Map<number, number>();
  /** De onde veio o último golpe em cada unidade (a reação e a queda seguem essa direção). */
  private lastHitFrom = new Map<number, THREE.Vector3>();
  /** Posição suavizada e velocidade de cada unidade (andar contínuo entre tiles). */
  private motion = new Map<number, { pos: THREE.Vector3; vel: THREE.Vector3 }>();
  /** Último empurrão (tick) já mostrado por unidade. */
  private knocked = new Map<number, number>();
  /** Equipamentos no chão até o fim da onda. */
  private loot: LootFX[] = [];
  private readonly world = new THREE.Group();
  private sim!: Simulation;
  /** Estados visuais contínuos (segundos restantes). */
  private frozen = new Map<number, number>();
  private fury = new Map<number, number>();
  private healCd = new Map<number, number>();
  /** Refino máximo equipado por herói (aura cosmética a partir de +5). */
  private auras: Record<string, number> = {};
  private auraT = 0;
  private ringT = 0;

  /**
   * Planejamento "com vida": cada herói passeia perto do posto que o jogador ordenou
   * (só apresentação — a simulação continua com o herói no tile do posto).
   */
  private idle = new Map<string, { pos: THREE.Vector3; path: THREE.Vector3[]; wait: number; ordered: boolean; post: string }>();
  private keepIdle = false;

  /** A próxima troca de simulação é só uma ordem de posição: os heróis andam até o posto novo. */
  keepPartyPositions(): void {
    this.keepIdle = true;
  }

  /** Marca no chão onde o jogador mandou o herói ir. */
  orderMarker(x: number, y: number, color: number): void {
    const cfg = VISUAL_CONFIG.orders;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.38, 32).rotateX(-Math.PI / 2), mat);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16).rotateX(-Math.PI / 2), mat.clone());
    const g = new THREE.Group();
    g.add(ring, dot);
    g.position.copy(tileToWorld(x, y, undefined, 0.05));
    this.world.add(g);
    let t = 0;
    this.oneShots.push({
      group: g,
      done: false,
      update(dt: number) {
        t += dt / cfg.markerTime;
        const k = Math.min(1, t);
        ring.scale.setScalar(1 + k * 1.4);
        mat.opacity = 0.9 * (1 - k);
        (dot.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
        if (k >= 1) {
          this.done = true;
          g.removeFromParent();
        }
      },
    });
  }

  /** Caminho em tiles (8 direções, só chão) do tile a ao b; vazio se não houver. */
  private tilePath(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number }[] {
    const board = this.sim.board;
    const key = (x: number, y: number) => y * board.width + x;
    const prev = new Map<number, number>();
    const q: [number, number][] = [[a.x, a.y]];
    prev.set(key(a.x, a.y), -1);
    while (q.length) {
      const [x, y] = q.shift()!;
      if (x === b.x && y === b.y) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (prev.has(key(nx, ny)) || !board.isWalkable(nx, ny)) continue;
        if (dx && dy && (!board.isWalkable(x + dx, y) || !board.isWalkable(x, y + dy))) continue;
        prev.set(key(nx, ny), key(x, y));
        q.push([nx, ny]);
      }
    }
    if (!prev.has(key(b.x, b.y))) return [];
    const out: { x: number; y: number }[] = [];
    for (let k = key(b.x, b.y); k !== -1; k = prev.get(k)!) out.push({ x: k % board.width, y: Math.floor(k / board.width) });
    return out.reverse();
  }

  /** Movimento livre do herói no planejamento; devolve se está andando. */
  private idleStep(kind: string, u: { x: number; y: number }, v: AnyUnitView, dt: number): boolean {
    const cfg = VISUAL_CONFIG.idleWander;
    const post = `${u.x},${u.y}`;
    const anchor = tileToWorld(u.x, u.y);
    let st = this.idle.get(kind);
    if (!st) {
      st = { pos: anchor.clone(), path: [], wait: Math.random() * cfg.waitMax, ordered: false, post };
      this.idle.set(kind, st);
    }
    if (st.post !== post) {
      // ordem nova: vai andando até o posto pelo chão
      st.post = post;
      st.ordered = true;
      const from = { x: Math.round(st.pos.x + this.sim.board.width / 2 - 0.5), y: Math.round(st.pos.z + this.sim.board.height / 2 - 0.5) };
      st.path = this.tilePath(from, u).slice(1).map((t) => tileToWorld(t.x, t.y));
      if (!st.path.length) st.path = [anchor.clone()];
      st.wait = 0;
    }
    if (!st.path.length) {
      st.wait -= dt;
      if (st.wait <= 0) {
        // passeio curto em volta do posto
        const a = Math.random() * Math.PI * 2;
        const r = cfg.radius * Math.sqrt(Math.random());
        st.path = [anchor.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r))];
        st.wait = cfg.waitMin + Math.random() * (cfg.waitMax - cfg.waitMin);
      }
    }
    let moving = false;
    if (st.path.length) {
      const goal = st.path[0];
      const d = goal.clone().sub(st.pos);
      d.y = 0;
      const dist = d.length();
      const step = (st.ordered ? cfg.orderSpeed : cfg.speed) * dt;
      if (dist <= step) {
        st.pos.copy(goal);
        st.path.shift();
        if (!st.path.length) st.ordered = false;
      } else {
        st.pos.addScaledVector(d, step / dist);
        v.setFacing(d.x, d.z);
        moving = true;
      }
    }
    v.root.position.copy(st.pos);
    if (!moving && st.wait < cfg.lookAtCameraAfter) v.setFacing(0, 1);
    return moving;
  }

  setHeroAuras(a: Record<string, number>): void {
    this.auras = { ...a };
  }

  constructor(private readonly stage: Stage) {
    this.particles = new ParticleLayer(stage.scene);
    this.particles.setScale(stage.projScale());
    stage.onResize = (s) => this.particles.setScale(s);
    stage.scene.add(this.world);
    SpriteUnitView.camera = stage.camera;
    this.ribbons = new RibbonPool(stage.scene);
    this.decals = new DecalLayer(stage.scene);
    this.vfx = new VFXManager(stage.scene);
    this.kit = {
      stage,
      particles: this.particles,
      ribbons: this.ribbons,
      decals: this.decals,
      hitStop: (sec) => {
        if (VFX.hitStop) this.hitStopT = Math.max(this.hitStopT, sec);
      },
    };
  }

  /** Objetos interativos e neblina do mapa (refeitos a cada simulação nova). */
  objectView?: ObjectView;
  private fogView?: FogView;
  /** Tempestade de areia ativa (só apresentação). */
  private storm = 0;
  private stormOn = false;
  private heatSpots: THREE.Vector3[] = [];
  /** Avisos de "!" de provocação já mostrados (um por inimigo). */
  private aggroShown = new Set<number>();
  onCityHit?: (damage: number, hp: number, max: number) => void;

  /** Zona mudou (nova região da run): refaz o cenário e a grade visual. */
  rebuildBoard(): void {
    this.boardView?.dispose();
    this.boardView = undefined as unknown as BoardView;
    this.fogView?.dispose();
    this.fogView = undefined;
  }

  /** (Re)vincula a uma simulação nova (setup, reinício). */
  bind(sim: Simulation): void {
    if (!this.boardView) {
      this.boardView = new BoardView(sim.board);
      this.stage.scene.add(this.boardView.group);
      this.stage.setBoardSize(sim.board.width, sim.board.height);
      this.fogView = new FogView(sim);
      this.stage.scene.add(this.fogView.group);
      // pontos de calor (deserto): areia aberta longe das paredes
      this.heatSpots = [];
      if (GAME_CONFIG.board.theme === 'desert')
        for (let i = 0; i < 40 && this.heatSpots.length < 6; i++) {
          const x = 3 + Math.floor(((i * 7919) % 97) / 97 * (sim.board.width - 6));
          const y = 4 + Math.floor(((i * 104729) % 89) / 89 * (sim.board.height - 10));
          if (sim.board.isWalkable(x, y) && !sim.board.isWall(x + 1, y) && !sim.board.isWall(x - 1, y)) this.heatSpots.push(tileToWorld(x, y, undefined, 0.3));
        }
    }
    this.fogView?.bind(sim);
    this.objectView?.dispose();
    this.objectView = new ObjectView(sim);
    this.stage.scene.add(this.objectView.group);
    this.storm = 0;
    this.stormOn = false;
    this.aggroShown.clear();
    this.sim = sim;
    if (!this.keepIdle) this.idle.clear();
    this.keepIdle = false;
    for (const u of this.units.values()) u.dispose();
    for (const c of this.corpses) c.dispose();
    for (const f of this.fires.values()) f.dispose();
    for (const f of this.fading) f.dispose();
    this.fading = [];
    for (const o of this.oneShots) o.group.removeFromParent();
    for (const l of this.loot) l.dispose();
    for (const g of this.trapMeshes.values()) g.removeFromParent();
    this.trapMeshes.clear();
    this.loot = [];
    this.units.clear();
    this.kinds.clear();
    this.corpses = [];
    this.fires.clear();
    this.oneShots = [];
    this.particles.clear();
    this.ribbons.clear();
    this.decals.clear();
    this.vfx.clear();
    this.sandVfx = undefined;
    this.deferred = [];
    this.hitStopT = 0;
    this.frozen.clear();
    this.fury.clear();
    for (const u of sim.units.values()) this.addUnit(u.id);
  }

  private addUnit(id: number): AnyUnitView | undefined {
    const u = this.sim.units.get(id);
    if (!u) return undefined;
    const v = createUnitView(u.kind, u.team);
    v.setFacing(u.facing.x, u.facing.y, true);
    tileToWorld(u.x, u.y, v.root.position);
    this.world.add(v.root);
    this.units.set(id, v);
    this.kinds.set(id, u.kind);
    return v;
  }

  /** Armadilhas armadas (visual), por id. */
  private readonly trapMeshes = new Map<number, THREE.Group>();

  /** Mão do arco da Arqueira (origem das flechas). */
  private bowTip(id: number, from: { x: number; y: number }): THREE.Vector3 {
    const v = this.units.get(id);
    if (v instanceof ModelUnitView) return v.socketWorld('hand.L', new THREE.Vector3(0, 0, 0.05)) ?? tileToWorld(from.x, from.y, undefined, 1.1);
    return tileToWorld(from.x, from.y, undefined, 1.1);
  }

  /** Ponta do cajado (orbe) do Mago, de onde saem as magias. */
  private staffTip(id: number): THREE.Vector3 | undefined {
    const v = this.units.get(id);
    if (!v) return undefined;
    if (v instanceof ModelUnitView) return v.socketWorld('hand.R', new THREE.Vector3(0, 0.72, 0.02));
    return 'chestWorld' in v ? v.chestWorld().add(new THREE.Vector3(0, 0.35, 0)) : v.root.position.clone().setY(1.2);
  }

  private boltFrom(e: { unitId: number; from: { x: number; y: number } }): THREE.Vector3 {
    return this.staffTip(e.unitId) ?? tileToWorld(e.from.x, e.from.y, undefined, 1.2);
  }

  /**
   * Os eventos da simulação chegam no tick em que o dano já foi aplicado. Para o impacto
   * visual bater com a animação (golpe descendo, projétil chegando), a reação do alvo —
   * dano, morte, alma, EXP e drop — é adiada até o momento do acerto. Só apresentação.
   */
  private deferImpacts(events: SimEvent[]): SimEvent[] {
    const delay = new Map<number, number>();
    const lead = (id: number) => this.leads.get(id) ?? 0;
    for (const e of events) {
      if (e.type === 'bolt') delay.set(e.targetId, lead(e.unitId) + FrostBoltFX.impactDelay(this.boltFrom(e), tileToWorld(e.to.x, e.to.y, undefined, 0.6)));
      else if (e.type === 'melee' && lead(e.unitId) > 0) delay.set(e.targetId, lead(e.unitId));
      else if (e.type === 'execute' && lead(e.unitId) > 0) delay.set(e.targetId, lead(e.unitId));
      else if (e.type === 'bash') delay.set(e.targetId, BASH_IMPACT);
      else if (e.type === 'meteor') {
        for (const u of this.sim.units.values()) if (u.team === 'party' && Math.max(Math.abs(u.x - e.x), Math.abs(u.y - e.y)) <= e.radius) delay.set(u.id, 0.28);
      }
      else if (e.type === 'shadowBolt') delay.set(e.targetId, lead(e.unitId) + ShadowBoltFX.impactDelay(tileToWorld(e.from.x, e.from.y, undefined, 1.0), tileToWorld(e.to.x, e.to.y, undefined, 0.9)));
      else if (e.type === 'arrow') delay.set(e.targetId, lead(e.unitId) + ArrowFX.impactDelay(this.bowTip(e.unitId, e.from), tileToWorld(e.to.x, e.to.y, undefined, 0.6)));
      else if (e.type === 'rain') {
        for (const u of this.sim.units.values()) if (u.team === 'enemy' && Math.max(Math.abs(u.x - e.x), Math.abs(u.y - e.y)) <= e.radius) delay.set(u.id, lead(e.unitId) + RainFX.IMPACT);
      }
    }
    // dano de habilidade sem projétil (nova, tempestade, onda de choque...): sai no lançamento de quem lançou
    for (const e of events) if (e.type === 'damage' && e.sourceId !== undefined && !delay.has(e.unitId) && lead(e.sourceId) > MIN_LEAD) delay.set(e.unitId, lead(e.sourceId));
    for (const e of events) if (e.type === 'damage' && e.source === 'cleave' && !delay.has(e.unitId)) delay.set(e.unitId, CLEAVE_IMPACT);
    if (!delay.size) return events;
    const now: SimEvent[] = [];
    const victimTiles = new Map<string, number>();
    for (const e of events) {
      let d: number | undefined;
      if (e.type === 'damage' || e.type === 'death' || e.type === 'avoid') d = delay.get(e.unitId);
      else if (e.type === 'soul') {
        d = delay.get(e.fromId);
        if (d !== undefined) victimTiles.set(`${e.x},${e.y}`, d);
      } else if (e.type === 'exp' || e.type === 'drop') d = victimTiles.get(`${e.x},${e.y}`);
      if (d !== undefined) this.deferred.push({ t: d, events: [e] });
      else now.push(e);
    }
    return now;
  }

  /**
   * Toca a animação de quem age (golpe/magia) e guarda quanto falta para o impacto/lançamento.
   */
  private animateActors(events: SimEvent[]): void {
    this.leads.clear();
    for (const e of events) {
      const sync = ANIM_SYNC[e.type];
      const id = sync && 'unitId' in e ? e.unitId : undefined;
      const v = id !== undefined ? this.units.get(id) : undefined;
      if (!sync || id === undefined || !v) continue;
      if (this.leads.has(id)) continue; // uma animação por unidade por tick
      const u = this.sim.units.get(id);
      const f = e.type === 'cleave' ? e.facing : u?.facing;
      if (f) v.setFacing(f.x, f.y, sync.instantFacing);
      const opts = sync.impactAt !== undefined ? { impactAt: sync.impactAt } : {};
      const t = sync.kind === 'cast' ? v.cast(opts) : v.attack(sync.kind === 'heavy' ? 'heavy' : 'swing', opts);
      this.leads.set(id, sync.impactAt !== undefined || sync.now ? 0 : t);
    }
  }

  /** Efeitos dos eventos animados saem no impacto/lançamento (os demais seguem agora). */
  private deferSynced(events: SimEvent[]): SimEvent[] {
    const now: SimEvent[] = [];
    const later = new Map<number, SimEvent[]>();
    for (const e of events) {
      const sync = ANIM_SYNC[e.type];
      let id = sync && 'unitId' in e ? e.unitId : undefined;
      // a barreira de fogo nasce no lançamento da magia de quem a conjurou
      if (e.type === 'effectStart' && e.effect.kind !== 'oilFire') id = e.effect.ownerId;
      const t = id !== undefined && (sync || e.type === 'effectStart') ? (this.leads.get(id) ?? 0) : 0;
      if (t > MIN_LEAD) {
        const list = later.get(t) ?? [];
        list.push(e);
        later.set(t, list);
      } else now.push(e);
    }
    for (const [t, list] of later) this.deferred.push({ t, events: list });
    return now;
  }

  /** Tempo (s) até o impacto/lançamento da animação que a unidade começou neste tick (sons esperam por ele). */
  animLead(unitId: number): number {
    return this.leads.get(unitId) ?? 0;
  }

  handle(events: SimEvent[], immediate = false): void {
    const tmp = new THREE.Vector3();
    if (!immediate) {
      this.animateActors(events);
      events = this.deferSynced(this.deferImpacts(events));
    }
    for (const e of events) {
      switch (e.type) {
        case 'spawn': {
          const v = this.addUnit(e.unitId);
          if (v && GAME_CONFIG.bossKinds.includes(this.kinds.get(e.unitId) ?? '')) {
            // entrada do chefe: rugido, tremor e empurrão de câmera
            v.cast();
            this.stage.addShake(0.2);
            this.stage.kick(0.25);
            this.vfx.play('bossSpawn', { position: v.root.position.clone().setY(0) });
          }
          if (v) {
            this.particles.glow.emit({
              pos: tmp.copy(v.root.position).setY(0.3),
              posJitter: 0.3,
              vel: new THREE.Vector3(0, 1.2, 0),
              velJitter: 0.6,
              life: 0.6,
              size: 0.25,
              sizeEnd: 0.05,
              color: C_SPAWN,
              count: 10,
            });
          }
          break;
        }
        case 'effectStart': {
          // óleo em chamas acende direto no chão (sem a conjuração saindo do cajado)
          const oil = e.effect.kind === 'oilFire';
          const tip = oil ? undefined : this.staffTip(e.effect.ownerId);
          const owner = oil ? undefined : this.units.get(e.effect.ownerId);
          const fx = new FireBarrierFX(e.effect.tiles, this.kit, tip, owner?.root.position.clone());
          this.world.add(fx.group);
          this.fires.set(e.effect.id, fx);
          break;
        }
        case 'effectEnd': {
          // mantém o FX vivo até o fade-out terminar
          const f = this.fires.get(e.effectId);
          if (f) {
            f.end();
            this.fires.delete(e.effectId);
            this.fading.push(f);
          }
          break;
        }
        case 'cast':
          this.spectre(e.unitId, 0.85);
          break;
        case 'cleave': {
          const w = this.units.get(e.unitId);
          const u = this.sim.units.get(e.unitId);
          if (!w || !u) break;
          const tiles = e.tiles;
          const fx = new CleaveFX(u, e.facing, e.tiles, e.hitTiles, this.kit, () => (this.flashTiles = { tiles, t: 0.25 }));
          this.world.add(fx.group);
          this.oneShots.push(fx);
          this.spectre(e.unitId, 0.55);
          break;
        }
        case 'melee':
          break; // golpe animado em animateActors; o dano no alvo sai no impacto
        case 'damage': {
          const v = this.units.get(e.unitId);
          if (!v) break;
          // reação na direção do golpe, com gravidade pela fração da vida perdida
          const src = e.sourceId !== undefined ? this.units.get(e.sourceId)?.root.position.clone() : undefined;
          if (src) this.lastHitFrom.set(e.unitId, src);
          const target = this.sim.units.get(e.unitId);
          const dot = e.source === 'burn' || e.source === 'poison' || e.source === 'curse';
          v.hit({ from: src, severity: dot ? 'light' : hitSeverity(e.amount, target?.maxHp ?? 100, e.source, e.crit), head: e.source === 'arrow' || e.source === 'bolt' });
          this.damageNumber(e.unitId, e.amount, e.source, v.root.position);
          if (e.crit && e.source !== 'arrow') this.float('CRÍTICO!', v.root.position.clone().setY(1.5), '#ffd84a', 0.3);
          if (e.source === 'burn') v.burning = 0.6;
          const spark = HIT_VFX[e.source];
          if (spark) {
            const from = e.sourceId !== undefined ? this.units.get(e.sourceId)?.root.position : undefined;
            const dir = from ? tmp.copy(v.root.position).sub(from).setY(0) : undefined;
            this.vfx.play(spark, { position: v.root.position.clone().setY(0.8), direction: dir });
          }
          this.particles.smoke.emit({
            pos: tmp.copy(v.root.position).setY(0.6),
            posJitter: 0.12,
            vel: new THREE.Vector3(0, 1.4, 0),
            velJitter: 1.3,
            life: 0.5,
            size: 0.1,
            sizeEnd: 0.04,
            color: e.source === 'melee' ? new THREE.Color(0.5, 0.05, 0.05) : C_ICHOR,
            colorEnd: C_ICHOR_END,
            gravity: 6,
            count: e.source === 'burn' ? 2 : 6,
          });
          break;
        }
        case 'bolt': {
          const fx = new FrostBoltFX(this.boltFrom(e), tileToWorld(e.to.x, e.to.y, undefined, 0.6), this.kit);
          this.world.add(fx.group);
          this.oneShots.push(fx);
          this.spectre(e.unitId, 0.5);
          break;
        }
        case 'bash': {
          // Investida: golpe pesado sincronizado com a descida da espada
          const w = this.units.get(e.unitId);
          const from = w ? w.root.position.clone() : tileToWorld(e.x, e.y);
          const fx = new BashFX(from, tileToWorld(e.x, e.y), this.kit);
          this.world.add(fx.group);
          this.oneShots.push(fx);
          this.spectre(e.unitId, 0.6);
          break;
        }
        case 'avoid': {
          const v = this.units.get(e.unitId);
          if (v) this.float(e.how === 'dodge' ? 'Esquiva!' : e.how === 'deflect' ? 'Desviado!' : e.how === 'shield' ? 'Absorvido!' : 'Bloqueio!', v.root.position.clone().setY(1.9), e.how === 'deflect' ? '#f0d49a' : '#bfe6ff', 0.26);
          break;
        }
        case 'cityHit': {
          // o inimigo atravessa o portão: some num clarão vermelho e a cidade sofre
          const v = this.units.get(e.unitId);
          const at = v ? v.root.position.clone() : tileToWorld(e.x, e.y);
          if (v) {
            this.units.delete(e.unitId);
            v.root.visible = false;
            v.dispose();
          }
          this.particles.glow.emit({ pos: at.clone().setY(0.6), posJitter: 0.3, vel: new THREE.Vector3(0, 1.6, 0), velJitter: 1.2, life: 0.7, size: 0.22, sizeEnd: 0.04, color: new THREE.Color(2.4, 0.3, 0.15), colorEnd: new THREE.Color(0.4, 0.02, 0.01), count: 14 });
          if (e.damage > 0) this.float(`−${e.damage} Cidade`, at.clone().setY(1.8), '#ff6a4a', 0.36, 1.3, 0.9);
          this.stage.addShake(0.05);
          this.vfx.play('cityBreach', { position: at.clone().setY(0) });
          this.vfx.play(GAME_CONFIG.board.theme === 'forest' ? 'objectBreakWood' : 'objectBreakStone', { position: at.clone().setY(0), scale: 0.8 });
          this.onCityHit?.(e.damage, e.cityHp, e.cityMaxHp);
          break;
        }
        case 'aggro': {
          const v = this.units.get(e.unitId);
          if (v && !this.aggroShown.has(e.unitId)) {
            this.aggroShown.add(e.unitId);
            this.float('!', v.root.position.clone().setY(2.0), '#ff5a3a', 0.42, 0.8, 0.5);
          }
          break;
        }
        case 'objectSpawn': {
          this.objectView?.handle([e], this.particles);
          const c = tileToWorld(e.object.x, e.object.y);
          this.particles.smoke.emit({ pos: c.clone().setY(0.2), posJitter: 0.4, vel: new THREE.Vector3(0, 1.0, 0), velJitter: 0.8, life: 0.8, size: 0.35, sizeEnd: 0.9, color: new THREE.Color(0.55, 0.5, 0.42), alpha: 0.6, count: 6 });
          break;
        }
        case 'trapSet': {
          const g = trapMesh(e.trap.kind);
          g.position.copy(tileToWorld(e.trap.x, e.trap.y, undefined, 0.02));
          this.world.add(g);
          this.trapMeshes.set(e.trap.id, g);
          break;
        }
        case 'trapTrigger': {
          const g = this.trapMeshes.get(e.trapId);
          if (g) {
            g.removeFromParent();
            g.traverse((o: THREE.Object3D) => {
              const m = o as THREE.Mesh;
              m.geometry?.dispose();
              (m.material as THREE.Material | undefined)?.dispose();
            });
            this.trapMeshes.delete(e.trapId);
          }
          const p = tileToWorld(e.x, e.y, undefined, 0.4);
          this.particles.glow.emit({ pos: p, posJitter: 0.2, vel: new THREE.Vector3(0, 2.0, 0), velJitter: 1.6, life: 0.4, size: 0.12, sizeEnd: 0.03, color: new THREE.Color(1.6, 1.4, 0.8), colorEnd: new THREE.Color(0.4, 0.3, 0.1), count: 10 });
          if (e.kind && e.kind !== 'snare') {
            trapBlast(this.kit, p, e.kind, e.radius ?? 1);
            this.float(e.kind === 'freeze' ? 'Congelados!' : e.kind === 'claymore' ? 'CLAYMORE!' : 'BOOM!', p.clone().setY(1.7), e.kind === 'freeze' ? '#9ad8ff' : '#ffb04a', 0.3);
          } else {
            this.float('Armadilha!', p.clone().setY(1.7), '#ffd08a', 0.28);
            this.stage.addShake(0.05);
          }
          break;
        }
        case 'divineHeal': {
          const t = this.units.get(e.targetId);
          if (t) holyBurst(this.kit, t.root.position);
          break;
        }
        case 'holyShield': {
          const t = this.units.get(e.targetId);
          if (t) {
            shieldBurst(this.kit, t.root.position);
            this.float('Escudo Sagrado', t.root.position.clone().setY(1.9), '#9ac8ff', 0.26);
          }
          break;
        }
        case 'blessing': {
          this.spectre(e.unitId, 0.7);
          for (const id of e.targets) {
            const t = this.units.get(id);
            if (t) holyBurst(this.kit, t.root.position, 18);
          }
          const c = this.units.get(e.unitId);
          if (c) this.float('Bênção!', c.root.position.clone().setY(2), '#ffe08a', 0.32);
          break;
        }
        case 'sanctuary': {
          const p = tileToWorld(e.x, e.y);
          sanctuaryDecal(this.kit, p, e.radius, e.ticks / 10);
          this.float('Santuário', p.clone().setY(1.6), '#ffe08a', 0.3);
          break;
        }
        case 'curse': {
          this.spectre(e.unitId, 0.7);
          telegraph(this.kit, tileToWorld(e.x, e.y), e.radius, 0.6);
          for (const u of this.sim.units.values())
            if (u.team === 'enemy' && Math.max(Math.abs(u.x - e.x), Math.abs(u.y - e.y)) <= e.radius)
              this.particles.glow.emit({ pos: tileToWorld(u.x, u.y, undefined, 1.0), posJitter: 0.3, vel: new THREE.Vector3(0, 0.8, 0), velJitter: 0.4, life: 0.9, size: 0.18, sizeEnd: 0.05, color: new THREE.Color(1.4, 0.2, 1.2), colorEnd: new THREE.Color(0.2, 0.0, 0.2), count: 4 });
          break;
        }
        case 'execute': {
          this.float('EXECUÇÃO!', tileToWorld(e.x, e.y, undefined, 1.8), '#ffd04a', 0.36, 1.1);
          break;
        }
        case 'objectHit':
        case 'objectState':
        case 'oilIgnite':
        case 'mud':
          this.objectView?.handle([e], this.particles);
          if (e.type === 'objectState' && e.state === 'broken') {
            this.stage.addShake(0.08);
            const o = this.sim.objects.get(e.objectId);
            if (o) this.vfx.play(WOOD_OBJECTS.has(o.type) ? 'objectBreakWood' : 'objectBreakStone', { position: tileToWorld(o.x, o.y) });
          }
          if (e.type === 'oilIgnite') {
            const o = this.sim.objects.get(e.objectId);
            if (o) this.vfx.play('oilBurst', { position: tileToWorld(o.x, o.y) });
            this.stage.addShake(0.12);
            this.stage.kick(0.15);
            for (const t of e.tiles) this.particles.glow.emit({ pos: tileToWorld(t.x, t.y, undefined, 0.3), posJitter: 0.4, vel: new THREE.Vector3(0, 2.2, 0), velJitter: 1.0, life: 0.6, size: 0.3, sizeEnd: 0.05, color: new THREE.Color(3, 1.3, 0.3), colorEnd: new THREE.Color(0.5, 0.08, 0.02), count: 3 });
          }
          if (e.type === 'mud') for (const t of e.tiles) this.particles.smoke.emit({ pos: tileToWorld(t.x, t.y, undefined, 0.2), posJitter: 0.4, vel: new THREE.Vector3(0, 0.6, 0), velJitter: 0.5, life: 0.9, size: 0.3, sizeEnd: 0.6, color: new THREE.Color(0.3, 0.22, 0.14), alpha: 0.6 });
          break;
        case 'ruinCollapse': {
          this.objectView?.handle([e], this.particles);
          const c = tileToWorld(e.x, e.y);
          this.stage.addShake(0.3);
          this.stage.kick(0.2);
          this.vfx.play('ruinDebris', { position: c, scale: Math.max(1, e.radius * 0.6) });
          this.kit.decals.spawn({ kind: 'crack', pos: c.clone().setY(0.02), size: e.radius * 2.6, color: new THREE.Color(0.35, 0.28, 0.2), life: 4, fadeOut: 0.5 });
          this.particles.smoke.emit({ pos: c.clone().setY(0.4), posJitter: e.radius * 0.8, vel: new THREE.Vector3(0, 1.2, 0), velJitter: 2.2, life: 2.0, size: 0.8, sizeEnd: 2.4, color: new THREE.Color(0.62, 0.5, 0.36), alpha: 0.75, drag: 1.4, count: 30 });
          break;
        }
        case 'sandWarn':
          this.stormWarn = e.ticks / 10;
          break;
        case 'sandstorm':
          this.stormOn = e.on;
          if (e.on && !this.sandVfx?.alive) {
            // parede de vento a barlavento da câmera, acompanhando o foco
            const wall = () => this.stage.focusPoint.clone().addScaledVector(WIND, -17).setY(0);
            this.sandVfx = this.vfx.play('sandstorm', { position: wall(), direction: WIND, follow: wall });
          } else if (!e.on) this.sandVfx?.stop();
          break;
        case 'exp':
          this.float(`+${e.amount} EXP`, tileToWorld(e.x, e.y, undefined, 1.2), '#ffe27a', 0.28);
          break;
        case 'zeni':
          this.float(`+${e.amount} z`, tileToWorld(e.x, e.y, undefined, 0.75), '#f3c64e', 0.26);
          break;
        case 'levelup': {
          const v = this.units.get(e.unitId);
          if (!v) break;
          if ('levelUp' in v) v.levelUp();
          const p = v.root.position.clone();
          this.float(`NÍVEL ${e.level}!`, p.clone().setY(2.3), '#ffd84a', 0.46, 1.6, 0.9);
          // anéis, espiral e estrelas douradas (three.quarks), acompanhando o herói
          const id = e.unitId;
          this.vfx.play('levelUp', { position: p.setY(0), follow: () => this.units.get(id)?.root.position });
          break;
        }
        case 'nova': {
          const v = this.units.get(e.unitId);
          this.spectre(e.unitId, 0.7);
          this.oneShot(new NovaFX(v ? v.root.position.clone() : tileToWorld(e.x, e.y), e.radius, this.kit));
          break;
        }
        case 'freeze':
          this.frozen.set(e.unitId, e.ticks / 10);
          break;
        case 'storm': {
          this.spectre(e.unitId, 0.8);
          this.oneShot(new StormFX(e.strikes.map((s) => tileToWorld(s.x, s.y)), this.kit));
          break;
        }
        case 'taunt': {
          const v = this.units.get(e.unitId);
          if (v) this.float('Provocar!', v.root.position.clone().setY(2.2), '#ff7a5a', 0.32);
          this.oneShot(new TauntFX(v ? v.root.position.clone() : new THREE.Vector3(), e.radius, this.kit));
          break;
        }
        case 'shockwave': {
          const v = this.units.get(e.unitId);
          this.spectre(e.unitId, 0.8);
          this.oneShot(new ShockwaveFX(v ? v.root.position.clone() : tileToWorld(e.x, e.y), e.radius, this.kit));
          break;
        }
        case 'fury': {
          const v = this.units.get(e.unitId);
          this.fury.set(e.unitId, e.ticks / 10);
          if (v) {
            this.float('FÚRIA!', v.root.position.clone().setY(2.3), '#ff5a3a', 0.4, 1.2);
            this.oneShot(new FuryFX(v.root.position.clone(), this.kit));
          }
          break;
        }
        case 'heal': {
          const v = this.units.get(e.unitId);
          if (v && (this.healCd.get(e.unitId) ?? 0) <= 0) {
            healTick(this.kit, v.root.position);
            this.healCd.set(e.unitId, 0.25);
          }
          break;
        }
        case 'arrow': {
          this.oneShot(new ArrowFX(this.bowTip(e.unitId, e.from), tileToWorld(e.to.x, e.to.y, undefined, 0.6), this.kit, e.crit));
          if (e.crit) this.float('CRÍTICO!', tileToWorld(e.to.x, e.to.y, undefined, 1.5), '#ffd84a', 0.3);
          this.spectre(e.unitId, 0.4);
          break;
        }
        case 'rain': {
          this.spectre(e.unitId, 0.6);
          const u = this.sim.units.get(e.unitId);
          const fire = !!(u?.stats?.skills.fireRain);
          this.oneShot(new RainFX(tileToWorld(e.x, e.y), e.radius, this.kit, fire));
          break;
        }
        case 'pierce': {
          this.oneShot(new PierceFX(this.bowTip(e.unitId, e.from), tileToWorld(e.to.x, e.to.y, undefined, 0.6), this.kit));
          break;
        }
        case 'focus': {
          const v = this.units.get(e.unitId);
          this.fury.set(e.unitId, e.ticks / 10);
          if (v) {
            this.float('FOCO!', v.root.position.clone().setY(2.3), '#8aff8a', 0.4, 1.2);
            this.oneShot(new FocusFX(v.root.position.clone(), this.kit));
          }
          break;
        }
        case 'shadowBolt': {
          const v = this.units.get(e.unitId);
          const from = v ? v.root.position.clone().setY(1.1) : tileToWorld(e.from.x, e.from.y, undefined, 1.0);
          this.oneShot(new ShadowBoltFX(from, tileToWorld(e.to.x, e.to.y, undefined, 0.9), this.kit));
          break;
        }
        case 'stomp': {
          const v = this.units.get(e.unitId);
          this.oneShot(new StompFX(v ? v.root.position.clone() : tileToWorld(e.x, e.y), e.radius, this.kit));
          break;
        }
        case 'telegraph': {
          telegraph(this.kit, tileToWorld(e.x, e.y), e.radius, e.ticks / 10);
          break;
        }
        case 'meteor':
          this.oneShot(new MeteorFX(tileToWorld(e.x, e.y), e.radius, this.kit));
          break;
        case 'combust':
          combustBurst(this.kit, tileToWorld(e.x, e.y));
          break;
        case 'drop': {
          const fx = new LootFX(e.item, tileToWorld(e.x, e.y), this.particles);
          this.world.add(fx.group);
          this.loot.push(fx);
          this.float(RARITY_INFO[e.item.rarity].label + '!', tileToWorld(e.x, e.y, undefined, 1.0), RARITY_INFO[e.item.rarity].color, 0.3, 1.1);
          break;
        }
        case 'soul': {
          const from = tileToWorld(e.x, e.y);
          const toId = e.toId;
          const fx = new SoulFX(
            from,
            () => {
              const v = this.units.get(toId);
              return v && 'chestWorld' in v ? v.chestWorld() : v?.root.position.clone().setY(1);
            },
            this.kit,
            () => {
              const v = this.units.get(toId);
              if (v && 'absorb' in v) v.absorb();
            },
          );
          this.world.add(fx.group);
          this.oneShots.push(fx);
          break;
        }
        case 'death': {
          const v = this.units.get(e.unitId);
          if (!v) break;
          if (GAME_CONFIG.bossKinds.includes(this.kinds.get(e.unitId) ?? '')) {
            this.lastBossPos = v.root.position.clone();
            // cinemática: o chefe fica de pé (congelado no golpe final) até terminar a fala
            if (this.onBossDeath?.(this.kinds.get(e.unitId)!)) {
              this.units.delete(e.unitId);
              if (v instanceof ModelUnitView) v.hideHp();
              this.cine = { v, own: false, held: true };
              break;
            }
          }
          // cai para longe de quem deu o golpe final
          v.die(this.lastHitFrom.get(e.unitId));
          this.lastHitFrom.delete(e.unitId);
          this.units.delete(e.unitId);
          this.motion.delete(e.unitId);
          this.corpses.push(v);
          const kind = this.kinds.get(e.unitId) ?? '';
          if (!isHeroKind(kind))
            this.vfx.play('enemyDeath', { position: v.root.position.clone().setY(0), scale: GAME_CONFIG.bossKinds.includes(kind) ? 2 : kind === 'brute' ? 1.4 : 1 });
          // "Alma" escapando: satisfatório mas curto, para não poluir com muitos inimigos.
          this.particles.glow.emit({
            pos: tmp.copy(v.root.position).setY(0.5),
            posJitter: 0.2,
            vel: new THREE.Vector3(0, 2.2, 0),
            velJitter: 1.1,
            life: 0.7,
            size: 0.16,
            sizeEnd: 0.03,
            color: C_SOUL,
            colorEnd: C_SOUL_END,
            gravity: -1,
            drag: 1.5,
            count: 5,
          });
          this.particles.smoke.emit({
            pos: tmp.copy(v.root.position).setY(0.25),
            posJitter: 0.3,
            vel: new THREE.Vector3(0, 0.4, 0),
            velJitter: 0.5,
            life: 1.1,
            size: 0.4,
            sizeEnd: 1.0,
            color: new THREE.Color(0.12, 0.11, 0.11),
            colorEnd: new THREE.Color(0.05, 0.05, 0.05),
            alpha: 0.5,
            drag: 1.5,
            count: 5,
          });
          break;
        }
        default:
          break;
      }
    }
  }

  /**
   * @param dt tempo de jogo (já multiplicado pela velocidade)
   * @param renderTick tick contínuo (tick atual + fração acumulada) para interpolar
   */
  update(gameDt: number, renderTick: number): void {
    // hit-stop: congela o visual por alguns frames no impacto (a simulação segue normal)
    const dt = this.hitStopT > 0 ? gameDt * 0.05 : gameDt;
    this.hitStopT = Math.max(0, this.hitStopT - gameDt);
    if (this.deferred.length) {
      const ready: SimEvent[] = [];
      this.deferred = this.deferred.filter((d) => {
        d.t -= dt;
        if (d.t > 0) return true;
        ready.push(...d.events);
        return false;
      });
      if (ready.length) this.handle(ready, true);
    }
    const camQ = this.stage.camera.quaternion;
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    for (const [id, v] of this.units) {
      const u = this.sim.units.get(id);
      if (!u) continue;
      // neblina: inimigo escondido até um herói chegar perto (ou a tocha clarear)
      v.root.visible = this.sim.isVisible(u);
      // O passo começa no tick em que foi decidido; interpola até completar.
      const t = THREE.MathUtils.clamp((renderTick - u.moveStartTick) / u.moveTicks, 0, 1);
      tileToWorld(u.prevX, u.prevY, p0);
      tileToWorld(u.x, u.y, p1);
      // empurrão/puxão de verdade (a simulação moveu a unidade à força): o corpo reage ao tranco
      if (u.displacedTick !== undefined && u.displacedTick === u.moveStartTick && this.knocked.get(id) !== u.displacedTick) {
        this.knocked.set(id, u.displacedTick);
        if (v instanceof ModelUnitView) v.knockback(p1.clone().sub(p0));
      }
      this.smoothMove(id, v, p0.lerp(p1, t), dt);
      if (t < 1 || u.team === 'enemy') v.setFacing(u.facing.x, u.facing.y);
      if (u.team === 'party' && u.kind === 'warrior') v.setFacing(u.facing.x, u.facing.y);
      // Planejamento: heróis passeiam perto do posto e vão andando até onde o jogador mandar.
      if (u.team === 'party' && this.sim.phase === 'setup') {
        const walking = this.idleStep(u.kind, u, v, dt);
        v.update(dt, walking ? 0 : 1, u.hp / u.maxHp, camQ);
        continue;
      }
      v.update(dt, t, u.hp / u.maxHp, camQ);
    }
    // Estados contínuos: gelo, fúria, cura e aura de refino
    for (const [id, left] of this.frozen) {
      const v = this.units.get(id);
      if (!v || left <= 0) {
        this.frozen.delete(id);
        continue;
      }
      this.frozen.set(id, left - dt);
      if (Math.random() < dt * 14) frostTick(this.kit, v.root.position);
    }
    for (const [id, left] of this.fury) {
      const v = this.units.get(id);
      if (!v || left <= 0) {
        this.fury.delete(id);
        continue;
      }
      this.fury.set(id, left - dt);
      if (Math.random() < dt * 40) (this.kinds.get(id) === 'archer' ? focusTick : furyTick)(this.kit, v.root.position);
    }
    for (const [id, cd] of this.healCd) this.healCd.set(id, cd - dt);
    this.auraT += dt;
    this.ringT -= dt;
    const ring = this.ringT <= 0;
    if (ring) this.ringT = 1.1;
    for (const [id, v] of this.units) {
      const kind = this.kinds.get(id) ?? '';
      const rf = this.auras[kind] ?? 0;
      if (rf < 5) continue;
      const col = kind === 'mage' ? AURA_MAGE : kind === 'archer' ? AURA_ARCHER : AURA_WARRIOR;
      if (Math.random() < dt * 30) refineAuraTick(this.kit, v.root.position, rf, col, this.auraT);
      if (rf >= 9 && ring) refineRing(this.kit, v.root.position, col);
    }
    if (this.cine?.own || this.cine?.held) this.cine.v.update(dt, 1, this.cine.held ? 0.02 : 1, camQ);
    for (const c of this.corpses) c.update(dt, 1, 0, camQ);
    this.corpses = this.corpses.filter((c) => {
      if (c.done) c.dispose();
      return !c.done;
    });
    for (const f of this.fires.values()) f.update(dt);
    for (const f of this.fading) f.update(dt);
    this.fading = this.fading.filter((f) => !f.done);
    for (const o of this.oneShots) o.update(dt);
    for (const l of this.loot) l.update(dt, this.stage.camera);
    this.loot = this.loot.filter((l) => !l.done);
    this.oneShots = this.oneShots.filter((o) => !o.done);
    this.boardView?.update(dt, this.particles);
    this.objectView?.update(dt, this.particles);
    this.fogView?.update(dt, camQ);
    this.updateStorm(dt);
    for (const h of this.heatSpots) this.stage.addHeat(h, 2.4, 0.35);
    this.particles.update(dt);
    this.vfx.update(dt);
    this.ribbons.update(dt, this.stage.camera.position);
    this.decals.update(dt);
    if (this.flashTiles) {
      this.flashTiles.t -= dt;
      if (this.flashTiles.t <= 0) this.flashTiles = undefined;
    }
  }


  private stormWarn = 0;
  /** Tempestade de areia: rajadas de poeira varrendo a área em volta da câmera (visual). */
  private updateStorm(dt: number): void {
    this.storm += ((this.stormOn ? 1 : 0) - this.storm) * Math.min(1, dt * 0.8);
    this.stormWarn = Math.max(0, this.stormWarn - dt);
    document.body.style.setProperty('--sand', this.storm.toFixed(3));
    document.body.classList.toggle('sand-warn', this.stormWarn > 0);
    const k = this.storm;
    if (k < 0.02 && this.stormWarn <= 0) return;
    const f = this.stage.focusPoint;
    const n = Math.round((k * 22 + (this.stormWarn > 0 ? 2 : 0)) * Math.min(3, dt * 60));
    for (let i = 0; i < n; i++)
      this.particles.smoke.emit({
        pos: new THREE.Vector3(f.x - 16 + Math.random() * 6, 0.3 + Math.random() * 2.2, f.z - 12 + Math.random() * 24),
        vel: new THREE.Vector3(9 + Math.random() * 5, 0.2, 1.2),
        velJitter: 1.2,
        life: 2.6,
        size: 0.9,
        sizeEnd: 2.6,
        color: new THREE.Color(0.78, 0.6, 0.38),
        alpha: 0.28 + k * 0.3,
        drag: 0.05,
      });
  }

  /** Centro da ação para a câmera seguir: a party e os inimigos mais próximos dela. */
  actionCenter(): THREE.Vector3 | undefined {
    const party = [...this.sim.units.values()].filter((u) => u.team === 'party' && u.alive);
    if (!party.length) return undefined;
    const c = new THREE.Vector3();
    const w = new THREE.Vector3();
    let n = 0;
    for (const u of party) {
      c.add(tileToWorld(u.x, u.y, w));
      n++;
    }
    c.divideScalar(n);
    // puxa um pouco em direção aos inimigos visíveis mais perto (a frente da batalha)
    const foes = [...this.sim.units.values()].filter((u) => u.team === 'enemy' && u.alive && this.sim.isVisible(u));
    if (foes.length) {
      foes.sort((a, b) => tileToWorld(a.x, a.y, w).distanceToSquared(c) - tileToWorld(b.x, b.y, w).distanceToSquared(c));
      const near = foes.slice(0, 6);
      const f = new THREE.Vector3();
      for (const u of near) f.add(tileToWorld(u.x, u.y, w));
      f.divideScalar(near.length);
      c.lerp(f, 0.35);
    }
    return c;
  }

  /** Objetos acionáveis agora (destaque no planejamento). */
  interactiveObjects(used: number[]): number[] {
    return [...this.sim.objects.values()].filter((o) => OBJECT_RULES[o.type].action && o.state === 'idle' && !used.includes(o.id)).map((o) => o.id);
  }

  /** Processa eventos depois de `delay` segundos de jogo (usado pelo debug para encerrar efeitos forçados). */
  schedule(events: SimEvent[], delay: number): void {
    this.deferred.push({ t: delay, events });
  }

  /** Fiapos do espectro de combate em volta do herói (cor do espectro de cada classe). */
  private spectre(id: number, dur: number): void {
    const kind = this.kinds.get(id);
    const color = kind === 'mage' ? new THREE.Color(0.55, 0.8, 1.6) : kind === 'warrior' ? new THREE.Color(0.35, 1.25, 1.0) : kind === 'archer' ? new THREE.Color(0.6, 1.5, 0.5) : undefined;
    if (!color) return;
    const fx = new SpectreFX(() => {
      const v = this.units.get(id);
      return v && 'chestWorld' in v ? v.chestWorld() : undefined;
    }, color, dur, this.kit);
    this.world.add(fx.group);
    this.oneShots.push(fx);
  }

  /**
   * Posição na tela seguindo a da grade com uma mola crítica: passos encadeados viram andar contínuo
   * (sem o "acelera-freia" de cada tile), e o começo/fim do movimento ganham aceleração natural.
   * Teletransporte (posicionamento, entrada) pula direto.
   */
  private smoothMove(id: number, v: AnyUnitView, target: THREE.Vector3, dt: number): void {
    let m = this.motion.get(id);
    if (!m || m.pos.distanceToSquared(target) > 6.25) {
      m = { pos: target.clone(), vel: new THREE.Vector3() };
      this.motion.set(id, m);
    } else if (dt > 0) {
      // SmoothDamp (mola criticamente amortecida, estável para qualquer dt)
      const w = 2 / MOVE_SMOOTH;
      const x = w * dt;
      const k = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
      const diff = m.pos.clone().sub(target);
      const tmp = m.vel.clone().addScaledVector(diff, w).multiplyScalar(dt);
      m.vel.sub(tmp.clone().multiplyScalar(w)).multiplyScalar(k);
      m.pos.copy(target).add(diff.add(tmp).multiplyScalar(k));
    }
    v.root.position.copy(m.pos);
  }

  /** Destaque vermelho rápido dos tiles do último golpe (leitura tática). */
  get lastCleaveFlash(): { tiles: { x: number; y: number }[]; strength: number } | undefined {
    return this.flashTiles ? { tiles: this.flashTiles.tiles, strength: this.flashTiles.t / 0.25 } : undefined;
  }

  private oneShot(fx: { group: THREE.Group; update(dt: number): void; done: boolean }): void {
    this.world.add(fx.group);
    this.oneShots.push(fx);
  }

  /** Tipo de uma unidade (inclusive já morta) — usado pelo registro de batalha. */
  unitKind(id: number): string | undefined {
    return this.kinds.get(id);
  }

  // ---------------- Cinemática do chefe final ----------------
  private lastBossPos?: THREE.Vector3;
  private cine?: { v: AnyUnitView; own: boolean; held?: boolean };
  /** Chamado quando um chefe morre; se devolver true, a morte fica "segurada" para a cinemática. */
  onBossDeath?: (kind: string) => boolean;

  /** Chefe segurado na hora da morte (se houver). */
  get heldBoss(): AnyUnitView | undefined {
    return this.cine?.held ? this.cine.v : undefined;
  }

  /** Solta a animação de morte do chefe segurado. */
  releaseHeldBoss(): void {
    const c = this.cine;
    if (!c?.held) return;
    c.v.die();
    this.corpses.push(c.v);
    this.cine = undefined;
  }

  /**
   * Prepara o chefe para a cinemática: usa o chefe vivo em campo ou cria um
   * "ator" no lugar onde ele caiu (ou na entrada da horda, se nem chegou a aparecer).
   */
  private cineHidden: AnyUnitView[] = [];
  cinematicBoss(kind: string): AnyUnitView {
    for (const u of this.units.values()) if (u instanceof ModelUnitView) u.hideHp();
    // só o chefe em cena: os outros somem durante a fala e voltam depois
    const hideOthers = (keep: AnyUnitView) => {
      this.cineHidden = [...this.units.values()].filter((u) => u !== keep && u.root.visible);
      for (const u of this.cineHidden) u.root.visible = false;
    };
    if (this.cine?.held) {
      hideOthers(this.cine.v);
      return this.cine.v;
    }
    for (const [id, v] of this.units) {
      if (this.kinds.get(id) === kind) {
        if (v instanceof ModelUnitView) v.hideHp();
        v.setFacing(0, 1);
        this.cine = { v, own: false };
        hideOthers(v);
        return v;
      }
    }
    for (const c of this.corpses) c.root.visible = false;
    const v = createUnitView(kind, 'enemy');
    v.root.position.copy(this.lastBossPos ?? tileToWorld(Math.floor(GAME_CONFIG.board.width / 2), 1));
    v.setFacing(0, 1, true);
    if (v instanceof ModelUnitView) v.hideHp();
    this.world.add(v.root);
    this.cine = { v, own: true };
    hideOthers(v);
    return v;
  }

  endCinematic(): void {
    for (const u of this.cineHidden) u.root.visible = true;
    this.cineHidden = [];
    if (this.cine?.held) this.releaseHeldBoss();
    if (this.cine?.own) {
      this.cine.v.root.removeFromParent();
      this.cine.v.dispose();
    }
    this.cine = undefined;
  }

  /** Número de dano estilo MMO: branco/amarelo nos inimigos, vermelho nos heróis; fogo em laranja. */
  private dmgCount = 0;
  private damageNumber(unitId: number, amount: number, source: string, at: THREE.Vector3): void {
    if (amount <= 0) return;
    const live = this.oneShots.filter((o) => o instanceof FloatText).length;
    if (live > 44) return;
    const hero = this.sim.units.get(unitId)?.team === 'party';
    const big = amount >= 40;
    const [c1, c2] = hero ? ['#ff6a5a', '#b01818'] : source === 'burn' ? ['#ffb04a', '#e0501a'] : big ? ['#ffe56a', '#ff9a1a'] : ['#fff4d8', '#d8c0a0'];
    const k = this.dmgCount++ % 5;
    const pos = at.clone().add(new THREE.Vector3((k - 2) * 0.14, 1.95 + (k % 2) * 0.16, 0));
    const f = new FloatText(String(Math.round(amount)), pos, c1, {
      dmg: true,
      color2: c2,
      size: source === 'burn' ? 0.36 : big ? 0.66 : 0.5,
      life: 1.0,
      rise: 0.8,
      drift: (k - 2) * 0.12,
    });
    this.world.add(f.group);
    this.oneShots.push(f);
  }

  private float(text: string, pos: THREE.Vector3, color: string, size = 0.3, life = 0.9, rise = 0.7): void {
    const f = new FloatText(text, pos, color, { size, life, rise });
    this.world.add(f.group);
    this.oneShots.push(f);
  }

  /** Fim da onda: coleta automática dos equipamentos no chão. Retorna quantos. */
  collectDrops(): number {
    for (const l of this.loot) l.collect();
    return this.loot.length;
  }
}
