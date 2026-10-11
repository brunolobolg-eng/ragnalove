import { BASTION } from '../../config/bastion';
import { GAME_CONFIG } from '../../config/gameConfig';

/**
 * Dano de contato no Emperium (o minério do centro do castelo do Último Bastião). A criatura morre ao tocar o
 * tile e desconta da vida da cidade: vida atual × força do tipo (a ameaça da tabela da cidade) ÷ contactDivisor.
 * Mais vida e mais força causam mais dano; uma criatura ferida causa menos. Sempre pelo menos 1.
 * Entra na simulação como `contactDamage` (ver Simulation.enterCity); a campanha continua com a ameaça por tipo.
 */
export function emperiumDamage(kind: string, hp: number): number {
  const forca = GAME_CONFIG.cityDefense.threat[kind] ?? GAME_CONFIG.cityDefense.defaultThreat;
  return Math.max(1, Math.round((Math.max(0, hp) * forca) / BASTION.emperium.contactDivisor));
}
