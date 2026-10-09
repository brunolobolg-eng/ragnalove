# CHANGELOG

Histórico conciso (gameplay, arquitetura, sistemas maiores). Sem código.

## 2026-10-09 — v0.6k
- Guerreiro: as animações de parado, andar, dano, habilidade e morte agora vêm de captura de movimento real (UAL), copiada por direção de cada membro para o rig do modelo. Antes eram poses desenhadas à mão, que pareciam de boneco.
- Golpe e investida: tronco, pernas e escudo vêm da captura; o braço da espada segue uma linha de tempo própria (corte horizontal e espada por cima da cabeça).
- Espada: o punho agora fica no centro da palma (antes ficava atrás do pulso) e os dedos fecham em volta do cabo.
- Tamanho: o guerreiro passou de ~3,9 para ~1,9 de altura, igual aos outros heróis. A escala usava só a metade de cima do modelo, por causa do ajuste de bind.
- Ferramentas: `scripts/buildMocapRefDirs.cjs` gera a tabela de direções de referência; a bancada tem `&sheet=` (folha de contato) e a medida de altura renderizada.

## 2026-10-09 — v0.6j
- Animações novas do Guerreiro, feitas por direção de membro (cada braço e perna aponta para um lugar do corpo, e o pé fica no chão em cada quadro): parado com respiração e olhar, andar com passada e giro de tronco, golpe de espada em corte horizontal, investida pesada com espada por cima da cabeça, grito/escudo erguido (habilidades de apoio), dano com recuo e queda de costas.
- A postura de guarda com escudo à frente e espada erguida agora vem da própria animação, não de um ajuste fixo no descanso.
- Bancada de desempenho: `?kind=warrior&sheet=walk` mostra uma folha de contato do clipe (oito instantes lado a lado); `&at=1.1` congela o clipe num instante.

## 2026-10-09 — v0.6i
- Guerreiro novo (`guerreiro.glb`, de 67 MB para 2,4 MB): substitui o `eliana.glb`. Textura 1024 px dentro do arquivo, mesmo esqueleto Mixamo de 61 ossos. O arquivo original sai do repositório (continua no histórico da `main`).
- Guerreiro com espada na mão direita (lâmina para cima) e escudo na esquerda, na postura de guarda (braços descidos).
- Animação do guerreiro: repouso com balanço suave, golpe, dano e morte pelo mesmo sistema de flutuação dos demais (com pés no chão). Os clipes UAL, do jeito que estavam, desmontavam o modelo porque o descanso do guerreiro é em T-pose.
- Correção: o descanso vindo das matrizes de bind do arquivo deixava o quadril na origem e as pernas abaixo do chão; agora o esqueleto sobe para os pés tocarem o chão.
- Pendente: versão de 19 mil triângulos (hoje 38 mil) precisa de simplificação que respeite as costuras de textura, senão a textura embaralha.

## 2026-10-09 — v0.6h
- Armas novas no módulo de armas (espada longa, espada de duas mãos e escudo redondo com aro de aço e emblema), prontas para prender em qualquer herói. Ainda não estão ligadas a nenhum herói: o guerreiro atual já traz espada e escudo no próprio modelo.
- Bancada de desempenho aceita armas de teste (`?weapons=sword:hand.R,shield:hand.L`) para conferir o visual.

## 2026-10-08 — v0.6g
- Todos os biomas refeitos com kit próprio de ambientação (`src/render/scenery/biomeKits.ts`): cada mapa tem as suas pedras, cordilheira, acampamento, cor de sombra, luz quente e névoa. Nada de geleira fora da neve.
- Floresta: musgo nas pedras, faixa de árvores grandes no fundo e nas laterais, acampamento de caçadores, névoa verde-cinza.
- Campos: pedras de campo em tom de terra, colinas verdes ao fundo, carroças e feno, sol baixo de fim de tarde.
- Deserto: arenito nas paredes, mesas de pedra e torres em ruína, cactos, acampamento nômade, sombras duras e rajadas de areia.
- Cinzas: basalto escuro, serra vulcânica com torre queimada, acampamento em ruínas, luz de trás pela fumaça.
- Sol e sombra por ambientação (floresta filtrada, campos dourados, deserto duro, cinzas contraluz, ponte e vila noturnas e de pôr do sol).
- Trilha da horda: terra gasta contínua (sem moedinhas), exceto na neve.
- Sombras de contato, luz quente e névoa agora são de cada bioma, não mais só da neve.

## 2026-10-08 — v0.6f
- Mapa de neve: os blocos bege de muro (tiles `#`, ao lado do portão) viraram afloramentos de rocha com geada, parte da cordilheira. O tile continua bloqueado no jogo; só o visual mudou.

## 2026-10-08 — v0.6e
- Mapa de neve, cordilheira: grupos de rochas altas em fileira atrás do mapa, uma segunda fileira de picos mais altos com duas torres de vigia da castle, e encostas de rochas nos dois lados, com um vale livre entre o mapa e as serras.
- Acampamentos nos flancos (barraca, fogueira acesa, barril, caixa, carroça, bandeira, cama de palha e placa), visíveis ao afastar a câmera. Não aparecem na vista padrão, que enquadra só o tabuleiro.
- Menos pedrinhas soltas no chão (eram centenas, pareciam moedinhas).

## 2026-10-08 — v0.6d
- Mapa de neve, projeto de luz: sol frio e baixo (sombras longas que desenham o relevo), luz de preenchimento mais fraca e base da neve mais fria, para o contraste de luz e sombra aparecer. Sombras de contato embaixo de cada peça. Poças de luz quente tremeluzindo nas lanternas e fogueiras. Névoa baixa deslizando devagar. Paredes da cordilheira maiores e mais baixas, com rochas da pasta town. Trilha com neve pisoteada mais suave e menos pedrinhas no chão.
- Visualização: o mapa agora é conferido pelo caminho normal do jogo (com HUD e pós-processamento), não só pelo render direto.

## 2026-10-08 — v0.6c
- Mapa de neve (Garganta de Ferrugem), primeira etapa do visual: rochas, árvores e acampamentos vindos dos pacotes de cenário (castle, nature, survival, town) em vez das pedras procedurais, desenhados em instâncias com geada. Chão com acúmulos de neve e rajadas de vento. Poças viram gelo. A trilha da horda vira neve pisoteada. Lanternas e fogueiras com brilho quente. Barris, tendas, toras e rodas que pareciam discos escuros saíram do conjunto.
- Ainda não é o acabamento final: as paredes de rocha continuam densas e a luz ainda é chapada. Próxima etapa, se aprovada: luz e sombras do cenário e variação das paredes.

## 2026-10-08 — v0.6b
- Assassino com tema de sombra e veneno: a Execução deixa um rastro roxo com fumaça escura até o alvo; o Leque de Lâminas solta um arco roxo com fumaça de sombra; o Golpe Furtivo ganha fumaça no impacto.
- Veneno visível: inimigo envenenado solta névoa escura com fagulhas esverdeadas enquanto o veneno dura (só visual, lê a simulação).

## 2026-10-08 — v0.6a
- Bongun: corpo não sobe mais no ar durante golpe, dano e morte. O clipe do cultista dobrava a coluna e levantava as pernas (no bongun as coxas são filhas da coluna); agora coluna base, quadril e pernas ficam na pose de descanso nessas ações, e o tronco de cima, a cabeça e os braços continuam animados.
- Bongun com vida em repouso: respiração no peito, olhar que varre e braços que balançam de leve (loop suave), sem perder a flutuação.
- Guerreiro: tufão de vento discreto em cada golpe (arco com fita e poeira girando), mais amplo no Golpe em Área e menor na Investida.
- Assassino: rastro fino em arco no golpe pelas costas.
- Ataques básicos dos heróis ~25% mais lentos (Investida, Golpe em Área, Flecha, Bola/Drenagem de Gelo, Orbe, Drenar, Estocada Pelas Costas): as recargas de Skill Haste dos equipamentos passam a pesar mais. Simulação continua determinística; a jornada de referência segue com as mesmas vitórias.

## 2026-10-08 — v0.5z
- Modelos com textura e sem cor por vértice (Bongun e o antigo cultista) apareciam pretos: o material pedia cores de vértice que o arquivo não tem. Agora as cores de vértice só são usadas quando o modelo as tem. Zumbis e heróis não mudam.

## 2026-10-08 — v0.5y
- Vitória da horda: novo cartão dourado (raios girando, brilho, placa azul-marinho com a borda do jogo e emblema de espada), no lugar do aviso "VITÓRIA". Título próprio de cada mapa (`VICTORY_TITLES` em visualConfig) e o nome da região embaixo. Derrota e chefe mantêm o aviso de antes.

## 2026-10-08 — v0.5x
- Necromante agora é o Bongun (modelo enviado pelo dono): 37 MB/490k triângulos -> 2 MB/18k, textura 3072 -> 1024 WebP. Não anda: flutua rente ao chão (`hover` na configuração do monstro, pose de descanso do próprio modelo, sem passos).
- Clipes do rig Mixamo (ataque/magia/dano/morte) rebasados para o descanso de cada modelo: o cultista não muda (identidade); o Bongun recebe a mesma animação sem pernas/pés tortos.
- Removido `cultist.glb` (substituído pelo Bongun).

## 2026-10-08 — v0.5w
- Performance (horde): enemy GLBs simplified (cultist 18 MB/490k tris → 1.6 MB/18k; Krexx/Senhor Orc-class 20 MB → 2.8 MB/36k; heroes Assassin/Archer 8 MB → ~3.5–4 MB). Originals archived in branch `fontes`.
- Horde units no longer cast projected shadows (only heroes and bosses); contact shadow kept. Shared geometry/materials for contact shadow and HP bars.
- Measured (headless bench, 40 units): triangles 6.5M → 0.70M per frame; draw calls unchanged (outline still doubles crowd draws — kept by design, see TODO).
- Graphics options cleaned: removed "Sprites 2D" (legacy 2D renderer, its frames and sprite meta), removed "Ultra" preset (saved "Ultra" falls back to "Alto"). Remaining: Qualidade (Baixo/Médio/Alto), partículas, tremor, bloom, cinematográfico, granulado, reduzir flashes, limite de FPS, V-Sync (desktop), mostrar FPS.
- Repo: Universal Animation Library originals and card source sheets (cards2–5, reliquias1) moved out of `main` into branch `fontes` (zipped, with LEIA-ME). Scripts that regenerate them need the zip extracted back.
- Dev only: `perfbench.html` (bancada de desempenho: `?n=40&shadows=1&outline=0&heroes=4`).

## 2026-10-08 — v0.5v
- Zombie/orc arm bind fix: sideways upper-arm segments (T-pose) froze elbows out under procedural clips; loader now hangs the segment (length kept) and derives inverses. Goblin/rat baked clips and Mixamo rigs untouched. New `armBindCheck`.

## 2026-10-07 — v0.5u
- Monster cards (permanent progression): 112-art catalog (`cards.ts`: Normal +3 / Mini-Boss +8 / MVP +12/+6, flexible affinity = half without); victory-only 5-pack (3N + 2× 90/5/5); fusion (3 same→different Normal, 10 Normals→Mini-Boss); slots 2/run to 20, +1 to 30; bonuses applied at `newRun` (next run onward). Collection UI on world map. No campaign impact (runCheck identical).

## 2026-10-06 — v0.5t
- Skill Testing Arena (só dev, F8): mapa de teste isolado com foto/restauração de perfil+run, boneco de treino (parado, HP alto, recompensa zero, remoção limpa), estatísticas de dano real por skill/alvo com DPS e histórico, presets de build, multiplicador de dano temporário. Sem impacto na campanha (runCheck idêntico).

## 2026-10-06 — v0.5r
- Skill tree gained automatic prerequisite path (`prereqPath`/`learnPath` + preview/button/highlight); branches never auto-chosen.
- Currency renamed from Zeni to Zen in all player-facing text (internal identifiers kept).
- Attributes rebalanced for impact (~+33–80% per 5 points above base); caps and identities preserved.
- Temple fixed: HUD party refresh after city revive, free revive no longer blocked, failure feedback corrected.
- Party join hardened: `unlockHero` clears dead flag (join alive invariant).

## 2026-10-06 — v0.5q
- Campaign rebalance: target run duration 60–80 min via enemy quantity/frequency/density (bridge 160, Act III 600; bosses 90–240 with pacing, not HP).
- Spawn: organic packs up to 10, scatter 3, N-portal engine, density governor (breathe at 35, hard cap 120).
- Economy: per-kill EXP/Zen/souls −30% then EXP −50%; level curve 1.35 → 1.6; city threat −60% (paired with bigger hordes); Act II/III hpMult 2.0→1.6, 3.8→3.2; boss attendants 0.7→0.55.
- Survival became true last-stand: center setup, all monsters hunt, gate irrelevant, `survivalBest` records (save-compatible), richer result screen.
- Scripts: caps raised for bigger waves; new `survivalCheck.ts`.

## 2026-10-06 — v0.5p
- Click-to-move order, smaller focus ranges, infiltrator never locks, pulsing aggression zone.

## 2026-10-06 — v0.5o
- Monster focus lock 60 ticks (6s) with leash/cap/re-pick; faster hordes (packs, intervals, counts).

## 2026-10-05 — v0.5n
- 10 new events (+ small fail on all), procedural art, `eventCheck`.

## 2026-10-05 — v0.5m
- City-gate funnel on all 12 entrances (7→5 tiles + wings, right side open for archer fire).

## 2026-10-05 — v0.5l / v0.5k
- Central `aggressionRange` (speed→distance, single source for AI + visual zone); contextual `CoachTips` tutorial.

## 2026-10-05 — v0.5j / v0.5i
- Aggression zone for selected hero only + star progression on portrait; Night Crossing as fixed pill twin of the city bar.
