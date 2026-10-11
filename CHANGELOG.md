# CHANGELOG

Histórico conciso (gameplay, arquitetura, sistemas maiores). Sem código.

## 2026-10-11 — v0.8e
- Projétil do Necromante (inimigo) refeito: orbe de sombra com cerca de 0,8 tile de diâmetro (antes eram partículas miúdas), com halo pulsando, anel rúnico girando, rastro em fita e impacto com onda de choque roxa. Voo de 7 tiles por segundo, com o dano adiado até a batida.
- A Bruxa da party continua com o orbe pequeno de antes.
- Dano de magia inimiga que acerta herói aparece em roxo, com o valor. Dano corpo a corpo segue vermelho.
- Biblioteca de texturas: 47 texturas da folha 23 (terreno e grama, caminhos, água, pedras, madeira, muro, telhados e pisos) em `public/textures/biblioteca/`, com `catalogo.json`.
- Folhas de referência 21, 22 e 23 guardadas em `referencias/texturas/` (fora de `public/`, não entram no `.exe`).
- Números do efeito em `src/config/fx/enemyShadow.ts`. Grade, dano, alcance e recarga não mudaram.

## 2026-10-11 — v0.8d
- Pacote packtextura removido (peças GLB e texturas de pedra e grama): o dono achou as texturas horríveis. Nada da ponte nem da floresta depende mais dele.
- Árvores da floresta refeitas: tronco com casca e copa de folhas, com as texturas de casca, musgo, bétula e folha do dono. Cinco variações, uma de outono. Antes eram as peças antigas, com cara de bolinhas.
- Rochas, arbustos, troncos caídos e ruínas da floresta e da ponte refeitos com as pedras e folhas do dono. Cada peça tem sombra na base, para não flutuar.
- Deserto (Dunas Vermelhas, Ruínas Solares): chão de areia em camadas com as texturas do dono (dunas fora do tabuleiro, ondulações, areia rachada, pedrinhas perto das pedras, areia avermelhada, trilha batida até o portão). O canvas saiu do deserto. As rochas e as cristas do fundo agora são de arenito do dono.
- Oásis do deserto com margem úmida e água, pelo mesmo método do lago da floresta.
- Ponte: deque, praça e doca com as pedras do dono. A praça tem pedra cinza, para não avermelhar com as lanternas à noite.
- Texturas novas em `public/textures/arvores/`, `pedras/` e `deserto/`: 52 recortes de duas folhas de referência, emendados e com a iluminação das bordas corrigida.
- Código: `naturKit.ts` (peças), `groundLayers.ts` e `groundMath.ts` (base comum dos chãos), `desertGround.ts` (deserto). `forestGround.ts` mantém o comportamento. Grade e simulação não mudaram.
- Montagem da batalha (teste no navegador, sem GPU): floresta na mesma faixa de antes (113 a 145 ms). Deserto mais lento: Dunas Vermelhas de 137 para 164 ms, Ruínas Solares de 89 para 130 ms, por causa do chão em camadas. Ponte: 39 ms.
- Pendente: os recortes têm 95 a 150 px, então de perto a nitidez é limitada. Pedir ao dono as folhas originais em 512 px ou mais. Objetos das folhas (flores, cogumelos, tocos, cactos, ossos) ainda não viraram peças.

## 2026-10-11 — v0.8c
- Lago da floresta refeito: era um quadrado azul flutuando sobre a grama. Agora tem margem de terra molhada, anel de água rasa, centro fundo, contorno irregular, ondas que deslizam devagar e pedras e arbustos na borda.
- Poças: os discos azuis eram desenhados acima do chão (flutuavam). Agora são lama no próprio chão, com um pouco de água parada no centro.
- Chão da floresta montado em camadas com um só desfoque dos vazios e máscaras de 4 px por tile: no teste, montar a cena do Bosque Torto caiu de cerca de 820 ms (v0.8b) para cerca de 200 ms.
- Módulo novo `src/render/scenery/forestGround.ts` (chão, lago e poças); `packKit.ts` fica só com o kit de peças e texturas.
- Números do lago e das poças em `POND_VISUAL` (`visualConfig.ts`): cores, transparência e velocidade das ondas.
- Texturas novas da folha do dono: água funda e rasa (`public/textures/floresta/`).
- Pendente: de perto, as poças pequenas ainda ficam escuras demais. Árvores e rochas do kit continuam simples.

## 2026-10-11 — v0.8b
- Chão da floresta refeito com as texturas da folha do dono (grama, grama florida, terra e pedra, recortadas e emendadas em `public/textures/floresta/`). Antes era pintado num canvas de 16 pixels por tile, o que deixava tudo borrado de perto.
- Chão em camadas (`packForestGround` em `packKit.ts`): cada camada é um plano com a textura nítida e uma máscara suave que decide onde ela aparece. Trilhas de terra com borda irregular, sombra sob as copas e rochas, poças e pedra no portão.
- Removidas `Grass_Shadow` e `Dirt_Trail` do kit `packtextura` (não são mais usadas).
- Pendente: as árvores (do kit) e as rochas continuam simples. A folha tem flores, cogumelos e tocos que podem virar decalques no chão numa próxima rodada, e texturas originais em resolução maior dariam mais nitidez de perto.

## 2026-10-10 — v0.8a
- Florestas (tema `forest`: Bosque Torto, Floresta dos Sussurros, Clareira do Corvo, Vale das Raízes) com o kit packtextura: chão pintado com grama, sombra sob as copas, trilha de terra da entrada até o portão, raízes e poças. Árvores, rochas, troncos e arbustos do pacote, desenhados instanciados.
- Ponte de Valdrec: deque e praça com a pedra azul e os paralelepípedos do pacote, com mapa de normais (relevo sob a luz). Ruínas e pedras dentro do rio, em tiles de água: não andam nem bloqueiam nada.
- Grade, caminhos e regras não mudaram; só a apresentação. Módulo novo `src/render/scenery/packKit.ts` (carrega o GLB do kit, as texturas e o chão pintado).
- Assets: `public/models/packtextura/` (GLB de peças) e `public/textures/packtextura/` (cores em WebP e os mapas de normais da pedra).
- Removidas `bridgeDeckTexture` e `plazaTexture` (sem uso).
- Pendente: ainda não está no nível AAA. As árvores são estilizadas e pouco variadas; falta variação de cor nas copas, mais detalhe no chão da floresta (sem mapa de normais) e iluminação de cena. A ponte segue escura à noite, com poucos pontos de interesse dentro do enquadramento.

## 2026-10-10 — v0.7h
- Aura dos chefes refeita: o casco deixa de recortar em labaredas secas e vira um halo suave na silhueta, com fiapos animados (ruído) e miolo na cor da magia (HDR, brilha no bloom). Chefes ganham um anel de energia no chão que gira e respira.
- Números da aura em `AURA_VISUAL` (`visualConfig.ts`).
- Krexx retorcido (Orc Warlord): sai do caminho de esqueleto automático e passa a usar o mesmo caminho do líder goblin (esqueleto do arquivo, clipes do guerreiro).
- GLB com matrizes de bind inversas zeradas (caso do Krexx) recebem as matrizes pela pose de descanso. GLB sem normais ganham normais lisas por posição (sem lascas). Pesos de pele que não somam 1 são normalizados.
- Pendente: o Krexx retorcido ainda se deforma nas animações (braços abertos, em T), o que pede revisão do rig. A aura melhorou, mas precisa de nova rodada de ajuste com a cena em movimento.

## 2026-10-10 — v0.7g
- Verso das cartas volta a mostrar o logo do ROguard (`emblem.png`), no lugar do recorte da arte de referência que trazia o texto "Aurenthal".
- Removido `public/cards/brasao_dragao.webp`, que deixou de ser usado.

## 2026-10-10 — v0.7f
- Cartas com a nova estética: o verso já mostra a raridade antes de revelar. Normal dourada e parada; Mini-Boss com borda azul pulsando; MVP com borda vermelha pulsando e brasão com brilho de fogo.
- Brilho só nas raras: a carta normal não brilha em azul nem em vermelho.
- Verso com o brasão do dragão (recorte da arte de referência, `public/cards/brasao_dragao.webp`).
- Moldura da frente com ornamentos em SVG (pontas e gemas na cor da raridade).
- Cores: azul para Mini-Boss, vermelho para MVP (antes roxo e dourado).
- Pendente: a arte dos monstros continua a mesma (só a moldura e o verso mudaram); ornamentos mais detalhados que a referência.

## 2026-10-10 — v0.7e
- Muralha do Guerreiro refeita com o kit de castelo do dono (`fortress.glb`, em `public/models/`). Cada bloco é um trecho do muro reto de 2 m, reduzido a 1 tile, orientado conforme a linha (horizontal ou vertical). Quebrado, troca pela barricada danificada do mesmo kit.
- O kit é estático (sem esqueleto e sem animação, cor por vértice, 2 mil vértices): auditoria sem problemas de tamanho (0,14 MB).
- Os anéis de energia, rachaduras e cristais da subida continuam por código.
- Pendente: o trecho de 2 m reduzido a 1 tile fica comprimido (merlões finos); a barricada quebrada lê como cerca de madeira, não como muro desmontado. Avaliar trecho de 2 tiles e escombro de pedra do kit.

## 2026-10-10 — v0.7d
- Arte em PNG saiu das duas habilidades. Ápice Sombrio (Bruxa) e Muralha (Guerreiro) são agora geometria e textura desenhadas por código, no estilo da referência (energia azul, cristais, lascas de pedra e poça de veneno).
- Ápice: poça de veneno com núcleo escuro, anel de runas girando, espinhos de energia que sobem em volta e cristais violeta na cintura. Converge para o peito no fim, como antes.
- Muralha: cada bloco é de pedra com friso dourado, pilares com pontas e bandeira azul. Ao brotar, dois anéis de energia azul se expandem, rachaduras de luz aparecem no chão e pedras de cantaria e cristais azuis saem pela borda. Quebrada, vira monte de pedras.
- Pendente: sombra de contato e variação de peças na linha da muralha; brilho mais forte nos espinhos do Ápice.

## 2026-10-10 — v0.7c
- Ápice Sombrio (buff da Bruxa) refeito com a arte do dono (folha de magia negra). Abertura: um círculo de veneno se forma no chão em oito quadros; depois o círculo cheio, a névoa e o anel de runas ficam embaixo dela, espinhos sobem em volta, faces espectrais e pedras orbitam a cintura. No fim, tudo converge para o peito e some.
- Só visual: o buff continua sendo o mesmo (dano próprio da Bruxa, mesmos números). A folha de referência pinta área de veneno com dano e lentidão nos inimigos; isso ainda não existe no jogo e depende de decisão do dono.
- Efeitos de chão com máscara radial: a arte não mostra mais a borda retangular da folha.
- Sprites novas em `public/sprites/bruxa/apice/`. Os planos do chão (`flatPlane`) aceitam tinta e máscara próprias, e as sprites de pé podem ancorar na base.

## 2026-10-10 — v0.7b
- Pacote de cartas com abertura interativa (estilo Hearthstone): o pacote fica selado, o jogador arrasta o topo (ou toca) para rasgar, as cinco cartas saem viradas para baixo e são reveladas uma a uma, ou todas de uma vez.
- Cada raridade tem a sua reação: Normal com brilho e moeda; Mini-Boss com aura roxa e faíscas; MVP com clarão, raios, faíscas douradas e a faixa "VOCÊ ENCONTROU ...". A MVP sai por último.
- Cartas recortadas direito: a arte traz moldura e faixa do nome pintadas, e a interface agora corta isso e desenha a moldura e o nome iguais em todas as cartas (a janela de recorte fica em `CARD_ART_WINDOW`).
- A coleção e as cartas equipadas também usam a arte recortada (antes a arte inteira era esmagada num quadrado).
- Sons da abertura: rasgo, moeda (Normal), gota (Mini-Boss) e fanfarra (MVP).
- Checagem nova (cardCheck): ordem de revelação e janela de recorte.

## 2026-10-10 — v0.7a
- Bongun (necromante) flutua de verdade: o corpo sobe e desce 9 cm em torno da altura-base a cada 2,6 s (antes era um balanço de 1 cm, quase imperceptível, em posição fixa). A sombra de contato encolhe e clareia quando ele sobe e volta ao normal quando desce.
- O balanço vem da unidade (`float` no registro dos modelos), então vale também nas ações no ar (golpe, conjuração, dano).
- Balanço das juntas em 32 quadros por ciclo, sem facetas.

## 2026-10-10 — v0.6z
- Magias prontas disparam no seu tick, sem prioridade entre elas. Antes, cada classe escolhia uma magia por tick pela ordem da IA e as demais esperavam; agora duas ou mais prontas no mesmo tick saem juntas, com uma só animação de conjuração e os efeitos de todas.
- Vale para as seis classes. Exceção: o golpe corpo a corpo do Guerreiro continua um por vez (a animação e a posição dependem dele); as magias runicas e os buffs dele disparam em paralelo.
- Ordem dos slots: o automático segue a ordem em que as habilidades foram aprendidas. Antes, a ordem da árvore dava prioridade a algumas magias. O número do slot não decide mais quem dispara.
- Indicador de prontidão no HUD: a habilidade sai escura logo depois de conjurar e clareia conforme a recarga termina; quando fica pronta, um brilho passa uma vez e o contorno acende.
- Equilíbrio: o combate padrão mudou para mais e para menos (algumas fases ficaram mais fáceis, outras mais difíceis). A regra é nova; os números de dano e recarga não mudaram. Ajustar pelo balance.ts se algo ficar fora do esperado.
- Checagem nova (warlockCheck, item 11): duas magias prontas no mesmo tick, cada uma com a sua recarga.

## 2026-10-10 — v0.6y
- Líder goblin: novo mini-chefe (modelo do dono, `goblin leader.glb`, 67 MB), otimizado para 2,5 MB (49 mil vértices, 40 mil triângulos, textura WebP de 1024 px). Altura de 2,8 m, aura âmbar.
- Aparece na entrada do Ato II (Vale das Raízes): a opção de elite desse nó é o líder. Tem 130 de vida, bate 10 e conta como chefe (drop garantido, sobe o nível da party).
- Animações: o conjunto do guerreiro, com a pose de descanso do arquivo (`bind: 'ibm'`). O conjunto do cultista achatou a figura na vitrine. Sem recolor: a cor do modelo original vale em todas as zonas.
- Pendências: o arquivo tem 17% dos vértices presos a ossos distantes (aceitável, abaixo do alerta de 20%); a cena dentro do jogo ainda não foi capturada, só a vitrine.

## 2026-10-10 — v0.6x
- Raydric: novo inimigo pesado de pedra e cristal (modelo do dono, `raydric.glb`, 65 MB), otimizado para 2,5 MB (48 mil vértices, 39 mil triângulos, textura WebP de 1024 px).
- Aparece nas misturas pesadas das ruínas do Ato II (Dunas Vermelhas e Ruínas Solares) e das Cinzas (Pico das Cinzas). Tem 110 de vida, anda mais devagar que o brutamonte e bate um pouco mais forte.
- Altura de 2,3 m; cores por zona (deserto, gelo, grama e sombra), na mesma regra do dino.
- Animações: o conjunto do guerreiro, com a pose de descanso do arquivo (`bind: 'ibm'`). O conjunto do cultista deixou a figura amassada no teste.
- Pendências: o golpe usa a animação de espada do guerreiro; a cor original de pedra não entra em nenhuma zona.

## 2026-10-10 — v0.6w
- Bruxa: modelo novo do dono (`bruxa.glb`, 62 MB) otimizado para 2,3 MB (47 mil vértices, 39 mil triângulos, textura WebP de 1024 px). Continua no mesmo registro `warlock`.
- Animações: como na feiticeira, o arquivo traz uma única animação travada (em degrau), então a bruxa usa o conjunto de clipes do guerreiro com a pose de descanso do arquivo (`bind: 'ibm'`). O conjunto do cultista deixou a figura achatada no teste.
- As sete animações do modelo antigo da bruxa saem junto com o arquivo antigo.
- Pele sem redistribuição por proximidade (a versão redistribuída deformou braços e cabelo no teste).
- Pendências: o golpe usa a animação de espada do guerreiro, e as bordas do cabelo e da capa aparecem levemente serrilhadas em movimento.

## 2026-10-10 — v0.6v
- Feiticeira: modelo novo da maga (`maga.glb`, 61 MB) otimizado para 2,3 MB (47 mil vértices, 39 mil triângulos, textura WebP de 1024 px). Continua no mesmo registro `sorcerer`.
- Animações: o arquivo trazia uma única animação travada (em degrau), então a feiticeira usa o conjunto de clipes do guerreiro, que serve ao mesmo esqueleto Mixamo de 61 ossos, com a pose de descanso do arquivo (`bind: 'ibm'`). O conjunto do cultista deixava a figura achatada no teste.
- A pele foi testada com a redistribuição de pesos por proximidade e sem ela: a versão sem redistribuição ficou com a silhueta e o cajado intactos, então foi a escolhida.
- Pendências: o golpe usa a animação de espada do guerreiro (o cajado não é balançado de verdade) e as bordas da capa ainda aparecem levemente serrilhadas em movimento.

## 2026-10-10 — v0.6u
- Cavaleiro Rúnico (teste): cinco habilidades novas do Guerreiro, fora da árvore e liberadas pelo debug e pela Dev Lab. Lâmina Encantada (golpes ganham dano mágico por 5 minutos), Onda Sônica (alvo de 3 a 5 casas), Limite da Morte (marca o inimigo, que recebe mais dano e devolve parte ao herói; não funciona em chefes), Cem Lanças (exige lança) e Cortador de Vento (giro em volta do herói; com lança, alcance maior).
- Efeitos visuais das cinco, com a paleta da arte de referência. Números em `src/config/fx/warriorRunic.ts`; verificados na vitrine de efeitos.
- Checagem sem janela das cinco habilidades: `npx tsx scripts/runicCheck.ts` (7 itens).
- Dinos com cor por zona: gelo azul e branco, deserto amarelo e vermelho, grama verde. O mini-chefe dino entrou como opção de elite nas Dunas Vermelhas.
- Seleção de personagem: o Guerreiro ganha um mini clipe em loop no lugar do chibi parado (aparece quando o arquivo existe em `public/clips/`).
- Regra para GLB novo: cor, animações, tamanho e fluidez antes de entrar (`scripts/auditar_glb.cjs`, `scripts/otimizar_glb.mjs`). A bruxinha não entrou no jogo: a rigagem do arquivo prende a malha à cabeça; o original está na branch `fontes`.
- Pendências: a Onda Sônica só dispara a partir de 3 casas e, com o movimento de combate, costuma sair a 4 e 5; as habilidades rúnicas ficam fora dos slots de Mana até a transformação.

## 2026-10-10 — v0.6t
- Dino (`public/models/dino.glb`): modelo novo otimizado de 62 MB para 2,7 MB (malha de 330 mil para 56 mil vértices, textura de 8192 px para WebP de 1024 px, animação embutida e influências extras removidas). Pés no chão e pose de descanso do próprio arquivo (matrizes de bind).
- Dino com os movimentos do cultista (parado, andar, ataque, dano e morte), pelo mesmo conjunto da UAL que o bongun usa. O andar fica discreto, porque o conjunto foi feito para corpos humanoides.
- Registrado em `MONSTER_MODELS` como `dino`, mas ainda não aparece no jogo: falta decidir em qual ato e função ele entra (`ACT_MONSTERS`).
- Nenhuma regra de combate mudou.

## 2026-10-10 — v0.6s
- Subida de nível refeita com a arte de referência "LEVEL UP": um feixe de luz com a base em anel sobe do chão, as asas se abrem atrás do herói, um círculo de runas gira no chão e uma auréola aparece sobre a cabeça. Na explosão há clarão, raios e faíscas; penas e brilhos caem depois.
- Cada classe sobe na sua cor (a cor de destaque do herói): Guerreiro laranja-avermelhado, Mago azul, Arqueira verde, Feiticeira roxa, Bruxa rosa e Assassino dourado. O texto NÍVEL também sai nessa cor.
- Os desenhos são recortes da própria arte de referência (`public/fx/levelup/`, feitos por `scripts/build_levelup_fx.py`). O anjo desenhado em código saiu.
- Números em `src/config/fx/levelup.ts`; a cor de cada classe vem de `src/config/heroes.ts`.
- Vitrine: uma subida de nível por classe.
- Limite: os recortes da referência são pequenos (cerca de 50 a 130 px no original), então ampliados ficam um pouco macios. Uma folha em resolução maior melhora o resultado sem mudar o código.

## 2026-10-10 — v0.6r
- Subida de nível: explosão divina. Primeiro, um anel de luz no chão e uma coluna dourada; depois um anjo branco se mostra acima do herói, bate as asas e some subindo em luz. A explosão solta raios e faíscas, e penas douradas caem sobre o herói. O texto NÍVEL continua.
- Feiticeira (arcana): Orbe Arcano (ataque básico), Meteoro (runa no chão, queda com rastro, cratera), Corrente Elétrica (elos entre os inimigos) e acerto crítico; com nível 5, a corrente tem mais elos.
- Bruxa (sombra): Dreno de Vida (ataque básico leve; a alma volta ao conjurador), Maldição (sigilo que se fecha sobre a área e marca os inimigos a cada pulso) e Enxame de Sombras (sombras que orbitam e mergulham nos alvos).
- Combustão (passivo do Mago): o fogo estoura no tile atingido, com anel de runas e brasas.
- Meteoro da Feiticeira: os inimigos da área reagem quando o meteoro cai, e não no disparo. O evento passa a levar o autor; nenhuma regra mudou.
- Números em `src/config/fx/` (feiticeira, bruxa, subida de nível, combustão).
- Pendências: a Barreira de Fogo ainda usa o efeito antigo; a aura do modelo da Bruxa clareia o contorno durante a conjuração; o bloom ainda tinge de dourado personagens de roupa escura em impactos brilhantes.

## 2026-10-10 — v0.6q
- Efeitos de combate por classe: ataques básicos e habilidades do Mago, do Guerreiro, da Arqueira e do Assassino ganham composição própria (preparação, disparo, impacto e dissipação), com identidade pela forma e pelo movimento, não por cor.
- Ataques básicos leves (um risco e um impacto pequeno); críticos com efeito completo (Golpe Furtivo crítico, flecha dourada com estrela).
- Mago: Raio Gélido (orbe de gelo), Cura Divina (coluna dourada), Escudo Sagrado (cúpula), Santuário (runas no chão), Bênção, Julgamento Divino (cruz de colunas de luz), Tempestade Elétrica (raios cintilantes), Nova Congelante (anel de gelo).
- Guerreiro: Investida (lâmina leve), Golpe em Área (varredura do cone e poeira), Onda de Choque, Fúria (chamas e runas), Provocar (pulso e marcas) e Muralha (pedras saindo do chão).
- Arqueira: flecha leve e crítica, Chuva de Flechas e Chuva Incendiária, Flecha Perfurante, Foco do Caçador e as quatro armadilhas (Armadilha, Mina, Congelante, Claymore), cada uma com o próprio disparo.
- Assassino: Leque de Lâminas e Execução (sombra, lâmina que cai e selo no chão).
- Arquitetura: `src/render/fx/combat/` (despachante por classe e contexto de efeitos), `src/render/fx/kit/Shapes.ts` (peças compartilhadas) e números em `src/config/fx/`. Eventos ganham só campos de apresentação (`bash.crit`, `storm.ability`, `rain.fire`); nenhuma regra de combate mudou.
- Dev: `fxshowcase.html`, vitrine que roda cada habilidade com a classe e os inimigos reais, passo fixo.
- Conhecido: o brilho (bloom) ainda tinge de dourado a silhueta de personagens de roupa escura durante impactos brilhantes. A luz de vários efeitos antigos (investida, golpe em área, raio, barreira, nova) nunca acendeu, porque a intensidade é zero na criação; decisão pendente.

## 2026-10-09 — v0.6p
- Golpe Furtivo, ajuste de qualidade: a investida agora dura cerca de 0,18 s (antes era quase instantânea); o golpe cai em 0,30 s (`VISUAL_CONFIG.strike`).
- Corrigido o brilho amarelo que tomava o assassino: a luz do efeito foi reduzida e posicionada longe do corpo, e os riscos da investida saem da frente da mão.
- Névoa do impacto contida: flash, estrela, anel de choque e poça de energia ficaram menores e menos intensos.
- Espiral da carga menor e mais transparente, para não cobrir o assassino; aberração de cor reduzida no impacto.
- Dev: `fxlab.html?nofx=1` e `?nolight=1` para isolar a origem de tons e halos.

## 2026-10-09 — v0.6o
- Golpe Furtivo do Assassino com efeito próprio em quatro fases (`src/render/fx/StrikeFX.ts`): carga (energia violeta converge para a mão, runas no chão, fumaça escura girando), investida (fita violeta e branca, riscos de velocidade, rastro de sombra), impacto (arco de corte crescente com contorno escuro, estrela, flash, lâminas espectrais que voltam ao alvo, anel de choque, faíscas radiais, tremor, aberração e hit-stop) e dissipação (poça de energia no chão, fumaça e brasas). O alvo reage no instante do impacto (`VISUAL_CONFIG.strike`).
- Texturas de efeito carregam no início do jogo (antes, o primeiro uso de cada uma desenhava um quadro vazio).
- Dev: `fxlab.html` (lab de efeitos com o Stage e o kit reais) e `window.__vg.closeMenu()` para testes de batalha.
- Limitações: o pós-processamento ainda não tem distorção espacial de verdade (usa aberração de cor); as texturas são estáticas (sem flipbook de impacto).

## 2026-10-09 — v0.6n
- Espada do Guerreiro: a configuração de jogo agora põe o punho no centro da palma (antes ficava atrás do pulso, e a lâmina parecia atravessar a mão) e inclina a lâmina para a frente (-120°), em vez de descê-la colada na coxa.
- Limitação conhecida: o modelo simplificado quase não dobra os dedos (a luva se mexe pouco), então a pegada depende do ângulo e da posição da espada. Dedos de verdade pedem um modelo com os dedos preservados.
- Bancada: `&lx=` desloca a câmera horizontalmente (para close-ups da mão); `&weapons=tipo:osso:graus:y:z` aceita posição Z.

## 2026-10-09 — v0.6m
- Ícones de habilidade: os 51 da folha "Pacote 01" (Mago 14, Guerreiro 9, Arqueira 13, Feiticeira 5, Bruxa 5, Assassino 5) substituem os antigos. Recortados por `scripts/build_skill_icons.py` em `public/icons/skills/pacote-01/`; o mapa `SKILL_ART` aponta para eles. Os ícones antigos continuam em `public/icons/skills` como reserva.

## 2026-10-09 — v0.6l
- Ícones de equipamento novos: a folha do dono (14 tipos × 6 raridades) foi recortada por `scripts/build_item_art.py` e virou `public/sprites/item_art.webp`. Espada, machado, cajado, arco, adaga, livro, peitoral, capa, elmo, anel, brinco, amuleto, cinto e botas agora usam a arte nova; a moldura colorida continua vindo do código.
- Escudo, talismã, lança, túnica, colete e bracelete ainda não têm arte nova: continuam com a arte antiga (`public/sprites/item_icons.png`, reduzido a esses seis tipos).

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
