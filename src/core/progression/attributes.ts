import { GAME_CONFIG } from '../../config/gameConfig';
import { SKILL_NUM, lvOf, type SkillLevels } from './skills';

/** Atributos distribuíveis. */
export type AttrKey = 'str' | 'int' | 'vit' | 'dex' | 'luk';
export const ATTR_KEYS: AttrKey[] = ['str', 'int', 'vit', 'dex', 'luk'];
export type Attrs = Record<AttrKey, number>;

export const ATTR_LABEL: Record<AttrKey, string> = {
  str: 'Força',
  int: 'Inteligência',
  vit: 'Vitalidade',
  dex: 'Destreza',
  luk: 'Sorte',
};

/**
 * Todas as fórmulas de atributo ficam aqui. Os efeitos valem sobre o que está ACIMA
 * dos atributos base, então um herói "zerado" joga exatamente como o balanceamento
 * original do GAME_CONFIG.
 */
export const ATTRIBUTES_CONFIG = {
  base: {
    warrior: { str: 5, int: 1, vit: 5, dex: 3, luk: 1 },
    mage: { str: 1, int: 5, vit: 2, dex: 3, luk: 2 },
    archer: { str: 2, int: 1, vit: 3, dex: 6, luk: 3 },
  } as Record<string, Attrs>,
  vit: { hpPerPoint: 8 },
  str: {
    cleaveDamagePerPoint: 1.5,
    cleaveRangeEveryPoints: 10, // +1 tile de alcance a cada 10 pontos
    cleaveRangeMax: 4,
    cleaveAnglePerPoint: 1.2, // graus
    cleaveAngleMax: 80,
    bashDamagePerPoint: 2,
  },
  int: {
    barrierLengthEveryPoints: 6, // +1 tile em cada barreira a cada 6 pontos
    barrierLengthMax: 6,
    barrierDurationPerPoint: 3, // ticks
    boltDamagePerPoint: 0.8,
  },
  dex: { cooldownReductionPerPoint: 0.015, cooldownReductionMax: 0.5 },
  luk: {
    dodgePerPoint: 0.004,
    dropChancePerPoint: 0.0015,
    /** Quanto cada ponto de Sorte desloca os pesos de raridade (ver equipment.ts). */
    rarityShiftPerPoint: 0.05,
  },
  /** Arqueira: Destreza é o atributo de dano (além de reduzir recargas). */
  archer: { arrowDamagePerDex: 0.9, rainDamagePerDex: 0.6, critPerLuk: 0.005 },
  caps: { dodge: 0.5, block: 0.5 },
  /**
   * Arma: classes físicas dependem do Ataque (desarmado = 45% do dano; arma inicial ATQ 12 = 100%);
   * o Mago depende menos do cajado (Ataque mágico) e mais da Inteligência.
   */
  weapon: { physBase: 0.45, physPerAtk: 0.046, magicBase: 0.75, magicPerMatk: 0.021 },
};

/** Multiplicador de dano vindo da arma equipada. */
export function weaponMult(kind: string, gear: GearBonus): number {
  const W = ATTRIBUTES_CONFIG.weapon;
  return kind === 'mage' ? W.magicBase + gear.matk * W.magicPerMatk : W.physBase + gear.atk * W.physPerAtk;
}

/** Bônus planos vindos de equipamento (somados antes das fórmulas). */
export interface GearBonus {
  attrs: Attrs;
  hpRegen: number; // HP por segundo
  cooldownReduction: number; // 0..1 ("regeneração de mana" / velocidade de ataque)
  attackSpeed: number; // 0..1
  block: number; // 0..1
  dodge: number; // 0..1
  /** Refino da arma: multiplica o dano das habilidades. */
  damageMult: number;
  /** Refino da armadura: multiplica o HP máximo. */
  hpMult: number;
  /** Ataque da arma física / ataque mágico do cajado. */
  atk: number;
  matk: number;
}

export const emptyAttrs = (): Attrs => ({ str: 0, int: 0, vit: 0, dex: 0, luk: 0 });
export const emptyGear = (): GearBonus => ({ attrs: emptyAttrs(), hpRegen: 0, cooldownReduction: 0, attackSpeed: 0, block: 0, dodge: 0, damageMult: 1, hpMult: 1, atk: 0, matk: 0 });

/** Status finais usados pela simulação. */
export interface HeroStats {
  attrs: Attrs; // atributos efetivos (distribuídos + equipamento)
  maxHp: number;
  hpRegenPerSec: number;
  cooldownMult: number; // multiplica todas as recargas
  dodge: number;
  block: number;
  luck: number;
  // Mago
  barrierLength: number;
  barrierDurationTicks: number;
  barrierCooldownTicks: number;
  burnDamage: number;
  boltDamage: number;
  boltRange: number;
  boltCooldownTicks: number;
  // Guerreiro
  cleaveDamage: number;
  cleaveRange: number;
  cleaveHalfAngleDeg: number;
  cleaveCooldownTicks: number;
  bashDamage: number;
  bashCooldownTicks: number;
  // Arqueira
  arrowDamage: number;
  arrowRange: number;
  arrowCooldownTicks: number;
  rainDamage: number;
  rainRadius: number;
  rainCooldownTicks: number;
  /** Chance de acerto crítico (dano ×2) — Olho de Águia e Sorte. */
  crit: number;
  /** Multiplica o dano recebido (Pele de Ferro / Escudo Arcano). */
  damageTakenMult: number;
  /** Multiplicador de dano das habilidades novas (refino da arma). */
  skillDamageMult: number;
  /** Níveis da árvore de habilidades (a simulação lê os números em SKILL_NUM). */
  skills: SkillLevels;
}

export function computeStats(kind: string, attrsIn: Attrs, gear: GearBonus = emptyGear(), skills: SkillLevels = {}): HeroStats {
  const A = ATTRIBUTES_CONFIG;
  const base = A.base[kind] ?? emptyAttrs();
  const attrs = emptyAttrs();
  for (const k of ATTR_KEYS) attrs[k] = attrsIn[k] + gear.attrs[k];
  const d = (k: AttrKey) => Math.max(0, attrs[k] - base[k]); // pontos acima da base

  const mCfg = GAME_CONFIG.archetypes.mage;
  const wCfg = GAME_CONFIG.archetypes.warrior;
  const aCfg = GAME_CONFIG.archetypes.archer;
  const baseHp = kind === 'mage' ? mCfg.hp : kind === 'archer' ? aCfg.hp : wCfg.hp;
  const lv = (id: Parameters<typeof lvOf>[1]) => lvOf(skills, id);
  const med = lv('meditation') ? SKILL_NUM.meditation(lv('meditation')).cdr : 0;
  const cdr = Math.min(
    A.dex.cooldownReductionMax + 0.1,
    d('dex') * A.dex.cooldownReductionPerPoint + gear.cooldownReduction + gear.attackSpeed + (kind === 'mage' ? med : 0),
  );
  const cooldownMult = 1 - cdr;
  const cd = (ticks: number) => Math.max(1, Math.round(ticks * cooldownMult));

  const amp = lv('doubleBarrier') ? SKILL_NUM.doubleBarrier(lv('doubleBarrier')) : { extraLen: 0, extraTicks: 0 };
  let barrierLength = mCfg.fireBarrier.length + Math.floor(d('int') / A.int.barrierLengthEveryPoints) + amp.extraLen;
  barrierLength = Math.min(A.int.barrierLengthMax + amp.extraLen, barrierLength);
  const fb = SKILL_NUM.fireBarrier(Math.max(1, lv('fireBarrier')));
  const barrierDurationTicks = mCfg.fireBarrier.durationTicks + d('int') * A.int.barrierDurationPerPoint + fb.extraTicks + amp.extraTicks;
  const dm = gear.damageMult * weaponMult(kind, gear);
  const iron = kind === 'warrior' && lv('ironSkin') ? SKILL_NUM.ironSkin(lv('ironSkin')) : { hp: 0, reduce: 0 };
  const shield = kind === 'mage' && lv('arcaneShield') ? SKILL_NUM.arcaneShield(lv('arcaneShield')) : { block: 0, reduce: 0 };

  return {
    attrs,
    maxHp: Math.round((baseHp + d('vit') * A.vit.hpPerPoint) * gear.hpMult * (1 + iron.hp)),
    hpRegenPerSec: gear.hpRegen,
    cooldownMult,
    dodge: Math.min(A.caps.dodge, d('luk') * A.luk.dodgePerPoint + gear.dodge),
    block: Math.min(A.caps.block, gear.block + shield.block),
    damageTakenMult: Math.max(0.4, 1 - iron.reduce - shield.reduce),
    skillDamageMult: dm,
    skills: { ...skills },
    luck: attrs.luk,
    barrierLength,
    barrierDurationTicks,
    // Recarga própria (Destreza, equipamento e Meditação reduzem).
    barrierCooldownTicks: cd(mCfg.fireBarrier.cooldownTicks),
    burnDamage: mCfg.fireBarrier.burnDamage * fb.burnMult * dm,
    boltDamage: (mCfg.frostBolt.damage + d('int') * A.int.boltDamagePerPoint) * SKILL_NUM.frostBolt(Math.max(1, lv('frostBolt'))).dmgMult * dm,
    boltRange: mCfg.frostBolt.range,
    boltCooldownTicks: cd(mCfg.frostBolt.cooldownTicks),
    cleaveDamage: (wCfg.cleave.damage + d('str') * A.str.cleaveDamagePerPoint) * SKILL_NUM.cleave(Math.max(1, lv('cleave'))).dmgMult * dm,
    cleaveRange: Math.min(A.str.cleaveRangeMax, wCfg.cleave.range + Math.floor(d('str') / A.str.cleaveRangeEveryPoints)),
    cleaveHalfAngleDeg: Math.min(A.str.cleaveAngleMax, wCfg.cleave.halfAngleDeg + d('str') * A.str.cleaveAnglePerPoint),
    cleaveCooldownTicks: cd(wCfg.cleave.cooldownTicks),
    bashDamage: (wCfg.bash.damage + d('str') * A.str.bashDamagePerPoint) * SKILL_NUM.bash(Math.max(1, lv('bash'))).dmgMult * dm,
    bashCooldownTicks: cd(wCfg.bash.cooldownTicks),
    arrowDamage: (aCfg.arrow.damage + d('dex') * A.archer.arrowDamagePerDex) * SKILL_NUM.preciseShot(Math.max(1, lv('preciseShot'))).dmgMult * dm,
    arrowRange: aCfg.arrow.range + (lv('eagleEye') ? SKILL_NUM.eagleEye(lv('eagleEye')).range : 0),
    arrowCooldownTicks: cd(aCfg.arrow.cooldownTicks),
    rainDamage: (aCfg.rain.damage + d('dex') * A.archer.rainDamagePerDex) * SKILL_NUM.arrowRain(Math.max(1, lv('arrowRain'))).dmgMult * dm * (lv('volley') ? SKILL_NUM.volley(lv('volley')).dmgMult : 1),
    rainRadius: aCfg.rain.radius + (lv('volley') ? SKILL_NUM.volley(lv('volley')).radius : 0),
    rainCooldownTicks: cd(aCfg.rain.cooldownTicks),
    crit: Math.min(0.6, (kind === 'archer' ? d('luk') * A.archer.critPerLuk : 0) + (lv('eagleEye') ? SKILL_NUM.eagleEye(lv('eagleEye')).crit : 0)),
  };
}
