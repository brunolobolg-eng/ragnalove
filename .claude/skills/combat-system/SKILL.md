---
name: combat-system
description: Sistema de combate do ROguard — simulação em tempo real determinística a 10 ticks/s, dano, atributos derivados, esquiva/bloqueio/crítico, habilidades e recargas, IA da party e da horda, almas, EXP, Zeni, drops, cidade, chefes. Use ao mexer em Simulation.ts, archetypes, stats ou balanceamento de luta.
---

# Combate

## Modelo (estado atual)
- **Tempo real com passo fixo**: `Simulation.step()` avança 1 tick (`GAME_CONFIG.sim.tickRate = 10`). Não há turnos.
  O jogador **posiciona** (fase `setup`); a IA luta (fase `running`). Render interpola entre ticks.
- Grade estilo SQM, 8 direções (ortogonal 10, diagonal 14), diagonal não corta quina.
- Horda usa **campo de fluxo** único (Dijkstra reverso) rumo à **cidade**; fogo/perigo é custo, não bloqueio.
  Aggro por tipo (`tauntable`, `bypass`, `heavy`, `city`, `hunter`).
- Heróis: cada classe é um `Archetype` (`update` por tick + `skills` em ordem de prioridade da IA).
- Tudo que acontece vira `SimEvent` (`damage`, `death`, `soul`, `drop`, `levelup`, `cityHit`, `avoid`...).

## Status do herói
`heroStats(profile, kind)` = `computeStats(atributos + gearBonus(equipamento), skills)` → `HeroStats`
(maxHp, regen, recarga, esquiva, bloqueio, sorte, crítico, dano das habilidades, classPower...).
- **REGRAS FIXAS DO DONO (não mudar sem pesar o balanceamento):**
  - **Mana NÃO é MP**: não gasta, não regenera. Mana = capacidade de **slots de habilidade** (`core/progression/skillSlots.ts`).
    Slots = Mana ÷ `GAME_CONFIG.mana.slotCost[classe]` (Mago/Feiticeira/Bruxa 10, Arqueira/Assassino 15 = 1,5×, Guerreiro 20 = 2×).
    Mana inicial 20; só sobe com Poção de Mana (cara) e rolagem "Mana" de itens Épicos+. Mana é escassa de propósito.
    Ataque básico (`HERO_INFO.basic`) e passivas não usam slot. Escolha do jogador em `HeroProgress.equippedSkills`
    (undefined = automático). A luta recebe `HeroLoadout.locked` e `Simulation.actWithSlots` segura essas recargas — o archetype não sabe de slots.
  - **Skill Haste** é o ÚNICO atributo de recuperação: `HeroStats.skillHaste`, recarga = base × (1 − Skill Haste) (`cooldownMult`).
    Vem de Destreza, rolagem "Skill Haste" e Meditação/Fluxo Arcano. Não criar "recarga" separada.
  - **Chance de crítico** (`crit`: 5% base + Sorte + itens + passivas) e **Dano crítico** (`critDamage`, 150% base + itens) são
    independentes. `Simulation.damage` rola o crítico de todo golpe da party (dano contínuo nunca critica; Arqueira/Assassino rolam o seu e passam `crit`).
- Não existe DEF/MDEF separado: defesa = esquiva, bloqueio, `damageTakenMult` (passivas) e HP.
- Arma dá `atk` (físico) ou `matk` (cajado/livro); `weaponMult` converte em multiplicador de dano.
Se o dono pedir SP, DEF/MDEF, elementos ou precisão: é **expansão** — proponha onde entra (HeroStats + fórmulas
em `attributes.ts` + uso na Simulation + UI) e mantenha o determinismo.

## Economia da luta
- **Almas**: heróis roubam almas dos inimigos (evento `soul`); viram EXP/despertar (`soulAbsorb`).
- **EXP/nível** por abate (`expPerKill`), **Zeni** por abate/baú, **drops** por `dropChance(sorte)`; chefes sempre dropam
  (`LOOT_CONFIG.bossRarity`).
- **Cidade**: inimigo que chega causa `cityHit`; cidade a 0 = fim da jornada.
- Elite/chefe: telegraph + golpes de área (`stomp`, `meteor`); vencer chefe de ato libera herói novo.

## Regras
- A UI **nunca** decide resultado; ela lê eventos e estado.
- Fórmulas/números em `GAME_CONFIG`/`ATTRIBUTES_CONFIG`, não no meio do loop.
- Efeito novo de habilidade: dado em `skills.ts` → implementação no archetype/Simulation → `SimEvent` → FX em `render/`.
- Depois de mexer: `npm run sim:check` (vitória nas 12 zonas + determinismo) e, se balanceamento, `npx tsx scripts/runCheck.ts`.
