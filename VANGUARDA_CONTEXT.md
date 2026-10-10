# VANGUARDA

> Leia isto antes de modificar o projeto. O código é a verdade da implementação;
> este documento é a verdade das decisões de design. Em caso de conflito, reporte e pergunte.

## Project Identity

- **Vanguarda (ROguard)**: RPG tático de fantasia medieval, campanha longa + modo Survival.
- **Plataforma**: web (Vite) + desktop (Electron, `electron/`). Dono não é programador: respostas em pt-BR, diretas.
- **Tecnologia**: TypeScript, Three.js + three.quarks (VFX), simulação determinística própria (10 ticks/s, sem engine de combate externa).
- **Estado**: `v0.7a` (`MENU_VISUAL.version` em `src/config/visualConfig.ts`; esquema `0.5a…0.5z`, depois `0.6a`; bump a cada entrega). Branch `main`, commits por lote.

## Core Design

- **Loop**: mapa-múndi → escolhe nó → planejamento (posiciona party/barreiras, ~10–30s) → horda em tempo real → relatório da noite → recompensas → próximo nó.
- **Experiência**: jornada crescente TENSÃO → CRESCIMENTO → PRESSÃO → ALÍVIO → CLÍMAX; nunca "o mesmo minuto 60 vezes".
- **Princípios**: sem inflar HP para esticar duração; pressão via quantidade/frequência/composição; progressão relevante do minuto 1 ao 60; reutilizar sistemas existentes em vez de criar novos.

## Current Gameplay Rules

- **Campanha**: alvo **60–80 min** por run (medido ~41 min de combate + ~18 min de overhead). 3 atos × 5 nós; ~8–9 combates por run. Opções por nó: horda / elite / chefe / survival / cidade / evento.
- **Agressão (foco)**: monstro que detecta herói trava nele por **60 ticks (6s)**, sem trocar; depois solta e reavalia (outro herói ou portão). Teto **6 monstros/herói**, rechecagem a cada 5 ticks, guia (leash) alcance+6. Tipos `bypass`/`city` (runner, necro) nunca trancam. Zona visual = mesmo cálculo da IA (`combatProfile.aggressionRange`, fonte única).
- **Party**: 1–3 heróis (frente/conjurador/dano). Invariante: **quem entra na party entra vivo** (`unlockHero` limpa `dead`). Caídos ficam fora da fase (`liveSetup`); batalha nasce com HP cheio.
- **Atributos**: efeitos valem **acima da base** da classe. Por ponto: VIT +12 HP; FOR +2,2 cleave / +3 investida; INT +1,2 raio / +4 ticks barreira / +2 Mana; DES +2,5% haste / +1,3 flecha / +0,9 chuva; SOR +1% crítico / +0,8% esquiva. Tetos: haste 0,6, esquiva/bloqueio 0,5, crítico 0,6. +5 pts ≈ +33–80% no stat relevante. Movimento **não** tem driver de atributo (decisão: seria mecânica nova no sim).
- **Árvore de habilidades**: subir nível = 1 ponto + Zen (só com o Mestre, na cidade). Pré-requisitos por nível nunca são pulados; `learnPath` compra o caminho todo de uma vez (alvo à parte); ramo de especialização nunca é auto-escolhido (caminho birramal sem escolha = bloqueado).
- **Moeda**: chama-se **Zen** em todo texto visível. Identificadores internos continuam `zeni` (`profile.zeni`, `addZeni`, `game/zeni/*`) — não renomear.
- **Progressão**: EXP por abate para a party viva; curva `20·L^1.6`; chefe/mini-chefe dá +1 nível a todos; 1º chefe garante 1 Mítico; presente sorteado na 1ª vitória. Almas = crescimento; Zen = gasto.
- **Survival (cerco)**: party no **centro**, sem portão, **todos caçam** (inclusive `bypass`), ameaça à cidade = 0, escala infinita (`stageKills/hpGrowth/dmgGrowth`, elite a cada N estágios), sem chefe fixo. Recorde `survivalBest {seconds, stage, kills}` (opcional — saves antigos compatíveis). Resultado mostra tempo/estágio/abates/nível/dano + melhor cerco.
- **Saves**: `SaveStore` (arquivo atômico + `.bak` no Electron; localStorage em dev). Selo de batalha (recomeça onda igual após crash) + `paidKey` anti-pagamento-duplo. `migrate*` preenchem campos novos — preservar compatibilidade.

## Major Systems

- **Combate** (`src/core/sim/Simulation.ts`): passo fixo determinístico, seed por fase; campo de fluxo até o portão (+ fluxos de pesado/provocação/party); levas orgânicas (packs 1–10, scatter 3, deriva); **governador de densidade** (respiro em 35 vivos, teto 120); N-portais genéricos (mapas têm 2); Provocar com tipos afetados.
- **Personagens**: 6 classes em 3 famílias (frente/conjurador/dano); desbloqueio por metas; solo ganha `soloBonus` (Ato I começa com 1 herói).
- **Atributos** (`core/progression/attributes.ts`): `computeStats` = fonte dos stats; equipamento soma antes das fórmulas; Mana = `18 + INT×2` (slots por classe, máx 5).
- **Árvore** (`core/progression/skills.ts`, `ui/SkillTree.ts`): tiers 1–3, ramos travam o outro, `missingRequirements`/`prereqPath`/`skillState`.
- **Inimigos** (`gameConfig.enemies`): grunt/runner/brute/necro/elite/bosses + Krexx (`goblinImp`/`goblinWarlord`). **Tabela de HP intocada** — balance via quantidade/intervalo/composição/ameaça.
- **Mapas** (`config/zones.ts`): ASCII 45×39, 2 spawns, portão com funil 7→5 tiles (assimétrico: direita aberta p/ tiro); objetos interativos (`objects.ts`); biomas (névoa, raízes, tempestade de areia).
- **Campanha** (`config/world.ts`, `core/run/run.ts`): `battleFor` escala por ato/nó/tamanho da party (solo 0,6×, duo 0,85×; 1ª fase 0,75×); acompanhantes de chefe 0,55×; `hpMult` atos 1 / 1,6 / 3,2; arco do Krexx; eventos (19) com aposta 90/10 pequena.
- **Survival**: nós `survival` com `endless`; setup central (`centerBase`); queda não mata ninguém; roleta de prêmios por pontuação.
- **Cartas/equipamento**: cartas de item com raridade (comum→mítico), refino (+taxa, falha +5 volta 1), reroll, despertar ×1,5 (lendário/mítico), loja sorteada por ato, roleta de recompensas.
- **Cartas de monstro (progressão permanente)**: coleção no meta (`cards.ts` é o catálogo: 112 artes, Normal +3 / Mini-Boss +8 / MVP +12/+6, afinidade flexível = metade sem afinidade); pacote de 5 só na vitória (3N + 2× 90/5/5); fusão 3 iguais→Normal diferente e 10 Normais→Mini-Boss; slots 2/run até 20 +1 até 30; bônus aplicados no `newRun` via `cardAttrs` (vale da próxima run em diante).
  - Regras que não se desfazem: **MVP nunca sai de fusão (só do pacote)**; fusão preserva 1 cópia quando dá e nunca toca em equipadas; equipar vale só na próxima run (nunca recomputar no meio da run); duplicatas permitidas na build (limitadas às cópias possuídas); UI da coleção no botão do mapa-múndi; teste em `cardCheck.ts`.
- **Economia**: drops por abate + bônus de vitória; serviços com preço ×ato (1 / 1,6 / 2,4); reviver = 50% do Zen; reparo de muralha por HP.
- **Saves**: acima; Ranking (`records.ts` + `HallOfLegends`, linhas ancoradas na arte — não adicionar linhas sem reposicionar).
- **UI**: HUD (party-bar, barras, charwin), telas de cidade (5 NPCs), mapa, relatórios, `CoachTips`, roleta. Dev: F6/F8/F10 com `devtools.txt`; `dist/` sem chunks dev no release. Dev Lab (F8) tem abas ARENA/CHARACTERS/SKILLS/MOVEMENT/ECONOMY/LOOT/WAVES/SCENARIOS + **SKILL ARENA** (mapa de teste isolado, boneco `trainingDummy`, estatísticas de dano real, presets, dano ×temporário).
- **Áudio/animação**: ambiente por tema + sfx por evento; retratos/chibis renderizados; GLBs grandes em `public/models/` (originais preservados via git).

## Important Relationships

- `velocidade de movimento → aggressionRange` (fonte única em `combatProfile`).
- `INT → Mana → slots de habilidade` (custo por classe; teto 5).
- `contagem × intervalo × kill-rate → duração do combate`; `contagem × ameaça → pressão na cidade` (ameaça −60% calibra as hordas 6–8× maiores).
- `party ∩ dead = ∅` na entrada; `liveSetup` filtra caídos da batalha.
- `endless → caçada total + ameaça 0 + setup central`.
- `atos → hpMult/dmgMult/threatMult/preços`; `tamanho da party → contagem/HP da horda`.
- Mixes por ato: A1 UNDEAD/FAST, A2 FAST + composições leves (duo não tanka HEAVY cheio), A3 HEAVY (trio).

## Current Important Decisions (não desfazer)

- Duração via quantidade/ritmo, **nunca** inflando HP; tabela `enemies` congelada.
- Desempenho da horda: inimigos não projetam sombra (só a de contato); GLB de monstro/herói simplificado (≈18k–40k triângulos no máximo); originais ficam na branch `fontes`, nunca na `main`. Opções gráficas: só as que mudam algo visível (sem modo sprites 2D e sem preset Ultra).
- Orçamento vitalício de EXP constante esticado em ~8× mais abates (per-kill baixo + curva 1,6).
- Ameaça à cidade reduzida junto com o aumento de contagens (são um par).
- `spawnPoints: Vec2[]` genérico; mapas seguem com 2 portais.
- Runner/necro nunca trancam foco (design, não bug).
- Shell é PowerShell: sem `grep/head/&&`; `node` direto (npx bloqueado); `tsconfig` com `"types": []` (scripts `.ts` sem `fs` — usar `.mjs`/`.cjs`).
- Gate de entrega: `tsc --noEmit` + `sim:check` (simCheck com party fraca pode dar `defeat` — informativo; gate real é `runCheck` com builds típicas: tudo vitória). Bump de versão a cada entrega.

## Known Limitations

- Mapas de Survival são corredores (arena dedicada = futuro); endless funciona neles.
- iGPU fraca com 100+ unidades visíveis: usar presets de qualidade (pools de VFX já têm teto).
- Suite headless cresce com as contagens (só lógica; sem Playwright neste ambiente).
- `runCheck` usa só arma + builds fixas (conservador: jogador real tem gear completo, poções e micro).

## AI DEVELOPMENT RULES

- Leia este arquivo antes de modificar o projeto.
- O código é a verdade da implementação; aqui mora o design vigente.
- Inspecione os arquivos relevantes antes de mudá-los; menor mudança segura.
- Não crie sistemas duplicados; não redesenhe mecânica estabelecida em silêncio.
- Não toque em sistemas não relacionados (ex.: rebalance ao mexer em UI).
- Preservar saves; checar `git status` antes de commitar.
- Testar antes de declarar pronto (gate acima).
- Atualize este documento **só** quando regra permanente de design/jogo mudar; nada de cada micro-mudança.
