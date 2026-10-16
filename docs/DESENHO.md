# Desenho do jogo (Vanguarda)

Documento de referência, 16/10/2026. Cada número vem do código; o caminho do arquivo fica ao lado (ou no início da seção).
Quando um valor não pôde ser conferido no código, está escrito "a confirmar". Decisões e medições ficam em `LOG_SESSOES.md`.

## 1. Visão e pilares

Vanguarda (ROguard) é um RPG tático idle de hordas, 2.5D chibi, em fantasia medieval no mundo de Aurenthal.
Uma jornada tem 3 atos com 5 fases cada (15 no total). Entre as fases, o jogador escolhe o caminho no mapa-múndi e
gerencia a party de até 6 heróis. A luta é uma simulação em tempo real e determinística, a 10 ticks por segundo
(`src/config/gameConfig.ts`, `sim.tickRate`). O jogador posiciona heróis e barreiras; a IA luta.

Regras fixas, definidas pelo dono (fonte: `CLAUDE.md`):
- Núcleo separado: `src/core/` é lógica pura; `src/render/` só lê o estado; `src/ui/` só mostra dados e chama callbacks. A interface nunca decide regra.
- Conteúdo é dado: números em `src/config/*`, sem número mágico no código.
- Determinismo: sorteio só com o gerador de semente (`src/core/sim/rng.ts`).
- Mana são slots de habilidade: não gasta e não regenera. Vem da Inteligência.
- Skill Haste é o único atributo que acelera a recarga das habilidades. Chance de crítico e dano crítico são separados.
- Loot é RNG: nenhum item garantido no início da jornada. Mítico é raríssimo, com 1 garantia ao vencer o 1º chefe.
- Cada atributo tem uma função só.
- Save é sagrado: toda mudança de formato tem migração (ver a seção 8).

## 2. Atos, fases e zonas

- Mapa: grade de 7 × 4, com 19 regiões (`src/config/world.ts`, `WORLD` e `REGIONS`).
- Atos: 3 (`src/config/world.ts`, `ACTS`), com 5 fases cada (5 / 5 / 5).
- Zonas de combate: 16 definidas em `src/config/zones.ts` (`ZONES`).
- Escala por ato (`ACTS`): vida ×1 / ×1,6 / ×3,2; dano ×1 / ×1,35 / ×2,0.

Tabela das 15 fases. Fontes: `src/config/world.ts` (fases e chefes), `src/config/zones.ts` (criaturas, portais, `ALVO_DE_NOITE`).

| Ato | Fase | Região (zona) | Tipo de nó | Criaturas (peso em %; orçamento; intervalo) | Alvo de duração da noite | Portais | Chefe ou elite |
|---|---|---|---|---|---|---|---|
| I | 1 | Ponte e Portões de Valdrec (`bridge`) | Horda | Zumbi 62, Corredor 26, Pesado 12; orçamento 160; intervalo 23,5 | 1000 ticks (1 min 40 s), ±15% | 4 (2 no início; +2 em 30% e 60% do orçamento) | — |
| I | 2 | Ponte e Portões de Valdrec (`bridge`) | Cidade / Evento | — | — | — | Cidade: Acampamento dos Refugiados |
| I | 3 | Bosque Torto (`crookedWood`) | Horda / Elite / Sobrevivência | Zumbi 56, Corredor 26, Pesado 12, Necromante 6; orçamento 170; intervalo 7 | 1000 ticks (1 min 40 s), ±15% | 4 (2 no início; +2 em 30% e 60% do orçamento) | Elite (padrão) |
| I | 4 | Floresta dos Sussurros (`whisperWood`) | Cidade / Evento | — | — | — | Cidade: Ardenfall |
| I | 5 | Clareira do Corvo Ancião (`ravenGlade`) | Chefe | Zumbi 46, Corredor 20, Pesado 26, Necromante 8; orçamento 130; intervalo 17,2 | 1000 ticks (1 min 40 s), ±15% | 4 (2 no início; +2 em 30% e 60% do orçamento) | Colosso da Clareira (`boss`) |
| II | 1 | Vale das Raízes (`rootVale`) | Horda / Elite / Evento | Zumbi 56, Corredor 26, Pesado 12, Necromante 6; orçamento 240; intervalo 11,2 | 1800 ticks (3 min), ±15% | 4 (2 no início; +2 em 30% e 60% do orçamento) | Líder goblin (mini-chefe) |
| II | 2 | Encruzilhada Seca (`dryCrossing`) | Elite / Horda | Zumbi 42, Corredor 40, Pesado 12, Necromante 6; orçamento 416; intervalo 5 | 1800 ticks (3 min), ±15% | 4 (2 no início; +2 em 30% e 60% do orçamento) | Krexx pequeno (mini-chefe) |
| II | 3 | Dunas Vermelhas (`redDunes`) | Elite / Horda / Evento / Sobrevivência | Zumbi 48, Corredor 34, Pesado 6, Raydric 4, Necromante 8; orçamento 260; intervalo 12,7 | 1800 ticks (3 min), ±15% | 4 (2 no início; +2 em 30% e 60% do orçamento) | Dino (mini-chefe) |
| II | 4 | Oásis de Selmara (`redDunes`) | Cidade | — | — | — | Cidade: Selmara |
| II | 5 | Ruínas Solares (`solarRuins`) | Chefe | Zumbi 48, Corredor 34, Pesado 6, Raydric 4, Necromante 8; orçamento 90; intervalo 43,4 | 1800 ticks (3 min), ±15% | 4 (2 no início; +2 em 30% e 60% do orçamento) | Colosso Solar (`boss2`) |
| III | 1 | Campos Cinzentos (`ashenFields`) | Horda / Evento | Zumbi 36, Corredor 34, Pesado 12, Necromante 6, Palhaço 12; orçamento 600; intervalo 5,3 | 2700 ticks (4 min 30 s), ±15% | 4 (2 no início; +2 em 30% e 60% do orçamento) | — |
| III | 2 | Garganta de Ferrugem (`rustGorge`) | Elite / Horda / Sobrevivência | Zumbi 46, Corredor 20, Pesado 26, Necromante 8; orçamento 425; intervalo 6 | 2700 ticks (4 min 30 s), ±15% | 4 (2 no início; +2 em 30% e 60% do orçamento) | Elite (padrão) |
| III | 3 | Passo da Geada (`frostPass`) | Cidade / Evento | — | — | — | Cidade: Kaldrun |
| III | 4 | Covil do Detarderus (`detarderusLair`) | Elite | Zumbi 46, Corredor 20, Pesado 18, Raydric 8, Necromante 8; orçamento 240; intervalo 15,3 | 2700 ticks (4 min 30 s), ±15% | 4 (2 no início; +2 em 30% e 60% do orçamento) | Detarderus (mini-chefe) |
| III | 5 | Cume das Cinzas (`ashPeak`) | Chefe | Zumbi 46, Corredor 20, Pesado 18, Raydric 8, Necromante 8; orçamento 240; intervalo 17,6 | 2700 ticks (4 min 30 s), ±15% | 4 (2 no início; +2 em 30% e 60% do orçamento) | Senhor Orc das Cinzas (`orcboss`) |

Notas da tabela:
- "Orçamento" é o da zona (`wave.count` em `src/config/zones.ts`). Elite usa ×0,9 e chefe ×0,85 (`src/config/gameConfig.ts`, `wave.nos`), e o intervalo cresce na mesma proporção (`src/core/run/run.ts`, `battleFor`).
- "Elite (padrão)" é o mini-chefe genérico `elite`, com 150 de vida (`src/config/gameConfig.ts`, `enemies`).
- Alvo de duração (`src/config/zones.ts`, `ALVO_DE_NOITE`): Ato I 1000 ticks, Ato II 1800, Ato III 2700, tolerância ±15%. Confere a noite de horda, do começo ao último abate. Não vale para sobrevivência (ver a seção 12).
- Portais: as 11 zonas de combate têm 4 portais. Dois abrem no início; os outros dois abrem com 30% e 60% do orçamento (`ativaEm`, `src/config/zones.ts`). Floresta dos Sussurros e Passo da Geada têm 2 portais e não têm noite de horda na rota atual.
- Ritmo (`RITMO_CAMPANHA`, `src/config/zones.ts`): intervalo 1,3× no início, 1,0× no meio e 0,8× no fim; cada portal extra aberto acelera 50%.
- Chefes de ato (`src/config/world.ts`, `ACTS[].boss`): Colosso da Clareira 220 de vida, Colosso Solar 300, Senhor Orc das Cinzas 380 (`src/config/gameConfig.ts`, `enemies`).
- Bônus de vitória de cada onda (`src/config/gameConfig.ts`, `zeni.waveClearBonus` e `waveClearActMult`): 42 no Ato I, 67 no II e 92 no III (`bonusVitoriaCampanha` em `src/core/run/run.ts`).
- Sobrevivência (Bosque Torto, Dunas Vermelhas, Garganta de Ferrugem): a horda não termina e fica mais forte a cada estágio (`src/core/run/run.ts`, `endless`).

## 3. Classes e vocações

Fontes: `src/config/heroes.ts` (papel, liberação), `src/config/vocations.ts` (vocações), `src/config/gameConfig.ts` (`mana`), `src/core/progression/attributes.ts` (atributo principal), `src/core/archetypes/` (um arquivo por classe).

| Classe | Papel | Vocações (nível 10) | Slots de Mana (custo por slot) | Atributo principal | Liberação |
|---|---|---|---|---|---|
| Guerreiro | Linha de frente | Bárbaro, Crusado | 20 (2×) | Força | desde o início |
| Mago | Maga divina | Em breve (sem desenho) | 10 (1×) | Inteligência | desde o início |
| Arqueira | Dano à distância | Em breve (sem desenho) | 15 (1,5×) | Destreza | desde o início |
| Feiticeira | Dano arcano | Em breve (sem desenho) | 10 (1×) | Inteligência | 1000 monstros abatidos, somando as jornadas |
| Bruxa | Maldições | Hypnomancer (2ª vaga sem desenho) | 10 (1×) | Inteligência | derrotar o chefe do Ato II |
| Assassino | Corpo a corpo letal | Em breve (sem desenho) | 15 (1,5×) | Destreza | vencer 10 ondas sem a cidade levar dano |

Notas:
- Vocação: escolhida no nível 10, uma vez por jornada (`src/config/vocations.ts`, `VOCATIONS_CONFIG.level`).
- Mana: base 18, mais 2 por ponto de Inteligência, com máximo de 5 slots por herói (`src/config/gameConfig.ts`, `mana`). Poção de Mana soma 5 de Mana (`city.consumables`).
- Custo do slot: Mago, Feiticeira e Bruxa 10; Arqueira e Assassino 15; Guerreiro 20 (`src/config/gameConfig.ts`, `mana.slotCost`).
- Atributo principal pela família da classe: família mago usa Inteligência, arqueiro usa Destreza, guerreiro usa Força (`src/core/progression/attributes.ts`, linha 200). Destreza alimenta o Skill Haste.

## 4. Combate em resumo

A regra completa está na skill `combat-system` (`.claude/skills/combat-system`). Aqui, só o mapa dos arquivos:
- `src/core/sim/Simulation.ts`: loop, dano e ondas. `types.ts` define Unit e SimEvent. `rng.ts` é o sorteio com semente. `ritmo.ts` é o ritmo crescente da noite. `masteryRules.ts` aplica os efeitos das Masteries. `objects.ts` trata os objetos do mapa.
- `src/core/archetypes/`: uma classe por arquivo, com `registry.ts`.
- `src/core/progression/attributes.ts`: atributos derivados (vida, mana, esquiva, bloqueio, crítico, Haste).
- `src/core/progression/skillSlots.ts`: slots de Mana.
- Números base: 10 ticks por segundo (`src/config/gameConfig.ts`, `sim.tickRate`). Crítico: chance base 5%, dano base 150%, teto de chance 60% (`src/config/gameConfig.ts`, `crit`).
- Vida da cidade: 1000 (`src/config/gameConfig.ts`, `cityDefense.maxHp`).

## 5. Economia

Três moedas:
- Zen: moeda de gasto da jornada (atributos, respec, lojas, refino). Cai de todo monstro abatido e de cada onda vencida (`src/config/gameConfig.ts`, `zeni`).
- Almas: moeda de crescimento (EXP, despertar). Cada monstro dá almas a quem o abateu (`src/config/gameConfig.ts`, `souls.dropPerKill`).
- Banco de Zen (no meta): crédito extra que paga a Árvore Global, sem tirar Zen da jornada (`src/config/arvoreGlobal.ts`, `ARVORE_BANCO`).

Fontes de Zen (`zeni.dropPerKill`, `src/config/gameConfig.ts`): Zumbi 3, Corredor 2, Pesado 8, Elite 56, Colosso da Clareira 105, Senhor Orc das Cinzas 280.

Gastos de Zen (preços em Zen, salvo onde indicado; `src/config/gameConfig.ts` e `src/core/progression/`):

| Gasto | Preço | Onde está |
|---|---|---|
| Ponto de atributo | 40 + 20 × pontos já comprados pelo herói | `zeni.attrPointBase` e `attrPointStep`; `profile.ts`, `attrPointCost` |
| Redistribuir atributos | 80 × (1 + usos anteriores) | `zeni.respecBase`; `profile.ts`, `respecCost` |
| Nível de habilidade | 30 × tier da habilidade × nível que se alcança | `SKILL_ZENI.base`; `skills.ts`, `skillZeniCost` |
| Redistribuir habilidades | 150 × multiplicador de preço do ato, com desconto da árvore | `SKILL_ZENI.respecBase`; `run.ts`, `skillRespecCost` |
| Poção de EXP (pequena / média / grande) | 60 / 200 / 600 | `city.potions` |
| Poção de Vida / Poção de Mana | 320 / 800 | `city.consumables` |
| Itens da loja | de 50 (comum) a 6000 (mítico); venda de 10 a 1500 | `city.itemPrice`, `city.sellPrice` |
| Refino | minério 150, mais 40 por nível | `city.orePrice`, `city.refineFeePerLevel` |
| Reviver um herói caído | 50% do Zen atual | `city.reviveFraction` |
| Preço por ato | ×1 / ×1,6 / ×2,4 | `city.actPriceMult` |
| Muralha de pedra (Bastião) | 5, dobra a cada muralha da cidade, teto 999 | `src/config/bastion.ts`, `STRUCTURES.wall` |

Almas:
- Fontes (`souls.dropPerKill`, `src/config/gameConfig.ts`): Zumbi 1, Corredor 1, Pesado 2, Elite 8, Colosso da Clareira 18, Colosso Solar 25, Senhor Orc das Cinzas 35.
- Gastos: despertar item lendário 60 almas, mítico 120 (`city.awakenSouls`). Absorver 10 almas dá 12 de EXP (`progression.soulAbsorb`).

Banco de Zen (`src/config/arvoreGlobal.ts`, `ARVORE_BANCO`):
- Campanha: 50% do Zen da jornada na vitória, 25% na derrota, nada no abandono.
- Bastião: 30% do Zen de cada bloco completo de 20 noites. Derrota no meio do bloco não paga.
- Preços da árvore: custo por tipo de nó (raiz 0, comum 100, notável 250, caminho 100, Mastery 150; `CUSTO_ZEN_POR_TIPO`); atribuir Mastery 60; reorganizar a árvore 80 × (1 + reorganizações anteriores) (`ARVORE_CONFIG`).
- Teto: cada bônus de economia tem teto (`ARVORE_ECONOMIA`, 22 chaves). Seis ainda não têm gancho no jogo: `zeniCidade`, `recompensaCidade`, `eventoEscolha`, `portaoVida`, `blocosConstrucao` e `limitePecas`.

## 6. Progressão

- EXP por abate (`progression.expPerKill`, `src/config/gameConfig.ts`): Zumbi 2, Corredor 2, Pesado 4, Elite 14, Colosso da Clareira 28, Senhor Orc das Cinzas 70.
- Curva de nível: para passar do nível L, são necessários 20 × L^1,6 de EXP (`progression.expCurve`).
- Por nível: 3 pontos de atributo (`pointsPerLevel`) e 1 ponto de habilidade (`skillPointsPerLevel`). Ao vencer um chefe ou mini-chefe, todos os heróis ganham 1 nível (`levelsPerBoss`).
- Árvore Global (no meta, `src/config/arvoreGlobal.ts`): 111 nós em 6 categorias, com 18 Masteries. Mínimo de 100 nós (`minNos`). Por tipo: raiz 1, comuns 28, notáveis 49, caminhos 15, Masteries 18.
- Masteries: uma por personagem (`maxMasteriesPorHeroi`), que fica com ele mesmo fora da party.
- Pontos: a árvore não tem contador de pontos. Custa Zen do banco (decisão já tomada, ver a seção 12).
- Respec (redistribuir), três tipos: atributos (`profile.ts`), habilidades (`run.ts`) e árvore (`arvore.ts`, 80 × (1 + reorganizações)).

## 7. Último Bastião

Fonte: `src/config/bastion.ts` (`BASTION`, `STRUCTURES`, `PROJECTS`, `BASTION_HORDE`), `src/core/bastion/`.

- Modo de defesa persistente: a cidade dura uma tentativa. O núcleo começa com 1000 de vida (`BASTION.coreMaxHp`, igual à cidade da jornada) e com 20 Zen (`startZeni`, provisório).
- Noite: horda de 60 criaturas (`BASTION_HORDE.count`). Mistura: Zumbi 40, Corredor 24, Pesado 14, Raydric 12, Necromante 10 (pesos em %).
- Número da noite: ondas vencidas + 1 (`src/core/bastion/horde.ts`).
- Mini-chefe a cada 5 noites; MVP a cada 10 (as noites de MVP não têm mini-chefe); Senhor do Abismo a cada 100 (`miniEvery`, `mvpEvery`, `legendEvery`).
- Muralha de pedra: 5 Zen, dobra a cada muralha da cidade, teto 999. Vida 120, mais 60 por nível, até o nível 3. Bloqueia e não atira.
- Torre de tiro: 120 Zen, vida 100 (mais 40 por nível), dano 14 (mais 4 por nível), alcance 6, recarga de 12 ticks. Só nos lotes de construção.
- Projetos: Castelo básico (grátis); Torres de tiro (200 Zen, exige a Arqueira na party); Reforços estruturais (150 Zen, 2 ondas vencidas, muralhas com +25% de vida).
- Reparo: investido × fração perdida × 0,5, mínimo 1 Zen. Reconstruir: investido × 0,8. Remover devolve 50% do investido, na proporção da vida que resta; estrutura destruída não devolve nada (`BASTION`, `refundRate`).
- Derrota: a tentativa termina. "Recomeçar do zero" zera cidade, noites e heróis do modo; recordes e cartas ficam (`src/core/bastion/rules.ts`, `startAttempt`).
- Banco: 30% do Zen de cada bloco de 20 noites (`ARVORE_BANCO.bastiao`).
- Pacote de cartas a cada 100 ondas vencidas (`BASTION.packEvery`).

## 8. Saves

Jornada (`run`): versão atual **3**. O campo `sorteio` ({`estados`, `itens`}) guarda o estado de três fluxos de sorteio: `jornada` (loot, refino, eventos e presente da 1ª vitória), `loja` e `cofre` (o objeto "Vasculhar a carga"). **Loja e cofre não dividem sorteio** (decisão do dono, 2026-10-16): abrir o cofre não muda o estoque da loja, e a ordem das ações não muda o que cada um sorteia. Uma recarga continua cada sequência e não repete nem pula. `migrateRun` converte a v1 (cria os três a partir da seed, como a versão anterior fazia ao abrir) e a v2 (preserva o estado da jornada; loja e cofre começam da seed). O contador de ids é compartilhado: id é nome, não sorteio. `lerJornada` (`src/core/run/carregamento.ts`) decide o que fazer com o texto do save: nova, ok, migrada, versão futura, corrompida ou encerrada. Versão futura ou ilegível nunca é migrada nem apagada: vai para a lista de cópias `runBackup` antes de qualquer gravação nova. Se a cópia falhar, a jornada não grava por cima (`jornadaBloqueada`) e o jogo avisa.

Saves reais de versões antigas ficam em `tests/saves/` (geradas pelo código de cada versão). `npm run saves:check` prova que abrem, migram, mantêm a sequência após recarga e que o que o jogo não entende não é migrado à força.

Meta, Bastião e banco de Zen: sem mudança de formato nesta etapa. A árvore global continua no meta (`arvore`).

Cópias (`runBackup`): cada jornada que o jogo não entende (ilegível ou de versão nova) e o save v1 antes da migração entram numa lista que só cresce. Nenhuma cópia é apagada. Se a cópia falhar, a jornada não grava por cima e não credita o Zen, e o jogo avisa uma vez por sessão. No executável, a leitura devolve a cópia e o texto do principal mesmo quando ele não abre.

Limites conhecidos da migração (registrados, não corrigidos):
- Um save v1 não guardava a posição do sorteio. O primeiro sorteio depois da migração repete o conteúdo do primeiro sorteio de uma run nova com a mesma seed. Acontece uma vez por save v1.
- O contador de ids começa acima do maior id `it-<base36>` visível no save. Um item vendido antes da migração, com número acima do maior visível, pode voltar a ter o mesmo id. O save não guarda esse número.
- Contador acima de 1e9 é tratado como save editado: volta ao maior id visível.

## 9. Arte e assets

Regras 6, 7 e 8 do `CLAUDE.md`:
- Arquivos-fonte pesados (modelos originais, PSD, vídeos brutos) não entram no repositório. O jogo usa só versões otimizadas em `public/`. Fontes editáveis vão zipadas para a branch `fontes`.
- GLB novo: antes de qualquer outra coisa, `node scripts/otimizar_glb.mjs`, depois ligar o conjunto de clipes do jogo (`clips` em `src/config/visualConfig.ts`). Conferir cor, tamanho e fluidez no navegador. Auditoria: `node scripts/auditar_glb.cjs arquivo.glb`.
- Chão, água e texturas: arte do dono em WebP, ou WebP gerado offline por script (ex.: `scripts/gerarTexturasCenario.py`, em `public/textures/`). Nada de canvas criado em tempo de execução. Nada pode flutuar. Visual não altera a grade (`src/config/zones.ts`).

## 10. Testes

`npm run check` roda o build (`tsc --noEmit` e `vite build`) e todas as checagens do `package.json` (29 no total), em ordem alfabética, cada uma com timeout de 900 s. Opções: `npm run check:rapido` (sem o build) e `npm run check -- --so=<nome>` (uma etapa só). Fonte: `scripts/checkAll.ts`.

Grupos cobertos:
- Build: typecheck e build do Vite.
- Simulação e ritmo: `sim:check` (ponte e toda zona terminam, e a simulação é determinística) e `horda:check` (toda zona termina; noite vencida nasce o orçamento inteiro; duração dentro de ±15% do alvo).
- Último Bastião: `bastion:check` (dados, estado, colocação, custos, projetos, ondas e simulação) e `bastion:path` (caminho da horda com as estruturas).
- Banco de Zen: `banco:check` (migração do save e contador de Zen da jornada).
- Árvore Global: `arvore:check` (desenho, custos e nós), `arvore:combate:check` (efeitos das Masteries), `arvore:save:check` (save v1 abre e vira v2) e `arvore:visual:check` (geometria da roda e ícones).
- Auras: `aura:check` (chance 0 e chance 1, no Bastião e na campanha).
- Cenário: `cenario:check` (conta primitivas sólidas no cenário da campanha).
- Vocações: `vocation:check` (dados, escolha, atributos e save) e `vocation:skills:check` (árvores de Crusado e Hypnomancer, 20 habilidades cada).
- Determinismo: `determinismo:check` (nenhum sorteio fora da semente no núcleo; a mesma semente dá a mesma jornada).
- Regras de carta: `cartas:check` e `cartas:regras:check` (efeitos na batalha). A linha de base da campanha sem cartas foi re-ancorada em `d2146067`, quando o palhaço entrou nos Campos Cinzentos de propósito.
- Sistemas da jornada: `sistemas:check`, `run:check` (economia), `eventos:check`, `sobrevivencia:check`, `zonas:alcance:check` (toda zona navegável), `editor:check` (integração do editor de mapas), `arena:habilidades:check`, `armas:check`, `runas:check`, `bruxa:check`, `agressao:check` e `foco:check`.
- Determinismo: `determinismo:check` roda a jornada e a batalha no padrão e no deserto (a tempestade de areia só existe no deserto, e cada batalha no deserto tem que ter tempestade). A varredura estática proíbe `Reflect`, que servia para contornar a checagem.
- Saves: `saves:check` (saves reais de 867ac0d e f3b5bd9 em `tests/saves/` abrem e migram; recarga não repete nem pula; entradas inválidas não são migradas à força; lista de cópias só cresce).
- Texto: `zen:texto:check` (nenhum "Zeni" visível; identificadores como `ganharZeni` não contam).

Fora do comando:
- `ui:fora-da-tela`: precisa de servidor de dev aberto (`npx vite --port 5561`) e de Chromium com Playwright.
- Verificação visual no navegador (screenshot do jogo rodando) não entra no comando. É obrigatória para mudança de UI ou visual (regra 5).

## 11. Dívida técnica conhecida

- Sistemas paralelos de efeito de magia: `src/config/fx/` (13 arquivos, entre eles `warlock.ts` e `warlockNew.ts`) e `src/render/fx/`.
- Duas árvores de habilidades: `src/core/progression/skills.ts` (árvore dos heróis) e `src/config/vocationSkills.ts` (árvores das vocações).
- `src/main.ts` grande: 2973 linhas, com textos de balanceamento misturados ao código. Quantidade exata de textos: a confirmar.
- UI reescrita por `innerHTML`: 57 usos em 22 arquivos de `src/ui/`.
- Arte mista: a arte do dono (WebP e GLB) convive com primitivas do three.js. `scripts/cenarioCheck.ts` ainda aceita 19 primitivas em `Scenery.ts` (tema `town`, que nenhuma fase usa).
- Ids de drop de combate (`src/core/sim/Simulation.ts`, `it-<tick>-<id>-<n>`): não passam pelo contador da run, e o contador de unidades recomeça em cada batalha. Podem repetir entre batalhas. A verificar com duas batalhas seguidas.
- Cópia do Bastião (`bastionBackup`): cada cópia nova sobrescreve a anterior. Só a lista da jornada (`runBackup`) acumula.
- Seed da batalha: `Simulation` usa `GAME_CONFIG.wave.seed` como padrão, um global que `applyZone` reescreve. A campanha passa a seed certa pela ordem das chamadas, mas nada no núcleo impõe isso.
- Pacote de cartas da vitória: `src/main.ts` sorteia com `Math.random`. A regra é do núcleo, mas a sorte vem da interface.

## 12. Decisões em aberto

1. Conta nova morre em 50 de 55 noites. Medido no modo literal: guerreiro de nível 1, sem build e sem equipamento. Com a party típica de cada ato, as 55 noites vencem. É balanceamento de combate, e a decisão é do dono (`LOG_SESSOES.md`, entrada de 2026-10-15).
2. Sobrevivência não medida: `horda:check` não mede o modo de sobrevivência (Bosque Torto, Dunas Vermelhas e Garganta de Ferrugem). Duração da noite de sobrevivência: a confirmar. `sobrevivencia:check` roda no `npm run check`, mas não mede a duração.
3. Ponto de árvore x Zen: já decidido em Zen do banco. O comentário de `src/config/arvoreGlobal.ts` diz que a moeda da árvore é o Zen do banco, e `LOG_SESSOES.md` (entrada "Árvore visual: refino") registra a decisão.
4. **Recarga repete os sorteios: resolvido (opção A).** A sequência de sorteios da jornada fica guardada no save (campo `sorteio`, versão 2), então a recarga continua de onde parou. Migração da v1 e cópia `runBackup` para saves não entendidos. Ver a seção 8 e `LOG_SESSOES.md` (entrada de 2026-10-16, opção A). Decisão do dono.
