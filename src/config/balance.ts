/**
 * Balanceamento salvo pelo Game Editor (F10 no client desktop, rodando da pasta do projeto).
 * ARQUIVO GERADO: o botão "Salvar" do editor (via electron/main.cjs) reescreve este arquivo inteiro.
 * No executável empacotado o editor grava em userData/balance.json, aplicado por cima deste.
 * Guarda só o que difere dos valores do código (gameConfig.ts, zones.ts, world.ts, equipment.ts...).
 * Chave = caminho "raiz/campo/subcampo" (ver src/editor/overrides.ts); valor = novo valor.
 * Entra no build: o jogo final usa estes valores.
 */
export const BALANCE_OVERRIDES: Record<string, unknown> = {
  "game/combatAI/heroes/assassin/maxCombatMoveDistance": 3.5,
  "game/combatAI/heroes/mage/maxCombatMoveDistance": 2.5,
  "game/combatAI/heroes/mage/moveTicks": 5,
  "game/combatAI/heroes/warrior/maxCombatMoveDistance": 3.5
};
