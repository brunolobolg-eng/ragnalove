import { VFXManager } from '../VFXManager';
import { CHARACTERS } from './characters';
import { EFFECTS } from './effects';
import { ENVIRONMENT } from './environment';
import { MONSTERS } from './monsters';

/**
 * Biblioteca de efeitos do jogo, por categoria (characters / monsters / environment / effects;
 * skills e items entram aqui quando ganharem efeitos novos). Efeitos exportados do editor do
 * Quarks vão em `public/vfx/<categoria>/<nome>.json` e são registrados com `registerJson`.
 */
export function registerVfxLibrary(): void {
  for (const group of [CHARACTERS, MONSTERS, ENVIRONMENT, EFFECTS]) for (const [name, def] of Object.entries(group)) VFXManager.register(name, def);
}
