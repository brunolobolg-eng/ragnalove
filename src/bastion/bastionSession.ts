import * as THREE from 'three';
import { BASTION_ZONE_ID, PROJECTS, PROJECT_IDS, STRUCTURES, type StructureKind } from '../config/bastion';
import { GAME_CONFIG } from '../config/gameConfig';
import { HERO_NAME, HERO_ORDER } from '../config/heroes';
import { ZONES, parseZone } from '../config/zones';
import { findStructure, migrateBastion, newBastion, structureMaxHp, structureStatus, type BastionState, type Structure } from '../core/bastion/bastion';
import { bastionBuildEnv } from '../core/bastion/route';
import {
  BUILD_MSG,
  applyNight,
  buildCostOf,
  coreRepairCost,
  fortificationsOf,
  placeStructure,
  refundOf,
  removeStructure,
  repairCore,
  repairCostOf,
  repairStructure,
  rescueIfStuck,
  setParty,
  startAttempt,
  unlockProject,
  upgradeCostOf,
  upgradeStructure,
  waveSeed,
  type BuildError,
  type NightOutcome,
} from '../core/bastion/rules';
import type { CardCollection } from '../core/progression/cards';
import type { Profile } from '../core/progression/profile';
import type { HeroKind } from '../core/progression/skills';
import type { Vec2 } from '../core/grid/types';
import { newRun, type RunState } from '../core/run/run';
import type { Fortification, Simulation } from '../core/sim/Simulation';
import { SaveStore } from '../save/SaveStore';
import { BastionBuildPanel } from '../ui/bastion/BastionBuildPanel';
import { BastionHub } from '../ui/bastion/BastionHub';
import { BastionReport } from '../ui/bastion/BastionReport';
import type { BastionBuildVM, BastionHubVM, BastionPaletteRow, BastionProjectRow, BastionReportVM, BastionStructureRow } from '../ui/bastion/bastionVM';

/**
 * Último Bastião (Montar Defesa) como modo jogável. Enquanto o modo está ativo, a jornada (run e perfil) fica
 * guardada e a `main.ts` usa a cidade do Bastião no lugar: a party, a carteira e a vida do núcleo. Nada disso
 * grava no save da jornada. Regras e números ficam em core/bastion e config/bastion; aqui só orquestra.
 */

/** O que o modo pede à `main.ts`. Os getters e setters existem porque a jornada usa variáveis globais. */
export interface BastionDeps {
  run(): RunState;
  setRun(r: RunState): void;
  profile(): Profile;
  setProfile(p: Profile): void;
  sim(): Simulation;
  /** Carrega o mapa do Bastião com a semente da próxima noite (batalha de planejamento). */
  loadMap(seed: number): void;
  /** Recria a batalha de planejamento com as construções atuais (a formação dos heróis é mantida). */
  rebuildSim(): void;
  startNight(): void;
  enterBattle(): void;
  focusParty(): void;
  closeMenu(): void;
  openMenu(): void;
  /** Construções que a simulação recebe (undefined = fora do Bastião). */
  setStructures(f: Fortification[] | undefined): void;
  setOverlay(fn: Area | undefined): void;
  /** Tiles dos heróis no planejamento: não se constrói em cima deles. */
  heroTiles(): Vec2[];
  cards(): CardCollection;
  saveCards(c: CardCollection): void;
  /** Abre a coleção de cartas com os slots calculados pelas ondas do Bastião. */
  openCollection(bastionNights: number): void;
  log(text: string, kind?: 'info' | 'good' | 'warn'): void;
}

type Area = (mark: (tiles: Vec2[], color: THREE.Color, strength: number) => void) => void;
type Done = { ok: true } | { ok: false; error: BuildError };

const SAVE_KEY = 'bastion';
const KINDS: StructureKind[] = ['wall', 'tower'];

/** Lê o Bastião salvo. Ausente ou corrompido = cidade nova. */
export function loadBastionState(): BastionState | undefined {
  try {
    const raw = SaveStore.get(SAVE_KEY);
    return raw ? migrateBastion(JSON.parse(raw) as BastionState) : undefined;
  } catch {
    return undefined;
  }
}

/** A noite só começa com uma tentativa rodando e o núcleo de pé. */
const canStartNight = (b: BastionState): boolean => !b.attemptEnded && b.coreHp > 0;

export class BastionSession {
  private b?: BastionState;
  /** Jornada guardada enquanto o modo roda (volta ao sair). */
  private ctx?: { run: RunState; profile: Profile };
  private lotCache?: Vec2[];
  private kind?: StructureKind;
  private selected?: number;
  private msg?: string;
  private readonly hub: BastionHub;
  private readonly build: BastionBuildPanel;
  private readonly report: BastionReport;

  constructor(private readonly d: BastionDeps) {
    this.hub = new BastionHub({
      onBuild: () => this.openBuild(),
      onNight: () => this.startNight(),
      onRepairCore: () => this.act(repairCore(this.state()), 'Núcleo reparado.'),
      onNewAttempt: () => this.act(startAttempt(this.state(), this.d.cards()), 'Nova tentativa começou.'),
      onUnlock: (id) => this.act(unlockProject(this.state(), id), 'Projeto desbloqueado.'),
      onParty: (party) => this.setParty(party),
      onRepairStructure: (id) => this.act(repairStructure(this.state(), id), 'Construção reparada.'),
      onUpgradeStructure: (id) => this.act(upgradeStructure(this.state(), id), 'Construção aprimorada.'),
      onCards: () => this.d.openCollection(this.state().nights),
      onExit: () => this.exit(),
    });
    this.build = new BastionBuildPanel({
      onPick: (kind) => this.pick(kind),
      onRepair: (id) => this.act(repairStructure(this.state(), id), 'Construção reparada.'),
      onUpgrade: (id) => this.act(upgradeStructure(this.state(), id), 'Construção aprimorada.'),
      onRemove: (id) => this.remove(id),
      onNight: () => this.startNight(),
      onBackToHub: () => this.backToHub(),
    });
    this.report = new BastionReport();
  }

  /** Modo ativo: a jornada está guardada e a batalha usa a cidade do Bastião. */
  get active(): boolean {
    return this.ctx !== undefined;
  }

  /** Grava a cidade quando um item ou a party muda durante o modo (o save da jornada não é tocado). */
  saveState(): void {
    if (this.ctx) this.save();
  }

  /** Entrada pelo menu principal ("Montar Defesa"): monta o planejamento e abre o menu do modo. */
  open(): void {
    this.enter();
    this.d.closeMenu();
    const b = this.state();
    const salvo = rescueIfStuck(b);
    if (salvo > 0) {
      this.msg = `Socorro: a cidade recebeu ${salvo} Zen.`;
      this.save();
    }
    this.planning();
    this.hub.open(this.hubVM());
  }

  /** Esc durante o modo: fecha a barra de construção, ou sai do menu do modo, ou abre o menu do modo. */
  escape(): void {
    if (!this.ctx || this.report.visible || this.d.sim().phase === 'running') return;
    if (this.build.visible) this.backToHub();
    else if (this.hub.visible) this.exit();
    else this.hub.open(this.hubVM());
  }

  /** Clique no campo durante o planejamento. Devolve true se o modo tratou o clique. */
  onCanvasClick(t: Vec2): boolean {
    if (!this.ctx || this.d.sim().phase !== 'setup') return false;
    const b = this.state();
    const alvo = b.structures.find((s) => s.x === t.x && s.y === t.y);
    if (this.kind && !alvo) {
      if (this.d.heroTiles().some((h) => h.x === t.x && h.y === t.y)) return false; // herói: segue sendo arrastado
      const kind = this.kind;
      const r = placeStructure(b, this.env(), kind, t);
      if (r.ok) {
        this.selected = r.id;
        this.msg = `${STRUCTURES[kind].name} construída por ${r.cost} Zen.`;
        this.touch();
      } else {
        this.msg = BUILD_MSG[r.error];
        this.refresh();
      }
      return true;
    }
    if (alvo) {
      this.selected = alvo.id;
      this.refresh();
      return true;
    }
    if (this.selected !== undefined) {
      this.selected = undefined;
      this.refresh();
    }
    return false;
  }

  /** Começa a noite (pela tela principal, pela barra de construção, pela tecla de horda ou pelo relógio). */
  startNight(): void {
    if (!this.ctx || this.d.sim().phase !== 'setup') return;
    const b = this.state();
    if (!canStartNight(b)) {
      this.msg = b.coreHp <= 0 ? BUILD_MSG.coreDown : 'Comece uma nova tentativa antes de defender a cidade.';
      this.refresh();
      return;
    }
    this.kind = undefined;
    this.selected = undefined;
    this.hub.close();
    this.build.close();
    this.d.setOverlay(undefined);
    this.syncRun();
    this.d.setStructures(fortificationsOf(b));
    this.d.rebuildSim();
    this.d.startNight();
  }

  /** A noite acabou (vitória ou derrota): aplica o resultado à cidade e mostra o relatório. */
  onEnd(): void {
    if (!this.ctx) return;
    const b = this.state();
    const sim = this.d.sim();
    const victory = sim.phase === 'victory';
    const vidaAntes = new Map(b.structures.map((s) => [s.id, s.hp] as const));
    const coreAntes = b.coreHp;
    const wave = sim.result();
    const out: NightOutcome = { victory, coreHp: sim.cityHp, structures: sim.fortificationStates(), wave };
    const cards = this.d.cards();
    const paga = applyNight(b, out, `night:${b.attempt}:${b.nights}:${b.nightsInAttempt}`, cards);
    const pacotes = paga?.packs.length ?? 0;
    if (pacotes > 0) this.d.saveCards(cards);
    this.save();
    let perdidas = 0;
    let danificadas = 0;
    for (const s of b.structures) {
      const antes = vidaAntes.get(s.id) ?? 0;
      if (antes > 0 && s.hp <= 0) perdidas++;
      else if (antes > 0 && s.hp > 0 && s.hp < antes) danificadas++;
    }
    this.msg = victory ? `Onda ${b.nights} vencida.` : 'A horda invadiu a cidade.';
    const vm: BastionReportVM = {
      victory,
      title: victory ? 'Horda repelida' : 'A horda invadiu',
      coreBefore: coreAntes,
      coreAfter: b.coreHp,
      coreMaxHp: b.coreMaxHp,
      kills: sim.killed,
      invaded: sim.reachedCity,
      structuresLost: perdidas,
      structuresDamaged: danificadas,
      zeniEarned: wave.zeni + (victory ? GAME_CONFIG.zeni.waveClearBonus : 0),
      packs: pacotes,
      attemptEnded: !!b.attemptEnded,
    };
    this.report.open(vm, () => this.afterNight());
  }

  /** Sai do modo: a jornada volta ao lugar e o menu principal abre. */
  exit(): void {
    if (!this.ctx) return;
    this.hub.close();
    this.build.close();
    this.report.close();
    this.d.setStructures(undefined);
    this.d.setOverlay(undefined);
    this.d.setRun(this.ctx.run);
    this.d.setProfile(this.ctx.profile);
    this.ctx = undefined;
    this.kind = undefined;
    this.selected = undefined;
    this.msg = undefined;
    this.d.openMenu();
  }

  // ---------------------------------------------------------------- estado e save

  /** A batalha lê a vida do núcleo e a party da jornada guardada: mantém essas cópias iguais à cidade do modo. */
  private syncRun(): void {
    const b = this.state();
    const r = this.d.run();
    r.cityHp = b.coreHp;
    r.cityMaxHp = b.coreMaxHp;
    r.party = [...b.party];
  }

  private state(): BastionState {
    if (!this.b) throw new Error('Bastião sem estado: entre pelo menu Montar Defesa.');
    return this.b;
  }

  /** Carrega o Bastião salvo (ou cria uma cidade nova, com a coleção de cartas atual). */
  private ensure(): BastionState {
    if (!this.b) {
      this.b = loadBastionState() ?? newBastion((Date.now() ^ 0x9e3779b9) >>> 0, this.d.cards());
      this.save();
    }
    return this.b;
  }

  private save(): void {
    if (!SaveStore.set(SAVE_KEY, JSON.stringify(this.state()))) this.d.log('Não foi possível salvar o Bastião (disco cheio ou sem permissão?).', 'warn');
  }

  /** Guarda a jornada e troca para a cidade do Bastião (run com a party, a carteira e a vida do núcleo do modo). */
  private enter(): void {
    if (this.ctx) return;
    const b = this.ensure();
    this.ctx = { run: this.d.run(), profile: this.d.profile() };
    const r = newRun(b.party[0]);
    r.profile = b.profile;
    r.party = [...b.party];
    r.dead = [];
    r.cityHp = b.coreHp;
    r.cityMaxHp = b.coreMaxHp;
    r.usedObjects = [];
    this.d.setRun(r);
    this.d.setProfile(b.profile);
  }

  /** Depois de qualquer ação: grava, recria o planejamento (se estiver nele) e atualiza as telas abertas. */
  private touch(): void {
    this.save();
    if (this.ctx && this.d.sim().phase === 'setup') {
      this.syncRun();
      this.d.setStructures(fortificationsOf(this.state()));
      this.d.rebuildSim();
    }
    this.refresh();
  }

  private act(res: Done, ok: string): void {
    this.msg = res.ok ? ok : BUILD_MSG[res.error];
    this.touch();
  }

  private refresh(): void {
    if (this.hub.visible) this.hub.update(this.hubVM());
    if (this.build.visible) this.build.update(this.buildVM());
  }

  // ---------------------------------------------------------------- planejamento e telas

  /** Monta o planejamento: mapa, construções atuais e a semente da próxima noite. */
  private planning(): void {
    const b = this.state();
    this.syncRun();
    this.d.setStructures(fortificationsOf(b));
    this.d.loadMap(waveSeed(b));
    this.d.enterBattle();
    this.d.focusParty();
    this.d.setOverlay((mark) => mark(this.lots(), new THREE.Color(0x3fa9ff), 0.2));
  }

  /** Depois do relatório: planejamento da próxima noite e menu do modo. */
  private afterNight(): void {
    if (!this.ctx) return;
    this.planning();
    this.hub.open(this.hubVM());
  }

  private openBuild(): void {
    if (!this.ctx || this.d.sim().phase !== 'setup') return;
    this.hub.close();
    this.kind = undefined;
    this.build.open(this.buildVM());
  }

  private backToHub(): void {
    this.build.close();
    this.kind = undefined;
    this.selected = undefined;
    this.hub.open(this.hubVM());
  }

  private pick(kind: StructureKind | undefined): void {
    this.kind = kind;
    this.msg = undefined;
    this.refresh();
  }

  private remove(id: number): void {
    const r = removeStructure(this.state(), id);
    if (this.selected === id) this.selected = undefined;
    this.msg = r.ok ? `Construção removida: ${r.refund} Zen devolvidos.` : BUILD_MSG[r.error];
    this.touch();
  }

  private setParty(party: HeroKind[]): void {
    const b = this.state();
    const r = setParty(b, party);
    if (r.ok) {
      this.syncRun();
      this.d.setStructures(fortificationsOf(b));
      this.d.loadMap(waveSeed(b)); // a formação volta com os heróis da nova party
    }
    this.msg = r.ok ? 'Party atualizada.' : BUILD_MSG[r.error];
    this.touch();
  }

  private env() {
    return bastionBuildEnv(ZONES[BASTION_ZONE_ID], this.d.heroTiles(), GAME_CONFIG.wave.spawnSafeRadius);
  }

  /** Área liberada para construir (lotes do mapa), calculada uma vez. */
  private lots(): Vec2[] {
    this.lotCache ??= parseZone(ZONES[BASTION_ZONE_ID]).lots.map((l) => ({ x: l.x, y: l.y }));
    return this.lotCache;
  }

  // ---------------------------------------------------------------- view models (só dados, nenhuma regra)

  private hubVM(): BastionHubVM {
    const b = this.state();
    return {
      attempt: b.attempt,
      nights: b.nights,
      nightsInAttempt: b.nightsInAttempt,
      bestNights: b.records.bestNights,
      zeni: b.profile.zeni,
      coreHp: b.coreHp,
      coreMaxHp: b.coreMaxHp,
      coreRepairCost: b.coreHp >= b.coreMaxHp ? 0 : coreRepairCost(b.coreMaxHp - b.coreHp),
      canStartNight: canStartNight(b),
      attemptEnded: !!b.attemptEnded,
      canNewAttempt: !!b.attemptEnded && b.coreHp > 0,
      party: HERO_ORDER.map((kind) => ({ kind, name: HERO_NAME[kind], selected: b.party.includes(kind) })),
      structures: b.structures.map((s) => this.structureRow(b, s)),
      projects: PROJECT_IDS.map((id) => this.projectRow(b, id)),
      message: this.msg,
    };
  }

  private buildVM(): BastionBuildVM {
    const b = this.state();
    const palette: BastionPaletteRow[] = KINDS.map((kind) => {
      const def = STRUCTURES[kind];
      const liberada = b.projects.includes(def.project);
      return {
        kind,
        name: def.name,
        desc: def.desc,
        cost: buildCostOf(b, kind),
        hp: def.hp,
        shot: def.shot ? { damage: def.shot.damage, range: def.shot.range } : undefined,
        unlocked: liberada,
        lockReason: liberada ? undefined : `Projeto necessário: ${PROJECTS[def.project].name}`,
        selected: this.kind === kind,
      };
    });
    const sel = this.selected !== undefined ? findStructure(b, this.selected) : undefined;
    return {
      attempt: b.attempt,
      nights: b.nights,
      zeni: b.profile.zeni,
      coreHp: b.coreHp,
      coreMaxHp: b.coreMaxHp,
      canStartNight: canStartNight(b),
      palette,
      selected: sel ? { ...this.structureRow(b, sel), invested: sel.invested } : undefined,
      message: this.msg,
    };
  }

  private structureRow(b: BastionState, s: Structure): BastionStructureRow {
    const def = STRUCTURES[s.kind];
    return {
      id: s.id,
      kind: s.kind,
      name: def.name,
      level: s.level,
      maxLevel: def.maxLevel,
      hp: s.hp,
      maxHp: structureMaxHp(b, s),
      status: structureStatus(b, s),
      repairCost: repairCostOf(b, s),
      upgradeCost: s.hp > 0 && s.level < def.maxLevel ? upgradeCostOf(b, s) : undefined,
      refund: refundOf(b, s),
    };
  }

  private projectRow(b: BastionState, id: string): BastionProjectRow {
    const p = PROJECTS[id];
    const owned = b.projects.includes(id);
    return { id, name: p.name, desc: p.desc, cost: p.cost, owned, lockReason: owned ? undefined : this.lockReason(b, id) };
  }

  /** Por que o projeto ainda não pode ser desbloqueado (mesma ordem das regras: pré-requisito, ondas, herói, Zen). */
  private lockReason(b: BastionState, id: string): string | undefined {
    const p = PROJECTS[id];
    const falta = p.requires.find((r) => !b.projects.includes(r));
    if (falta) return `Falta antes: ${PROJECTS[falta].name}`;
    if (p.minNights !== undefined && b.nights < p.minNights) return `Precisa de ${p.minNights} ondas vencidas (tem ${b.nights})`;
    if (p.hero && !b.party.includes(p.hero)) return `Precisa de ${HERO_NAME[p.hero]} na party`;
    if (b.profile.zeni < p.cost) return 'Zen insuficiente';
    return undefined;
  }
}
