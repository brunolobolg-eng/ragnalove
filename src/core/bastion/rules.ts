import { BASTION, PROJECTS, STRUCTURES, type StructureKind } from '../../config/bastion';
import { GAME_CONFIG } from '../../config/gameConfig';
import type { Board } from '../grid/Board';
import { chebyshev, type Vec2 } from '../grid/types';
import { addZeni, applyWaveResult, type WaveResult } from '../progression/profile';
import { applyCardLoadout, type CardCollection } from '../progression/cards';
import { findStructure, structureMaxHp, type BastionState, type Structure } from './bastion';
import { routeOpen } from './route';
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
  | 'route'
  | 'missing'
  | 'intact'
  | 'destroyed'
  | 'maxLevel'
  | 'unknownProject'
  | 'owned'
  | 'requires'
  | 'nights'
  | 'heroNeeded'
  | 'coreDown'
  | 'attemptRunning';

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
  route: 'Isso fecharia o caminho da horda.',
  missing: 'Construção não encontrada.',
  intact: 'Já está inteira.',
  destroyed: 'Está destruída: reconstrua antes de aprimorar.',
  maxLevel: 'Já está no nível máximo.',
  unknownProject: 'Projeto não existe.',
  owned: 'Projeto já desbloqueado.',
  requires: 'Falta desbloquear um projeto anterior.',
  nights: 'Ondas vencidas insuficientes.',
  heroNeeded: 'O herói deste projeto precisa estar na party.',
  coreDown: 'O núcleo caiu: repare-o antes de começar outra tentativa.',
  attemptRunning: 'A tentativa ainda não acabou.',
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

export function upgradeCostOf(s: Structure): number {
  return Math.round(STRUCTURES[s.kind].cost * BASTION.upgradeFactor * s.level);
}

/**
 * Reparo proporcional ao dano: quanto mais vida perdida, mais caro (investido × fração perdida × repairRate).
 * Destruída custa a reconstrução (investido × rebuildRate), sempre acima do reparo de qualquer dano.
 */
export function repairCostOf(b: BastionState, s: Structure): number {
  if (s.hp <= 0) return Math.max(BASTION.minRepair, Math.round(s.invested * BASTION.rebuildRate));
  const lost = 1 - s.hp / structureMaxHp(b, s);
  if (lost <= 0) return 0;
  return Math.max(BASTION.minRepair, Math.round(s.invested * lost * BASTION.repairRate));
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

/** Motivo da recusa (ou undefined = pode construir). Não gasta nada. */
export function checkPlacement(b: BastionState, env: BuildEnv, kind: StructureKind, at: Vec2): BuildError | undefined {
  const def = STRUCTURES[kind];
  if (!def) return 'unknownKind';
  if (!b.projects.includes(def.project)) return 'locked';
  if (!env.buildable(at.x, at.y)) return 'outside';
  if (env.board.isCity(at.x, at.y)) return 'city';
  if (!env.board.isWalkable(at.x, at.y)) return 'terrain';
  if (env.spawns.some((p) => chebyshev(p, at) <= env.spawnSafeRadius)) return 'spawn';
  if (b.structures.some((s) => s.x === at.x && s.y === at.y)) return 'occupied';
  if (env.heroes.some((h) => h.x === at.x && h.y === at.y)) return 'hero';
  if (b.profile.zeni < def.cost) return 'zeni';
  // As estruturas são quebráveis, então a horda sempre passa por elas (quebrando): a rota só pode
  // ser cortada pelo próprio mapa. A checagem roda mesmo assim, para o caso de um obstáculo novo.
  if (!routeOpen(env.board, env.spawns)) return 'route';
  return undefined;
}

export function placeStructure(b: BastionState, env: BuildEnv, kind: StructureKind, at: Vec2): Result<{ id: number; cost: number }> {
  const err = checkPlacement(b, env, kind, at);
  if (err) return fail(err);
  const cost = STRUCTURES[kind].cost;
  b.profile.zeni -= cost;
  const s: Structure = { id: b.nextId++, kind, x: at.x, y: at.y, level: 1, hp: 0, invested: cost };
  s.hp = structureMaxHp(b, s);
  b.structures.push(s);
  return { ok: true, id: s.id, cost };
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
  const cost = upgradeCostOf(s);
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
 * Começa outra tentativa a partir do estado salvo (a cidade não reinicia sozinha). As cartas são copiadas
 * da coleção compartilhada com a campanha: como na jornada, equipar só vale a partir da próxima tentativa.
 */
export function startAttempt(b: BastionState, cards: CardCollection): Result {
  if (!b.attemptEnded) return fail('attemptRunning');
  if (b.coreHp <= 0) return fail('coreDown');
  b.attemptEnded = false;
  b.attempt++;
  b.nightsInAttempt = 0;
  b.records.attempts++;
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

/**
 * Aplica o resultado de uma onda à cidade. Idempotente pela chave da onda: aplicar de novo (reabrir o
 * relatório, recarregar o jogo) não paga Zen nem desconta vida outra vez. Devolve false se já estava aplicada.
 */
export function applyNight(b: BastionState, out: NightOutcome, key: string): boolean {
  if (b.paidKey === key) return false;
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
  }
  if (!out.victory || b.coreHp <= 0) b.attemptEnded = true;
  b.records.bestNights = Math.max(b.records.bestNights, b.nightsInAttempt);
  return true;
}
