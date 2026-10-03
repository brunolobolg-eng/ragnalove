---
name: game-architecture
description: Arquitetura do ROguard/Vanguarda. Use antes de criar um sistema novo, mover código entre camadas, decidir onde uma regra deve morar, ou qualquer refatoração estrutural (core/render/ui/config, main.ts, eventos da simulação).
---

# Arquitetura do jogo

## Camadas (de dentro para fora)
```
config/  →  core/  →  (SimEvent[] + estado)  →  render/ e ui/  →  main.ts (cola tudo)
```
- **`src/config/`** — dados e constantes (`GAME_CONFIG`, `VISUAL_CONFIG`, `HERO_INFO`, `REGIONS/ACTS/EVENTS`, `ZONES`).
  Sem lógica além de helpers puros.
- **`src/core/`** — regras puras: simulação (`sim/`), classes (`archetypes/`), progressão (`progression/`),
  jornada (`run/`), grade e pathfinding (`grid/`). **Proibido** importar DOM, `three`, `ui/` ou `render/`.
  Roda headless (scripts em `scripts/`) e pode virar servidor no futuro sem mudanças.
- **`src/render/`** — Three.js. Lê o estado e reage a `SimEvent`s (`Simulation.step()` devolve a lista).
  Interpola posições entre ticks. **Nunca altera a simulação.**
- **`src/ui/`** — DOM puro. Recebe um *view model* pronto (ex.: `CharacterVM`, `MapState`, `HeroCardVM`)
  e devolve intenções por callbacks (`onEquip`, `onChoose`...). **Não calcula regra**: stats vêm de
  `heroStats()`, preços de funções do core, etc.
- **`src/main.ts`** — orquestração: modos (`menu/select/map/battle/city/event/end`), monta VMs,
  liga callbacks às funções do core, salva. Lógica nova de regra **não** vai aqui: vai no core e o main só chama.

## Regras
1. Regra de jogo nova → função pura no `core` (recebe estado, devolve/atualiza estado) + chamada no main.
2. Efeito visual de algo da simulação → emitir `SimEvent` no core, tratar em `render/GameView` (e som em `playSounds`).
3. Tela nova → classe em `src/ui/` com `el`, `open(vm)`/`close()`, callbacks no construtor. Ver `HeroCard.ts`.
4. Classe de herói nova → arquivo em `core/archetypes/` implementando `Archetype` + `registry.ts` + `HERO_INFO`
   + skills em `progression/skills.ts` (ver skill `party-character-system`).
5. Determinismo: só `Rng` com seed no core. Mesma seed + mesma formação = mesmo resultado (o `sim:check` confere).
6. Evite estado global novo; se precisar, deixe-o no `RunState`/`Profile` (que são salvos) ou em config.
7. Ferramentas de dev (`src/dev`, `src/debug`, `src/editor`) só carregam com `import.meta.env.DEV` e somem do build.
8. Antes de terminar: `npm run build` + `npm run sim:check`.

## Antipadrões a recusar
- Combate/drop/preço calculado dentro de componente de UI.
- `render/` mudando `unit.hp` ou qualquer estado.
- Números soltos no código em vez de config.
- `Math.random()` no core.
