import * as THREE from 'three';
import { BASTION_ZONE_ID, PROJECTS, PROJECT_IDS, STRUCTURES, type StructureKind } from '../config/bastion';
import { GAME_CONFIG, type WaveOptions } from '../config/gameConfig';
import { HERO_NAME, HERO_ORDER } from '../config/heroes';
import { ZONES, parseZone } from '../config/zones';
import { findStructure, migrateBastion, newBastion, structureMaxHp, structureStatus, type BastionState, type Structure } from '../core/bastion/bastion';
import { hordeOf, type HordeWave } from '../core/bastion/horde';
import { bastionBuildEnv } from '../core/bastion/route';
import {
  BUILD_MSG,
  applyNight,
  buildCostOf,
  checkMove,
  checkPlacement,
  coreRepairCost,
  fortificationsOf,
  isMovable,
  moveStructure,
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
  type BuildEnv,
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
import type { BastionBuildVM, BastionHordeRow, BastionHubVM, BastionMoveWhy, BastionPaletteRow, BastionProjectRow, BastionReportVM, BastionStructureRow } from '../ui/bastion/bastionVM';

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
  /** Limite de zoom da câmera: o Bastião tem o próprio; ao sair, a campanha volta ao dela. */
  setZoomProfile(p: 'campaign' | 'bastion'): void;
  sim(): Simulation;
  /** Carrega o mapa do Bastião com a semente da próxima noite e a horda dela (tropa e chefe, se houver). */
  loadMap(seed: number, wave: WaveOptions): void;
  /** Mostra (undefined = esconde) a prévia da construção ou do movimento no campo. */
  setGhost(g: BastionGhost | undefined): void;
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
  /** Abre a coleção de cartas com os slots calculados pelas noites do Bastião. `onClose` roda quando o jogador a fecha. */
  openCollection(bastionNights: number, onClose: () => void): void;
  /** A coleção de cartas está aberta: o Esc e o Espaço são dela, não do Bastião. */
  isCollectionOpen(): boolean;
  log(text: string, kind?: 'info' | 'good' | 'warn'): void;
}

/** Prévia da construção sob o cursor: o núcleo decide (valid) e a mensagem diz o motivo ou o custo. */
export interface BastionGhost {
  kind: StructureKind;
  at: Vec2;
  valid: boolean;
  message: string;
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
  /** Muralha em modo de mover (undefined = fora dele). */
  private moving?: number;
  /** Tile sob o cursor no planejamento (a prévia é recalculada quando muda o tipo, a casa ou o modo). */
  private hover?: Vec2;
  /** Ambiente de colocação, refeito só quando muda a posição dos heróis (a grade estática é cara de montar). */
  private envCache?: { key: string; env: BuildEnv };
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
      onRepairStructure: (id) => this.repair(id),
      onUpgradeStructure: (id) => this.act(upgradeStructure(this.state(), id), 'Construção aprimorada.'),
      onCards: () => {
        this.hub.close();
        this.d.openCollection(this.state().nights, () => this.backFromCards());
      },
      onExit: () => this.exit(),
    });
    this.build = new BastionBuildPanel({
      onPick: (kind) => this.pick(kind),
      onRepair: (id) => this.repair(id),
      onUpgrade: (id) => this.act(upgradeStructure(this.state(), id), 'Construção aprimorada.'),
      onRemove: (id) => this.remove(id),
      onMove: (id) => this.toggleMove(id),
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
    if (this.d.isCollectionOpen()) return; // a coleção fecha com o próprio Esc
    if (this.moving !== undefined) {
      this.cancelMove('Movimento cancelado.');
      return;
    }
    if (!this.ctx || this.report.visible || this.d.sim().phase === 'running') return;
    if (this.build.visible) this.backToHub();
    else if (this.hub.visible) this.exit();
    else this.hub.open(this.hubVM());
  }

  /** Clique no campo durante o planejamento. Devolve true se o modo tratou o clique. */
  onCanvasClick(t: Vec2): boolean {
    if (!this.ctx || this.d.sim().phase !== 'setup') return false;
    if (this.moving !== undefined) return this.moveTo(t);
    const b = this.state();
    const alvo = b.structures.find((s) => s.x === t.x && s.y === t.y);
    const heroi = this.heroAt(t); // herói parado aqui: o clique é dele (arrastar ou escolher), não da construção
    if (this.kind && !alvo && !heroi) {
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
    if (alvo && !heroi) {
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

  /**
   * Mouse sobre o campo no planejamento (undefined = saiu do campo). Atualiza a prévia da construção ou do
   * movimento e devolve a prévia, para a dica ao lado do cursor. Sem tipo escolhido, não há prévia.
   */
  onHover(t: Vec2 | undefined): BastionGhost | undefined {
    this.hover = t;
    return this.showGhost();
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
    this.leaveMove();
    this.hideGhost();
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
    this.msg = victory ? `Noite ${b.nights} vencida.` : 'A horda invadiu a cidade.';
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
    this.leaveMove();
    this.hideGhost();
    this.d.setStructures(undefined);
    this.d.setOverlay(undefined);
    this.d.setRun(this.ctx.run);
    this.d.setProfile(this.ctx.profile);
    this.d.setZoomProfile('campaign');
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

  /** Grava em segundo plano (SaveStore.setLazy): construir não espera o disco. Falha no disco chega pelo aviso de main.ts. */
  private save(): void {
    if (!SaveStore.setLazy(SAVE_KEY, JSON.stringify(this.state()))) this.d.log('Não foi possível salvar o Bastião (disco cheio ou sem permissão?).', 'warn');
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
    this.d.setZoomProfile('bastion');
  }

  /** Depois de qualquer ação: grava, recria o planejamento (se estiver nele) e atualiza as telas abertas. */
  private touch(): void {
    this.save();
    if (this.ctx && this.d.sim().phase === 'setup') {
      this.syncRun();
      this.d.setStructures(fortificationsOf(this.state()));
      this.d.rebuildSim();
    }
    this.showGhost();
    this.refresh();
  }

  private act(res: Done, ok: string): void {
    this.msg = res.ok ? ok : BUILD_MSG[res.error];
    this.touch();
  }

  /** Repara (ou reconstrói, se destruída). Reconstruir com herói parado na casa é recusado antes de gastar Zen. */
  private repair(id: number): void {
    const b = this.state();
    const s = findStructure(b, id);
    if (s && s.hp <= 0 && this.heroAt(s)) {
      this.msg = BUILD_MSG.hero;
      this.refresh();
      return;
    }
    const r = repairStructure(b, id);
    this.msg = r.ok ? (r.rebuilt ? 'Construção reconstruída.' : 'Construção reparada.') : BUILD_MSG[r.error];
    this.touch();
  }

  /** A coleção aberta pelo Bastião foi fechada pelo jogador: volta ao menu do modo (se ainda estiver no planejamento). */
  private backFromCards(): void {
    if (this.ctx && this.d.sim().phase === 'setup') this.hub.open(this.hubVM());
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
    this.loadWave(b);
    this.d.enterBattle();
    this.d.focusParty();
    // áreas de lote (azul) só quando a torre está escolhida: a muralha vai a qualquer lugar
    this.d.setOverlay((mark) => {
      if (this.kind === 'tower') mark(this.lots(), new THREE.Color(0x3fa9ff), 0.2);
    });
  }

  /** Carrega o mapa do planejamento com a semente e a horda da próxima noite (a tropa comum e o chefe dela). */
  private loadWave(b: BastionState): void {
    const h = hordeOf(b.nights + 1);
    // noite comum não tem chefe: null desliga o chefe da zona (undefined colocaria o chefe dela em toda noite)
    this.d.loadMap(waveSeed(b), { count: h.count, mix: h.mix, boss: h.boss ?? null });
  }

  /** Depois do relatório: planejamento da próxima noite e menu do modo. */
  private afterNight(): void {
    if (!this.ctx) return;
    this.leaveMove();
    this.planning();
    this.hub.open(this.hubVM());
  }

  private openBuild(): void {
    if (!this.ctx || this.d.sim().phase !== 'setup') return;
    this.hub.close();
    this.kind = undefined;
    this.leaveMove();
    this.hideGhost();
    this.build.open(this.buildVM());
  }

  /** Volta ao menu do modo: sai do movimento e some com a prévia (a tela modal não manda o mouse ao campo). */
  private backToHub(): void {
    this.build.close();
    this.kind = undefined;
    this.selected = undefined;
    this.leaveMove();
    this.hideGhost();
    this.hub.open(this.hubVM());
  }

  private pick(kind: StructureKind | undefined): void {
    this.leaveMove(); // escolher um tipo para construir cancela o movimento
    this.kind = kind;
    this.msg = undefined;
    this.showGhost();
    this.refresh();
  }

  /** Botão Mover (ou Cancelar movimento) do painel: entra no modo de mover a muralha recente escolhida. */
  private toggleMove(id: number): void {
    if (this.moving === id) {
      this.cancelMove('Movimento cancelado.');
      return;
    }
    const b = this.state();
    const s = findStructure(b, id);
    if (!s || !isMovable(b, s)) {
      this.msg = s && STRUCTURES[s.kind].movable && s.hp > 0 ? BUILD_MSG.notRecent : BUILD_MSG.notMovable;
      this.refresh();
      return;
    }
    this.kind = undefined;
    this.selected = id;
    this.moving = id;
    this.msg = 'Movendo: passe o mouse no campo e clique numa casa livre.';
    this.showGhost();
    this.refresh();
  }

  /** Clique no campo com o modo de mover ativo: casa livre move a muralha; a própria casa cancela. */
  private moveTo(t: Vec2): boolean {
    const id = this.moving!;
    const b = this.state();
    const s = findStructure(b, id);
    if (!s || !isMovable(b, s)) {
      this.leaveMove();
      this.msg = BUILD_MSG.notRecent;
      this.showGhost();
      this.refresh();
      return true;
    }
    if (s.x === t.x && s.y === t.y) {
      this.cancelMove('Movimento cancelado.');
      return true;
    }
    const r = moveStructure(b, this.env(), id, t);
    if (!r.ok) {
      this.msg = BUILD_MSG[r.error];
      this.showGhost();
      this.refresh();
      return true;
    }
    // a muralha segue escolhida e movível neste turno; para mover de novo, clica-se em Mover (o modo sai aqui)
    this.leaveMove();
    this.selected = id;
    this.msg = 'Muralha movida. Para mover de novo, clique em Mover.';
    this.touch();
    return true;
  }

  /** Sai do modo de mover (sem mensagem). */
  private leaveMove(): void {
    this.moving = undefined;
  }

  /** Cancela o modo de mover com uma mensagem e atualiza a prévia e as telas. */
  private cancelMove(text: string): void {
    this.leaveMove();
    this.msg = text;
    this.showGhost();
    this.refresh();
  }

  /** Esconde a prévia (campo sem o cursor, noite começando, saída do modo). */
  private hideGhost(): void {
    this.hover = undefined;
    this.d.setGhost(undefined);
  }

  /**
   * Calcula a prévia para o tile sob o cursor e manda ao render. Só existe no planejamento, com um tipo
   * escolhido ou com o modo de mover ativo. A regra é a do núcleo (checkPlacement / checkMove).
   */
  private showGhost(): BastionGhost | undefined {
    const g = this.ghostAt(this.hover);
    // casa com construção: o modelo fantasma não cobre a peça; a mensagem (motivo ou custo) continua valendo
    this.d.setGhost(g && !this.structureAt(g.at) ? g : undefined);
    return g;
  }

  private ghostAt(t: Vec2 | undefined): BastionGhost | undefined {
    if (!t || !this.ctx || this.d.sim().phase !== 'setup') return undefined;
    if (this.moving === undefined && !this.kind) return undefined;
    const b = this.state();
    const env = this.env();
    if (this.moving !== undefined) {
      const s = findStructure(b, this.moving);
      if (!s) return undefined;
      // na própria casa o clique cancela o movimento: é uma ação válida, não uma recusa
      if (s.x === t.x && s.y === t.y) return { kind: s.kind, at: t, valid: true, message: 'Clique aqui para cancelar o movimento' };
      const err = checkMove(b, env, this.moving, t);
      return { kind: s.kind, at: t, valid: !err, message: err ? BUILD_MSG[err] : 'Pode mover para cá' };
    }
    if (!this.kind) return undefined;
    const kind = this.kind;
    const err = checkPlacement(b, env, kind, t);
    const cost = buildCostOf(b, kind);
    const ok = cost > 0 ? `Pode construir aqui por ${cost.toLocaleString('pt-BR')} Zen` : 'Pode construir aqui';
    return { kind, at: t, valid: !err, message: err ? BUILD_MSG[err] : ok };
  }

  private remove(id: number): void {
    const r = removeStructure(this.state(), id);
    if (this.selected === id) this.selected = undefined;
    if (this.moving === id) this.leaveMove();
    this.msg = r.ok ? `Construção removida: ${r.refund} Zen devolvidos.` : BUILD_MSG[r.error];
    this.touch();
  }

  private setParty(party: HeroKind[]): void {
    const b = this.state();
    const r = setParty(b, party);
    if (r.ok) {
      this.syncRun();
      this.d.setStructures(fortificationsOf(b));
      this.loadWave(b); // a formação volta com os heróis da nova party
    }
    this.msg = r.ok ? 'Party atualizada.' : BUILD_MSG[r.error];
    this.touch();
  }

  /** Ambiente de colocação: refeito só quando a posição dos heróis muda (o mouse chama isto a cada movimento). */
  private env(): BuildEnv {
    const heroes = this.heroSpots();
    const key = heroes.map((h) => `${h.x},${h.y}`).join(';');
    if (this.envCache?.key !== key) this.envCache = { key, env: bastionBuildEnv(ZONES[BASTION_ZONE_ID], heroes, GAME_CONFIG.wave.spawnSafeRadius) };
    return this.envCache.env;
  }

  /**
   * Tiles onde a party está ou volta a estar: a party agora e a formação padrão (a que volta depois de cada
   * noite). Não se constrói nem se move uma muralha em cima de nenhum deles.
   */
  private heroSpots(): Vec2[] {
    return [...this.d.heroTiles(), ...ZONES[BASTION_ZONE_ID].defaultSetup.members.map((m) => ({ x: m.x, y: m.y }))];
  }

  /** Há um herói da party parado neste tile? */
  private heroAt(t: Vec2): boolean {
    return this.d.heroTiles().some((h) => h.x === t.x && h.y === t.y);
  }

  /** Há construção (de pé ou destruída) neste tile? */
  private structureAt(t: Vec2): boolean {
    return this.state().structures.some((s) => s.x === t.x && s.y === t.y);
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
      nextHorde: this.hordeRow(b),
      message: this.msg,
    };
  }

  /** A horda da próxima noite (nights + 1): o núcleo monta; a tela só mostra. */
  private hordeRow(b: BastionState): BastionHordeRow {
    const h: HordeWave = hordeOf(b.nights + 1);
    return { wave: h.wave, title: h.title, detail: h.detail, tier: h.tier, count: h.count };
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
      selected: sel ? { ...this.structureRow(b, sel), invested: sel.invested, ...this.moveInfo(b, sel) } : undefined,
      message: this.msg,
    };
  }

  /** Mover: se pode agora, e o motivo (o texto é da tela). */
  private moveInfo(b: BastionState, s: Structure): { movable: boolean; moveWhy: BastionMoveWhy; moving: boolean } {
    const movable = isMovable(b, s);
    const moveWhy: BastionMoveWhy = !STRUCTURES[s.kind].movable ? 'fixed' : s.hp <= 0 ? 'destroyed' : movable ? 'recent' : 'old';
    return { movable, moveWhy, moving: this.moving === s.id };
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
    if (p.minNights !== undefined && b.nights < p.minNights) return `Precisa de ${p.minNights} noites vencidas (tem ${b.nights})`;
    if (p.hero && !b.party.includes(p.hero)) return `Precisa de ${HERO_NAME[p.hero]} na party`;
    if (b.profile.zeni < p.cost) return 'Zen insuficiente';
    return undefined;
  }
}
