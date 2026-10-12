import { BASTION, PROJECTS, STRUCTURES, type StructureKind } from '../../config/bastion';
import { GAME_CONFIG } from '../../config/gameConfig';
import type { Board } from '../grid/Board';
import { chebyshev, type Vec2 } from '../grid/types';
import { addZeni, applyWaveResult, createProfile, type WaveResult } from '../progression/profile';
import { addCards, applyCardLoadout, cardSlots, rollPack, type CardCollection } from '../progression/cards';
import { HERO_ORDER } from '../../config/heroes';
import type { HeroKind } from '../progression/skills';
import { Rng } from '../sim/rng';
import { findStructure, structureMaxHp, type BastionState, type Structure } from './bastion';
import type { Fortification } from '../sim/Simulation';

/**
 * Regras do Último Bastião (puras: sem DOM, sem Three.js, sem Math.random). A UI chama estas funções e
 * mostra o resultado; nunca calcula custo nem decide colocação.
 * Toda ação que gasta Zen valida tudo ANTES de descontar. Toda ação devolve { ok } ou o motivo.
 */

/** Motivos de recusa (a UI mostra BUILD_MSG). */
export type BuildError =
  | 'unknownKind'
  | 'locked'
  | 'outside'
  | 'terrain'
  | 'city'
  | 'spawn'
  | 'occupied'
  | 'hero'
  | 'zeni'
  | 'missing'
  | 'notMovable'
  | 'notRecent'
  | 'sameTile'
  | 'intact'
  | 'destroyed'
  | 'maxLevel'
  | 'unknownProject'
  | 'owned'
  | 'requires'
  | 'nights'
  | 'heroNeeded'
  | 'coreDown'
  | 'attemptRunning'
  | 'partySize'
  | 'partyDuplicate'
  | 'unknownHero';

export const BUILD_MSG: Record<BuildError, string> = {
  unknownKind: 'Essa construção não existe.',
  locked: 'Projeto ainda não desbloqueado.',
  outside: 'Fora da área liberada para construir.',
  terrain: 'Terreno ocupado (parede, água ou objeto do mapa).',
  city: 'Não se constrói em cima do portão.',
  spawn: 'Perto demais do portal da horda.',
  occupied: 'Já existe uma construção aqui.',
  hero: 'Um herói está parado aqui.',
  zeni: 'Zen insuficiente.',
  missing: 'Construção não encontrada.',
  notMovable: 'Só muralhas inteiras podem ser movidas.',
  notRecent: 'Só dá para mover muralhas construídas neste turno.',
  sameTile: 'A construção já está neste tile.',
  intact: 'Já está inteira.',
  destroyed: 'Está destruída: reconstrua antes de aprimorar.',
  maxLevel: 'Já está no nível máximo.',
  unknownProject: 'Projeto não existe.',
  owned: 'Projeto já desbloqueado.',
  requires: 'Falta desbloquear um projeto anterior.',
  nights: 'Ondas vencidas insuficientes.',
  heroNeeded: 'O herói deste projeto precisa estar na party.',
  coreDown: 'O núcleo caiu: recomece do zero para defender a cidade.',
  attemptRunning: 'A tentativa ainda não acabou.',
  partySize: 'A party tem de ter de 1 a 6 heróis.',
  partyDuplicate: 'Um herói não pode entrar duas vezes na party.',
  unknownHero: 'Herói desconhecido.',
};

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: BuildError };
const fail = (error: BuildError) => ({ ok: false as const, error });

/** O que o chão permite nesta fase (vem da zona do Bastião, montada pelo chamador). */
export interface BuildEnv {
  /** Grade estática da zona: paredes, vazio, portão e objetos fixos. */
  board: Board;
  /** Tile dentro da área liberada para construir (fora da grade também conta como fora). */
  buildable(x: number, y: number): boolean;
  /** Portais da horda e raio (Chebyshev) em que nada pode ser construído. */
  spawns: readonly Vec2[];
  spawnSafeRadius: number;
  /** Onde a party está parada agora (não se constrói em cima de herói). */
  heroes: readonly Vec2[];
}

// ---------- custos ----------

/**
 * Preço da próxima construção do tipo. O preço base dobra (costGrowth) a cada construção que já existe
 * na cidade, destruída ou não, até o teto (priceCap). Remover uma faz o preço cair de novo. Torre tem preço fixo.
 */
export function buildCostOf(b: BastionState, kind: StructureKind): number {
  const def = STRUCTURES[kind];
  const existing = b.structures.filter((s) => s.kind === kind).length;
  const price = Math.round(def.cost * Math.pow(def.costGrowth, existing));
  return def.priceCap !== undefined ? Math.min(def.priceCap, price) : price;
}

/**
 * Preço do aprimoramento de L para L+1: o preço atual da construção do tipo (o que dobra) × o nível atual,
 * com o mesmo teto da construção. Reparo e reconstrução não entram aqui.
 */
export function upgradeCostOf(b: BastionState, s: Structure): number {
  const def = STRUCTURES[s.kind];
  const price = buildCostOf(b, s.kind) * s.level * BASTION.upgradeFactor;
  return Math.round(def.priceCap !== undefined ? Math.min(def.priceCap, price) : price);
}

/**
 * Reparo proporcional ao dano: quanto mais vida perdida, mais caro (investido × fração perdida × repairRate).
 * Destruída custa a reconstrução (investido × rebuildRate), sempre acima do reparo de qualquer dano.
 */
export function repairCostOf(b: BastionState, s: Structure): number {
  if (s.hp <= 0) return Math.max(BASTION.minRepair, Math.ceil(s.invested * BASTION.rebuildRate));
  const lost = 1 - s.hp / structureMaxHp(b, s);
  if (lost <= 0) return 0;
  return Math.max(BASTION.minRepair, Math.ceil(s.invested * lost * BASTION.repairRate));
}

/** Zen devolvido ao remover: parte do investido, na proporção da vida que ainda resta. Destruída não devolve. */
export function refundOf(b: BastionState, s: Structure): number {
  if (s.hp <= 0) return 0;
  return Math.round(s.invested * BASTION.refundRate * (s.hp / structureMaxHp(b, s)));
}

export function coreRepairCost(hp: number): number {
  return Math.round(hp * GAME_CONFIG.cityDefense.repairZeniPerHp);
}

// ---------- colocação ----------

/**
 * Regras de lugar, iguais para construir e mover: chão, portão, portal, ocupação e herói. Muralha
 * (`anywhere`) pode ficar fora dos lotes; torre não. Não há checagem de rota: as muralhas podem fechar
 * todos os caminhos, e a horda só as quebra quando não tem outro (ver Simulation).
 * `ignoreId` tira uma construção da conta de ocupação (o próprio movimento).
 */
function siteError(b: BastionState, env: BuildEnv, kind: StructureKind, at: Vec2, ignoreId?: number): BuildError | undefined {
  if (!STRUCTURES[kind].anywhere && !env.buildable(at.x, at.y)) return 'outside';
  if (env.board.isCity(at.x, at.y)) return 'city';
  if (!env.board.isWalkable(at.x, at.y)) return 'terrain';
  if (env.spawns.some((p) => chebyshev(p, at) <= env.spawnSafeRadius)) return 'spawn';
  if (b.structures.some((s) => s.id !== ignoreId && s.x === at.x && s.y === at.y)) return 'occupied';
  if (env.heroes.some((h) => h.x === at.x && h.y === at.y)) return 'hero';
  return undefined;
}

/**
 * Motivo da recusa de construir (ou undefined = pode construir). Não gasta nada. `ignoreId` ignora uma
 * construção na ocupação (para checar um tile sem contar a própria peça).
 */
export function checkPlacement(b: BastionState, env: BuildEnv, kind: StructureKind, at: Vec2, ignoreId?: number): BuildError | undefined {
  const def = STRUCTURES[kind];
  if (!def) return 'unknownKind';
  if (!b.projects.includes(def.project)) return 'locked';
  const site = siteError(b, env, kind, at, ignoreId);
  if (site) return site;
  if (b.profile.zeni < buildCostOf(b, kind)) return 'zeni';
  return undefined;
}

export function placeStructure(b: BastionState, env: BuildEnv, kind: StructureKind, at: Vec2): Result<{ id: number; cost: number }> {
  const err = checkPlacement(b, env, kind, at);
  if (err) return fail(err);
  const cost = buildCostOf(b, kind);
  b.profile.zeni -= cost;
  const s: Structure = { id: b.nextId++, kind, x: at.x, y: at.y, level: 1, hp: 0, invested: cost, placedTurn: b.turn };
  s.hp = structureMaxHp(b, s);
  b.structures.push(s);
  return { ok: true, id: s.id, cost };
}

// ---------- mover (muralhas recentes) ----------

/** Pode mover agora? Só muralha inteira (hp > 0) construída neste turno (placedTurn === turn). Torre nunca. */
export function isMovable(b: BastionState, s: Structure): boolean {
  return STRUCTURES[s.kind].movable === true && s.hp > 0 && s.placedTurn === b.turn;
}

/**
 * Motivo da recusa de mover para `at` (ou undefined = pode mover). Mover é de graça (sem checagem de Zen),
 * pode repetir no mesmo turno e mantém o turno de construção. As regras de lugar são as de construir.
 */
export function checkMove(b: BastionState, env: BuildEnv, id: number, at: Vec2): BuildError | undefined {
  const s = findStructure(b, id);
  if (!s) return 'missing';
  if (STRUCTURES[s.kind].movable !== true || s.hp <= 0) return 'notMovable';
  if (s.placedTurn !== b.turn) return 'notRecent';
  if (s.x === at.x && s.y === at.y) return 'sameTile';
  return siteError(b, env, s.kind, at, id);
}

/** Move a muralha recente para `at`. Não cobra Zen. Devolve de onde ela saiu. */
export function moveStructure(b: BastionState, env: BuildEnv, id: number, at: Vec2): Result<{ from: Vec2 }> {
  const err = checkMove(b, env, id, at);
  if (err) return fail(err);
  const s = findStructure(b, id);
  if (!s) return fail('missing');
  const from = { x: s.x, y: s.y };
  s.x = at.x;
  s.y = at.y;
  return { ok: true, from };
}

/** Estruturas da cidade como a simulação da onda recebe: vida atual e, nas torres, o tiro pelo nível. */
export function fortificationsOf(b: BastionState): Fortification[] {
  return b.structures.map((s) => {
    const f: Fortification = { id: s.id, kind: s.kind, x: s.x, y: s.y, hp: s.hp, maxHp: structureMaxHp(b, s) };
    const shot = STRUCTURES[s.kind].shot;
    if (shot) f.shot = { damage: shot.damage + shot.damagePerLevel * (s.level - 1), range: shot.range, cooldownTicks: shot.cooldownTicks };
    return f;
  });
}

// ---------- manutenção de estruturas ----------

/** Repara (vida parcial) ou reconstrói (destruída): restaura a vida máxima pelo custo proporcional. */
export function repairStructure(b: BastionState, id: number): Result<{ cost: number; rebuilt: boolean }> {
  const s = findStructure(b, id);
  if (!s) return fail('missing');
  const cost = repairCostOf(b, s);
  if (cost === 0) return fail('intact');
  if (b.profile.zeni < cost) return fail('zeni');
  const rebuilt = s.hp <= 0;
  b.profile.zeni -= cost;
  s.hp = structureMaxHp(b, s);
  return { ok: true, cost, rebuilt };
}

/** Sobe um nível. O ganho de vida entra na hora (a vida atual sobe pela diferença do máximo). */
export function upgradeStructure(b: BastionState, id: number): Result<{ cost: number }> {
  const s = findStructure(b, id);
  if (!s) return fail('missing');
  if (s.hp <= 0) return fail('destroyed');
  if (s.level >= STRUCTURES[s.kind].maxLevel) return fail('maxLevel');
  const cost = upgradeCostOf(b, s);
  if (b.profile.zeni < cost) return fail('zeni');
  const before = structureMaxHp(b, s);
  b.profile.zeni -= cost;
  s.invested += cost;
  s.level++;
  s.hp += structureMaxHp(b, s) - before;
  return { ok: true, cost };
}

/** Remove a construção e devolve o reembolso (regra explícita em BASTION.refundRate). */
export function removeStructure(b: BastionState, id: number): Result<{ refund: number }> {
  const i = b.structures.findIndex((s) => s.id === id);
  if (i < 0) return fail('missing');
  const refund = refundOf(b, b.structures[i]);
  addZeni(b.profile, refund);
  b.structures.splice(i, 1);
  return { ok: true, refund };
}

// ---------- projetos ----------

/** Desbloqueio permanente: pré-requisitos, ondas vencidas, herói na party e Zen (nessa ordem). */
export function unlockProject(b: BastionState, id: string): Result<{ cost: number }> {
  if (!Object.prototype.hasOwnProperty.call(PROJECTS, id)) return fail('unknownProject');
  const p = PROJECTS[id];
  if (b.projects.includes(id)) return fail('owned');
  if (!p.requires.every((r) => b.projects.includes(r))) return fail('requires');
  if (p.minNights !== undefined && b.nights < p.minNights) return fail('nights');
  if (p.hero && !b.party.includes(p.hero)) return fail('heroNeeded');
  if (b.profile.zeni < p.cost) return fail('zeni');
  b.profile.zeni -= p.cost;
  b.projects.push(id);
  return { ok: true, cost: p.cost };
}

// ---------- núcleo (vida da cidade) e recuperação ----------

/** Repara o núcleo (até `hp` de vida; por padrão, tudo o que falta). Mesmo preço do Templo da jornada. */
export function repairCore(b: BastionState, hp?: number): Result<{ cost: number; amount: number }> {
  const missing = b.coreMaxHp - b.coreHp;
  if (missing <= 0) return fail('intact');
  const amount = Math.min(missing, Math.max(1, Math.floor(hp ?? missing)));
  const cost = coreRepairCost(amount);
  if (b.profile.zeni < cost) return fail('zeni');
  b.profile.zeni -= cost;
  b.coreHp += amount;
  return { ok: true, cost, amount };
}

/**
 * Socorro contra a derrota severa: núcleo caído e sem Zen nem para o reparo mínimo. Concede Zen
 * (no máximo uma vez a cada BASTION.rescue.everyAttempts tentativas). Devolve o Zen concedido (0 = nada).
 */
export function rescueIfStuck(b: BastionState): number {
  if (b.coreHp > 0) return 0;
  const minCost = coreRepairCost(Math.ceil(b.coreMaxHp * BASTION.rescue.coreMinFraction));
  if (b.profile.zeni >= minCost) return 0;
  if (b.rescuedAttempt !== undefined && b.attempt - b.rescuedAttempt < BASTION.rescue.everyAttempts) return 0;
  b.rescuedAttempt = b.attempt;
  addZeni(b.profile, BASTION.rescue.zeni);
  return BASTION.rescue.zeni;
}

/**
 * Recomeça do zero depois de uma derrota (a tentativa acabou). Zera a cidade e os heróis do modo: estruturas,
 * projetos (só o castelo), noites (a horda volta à noite 1), núcleo cheio, Zen inicial e perfil novo (heróis
 * no nível 1, sem equipamento). Mantém a semente, o turno, a party escolhida, os recordes, o número de tentativas,
 * o total de vitórias (cartas e pacotes) e a coleção compartilhada, que não é tocada. As cartas são copiadas
 * da coleção, como na jornada: equipar só vale a partir daqui.
 */
export function startAttempt(b: BastionState, cards: CardCollection): Result {
  if (!b.attemptEnded) return fail('attemptRunning');
  b.attemptEnded = false;
  b.attempt++;
  b.records.attempts++;
  b.nights = 0;
  b.nightsInAttempt = 0;
  b.structures = [];
  b.projects = ['castle'];
  b.coreHp = b.coreMaxHp;
  b.profile = createProfile();
  b.profile.zeni = BASTION.startZeni;
  applyCardLoadout(b.profile, cards);
  return { ok: true };
}

// ---------- ondas ----------

/** Semente da próxima onda: a mesma cidade no mesmo ponto sempre enfrenta a mesma horda. */
export function waveSeed(b: BastionState): number {
  return (b.seed + Math.imul(b.nights, 1009) + Math.imul(b.attempt, 9176) + Math.imul(b.nightsInAttempt, 31)) >>> 0;
}

export interface NightOutcome {
  victory: boolean;
  /** Vida final do núcleo nesta onda. */
  coreHp: number;
  /** Vida final de cada estrutura da cidade nesta onda (0 = destruída). Ids desconhecidos são ignorados. */
  structures: { id: number; hp: number }[];
  /** Progressão dos heróis e recompensas da onda (mesmo formato da jornada). */
  wave: WaveResult;
}

/** O que applyNight devolve quando aplica uma onda: os pacotes de cartas que ela entregou. */
export interface NightResult {
  /** Pacotes de cartas entregues por esta onda (já estão na coleção compartilhada). */
  packs: string[][];
}

/**
 * Aplica o resultado de uma onda à cidade. Idempotente pela chave da onda: aplicar de novo (reabrir o
 * relatório, recarregar o jogo) não paga Zen, não desconta vida, não entrega pacote e não avança o turno outra vez.
 * Devolve undefined se a chave já tinha sido aplicada. `cards` é a coleção compartilhada com a campanha.
 * Só uma noite vencida avança o turno (e o total de vitórias): as muralhas do turno anterior ficam no lugar.
 * A derrota não avança nada disso; ela acaba a tentativa, e recomeçar do zero zera a cidade (startAttempt).
 */
export function applyNight(b: BastionState, out: NightOutcome, key: string, cards: CardCollection): NightResult | undefined {
  if (b.paidKey === key) return undefined;
  b.paidKey = key;
  for (const f of out.structures) {
    const s = findStructure(b, f.id);
    if (s) s.hp = Math.min(structureMaxHp(b, s), Math.max(0, f.hp));
  }
  b.coreHp = Math.min(b.coreMaxHp, Math.max(0, out.coreHp));
  applyWaveResult(b.profile, out.wave);
  if (out.victory) {
    addZeni(b.profile, GAME_CONFIG.zeni.waveClearBonus);
    b.profile.wavesWon = (b.profile.wavesWon ?? 0) + 1;
    b.nights++;
    b.nightsInAttempt++;
    b.records.totalNights++;
    b.turn++;
  }
  if (!out.victory || b.coreHp <= 0) b.attemptEnded = true;
  b.records.bestNights = Math.max(b.records.bestNights, b.nightsInAttempt);
  return { packs: grantWavePacks(b, cards) };
}

/**
 * Um pacote a cada BASTION.packEvery vitórias no Bastião, somadas em todas as tentativas (records.totalNights,
 * sem zerar). Mesmo formato do pacote da campanha. A semente sai da cidade e do número do pacote: a mesma
 * cidade sempre recebe o mesmo pacote.
 */
function grantWavePacks(b: BastionState, cards: CardCollection): string[][] {
  const packs: string[][] = [];
  while (b.records.totalNights >= (b.packsGiven + 1) * BASTION.packEvery) {
    const rng = new Rng((b.seed + Math.imul(b.packsGiven + 1, 7919)) >>> 0);
    const pack = rollPack(() => rng.next());
    addCards(cards, pack);
    packs.push(pack);
    b.packsGiven++;
  }
  return packs;
}

/** Monta a party do Bastião. Todas as classes estão liberadas no modo; a party tem de 1 a 6 heróis, sem repetir. */
export function setParty(b: BastionState, party: HeroKind[]): Result {
  if (party.length < 1 || party.length > 6) return fail('partySize');
  if (new Set(party).size !== party.length) return fail('partyDuplicate');
  if (!party.every((h) => HERO_ORDER.includes(h))) return fail('unknownHero');
  b.party = [...party];
  return { ok: true };
}

/**
 * Slots que o Bastião solta para a coleção compartilhada: a mesma curva da campanha, pelas vitórias de todas as
 * tentativas (records.totalNights). Derrota e recomeço não tiram slot.
 */
export function bastionCardSlots(b: BastionState): number {
  return cardSlots(b.records.totalNights);
}
