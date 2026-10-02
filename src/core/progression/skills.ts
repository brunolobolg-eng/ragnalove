import { GAME_CONFIG } from '../../config/gameConfig';

/**
 * Árvore de habilidades (estilo "pré-requisito por nível"). Tudo é DADO: para criar uma
 * habilidade nova basta adicionar uma entrada aqui e tratar o efeito na simulação.
 *
 * Regras:
 * - Cada habilidade tem nível máximo; subir 1 nível custa 1 ponto de habilidade + Zeni (na cidade).
 * - Pré-requisito = outras habilidades em um nível mínimo.
 * - As 4 habilidades originais começam no nível 1 (o herói já sabe usá-las).
 */
export type HeroKind = 'mage' | 'warrior' | 'archer' | 'sorcerer' | 'warlock' | 'assassin';

export type SkillId =
  // Mago
  | 'frostBolt'
  | 'fireBarrier'
  | 'meditation'
  | 'frostNova'
  | 'doubleBarrier'
  | 'arcaneShield'
  | 'thunderstorm'
  | 'combustion'
  // Guerreiro
  | 'bash'
  | 'cleave'
  | 'ironSkin'
  | 'taunt'
  | 'shatter'
  | 'battleBreath'
  | 'shockwave'
  | 'fury'
  | 'shieldWall'
  // Arqueira
  | 'preciseShot'
  | 'arrowRain'
  | 'eagleEye'
  | 'piercing'
  | 'volley'
  | 'doubleShot'
  | 'fireRain'
  | 'hunterFocus'
  | 'snareTrap'
  // Feiticeira
  | 'arcaneOrb'
  | 'meteorStrike'
  | 'arcaneFlow'
  | 'chainLightning'
  | 'meteorShower'
  // Bruxa
  | 'lifeDrain'
  | 'curse'
  | 'darkPact'
  | 'shadowSwarm'
  | 'soulHarvest'
  // Assassino
  | 'backstab'
  | 'bladeFan'
  | 'shadowStep'
  | 'poisonBlades'
  | 'execute';

export interface SkillDef {
  id: SkillId;
  hero: HeroKind;
  name: string;
  tier: 1 | 2 | 3;
  /** Coluna na tela da árvore (0..3). */
  col: number;
  kind: 'active' | 'passive';
  maxLevel: number;
  requires: { id: SkillId; level: number }[];
  /** Nível inicial (as habilidades originais já vêm aprendidas). */
  start: number;
  desc: string;
  /** Texto do efeito num nível. */
  effect(lv: number): string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const sec = (ticks: number) => `${(ticks / 10).toFixed(1)} s`;

/** Números de cada habilidade por nível (lidos pela simulação e pelos textos). */
export const SKILL_NUM = {
  frostBolt: (lv: number) => ({ dmgMult: 1 + 0.12 * (lv - 1) }),
  fireBarrier: (lv: number) => ({ burnMult: 1 + 0.1 * (lv - 1), extraTicks: 6 * (lv - 1) }),
  meditation: (lv: number) => ({ cdr: 0.02 * lv }),
  frostNova: (lv: number) => ({ radius: lv >= 5 ? 3 : 2, damage: 8 + 3 * lv, freezeTicks: 20 + 4 * lv, cooldown: 95 - 5 * lv }),
  doubleBarrier: (lv: number) => ({ extraLen: lv >= 4 ? 2 : lv >= 2 ? 1 : 0, extraTicks: 8 * lv }),
  arcaneShield: (lv: number) => ({ block: 0.03 * lv, reduce: 0.04 * lv }),
  thunderstorm: (lv: number) => ({ strikes: 2 + lv, damage: 14 + 6 * lv, cooldown: 75 - 4 * lv }),
  combustion: (lv: number) => ({ splash: 0.3 + 0.1 * lv }),
  bash: (lv: number) => ({ dmgMult: 1 + 0.12 * (lv - 1) }),
  cleave: (lv: number) => ({ dmgMult: 1 + 0.1 * (lv - 1) }),
  ironSkin: (lv: number) => ({ hp: 0.04 * lv, reduce: 0.02 * lv }),
  /** Provocar: campo de aggro (números base em GAME_CONFIG.aggro.taunt) + puxão curto. */
  taunt: (lv: number) => {
    const T = GAME_CONFIG.aggro.taunt;
    const k = Math.max(0, lv - 1);
    return { radius: T.range + T.rangePerLevel * k, duration: T.durationTicks + T.durationPerLevel * k, maxEnemies: T.maxEnemies + T.maxPerLevel * k, pull: lv >= 3 ? 2 : 1, cooldown: T.cooldownTicks + T.cooldownPerLevel * lv };
  },
  /** Atordoa (sem empurrar): o alvo perde o próximo passo/ataque. */
  shatter: (lv: number) => ({ chance: Math.min(1, 0.4 + 0.12 * lv), stun: 6 + 2 * lv }),
  battleBreath: (lv: number) => ({ heal: 1 + lv }),
  shockwave: (lv: number) => ({ radius: lv >= 4 ? 3 : 2, damage: 18 + 7 * lv, stun: 10 + 2 * lv, cooldown: 115 - 6 * lv }),
  fury: (lv: number) => ({ duration: 40 + 8 * lv, cdMult: 0.7 - 0.04 * lv, cooldown: 170 - 6 * lv }),
  preciseShot: (lv: number) => ({ dmgMult: 1 + 0.12 * (lv - 1) }),
  arrowRain: (lv: number) => ({ dmgMult: 1 + 0.1 * (lv - 1) }),
  eagleEye: (lv: number) => ({ range: Math.min(3, Math.floor(lv / 3)), crit: 0.02 * lv }),
  piercing: (lv: number) => ({ damage: 12 + 5 * lv, cooldown: 75 - 5 * lv }),
  volley: (lv: number) => ({ radius: lv >= 3 ? 1 : 0, dmgMult: 1 + 0.08 * lv }),
  doubleShot: (lv: number) => ({ chance: 0.1 + 0.08 * lv }),
  fireRain: (lv: number) => ({ burnTicks: 20 + 8 * lv }),
  hunterFocus: (lv: number) => ({ duration: 40 + 8 * lv, cdMult: 0.65 - 0.04 * lv, cooldown: 170 - 6 * lv }),
  /** Muralha do Guerreiro: números base em GAME_CONFIG.archetypes.warrior.shieldWall. */
  shieldWall: (lv: number) => {
    const W = GAME_CONFIG.archetypes.warrior.shieldWall;
    return { length: W.length + (lv >= 4 ? 2 : lv >= 2 ? 1 : 0), hp: W.hp + W.hpPerLevel * (lv - 1), cooldown: Math.max(20, W.cooldownTicks - W.cooldownPerLevel * (lv - 1)) };
  },
  /** Armadilha da Arqueira: números base em GAME_CONFIG.archetypes.archer.trap. */
  snareTrap: (lv: number) => {
    const T = GAME_CONFIG.archetypes.archer.trap;
    return { damage: T.damage + T.damagePerLevel * (lv - 1), slowTicks: T.slowTicks + 6 * (lv - 1), slowMult: T.slowMult, maxTraps: T.maxTraps + (lv >= 3 ? 1 : 0), cooldown: Math.max(20, T.cooldownTicks - 4 * (lv - 1)) };
  },
  arcaneOrb: (lv: number) => ({ dmgMult: 1 + 0.12 * (lv - 1) }),
  meteorStrike: (lv: number) => ({ dmgMult: 1 + 0.1 * (lv - 1) }),
  arcaneFlow: (lv: number) => ({ cdr: 0.02 * lv }),
  chainLightning: (lv: number) => ({ jumps: 2 + lv, damage: 12 + 5 * lv, cooldown: 80 - 5 * lv }),
  meteorShower: (lv: number) => ({ extra: lv >= 4 ? 2 : 1, dmgMult: 0.5 + 0.08 * lv }),
  lifeDrain: (lv: number) => ({ dmgMult: 1 + 0.12 * (lv - 1), heal: 0.35 + 0.03 * (lv - 1) }),
  curse: (lv: number) => ({ dmgMult: 1 + 0.1 * (lv - 1), amp: 0.2 + 0.03 * (lv - 1) }),
  darkPact: (lv: number) => ({ dmg: 0.04 * lv }),
  shadowSwarm: (lv: number) => ({ targets: 2 + lv, dot: 3 + 1.5 * lv, ticks: 40 + 6 * lv, cooldown: 90 - 5 * lv }),
  soulHarvest: (lv: number) => ({ heal: 2 + lv, soulChance: 0.08 * lv }),
  backstab: (lv: number) => ({ dmgMult: 1 + 0.12 * (lv - 1) }),
  bladeFan: (lv: number) => ({ dmgMult: 1 + 0.1 * (lv - 1) }),
  shadowStep: (lv: number) => ({ dodge: 0.02 * lv, crit: 0.02 * lv }),
  poisonBlades: (lv: number) => ({ dot: 2 + lv, ticks: 30 + 6 * lv }),
  execute: (lv: number) => ({ threshold: 0.18 + 0.04 * lv, range: 2, cooldown: 110 - 8 * lv }),
} satisfies Record<SkillId, (lv: number) => Record<string, number>>;

const N = SKILL_NUM;

export const SKILLS: SkillDef[] = [
  // ---------------- Mago ----------------
  {
    id: 'frostBolt', hero: 'mage', name: 'Raio Gélido', tier: 1, col: 0, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Ataque à distância de alvo único (exige linha de visão).',
    effect: (lv) => `Dano ×${N.frostBolt(lv).dmgMult.toFixed(2)}`,
  },
  {
    id: 'fireBarrier', hero: 'mage', name: 'Barreira de Fogo', tier: 1, col: 1, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Três linhas curtas de chamas que queimam e desviam a horda (monte o funil).',
    effect: (lv) => `Queimadura ×${N.fireBarrier(lv).burnMult.toFixed(2)} · +${sec(N.fireBarrier(lv).extraTicks)} de duração`,
  },
  {
    id: 'meditation', hero: 'mage', name: 'Meditação', tier: 1, col: 2, kind: 'passive', maxLevel: 10, requires: [], start: 0,
    desc: 'Passiva: regeneração de mana — todas as recargas do Mago ficam mais curtas.',
    effect: (lv) => `Recarga −${pct(N.meditation(lv).cdr)}`,
  },
  {
    id: 'frostNova', hero: 'mage', name: 'Nova Congelante', tier: 2, col: 0, kind: 'active', maxLevel: 5, requires: [{ id: 'frostBolt', level: 3 }], start: 0,
    desc: 'Explosão de gelo ao redor do Mago: dano e congela os inimigos no lugar.',
    effect: (lv) => { const n = N.frostNova(lv); return `Raio ${n.radius} · dano ${n.damage} · congela ${sec(n.freezeTicks)} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'doubleBarrier', hero: 'mage', name: 'Barreira Ampliada', tier: 2, col: 1, kind: 'passive', maxLevel: 5, requires: [{ id: 'fireBarrier', level: 3 }], start: 0,
    desc: 'Passiva: as 3 barreiras ficam mais longas e duram mais.',
    effect: (lv) => `+${N.doubleBarrier(lv).extraLen} tile(s) em cada barreira · +${sec(N.doubleBarrier(lv).extraTicks)} de duração`,
  },
  {
    id: 'arcaneShield', hero: 'mage', name: 'Escudo Arcano', tier: 2, col: 2, kind: 'passive', maxLevel: 5, requires: [{ id: 'meditation', level: 3 }], start: 0,
    desc: 'Passiva: chance de bloqueio e absorção de parte do dano recebido.',
    effect: (lv) => `Bloqueio +${pct(N.arcaneShield(lv).block)} · dano recebido −${pct(N.arcaneShield(lv).reduce)}`,
  },
  {
    id: 'thunderstorm', hero: 'mage', name: 'Tempestade Elétrica', tier: 3, col: 0, kind: 'active', maxLevel: 5,
    requires: [{ id: 'frostNova', level: 3 }, { id: 'fireBarrier', level: 3 }], start: 0,
    desc: 'Raios caem sobre inimigos congelados (ou sobre o grupo mais denso), com respingo em volta.',
    effect: (lv) => { const n = N.thunderstorm(lv); return `${n.strikes} raios · dano ${n.damage} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'combustion', hero: 'mage', name: 'Combustão', tier: 3, col: 1, kind: 'passive', maxLevel: 5, requires: [{ id: 'doubleBarrier', level: 4 }], start: 0,
    desc: 'Passiva: as chamas saltam dos inimigos queimando para os vizinhos.',
    effect: (lv) => `Respingo de ${pct(N.combustion(lv).splash)} da queimadura nos vizinhos`,
  },
  // ---------------- Guerreiro ----------------
  {
    id: 'bash', hero: 'warrior', name: 'Investida', tier: 1, col: 0, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Golpe pesado de alvo único no inimigo adjacente mais ferido.',
    effect: (lv) => `Dano ×${N.bash(lv).dmgMult.toFixed(2)}`,
  },
  {
    id: 'cleave', hero: 'warrior', name: 'Golpe em Área', tier: 1, col: 1, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Corte em cone que acerta todos os inimigos na frente.',
    effect: (lv) => `Dano ×${N.cleave(lv).dmgMult.toFixed(2)}`,
  },
  {
    id: 'ironSkin', hero: 'warrior', name: 'Pele de Ferro', tier: 1, col: 2, kind: 'passive', maxLevel: 10, requires: [], start: 0,
    desc: 'Passiva: mais vida e menos dano recebido.',
    effect: (lv) => `HP +${pct(N.ironSkin(lv).hp)} · dano recebido −${pct(N.ironSkin(lv).reduce)}`,
  },
  {
    id: 'fury', hero: 'warrior', name: 'Fúria', tier: 3, col: 0, kind: 'active', maxLevel: 5,
    requires: [{ id: 'bash', level: 5 }, { id: 'battleBreath', level: 3 }], start: 0,
    desc: 'Entra em fúria: ataques muito mais rápidos por alguns segundos.',
    effect: (lv) => { const n = N.fury(lv); return `Recargas ×${n.cdMult.toFixed(2)} por ${sec(n.duration)} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'battleBreath', hero: 'warrior', name: 'Fôlego de Batalha', tier: 2, col: 0, kind: 'passive', maxLevel: 5, requires: [{ id: 'bash', level: 3 }], start: 0,
    desc: 'Passiva: recupera vida a cada inimigo atingido.',
    effect: (lv) => `+${N.battleBreath(lv).heal} HP por acerto`,
  },
  {
    id: 'shatter', hero: 'warrior', name: 'Golpe Estilhaçante', tier: 2, col: 1, kind: 'passive', maxLevel: 5, requires: [{ id: 'cleave', level: 3 }], start: 0,
    desc: 'Passiva: o Golpe em Área atordoa os inimigos atingidos (sem empurrar).',
    effect: (lv) => `${pct(N.shatter(lv).chance)} de chance · atordoa ${sec(N.shatter(lv).stun)}`,
  },
  {
    id: 'taunt', hero: 'warrior', name: 'Provocar', tier: 2, col: 2, kind: 'active', maxLevel: 5, requires: [{ id: 'ironSkin', level: 3 }], start: 0,
    desc: 'Grito de guerra: os inimigos em volta esquecem a cidade e vão atrás do Guerreiro (e são puxados um pouco).',
    effect: (lv) => { const n = N.taunt(lv); return `Raio ${n.radius} · até ${n.maxEnemies} inimigos por ${sec(n.duration)} · puxa ${n.pull} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'shockwave', hero: 'warrior', name: 'Onda de Choque', tier: 3, col: 1, kind: 'active', maxLevel: 5,
    requires: [{ id: 'shatter', level: 3 }, { id: 'taunt', level: 3 }], start: 0,
    desc: 'Golpe no chão: dano em área grande e atordoa quem estiver em volta (sem empurrar).',
    effect: (lv) => { const n = N.shockwave(lv); return `Raio ${n.radius} · dano ${n.damage} · atordoa ${sec(n.stun)} · recarga ${sec(n.cooldown)}`; },
  },
  // ---------------- Arqueira ----------------
  {
    id: 'preciseShot', hero: 'archer', name: 'Flecha Precisa', tier: 1, col: 0, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Flecha de longo alcance no inimigo mais próximo (exige linha de visão).',
    effect: (lv) => `Dano ×${N.preciseShot(lv).dmgMult.toFixed(2)}`,
  },
  {
    id: 'arrowRain', hero: 'archer', name: 'Chuva de Flechas', tier: 1, col: 1, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Dispara para o alto: flechas caem numa área sobre o grupo mais denso.',
    effect: (lv) => `Dano ×${N.arrowRain(lv).dmgMult.toFixed(2)}`,
  },
  {
    id: 'eagleEye', hero: 'archer', name: 'Olho de Águia', tier: 1, col: 2, kind: 'passive', maxLevel: 10, requires: [], start: 0,
    desc: 'Passiva: mais alcance e chance de acerto crítico (dano dobrado).',
    effect: (lv) => `Alcance +${N.eagleEye(lv).range} · crítico +${pct(N.eagleEye(lv).crit)}`,
  },
  {
    id: 'piercing', hero: 'archer', name: 'Flecha Perfurante', tier: 2, col: 0, kind: 'active', maxLevel: 5, requires: [{ id: 'preciseShot', level: 3 }], start: 0,
    desc: 'Atravessa todos os inimigos em linha reta até o fim do alcance.',
    effect: (lv) => `Dano ${N.piercing(lv).damage} em cada · recarga ${sec(N.piercing(lv).cooldown)}`,
  },
  {
    id: 'volley', hero: 'archer', name: 'Saraivada', tier: 2, col: 1, kind: 'passive', maxLevel: 5, requires: [{ id: 'arrowRain', level: 3 }], start: 0,
    desc: 'Passiva: a Chuva de Flechas cobre uma área maior e fere mais.',
    effect: (lv) => `Área +${N.volley(lv).radius} · dano ×${N.volley(lv).dmgMult.toFixed(2)}`,
  },
  {
    id: 'doubleShot', hero: 'archer', name: 'Tiro Duplo', tier: 2, col: 2, kind: 'passive', maxLevel: 5, requires: [{ id: 'eagleEye', level: 3 }], start: 0,
    desc: 'Passiva: chance de disparar uma segunda flecha em outro alvo.',
    effect: (lv) => `${pct(N.doubleShot(lv).chance)} de chance`,
  },
  {
    id: 'hunterFocus', hero: 'archer', name: 'Foco do Caçador', tier: 3, col: 0, kind: 'active', maxLevel: 5,
    requires: [{ id: 'piercing', level: 3 }, { id: 'doubleShot', level: 3 }], start: 0,
    desc: 'Concentração total: recargas muito mais curtas por alguns segundos.',
    effect: (lv) => { const n = N.hunterFocus(lv); return `Recargas ×${n.cdMult.toFixed(2)} por ${sec(n.duration)} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'fireRain', hero: 'archer', name: 'Chuva Incendiária', tier: 3, col: 1, kind: 'passive', maxLevel: 5,
    requires: [{ id: 'volley', level: 3 }, { id: 'preciseShot', level: 3 }], start: 0,
    desc: 'Passiva: a Chuva de Flechas deixa o chão em chamas.',
    effect: (lv) => `Fogo por ${sec(N.fireRain(lv).burnTicks)}`,
  },
  {
    id: 'snareTrap', hero: 'archer', name: 'Armadilha', tier: 1, col: 3, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Arma uma armadilha no caminho da horda: o primeiro inimigo que pisar leva dano alto e fica lento. Só 1 alvo.',
    effect: (lv) => { const n = N.snareTrap(lv); return `Dano ${n.damage} · lento ×${n.slowMult} por ${sec(n.slowTicks)} · até ${n.maxTraps} armadas · recarga ${sec(n.cooldown)}`; },
  },
  // ---------------- Guerreiro (muralha) ----------------
  {
    id: 'shieldWall', hero: 'warrior', name: 'Muralha', tier: 1, col: 3, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Ergue uma muralha intransponível onde você posicionar (arraste no campo). A horda precisa quebrá-la para passar; ela volta depois da recarga.',
    effect: (lv) => { const n = N.shieldWall(lv); return `${n.length} blocos · ${n.hp} de vida cada · reergue em ${sec(n.cooldown)}`; },
  },
  // ---------------- Feiticeira ----------------
  {
    id: 'arcaneOrb', hero: 'sorcerer', name: 'Orbe Arcano', tier: 1, col: 0, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Orbe de energia no inimigo mais próximo (exige linha de visão). Escala com Inteligência.',
    effect: (lv) => `Dano ×${N.arcaneOrb(lv).dmgMult.toFixed(2)}`,
  },
  {
    id: 'meteorStrike', hero: 'sorcerer', name: 'Meteoro', tier: 1, col: 1, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Invoca um meteoro sobre o grupo mais denso ao alcance.',
    effect: (lv) => `Dano ×${N.meteorStrike(lv).dmgMult.toFixed(2)}`,
  },
  {
    id: 'arcaneFlow', hero: 'sorcerer', name: 'Fluxo Arcano', tier: 1, col: 2, kind: 'passive', maxLevel: 10, requires: [], start: 0,
    desc: 'Passiva: recargas mais curtas.',
    effect: (lv) => `Recarga −${pct(N.arcaneFlow(lv).cdr)}`,
  },
  {
    id: 'chainLightning', hero: 'sorcerer', name: 'Corrente Elétrica', tier: 2, col: 0, kind: 'active', maxLevel: 5, requires: [{ id: 'arcaneOrb', level: 3 }], start: 0,
    desc: 'Um raio que salta de inimigo em inimigo.',
    effect: (lv) => { const n = N.chainLightning(lv); return `${n.jumps} saltos · dano ${n.damage} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'meteorShower', hero: 'sorcerer', name: 'Chuva de Meteoros', tier: 3, col: 1, kind: 'passive', maxLevel: 5,
    requires: [{ id: 'meteorStrike', level: 4 }, { id: 'chainLightning', level: 2 }], start: 0,
    desc: 'Passiva: cada Meteoro traz meteoros menores nos grupos vizinhos.',
    effect: (lv) => `+${N.meteorShower(lv).extra} meteoro(s) com ${pct(N.meteorShower(lv).dmgMult)} do dano`,
  },
  // ---------------- Bruxa ----------------
  {
    id: 'lifeDrain', hero: 'warlock', name: 'Dreno de Vida', tier: 1, col: 0, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Rouba vida do inimigo mais próximo: cura a Bruxa com parte do dano.',
    effect: (lv) => `Dano ×${N.lifeDrain(lv).dmgMult.toFixed(2)} · cura ${pct(N.lifeDrain(lv).heal)} do dano`,
  },
  {
    id: 'curse', hero: 'warlock', name: 'Maldição', tier: 1, col: 1, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Amaldiçoa um grupo: dano contínuo e os amaldiçoados sofrem mais dano de toda a party.',
    effect: (lv) => `Dano ×${N.curse(lv).dmgMult.toFixed(2)} · +${pct(N.curse(lv).amp)} de dano recebido`,
  },
  {
    id: 'darkPact', hero: 'warlock', name: 'Pacto Sombrio', tier: 1, col: 2, kind: 'passive', maxLevel: 10, requires: [], start: 0,
    desc: 'Passiva: mais dano em todas as magias da Bruxa.',
    effect: (lv) => `Dano +${pct(N.darkPact(lv).dmg)}`,
  },
  {
    id: 'shadowSwarm', hero: 'warlock', name: 'Enxame de Sombras', tier: 2, col: 1, kind: 'active', maxLevel: 5, requires: [{ id: 'curse', level: 3 }], start: 0,
    desc: 'Sombras devoram vários inimigos aos poucos (dano contínuo).',
    effect: (lv) => { const n = N.shadowSwarm(lv); return `${n.targets} alvos · ${n.dot} por segundo por ${sec(n.ticks)} · recarga ${sec(n.cooldown)}`; },
  },
  {
    id: 'soulHarvest', hero: 'warlock', name: 'Colheita de Almas', tier: 3, col: 0, kind: 'passive', maxLevel: 5,
    requires: [{ id: 'lifeDrain', level: 4 }, { id: 'shadowSwarm', level: 2 }], start: 0,
    desc: 'Passiva: inimigos mortos pela Bruxa curam a party e podem render almas extras.',
    effect: (lv) => `+${N.soulHarvest(lv).heal} HP para a party · ${pct(N.soulHarvest(lv).soulChance)} de alma extra`,
  },
  // ---------------- Assassino ----------------
  {
    id: 'backstab', hero: 'assassin', name: 'Golpe Furtivo', tier: 1, col: 0, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Ataque rápido no inimigo adjacente mais ferido, com muito crítico.',
    effect: (lv) => `Dano ×${N.backstab(lv).dmgMult.toFixed(2)}`,
  },
  {
    id: 'bladeFan', hero: 'assassin', name: 'Leque de Lâminas', tier: 1, col: 1, kind: 'active', maxLevel: 10, requires: [], start: 1,
    desc: 'Arremessa lâminas em cone curto na direção com mais inimigos.',
    effect: (lv) => `Dano ×${N.bladeFan(lv).dmgMult.toFixed(2)}`,
  },
  {
    id: 'shadowStep', hero: 'assassin', name: 'Passo das Sombras', tier: 1, col: 2, kind: 'passive', maxLevel: 10, requires: [], start: 0,
    desc: 'Passiva: mais esquiva e mais crítico.',
    effect: (lv) => `Esquiva +${pct(N.shadowStep(lv).dodge)} · crítico +${pct(N.shadowStep(lv).crit)}`,
  },
  {
    id: 'poisonBlades', hero: 'assassin', name: 'Lâminas Envenenadas', tier: 2, col: 1, kind: 'passive', maxLevel: 5, requires: [{ id: 'bladeFan', level: 3 }], start: 0,
    desc: 'Passiva: os golpes envenenam (dano contínuo).',
    effect: (lv) => `${N.poisonBlades(lv).dot} por segundo por ${sec(N.poisonBlades(lv).ticks)}`,
  },
  {
    id: 'execute', hero: 'assassin', name: 'Execução', tier: 3, col: 0, kind: 'active', maxLevel: 5,
    requires: [{ id: 'backstab', level: 4 }, { id: 'poisonBlades', level: 2 }], start: 0,
    desc: 'Finaliza na hora um inimigo próximo com pouca vida (não funciona em chefes).',
    effect: (lv) => { const n = N.execute(lv); return `Abaixo de ${pct(n.threshold)} da vida · alcance ${n.range} · recarga ${sec(n.cooldown)}`; },
  },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, SkillDef>;
export const heroSkills = (hero: HeroKind) => SKILLS.filter((s) => s.hero === hero);

export type SkillLevels = Partial<Record<SkillId, number>>;

export function startingSkills(hero: HeroKind): SkillLevels {
  const out: SkillLevels = {};
  for (const s of heroSkills(hero)) if (s.start > 0) out[s.id] = s.start;
  return out;
}

export const lvOf = (levels: SkillLevels | undefined, id: SkillId) => levels?.[id] ?? 0;

/** Falta algum pré-requisito? Devolve o texto do que falta (ou vazio). */
export function missingRequirements(levels: SkillLevels, id: SkillId): string[] {
  return SKILL_BY_ID[id].requires.filter((r) => lvOf(levels, r.id) < r.level).map((r) => `${SKILL_BY_ID[r.id].name} nv ${r.level}`);
}

/** Zeni para levar a habilidade ao nível `next`. */
export function skillZeniCost(id: SkillId, next: number): number {
  const d = SKILL_BY_ID[id];
  return SKILL_ZENI.base * d.tier * next;
}

export const SKILL_ZENI = { base: 30, respecBase: 150 };

export type SkillState = 'locked' | 'available' | 'learned' | 'max';
export function skillState(levels: SkillLevels, id: SkillId): SkillState {
  const lv = lvOf(levels, id);
  const d = SKILL_BY_ID[id];
  if (lv >= d.maxLevel) return 'max';
  if (missingRequirements(levels, id).length) return 'locked';
  return lv > 0 ? 'learned' : 'available';
}

/** Soma de pontos já investidos acima do nível inicial (para redistribuir). */
export function investedSkillPoints(hero: HeroKind, levels: SkillLevels): number {
  return heroSkills(hero).reduce((s, d) => s + Math.max(0, lvOf(levels, d.id) - d.start), 0);
}
