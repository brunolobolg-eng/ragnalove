import { GAME_CONFIG, type AggroType, type PartySetup } from '../../config/gameConfig';
import { ARCHETYPES } from '../archetypes/registry';
import { Board } from '../grid/Board';
import { FlowField, canStep, stepCost } from '../grid/pathfinding';
import { DIRS8, chebyshev, isDiagonal, type Vec2 } from '../grid/types';
import { OBJECT_RULES, makeObject } from './objects';
import { ATTRIBUTES_CONFIG, computeStats, type HeroStats } from '../progression/attributes';
import { LOOT_CONFIG, dropChance, gearBonus, itemName, rollItem, type Item } from '../progression/equipment';
import { expToNext, starterWeapon, type WaveResult } from '../progression/profile';

/** Sem loadout (testes/sandbox): herói com a arma inicial. */
const defaultGear = (kind: string) => gearBonus([starterWeapon(kind)]);
import { Rng } from './rng';
import type { AreaEffect, CombatMoveStats, DamageSource, MapObject, Sanctuary, SimEvent, SimPhase, Trap, TrapKind, Unit, WaveReport } from './types';
import { SKILL_NUM, lvOf, startingSkills, type HeroKind } from '../progression/skills';
import { lockedSkillKeys } from '../progression/skillSlots';
import { neutralMods, testRangeMult, type SimMods } from './RangeSystem';
import { updateCombatMovement } from './CombatMovement';

/** Números de cada tipo de zumbi (cai no comum se o tipo não existir). */
export function enemyStats(kind: string) {
  return GAME_CONFIG.enemies[kind] ?? GAME_CONFIG.enemies.grunt;
}

/** Recompensas fixas de um abate (almas, EXP, Zen) — as mesmas tabelas da onda. */
export function killRewards(kind: string): { souls: number; exp: number; zeni: number } {
  return {
    souls: GAME_CONFIG.souls.dropPerKill[kind] ?? GAME_CONFIG.souls.defaultDrop,
    exp: GAME_CONFIG.progression.expPerKill[kind] ?? GAME_CONFIG.progression.defaultExp,
    zeni: GAME_CONFIG.zeni.dropPerKill[kind] ?? GAME_CONFIG.zeni.defaultDrop,
  };
}

/**
 * Sorteio do drop de equipamento de um abate (o mesmo da onda; o Loot Tester usa esta função).
 * Chefes sempre deixam um item: elite Raro/Épico, chefes de ato Épico/Lendário, o final Lendário/Mítico.
 */
export function rollLoot(rng: Rng, kind: string, luck: number, users: string[], idOf: (n: number) => string): Item | undefined {
  const isBoss = GAME_CONFIG.bossKinds.includes(kind);
  if (rng.next() >= (isBoss ? 1 : dropChance(luck))) return undefined;
  const r = rng.next();
  const rule = LOOT_CONFIG.bossRarity[kind] ?? LOOT_CONFIG.bossRarity.default;
  const bossRarity = r < rule.topChance ? rule.top : rule.base;
  return rollItem(rng, luck, idOf(rng.int(1e9)), isBoss ? { rarity: bossRarity } : {}, users);
}

/** Comportamento de aggro do tipo de inimigo (ENEMY_CONFIG.aggroType). */
export function aggroOf(kind: string): AggroType {
  return GAME_CONFIG.aggro.byKind[kind] ?? GAME_CONFIG.aggro.defaultType;
}

/** Estado que vem da run para a onda: vida da cidade e objetos já usados no planejamento. */
export interface SimOptions {
  cityHp?: number;
  cityMaxHp?: number;
  /** Ids (índice + 1 no MAP_CONFIG) dos objetos já acionados nesta fase. */
  usedObjects?: number[];
}

/** Eventos que contam como uso de habilidade no relatório. */
const SKILL_EVENTS = new Set<SimEvent['type']>(['cast', 'cleave', 'bash', 'bolt', 'arrow', 'rain', 'pierce', 'nova', 'storm', 'taunt', 'shockwave', 'fury', 'focus']);
const PROJECTILES = new Set<DamageSource>(['bolt', 'arrow', 'pierce', 'spell']);

/** O que cada herói traz da progressão para a onda. */
/** Dano contínuo/ambiental: nunca é crítico. */
const NO_CRIT = new Set<DamageSource>(['burn', 'poison', 'oil', 'ruin', 'debug', 'curse', 'combust']);

export interface HeroLoadout {
  stats: HeroStats;
  /** Habilidades fora dos slots de Mana (ausente = escolha automática pelos slots). */
  locked?: string[];
  level: number;
  exp: number;
}

/**
 * Fonte da verdade do combate. Passo fixo, determinística, sem dependência de
 * renderização — pode rodar num servidor ou em teste headless.
 */
export class Simulation {
  readonly board: Board;
  readonly setup: PartySetup;
  tick = 0;
  phase: SimPhase = 'setup';
  readonly units = new Map<number, Unit>();
  readonly effects = new Map<number, AreaEffect>();
  spawned = 0;
  killed = 0;
  /** Total de almas roubadas pela party nesta sessão (fonte da verdade). */
  souls = 0;
  /** Zen ganho nesta onda (bolsa da party). */
  zeni = 0;
  /** Equipamentos dropados nesta onda (coletados automaticamente no fim). */
  readonly drops: Item[] = [];
  /** Trapaças de teste (só o painel de debug liga). Desligadas, a simulação é a original. */
  readonly cheats = { invincible: false, noCooldowns: false, oneHit: false };
  /** Modificadores de teste do Dev Lab (temporários; neutros = jogo original). */
  mods: SimMods = neutralMods();
  /** Métricas do movimento de combate por herói. */
  readonly combatStats: Record<string, CombatMoveStats> = {};

  private nextId = 1;
  private occ: Int32Array; // id da unidade no tile (0 = vazio)
  private readonly flow: FlowField;
  private readonly rng: Rng; // horda (spawns) — separado para não mudar com loot/esquiva
  private readonly lootRng: Rng;
  private readonly combatRng: Rng;
  private events: SimEvent[] = [];
  private nextSpawnTick = 0;
  /** Meteoros anunciados (caem no tick marcado). */
  private meteors: { x: number; y: number; radius: number; damage: number; land: number; ownerId: number }[] = [];
  /** O chefe da zona já entrou em campo? */
  bossSpawned = false;
  /** Último estado de cada herói (sobrevive à morte dele, para o resultado da onda). */
  private readonly heroFinal = new Map<string, { level: number; exp: number }>();

  // ---- cidade (zona de ameaça) ----
  cityHp: number;
  readonly cityMaxHp: number;
  /** Dano descontado da cidade nesta onda e quem invadiu. */
  cityDamage = 0;
  reachedCity = 0;
  readonly reachedByKind: Record<string, number> = {};
  /** A vida da cidade chegou a zero nesta onda. */
  cityFallen = false;
  private readonly cityGoals: Vec2[];

  // ---- objetos do mapa ----
  readonly objects = new Map<number, MapObject>();
  /** Cura contínua da party (altar/fogueira), HP por segundo. */
  blessRegen = 0;

  // ---- campos de fluxo: cidade (todos), pesados (quebram obstáculos), provocação, party (reserva) ----
  private readonly heavyFlow: FlowField;
  private readonly tauntFlow: FlowField;
  private readonly partyFlow: FlowField;
  private flowVersion = -1;
  private tauntActive = false;
  private partyFlowTick = -1;

  // ---- tempestade de areia ----
  private stormUntil = 0;

  // ---- Muralha do Guerreiro e Armadilhas da Arqueira ----
  /** Armadilhas armadas no chão. */
  readonly traps: Trap[] = [];
  /** Santuários ativos (Cléria, especialização Divina). */
  readonly sanctuaries: Sanctuary[] = [];
  private nextTrapId = 1;
  /** Ids dos objetos criados na onda começam aqui (não colidem com os do mapa). */
  private nextObjectId = 10000;

  // ---- métricas do relatório (WAVE_RESULT) ----
  private readonly dealt: Record<string, number> = {};
  private readonly taken: Record<string, number> = {};
  private readonly skillsUsed: Record<string, number> = {};
  private expEarned = 0;

  constructor(setup: PartySetup, seed = GAME_CONFIG.wave.seed, loadout: Record<string, HeroLoadout> = {}, opts: SimOptions = {}) {
    const bc = GAME_CONFIG.board;
    this.board = new Board(bc.width, bc.height);
    for (const w of bc.walls) this.board.setWall(w.x, w.y);
    for (const v of bc.voids) this.board.setVoid(v.x, v.y);
    for (const c of bc.city) this.board.setCity(c.x, c.y);
    for (const f of bc.fog) this.board.setFog(f.x, f.y);
    const R = GAME_CONFIG.biome.roots;
    for (const t of bc.slow) this.board.setSlow(t.x, t.y, R.slowMult, R.pathCost);
    bc.objects.forEach((d, i) => {
      const o = makeObject(i + 1, d);
      this.objects.set(o.id, o);
      this.syncObject(o);
    });
    this.cityGoals = this.board.cityTiles();
    this.cityMaxHp = opts.cityMaxHp ?? GAME_CONFIG.cityDefense.maxHp;
    this.cityHp = Math.min(this.cityMaxHp, opts.cityHp ?? this.cityMaxHp);
    this.occ = new Int32Array(bc.width * bc.height);
    this.flow = new FlowField(this.board);
    this.heavyFlow = new FlowField(this.board);
    this.tauntFlow = new FlowField(this.board);
    this.partyFlow = new FlowField(this.board);
    this.rng = new Rng(seed);
    this.lootRng = new Rng((seed ^ 0x9e3779b9) >>> 0);
    this.combatRng = new Rng((seed * 7 + 13) >>> 0);
    this.setup = structuredClone(setup);
    for (const m of this.setup.members) {
      const a = ARCHETYPES[m.archetype];
      if (!this.board.isWalkable(m.x, m.y) || this.unitAt(m.x, m.y)) continue;
      const lo = loadout[a.id] ?? { stats: computeStats(a.id, ATTRIBUTES_CONFIG.base[a.id], defaultGear(a.id)), level: 1, exp: 0 };
      const u = this.createUnit('party', a.id, m.x, m.y, lo.stats.maxHp);
      u.stats = lo.stats;
      u.locked = lo.locked ?? lockedSkillKeys(a.id as HeroKind, { ...startingSkills(a.id as HeroKind), ...lo.stats.skills }, lo.stats.mana ?? GAME_CONFIG.mana.base);
      u.level = lo.level;
      u.exp = lo.exp;
      this.heroFinal.set(u.kind, { level: u.level, exp: u.exp });
    }
    // Herói sozinho: bônus de vida e dano (a party começa com 1 herói)
    const party = this.sortedUnits('party');
    if (party.length === 1 && party[0].stats) {
      const u = party[0];
      const B = GAME_CONFIG.soloBonus[u.kind] ?? { hp: 0.3, damage: 0.2, cooldown: 0.9 };
      const st = { ...u.stats! };
      const k = 1 + B.damage;
      st.maxHp = Math.round(st.maxHp * (1 + B.hp));
      st.boltDamage *= k;
      st.burnDamage *= k;
      st.cleaveDamage *= k;
      st.bashDamage *= k;
      st.arrowDamage *= k;
      st.rainDamage *= k;
      st.skillDamageMult *= k;
      st.classPower *= k;
      const c = (t: number) => Math.max(1, Math.round(t * B.cooldown));
      st.cooldownMult *= B.cooldown;
      st.boltCooldownTicks = c(st.boltCooldownTicks);
      st.barrierCooldownTicks = c(st.barrierCooldownTicks);
      st.cleaveCooldownTicks = c(st.cleaveCooldownTicks);
      st.bashCooldownTicks = c(st.bashCooldownTicks);
      st.arrowCooldownTicks = c(st.arrowCooldownTicks);
      st.rainCooldownTicks = c(st.rainCooldownTicks);
      u.stats = st;
      u.maxHp = u.hp = st.maxHp;
    }
    // Objetos já acionados no planejamento desta fase (óleo, tocha, bênçãos...)
    for (const id of opts.usedObjects ?? []) this.useObject(id);
  }

  // ---------- Objetos do mapa ----------

  /** Aplica o efeito de um objeto acionado pelo jogador (entre as ondas). Devolve false se não dá. */
  useObject(id: number): boolean {
    const o = this.objects.get(id);
    const rule = o && OBJECT_RULES[o.type];
    if (!o || !rule?.applyUsed || o.state !== 'idle') return false;
    rule.applyUsed(o, this);
    this.syncObject(o);
    return true;
  }

  /** Reflete o objeto na grade (bloqueio de passagem/visão). */
  private syncObject(o: MapObject): void {
    const rule = OBJECT_RULES[o.type];
    const walk = rule.blocksWalk(o);
    const sight = rule.blocksSight(o);
    for (const t of o.tiles) this.board.setObject(t.x, t.y, walk ? o.id : 0, sight);
  }

  /** Dano num objeto destrutível (pesados, áreas). Zero de vida = quebra e libera o caminho. */
  damageObject(o: MapObject, amount: number, unitId: number): void {
    if (!o.maxHp || o.state === 'broken' || o.state === 'collapsed') return;
    o.hp = Math.max(0, o.hp - amount);
    this.emit({ type: 'objectHit', objectId: o.id, unitId, amount });
    if (o.hp > 0) return;
    o.state = 'broken';
    this.syncObject(o);
    this.emit({ type: 'objectState', objectId: o.id, state: o.state });
  }

  /** Ruína instável desmorona: dano em área nos inimigos e o tile vira entulho andável. */
  collapseRuin(o: MapObject, unitId: number): void {
    const C = GAME_CONFIG.objects.unstableRuin;
    o.state = 'collapsed';
    this.syncObject(o);
    this.emit({ type: 'ruinCollapse', objectId: o.id, x: o.x, y: o.y, radius: C.radius });
    this.emit({ type: 'objectState', objectId: o.id, state: o.state });
    for (const e of this.enemiesWithin(o, C.radius)) this.damage(e, C.damage, 'ruin', unitId);
  }

  /** Fogueira: recargas mais curtas para toda a party nesta fase. */
  blessCooldown(cut: number): void {
    const k = 1 - cut;
    for (const u of this.sortedUnits('party')) {
      if (!u.stats) continue;
      const st = { ...u.stats };
      const c = (t: number) => Math.max(1, Math.round(t * k));
      st.cooldownMult *= k;
      st.boltCooldownTicks = c(st.boltCooldownTicks);
      st.barrierCooldownTicks = c(st.barrierCooldownTicks);
      st.cleaveCooldownTicks = c(st.cleaveCooldownTicks);
      st.bashCooldownTicks = c(st.bashCooldownTicks);
      st.arrowCooldownTicks = c(st.arrowCooldownTicks);
      st.rainCooldownTicks = c(st.rainCooldownTicks);
      u.stats = st;
    }
  }

  // ---------- Visibilidade (neblina) e tempestade ----------

  /** Inimigo na neblina densa só aparece com um herói perto (ou tocha acesa). */
  isVisible(u: Unit): boolean {
    if (u.team === 'party' || !this.board.isFogged(u.x, u.y)) return true;
    const r = GAME_CONFIG.biome.fog.revealRange;
    for (const p of this.units.values()) if (p.alive && p.team === 'party' && Math.hypot(p.x - u.x, p.y - u.y) <= r) return true;
    return false;
  }

  /** Inimigos que a party enxerga (alvos de ataques à distância). */
  visibleEnemies(): Unit[] {
    return this.enemies().filter((e) => this.isVisible(e));
  }

  get stormActive(): boolean {
    return this.tick < this.stormUntil;
  }

  /** Alcance dos ataques à distância (a tempestade de areia encurta). */
  get rangeMult(): number {
    return this.stormActive ? GAME_CONFIG.biome.sandstorm.rangeMult : 1;
  }

  /** Alcance de um herói à distância: ambiente (tempestade) × modificadores de teste. */
  rangeMultFor(u: Unit): number {
    return this.rangeMult * testRangeMult(u, this.mods);
  }

  /** O movimento de combate dos heróis está ligado nesta onda? */
  get combatMovementOn(): boolean {
    return this.mods.combatMovement ?? GAME_CONFIG.combatAI.enabled;
  }

  moveStats(kind: string): CombatMoveStats {
    return (this.combatStats[kind] ??= { tilesMoved: 0, repositions: 0, ticksMoving: 0, ticksAttacking: 0 });
  }

  /** O herói pode dar este passo (tile livre, andável, fora da cidade, sem cortar quina)? */
  canHeroStep(u: Unit, d: Vec2): boolean {
    const x = u.x + d.x;
    const y = u.y + d.y;
    return this.board.isWalkable(x, y) && !this.unitAt(x, y) && !this.board.isCity(x, y) && canStep(this.board, u, d);
  }

  /** Passo de um herói (movimento de combate): mesma ocupação e interpolação dos inimigos. */
  stepUnit(u: Unit, d: Vec2, ticks: number): void {
    this.occ[this.board.idx(u.x, u.y)] = 0;
    u.prevX = u.x;
    u.prevY = u.y;
    u.x += d.x;
    u.y += d.y;
    this.occ[this.board.idx(u.x, u.y)] = u.id;
    u.facing = d;
    u.moveStartTick = this.tick;
    u.moveTicks = ticks;
    this.emit({ type: 'move', unitId: u.id });
  }

  /**
   * Dispara uma habilidade de um herói pelo mesmo código da IA (CAST do Dev Lab).
   * Os eventos ficam na fila: quem chamou usa `flushEvents()`.
   */
  castSkill(u: Unit, id: string): boolean {
    const sk = ARCHETYPES[u.kind]?.skills.find((s) => s.id === id);
    if (!sk || !u.alive || u.team !== 'party') return false;
    return sk.cast(u, this, true);
  }

  private updateStorm(): void {
    const S = GAME_CONFIG.biome.sandstorm;
    if (!S.themes.includes(GAME_CONFIG.board.theme)) return;
    const k = this.tick % S.intervalTicks;
    if (k === S.intervalTicks - S.warnTicks) this.emit({ type: 'sandWarn', ticks: S.warnTicks });
    if (k === 0 && this.tick > 0) {
      this.stormUntil = this.tick + S.durationTicks;
      this.emit({ type: 'sandstorm', on: true });
    }
    if (this.tick === this.stormUntil) this.emit({ type: 'sandstorm', on: false });
  }

  // ---------- Provocar (genérico: qualquer unidade que tenha a habilidade) ----------

  /**
   * Campo de aggro: inimigos (dos tipos que respondem) a até `radius` trocam o alvo para `unit`
   * por `ticks`, ignorando a cidade. Devolve os ids afetados.
   */
  applyTaunt(unit: Unit, radius: number, ticks: number, maxEnemies: number): number[] {
    const affects = GAME_CONFIG.aggro.tauntAffects;
    const list = this.enemies()
      .filter((e) => affects.includes(e.aggro ?? aggroOf(e.kind)) && Math.hypot(e.x - unit.x, e.y - unit.y) <= radius)
      .sort((a, b) => chebyshev(a, unit) - chebyshev(b, unit) || a.id - b.id)
      .slice(0, maxEnemies);
    for (const e of list) {
      e.tauntedBy = unit.id;
      e.tauntUntil = this.tick + ticks;
      this.emit({ type: 'aggro', unitId: e.id, targetId: unit.id, ticks });
    }
    return list.map((e) => e.id);
  }

  /** Inimigos que podem ser provocados agora por `unit` (ainda não presos a ela). */
  tauntCandidates(unit: Unit, radius: number): Unit[] {
    const affects = GAME_CONFIG.aggro.tauntAffects;
    return this.enemies().filter((e) => affects.includes(e.aggro ?? aggroOf(e.kind)) && Math.hypot(e.x - unit.x, e.y - unit.y) <= radius && this.taunter(e) !== unit);
  }

  private taunter(u: Unit): Unit | undefined {
    if (u.tauntedBy === undefined) return undefined;
    const t = this.units.get(u.tauntedBy);
    if (!t || !t.alive || this.tick >= (u.tauntUntil ?? 0)) {
      u.tauntedBy = u.tauntUntil = undefined;
      return undefined;
    }
    return t;
  }

  /** Alcance de aquisição de foco do tipo (0 = nunca tranca). */
  private focusRangeOf(kind: string): number {
    return GAME_CONFIG.focus.range[kind] ?? GAME_CONFIG.focus.defaultRange;
  }

  /**
   * Alvo do foco de agressão, se válido. Limpa sozinho quando: alvo morto/sumiu,
   * janela de 60 ticks acabou ou alvo fugiu além do alcance + guia.
   */
  private focusTarget(u: Unit): Unit | undefined {
    if (u.focusId === undefined) return undefined;
    const t = this.units.get(u.focusId);
    if (!t || !t.alive || t.team !== 'party') {
      u.focusId = u.focusUntil = undefined;
      return undefined;
    }
    if (this.tick >= (u.focusUntil ?? 0)) {
      u.focusId = u.focusUntil = undefined;
      return undefined;
    }
    if (Math.hypot(u.x - t.x, u.y - t.y) > this.focusRangeOf(u.kind) + GAME_CONFIG.focus.leashBonus) {
      u.focusId = u.focusUntil = undefined;
      return undefined;
    }
    return t;
  }

  /**
   * Tenta travar no herói vivo mais próximo dentro do alcance (desempate: menor id).
   * Respeita o teto por herói — o excedente continua para o portão (§12).
   */
  private acquireFocus(u: Unit, party: Unit[]): Unit | undefined {
    const F = GAME_CONFIG.focus;
    const range = this.focusRangeOf(u.kind);
    if (range <= 0) return undefined;
    let best: Unit | undefined;
    let bestD = Infinity;
    for (const h of party) {
      if (!h.alive) continue;
      const d = Math.hypot(u.x - h.x, u.y - h.y);
      if (d > range || d > bestD || (d === bestD && best && h.id > best.id)) continue;
      best = h;
      bestD = d;
    }
    if (!best) return undefined;
    let n = 0;
    for (const e of this.sortedUnits('enemy')) if (e.focusId === best.id) n++;
    if (n >= F.maxPerHero) return undefined;
    u.focusId = best.id;
    u.focusUntil = this.tick + F.durationTicks;
    this.emit({ type: 'aggro', unitId: u.id, targetId: best.id, ticks: F.durationTicks });
    return best;
  }

  // ---------- API usada por arquétipos ----------

  private hookDepth = 0;
  /** Ouvintes de teste (Arena de Skills): chamados a cada evento, sem efeito no jogo. */
  private readonly tap = new Set<(e: SimEvent) => void>();
  /** Assina o fluxo de eventos; devolve a função para cancelar. Só a Arena de Skills usa. */
  onEvent(cb: (e: SimEvent) => void): () => void {
    this.tap.add(cb);
    return () => {
      this.tap.delete(cb);
    };
  }
  emit(e: SimEvent): void {
    this.events.push(e);
    for (const cb of this.tap) cb(e);
    // métrica: habilidades usadas por herói
    if (SKILL_EVENTS.has(e.type) && 'unitId' in e) {
      const u = this.units.get(e.unitId);
      if (u?.team === 'party') this.skillsUsed[u.kind] = (this.skillsUsed[u.kind] ?? 0) + 1;
    }
    // objetos do mapa reagem (óleo pega fogo, ruína desaba, oásis vira lama...)
    if (this.hookDepth > 4) return;
    this.hookDepth++;
    for (const o of this.objects.values()) OBJECT_RULES[o.type].onEvent?.(o, this, e);
    this.hookDepth--;
  }

  unitAt(x: number, y: number): Unit | undefined {
    if (!this.board.inBounds(x, y)) return undefined;
    const id = this.occ[this.board.idx(x, y)];
    return id ? this.units.get(id) : undefined;
  }

  /** Linha de visão (Bresenham): paredes bloqueiam; unidades e fogo não. */
  hasLineOfSight(a: Vec2, b: Vec2): boolean {
    let x0 = a.x;
    let y0 = a.y;
    const dx = Math.abs(b.x - x0);
    const dy = -Math.abs(b.y - y0);
    const sx = x0 < b.x ? 1 : -1;
    const sy = y0 < b.y ? 1 : -1;
    let err = dx + dy;
    while (x0 !== b.x || y0 !== b.y) {
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
      if ((x0 !== b.x || y0 !== b.y) && this.board.blocksSight(x0, y0)) return false;
    }
    return true;
  }

  /** Inimigos vivos, em ordem determinística. */
  enemies(): Unit[] {
    return this.sortedUnits('enemy');
  }

  /** @param sourceId unidade que causou o dano (quem mata rouba a alma). */
  /**
   * Aplica dano. Golpes da party podem ser CRÍTICOS (Chance de crítico × Dano crítico do herói);
   * dano contínuo (queimadura, veneno...) nunca é crítico. `crit`: o arquétipo já sorteou
   * (e já multiplicou o dano) — a simulação não sorteia de novo.
   */
  damage(u: Unit, amount: number, source: DamageSource, sourceId?: number, crit?: boolean): void {
    if (!u.alive) return;
    if (u.team === 'party' && this.cheats.invincible) return;
    if (u.team === 'party' && u.stats) amount = Math.max(1, Math.round(amount * u.stats.damageTakenMult * 10) / 10);
    // Tempestade de areia: o vento desvia parte dos projéteis
    if (PROJECTILES.has(source) && this.stormActive && this.combatRng.next() < GAME_CONFIG.biome.sandstorm.deflectChance) {
      this.emit({ type: 'avoid', unitId: u.id, how: 'deflect' });
      return;
    }
    // Fôlego de Batalha: o Guerreiro se cura a cada inimigo atingido.
    if (u.team === 'enemy' && sourceId !== undefined && (source === 'bash' || source === 'cleave' || source === 'shock')) {
      const a = this.units.get(sourceId);
      const lv = lvOf(a?.stats?.skills, 'battleBreath');
      if (a && a.alive && lv) this.heal(a, SKILL_NUM.battleBreath(lv).heal);
    }
    // Esquiva/bloqueio da party (vindos de Sorte e equipamento).
    if (u.team === 'party' && source === 'melee' && u.stats) {
      if (u.stats.dodge > 0 && this.combatRng.next() < u.stats.dodge) {
        this.emit({ type: 'avoid', unitId: u.id, how: 'dodge' });
        return;
      }
      if (u.stats.block > 0 && this.combatRng.next() < u.stats.block) {
        this.emit({ type: 'avoid', unitId: u.id, how: 'block' });
        return;
      }
    }
    // Maldição (Bruxa): o amaldiçoado sofre mais dano de toda a party
    if (u.team === 'enemy' && (u.cursedUntil ?? 0) > this.tick) amount *= 1 + (u.curseAmp ?? 0);
    // Bênção: quem ataca abençoado causa mais dano
    if (u.team === 'enemy' && sourceId !== undefined) {
      const a = this.units.get(sourceId);
      if (a && (a.blessUntil ?? 0) > this.tick) amount *= 1 + (a.blessAmp ?? 0);
    }
    // Escudo Sagrado: absorve o dano antes da vida
    if (u.team === 'party' && (u.shield ?? 0) > 0 && (u.shieldUntil ?? 0) > this.tick) {
      const absorbed = Math.min(u.shield!, amount);
      u.shield! -= absorbed;
      amount -= absorbed;
      if (amount <= 0) {
        this.emit({ type: 'avoid', unitId: u.id, how: 'shield' });
        return;
      }
    }
    if (crit === undefined && u.team === 'enemy' && sourceId !== undefined && !NO_CRIT.has(source)) {
      const a = this.units.get(sourceId);
      if (a?.team === 'party' && a.stats && a.stats.crit > 0 && this.combatRng.next() < a.stats.crit) {
        amount *= a.stats.critDamage ?? GAME_CONFIG.crit.baseDamage;
        crit = true;
      }
    }
    // Dano infinito (Dev Lab): qualquer golpe da party mata
    if (this.cheats.oneHit && u.team === 'enemy' && sourceId !== undefined && this.units.get(sourceId)?.team === 'party') amount = u.hp;
    // Multiplicador de teste da Arena de Skills (neutro = 1: o jogo não muda)
    if (sourceId !== undefined) {
      const src = this.units.get(sourceId);
      if (src?.team === 'party') amount *= this.mods.heroes[src.kind]?.damageMult ?? 1;
    }
    const applied = Math.min(u.hp, amount);
    u.hp = Math.max(0, u.hp - amount);
    // métricas do relatório
    if (u.team === 'party') this.taken[u.kind] = (this.taken[u.kind] ?? 0) + applied;
    else if (sourceId !== undefined) {
      const src = this.units.get(sourceId);
      if (src?.team === 'party') this.dealt[src.kind] = (this.dealt[src.kind] ?? 0) + applied;
    }
    this.emit(crit ? { type: 'damage', unitId: u.id, amount, source, sourceId, crit } : { type: 'damage', unitId: u.id, amount, source, sourceId });
    if (u.hp <= 0) {
      u.alive = false;
      this.occ[this.board.idx(u.x, u.y)] = 0;
      this.emit({ type: 'death', unitId: u.id });
      if (u.team === 'enemy') {
        this.killed++;
        const hero = this.stealSoul(u, sourceId);
        this.grantExp(u);
        this.grantZeni(u);
        if (GAME_CONFIG.bossKinds.includes(u.kind)) this.bossLevelUp();
        this.rollDrop(u, hero);
        this.soulHarvest(sourceId);
      }
    }
  }

  /** Colheita de Almas (Bruxa): abate cura a party e pode render alma extra. */
  private soulHarvest(sourceId?: number): void {
    const w = sourceId !== undefined ? this.units.get(sourceId) : undefined;
    const lv = lvOf(w?.stats?.skills, 'soulHarvest');
    if (!w || !lv || w.team !== 'party') return;
    const n = SKILL_NUM.soulHarvest(lv);
    for (const p of this.sortedUnits('party')) this.heal(p, n.heal);
    if (this.combatRng.next() < n.soulChance) {
      w.souls++;
      this.souls++;
    }
  }

  /** Roubo de alma: calculado aqui (autoritativo), o render só desenha o evento. */
  private stealSoul(victim: Unit, sourceId?: number): Unit | undefined {
    const amount = killRewards(victim.kind).souls;
    let hero = sourceId !== undefined ? this.units.get(sourceId) : undefined;
    if (!hero || !hero.alive || hero.team !== 'party') {
      // fonte desconhecida: vai para o herói vivo mais próximo
      hero = undefined;
      for (const p of this.units.values()) {
        if (!p.alive || p.team !== 'party') continue;
        if (!hero || chebyshev(p, victim) < chebyshev(hero, victim) || (chebyshev(p, victim) === chebyshev(hero, victim) && p.id < hero.id)) hero = p;
      }
    }
    if (!hero) return undefined;
    hero.souls += amount;
    this.souls += amount;
    this.emit({ type: 'soul', fromId: victim.id, toId: hero.id, amount, x: victim.x, y: victim.y });
    return hero;
  }

  /** EXP para toda a party viva; níveis sobem aqui (os pontos são aplicados no perfil). */
  private grantExp(victim: Unit): void {
    const amount = killRewards(victim.kind).exp;
    this.emit({ type: 'exp', x: victim.x, y: victim.y, amount });
    this.expEarned += amount;
    for (const p of this.sortedUnits('party')) {
      p.exp += amount;
      while (p.exp >= expToNext(p.level)) {
        p.exp -= expToNext(p.level);
        p.level++;
        this.emit({ type: 'levelup', unitId: p.id, level: p.level });
      }
      this.heroFinal.set(p.kind, { level: p.level, exp: p.exp });
    }
  }

  private grantZeni(victim: Unit): void {
    const amount = killRewards(victim.kind).zeni;
    this.zeni += amount;
    this.emit({ type: 'zeni', x: victim.x, y: victim.y, amount });
  }

  /** Chefe/mini-chefe derrotado: toda a party (inclusive quem caiu) sobe de nível, EXP mantida. */
  private bossLevelUp(): void {
    const n = GAME_CONFIG.progression.levelsPerBoss;
    for (const [kind, f] of this.heroFinal) {
      const p = this.sortedUnits('party').find((u) => u.kind === kind);
      if (p) {
        p.level += n;
        this.emit({ type: 'levelup', unitId: p.id, level: p.level });
        this.heroFinal.set(kind, { level: p.level, exp: p.exp });
      } else this.heroFinal.set(kind, { level: f.level + n, exp: f.exp });
    }
  }

  // ---------- Ferramentas das habilidades ----------

  /** Inimigos vivos a até `radius` tiles (Chebyshev), em ordem determinística. */
  enemiesWithin(c: Vec2, radius: number): Unit[] {
    return this.enemies().filter((e) => chebyshev(e, c) <= radius);
  }

  /** Sorteio de combate (esquiva, chance de habilidade) — RNG próprio da onda. */
  chance(p: number): boolean {
    return this.combatRng.next() < p;
  }

  heal(u: Unit, amount: number): void {
    if (!u.alive || u.hp >= u.maxHp) return;
    const v = Math.min(u.maxHp - u.hp, amount);
    u.hp += v;
    this.emit({ type: 'heal', unitId: u.id, amount: v });
  }

  freeze(u: Unit, ticks: number): void {
    if (!u.alive) return;
    const until = this.tick + ticks;
    if ((u.frozenUntil ?? 0) >= until) return;
    u.frozenUntil = until;
    u.nextActTick = Math.max(u.nextActTick, until);
    this.emit({ type: 'freeze', unitId: u.id, ticks });
  }

  frozen(u: Unit): boolean {
    return (u.frozenUntil ?? 0) > this.tick;
  }

  /** Atordoa: o alvo perde o próximo passo/ataque (sem sair do lugar). */
  stun(u: Unit, ticks: number): void {
    if (!u.alive) return;
    u.nextActTick = Math.max(u.nextActTick, this.tick) + ticks;
  }

  /** Dano contínuo (veneno, maldição, enxame): `perPulse` a cada GAME_CONFIG.dot.intervalTicks. */
  addDot(u: Unit, perPulse: number, ticks: number, source: DamageSource, ownerId: number): void {
    if (!u.alive || perPulse <= 0) return;
    (u.dots ??= []).push({ perPulse, until: this.tick + ticks, source, ownerId });
  }

  /** Amaldiçoa: dano recebido +amp até o fim. */
  curse(u: Unit, amp: number, ticks: number): void {
    if (!u.alive) return;
    u.cursedUntil = Math.max(u.cursedUntil ?? 0, this.tick + ticks);
    u.curseAmp = Math.max(u.curseAmp ?? 0, amp);
  }

  private tickDots(): void {
    const iv = GAME_CONFIG.dot.intervalTicks;
    if (this.tick % iv !== 0) return;
    for (const u of this.sortedUnits('enemy')) {
      if (!u.dots?.length) continue;
      u.dots = u.dots.filter((d) => d.until > this.tick);
      for (const d of [...u.dots]) if (u.alive) this.damage(u, d.perPulse, d.source, d.ownerId);
    }
  }

  // ---------- Muralha do Guerreiro ----------

  /** Ergue blocos de muralha (1 tile cada) nos tiles livres. Devolve quantos subiram. */
  raiseWall(ownerId: number, tiles: Vec2[], hp: number): number {
    let n = 0;
    for (const t of tiles) {
      if (!this.board.isWalkable(t.x, t.y) || this.unitAt(t.x, t.y) || this.board.isCity(t.x, t.y)) continue;
      if (GAME_CONFIG.wave.spawnPoints.some((p) => p.x === t.x && p.y === t.y)) continue;
      const o = makeObject(this.nextObjectId++, { type: 'shieldWall', x: t.x, y: t.y });
      o.hp = o.maxHp = hp;
      this.objects.set(o.id, o);
      this.syncObject(o);
      this.emit({ type: 'objectSpawn', object: o });
      n++;
    }
    if (n) this.emit({ type: 'cast', unitId: ownerId, ability: 'shieldWall' });
    return n;
  }

  /** Blocos de muralha ainda de pé. */
  wallsStanding(): number {
    let n = 0;
    for (const o of this.objects.values()) if (o.type === 'shieldWall' && o.state !== 'broken') n++;
    return n;
  }

  /** Muralha de pé no tile: todos os inimigos a atacam para passar (custo de "quebrar"). */
  private wallPass(x: number, y: number): number {
    const o = this.objects.get(this.board.objectAt(x, y));
    return o && o.type === 'shieldWall' && o.state !== 'broken' ? GAME_CONFIG.pathing.breakCost : -1;
  }

  // ---------- Armadilhas da Arqueira ----------

  /** Arma uma armadilha no tile (livre, andável, sem outra armadilha). */
  placeTrap(ownerId: number, at: Vec2, damage: number, slowTicks: number, slowMult: number, extra: { kind?: TrapKind; radius?: number; stunTicks?: number; freezeTicks?: number } = {}): boolean {
    if (!this.board.isWalkable(at.x, at.y) || this.unitAt(at.x, at.y) || this.board.isCity(at.x, at.y)) return false;
    if (this.traps.some((t) => t.x === at.x && t.y === at.y)) return false;
    const trap: Trap = { id: this.nextTrapId++, x: at.x, y: at.y, ownerId, damage, slowTicks, slowMult, ...extra };
    this.traps.push(trap);
    this.emit({ type: 'trapSet', trap });
    return true;
  }

  /** Tile `steps` passos à frente do inimigo no caminho que ele vai seguir (até o portão). */
  pathAhead(u: Unit, steps: number): Vec2 | undefined {
    let cur: Vec2 = { x: u.x, y: u.y };
    for (let i = 0; i < steps; i++) {
      let best: Vec2 | undefined;
      let bd = this.flow.at(cur.x, cur.y);
      for (const d of DIRS8) {
        if (!canStep(this.board, cur, d)) continue;
        const nd = this.flow.at(cur.x + d.x, cur.y + d.y);
        if (nd < bd) {
          bd = nd;
          best = { x: cur.x + d.x, y: cur.y + d.y };
        }
      }
      if (!best) break;
      cur = best;
    }
    return cur.x === u.x && cur.y === u.y ? undefined : cur;
  }

  private triggerTrap(u: Unit): void {
    const i = this.traps.findIndex((t) => t.x === u.x && t.y === u.y);
    if (i < 0) return;
    const t = this.traps[i];
    this.traps.splice(i, 1);
    const kind = t.kind ?? 'snare';
    this.emit(kind === 'snare' ? { type: 'trapTrigger', trapId: t.id, x: t.x, y: t.y, targetId: u.id } : { type: 'trapTrigger', trapId: t.id, x: t.x, y: t.y, targetId: u.id, kind, radius: t.radius ?? 1 });
    if (kind === 'snare') {
      u.slowUntil = this.tick + t.slowTicks;
      u.slowMult = t.slowMult;
      this.damage(u, t.damage, 'trap', t.ownerId);
      return;
    }
    // minas e armadilhas de área: atingem todos em volta de quem pisou
    const hit = this.enemiesWithin(t, t.radius ?? 1);
    if (!hit.includes(u)) hit.push(u);
    for (const e of hit) {
      if (kind === 'freeze') this.freeze(e, t.freezeTicks ?? 20);
      this.damage(e, e === u || kind !== 'mine' ? t.damage : t.damage * 0.6, 'trap', t.ownerId);
    }
    if (kind === 'mine' && u.alive) this.stun(u, t.stunTicks ?? 10);
  }

  // ---------- Cléria (especialização Divina) ----------

  /** Escudo Sagrado num aliado: absorve `absorb` de dano por `ticks`. */
  shieldAlly(caster: Unit, u: Unit, absorb: number, ticks: number): void {
    u.shield = absorb;
    u.shieldUntil = this.tick + ticks;
    this.emit({ type: 'holyShield', unitId: caster.id, targetId: u.id, ticks });
  }

  /** Bênção: +`amp` de dano para os aliados até `ticks`. */
  bless(caster: Unit, targets: Unit[], amp: number, ticks: number): void {
    for (const u of targets) {
      u.blessAmp = amp;
      u.blessUntil = this.tick + ticks;
    }
    this.emit({ type: 'blessing', unitId: caster.id, targets: targets.map((u) => u.id), ticks });
  }

  /** Santuário: cura `perSec` por segundo a quem estiver dentro (até `ticks`). */
  addSanctuary(caster: Unit, at: Vec2, radius: number, perSec: number, ticks: number): void {
    this.sanctuaries.push({ x: at.x, y: at.y, radius, perSec, until: this.tick + ticks, ownerId: caster.id });
    this.emit({ type: 'sanctuary', unitId: caster.id, x: at.x, y: at.y, radius, ticks });
  }

  private updateSanctuaries(): void {
    if (!this.sanctuaries.length) return;
    for (let i = this.sanctuaries.length - 1; i >= 0; i--) if (this.sanctuaries[i].until <= this.tick) this.sanctuaries.splice(i, 1);
    if (this.tick % GAME_CONFIG.sim.tickRate !== 0) return;
    for (const s of this.sanctuaries)
      for (const u of this.sortedUnits('party')) if (chebyshev(u, s) <= s.radius) this.heal(u, s.perSec);
  }

  /** Move uma unidade até `steps` tiles na direção (dx, dy), parando em obstáculo/ocupado. */
  private displace(u: Unit, dx: number, dy: number, steps: number): boolean {
    if (!u.alive || (dx === 0 && dy === 0)) return false;
    let x = u.x;
    let y = u.y;
    for (let i = 0; i < steps; i++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.board.isWalkable(nx, ny) || this.unitAt(nx, ny)) break;
      if (dx !== 0 && dy !== 0 && !this.board.isWalkable(x + dx, y) && !this.board.isWalkable(x, y + dy)) break;
      x = nx;
      y = ny;
    }
    if (x === u.x && y === u.y) return false;
    this.occ[this.board.idx(u.x, u.y)] = 0;
    u.prevX = u.x;
    u.prevY = u.y;
    u.x = x;
    u.y = y;
    this.occ[this.board.idx(x, y)] = u.id;
    u.moveStartTick = this.tick;
    u.moveTicks = 2;
    u.nextActTick = Math.max(u.nextActTick, this.tick + 3);
    return true;
  }

  /** Empurra para longe de `from`. */
  knockback(u: Unit, from: Vec2, steps: number): boolean {
    return this.displace(u, Math.sign(u.x - from.x), Math.sign(u.y - from.y), steps);
  }

  /** Puxa em direção a `to` (sem entrar no tile dele). */
  pull(u: Unit, to: Vec2, steps: number): boolean {
    const d = chebyshev(u, to);
    return this.displace(u, Math.sign(to.x - u.x), Math.sign(to.y - u.y), Math.min(steps, Math.max(0, d - 1)));
  }

  /** Drop de equipamento com raridade (Sorte do herói que matou influencia). */
  private rollDrop(victim: Unit, hero?: Unit): void {
    const luck = hero?.stats?.luck ?? 0;
    const users = [...new Set([...this.units.values()].filter((u) => u.team === 'party').map((u) => u.kind))];
    const item = rollLoot(this.lootRng, victim.kind, luck, users, (n) => `it-${this.tick}-${victim.id}-${n}`);
    if (!item) return;
    this.drops.push(item);
    this.emit({ type: 'drop', item, x: victim.x, y: victim.y });
  }

  addEffect(e: Omit<AreaEffect, 'id' | 'startTick' | 'endTick'> & { durationTicks: number }): void {
    const eff: AreaEffect = {
      id: this.nextId++,
      kind: e.kind,
      ownerId: e.ownerId,
      tiles: e.tiles,
      hostileTo: e.hostileTo,
      startTick: this.tick,
      endTick: this.tick + e.durationTicks,
    };
    this.effects.set(eff.id, eff);
    this.rebuildHazards();
    this.emit({ type: 'effectStart', effect: eff });
  }

  /** Resultado da onda para a progressão persistente. */
  result(): WaveResult {
    return { souls: this.souls, zeni: this.zeni, heroes: Object.fromEntries(this.heroFinal), drops: [...this.drops] };
  }

  /** Coloca um inimigo num dos portais (sorteado se `point` não vier). Não conta na onda. */
  spawnEnemy(kind = 'grunt', point?: number): Unit | undefined {
    const order = point !== undefined ? [point] : this.portalOrder(this.pickPortal());
    for (const i of order) {
      const t = this.spawnTile(i);
      if (t) return this.createEnemy(kind, t.x, t.y, i);
    }
    return undefined;
  }

  /**
   * Ordem de tentativa dos portais a partir do sorteado (round-robin: o sorteado,
   * depois os seguintes em ciclo). Generaliza o antigo "2 spawns".
   */
  private portalOrder(first: number): number[] {
    const n = GAME_CONFIG.wave.spawnPoints.length;
    return Array.from({ length: n }, (_, k) => (first + k) % n);
  }

  /** Sorteia o portal da próxima leva: `spawnSplit` no 1º, o resto dividido entre os demais. */
  private pickPortal(): number {
    const n = GAME_CONFIG.wave.spawnPoints.length;
    if (this.rng.next() < GAME_CONFIG.wave.spawnSplit || n < 2) return 0;
    return 1 + this.rng.int(n - 1);
  }

  /**
   * Spawna um inimigo num tile exato (Arena de Skills: posicionar bonecos). Não conta
   * na onda nem em contadores — só cria a unidade. `hp` sobrescreve a vida (boneco configurável).
   */
  spawnEnemyAt(kind: string, x: number, y: number, hp?: number): Unit | undefined {
    if (!this.board.isWalkable(x, y) || this.unitAt(x, y)) return undefined;
    const u = this.createEnemy(kind, x, y, 0);
    if (hp !== undefined && hp > 0) u.maxHp = u.hp = Math.round(hp);
    return u;
  }

  /**
   * Remove uma unidade sem dano, recompensa ou contador (reset da Arena de Skills).
   * O caminho normal de morte (almas, EXP, drops) continua intacto para o jogo.
   */
  debugRemove(id: number): boolean {
    const u = this.units.get(id);
    if (!u) return false;
    u.alive = false;
    this.occ[this.board.idx(u.x, u.y)] = 0;
    this.units.delete(id);
    return true;
  }

  /**
   * Tile livre no spawn `i` (ou o mais próximo dele, até GAME_CONFIG.wave.spawnSpread).
   * Com `scatter`, sorteia (seed da horda) um tile livre até essa distância do portal.
   */
  spawnTile(i: number, scatter = 0): Vec2 | undefined {
    const p = GAME_CONFIG.wave.spawnPoints[i];
    if (!p) return undefined;
    if (scatter > 0) {
      const free: Vec2[] = [];
      // no cerco (Survival) a party se move: basta chão livre (o fluxo até o portão não vale ali)
      const needFlow = !GAME_CONFIG.wave.endless;
      for (let dy = -scatter; dy <= scatter; dy++)
        for (let dx = -scatter; dx <= scatter; dx++) {
          const x = p.x + dx;
          const y = p.y + dy;
          // só tiles com caminho até a cidade (não nasce preso atrás de parede)
          if (this.board.isWalkable(x, y) && !this.unitAt(x, y) && !this.board.isCity(x, y) && (!needFlow || this.flow.at(x, y) < FlowField.INF)) free.push({ x, y });
        }
      if (free.length) return free[this.rng.int(free.length)];
    }
    const R = GAME_CONFIG.wave.spawnSpread;
    for (let r = 0; r <= R; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = p.x + dx;
          const y = p.y + dy;
          if (this.board.isWalkable(x, y) && !this.unitAt(x, y) && !this.board.isCity(x, y)) return { x, y };
        }
    return undefined;
  }

  /** Spawn mais distante da cidade (o chefe entra por ele). */
  private farSpawn(): number {
    const pts = GAME_CONFIG.wave.spawnPoints;
    let best = 0;
    let bd = -Infinity;
    pts.forEach((p, i) => {
      const d = this.flow.at(p.x, p.y);
      if (d < FlowField.INF && d > bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  /** Mata todos os inimigos vivos pelo caminho normal de dano (almas, EXP e drops continuam valendo). */
  killAllEnemies(): number {
    const list = this.enemies();
    for (const e of list) this.damage(e, e.hp, 'debug');
    this.cleanupDead();
    this.checkEnd();
    return list.length;
  }

  /** Encerra a onda: não nasce mais ninguém e quem está vivo morre. */
  skipWave(): void {
    if (this.phase !== 'running') return;
    this.spawned = Math.max(this.spawned, GAME_CONFIG.wave.count);
    this.bossSpawned = true;
    this.killAllEnemies();
  }

  /** Relatório da noite (WAVE_RESULT) — números da camada autoritativa; a HUD só desenha. */
  report(night: number): WaveReport {
    const kinds = [...new Set([...this.heroFinal.keys(), ...Object.keys(this.dealt), ...Object.keys(this.taken)])];
    const list = (m: Record<string, number>) => kinds.map((kind) => ({ kind, amount: Math.round(m[kind] ?? 0) })).sort((a, b) => b.amount - a.amount);
    return {
      night,
      victory: this.phase === 'victory',
      cityFallen: this.cityFallen,
      damageDealtByUnit: list(this.dealt),
      damageTakenByUnit: list(this.taken),
      skillsUsedByUnit: kinds.map((kind) => ({ kind, count: this.skillsUsed[kind] ?? 0 })).sort((a, b) => b.count - a.count),
      enemiesKilled: this.killed,
      enemiesReachedCity: this.reachedCity,
      reachedByKind: { ...this.reachedByKind },
      cityDamageTaken: this.cityDamage,
      cityHpRemaining: this.cityHp,
      cityMaxHp: this.cityMaxHp,
      cityThreatPercent: this.cityMaxHp ? this.cityDamage / this.cityMaxHp : 0,
      soulsCollected: this.souls,
      zeniEarned: this.zeni,
      expEarned: this.expEarned,
      itemsDropped: this.drops.map((d) => ({ name: itemName(d), rarity: d.rarity })),
    };
  }

  /** Debug: desconta vida da cidade como se `n` inimigos do tipo tivessem invadido. */
  debugCityDamage(amount: number): void {
    this.cityHp = Math.max(0, this.cityHp - amount);
    this.cityDamage += amount;
    this.emit({ type: 'cityHit', unitId: -1, x: this.cityGoals[0]?.x ?? 0, y: this.cityGoals[0]?.y ?? 0, damage: amount, cityHp: this.cityHp, cityMaxHp: this.cityMaxHp });
    if (this.cityHp <= 0) {
      this.cityFallen = true;
      if (this.phase === 'running') this.checkEnd();
    }
  }

  /** Custo do campo de fluxo no tile (visualização de pathfinding). Infinity = inalcançável. */
  flowCost(x: number, y: number): number {
    const c = this.flow.at(x, y);
    return c >= 1e9 ? Infinity : c;
  }

  /** Devolve e limpa eventos emitidos fora do step() (comandos de debug). */
  flushEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------- Loop ----------

  start(): void {
    if (this.phase !== 'setup') return;
    this.phase = 'running';
    this.emit({ type: 'phase', phase: 'running' });
  }

  /** Avança 1 tick e devolve os eventos gerados. */
  step(): SimEvent[] {
    this.events = [];
    if (this.phase !== 'running') return this.events;
    this.tick++;

    this.expireEffects();
    this.updateStorm();
    this.refreshCityFlows();
    this.spawnEnemies();

    this.updateSanctuaries();
    const moving = this.combatMovementOn;
    for (const u of this.sortedUnits('party')) {
      if (this.cheats.noCooldowns) u.cooldowns = {};
      this.regen(u);
      if (moving) updateCombatMovement(u, this);
      // velocidade de ataque de teste: encurta as recargas que o arquétipo acabou de marcar
      const speed = this.mods.heroes[u.kind]?.attackSpeed ?? 1;
      const before = speed !== 1 ? { ...u.cooldowns } : undefined;
      this.actWithSlots(u);
      if (before) for (const [k, v] of Object.entries(u.cooldowns)) if (v !== before[k] && v > this.tick) u.cooldowns[k] = this.tick + Math.max(1, Math.round((v - this.tick) / speed));
    }

    this.applyBurn();
    this.tickDots();
    this.landMeteors();
    this.updateEnemies();
    this.cleanupDead();
    this.checkEnd();
    return this.events;
  }

  // ---------- Internos ----------

  /**
   * Turno do arquétipo respeitando os SLOTS (Mana): habilidades fora dos slots ficam "em recarga"
   * durante o turno (a IA pula para a próxima). O arquétipo não precisa saber de slots.
   */
  private actWithSlots(u: Unit): void {
    if (!u.locked?.length) return void ARCHETYPES[u.kind].update(u, this);
    const held: Record<string, number | undefined> = {};
    for (const k of u.locked) {
      if (this.tick >= (u.cooldowns[k] ?? 0)) {
        held[k] = u.cooldowns[k];
        u.cooldowns[k] = this.tick + 1;
      }
    }
    ARCHETYPES[u.kind].update(u, this);
    for (const [k, v] of Object.entries(held)) {
      if (u.cooldowns[k] !== this.tick + 1) continue; // o arquétipo mexeu nela (ex.: recarga compartilhada)
      if (v === undefined) delete u.cooldowns[k];
      else u.cooldowns[k] = v;
    }
  }

  private regen(u: Unit): void {
    const r = (u.stats?.hpRegenPerSec ?? 0) + this.blessRegen;
    const tps = GAME_CONFIG.sim.tickRate;
    if (r > 0 && this.tick % tps === 0 && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + r);
  }

  private createUnit(team: Unit['team'], kind: string, x: number, y: number, hp: number): Unit {
    const u: Unit = {
      id: this.nextId++,
      team,
      kind,
      x,
      y,
      prevX: x,
      prevY: y,
      moveStartTick: this.tick,
      moveTicks: 1,
      hp,
      maxHp: hp,
      alive: true,
      facing: team === 'party' ? { x: 0, y: -1 } : { x: 0, y: 1 },
      nextActTick: this.tick + 1,
      cooldowns: {},
      souls: 0,
      level: 1,
      exp: 0,
    };
    this.units.set(u.id, u);
    this.occ[this.board.idx(x, y)] = u.id;
    return u;
  }

  sortedUnits(team: Unit['team'], includeDead = false): Unit[] {
    const out: Unit[] = [];
    for (const u of this.units.values()) if ((u.alive || includeDead) && u.team === team) out.push(u);
    return out.sort((a, b) => a.id - b.id);
  }

  private expireEffects(): void {
    let changed = false;
    for (const e of [...this.effects.values()]) {
      if (this.tick >= e.endTick) {
        this.effects.delete(e.id);
        this.emit({ type: 'effectEnd', effectId: e.id });
        changed = true;
        if (e.kind === 'oilFire')
          for (const o of this.objects.values())
            if (o.type === 'oilBarrel' && o.state === 'burning') {
              o.state = 'used';
              this.emit({ type: 'objectState', objectId: o.id, state: o.state });
            }
      }
    }
    if (changed) this.rebuildHazards();
  }

  private rebuildHazards(): void {
    this.board.clearHazards();
    for (const e of this.effects.values()) if (e.hostileTo === 'enemy') this.board.addHazard(e.tiles, 1);
  }

  /** Estágio atual da Sobrevivência (0 fora dela). */
  get stage(): number {
    return GAME_CONFIG.wave.endless ? Math.floor(this.killed / GAME_CONFIG.survival.stageKills) : 0;
  }
  private lastEliteStage = 0;

  /** Sobrevivência: o jogador recua e coleta o que conquistou. */
  endSurvival(): void {
    if (this.phase !== 'running' || !GAME_CONFIG.wave.endless) return;
    this.phase = 'victory';
    this.emit({ type: 'phase', phase: 'victory' });
  }

  /** Leva atual da horda orgânica: quantos ainda saem e por qual portal. */
  private packLeft = 0;
  private packSize = 0;
  private packPortal = 0;

  private spawnEnemies(): void {
    const w = GAME_CONFIG.wave;
    if (w.endless) return this.spawnEndless();
    const bossTurn = this.spawned >= w.count;
    if (bossTurn && (!w.boss || this.bossSpawned)) return;
    if (this.tick < this.nextSpawnTick) return;
    if (bossTurn) {
      // O chefe entra pelo spawn mais distante da cidade.
      const order = this.portalOrder(this.farSpawn());
      const t = order.map((i) => this.spawnTile(i)).find(Boolean);
      if (!t) return; // tenta de novo no próximo tick
      this.createEnemy(w.boss!, t.x, t.y, order[0]);
      this.bossSpawned = true;
      return;
    }
    if (this.overDensity()) return; // teto de vivos: recua em vez de empilhar
    const at = this.packSpawnTile();
    if (!at) return; // portais lotados: tenta de novo no próximo tick
    this.createEnemy(this.rollKind(), at.t.x, at.t.y, at.i);
    this.spawned++;
    this.nextSpawnTick = this.tick + (this.spawned >= w.count ? w.bossDelayTicks : this.packDelay(w.spawnIntervalTicks));
  }

  /**
   * Governador de densidade: com muitos vivos, adia o próximo spawn em vez de
   * empilhar entidades (mantém pressão sem congestionamento nem custo de IA).
   * Dois níveis: teto duro (performance) e respiro dinâmico (acompanha o DPS da party).
   */
  private overDensity(): boolean {
    const w = GAME_CONFIG.wave;
    const alive = this.sortedUnits('enemy').length;
    if (alive >= w.maxAlive) {
      this.nextSpawnTick = Math.max(this.nextSpawnTick, this.tick + w.spawnBackoffTicks);
      return true;
    }
    if (alive >= w.softAlive) {
      this.nextSpawnTick = Math.max(this.nextSpawnTick, this.tick + w.softBackoffTicks);
      return true;
    }
    return false;
  }

  private spawnEndless(): void {
    if (this.tick < this.nextSpawnTick) return;
    if (this.overDensity()) return; // teto de vivos vale no cerco infinito também
    const w = GAME_CONFIG.wave;
    const S = GAME_CONFIG.survival;
    const at = this.packSpawnTile();
    if (!at) return;
    const st = this.stage;
    // a cada N estágios entra um mini-chefe
    const kind = st > 0 && st % S.eliteEvery === 0 && st !== this.lastEliteStage ? 'elite' : this.rollKind();
    if (kind === 'elite') this.lastEliteStage = st;
    this.createEnemy(kind, at.t.x, at.t.y, at.i);
    this.spawned++;
    this.nextSpawnTick = this.tick + this.packDelay(Math.max(S.intervalMin, w.spawnIntervalTicks - Math.floor(st / 2)));
  }

  /**
   * Onde nasce o próximo monstro: começa uma leva nova quando a anterior acabou (tamanho e portal
   * sorteados pela seed) e escolhe um tile livre espalhado em volta do portal. Na falta de espaço,
   * tenta os demais portais em round-robin (sem pilha no mesmo ponto).
   */
  private packSpawnTile(): { t: Vec2; i: number } | undefined {
    const O = GAME_CONFIG.wave.organic;
    if (this.packLeft <= 0) {
      this.packSize = this.packLeft = O.packMin + this.rng.int(O.packMax - O.packMin + 1);
      // A horda se divide entre os portais (WAVE_CONFIG.spawnSplit no 1º), leva por leva
      this.packPortal = this.pickPortal();
    }
    for (const i of this.portalOrder(this.packPortal)) {
      const t = this.spawnTile(i, O.spawnScatter);
      if (t) {
        this.packLeft--;
        return { t, i };
      }
    }
    return undefined;
  }

  /** Espera até o próximo monstro: curta dentro da leva; no fim dela, uma pausa sorteada (ritmo médio = `interval`). */
  private packDelay(interval: number): number {
    const O = GAME_CONFIG.wave.organic;
    const gap = () => O.packGapMin + this.rng.int(O.packGapMax - O.packGapMin + 1);
    if (this.packLeft > 0) return gap();
    // a leva inteira "deve" size × interval; desconta o que já passou entre os monstros dela
    const avgGap = (O.packGapMin + O.packGapMax) / 2;
    const f = O.pauseMin + this.rng.next() * (O.pauseMax - O.pauseMin);
    return Math.max(1, Math.round(this.packSize * interval * f - (this.packSize - 1) * avgGap));
  }

  /** Sorteio determinístico do tipo de zumbi pela composição da zona. */
  private rollKind(): string {
    const mix = GAME_CONFIG.wave.mix;
    const total = mix.reduce((s, m) => s + m.weight, 0);
    let r = this.rng.next() * total;
    for (const m of mix) {
      r -= m.weight;
      if (r < 0) return m.kind;
    }
    return mix[mix.length - 1].kind;
  }

  private createEnemy(kind: string, x: number, y: number, spawnIndex = 0): Unit {
    const g = enemyStats(kind);
    const st = this.stage;
    const S = GAME_CONFIG.survival;
    const u = this.createUnit('enemy', kind, x, y, Math.round(g.hp * GAME_CONFIG.wave.hpMult * Math.pow(S.hpGrowth, st)));
    if (st) u.dmgScale = Math.pow(S.dmgGrowth, st);
    u.aggro = aggroOf(kind);
    u.spawnIndex = spawnIndex;
    u.nextActTick = this.tick + g.moveTicks;
    this.emit({ type: 'spawn', unitId: u.id });
    return u;
  }

  private applyBurn(): void {
    const bc = GAME_CONFIG.archetypes.mage.fireBarrier;
    const oil = GAME_CONFIG.objects.oilBarrel;
    for (const e of this.effects.values()) {
      if (e.kind === 'oilFire') {
        if ((this.tick - e.startTick) % oil.burnIntervalTicks !== 0) continue;
        for (const t of e.tiles) {
          const u = this.unitAt(t.x, t.y);
          if (u && u.team === 'enemy') this.damage(u, oil.burnDamage, 'oil', e.ownerId);
        }
        continue;
      }
      if (e.kind !== 'fireBarrier') continue;
      if ((this.tick - e.startTick) % bc.burnIntervalTicks !== 0) continue;
      const owner = this.units.get(e.ownerId);
      const dmg = owner?.stats?.burnDamage ?? bc.burnDamage;
      const comb = lvOf(owner?.stats?.skills, 'combustion');
      for (const t of e.tiles) {
        const u = this.unitAt(t.x, t.y);
        if (!u || u.team !== 'enemy') continue;
        this.damage(u, dmg, 'burn', e.ownerId);
        // Combustão: as chamas saltam para os vizinhos fora do fogo.
        if (comb) {
          const splash = dmg * SKILL_NUM.combustion(comb).splash;
          let any = false;
          for (const n of this.enemiesWithin(t, 1)) {
            if (n === u || this.board.hazardAt(n.x, n.y) > 0) continue;
            this.damage(n, splash, 'combust', e.ownerId);
            any = true;
          }
          if (any) this.emit({ type: 'combust', x: t.x, y: t.y });
        }
      }
    }
  }

  /** Campos de fluxo até o portão da cidade: só recalcula quando a grade muda. */
  private refreshCityFlows(): void {
    if (this.board.version === this.flowVersion) return;
    const P = GAME_CONFIG.pathing;
    this.flow.compute(this.cityGoals, P, (x, y) => this.wallPass(x, y));
    this.heavyFlow.compute(this.cityGoals, P, (x, y) => this.passCost(x, y));
    this.flowVersion = this.board.version;
  }

  /** Obstáculo que os pesados/chefes atravessam quebrando (custo extra), ou -1. */
  private passCost(x: number, y: number): number {
    if (!this.board.isOpenGround(x, y)) return -1;
    const o = this.objects.get(this.board.objectAt(x, y));
    if (!o) return -1;
    const r = OBJECT_RULES[o.type];
    return r.breakable || r.trampledByBosses ? GAME_CONFIG.pathing.breakCost : -1;
  }

  /** Quem quebra obstáculos: pesados (golpeiam) e chefes/elites (atropelam as raízes). */
  private breaker(u: Unit): boolean {
    return u.aggro === 'heavy' || GAME_CONFIG.bossKinds.includes(u.kind);
  }

  private updateEnemies(): void {
    const party = this.sortedUnits('party');
    if (party.length === 0) return;
    this.refreshCityFlows();
    // Provocação ativa: campo de fluxo até quem provocou (+ quem segura foco de agressão)
    const taunters = new Map<number, Unit>();
    for (const e of this.sortedUnits('enemy')) {
      const t = this.taunter(e);
      if (t) taunters.set(t.id, t);
      const f = this.focusTarget(e);
      if (f) taunters.set(f.id, f);
    }
    this.tauntActive = taunters.size > 0;
    if (this.tauntActive) this.tauntFlow.compute([...taunters.values()], GAME_CONFIG.pathing, (x, y) => this.wallPass(x, y));

    for (const u of this.sortedUnits('enemy')) {
      if (!u.alive) continue;
      // empurrado para dentro do portão (knockback): invade do mesmo jeito
      if (this.board.isCity(u.x, u.y)) {
        this.enterCity(u);
        continue;
      }
      if (this.tick < u.nextActTick || this.frozen(u)) continue;
      const g = enemyStats(u.kind);
      if (this.castEnemySpell(u, party)) continue;
      const aggro = u.aggro ?? aggroOf(u.kind);

      // 1) Provocado: vai atrás de quem provocou e bate nele
      const taunter = this.tauntActive ? this.taunter(u) : undefined;
      if (taunter) {
        if (chebyshev(u, taunter) === 1) {
          this.enemyAttack(u, taunter, g);
          continue;
        }
        const plan = this.planStep(u, this.tauntFlow, false);
        if (plan.best) this.moveEnemy(u, plan.best, g);
        else {
          const adj = this.adjacentHero(u, party);
          if (adj) this.enemyAttack(u, adj, g);
          else u.nextActTick = this.tick + 1;
        }
        continue;
      }

      // 1b) Foco de agressão: 60 ticks no mesmo alvo (sem trocar); expirou, adquire de novo
      const focus = this.focusTarget(u) ?? (((this.tick + u.id) % GAME_CONFIG.focus.checkEveryTicks === 0) ? this.acquireFocus(u, party) : undefined);
      if (focus) {
        if (chebyshev(u, focus) === 1) {
          this.enemyAttack(u, focus, g);
          continue;
        }
        const plan = this.planStep(u, this.tauntFlow, false);
        if (plan.best) this.moveEnemy(u, plan.best, g);
        else u.nextActTick = this.tick + 1;
        continue;
      }

      // 2) Chefes/elites caçam a party — e no cerco (Survival) TODOS caçam:
      //    sem portão como objetivo, batem em quem estiver colado e vão atrás da party
      const hunt = aggro === 'hunter' || GAME_CONFIG.wave.endless;
      if (hunt) {
        const adj = this.adjacentHero(u, party);
        if (adj) {
          this.enemyAttack(u, adj, g);
          continue;
        }
      }
      // 3) Padrão: foca a cidade (desce o campo de fluxo até o portão)
      const breaker = this.breaker(u);
      let flow = breaker ? this.heavyFlow : this.flow;
      if (hunt || flow.at(u.x, u.y) >= FlowField.INF) {
        // sem caminho até a cidade (bloqueado) ou cerco: vai atrás da party
        if (this.partyFlowTick !== this.tick) {
          this.partyFlow.compute(party, GAME_CONFIG.pathing, (x, y) => this.wallPass(x, y));
          this.partyFlowTick = this.tick;
        }
        flow = this.partyFlow;
      }
      // monstros comuns rumo à cidade "derivam" para os lados: a horda se espalha pelo caminho
      const drift = breaker || flow !== this.flow ? undefined : this.driftOf(u);
      const plan = this.planStep(u, flow, breaker, drift);
      // pesado/chefe: obstáculo destrutível no melhor caminho → quebra
      if (plan.breakTarget) {
        const o = plan.breakTarget;
        const trample = OBJECT_RULES[o.type].trampledByBosses && GAME_CONFIG.bossKinds.includes(u.kind);
        u.facing = { x: Math.sign(o.x - u.x), y: Math.sign(o.y - u.y) };
        this.emit({ type: 'melee', unitId: u.id, targetId: -o.id });
        this.damageObject(o, trample ? o.hp : g.damage * GAME_CONFIG.wave.dmgMult * (u.dmgScale ?? 1), u.id);
        u.nextActTick = this.tick + g.attackTicks;
        continue;
      }
      // herói no caminho: bate (sem perseguir). "bypass" nunca bate: contorna ou espera.
      if (aggro !== 'bypass') {
        const inWay = plan.heroInWay ?? (!plan.best ? this.adjacentHero(u, party) : undefined);
        if (inWay) {
          this.enemyAttack(u, inWay, g);
          continue;
        }
      }
      if (plan.best) this.moveEnemy(u, plan.best, g);
      else u.nextActTick = this.tick + 1; // bloqueado: espera na fila
    }
  }

  /** Escolhe o passo: melhor vizinho livre descendo o campo, o passo ideal e o que está no caminho. */
  /** Deriva atual do monstro (sorteada pela seed da horda e trocada de tempos em tempos). */
  private driftOf(u: Unit): Vec2 {
    const O = GAME_CONFIG.wave.organic;
    if (!u.drift || this.tick >= (u.driftUntil ?? 0)) {
      if (this.rng.next() < O.straightChance) u.drift = { x: 0, y: 0 };
      else {
        const a = this.rng.next() * Math.PI * 2;
        const k = 0.5 + this.rng.next() * 0.5;
        u.drift = { x: Math.cos(a) * k, y: Math.sin(a) * k };
      }
      u.driftUntil = this.tick + O.driftMin + this.rng.int(O.driftMax - O.driftMin + 1);
    }
    return u.drift;
  }

  private planStep(u: Unit, f: FlowField, breaker: boolean, drift?: Vec2): { best?: Vec2; heroInWay?: Unit; breakTarget?: MapObject } {
    const P = GAME_CONFIG.pathing;
    const here = f.at(u.x, u.y);
    let best: Vec2 | undefined;
    let bestCost = Infinity;
    let idealCost = Infinity; // melhor passo ignorando ocupação
    let idealOcc: Unit | undefined;
    let breakTarget: MapObject | undefined;
    const free: { d: Vec2; total: number }[] = [];
    for (const d of DIRS8) {
      const nx = u.x + d.x;
      const ny = u.y + d.y;
      if (!this.board.isWalkable(nx, ny)) {
        // obstáculo destrutível no caminho de quem quebra (só passo ortogonal)
        // a Muralha do Guerreiro todos quebram; o resto (raízes, colunas) só os pesados
        if (isDiagonal(d) || this.passCost(nx, ny) < 0 || (!breaker && this.wallPass(nx, ny) < 0)) continue;
        const dn = f.at(nx, ny);
        if (dn >= here) continue;
        const total = dn + P.stepCost;
        if (total < idealCost) {
          idealCost = total;
          idealOcc = undefined;
          breakTarget = this.objects.get(this.board.objectAt(nx, ny));
        }
        continue;
      }
      if (!canStep(this.board, u, d)) continue;
      const dn = f.at(nx, ny);
      if (dn >= here) continue; // nunca anda "para trás"
      const total = dn + stepCost(this.board, { x: nx, y: ny }, d, P);
      const occ = this.unitAt(nx, ny);
      if (total < idealCost) {
        idealCost = total;
        idealOcc = occ;
        breakTarget = undefined;
      }
      if (occ) continue;
      free.push({ d, total });
      if (total < bestCost) {
        bestCost = total;
        best = d;
      }
    }
    // Caminho ideal só está congestionado: prefere esperar na fila a atravessar o fogo.
    if (best && bestCost - idealCost >= P.hazardCost) best = undefined;
    // quebrar só compensa se não houver passo livre quase tão bom
    if (breakTarget && best && bestCost - idealCost < P.breakCost) breakTarget = undefined;
    // herói "no caminho": ocupa o passo ideal e contornar custaria mais que um passo inteiro
    const heroInWay = idealOcc && idealOcc.team === 'party' && (!best || bestCost - idealCost > P.stepCost) ? idealOcc : undefined;
    // horda orgânica: entre os passos quase tão bons quanto o melhor (sempre rumo à cidade), segue a deriva
    if (drift && best && !breakTarget && (drift.x || drift.y) && free.length > 1) {
      const O = GAME_CONFIG.wave.organic;
      let score = -Infinity;
      for (const c of free) {
        const extra = c.total - bestCost;
        if (extra > O.wanderSlack) continue;
        const sc = (c.d.x * drift.x + c.d.y * drift.y) * O.wanderWeight - extra;
        if (sc > score) {
          score = sc;
          best = c.d;
        }
      }
    }
    return { best, heroInWay, breakTarget };
  }

  private adjacentHero(u: Unit, party: Unit[]): Unit | undefined {
    let target: Unit | undefined;
    for (const p of party) if (p.alive && chebyshev(u, p) === 1 && (!target || p.id < target.id)) target = p;
    return target;
  }

  private enemyAttack(u: Unit, target: Unit, g: ReturnType<typeof enemyStats>): void {
    u.facing = { x: Math.sign(target.x - u.x), y: Math.sign(target.y - u.y) };
    this.damage(target, g.damage * GAME_CONFIG.wave.dmgMult * (u.dmgScale ?? 1), 'melee', u.id);
    this.emit({ type: 'melee', unitId: u.id, targetId: target.id });
    u.nextActTick = this.tick + g.attackTicks;
  }

  private moveEnemy(u: Unit, d: Vec2, g: ReturnType<typeof enemyStats>): void {
    this.occ[this.board.idx(u.x, u.y)] = 0;
    u.prevX = u.x;
    u.prevY = u.y;
    u.x += d.x;
    u.y += d.y;
    this.occ[this.board.idx(u.x, u.y)] = u.id;
    u.facing = d;
    u.moveStartTick = this.tick;
    // lama/raízes atrasam o passo
    const base = isDiagonal(d) ? Math.round(g.moveTicks * 1.4) : g.moveTicks;
    const slowed = (u.slowUntil ?? 0) > this.tick ? (u.slowMult ?? 1) : 1;
    u.moveTicks = Math.max(1, Math.round(base * this.board.slowAt(u.x, u.y) * slowed));
    u.nextActTick = this.tick + u.moveTicks;
    this.emit({ type: 'move', unitId: u.id });
    if (this.traps.length) this.triggerTrap(u);
    if (!u.alive) return;
    if (this.board.isCity(u.x, u.y)) this.enterCity(u);
  }

  /** Inimigo alcançou o portão: invade a cidade (sai do campo, sem recompensa) e desconta a ameaça. */
  private enterCity(u: Unit): void {
    const C = GAME_CONFIG.cityDefense;
    const mult = GAME_CONFIG.wave.endless ? C.survivalThreatMult : GAME_CONFIG.wave.threatMult;
    const dmg = Math.round((C.threat[u.kind] ?? C.defaultThreat) * mult);
    this.cityHp = Math.max(0, this.cityHp - dmg);
    this.cityDamage += dmg;
    this.reachedCity++;
    this.reachedByKind[u.kind] = (this.reachedByKind[u.kind] ?? 0) + 1;
    u.alive = false;
    this.occ[this.board.idx(u.x, u.y)] = 0;
    this.emit({ type: 'cityHit', unitId: u.id, x: u.x, y: u.y, damage: dmg, cityHp: this.cityHp, cityMaxHp: this.cityMaxHp });
    if (this.cityHp <= 0 && dmg > 0) this.cityFallen = true;
  }

  /** Magias dos monstros: conjura se alguma está pronta e faz sentido agora. */
  private castEnemySpell(u: Unit, party: Unit[]): boolean {
    const spells = GAME_CONFIG.enemySpells[u.kind];
    if (!spells) return false;
    const dmgMult = GAME_CONFIG.wave.dmgMult * (u.dmgScale ?? 1);
    for (const sp of spells) {
      if (this.tick < (u.cooldowns[sp.id] ?? 0)) continue;
      if (sp.id === 'shadowBolt') {
        const target = party
          .filter((p) => p.alive && Math.hypot(p.x - u.x, p.y - u.y) <= (sp.range ?? 5) && this.hasLineOfSight(u, p))
          .sort((a, b) => chebyshev(a, u) - chebyshev(b, u) || a.id - b.id)[0];
        if (!target) continue;
        u.facing = { x: Math.sign(target.x - u.x), y: Math.sign(target.y - u.y) };
        this.emit({ type: 'shadowBolt', unitId: u.id, targetId: target.id, from: { x: u.x, y: u.y }, to: { x: target.x, y: target.y } });
        this.damage(target, sp.damage * dmgMult, 'spell', u.id);
      } else if (sp.id === 'stomp') {
        const r = sp.radius ?? 1;
        const hit = party.filter((p) => p.alive && chebyshev(p, u) <= r);
        if (!hit.length) continue;
        this.emit({ type: 'stomp', unitId: u.id, x: u.x, y: u.y, radius: r });
        for (const p of hit) this.damage(p, sp.damage * dmgMult, 'spell', u.id);
      } else if (sp.id === 'meteor') {
        // só conjura com a party ao alcance (em mapas grandes o chefe precisa se aproximar)
        const alive = party.filter((p) => p.alive && Math.hypot(p.x - u.x, p.y - u.y) <= (sp.range ?? Infinity));
        if (!alive.length) continue;
        const n = Math.min(sp.count ?? 1, alive.length + 1);
        for (let i = 0; i < n; i++) {
          const t = alive[this.combatRng.int(alive.length)];
          const x = t.x + (i === 0 ? 0 : this.combatRng.int(3) - 1);
          const y = t.y + (i === 0 ? 0 : this.combatRng.int(3) - 1);
          const ticks = sp.telegraphTicks ?? 14;
          this.meteors.push({ x, y, radius: sp.radius ?? 1, damage: sp.damage * dmgMult, land: this.tick + ticks, ownerId: u.id });
          this.emit({ type: 'telegraph', unitId: u.id, x, y, radius: sp.radius ?? 1, ticks });
        }
      }
      u.cooldowns[sp.id] = this.tick + sp.cooldownTicks;
      u.nextActTick = this.tick + Math.max(6, enemyStats(u.kind).attackTicks);
      return true;
    }
    return false;
  }

  private landMeteors(): void {
    if (!this.meteors.length) return;
    const now = this.meteors.filter((m) => m.land <= this.tick);
    if (!now.length) return;
    this.meteors = this.meteors.filter((m) => m.land > this.tick);
    for (const m of now) {
      this.emit({ type: 'meteor', x: m.x, y: m.y, radius: m.radius });
      for (const p of this.sortedUnits('party')) if (chebyshev(p, m) <= m.radius) this.damage(p, m.damage, 'meteor', m.ownerId);
    }
  }

  private cleanupDead(): void {
    // O render guarda seu próprio cadáver; a simulação descarta mortos.
    for (const [id, u] of this.units) if (!u.alive) this.units.delete(id);
  }

  private checkEnd(): void {
    const partyAlive = this.sortedUnits('party').length > 0;
    if (!partyAlive || this.cityFallen) {
      this.phase = 'defeat';
      this.emit({ type: 'phase', phase: 'defeat' });
    } else if (!GAME_CONFIG.wave.endless && this.spawned >= GAME_CONFIG.wave.count && (this.bossSpawned || !GAME_CONFIG.wave.boss) && this.sortedUnits('enemy').length === 0) {
      this.phase = 'victory';
      this.emit({ type: 'phase', phase: 'victory' });
    }
  }
}
