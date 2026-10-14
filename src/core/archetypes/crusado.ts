import { GAME_CONFIG } from '../../config/gameConfig';
import { vocationArchetype } from './vocationEngine';

/**
 * Crusado (2ª vocação do Guerreiro): espada e escudo sagrados. A árvore está em config/vocationSkills.ts;
 * o motor compartilhado (vocationEngine.ts) executa as habilidades.
 */
export const crusado = vocationArchetype('crusado', GAME_CONFIG.archetypes.warrior.hp);
