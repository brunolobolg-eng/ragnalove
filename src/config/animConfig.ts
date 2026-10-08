/**
 * Animação dos personagens 3D (dados). O controlador (render/units/model/anim/AnimController.ts) lê daqui:
 * quais clipes cada perfil usa, marcadores de golpe/magia, prioridades, mistura e reações físicas.
 *
 * Clipes: "ual:Nome" = Universal Animation Library (Quaternius, CC0; retargeting automático para o
 * esqueleto padrão do jogo) · "own:nome" = animação própria do personagem (anims.ts / GLB).
 * Tempos em segundos do clipe montado (depois do recorte/velocidade de cada parte).
 */

export type ClipRef = `ual:${string}` | `own:${string}`;

export interface ClipPart {
  clip: ClipRef;
  /** recorte do clipe de origem (s) */
  from?: number;
  to?: number;
  /** velocidade desta parte (1 = original) */
  speed?: number;
}

/** Golpe, magia ou reação: partes encadeadas + marcadores das fases. */
export interface ActionSpec {
  parts: ClipPart[];
  /** AttackImpact / CastRelease (s no clipe montado). Sem valor: pico de velocidade da mão. */
  impact?: number;
  /** fim do golpe útil: a partir daqui a recuperação pode ser emendada no próximo golpe (combo) */
  recover?: number;
  /** maior espera até o impacto (s); se o clipe for mais lento, a antecipação é acelerada */
  maxImpactDelay?: number;
  fadeIn?: number;
  fadeOut?: number;
}

export interface LocomotionSpec {
  idle: ClipRef;
  walk: ClipRef;
  run?: ClipRef;
  sprint?: ClipRef;
}

export interface AnimProfile {
  loco: LocomotionSpec;
  /** combo: os golpes básicos se alternam nesta ordem */
  attacks: ActionSpec[];
  heavy: ActionSpec;
  cast: ActionSpec;
  /** reações (dano leve/médio, cambaleio forte) */
  hitFront: ActionSpec;
  hitHead: ActionSpec;
  stagger: ActionSpec;
  death: ActionSpec;
}

const ual = (name: string, from?: number, to?: number, speed?: number): ClipPart => ({ clip: `ual:${name}`, from, to, speed });
const own = (name: string, speed?: number): ClipPart => ({ clip: `own:${name}`, speed });

/** Partes comuns da biblioteca. */
const HUMAN_LOCO: LocomotionSpec = { idle: 'ual:Idle_Loop', walk: 'ual:Walk_Loop', run: 'ual:Jog_Fwd_Loop', sprint: 'ual:Sprint_Loop' };
/** Espadada diagonal: antecipação (mão sobe para trás) → golpe → pausa → recuperação. */
const SLASH: ActionSpec = { parts: [ual('Sword_Attack', 0, 1.3)], impact: 0.42, recover: 0.78, maxImpactDelay: 0.32, fadeIn: 0.08, fadeOut: 0.25 };
/** Estocada (o direto vira estocada com a arma na mão direita). */
const THRUST: ActionSpec = { parts: [ual('Punch_Cross', 0.02, 0.8)], impact: 0.19, recover: 0.42, maxImpactDelay: 0.22, fadeIn: 0.06, fadeOut: 0.2 };
/** Jab rápido com a esquerda. */
const JAB: ActionSpec = { parts: [ual('Punch_Jab', 0, 0.62)], impact: 0.13, recover: 0.32, maxImpactDelay: 0.16, fadeIn: 0.05, fadeOut: 0.18 };
/** Magia completa: preparação (ergue a mão) → conjuração (energia acumulando) → lançamento → recuperação. */
const SPELL: ActionSpec = {
  parts: [ual('Spell_Simple_Enter'), ual('Spell_Simple_Idle_Loop', 0, 0.45, 1.4), ual('Spell_Simple_Shoot', 0, 0.3), ual('Spell_Simple_Exit')],
  impact: 0.86,
  recover: 1.05,
  maxImpactDelay: 0.6,
  fadeIn: 0.12,
  fadeOut: 0.25,
};
/** Magia rápida (ataque básico de conjurador): preparação curta → lançamento → recuperação. */
const QUICK_SPELL: ActionSpec = {
  parts: [ual('Spell_Simple_Enter', 0.12, 0.53, 1.5), ual('Spell_Simple_Shoot', 0, 0.22), ual('Spell_Simple_Exit', 0, 0.43, 1.3)],
  impact: 0.29,
  recover: 0.42,
  maxImpactDelay: 0.3,
  fadeIn: 0.08,
  fadeOut: 0.22,
};
const HIT_FRONT: ActionSpec = { parts: [ual('Hit_Chest')], fadeIn: 0.04, fadeOut: 0.18 };
const HIT_HEAD: ActionSpec = { parts: [ual('Hit_Head')], fadeIn: 0.04, fadeOut: 0.18 };
/** Cambaleio forte / fim do knockback: o corpo absorve o tranco (joelhos dobram) e se reergue. */
const STAGGER: ActionSpec = { parts: [ual('Jump_Land', 0.02, 1.0, 1.25)], fadeIn: 0.05, fadeOut: 0.3 };
const DEATH: ActionSpec = { parts: [ual('Death01')], fadeIn: 0.1 };

/** Perfis por estilo de luta. Personagens sem esqueleto compatível usam OWN_PROFILE (clipes próprios). */
export const ANIM_PROFILES: Record<string, AnimProfile> = {
  /** Espada e escudo (Guerreiro): espadada ↔ estocada; Investida = espadada pesada. */
  sword: {
    loco: { ...HUMAN_LOCO, idle: 'ual:Sword_Idle' },
    attacks: [SLASH, THRUST],
    heavy: { ...SLASH, maxImpactDelay: 0.3 },
    cast: SPELL,
    hitFront: HIT_FRONT,
    hitHead: HIT_HEAD,
    stagger: STAGGER,
    death: DEATH,
  },
  /** Adagas (Assassino): jab ↔ direto rápidos; golpe pesado = espadada. */
  daggers: {
    loco: { ...HUMAN_LOCO, idle: 'ual:Sword_Idle' },
    attacks: [JAB, THRUST],
    heavy: SLASH,
    cast: SPELL,
    hitFront: HIT_FRONT,
    hitHead: HIT_HEAD,
    stagger: STAGGER,
    death: DEATH,
  },
  /** Cajado (Maga): o ataque básico é uma magia rápida com a mão livre; habilidades = magia completa. */
  staff: {
    loco: HUMAN_LOCO,
    attacks: [QUICK_SPELL],
    heavy: QUICK_SPELL,
    cast: SPELL,
    hitFront: HIT_FRONT,
    hitHead: HIT_HEAD,
    stagger: STAGGER,
    death: DEATH,
  },
  /** Arco (Arqueira): puxar a corda é animação própria (a biblioteca não tem arco); corpo e reações da biblioteca. */
  bow: {
    loco: HUMAN_LOCO,
    attacks: [{ parts: [own('attack')], impact: 0.33, recover: 0.4, fadeIn: 0.08, fadeOut: 0.2 }],
    heavy: { parts: [own('heavy')], impact: 0.33, recover: 0.4, fadeIn: 0.08, fadeOut: 0.2 },
    cast: { parts: [own('cast')], impact: 0.33, recover: 0.4, fadeIn: 0.08, fadeOut: 0.2 },
    hitFront: HIT_FRONT,
    hitHead: HIT_HEAD,
    stagger: STAGGER,
    death: DEATH,
  },
  /** Zumbi: arrasta-se com o andar próprio; os rápidos correm; garra ↔ pancada. */
  zombie: {
    loco: { idle: 'own:idle', walk: 'own:walk', run: 'ual:Jog_Fwd_Loop', sprint: 'ual:Sprint_Loop' },
    attacks: [{ parts: [own('attack')], impact: 0.3, recover: 0.4, fadeIn: 0.06, fadeOut: 0.2 }, { ...THRUST, maxImpactDelay: 0.25 }],
    heavy: { parts: [own('attack')], impact: 0.3, recover: 0.4, fadeIn: 0.06, fadeOut: 0.2 },
    cast: SPELL,
    hitFront: HIT_FRONT,
    hitHead: HIT_HEAD,
    stagger: STAGGER,
    death: DEATH,
  },
  /** Brutamonte com machado (orc): machadada própria por cima ↔ espadada; passos pesados. */
  brute: {
    loco: { ...HUMAN_LOCO, idle: 'ual:Sword_Idle' },
    attacks: [{ parts: [own('attack')], impact: 0.32, recover: 0.45, fadeIn: 0.08, fadeOut: 0.25 }, SLASH],
    heavy: { parts: [own('attack')], impact: 0.32, recover: 0.45, fadeIn: 0.08, fadeOut: 0.25 },
    cast: SPELL,
    hitFront: HIT_FRONT,
    hitHead: HIT_HEAD,
    stagger: STAGGER,
    death: DEATH,
  },
};

/** Personagens sem esqueleto compatível com a biblioteca: tudo com os clipes próprios (mesmas fases e eventos). */
export const OWN_PROFILE: AnimProfile = {
  loco: { idle: 'own:idle', walk: 'own:walk' },
  attacks: [{ parts: [own('attack')], impact: 0.28, recover: 0.4, fadeIn: 0.06, fadeOut: 0.2 }],
  heavy: { parts: [own('heavy')], impact: 0.3, recover: 0.42, fadeIn: 0.06, fadeOut: 0.2 },
  cast: { parts: [own('cast')], impact: 0.42, recover: 0.6, fadeIn: 0.08, fadeOut: 0.22 },
  hitFront: { parts: [own('hit')], fadeIn: 0.04, fadeOut: 0.15 },
  hitHead: { parts: [own('hit')], fadeIn: 0.04, fadeOut: 0.15 },
  stagger: { parts: [own('hit', 0.7)], fadeIn: 0.04, fadeOut: 0.2 },
  death: { parts: [own('death')], fadeIn: 0.08 },
};

/** Ajustes gerais do controlador. */
export const ANIM_CONFIG = {
  /**
   * Prioridades: uma ação só interrompe outra de prioridade menor ou igual (morte vence tudo).
   * Golpe/magia interrompem reações leves; cambaleio/knockback interrompem golpes.
   */
  priority: { loco: 0, hitLight: 10, hitMedium: 30, attack: 50, cast: 50, stagger: 70, knockback: 80, death: 100 },
  locomotion: {
    /**
     * Velocidade em que cada clipe toca puro, em "comprimentos de perna por segundo" (chibi de perna curta
     * e orc de perna longa andam proporcionalmente). Entre as âncoras os clipes se misturam e a cadência
     * dos pés é ajustada para a passada bater com o deslocamento (sem patinar).
     * Referência da biblioteca: caminhada 1,2 · corrida 6,5 · disparada 9,9 pernas/s.
     */
    walkAt: 1.8,
    runAt: 5.5,
    sprintAt: 9.5,
    /** abaixo disso (pernas/s) conta como parado */
    stopBelow: 0.15,
    /** suavização da velocidade medida (1/s): maior = reage mais rápido */
    speedResponse: 10,
    /** mistura parado ↔ andando (s) */
    fade: 0.18,
    /** limites de cadência (evita "câmera lenta" ou pés frenéticos quando a passada não casa) */
    minRate: 0.55,
    maxRate: 1.9,
    /** inclinação do tronco na aceleração/frenagem (graus por perna/s²) e nas curvas (graus por rad/s) */
    accelLean: 2.2,
    maxAccelLean: 10,
    turnLean: 4,
    maxTurnLean: 9,
  },
  combo: {
    /** sem golpe por este tempo (s), o combo volta ao primeiro golpe */
    resetAfter: 1.1,
  },
  /** Reações ao dano: gravidade pela fração da vida perdida no golpe (e golpes sempre pesados). */
  hit: {
    mediumAt: 0.07,
    heavyAt: 0.2,
    /** fontes que sempre derrubam (cambaleio forte) */
    heavySources: ['bash', 'stomp', 'meteor', 'execute', 'shockwave'] as string[],
    /** crítico sobe um nível */
    critBump: true,
    /** tranco no tronco (graus) e no quadril (unidades do modelo), por gravidade */
    flinchDeg: { light: 9, medium: 18, heavy: 30 },
    push: { light: 0.02, medium: 0.08, heavy: 0.24 },
    /** braços soltos no golpe forte (graus) */
    armFlailDeg: { light: 0, medium: 10, heavy: 28 },
    /** mola do tranco: rigidez e amortecimento (peso do corpo) */
    stiffness: 140,
    damping: 13,
    /** tempo mínimo de cambaleio antes de aceitar um golpe/magia (s) */
    minStagger: 0.18,
  },
  knockback: {
    /** o corpo inclina contra o empurrão (graus) e os braços abrem */
    leanDeg: 26,
    armFlailDeg: 35,
    /** empurrão visual sem deslocamento na grade (golpes fortes): distância e volta (unidades do mundo) */
    visualPush: 0.32,
    returnStiffness: 38,
    returnDamping: 11,
  },
  death: {
    /** o corpo fica caído este tempo (s) depois do clipe antes de afundar e sumir */
    linger: 1.6,
    fade: 0.9,
    /** cai para longe de quem deu o golpe final (gira até este tanto em direção ao agressor, rad/s) */
    turnToKiller: 9,
  },
};
