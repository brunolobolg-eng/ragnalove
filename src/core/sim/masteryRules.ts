/**
 * Efeitos de combate das Masteries táticas (árvore global). Cada herói carrega no máximo uma Mastery
 * (Unit.mastery). A simulação avisa quatro momentos e aqui se decide o efeito:
 * - preDano: antes de aplicar o dano que o herói causa (bônus contra pesados, execução, golpe cíclico);
 * - aoAcertar: depois de um golpe do herói que causou dano (estilhaço, marca, frio, lentidão, atordoar, empurrão);
 * - aoSofrer: depois de o herói levar dano (escudo, cura de emergência, recuo);
 * - aoAbater: quando o herói derruba um inimigo (avanço, recuo, bênção, escudo e cura da equipe).
 *
 * Sem Mastery, nada disto sorteia nem muda o dano: a simulação segue igual. Sorteios usam o RNG de combate
 * (host.chance), só quando a Mastery age. Efeitos de dano usam source 'card' (não encadeiam golpes).
 */
import { INIMIGOS_PESADOS, type MasteryRegra } from '../../config/arvoreGlobal';
import { chebyshev, type Vec2 } from '../grid/types';
import type { DamageSource, Unit } from './types';

/** O que as regras pedem da simulação (a Simulation implementa). */
export interface MasteryHost {
  readonly tick: number;
  readonly tickRate: number;
  chance(p: number): boolean;
  enemies(): Unit[];
  aliados(): Unit[];
  damage(u: Unit, amount: number, source: DamageSource, sourceId?: number, crit?: boolean): void;
  heal(u: Unit, amount: number): void;
  applySlow(u: Unit, mult: number, ticks: number): void;
  stun(u: Unit, ticks: number): void;
  mark(u: Unit, amp: number, reflect: number, ticks: number): void;
  chill(u: Unit, ticks: number): void;
  knockback(u: Unit, from: Vec2, steps: number): boolean;
  pull(u: Unit, to: Vec2, steps: number): boolean;
  bless(caster: Unit, targets: Unit[], amp: number, ticks: number): void;
  shieldAlly(caster: Unit, u: Unit, absorb: number, ticks: number): void;
}

/** Golpes corpo a corpo da party (Pressão, Estilhaço, Lentidão, Atordoar, Golpe Cíclico). */
export const MELEE_SOURCES = new Set<DamageSource>(['melee', 'bash', 'cleave', 'blade', 'spear', 'execute']);
/** Dano contínuo (queimadura, veneno...): não conta como golpe. */
const CONTINUO = new Set<DamageSource>(['burn', 'poison', 'oil', 'ruin', 'combust', 'curse', 'frost']);
/** Dano que não é golpe do herói (cartas, reflexo, armadilha, torre, debug) nem contínuo. */
const NAO_GOLPE = new Set<DamageSource>([...CONTINUO, 'card', 'reflect', 'trap', 'tower', 'debug']);

const PESADOS = new Set<string>(INIMIGOS_PESADOS);
const ticks = (sec: number, host: MasteryHost) => Math.max(1, Math.round(sec * host.tickRate));

/** Dano do herói antes de aplicar: bônus contra pesados, execução e golpe cíclico. Devolve o novo dano. */
export function masteryPreDano(alvo: Unit, atacante: Unit, source: DamageSource, amount: number): number {
  const r = atacante.mastery;
  if (!r || atacante.team !== 'party' || alvo.team !== 'enemy') return amount;
  switch (r.tipo) {
    case 'execucao':
      if (!CONTINUO.has(source) && alvo.hp <= alvo.maxHp * r.limiar) return amount * (1 + r.bonus);
      return amount;
    case 'bonusContraPesado':
      return PESADOS.has(alvo.kind) && !CONTINUO.has(source) ? amount * (1 + r.pct) : amount;
    case 'golpeCiclico':
      if (!MELEE_SOURCES.has(source)) return amount;
      atacante.masteryHits = (atacante.masteryHits ?? 0) + 1;
      return atacante.masteryHits % r.a === 0 ? amount * (1 + r.pct) : amount;
    default:
      return amount;
  }
}

/** Golpe do herói que causou `aplicado` de dano: efeitos de acerto. Só para golpes (não contínuo, não carta). */
export function masteryAoAcertar(host: MasteryHost, heroi: Unit, alvo: Unit, source: DamageSource, aplicado: number): void {
  const r: MasteryRegra | undefined = heroi.mastery;
  if (!r || heroi.team !== 'party' || alvo.team !== 'enemy' || !alvo.alive || aplicado <= 0 || NAO_GOLPE.has(source)) return;
  const corpo = MELEE_SOURCES.has(source);
  switch (r.tipo) {
    case 'estilhaco':
      if (corpo && host.chance(r.chance)) {
        for (const o of host.enemies()) {
          if (o !== alvo && o.alive && chebyshev(o, alvo) <= 1) host.damage(o, aplicado * r.pct, 'card', heroi.id);
        }
      }
      return;
    case 'marca':
      if (host.chance(r.chance)) host.mark(alvo, r.amp, 0, ticks(r.sec, host));
      return;
    case 'frio':
      if (host.chance(r.chance)) host.chill(alvo, ticks(r.sec, host));
      return;
    case 'lentidao':
      if (corpo && host.chance(r.chance)) host.applySlow(alvo, r.mult, ticks(r.sec, host));
      return;
    case 'atordoar':
      if (corpo && host.chance(r.chance)) host.stun(alvo, ticks(r.sec, host));
      return;
    case 'empurrao':
      if (corpo && alvo.alive && host.chance(r.chance)) host.knockback(alvo, { x: heroi.x, y: heroi.y }, r.passos);
      return;
    default:
      return;
  }
}

/** O herói da party levou `aplicado` de dano: escudo, cura de emergência e recuo. */
export function masteryAoSofrer(host: MasteryHost, heroi: Unit, atacante: Unit | undefined, source: DamageSource, aplicado: number): void {
  const r = heroi.mastery;
  if (!r || heroi.team !== 'party' || aplicado <= 0) return;
  switch (r.tipo) {
    case 'escudoReativo':
      if (heroi.alive && !heroi.masteryUsed && heroi.hp <= heroi.maxHp * r.limiar) {
        heroi.masteryUsed = true;
        const ativo = (heroi.shieldUntil ?? 0) > host.tick ? heroi.shield ?? 0 : 0;
        heroi.shield = ativo + r.pct * heroi.maxHp;
        heroi.shieldUntil = Math.max(heroi.shieldUntil ?? 0, host.tick + ticks(r.sec, host));
      }
      return;
    case 'curaReativa':
      if (heroi.alive && !heroi.masteryUsed && heroi.hp <= heroi.maxHp * r.limiar) {
        heroi.masteryUsed = true;
        host.heal(heroi, r.pct * heroi.maxHp);
      }
      return;
    case 'recuoSofrido':
      if (heroi.alive && atacante?.team === 'enemy' && atacante.alive && MELEE_SOURCES.has(source) && host.chance(r.chance)) {
        host.knockback(heroi, { x: atacante.x, y: atacante.y }, r.passos);
      }
      return;
    default:
      return;
  }
}

/** O herói derrubou `vitima`: avanço, recuo, bênção, escudo e cura da equipe. */
export function masteryAoAbater(host: MasteryHost, heroi: Unit, vitima: Unit): void {
  const r = heroi.mastery;
  if (!r || heroi.team !== 'party' || !heroi.alive) return;
  switch (r.tipo) {
    case 'avancoAbate': {
      let perto: Unit | undefined;
      for (const e of host.enemies()) {
        if (e === vitima || !e.alive) continue;
        if (!perto || chebyshev(e, heroi) < chebyshev(perto, heroi) || (chebyshev(e, heroi) === chebyshev(perto, heroi) && e.id < perto.id)) perto = e;
      }
      if (perto) host.pull(heroi, { x: perto.x, y: perto.y }, r.passos);
      return;
    }
    case 'recuoAbate':
      host.knockback(heroi, { x: vitima.x, y: vitima.y }, r.passos);
      return;
    case 'bencaoEquipe':
      host.bless(heroi, host.aliados(), r.amp, ticks(r.sec, host));
      return;
    case 'escudoAliado': {
      const alvo = [...host.aliados()].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id - b.id)[0];
      if (alvo) host.shieldAlly(heroi, alvo, Math.round(r.pct * alvo.maxHp), ticks(r.sec, host));
      return;
    }
    case 'curaColetiva':
      for (const a of host.aliados()) host.heal(a, r.pct * a.maxHp);
      return;
    default:
      return;
  }
}
