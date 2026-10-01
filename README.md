# Vanguarda — Idle RPG Tático de Hordas (2.5D, grade SQM)

## Rodar
```bash
npm install
npm run dev        # abre em http://localhost:5173
npm run sim:check  # teste headless do funil (sem render)
npm run build      # typecheck + build de produção
```

**Controles (planejamento):** escolha Guerreiro / Mago / Barreira e clique no tabuleiro · `R` gira a barreira (─ ╲ ╱) · `Espaço` inicia / reinicia · 1×/2×/4× velocidade.

## Arquitetura
```
core/   → simulação pura (TS, sem DOM/Three). Fonte da verdade, determinística, passo fixo 10 Hz.
render/ → só lê o estado + consome eventos do tick. Nunca altera a simulação.
ui/     → HUD em DOM.
config/ → GAME_CONFIG (gameplay) e VISUAL_CONFIG (visual). Sem números mágicos no resto.
```
- `Simulation.step()` devolve uma lista de `SimEvent` (spawn, move, damage, death, cleave, effectStart…). O render dispara FX a partir deles, então o núcleo pode rodar num servidor depois sem mudanças.
- Render interpola posições entre ticks (`tick + fração`), então 10 Hz de simulação fica fluido a 60+ fps.

```
src/
  config/gameConfig.ts     GAME_CONFIG, DEFAULT_SETUP, tipos de setup
  config/visualConfig.ts   câmera, bloom, luzes, parâmetros dos FX
  core/grid/Board.ts       grade: paredes + camada de custo de perigo
  core/grid/patterns.ts    linePattern / conePattern / squarePattern
  core/grid/pathfinding.ts FlowField (Dijkstra reverso) + regra de diagonal
  core/archetypes/         Archetype (interface), mage, warrior, registry
  core/sim/Simulation.ts   loop do combate, horda, dano, vitória/derrota
  core/sim/types.ts        Unit, AreaEffect, SimEvent
  core/sim/rng.ts          PRNG com seed
  render/Stage.ts          renderer, câmera 2.5D, sombras, bloom, pool de luzes
  render/BoardView.ts      tiles, muros, overlay de indicadores, picking
  render/GameView.ts       espelho visual da simulação
  render/units/UnitView.ts modelos procedurais + animação (idle/andar/ataque/cast/morte)
  render/fx/               Particles (GPU), FireBarrierFX, CleaveFX
  ui/Hud.ts, ui/style.css
scripts/simCheck.ts        validação headless do funil + determinismo
```

## Decisões de regra (Fase 1)
- Movimento em 8 direções; diagonal custa 14, ortogonal 10.
- **Diagonal não corta quina**: não passa entre dois tiles se um deles é parede ou fogo → a barreira diagonal não vaza.
- Fogo = custo +150 por tile (não é bloqueio). Inimigo só atravessa se não houver outro caminho; se o caminho bom está só congestionado, ele **espera na fila** em vez de pular no fogo — é isso que forma o funil.
- Campo de fluxo único para a horda inteira (barato com muitos inimigos).
- Guerreiro escolhe, entre as 8 direções, o cone com mais inimigos; Mago relança a barreira no local/orientação planejados.

## Resultado do `sim:check` (onda de 40)
| Setup | Resultado |
|---|---|
| Funil (barreira ─ fechando x4–8, guerreiro na brecha) | **Vitória 40/40** |
| Barreira ╲ na brecha | Derrota 36/40 |
| Barreira longe da brecha | Derrota 22/40 |

## Status das fases
- [x] Fase 1 — protótipo (seção 9, itens 1–9)
- [ ] Fase 2 — múltiplas ondas + dificuldade crescente, spawn configurável por direção
- [ ] Fase 3 — atributos distribuíveis (INT → tamanho/duração da barreira, FOR → alcance/ângulo do golpe), progressão entre sessões
- [ ] Fase 4 — polimento AAA: distorção de calor (pass de pós-processo), rastro de arma com mesh, modelos/animações com rig, áudio

## Versão desktop (Electron / Steam)
```bash
npm install
npm run desktop:dev     # Vite + janela do Electron com recarga
npm run desktop:start   # build de produção aberto no Electron
npm run desktop:build   # pasta pronta para a Steam em release/win-unpacked
```
- O build de produção **não contém** o painel de debug (`import.meta.env.DEV` vira `false` e o módulo é removido).
  Para conferir: depois do `npm run build`, procure por `DebugPanel` dentro de `dist/` — não deve aparecer.
- V-Sync real: a escolha nas Configurações é salva em `desktop.json` (pasta de dados do app) e vale ao reabrir.
- F11 alterna tela cheia.
- Fontes (Cinzel, OFL) ficam embutidas em `src/assets/fonts`: o jogo funciona offline.
- Sem Vite também dá para empacotar: `scripts/pack-web.sh` gera `web/` (módulos ES + three.js), e o
  `electron/main.cjs` serve `dist/` ou `web/` pelo protocolo interno `app://` (sem servidor, sem porta aberta).

## Ferramentas de teste
- **F9** (só em `npm run dev`): painel de debug — EXP/nível, atributos, almas, itens por raridade, spawn por tipo e chefe,
  onda (iniciar/pular/reiniciar), invencível, sem recarga, velocidade, grade + custos do pathfinding, hitboxes,
  forçar cada efeito de magia e **benchmark de pior caso** (100 zumbis + magias em cada preset, aplica o recomendado).

## Efeitos visuais
`render/fx/kit/` reúne a base: partículas em GPU com flipbook (fogo/fumaça/faísca), fitas (ribbon), decalques de chão,
luzes com tremulação, passe de pós (calor, aberração, vinheta, correção de cor), hit-stop e empurrão de câmera.
Cada magia segue 5 fases (antecipação → lançamento → trajetória/presença → impacto → rescaldo) e respeita o preset
de qualidade (`settings/Settings.ts → QUALITY_PRESETS`) e o orçamento em `GAME_CONFIG.vfx`.
