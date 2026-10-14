import { GAME_CONFIG } from '../../config/gameConfig';
import { vocationArchetype } from './vocationEngine';

/**
 * Hypnomancer (2ª forma da Bruxa): controle mental e magia elemental. A árvore está em config/vocationSkills.ts;
 * o motor compartilhado (vocationEngine.ts) executa as habilidades.
 */
export const hypnomancer = vocationArchetype('hypnomancer', GAME_CONFIG.archetypes.warlock.hp);
