---
name: save-system
description: Save do ROguard — o que é salvo (RunState com Profile dentro, meta/recordes, configurações), onde (arquivo via Electron com .bak ou localStorage em dev), versões e migração de saves antigos, selo de batalha e recuperação. Use ao mudar qualquer formato salvo ou o fluxo de salvar/carregar.
---

# Save

## O que existe
- `SaveStore` (`src/save/SaveStore.ts`): chaves **`run`** (jornada atual) e **`meta`** (conquistas/recordes).
  No executável grava em `userData/saves` por IPC síncrono (`window.vanguardaDesktop.save`) — escrita atômica + `.bak`.
  Em dev: `localStorage` (`vanguarda.run.v1`, `vanguarda.meta.v1`). Saves antigos do localStorage são copiados.
- `RunState` (`core/run/run.ts`, `version: 1`) contém `profile: Profile` (`version: 1`): heróis, Zeni, almas, bolsa,
  party, mortos, histórico, loja, vida da cidade, relatórios, objetos usados, dano/tempo (ranking).
- **Selo de batalha** (`run.battle`): formação + status no início da onda. Se o jogo fechar no meio, a onda recomeça
  igual (é determinística) — anti-"save scum".
- Configurações: `vanguarda.settings.v1` (`settings/Settings.ts`); V-Sync do desktop em `desktop.json`.
- Recordes: `core/run/records.ts`.

## Regras de versão/migração
- Toda mudança de formato precisa de migração em `migrateRun()` / `migrateProfile()` (chamadas ao carregar).
  Campo novo → opcional ou preenchido com padrão na migração. Renomear/remover → converter o antigo.
- Para mudanças grandes, suba `version` e migre em cadeia (v1 → v2 → v3), nunca descartando o save do jogador.
- Itens antigos sem `kind`/`slot` novo são tratados por `itemKind`/`KIND_SLOT`/`RETIRED_KINDS` — siga esse padrão.
- Nunca salve objetos com funções/ciclos; o save é JSON.
- Teste: criar save no formato antigo, carregar, conferir que abre e que a migração é idempotente.
