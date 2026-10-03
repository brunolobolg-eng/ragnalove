# ROguard / Vanguarda — guia do projeto para o Claude

Leia isto antes de qualquer tarefa neste repositório. Vale para toda conversa nova.
O dono do projeto fala português: responda em **português (pt-BR)**, simples e direto
(ele não é programador). Código, comentários e textos do jogo também em pt-BR.

## O que é o jogo
RPG tático idle de hordas, 2.5D chibi, fantasia medieval no mundo original de **Aurenthal**.
Uma **jornada (run)** = 3 **atos** × 5 **fases** (15 no total). Entre as fases o jogador vê o
**mapa-múndi**, escolhe o caminho (horda, elite, evento, cidade, chefe, sobrevivência), gerencia a
**party** (até 6 heróis: Guerreiro, Mago, Arqueira, Feiticeira, Bruxa, Assassino), equipamentos,
atributos e habilidades. O combate é uma **simulação em tempo real determinística a 10 ticks/s**
(não é por turnos): o jogador posiciona heróis/barreiras e a IA luta. Moedas: **Zeni** (gasto) e
**Almas** (crescimento: EXP, despertar). A **cidade** tem vida própria (segundo objetivo).
Estética: MMORPG coreano clássico dos anos 2000, recriação 100% original (nada de marcas/IP de terceiros).

Stack: TypeScript + Vite + Three.js, desktop via Electron (Windows/Steam). Sem framework de UI (DOM puro).

## Regras de ouro (sempre)
1. **Núcleo separado da apresentação.** `src/core/` é lógica pura (sem DOM, sem Three.js),
   determinística e testável headless. `src/render/` só lê o estado e consome `SimEvent`s.
   `src/ui/` só mostra dados e chama callbacks. **A UI nunca decide regra de jogo.**
2. **Tudo que é conteúdo é dado.** Números em `src/config/*` (`GAME_CONFIG`, `VISUAL_CONFIG`,
   `world.ts`, `zones.ts`, `heroes.ts`) e tabelas em `core/progression/*`. Nada de número mágico no código.
3. **Determinismo.** No `core`, use só o `Rng` com seed (`core/sim/rng.ts`). Nunca `Math.random()`/`Date.now()` na lógica.
4. **Save é sagrado.** Mudou o formato de `RunState`/`Profile`? Escreva a migração (`migrateRun`/`migrateProfile`)
   para saves antigos continuarem abrindo.
5. **Antes de dizer "pronto"**: `npm run build` (typecheck + build) e `npm run sim:check` devem passar.
   Mudou UI/visual? Abra o jogo no Chromium headless (Playwright) e confira um screenshot.
6. **Nada de arquivo-fonte pesado no repositório** (modelos originais, PSD, vídeos brutos). O jogo usa
   só versões otimizadas em `public/`. Fontes editáveis vão zipadas para a branch `fontes`.

## Regras de design fixas (definidas pelo dono — pese o balanceamento antes de mudar)
- **Mana = slots de habilidade** (não é MP, não gasta, não regenera). Mana vem da **Inteligência** (+ Poção de Mana e itens Épicos+). Custo do slot: Mago 1×, Arqueira/Assassino 1,5×, Guerreiro 2×. **Máximo de 5 slots** por herói; os não liberados aparecem bloqueados (escuros).
- **Skill Haste** é o único atributo que acelera a recuperação das habilidades. **Chance de crítico** e **Dano crítico** são separados.
- **Loot = RNG**: nenhum item garantido no começo da jornada. **Mítico** é raríssimo, com 1 garantia ao vencer o 1º chefe.
- Cada atributo tem UMA função; nada de recursos abundantes ou sistemas redundantes. Detalhes: skill `combat-system`.

## Skills do projeto (`.claude/skills/`)
Carregue a skill do assunto antes de mexer nele — elas descrevem as regras reais do jogo:

| Skill | Quando usar |
|---|---|
| `game-architecture` | qualquer mudança estrutural, novo sistema, onde colocar código |
| `game-data` | criar/alterar dados: heróis, monstros, itens, habilidades, zonas, eventos, balanceamento |
| `combat-system` | simulação, dano, atributos, habilidades, IA, almas, loot, chefes |
| `party-character-system` | heróis, níveis, EXP, atributos, árvore de habilidades, party, morte/reviver |
| `inventory-equipment` | slots, itens, raridade, refino, despertar, bolsa, Pet/Asas |
| `world-map` | mapa-múndi, atos, fases, regiões, caminhos, cidades, eventos |
| `game-ui` | telas, janelas, tooltips, estilo visual azul-marinho + dourado |
| `asset-pipeline` | modelos GLB, sprites, ícones, WebP/PNG/JPG, otimização |
| `save-system` | save/load, versões, migração, recuperação |
| `electron-desktop` | Electron, IPC, preload, arquivos, janela, build do .exe |
| `content-designer` | "crie um monstro/chefe/item/evento/fase..." no formato do jogo |
| `game-testing` | testes headless, sim:check, verificação no navegador |
| `performance` | FPS, memória, presets de qualidade, orçamento de efeitos |

## Fluxo de trabalho com o dono
- Ele usa dois atalhos na pasta do projeto no PC: **BAIXAR_DO_GITHUB.bat** (traz as mudanças, inclusive
  a branch de trabalho do Claude) e **ENVIAR_PARA_GITHUB.bat** (envia para a `main`). Depois
  **ATUALIZAR_JOGO.bat** compila e atualiza o executável. Ao terminar uma tarefa, lembre desses passos.
- Trabalhe na branch indicada pela sessão; não reescreva o histórico da `main`.
- Ao mostrar resultado visual, mande um screenshot do jogo rodando.
- Arte/ícones/modelos vêm do dono (geralmente gerados em IA). Use a arte dele; não troque por arte
  "programática" sem pedir.

## Mapa rápido do código
```
src/core/sim/         Simulation.ts (loop, dano, ondas), types.ts (Unit, SimEvent), rng.ts
src/core/archetypes/  um arquivo por classe + registry.ts
src/core/progression/ attributes.ts, equipment.ts, skills.ts, profile.ts
src/core/run/         run.ts (jornada, nós, recompensas), records.ts (ranking)
src/core/grid/        Board, pathfinding (flow field), patterns
src/config/           gameConfig, visualConfig, heroes, world, zones, balance (gerado pelo editor)
src/render/           Stage, GameView, BoardView, units/ (modelos), fx/ (efeitos), scenery/
src/ui/               Hud, WorldMap, HeroCard, CityScreen, SkillTree, CharSelect, menu/...
src/save/SaveStore.ts save em arquivo (Electron) ou localStorage (dev)
src/dev/, src/debug/, src/editor/  ferramentas de dev (F8 Dev Lab, F9 debug, F10 editor) — fora do build final
electron/             main.cjs, preload.cjs, splash
scripts/              simCheck.ts, runCheck.ts, process_sprites.py, make-icon.py, pack-web.sh
```
