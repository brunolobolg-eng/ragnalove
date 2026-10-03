---
name: game-data
description: Dados de conteúdo do ROguard — onde ficam e como adicionar heróis, monstros, itens, habilidades, zonas, regiões, eventos e valores de balanceamento (GAME_CONFIG, overrides do Game Editor). Use ao criar ou alterar qualquer conteúdo ou número do jogo.
---

# Dados do jogo

O jogo é **dirigido por dados em TypeScript tipado** (não JSON solto): tipos garantem que o conteúdo
novo está completo. Prefira estender essas tabelas a escrever código caso a caso.

| Conteúdo | Arquivo | Observações |
|---|---|---|
| Constantes de gameplay | `src/config/gameConfig.ts` (`GAME_CONFIG`) | tick, inimigos, IA, almas, recompensas, vfx |
| Heróis (nome, papel, família, cor, skills iniciais, desbloqueio) | `src/config/heroes.ts` (`HERO_INFO`, `HERO_ORDER`) | |
| Atributos base e fórmulas | `src/core/progression/attributes.ts` (`ATTRIBUTES_CONFIG`) | Força, Inteligência, Vitalidade, Destreza, Sorte |
| Árvore de habilidades | `src/core/progression/skills.ts` | entrada de dado + efeito tratado na simulação |
| Itens: slots, raridades, tipos, rolagens, refino | `src/core/progression/equipment.ts` | itens são **gerados** por `rollItem` |
| Mundo: regiões, atos, eventos | `src/config/world.ts` | `REGIONS`, `ACTS`, `EVENTS` |
| Zonas de combate (mapa, spawns, ondas, objetos) | `src/config/zones.ts` | |
| Visual: modelos dos heróis/monstros, arte de telas | `src/config/visualConfig.ts` | `HERO_MODELS`, `MONSTER_MODELS`, `MAP_ART`... |
| Overrides de balanceamento | `src/config/balance.ts` (**gerado**) | escrito pelo Game Editor (F10) via `editor/overrides.ts` |

## Regras
- Ids em camelCase inglês (`redDunes`, `frostBolt`); textos visíveis em pt-BR.
- Item não é catálogo fixo: é `slot + kind + rarity + rolls (+atk/matk, refine, awakened)`. Para "item único"
  com nome próprio, proponha estender `Item` com campo opcional (ex.: `uniqueId`/`name`) — sem quebrar saves.
- Mudou um número que o editor também edita? Lembre que `balance.ts` sobrepõe o código (chave `raiz/campo/...`).
- Não edite `balance.ts` à mão se o dono usa o editor; avise.
- Conteúdo novo precisa de: dados + (se tiver efeito novo) tratamento no core + visual/ícone + texto pt-BR.
- Personagens: no código as classes são `warrior/mage/archer/sorcerer/warlock/assassin` (nomes de tela em `HERO_INFO`);
  os modelos 3D atuais são Eliana (guerreira), Cléria (maga), Líria (arqueira).
