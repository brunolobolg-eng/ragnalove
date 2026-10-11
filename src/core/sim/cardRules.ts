/**
 * Regras das cartas de monstro na batalha. Cada herói da party carrega as regras das cartas equipadas
 * (`Unit.cardRules`). A simulação avisa os gatilhos (acertou, abateu, sofreu dano, esquivou...) e aqui se
 * decide o efeito. Tudo é determinístico: as chances usam o RNG de combate, e as recargas ficam em `Unit.cardCd`.
 */
import type { CardEffect, CardRuntime, CardTrigger } from '../progression/cards';
import type { DamageSource, SimEvent, Unit } from './types';

/** O que as regras pedem da simulação (a Simulation implementa). */
export interface CardHost {
  readonly tick: number;
  readonly tickRate: number;
  chance(p: number): boolean;
  enemies(): Unit[];
  emit(e: SimEvent): void;
  heal(u: Unit, amount: number): void;
  freeze(u: Unit, ticks: number): void;
  damage(u: Unit, amount: number, source: DamageSource, sourceId?: number, crit?: boolean): void;
  addSouls(u: Unit, amount: number): void;
}

/** Contexto do gatilho: alvo do golpe e dano causado (para o golpe extra). */
export interface CardCtx {
  target?: Unit;
  amount?: number;
}

/** Efeitos que atuam sobre um inimigo (alvo do gatilho ou o inimigo mais próximo). */
const TARGETED = new Set<CardEffect['kind']>(['slow', 'curse', 'freeze', 'poison', 'burst']);

const ticksOf = (sec: number, host: CardHost): number => Math.max(1, Math.round(sec * host.tickRate));

function nearestEnemy(host: CardHost, u: Unit): Unit | undefined {
  let best: Unit | undefined;
  let bestD = Infinity;
  for (const e of host.enemies()) {
    if (!e.alive) continue;
    const d = Math.max(Math.abs(e.x - u.x), Math.abs(e.y - u.y));
    if (d < bestD || (d === bestD && best && e.id < best.id)) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** Efeitos com duração que se somam ao que já está ativo: mantém o maior valor e estende o prazo. */
function strongest(until: number | undefined, value: number | undefined, tick: number, next: number, nextUntil: number): { value: number; until: number } {
  const ativo = (until ?? 0) > tick;
  return { value: Math.max(ativo ? value ?? 0 : 0, next), until: Math.max(until ?? 0, nextUntil) };
}

/** Aplica o efeito. Devolve false se não havia o que aplicar (ex.: golpe extra sem alvo). */
function applyEffect(host: CardHost, u: Unit, r: CardRuntime, target: Unit | undefined, ctx: CardCtx): boolean {
  const e = r.effect;
  const t = host.tick;
  switch (e.kind) {
    case 'shield': {
      const ativo = (u.shieldUntil ?? 0) > t ? u.shield ?? 0 : 0;
      u.shield = ativo + e.pct * u.maxHp;
      u.shieldUntil = Math.max(u.shieldUntil ?? 0, t + ticksOf(e.sec, host));
      return true;
    }
    case 'heal':
      if (u.hp >= u.maxHp) return false;
      host.heal(u, e.pct * u.maxHp);
      return true;
    case 'bless': {
      const s = strongest(u.blessUntil, u.blessAmp, t, e.amp, t + ticksOf(e.sec, host));
      u.blessAmp = s.value;
      u.blessUntil = s.until;
      return true;
    }
    case 'fury':
      u.furyUntil = Math.max(u.furyUntil ?? 0, t + ticksOf(e.sec, host));
      return true;
    case 'cooldown': {
      const n = ticksOf(e.sec, host);
      let mexeu = false;
      for (const k of Object.keys(u.cooldowns)) {
        if (u.cooldowns[k] > t) {
          u.cooldowns[k] = Math.max(t, u.cooldowns[k] - n);
          mexeu = true;
        }
      }
      return mexeu;
    }
    case 'slow': {
      if (!target) return false;
      const s = strongest(target.slowUntil, target.slowMult, t, e.mult, t + ticksOf(e.sec, host));
      target.slowMult = s.value;
      target.slowUntil = s.until;
      return true;
    }
    case 'curse': {
      if (!target) return false;
      const s = strongest(target.cursedUntil, target.curseAmp, t, e.amp, t + ticksOf(e.sec, host));
      target.curseAmp = s.value;
      target.cursedUntil = s.until;
      return true;
    }
    case 'freeze':
      if (!target) return false;
      host.freeze(target, ticksOf(e.sec, host));
      return true;
    case 'reflect': {
      const s = strongest(u.reflectUntil, u.reflectPct, t, e.pct, t + ticksOf(e.sec, host));
      u.reflectPct = s.value;
      u.reflectUntil = s.until;
      return true;
    }
    case 'burst':
      if (!target || ctx.amount === undefined) return false;
      host.damage(target, ctx.amount * e.pct, 'card', u.id);
      return true;
    case 'poison':
      if (!target) return false;
      target.dots = [...(target.dots ?? []), { perPulse: e.pct * target.maxHp, until: t + ticksOf(e.sec, host), source: 'poison', ownerId: u.id }];
      return true;
    case 'soul':
      host.addSouls(u, e.amount);
      return true;
  }
}

/**
 * Dispara as regras de `u` que correspondem ao gatilho. Cada regra respeita a própria recarga (`icd`);
 * `lowHp` dispara uma vez por batalha (recarga infinita); `tick` só no intervalo dela.
 */
export function cardTrigger(host: CardHost, u: Unit, trigger: CardTrigger, ctx: CardCtx = {}): void {
  if (!u.alive || !u.cardRules?.length) return;
  for (const r of u.cardRules) {
    if (r.trigger !== trigger) continue;
    if (trigger === 'tick' && host.tick % Math.max(1, Math.round((r.every ?? 0) * host.tickRate)) !== 0) continue;
    if ((u.cardCd?.[r.key] ?? 0) > host.tick) continue;
    if (r.chance < 1 && !host.chance(r.chance)) continue;
    const target = TARGETED.has(r.effect.kind) ? (ctx.target?.alive ? ctx.target : nearestEnemy(host, u)) : undefined;
    if (!applyEffect(host, u, r, target, ctx)) continue;
    u.cardCd ??= {};
    u.cardCd[r.key] = trigger === 'lowHp' ? Infinity : host.tick + Math.round(r.icd * host.tickRate);
    host.emit({ type: 'cardProc', unitId: u.id, name: r.name, effect: r.effect.kind, targetId: target?.id });
  }
}
