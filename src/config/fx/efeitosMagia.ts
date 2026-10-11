import type { PackElement } from './efeitosPack';

/**
 * Receita visual de cada magia: que efeitos do pacote aparecem e em que elemento. Só visual: nada aqui muda
 * dano, alcance, recarga ou a simulação. Trocar um elemento = trocar uma palavra.
 *
 * Como a camada encontra a receita (a primeira que existir):
 * - `<chave>:<classe ou tipo de quem causou>` (ex.: `dmg:spell:necro`, `heal:warrior`, `bash:assassin`).
 * - `<chave>` (ex.: `nova`, `storm:judgment`, `dmg:meteor`).
 * Chaves: `cast:<habilidade>` (lançamento), `<tipo do evento>` (área ou estado) e `dmg:<fonte do dano>` (golpe em
 * cada acerto). Dano ao longo do tempo (queimadura, veneno, maldição, pulsos de área como a Névoa Gélida e o Enxame
 * de Sombras) não tem golpe por acerto: ficaria poluído. Para essas magias o efeito é o círculo ou a aura do evento.
 */
export interface MagiaRecipe {
  element: PackElement;
  /** Círculo no chão. `raio` 0 = usa o raio do evento (tiles). `segurar` = segundos (ausente = tempo do evento ou padrão). */
  circulo?: { raio: number; segurar?: number };
  /** Golpe em fatia. `anel` = diâmetro do anel de choque em metros. `anelRaio` = o anel acompanha o raio do evento. */
  golpe?: { anel?: number; anelRaio?: boolean };
  /** Aura em volta da unidade alvo por `vida` segundos (ausente em eventos com `ticks`: usa a duração do evento). */
  aura?: { vida: number };
  /** Emissor em volta da unidade: cruzes de cura (`cruz`) ou cristais de gelo (`cristal`), por `vida` segundos. */
  emissor?: { tipo: 'cruz' | 'cristal'; vida: number };
  /** Brilho de buff (textura do pacote) no corpo da unidade: cresce e some. `tamanho` em metros. */
  brilho?: { textura: 'levelup' | 'sparkglint' | 'smokepuff'; vida: number; tamanho: number };
}

/** Receitas das magias. A chave e o elemento seguem a auditoria das habilidades (62 ativas e passivas + inimigas). */
export const MAGIA_RECIPES: Record<string, MagiaRecipe> = {
  // Mago (Cléria)
  'dmg:bolt': { element: 'frost', golpe: {} }, // Raio Gélido
  'cast:fireBarrier': { element: 'fire', circulo: { raio: 1.4 } }, // Barreira de Fogo
  nova: { element: 'frost', circulo: { raio: 0 }, golpe: { anelRaio: true } }, // Nova Congelante
  'dmg:nova': { element: 'frost', golpe: {} },
  freeze: { element: 'frost', emissor: { tipo: 'cristal', vida: 1.0 } }, // congelado
  chill: { element: 'frost', emissor: { tipo: 'cristal', vida: 1.0 } }, // frio (Névoa Gélida)
  'storm:thunderstorm': { element: 'arcane', circulo: { raio: 0.9, segurar: 0.5 }, golpe: {} }, // Tempestade Elétrica
  'storm:judgment': { element: 'holy', circulo: { raio: 1.6, segurar: 0.8 }, golpe: { anel: 2.6 } }, // Julgamento Divino
  'dmg:storm': { element: 'arcane', golpe: {} },
  'dmg:spell:mage': { element: 'holy', golpe: {} }, // Julgamento (dano de magia da Cléria)
  combust: { element: 'fire', circulo: { raio: 1.2 }, golpe: { anel: 2.0 } }, // Combustão
  heal: { element: 'holy', emissor: { tipo: 'cruz', vida: 0.8 } }, // Cura, Dom da Cura, Fôlego, Dreno
  'heal:warlock': { element: 'shadow', emissor: { tipo: 'cruz', vida: 0.8 } }, // Dreno de Vida (própria Bruxa)
  'heal:warrior': { element: 'blood', emissor: { tipo: 'cruz', vida: 0.8 } }, // Fôlego de Batalha
  divineHeal: { element: 'holy', emissor: { tipo: 'cruz', vida: 0.8 }, brilho: { textura: 'levelup', vida: 0.7, tamanho: 1.4 } }, // cura instantânea
  sanctuary: { element: 'holy', circulo: { raio: 0 } }, // Santuário (segurar = duração do evento)
  holyShield: { element: 'holy', aura: { vida: 1.5 }, brilho: { textura: 'sparkglint', vida: 1.0, tamanho: 1.8 } }, // Escudo Sagrado
  blessing: { element: 'holy', aura: { vida: 1.5 }, brilho: { textura: 'levelup', vida: 1.0, tamanho: 1.6 } }, // Bênção
  'avoid:shield': { element: 'holy', aura: { vida: 0.6 } }, // bloqueio de escudo

  // Guerreiro
  bash: { element: 'blood', golpe: {} }, // Investida
  'bash:assassin': { element: 'blood', golpe: {} }, // Golpe Furtivo
  cleave: { element: 'blood', golpe: {} }, // Golpe em Área
  'cleave:assassin': { element: 'shadow', golpe: {} }, // Leque de Lâminas
  fury: { element: 'blood', aura: { vida: 1.5 }, brilho: { textura: 'levelup', vida: 0.8, tamanho: 1.7 } }, // Fúria
  taunt: { element: 'blood', circulo: { raio: 0 } }, // Provocar
  aggro: { element: 'blood', aura: { vida: 1.5 } }, // provocado
  shockwave: { element: 'nature', circulo: { raio: 0 }, golpe: { anelRaio: true } }, // Onda de Choque
  'dmg:shock': { element: 'nature', golpe: {} },
  'cast:shieldWall': { element: 'nature', circulo: { raio: 1.2 } }, // Muralha
  enchantBlade: { element: 'arcane', aura: { vida: 1.5 }, brilho: { textura: 'sparkglint', vida: 0.8, tamanho: 1.2 } }, // Lâmina Encantada
  'dmg:enchant': { element: 'arcane', golpe: {} },
  sonicWave: { element: 'arcane', golpe: { anel: 1.8 } }, // Onda Sônica
  'dmg:wave': { element: 'arcane', golpe: {} },
  deathBound: { element: 'shadow', circulo: { raio: 1.0 } }, // Limite da Morte
  'dmg:reflect': { element: 'shadow', golpe: {} },
  hundredSpear: { element: 'blood', circulo: { raio: 0 } }, // Cem Lanças
  'dmg:spear': { element: 'blood', golpe: {} },
  windCutter: { element: 'nature', circulo: { raio: 0 }, golpe: { anelRaio: true } }, // Cortador de Vento
  'dmg:wind': { element: 'nature', golpe: {} },
  'avoid:block': { element: 'arcane', aura: { vida: 0.6 } }, // bloqueio

  // Arqueira
  'dmg:pierce': { element: 'nature', golpe: {} }, // Flecha Perfurante
  'rain:arrow': { element: 'nature', circulo: { raio: 0 } }, // Chuva de Flechas
  'dmg:rain': { element: 'nature', golpe: {} },
  'rain:fire': { element: 'fire', circulo: { raio: 0 }, golpe: {} }, // Chuva Incendiária
  focus: { element: 'nature', aura: { vida: 1.5 }, brilho: { textura: 'sparkglint', vida: 0.8, tamanho: 1.5 } }, // Foco do Caçador
  'trap:padrao': { element: 'nature', circulo: { raio: 0.9 }, golpe: {} }, // Armadilha
  'trap:snare': { element: 'nature', circulo: { raio: 0.9 }, golpe: {} },
  'trap:mine': { element: 'fire', circulo: { raio: 1.2 }, golpe: { anel: 1.8 } }, // Mina Terrestre
  'trap:freeze': { element: 'frost', circulo: { raio: 1.4 }, golpe: { anel: 2.2 } }, // Armadilha Congelante
  'trap:claymore': { element: 'blood', circulo: { raio: 1.2 }, golpe: { anel: 1.6 } }, // Armadilha Claymore
  'trapset:snare': { element: 'nature', circulo: { raio: 0.7, segurar: 0.5 } }, // armar
  'trapset:mine': { element: 'fire', circulo: { raio: 0.7, segurar: 0.5 } },
  'trapset:freeze': { element: 'frost', circulo: { raio: 0.7, segurar: 0.5 } },
  'trapset:claymore': { element: 'blood', circulo: { raio: 0.7, segurar: 0.5 } },

  // Feiticeira
  'cast:meteorStrike': { element: 'fire', circulo: { raio: 0.8, segurar: 0.4 } }, // Meteoro (conjuração)
  'meteor:sorcerer': { element: 'fire', circulo: { raio: 0 }, golpe: { anel: 2.2 } }, // queda do meteoro
  meteor: { element: 'fire', circulo: { raio: 0 }, golpe: { anel: 2.2 } },
  'dmg:meteor': { element: 'fire', golpe: {} },
  'dmg:arcane': { element: 'arcane', golpe: {} }, // Orbe Arcano

  // Bruxa
  curse: { element: 'shadow', circulo: { raio: 0 } }, // Maldição
  'cast:shadowSwarm': { element: 'shadow', circulo: { raio: 1.1, segurar: 0.6 } }, // Enxame de Sombras
  etherealCage: { element: 'arcane', aura: { vida: 1.2 }, emissor: { tipo: 'cristal', vida: 1.2 }, brilho: { textura: 'smokepuff', vida: 1.0, tamanho: 1.6 } }, // Cárcere Etéreo
  soulEcho: { element: 'shadow', circulo: { raio: 0 }, golpe: { anelRaio: true } }, // Eco da Alma
  frostMist: { element: 'frost', circulo: { raio: 0 } }, // Névoa Gélida (pulsos: sem golpe por acerto)
  blackFrost: { element: 'shadow', circulo: { raio: 0 } }, // Geada Negra
  abyssMarsh: { element: 'poison', aura: { vida: 1.5 }, brilho: { textura: 'smokepuff', vida: 1.0, tamanho: 1.6 } }, // Lodaçal Abissal
  darkApex: { element: 'shadow', aura: { vida: 1.5 }, brilho: { textura: 'smokepuff', vida: 1.2, tamanho: 2.0 } }, // Ápice Sombrio

  // Assassino
  execute: { element: 'blood', golpe: { anel: 1.2 } }, // Execução
  'dmg:blade': { element: 'blood', golpe: {} }, // Golpe Furtivo e Leque de Lâminas
  'dmg:execute': { element: 'blood', golpe: {} },

  // Inimigos (Necromante, elites e chefes)
  'dmg:spell:necro': { element: 'shadow', golpe: {} }, // míssil do Necromante
  stomp: { element: 'nature', circulo: { raio: 0 }, golpe: { anelRaio: true } }, // pisão
  'dmg:spell:elite': { element: 'nature', golpe: {} },
  'dmg:spell:boss': { element: 'nature', golpe: {} },
  'dmg:spell:boss2': { element: 'nature', golpe: {} },
  'dmg:spell:orcboss': { element: 'nature', golpe: {} },
  'dmg:spell:goblinWarlord': { element: 'nature', golpe: {} },
  telegraph: { element: 'blood', circulo: { raio: 0 } }, // aviso de golpe (segurar = tempo do aviso)

  // Genérico: dano de magia sem receita própria
  'dmg:spell': { element: 'arcane', golpe: {} },
};

/** Intervalo mínimo (segundos) entre efeitos iguais no mesmo alvo: evita enxame de efeitos. */
export const MAGIA_HIT_INTERVAL = 0.25;

/** Tempo da simulação: 10 ticks por segundo (converte `ticks` de eventos para segundos). */
export const TICKS_POR_SEGUNDO = 10;
