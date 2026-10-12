/**
 * Regras das cartas de monstro na batalha. Cada herói da party carrega as regras das cartas equipadas
 * (`Unit.cardRules`). A simulação avisa os gatilhos (acertou, abateu, sofreu dano, esquivou...) e aqui se
 * decide o efeito. Tudo é determinístico: as chances usam o RNG de combate, e as recargas ficam em `Unit.cardCd`.
 *
 * Três tipos são diferentes dos demais:
 * - `stat` (atributo ou derivado): soma uma vez, no começo da batalha (`cardStatDelta`).
 * - `modDano` (passivo): a Simulation consulta no dano que o herói causa (`cardDealMult`) e no que sofre (`cardTakenMult`).
 * - `respingo`: no golpe do herói, respinga um percentual nos inimigos perto do alvo. O dano sai como carta,
 *   então não dispara golpe nem respingo de novo (sem cadeia).
 */
import { BONUS_FONTES, BONUS_TARGETS, CARD_MOD_DANO_MIN, type CardEffect, type CardRuntime, type CardStat, type CardTrigger } from '../progression/cards';
import { ATTR_KEYS, computeStats, emptyAttrs, emptyGear, type Attrs, type GearBonus, type HeroStats } from '../progression/attributes';
import { chebyshev } from '../grid/types';
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
  /** Soma a carta de atributo/derivado aos status do herói (ver cardStatDelta). */
  boostStat(u: Unit, stat: CardStat, value: number): void;
}

/** Contexto do gatilho: alvo do golpe e dano causado (para o golpe extra e o respingo). */
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
    case 'stat':
      host.boostStat(u, e.stat, e.value);
      return true;
    case 'modDano':
      // Passivo: a Simulation aplica no dano (cardDealMult / cardTakenMult). Aqui só anuncia a carta.
      return true;
    case 'respingo': {
      // Respinga pct do golpe em cada outro inimigo vivo a até `raio` tiles do alvo. Dano de carta: não dispara golpe.
      const alvo = ctx.target;
      if (!alvo || ctx.amount === undefined) return false;
      let atingiu = false;
      for (const o of host.enemies()) {
        if (o === alvo || !o.alive || chebyshev(o, alvo) > e.raio) continue;
        host.damage(o, ctx.amount * e.pct, 'card', u.id);
        atingiu = true;
      }
      return atingiu;
    }
  }
}

/**
 * Dispara as regras de `u` que correspondem ao gatilho. Cada regra respeita a própria recarga (`icd`);
 * `lowHp` dispara uma vez por batalha (recarga infinita); `tick` só no intervalo dela.
 * Invariantes: `stat` só no começo da batalha (uma vez); `respingo` só no golpe (hit/crit).
 */
export function cardTrigger(host: CardHost, u: Unit, trigger: CardTrigger, ctx: CardCtx = {}): void {
  if (!u.alive || !u.cardRules?.length) return;
  for (const r of u.cardRules) {
    if (r.trigger !== trigger) continue;
    if (r.effect.kind === 'stat' && trigger !== 'start') continue;
    if (r.effect.kind === 'respingo' && trigger !== 'hit' && trigger !== 'crit') continue;
    if (trigger === 'tick' && host.tick % Math.max(1, Math.round((r.every ?? 0) * host.tickRate)) !== 0) continue;
    if ((u.cardCd?.[r.key] ?? 0) > host.tick) continue;
    if (r.chance < 1 && !host.chance(r.chance)) continue;
    const target = TARGETED.has(r.effect.kind) ? (ctx.target?.alive ? ctx.target : nearestEnemy(host, u)) : r.effect.kind === 'respingo' ? ctx.target : undefined;
    if (!applyEffect(host, u, r, target, ctx)) continue;
    u.cardCd ??= {};
    u.cardCd[r.key] = trigger === 'lowHp' ? Infinity : host.tick + Math.round(r.icd * host.tickRate);
    host.emit({ type: 'cardProc', unitId: u.id, name: r.name, effect: r.effect.kind, targetId: target?.id });
  }
}

// ---------- modDano (passivo) ----------

/**
 * Soma das regras modDano de `u` no sentido pedido. `outro` é o inimigo (quem recebe, se 'causa';
 * quem bate, se 'recebe') e `fonte` o tipo de dano. Casa quando o inimigo está no grupo `alvo` (se houver)
 * E o dano é da `fonte` (se houver): vale `valor`; se não casa, vale `resto`. Devolve o multiplicador (1 = sem carta).
 */
function modDanoMult(u: Unit, sentido: 'causa' | 'recebe', outro: Unit, fonte: DamageSource): number {
  if (!u.cardRules?.length) return 1;
  let soma = 0;
  for (const r of u.cardRules) {
    const e = r.effect;
    if (e.kind !== 'modDano' || e.sentido !== sentido) continue;
    const casaAlvo = e.alvo === undefined || (BONUS_TARGETS[e.alvo]?.kinds ?? []).includes(outro.kind);
    const casaFonte = e.fonte === undefined || BONUS_FONTES[e.fonte].sources.includes(fonte);
    soma += casaAlvo && casaFonte ? e.valor : (e.resto ?? 0);
  }
  return Math.max(CARD_MOD_DANO_MIN, 1 + soma);
}

/** Multiplicador do dano que `atacante` (herói) causa a `alvo` com a fonte `fonte` (regras modDano 'causa'). */
export const cardDealMult = (atacante: Unit, alvo: Unit, fonte: DamageSource): number => modDanoMult(atacante, 'causa', alvo, fonte);

/** Multiplicador do dano que `heroi` sofre de `atacante` com a fonte `fonte` (regras modDano 'recebe'). */
export const cardTakenMult = (heroi: Unit, atacante: Unit, fonte: DamageSource): number => modDanoMult(heroi, 'recebe', atacante, fonte);

// ---------- stat (começo da batalha) ----------

/** Atributo efetivo que cada carta de atributo soma (os demais status vão pelo equipamento, como as rolagens). */
const STAT_ATTR: Partial<Record<CardStat, keyof Attrs>> = {
  forca: 'str',
  inteligencia: 'int',
  vitalidade: 'vit',
  destreza: 'dex',
  sorte: 'luk',
};

/** Mudança dos status de um herói por uma carta: atributos somados e status numéricos somados (diferença). */
export interface StatDelta {
  attrs: Attrs;
  nums: Record<string, number>;
}

/**
 * Quanto uma carta de atributo/derivado muda os status do herói, pelo mesmo caminho dos itens:
 * o bônus entra como equipamento (`GearBonus`, como as rolagens) e `computeStats` faz as fórmulas.
 * O HeroStats traz só os números finais, então o equipamento é reconstruído a partir deles: o que sobra
 * além do que atributos e habilidades dão (sem equipamento, `computeStats(..., emptyGear())`).
 * Devolve só a DIFERENÇA: ela é somada aos status atuais, então solo bônus e fogueiras não se perdem.
 * Aproximação conhecida: o refino de armadura (hpMult) não entra no ganho de vida da carta.
 * Unidades (como em CARD_STAT_LABEL): atributos e Mana em pontos; esquiva, crítico, dano crítico, Skill Haste e
 * vida máxima em fração (0,05 = 5%). A vida máxima entra como refino de armadura (hpMult), como o item faz.
 */
export function cardStatDelta(kind: string, s: HeroStats, stat: CardStat, value: number): StatDelta {
  const base = computeStats(kind, s.attrs, emptyGear(), s.skills);
  const gear: GearBonus = {
    ...emptyGear(),
    hpRegen: s.hpRegenPerSec,
    weapon: s.weapon,
    skillHaste: s.skillHaste - base.skillHaste,
    crit: s.crit - base.crit,
    critDamage: s.critDamage - base.critDamage,
    dodge: s.dodge - base.dodge,
    block: s.block - base.block,
    mana: s.mana - base.mana,
    damageMult: s.skillDamageMult / base.skillDamageMult,
  };
  const depois: GearBonus = { ...gear, attrs: emptyAttrs() };
  const attrsDepois: Attrs = { ...s.attrs };
  const attr = STAT_ATTR[stat];
  if (attr) attrsDepois[attr] += value;
  else if (stat === 'haste') depois.skillHaste += value;
  else if (stat === 'critico') depois.crit += value;
  else if (stat === 'danoCritico') depois.critDamage += value;
  else if (stat === 'esquiva') depois.dodge += value;
  else if (stat === 'mana') depois.mana += value;
  else if (stat === 'vidaMax') depois.hpMult += value;

  const antes = computeStats(kind, s.attrs, gear, s.skills);
  const com = computeStats(kind, attrsDepois, depois, s.skills);
  const nums: Record<string, number> = {};
  for (const [k, v] of Object.entries(com)) {
    if (typeof v === 'number') nums[k] = v - (antes as unknown as Record<string, number>)[k];
  }
  const attrs = emptyAttrs();
  for (const k of ATTR_KEYS) attrs[k] = attrsDepois[k] - s.attrs[k];
  return { attrs, nums };
}

/** Soma a diferença aos status atuais do herói (devolve um HeroStats novo). */
export function applyStatDelta(s: HeroStats, d: StatDelta): HeroStats {
  const out = { ...s, attrs: { ...s.attrs } } as HeroStats;
  for (const k of ATTR_KEYS) out.attrs[k] += d.attrs[k];
  const num = out as unknown as Record<string, number>;
  for (const [k, v] of Object.entries(d.nums)) num[k] += v;
  return out;
}
