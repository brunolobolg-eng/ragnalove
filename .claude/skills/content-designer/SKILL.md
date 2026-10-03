---
name: content-designer
description: Criação de conteúdo do ROguard no formato do jogo — monstros, mini-chefes, chefes, habilidades, itens, eventos, cidades, regiões, fases e recompensas, já com dados, balanceamento, texto em pt-BR e integração. Use quando o dono pedir "crie um monstro/chefe/item/evento/fase/habilidade..." para Aurenthal.
---

# Designer de conteúdo

Objetivo: transformar um pedido em conteúdo **jogável** e coerente com Aurenthal, não só um texto.

## Passos
1. Ler as skills `game-data` e a do sistema afetado (`combat-system`, `world-map`, `inventory-equipment`...).
2. Achar o ponto no mundo: ato, região (`REGIONS`), zona (`zones.ts`), progressão esperada (multiplicadores do ato).
3. Escrever o dado no formato existente (tipos TS) — exemplos de onde:
   - Evento → `EVENTS` em `world.ts` (opções, custo, efeitos, textos).
   - Monstro/elite/chefe → tipo em `GAME_CONFIG.enemies` (hp, moveTicks, attackTicks, damage), drops/EXP/ameaça/aggro,
     modelo em `MONSTER_MODELS`, mistura de onda na zona.
   - Habilidade → `skills.ts` + efeito no archetype/Simulation + ícone em `icons.ts` + FX.
   - Item especial → via `rollItem` forçado ou proposta de extensão de `Item` (com migração).
   - Fase/caminho → `ACTS[a].nodes`.
4. Balancear com os números vizinhos (mesmo ato) e validar com `sim:check`/`runCheck`.
5. Entregar: o que foi criado, onde aparece no jogo, números principais e o que falta de arte (pedir ao dono se precisar).

## Tom e lore
Fantasia medieval sombria-mas-fofa: cerco de mortos-vivos à capital Valdrec, refugiados, almas roubadas
("Crônicas das Almas Roubadas"). Nomes originais, pt-BR, curtos. Nada de nomes/marcas de outros jogos.
