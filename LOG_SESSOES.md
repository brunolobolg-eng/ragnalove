# LOG DE SESSÕES — ROguard / Vanguarda

Registro do que foi conversado e decidido com o dono, e do que ficou pendente.
O histórico técnico de cada versão está no `CHANGELOG.md`; o estado atual do projeto, no `VANGUARDA_CONTEXT.md`.

Cada entrega grande ganha uma entrada nova no fim: data, pedido do dono, decisões, pendências e commits.

## Pendências em aberto (resumo)
- **O Último Bastião (v0.11, em andamento):** fundação pronta e testada no core (sem tela, sem mapa próprio). Próxima etapa: mapa do Bastião com área de construção e portão. D1 (carteira própria), as cartas (D8), as muralhas, as classes, os pacotes, os slots (D9 a D12) e o modelo de slots por personagem (D13) foram definidos pelo dono. Ainda vale confirmar as pendências 9 a 12 do registro abaixo.
- **Álbum de cartas e dica da revelação (v0.10):** Feiticeira e Bruxa não têm ícone de classe na folha 32 (usam o retrato); cartas não têm nível no jogo (o "Nv." da imagem virou ×N); conferir no PC do dono o álbum com cartas reais e a dica do pacote.
- **Kit de interface nos menus (v0.9):** conferir visualmente no PC do dono o pacote de cartas e as configurações (não conferidos nesta rodada); a moldura do mítico é dourada porque a arte do vermelho está no miolo (decisão de arte); silhuetas de amuleto e anel saíram irregulares, e brinco e cinto não têm silhueta própria; a muralha do guerreiro não tem textura no arquivo do kit (decisão: textura própria ou a do cenário). Ranking do menu é arte da tela inicial, não foi trocado (v0.9).
- **Pacote de efeitos nas magias (v0.8g):** passivas e estados sem evento ficam sem efeito novo; desempenho precisa ser medido na GPU do dono; o 7z original espera permissão para ir à branch `fontes` (v0.8g).
- **Gelo e lava (folha 24):** texturas de 70 a 124 px. Para o chão ficar nítido de perto, pedir a folha em 512 px ou mais. Paredes, portões e torres dos três mapas ainda são as peças antigas (v0.8f).
- **Montagem do Cume das Cinzas:** subiu de cerca de 70 para cerca de 150 ms com o chão em camadas. O gargalo são as máscaras do chão em `groundLayers.ts` (v0.8f).
- **Quadradinho rosa no chão:** apareceu também no Passo da Geada, perto do herói (além da Floresta dos Sussurros). Não investigado (v0.8f).
- **Biblioteca de texturas (folha 23):** 47 texturas em `public/textures/biblioteca/`. Revisar as pedras 18 a 21 (paredes de rocha), as telhas com cume e os pisos de 39 a 42 px (v0.8e).
- **Folhas de referência (21 a 24):** em `referencias/texturas/` (branch da sessão). Confirmar se vão para a branch `fontes`, como manda o CLAUDE.md (v0.8e e v0.8f).
- **Projétil do Necromante:** testado no navegador por injeção; falta ver numa batalha real com o dono (v0.8e).
- **Krexx retorcido (Orc Warlord):** ainda se deforma em combate (braços abertos, em T), mesmo com o caminho de rig corrigido (v0.7h).
- **Muralha do Guerreiro:** falta o trecho de 2 tiles e o escombro de pedra para o bloco quebrado (v0.7e).
- **Cartas:** a arte dos monstros continua a mesma; os ornamentos podem ficar mais detalhados (v0.7f).
- **Floresta:** árvores e rochas já usam as texturas do dono (v0.8d). Flores, cogumelos e tocos da folha ainda não viraram objetos no chão.
- **Floresta:** as poças pequenas ficam escuras demais de perto (v0.8c).
- **Ponte de Valdrec:** continua escura à noite e tem poucos pontos de interesse dentro do enquadramento (v0.8a).
- **Floresta dos Sussurros:** apareceu um quadradinho rosa no chão. Não investigado; pode ser um objeto do mapa.
- **Texturas (folha e pacote novo):** cada recorte tem 95 a 150 px, então de perto a nitidez fica limitada. Pedir ao dono as originais em 512 px ou mais.
- **Deserto:** oásis e paredes não revisados de perto. A montagem do deserto ficou 30 a 40 ms mais lenta (v0.8d).
- **Planície, montanha e cinzas:** árvores e rochas ainda são os modelos antigos (Kenney e procedurais).
- **Medições:** feitas só no Chromium de teste (sem GPU). Não medidas no PC do dono.
- **Outras zonas de floresta** (Sussurros, Clareira do Corvo, Vale das Raízes) receberam o chão novo, mas só o Bosque Torto foi revisado de perto.

---

## Sessões anteriores — 2026-10-10 — cartas, Ápice, Muralha, Bongun, auras e Krexx (v0.7a–v0.7h)
- **Bongun (v0.7a):** flutuação visível (sobe e desce 9 cm) com sombra respirando.
- **Cartas (v0.7b, v0.7f, v0.7g):** pacote com abertura interativa. O verso mostra a raridade antes de revelar e o logo do ROguard. O dono rejeitou o recorte que trazia o texto "Aurenthal". Normal dourada, Mini-Boss azul, MVP vermelho.
- **Ápice (Bruxa) (v0.7c, v0.7d):** o visual foi refeito com a arte do dono; depois os efeitos passaram a ser desenhados por código, sem PNG, a pedido do dono.
- **Muralha do Guerreiro (v0.7e):** primeiro com blocos do kit de muros; depois com o kit de castelo `fortress.glb` que o dono enviou (blocos de 2 m reduzidos a 1 tile; a barricada quebrada troca de peça).
- **Auras e Krexx (v0.7h):** a aura dos chefes virou um halo suave na silhueta e um anel de energia no chão. O Krexx saiu do rig automático e passou a usar o caminho do líder goblin, mas ainda se deforma (pendente).
- Commits: `7e8a04e`, `8d330fc`, `ac82fde`, `e968933`, `d5374f8`, `2173292`, `46d75b0`, `cc8e9de`, `8c3312d`.

## 2026-10-10 — pacote packtextura na ponte e na floresta (v0.8a)
- **Pedido:** o dono enviou a pasta `packtextura` (peças GLB e texturas) e pediu para melhorar a ponte e a primeira floresta: "se for preciso refazer do zero... quero algo bem detalhado e bem acabado, triple AAA".
- **Feito:** ponte com deque e praça em pedra com mapa de normais, e ruínas e pedras dentro do rio (em tiles de água, sem bloquear nada). Floresta com árvores, rochas, troncos e arbustos do pacote, desenhados de forma instanciada.
- **Grade:** o mapa (`zones.ts`) não mudou; só a apresentação.
- **Avaliação honesta:** melhorou, mas ainda longe de AAA. O README do próprio pacote diz que é uma base procedural.
- Commit: `0fb7d05`.

## 2026-10-11 — chão da floresta com a folha de texturas do dono (v0.8b)
- **Reclamação do dono:** "não sei como você permitiu um mapa tão feio" (o chão aparecia borrado de perto).
- **Causa:** o chão era pintado num canvas de 16 px por tile e esticado na tela.
- **Decisão:** usar a arte do dono. Ele mandou uma folha com grama, caminhos, água, pedras, pisos e decoração.
- **Feito:** recortei grama (duas variações), terra e pedra. Emendei as bordas para não aparecer costura quando a textura repete. O chão passou a ser montado em camadas: textura nítida, com uma máscara suave que diz onde ela aparece. Resultado: trilha com borda irregular, sombra das copas e das rochas, pedra no portão.
- **Ficou de fora:** flores, cogumelos, tocos e arbustos da folha. São desenhos sobre fundo escuro e precisam de tratamento antes de virar objetos no chão.
- Commit: `df6656e`.

## 2026-10-11 — lago da floresta (v0.8c)
- **Reclamação do dono:** "essa água no bosque flutuando... faça algo melhor ou remova ela".
- **Causas:** o lago era um quadrado azul por tile, sem margem, e as poças eram discos azuis desenhados acima do chão (y = 0,012).
- **Decisão:** refazer, não remover. O lago ganhou margem de terra molhada, anel de água rasa, centro fundo, borda irregular, ondas que deslizam devagar e pedras na borda. As poças viraram lama no chão, com um pouco de água parada no centro.
- **Desempenho:** a montagem da cena do Bosque Torto caiu de cerca de 820 ms (v0.8b) para cerca de 200 ms no teste. Ajudaram: uma passada só para todas as máscaras, desfoque em JS e máscaras de 4 px por tile.
- Commit: `63420ee`.

## 2026-10-11 — este log e o CLAUDE.md
- **Pedido do dono:** salvar a conversa num log e pôr no CLAUDE.md só o essencial. Exemplo dado por ele: o GLB deve ser otimizado e ter as animações agregadas antes de qualquer outra coisa.
- **Feito:** este arquivo. O CLAUDE.md ganhou a regra do GLB em primeiro lugar, uma regra de cenário e visual, e duas linhas no fluxo de trabalho (subagentes e este log).
- **Autorização:** o dono autorizou delegar partes do trabalho a subagentes quando ajudar. Até aqui não foi preciso chamar nenhum.

## 2026-10-11 — texturas novas: árvores, pedras e deserto (v0.8d)
- **Pedido:** o dono mandou um pacote novo de texturas (folhas, troncos, pedras e areia) para trabalhar nas árvores, nas pedras e no deserto. Depois pediu para descartar o packtextura: "são horríveis".
- **Decisões:**
  - Packtextura descartado por inteiro (GLB de peças e texturas de pedra e grama). Continua no histórico do git.
  - O pacote novo veio em duas folhas de referência de 1536×1024. Só as partes de superfície (chão, casca, folhas e pedra) viraram textura. Os objetos sobre fundo escuro (árvores inteiras, cactos, ossos, tocos) não foram recortados: precisariam de fundo transparente.
  - Árvores, rochas, arbustos, troncos e ruínas viraram peças feitas por código com as texturas (`naturKit.ts`), e não GLB. As texturas entram direto nas faces, sem depender do mapa de UV de um modelo de terceiros.
  - Deserto: chão em camadas com a mesma técnica da floresta (texturas nítidas e máscaras suaves). O canvas saiu do deserto; planície, montanha e cinzas continuam no canvas.
  - Rochas e cristas do deserto: arenito do dono. Os modelos de rocha do Kenney saíram do deserto.
  - Ponte: praça em pedra cinza, porque a pedra quente avermelhava à noite com as lanternas.
- **Medições:** teste headless com Chromium, sem GPU (não medido no PC do dono). Floresta na mesma faixa de antes. Deserto mais lento: Dunas Vermelhas de 137 para 164 ms e Ruínas Solares de 89 para 130 ms, por causa do chão em camadas. Ponte: 39 ms.
- **Pendências:**
  1. Resolução: os recortes têm 95 a 150 px. De perto ficam borrados. Pedir ao dono as folhas originais em 512 px ou mais.
  2. Objetos das folhas (flores, cogumelos, tocos, cactos, ossos) ainda não viraram peças.
  3. Chão de raízes da floresta (folha "RAÍZES / FLORESTA (PISO)"): não usado nesta entrega.
  4. Oásis e paredes do deserto de perto: não revisados.
  5. Planície, montanha e cinzas: árvores e rochas ainda são os modelos antigos.
  6. Desempenho do chão do deserto: se a montagem incomodar no PC do dono, a margem pode cair de 22 para 16 tiles.
- **Commits:** `adadfcf` e `03f0c12` (checkpoints) e o commit final desta entrega.

## 2026-10-11 — projétil do inimigo, dano roxo e biblioteca de texturas (v0.8e)
- **Pedido:** (1) o projétil que os inimigos disparam deve ser muito maior e bonito; (2) o dano que acerta o jogador deve aparecer em roxo, com o valor; (3) adicionar as texturas da folha nova à biblioteca e guardar as folhas em algum lugar.
- **Decisões:**
  - "Projétil dos inimigos" = o orbe do Necromante (magia `shadowBolt`, `enemySpells` em `gameConfig.ts`). A Bruxa da party usa o mesmo evento, então o lado (inimigo ou herói) decide o tamanho. O orbe da Bruxa ficou pequeno, como estava.
  - "Dano em roxo acertando o jogador" = dano de magia inimiga (fonte `spell` com atacante inimigo) em herói. Dano corpo a corpo continua vermelho. Se o dono quiser roxo em todo dano recebido pelos heróis, muda uma linha.
  - "Biblioteca" = `public/textures/biblioteca/` com `catalogo.json`. O jogo não tem tela de biblioteca de texturas.
  - Folhas de referência: ficaram em `referencias/texturas/` na branch da sessão. O CLAUDE.md manda guardar as fontes na branch `fontes` (zipadas, com LEIA-ME), mas a regra da sessão pede permissão explícita para enviar para outra branch. Aguardando confirmação.
  - Objetos da folha 23 (barris, bandeiras, lanternas, fogueira, estátuas, cercas, portão, tenda, escada) não foram recortados: estão sobre fundo escuro.
- **Como foi testado:** no Chromium, sem GPU, com um inimigo real da batalha. O orbe foi disparado por injeção no navegador (a 5 tiles do herói), e o número roxo foi conferido ampliando a tela. Não foi testado numa batalha com o Necromante de verdade.
- **Medição:** o chão e o cenário não mudaram nesta entrega, então a montagem da batalha não foi medida de novo.
- **Biblioteca:** 47 texturas, de 39 a 124 px (nativo). Costura conferida (todas abaixo de 1,5) e prévia única conferida. Pontos para revisar: pedras 18 a 21 (paredes de rocha vertical, não chão), telhas vermelha e ardósia com faixa de cume, pisos de 39 a 42 px (repetem à vista). As posições dos pisos foram estimadas, sem grade limpa.
- **Pendências:**
  1. Confirmar com o dono se as folhas vão para a branch `fontes`.
  2. Revisar as texturas listadas acima: escolher as que ficam e refazer o recorte se preciso.
  3. Objetos das folhas (21, 22 e 23): precisam de fundo transparente para virar sprite.
  4. Projétil do Necromante: ver numa batalha real com o dono.
  5. Números de dano sobrepostos quando vários caem no mesmo herói (o empilhamento já existia).
- **Commits:** `053c714` (projétil e dano roxo, com as folhas 21 a 23) e o commit de biblioteca e documentos desta entrega.

---

## 2026-10-11 — gelo e lava com a folha 24 (v0.8f)
- **Pedido:** usar as texturas da folha 24 (neve e gelo à esquerda; vulcão, fogo e lava à direita) nos mapas de gelo e de lava, no padrão de qualidade "triplo AAA".
- **Decisões:**
  - "Gelo" = os mapas do bioma de montanha: Passo da Geada e Garganta de Ferrugem. A Garganta de Ferrugem tem nome de ferrugem, mas usa neve, então entrou como gelo.
  - "Lava" = o Cume das Cinzas, único mapa do bioma de cinzas. O Campo de Cinzas é de planície e não mudou.
  - Módulos novos `iceGround.ts` e `lavaGround.ts`, sobre a mesma base de camadas da floresta e do deserto (`groundLayers.ts`). Números da arte em `biomeArt.ts`.
  - Peças novas no `naturKit.ts`: pinheiro com neve, pedras e colunas de gelo, basalto, colunas e árvores queimadas com cristal.
  - Muros, portões, torres e acampamento não foram trocados: continuam as peças antigas. Ficam para uma rodada própria.
  - Ajustes depois da primeira captura: a trilha estava escura demais (parecia sombra) e ficou clara; os pinheiros ficaram 30% maiores; as pedras de neve ganharam contraste (base mais escura); a placa de lava caiu de 90% para 40% de opacidade, para o basalto aparecer; as veias só ficaram em volta das pedras e em alguns pontos.
- **Como foi testado:**
  - `npm run build` e `npm run sim:check` (determinístico: true).
  - Prints no Chromium de teste (sem GPU) dos três mapas, dos lagos de lava e de uma aproximação do chão de cada tipo. Sem erro no console.
  - 41 texturas, com costura conferida pelo subagente do recorte (pior caso 1,17 na coluna e 1,07 na linha, limite 1,5).
- **Medição (montagem da batalha, mediana de 3 amostras):** Passo da Geada de 127 para 164 ms; Garganta de Ferrugem de 197 para 133 ms; Cume das Cinzas de 70 para 150 ms. A variação do teste é de cerca de ±40 ms, mas a alta do Cume das Cinzas é clara. O perfil de CPU mostrou que o custo está no cálculo por pixel das máscaras do chão (amostragem de ruído, suavização, desfoque e textura de máscara), não nas peças.
- **Pendências:**
  1. Texturas de 70 a 124 px: de perto a nitidez é limitada. Pedir ao dono a folha 24 em 512 px ou mais.
  2. Muros, portões e torres dos três mapas: escuros e fora do estilo das texturas novas.
  3. Custo do Cume das Cinzas: reduzir a resolução das máscaras (hoje 4 px por tile) ou calcular os campos por tile. Muda o visual de floresta e deserto, então depende de decisão.
  4. Quadradinho rosa no chão, agora também no Passo da Geada (e na Floresta dos Sussurros, já anotado). Não investigado.
- **Commits:** a entrega de gelo e lava (ver `git log` da branch).

---

## 2026-10-11 — pacote de efeitos (Godot) nas magias (v0.8g)
- **Pedido:** ver a pasta `efeitos` enviada pelo dono; se der para aproveitar os VFX, trocar TODAS as magias por esses efeitos.
- **O que veio:** um 7z com 206 arquivos de um projeto Godot 4 (cenas `.tscn`, shaders `.gdshader`, scripts `.gd`), com seis pacotes: Magic Circles 3D Free (círculos mágicos), Free Hit VFX (golpe em fatia), Stylized Hit FX e Stylized Status FX (Binbun3D; só o Status foi portado), Buff Pickup VFX Lite (buff) e um pacote de loot. Não há Godot no projeto: os efeitos foram portados (shaders para GLSL, faíscas em pool na CPU).
- **Licenças:** Magic Circles 3D Free é CC BY 4.0 (crédito obrigatório em `CREDITOS.txt`); Free Hit VFX permite uso comercial sem atribuição, mas não redistribuir os arquivos como pacote; Stylized Hit e Status FX são CC0; Buff Pickup é MIT (aviso de direitos autorais no `CREDITOS.txt`). O pacote de loot não tem arquivo de licença: **não foi usado**.
- **Decisões:**
  - Cada magia tem uma receita em `efeitosMagia.ts` (elemento, círculo, golpe, aura, emissor, brilho). Oito elementos: fogo, gelo, veneno, sagrado, sombra, arcano, natureza e sangue. Trocar um elemento é trocar uma palavra.
  - A camada nova roda antes do despachante de cada classe e **não substitui** o efeito antigo: é a forma de não quebrar o que já foi aprovado. Se o dono quiser trocar um efeito antigo por completo, é uma classe de cada vez.
  - Chaves por classe quando o evento não diz quem causou (`dmg:spell:necro` para o Necromante, `bash:assassin` para o Golpe Furtivo). A auditoria das 65 magias (62 + 3 inimigas) está no relatório do subagente e confirmou as chaves.
  - Duração: escudo, buff e área usam o tempo que a simulação manda (`ticks`, 10 por segundo), não um valor fixo.
  - Dano ao longo do tempo não tem golpe por acerto (ver a regra no cabeçalho de `efeitosMagia.ts`).
  - O círculo baixou de energia (1,2 → 0,9): com o bloom, o miolo claro estourava em mancha branca no Santuário e no Julgamento.
- **Como foi testado:**
  - Galeria `efeitos.html` (um círculo, golpe e aura por elemento).
  - Vitrine de efeitos (`fxshowcase.html`) com as 54 demonstrações, quadro no meio de cada uma: sem erro de console. Folhas de miniaturas revisadas.
  - Batalha real (Dunas Vermelhas) com eventos injetados pelo caminho da `GameView`: escudo, cura, Nova, meteoro e congelamento aparecem; sem erro.
  - `npm run build` e `npm run sim:check` (determinístico: true). A simulação não mudou.
  - Montagem da batalha antes/depois (medir2): Passo da Geada 164 → 139 ms, Garganta de Ferrugem 133 → 152 ms, Cume das Cinzas 150 → 130 ms. Dentro do ruído (±40 ms).
- **Pendências:**
  1. **Desempenho na GPU real:** os testes rodaram em navegador por software (swiftshader), que não mede bem. Medir no PC do dono (F9) com muitas magias ao mesmo tempo.
  2. **Passivas e estados sem evento:** das 19 passivas, só as que disparam evento (cura, bloqueio, combustão) ganham efeito. Os estados (atordoar, lentidão, puxão, atraso) não têm evento próprio na simulação; precisariam de um (muda o núcleo; exige decisão).
  2b. **Cobertura:** 42 das 43 habilidades ativas e as 3 magias inimigas têm receita. A Flecha Precisa não tem (o evento é o da flecha comum).
  3. **Julgamento:** o desenho do golpe usa 5 de 9 tiles (existe no despachante antigo); a camada nova só dá o círculo nos raios.
  4. **Corrente Elétrica** usa a receita da Tempestade (o evento não diz qual habilidade é). Se o dono quiser outra cor, é uma receita nova com a chave `storm:chainLightning`, mas o evento não traz o nome.
  5. **Flecha Precisa e Tiro Duplo** não têm golpe novo: o evento de flecha é o mesmo do ataque básico (sem como separar).
  6. **Névoa Gélida:** a simulação remove a névoa depois de 2 tiques sem evento, mas o círculo novo segura pelo tempo do evento. Conferir se fica estranho.
  7. **O 7z original** (2,5 MB) está em `/root/.claude/uploads`, fora do repositório. O CLAUDE.md manda guardar o original zipado na branch `fontes` com LEIA-ME: precisa de permissão explícita para enviar a outra branch.
  8. **Pacote de loot** sem licença: não usado. Se o dono quiser, é preciso confirmar a licença.
  9. **Stylized Hit FX** (impactos CC0) não foi portado: daria mais variedade aos golpes. Próxima rodada, se o dono quiser.
- **Commits:** a entrega de pacote de efeitos (ver `git log` da branch).

---

## 2026-10-11 — kit de interface com a arte do dono nos menus (v0.9)
- **Pedido do dono:** usar as folhas de kit (imagens 27 e 28) em todo o jogo, substituindo qualquer menu pelo layout da imagem 2 (Ficha do Herói no padrão da Feiticeira). Depois, o Relatório da Noite virou pedido separado: visual, enxuto e sem rolagem. Em seguida, pediu roleta e muralha corrigidas, o painel do mapa, a Ficha cabendo em 720p e, por último, as molduras do Relatório com a borda fora do contorno e o gradiente estranho (imagem 31). Pediu acabamento de nível AAA.
- **Recorte do kit:** duas agentes recortaram as folhas em paralelo. A folha A teve cinco peças com o conteúdo trocado; foi corrigida e conferida. As peças ficam em `public/ui/kit/`, e a configuração (`src/config/uiKit.ts`) é gerada por `scratchpad/ui_kit/gerar_uikit.py` a partir dos manifestos.
- **Decisões:**
  - Molduras só com o anel da arte (miolo transparente); o fundo do menu fica só dentro do anel (`background-clip: padding-box`).
  - As molduras são carregadas com URL absoluta, porque o CSS resolve `url()` de variáveis a partir do `style.css`, não do `index.html`.
  - O botão principal dourado usa um preenchimento fixo mais claro: a cor amostrada da peça original era bronze escuro e apagava o texto.
  - Ranking do menu não foi trocado (faz parte da arte da tela inicial).
  - Roleta: o giro é por tempo acumulado com teto de 120 ms por quadro, e "Pegar" só libera depois do fim. Não consegui reproduzir a finalização só com clique; a causa comprovada é a pausa do navegador (testada com bloqueio de 9 s no meio do giro).
  - Muralha: as peças do `fortress.glb` vêm sem normais e com a ordem das faces irregular. Cada face recebe a normal para fora e a ordem certa; as cores por vértice são mantidas. O arquivo não tem textura.
- **Relatório (imagem 31):** a causa era o halo translúcido das molduras (o anel não encostava nas bordas e o fundo aparecia além do ornamento), além de uma animação de brilho na caixa de desbloqueio (`unlockGlow`) que pintava uma faixa cinza. Corrigido: recorte até o pixel opaco, halo removido, fundo só dentro do anel, animação desligada na caixa de desbloqueio.
- **Ficha do Herói em 1280×720:** o corpo tinha 52 px de conteúdo a mais que a área visível, e o conteúdo sumia sem barra de rolagem. Ajustado com a regra de tela baixa (slots menores, modelo menor, linhas mais justas, 20 px a mais de janela). Medido: sem rolagem, todo o conteúdo visível.
- **Testes:** `npm run build` passou; `npm run sim:check` deu `determinístico: true`. No navegador (dev, 1600×900), menu, seleção, mapa, coleção, cidade, árvore e roleta abriram sem erro de console. A captura do pacote de cartas ficou com a roleta da demonstração por cima; não conferido.
- **Commits:** f8fbae2, bfc8a4c, 04a41a5, 4d10d43, ee86a8a, dad5296, 06ba7e7 e o commit final desta versão.
- **Pendências:** conferir configurações e pacote de cartas; silhuetas de amuleto e anel; brinco e cinto sem silhueta; mítico com moldura dourada; textura da muralha (decisão do dono); painel "Sob pressão" do Relatório ainda sem a moldura do kit. Quando a agente de restyle foi parada, o trabalho dela ficou nos commits WIP e foi concluído por mim.

## 2026-10-11 — álbum de cartas no layout da folha 32 e dica da carta revelada (v0.10)
- **Pedido do dono:** o álbum como na imagem 33, usando a folha de assets 32 (classes, raridades, molduras, botões). Destacar cada classe, a raridade das cartas e em quem está equipado. Na revelação do pacote, passar o mouse numa carta deve mostrar o que ela faz.
- **Decisões:**
  - Raridade pela moldura e pela gema, nas cores que o jogo já usa (dourada: Normal; azul: Mini-Boss; vermelha: MVP). Os nomes do jogo ficam; a folha traz outros nomes (Comum, Rara, Lendária), mas o jogo tem só três raridades.
  - Cartas não têm nível no jogo: o "Nv. 1" da imagem virou ×N (cópias). Nível de carta seria mecânica nova e não foi criado.
  - Seis heróis, não oito classes: a imagem mostra Clérigo, Monje, Mecânico e Professor, que não existem no jogo. Feiticeira e Bruxa não têm ícone na folha 32: usam o retrato do herói na aba e no cabeçalho.
  - "Em quem está equipado": cada carta mostra os retratos dos heróis que a usam, e tem a marca ✓ quando está equipada no herói da aba.
  - A coleção continua por herói. Cartas possuídas vêm primeiro; 18 por página (6×3), para caber em 1280×720 sem rolagem.
  - Dica da revelação: nome, raridade, efeito (atributo e valor), classes com bônus cheio e "fora delas, metade". Fica embaixo da carta sob o mouse e não bloqueia o clique.
  - Regras, valores e formato do save não mudaram (equipar, fundir, slots).
- **Recorte da folha 32:** `scratchpad/ui_kit/cortar_folha32.py` com o manifesto `manifest_C.json`. Molduras com miolo transparente (a arte aparece por dentro); gemas em losango (silhueta, cor pelo CSS); ícones de classe em círculo.
- **Testes:** `npm run build` e `npm run sim:check` (determinístico: true). No navegador (dev, 1600×900 e 1280×720): álbum sem rolagem, troca de classe, busca, filtro, paginação, equipar, desequipar e fundir 10 sem erro de console; dica da carta revelada aparece dentro da tela. Um defeito achado no teste (fundo branco ao passar o mouse sobre a carta, por uma regra global de botão) foi corrigido.
- **Commits:** o commit desta versão.
- **Pendências:** pedir ao dono os ícones de Feiticeira e Bruxa para a folha de classes; conferir no PC do dono o álbum com cartas reais e a dica do pacote; a faixa de citação da lateral (imagem 33) não entrou. Seguem as pendências de v0.9 (configurações, janela de batalha e silhuetas de amuleto, anel, brinco e cinto).

## 2026-10-11 — O Último Bastião: auditoria e fundação (v0.11, em andamento)
- **Pedido do dono:** novo modo de defesa de cidade persistente (preparação → invasão → recuperação → aprimoramento), reaproveitando o Vanguarda e sem recriar o jogo. Pediu auditoria antes de qualquer mudança e entrega por etapas.
- **Auditoria (resumo):**
  - Já existia e foi reaproveitado: horda com campo de fluxo; objetos com vida e quebra (`objects.ts`); muralha do Guerreiro; armadilhas da Arqueira; vida do núcleo (`cityDefense`, ameaça por inimigo); planejamento com ferramentas, destaque de tiles e reinício da simulação ao mudar a formação; recompensa de onda paga uma vez (`paidKey`); save com migração.
  - Não existia: cidade persistente entre jornadas; construção com custo, reparo e reembolso; torre que atira sozinha; projetos permanentes; chave de save própria.
  - Riscos achados: `shieldWall` é caso especial em 6 pontos (muralha do Guerreiro e a contagem que libera a habilidade). Por isso as muralhas da cidade têm tipo próprio, `bastionWall`. A grade é global (`applyZone` muda `GAME_CONFIG.board` e `wave`): duas simulações com zonas diferentes não podem rodar ao mesmo tempo. A horda comum só quebra obstáculos da lista `WALL_BREAKERS`. O Electron tinha lista fixa de chaves de save (`run`, `meta`).
- **Decisões (proposta, o dono pode trocar):**
  - **D1 — Carteira própria do modo (confirmada pelo dono):** a cidade tem o próprio perfil (heróis, Zen). Não divide Zen com a jornada: não mexe no save da jornada e a cidade grava tudo numa só escrita atômica.
  - **D2 — Só Zen:** nenhum material novo. Reparo = investido × fração perdida × 0,5 (mínimo 2 Zen). Reconstruir = investido × 0,8, sempre mais que reparar. Remover devolve 50% da parte que resta; destruída não devolve.
  - **D3 — Caminho:** muralhas e torres são quebráveis, então a horda sempre passa, quebrando. Só o próprio mapa pode cortar a rota (a checagem fica como guarda).
  - **D4 — Derrota:** a tentativa termina, a cidade persiste (dano e destruição). O núcleo não volta sozinho: repara-se pagando. Socorro de 150 Zen, no máximo a cada 2 tentativas, se nem o reparo mínimo (10% do núcleo) der para pagar.
  - **D5 — Projetos:** Castelo básico (grátis); Torres de tiro (200 Zen, exige a Arqueira na party); Reforços estruturais (150 Zen, 2 ondas vencidas, +25% de vida nas muralhas).
  - **D6 — Recompensa de onda:** a mesma da jornada (Zen dos abates + bônus de onda limpa). Não há tabela nova.
  - **D7 — Valores iniciais (calibrar com o dono):** muralha 5 Zen, dobrando a cada muralha que já está na cidade (decisão do dono), 120 de vida (+60 por nível, até o nível 3). Torre 120 Zen, 100 de vida (+40 por nível), 14 de dano a cada 1,2 s, alcance 6 tiles.
  - **D8 — Cartas compartilhadas (correção do dono):** a run do Bastião não tem nada a ver com a jornada da campanha. A única coisa compartilhada são as cartas dos personagens. A coleção continua no save de meta; o Bastião copia os bônus no início de cada tentativa, igual à jornada ("vale a partir da próxima tentativa"). Nenhuma carta é gravada no save do Bastião além dessa cópia.
  - **D9 — Muralhas (decisão do dono):** base de 5 Zen. Cada muralha que já está na cidade (destruída conta) dobra o preço da próxima, até o teto de **999 Zen**. Remover uma faz o preço cair. Sequência: 5, 10, 20, 40, 80, 160, 320, 640, 999, 999… Aprimorar custa o preço atual da muralha × nível, com o mesmo teto. Torre tem preço fixo (120, ainda inicial). Reparo e reconstrução seguem o que foi gasto na muralha, sem teto, para reconstruir continuar mais caro que reparar. Ajuste técnico: piso de reparo de 1 Zen e arredondamento para cima.
  - **D10 — Classes (decisão do dono):** as seis classes estão liberadas no Bastião. A party tem de 1 a 6 heróis, sem repetir.
  - **D11 — Pacotes (decisão do dono):** um pacote de cartas (mesmo formato da campanha: 3 comuns e 2 sorteios) a cada **100 ondas vencidas** no Bastião (total, sem zerar). Derrota não conta. O pacote vai para a coleção compartilhada.
  - **D12 — Slots (decisão do dono):** campanha e Bastião somam os slots que cada um libera, até 30. A curva é a mesma para os dois e fica bem mais difícil depois dos cinco primeiros: 5º slot com 6 vitórias, 10º com 31, 20º com 156, 30º com 381. A tabela está em `CARD_SLOT_WINS` (cards.ts), fácil de ajustar.
  - **D13 — Slots por personagem (confirmado pelo dono):** o limite de slots vale para cada herói separadamente, com o mesmo número para todos. Equipar cartas num herói não tira slots dos outros. O que é compartilhado são as cópias: uma cópia equipada num herói não pode estar em outro ao mesmo tempo. O teto de 30 também é por personagem. Isso já era assim na campanha.
- **Entregue (Etapa 2 inteira e parte da Etapa 3):**
  - Dados do modo (`src/config/bastion.ts`).
  - Estado, criação e migração da cidade (`src/core/bastion/bastion.ts`).
  - Regras puras (`src/core/bastion/rules.ts`): colocação com todas as validações antes de gastar, custos, reparo e reconstrução, aprimoramento, remoção com reembolso, projetos, núcleo, socorro e aplicação de onda idempotente.
  - Rota: grade estática da zona e checagem por BFS com as regras de passo da horda (`src/core/bastion/route.ts`).
  - Simulação: as estruturas entram na onda com a vida que têm; as muralhas são quebráveis (a horda ataca); as torres atiram no inimigo visível mais próximo, com recarga e linha de visão; destruída não bloqueia nem atira; a vida final volta para a cidade (`fortificationStates`). Tiro de torre entra no relatório como fonte "tower".
  - Save próprio: chave `bastion` (arquivo próprio no executável; localStorage em dev). `SaveStore`, `electron/main.cjs` e o tipo da janela foram atualizados.
  - Visual: muralha da cidade usa o mesmo desenho da muralha do Guerreiro; torre usa a peça `Tower_Round` do kit do dono. Os dois só aparecem quando a batalha do Bastião existir.
- **Testes:**
  - `npm run bastion:check`: 111 checagens, todas passando (inclui cartas, preço das muralhas, classes, pacotes e slots). Álbum da campanha no navegador: abre sem erro de console com a mudança de slots (dados, migração, colocação, custos, projetos, ondas, socorro e simulação com muralhas, torres e estruturas destruídas).
  - `npm run build`: passa.
  - `npm run sim:check`: resultados das 13 zonas idênticos à linha de base, antes e depois.
  - Navegador (DEV, 1280×720): batalha da ponte com 16 muralhas erguidas pelo caminho refatorado (`ObjectView`): sem erro de console; captura do planejamento mostra as muralhas do kit no lugar.
- **Pendências (próximas etapas):**
  1. Mapa próprio do Bastião (zona com área de construção, portão e portais). Etapa 3.
  2. Inimigos atacarem estruturas que não estão no caminho (hoje só quebram o que bloqueia). Decidir se entra.
  3. Armadilhas da Arqueira persistentes (hoje somem ao disparar). Não entraram.
  4. Serviços urbanos (loja, forja, templo) reaproveitando as funções da jornada, com a carteira do modo. Etapa 5.
  5. Tela de construção e recuperação, entrada no menu, arrastar e girar linhas de muralha. Etapa 6.
  6. Expansões de terreno e progressão por etapa com requisitos reais. Etapa 4.
  7. Melhorias temporárias de combate (encerram com a tentativa): ainda não existe nenhuma.
  8. Balanceamento: custos e dano das torres com o dono (D7).
  9. Confirmar a curva de slots (D12). A tabela é uma proposta, fácil de mudar em `CARD_SLOT_WINS`.
  10. **Campanha no ar:** a curva nova também vale para a campanha. Quem tem 20 vitórias passa de 30 slots para 8. As cartas já equipadas continuam (nada é tirado); só não dá para equipar mais até o limite subir. Confirmar se é isso, ou se a campanha mantém a curva antiga e só o Bastião usa a nova.
  11. Confirmar se o aprimoramento multiplica pelo nível (como está) ou se tem preço fixo por nível.
  12. Confirmar se reparo e reconstrução devem ter teto também (hoje não têm, D9).
- **Commits:** o commit desta versão.

## 2026-10-11 — O Último Bastião: mapa de batalha (v0.11, em andamento)
- **Pedido do dono:** o mapa parecido com as imagens 34 e 35 (castelo central, quatro portais nas pontas, penhascos, florestas, estradas e fosso). Texturas livres, e espaço para o jogador construir muralhas, torres, guardiões e serviços (mercado, forja).
- **Decisões:**
  - **Layout (zona `bastionKeep`, em `zones.ts`):** castelo de 13×13 com muralha de pedra e quatro portões de 3 tiles; fosso de 2 tiles de largura; quatro estradas de pedra dos portais até o castelo; costa de rochas; mata e rochas nas laterais e cantos; poças e raízes. O mapa é dado: dá para editar à mão.
  - **Área de construção:** a faixa de 7 tiles em volta do castelo fica sem árvores, rochas nem lagos, com 436 tiles construíveis (camada `lots`, `b`). Dentro do castelo há quatro lotes especiais 3×3 (`1` a `4`), reservados para serviços futuros (forja, mercado etc.); por ora também aceitam muralhas e torres.
  - **Tema floresta (não planície):** o tema planície não desenha as estradas de pedra nem a água do fosso. Mesmo assim, o fosso de 1 tile saía como lama; por isso ficou com 2 tiles.
  - **Muralha de pedra (`castle: true`):** o portão da cidade desenhava uma paliçada de toras numa linha só, de borda a borda, o que não serve a um castelo. Com o flag `castle`, cada tile `W` vira um bloco de pedra com ameias, e os `g` ficam abertos. A pedra é a textura `pedra_cinza.webp` do dono. As campanhas não têm o flag e seguem como estavam.
  - **Party padrão nas laterais da estrada norte (18,7) e (26,7):** dentro do castelo, a horda entrava pelos portões e era contada como invasão sem nunca encontrar os heróis (0 abatidos). Nas laterais, a simulação dá 21 abatidos e 119 de dano à cidade. O mapa ainda é provisório na defesa: as levas e as estruturas vêm nas próximas etapas.
- **Entregue:**
  - `zones.ts`: zona `bastionKeep` (45×39, quatro portais, `wave` provisório sem chefe). Camada `lots` e flag `castle` no `ZoneDef`, validados em `parseZone` (tamanho e caracteres).
  - `src/config/bastion.ts`: `BASTION_ZONE_ID`.
  - `src/core/bastion/route.ts`: `bastionBuildEnv(zone, heroes, raio)`, o ambiente de colocação da zona (grade, lotes, portais, heróis).
  - `src/render/scenery/CityGate.ts`: ramo do castelo fechado (só para zonas com `castle`).
  - `src/main.ts`: `window.__vg.openBastionMap()` (só em DEV) carrega o mapa em planejamento, sem horda.
  - `scripts/bastionCheck.ts`: seção 10 com 19 checagens (rota de cada portal, área de construção, lotes especiais, validação, colocação e um teste de fumaça da horda na simulação).
- **Testes:**
  - `npm run build` e `npx tsc`: passam.
  - `npm run bastion:check`: todas as checagens passam (inclui as 19 novas).
  - `npx tsx scripts/zoneReachCheck.ts`: todas as zonas navegáveis.
  - `npm run sim:check`: as linhas das 13 zonas da campanha continuam idênticas à linha de base; a única diferença é a linha nova do `bastionKeep`.
  - Navegador (DEV, 1280×720): mapa abre sem erro de console nem de página. Montagem medida em 182 a 244 ms. Capturas conferidas de perto: muralhas e heróis assentados no chão, sem nada flutuando.
- **Pendências:**
  1. Dono ver o mapa e dizer se está parecido. Pontos que o dono pode querer: floresta mais densa (hoje cobre 44% do anel externo; a referência tem mais), penhascos internos e pontes de pedra (a referência tem), e a cor da muralha.
  2. A área de construção ainda não aparece no jogo: falta marcá-la no planejamento (próxima etapa, junto da tela de construção).
  3. Lotes 1 a 4 existem mas não têm serviço ainda (etapa 5).
  4. Guardiões e torres ainda não são tipos de estrutura; hoje só existem muralha e torre.
  5. Pendências 10 a 12 da entrada anterior seguem (curva de slots na campanha, aprimoramento e teto de reparo).
- **Commits:** o commit desta versão.

## 2026-10-11 — O Último Bastião: Emperium no centro do castelo (v0.11, em andamento)
- **Pedido do dono:** um minério valioso no centro do castelo, onde as criaturas vão "bater". Quem encostar morre na hora e desconta a vida da cidade; criatura com mais vida e mais forte (ou mais rara) desconta mais. Visual como a arte 36 (cristal azul, base de pedra com runas, raio de luz), com pouca estrutura e o minério em destaque, girando no mesmo lugar. Pediu também alargar a área de fora e a do castelo, que achou pequenas.
- **Decisões:**
  - **D14 — Alvo da horda:** o Emperium ocupa 3×3 tiles no centro do castelo (`E` no mapa). Esses tiles são tiles da cidade, como o portão antigo. Quem pisa neles invade: some na hora, sem recompensa e sem abate. Os portões agora são só aberturas no muro.
  - **D15 — Dano de contato:** dano = vida atual × força do tipo ÷ 30 (mínimo 1). A força é a tabela de ameaça da cidade (`GAME_CONFIG.cityDefense.threat`), e a vida atual conta: criatura ferida faz menos. Com 30 de divisor, um comum cheio causa 3, como na campanha. Exemplos: pesado (85 de vida, força 8) 23; Raydric 33; mini-chefe 120; chefe 352. Proposta para balancear com o dono. A vida do Emperium é a da cidade (1000).
  - **D16 — Campanha intacta:** a regra entra na simulação só pela opção `contactDamage`. Sem ela, a campanha segue com a ameaça por tipo (as 13 zonas dão o mesmo resultado de antes).
  - **D17 — Mapa maior:** grade 61×53 (era 45×39), castelo 17×17 (era 13), área de construção de 9 tiles (era 7). Tiles construíveis: 850 (eram 436). Portões em 3 tiles no meio de cada lado.
  - **D18 — Visual:** o cristal é geometria provisória (o dono não mandou modelo). Base de pedra com runas, runa no chão e raio de luz são recortes da arte do dono, sem rótulos, em `public/textures/bastiao/` (JPG, fundo escuro, modo aditivo). Os fragmentos orbitam e o cristal gira no lugar. O conjunto é 45% maior que o modelo base.
- **Entregue:**
  - `src/core/sim/Simulation.ts`: opção `contactDamage` (dano de contato por invasor). `enterCity` usa a função quando ela existe.
  - `src/core/bastion/emperium.ts`: `emperiumDamage(tipo, vida)`.
  - `src/config/bastion.ts`: `BASTION.emperium.contactDivisor = 30`.
  - `src/config/zones.ts`: `E` vira tile da cidade; zona `bastionKeep` 61×53, spawns novos, party padrão em (27,21) e (33,21), dentro do castelo, perto do portão norte (com ela, 25 abatidos; nas laterais de fora, 7 abatidos e 53 toques).
  - `src/render/scenery/CityGate.ts`: `buildEmperium` (pedestal, cristal, fragmentos, runa, raio) animado no `update` do cenário.
  - `scripts/bastionCheck.ts`: seção 10 com as medidas novas e seção 11 com 11 checagens (fórmula do dano, toque que mata e desconta, vida da cidade pelo total, campanha pela ameaça por tipo).
- **Testes:**
  - `npm run build` e `npx tsc`: passam.
  - `npm run bastion:check`: todas passam.
  - `npx tsx scripts/zoneReachCheck.ts`: todas as zonas navegáveis.
  - `npm run sim:check`: linhas da campanha idênticas; só a linha do `bastionKeep` mudou (mapa novo). Determinístico: true.
  - Navegador (DEV, 1280×720): sem erro de console nem de página. Montagem do mapa de 240 a 290 ms. Capturas conferidas: visão ampla e Emperium de perto.
- **Pendências:**
  1. Balancear o dano de contato com o dono (D15). Hoje, um chefe causa 352 e um líder orc, 1013.
  2. Ligar a regra na batalha do Bastião quando ela existir: `contactDamage: (u) => emperiumDamage(u.kind, u.hp)`. Hoje só os testes usam.
  3. O texto flutuante ainda diz "Cidade" no toque. No Bastião deve dizer "Emperium".
  4. Modelo do cristal: se o dono tiver o GLB, trocar a geometria provisória.
  5. FPS não foi medido no PC do dono (só no navegador de teste, com renderização por software).
  6. Lotes 1 a 4 seguem sem serviço (etapa 5). Mata, penhascos internos e pontes ainda pendentes (como antes).
- **Commits:** o commit desta versão.

## 2026-10-11 — O Último Bastião: modelo do Emperium do dono (v0.11, em andamento)
- **Pedido do dono:** enviou o modelo do minério (`roguard_emperium_crystal.glb`, na branch `main`) e pediu para olhar. Usar no lugar do cristal provisório.
- **Auditoria do arquivo (`scripts/auditar_glb.cjs` e leitura direta):** 21 KB; 852 triângulos; 10 peças: o cristal principal, 7 fragmentos, um pé de base e um anel de runas opcional. Cor por vértice em todas as peças. Não traz normais, nem materiais, nem esqueleto, nem animação. Como é peça de cenário (não personagem), o giro vem do código, então não precisa de clipes; os dois avisos da auditoria não se aplicam. Não tem textura, então não passa por WebP.
- **Decisões:**
  - **D19 — Modelo do dono no lugar do cristal provisório:** cristal, pé e fragmentos vêm do arquivo. Sem pedestal, para ficar com pouca estrutura.
  - **D20 — Eixo:** o arquivo tem o eixo Z para cima, e o jogo usa Y. O conjunto gira 90° em X ao entrar na cena.
  - **D21 — Luz:** o arquivo não traz normais. Calculei as normais de cada face no carregamento (faces planas, para fora) e o cristal recebe luz e um brilho próprio, com casca de brilho em aditivo.
  - **D22 — Runas:** o anel de runas do arquivo fica desligado (é opcional). A runa do chão é a arte do dono, em aditivo, girando devagar. A runa, o raio e a casca são desenhados por último; sem isso, as camadas do chão cobriam a runa.
  - **D23 — Tamanho:** 1,25 vezes o tamanho original, para o minério ser o destaque.
- **Entregue:**
  - `public/models/roguard_emperium_crystal.glb` (arquivo do dono, sem alteração).
  - `src/render/scenery/Emperium.ts`: módulo novo, com o carregamento do modelo, as normais, o raio, a runa e o giro. Saiu do `CityGate.ts`, que só chama.
  - `public/textures/bastiao/`: fica só a runa e o raio (a base de pedra saiu com o pedestal).
- **Testes:**
  - `npm run build`, `npx tsc` e `npm run bastion:check`: passam.
  - `npx tsx scripts/zoneReachCheck.ts`: todas as zonas navegáveis.
  - `npm run sim:check`: idêntico à etapa anterior.
  - Navegador (DEV, 1280×720): sem erro de console. Montagem do mapa de 207 a 246 ms. Capturas conferidas: visão ampla (raio sobe pelo norte) e o minério de perto (cristal, fragmentos e runa).
- **Pendências:**
  1. Confirmar se o anel de runas do arquivo deve aparecer (hoje desligado).
  2. FPS não medido em PC real (só no navegador de teste).
  3. O texto do toque ainda diz "Cidade" no Bastião (ver entrada anterior).
  4. Balanceamento do dano de contato (D15) segue com o dono.
- **Commits:** o commit desta versão.

## 2026-10-11 — O Último Bastião: cristal do Emperium refeito (v0.11, em andamento)
- **Pedido do dono:** o cristal não ficou bem feito. Pediu um visual mais bonito, a luz centralizada no cristal e disse que parecia meio torto.
- **Diagnóstico:**
  - O eixo do cristal do arquivo está vertical (0,3° de inclinação). O problema estava nos anéis: o bojo de baixo era cerca de 18% maior que o de cima, e isso aparecia ao girar.
  - A coluna de luz da arte do dono ficava 3,8% à esquerda do centro da textura.
  - Os fragmentos do arquivo ficavam agrupados de um lado.
- **Decisões:**
  - **D24 — Anéis regulares:** cada anel de seis vértices vira um hexágono regular, com o mesmo raio médio e a mesma altura. Ponta e centro ficam exatamente no eixo do giro.
  - **D25 — Degradê e luz por face:** a base é azul-safira e o topo, aqua claro. Cada face recebe um tom um pouco diferente, fixo (sem sorteio), para as facetas lerem como gema.
  - **D26 — Brilho:** corpo translúcido, borda luminosa (efeito de Fresnel), núcleo menor no centro, halo centrado (arte de brilho do acervo de efeitos) e faíscas em volta.
  - **D27 — Fragmentos:** espaçados igualmente em volta do eixo, com o raio e a altura que o dono desenhou.
  - **D28 — Luz centrada:** o raio sai do centro do cristal, e não do chão. A textura é deslocada 3,8% para a coluna de luz cair no eixo.
- **Entregue:** `src/render/scenery/Emperium.ts` (regularização dos anéis, degradê, borda, núcleo, halo, faíscas e raio). Commits `8b1b9b2` e `31dfd01`.
- **Testes:**
  - `npm run build` e `npm run bastion:check`: passam.
  - `npm run sim:check`: idêntico à etapa anterior.
  - Navegador (DEV, 1920×1080): sem erro de console. Montagem do mapa de 205 a 262 ms. Capturas conferidas: o minério de perto e a visão ampla, com o raio centrado.
  - A captura em 1920×1080 precisou de tempo maior (120 s por captura), porque o renderizador de software é lento nessa resolução.
- **Pendências:**
  1. Confirmar com o dono se as cores e o brilho ficaram como ele queria.
  2. FPS não medido em PC real.
  3. O anel de runas do arquivo segue desligado (a runa do chão é a arte do dono).
  4. O texto do toque ainda diz "Cidade" no Bastião.
- **Commits:** o commit desta versão.

## 2026-10-11 — Desempenho: medição, tochas da ponte e sombra (v0.11, em andamento)
- **Pedido do dono:** medir antes de mexer (etapa 0). Aprovou três coisas: testar a área da sombra ajustada ao zoom, tirar a luz real das tochas da ponte (ficando só o clarão) e medir a horda com um gancho DEV.
- **Diagnóstico** (a auditoria anterior foi corrigida pela medição):
  - O Bastião pesa cerca de 1,2 milhão de triângulos por quadro, não 614 mil como a auditoria estimou (a estimativa não contava a passagem de sombra). A vegetação instanciada (cerca de 10 mil instâncias) é a maior parte. O Three.js recorta um `InstancedMesh` como um bloco só, então ele é desenhado inteiro o tempo todo.
  - A ponte tinha 16 luzes pontuais na cena: 12 do cenário e 4 do pool de efeitos.
  - A área de sombra de 17 tiles já é quase o que a câmera exige no zoom padrão. Encolher só ajuda no zoom mais próximo, e pouco.
- **Decisões:**
  - **D29 — Medição no próprio jogo:** o painel F9 mostra chamadas de desenho, triângulos e luzes da cena. `__vg.abrirZona(id)` abre qualquer zona no console (só DEV).
  - **D30 — Horda medida como no jogo:** os inimigos nascem em tiles que a câmera vê, e os eventos de nascimento passam por `view.handle(sim.flushEvents())`. Sem isso a visualização não cria o corpo, porque o `step()` zera os eventos que saem do tick. Todas as cenas ficam na mesma fase (planejamento), com os inimigos parados, para a contagem ser exata.
  - **D31 — Tochas da ponte sem luz pontual (aprovado pelo dono):** saem as 12 luzes do cenário da ponte (8 braseiros, 2 fogueiras de acampamento e 2 tochas do portão). Ficam o sprite de chama e o brilho do bloom. O preset baixo já não tinha luz de cenário; o médio e o alto perdem as 12.
  - **D32 — Área da sombra por zoom: não implementado.** Conta feita a partir da geometria da câmera (fora do repositório): no zoom mais próximo a área necessária é de 15,9 tiles, contra 17 de hoje (cerca de 7%). No zoom padrão a câmera precisa de 23,5 tiles, então a borda de cima da tela já fica sem sombra, escondida pela névoa. Mudança que não se vê. A alavanca real para sombra mais nítida é o mapa de sombra 4096 no preset alto, com mais memória e custo na passagem de sombra. Testar no PC, se o dono quiser.
- **Medições** (headless, SwiftShader; as contagens valem em qualquer placa; FPS não medido). Valores antes → depois da troca de luzes:

| Cena | Vivos na tela | Luzes pontuais | Chamadas | Triângulos |
|---|---|---|---|---|
| Ponte, alto, sem horda | 0 | 16 → 4 | 281 | 126 mil |
| Ponte, alto, 35 | 35 | 16 → 4 | 351 | 227 mil |
| Ponte, alto, 120 | 120 | 16 → 4 | 521 | 473 mil |
| Ponte, médio, 120 | 120 | 14 → 2 | 521 | 473 mil |
| Ponte, baixo, 120 | 120 | 0 → 0 | 382 | 407 mil |
| Bastião, alto, sem horda | 0 | 4 → 4 | 257 | 1.206 mil |
| Bastião, alto, 35 | 35 | 4 → 4 | 467 | 1.409 mil |
| Bastião, alto, 120 | 120 | 4 → 4 | 977 | 1.903 mil |

  - Custo por inimigo na tela (medido, igual com 35 e com 120): na ponte, +2 chamadas e +2,9 mil triângulos; no Bastião, +6 chamadas e +5,8 mil triângulos (o modelo do inimigo muda com o ato da zona).
  - A troca de luzes não muda chamadas nem triângulos. Reduz o custo de iluminar cada pixel.
- **Entregue:** `src/debug/DebugPanel.ts`, `src/main.ts` (só DEV), `src/render/Stage.ts` (contagem da cena) e `src/render/scenery/BridgeScenery.ts`. Commits `163ab9b` (medição) e `1836611` (tochas), mais o commit deste registro.
- **Testes:**
  - `npm run build` e `npm run sim:check`: passam (o sim:check é determinístico).
  - Navegador (DEV, 1280×720): sem erro de console nas 16 cenas medidas (8 antes, 8 depois). Captura da ponte à noite com 35 inimigos conferida.
- **Pendências:**
  1. FPS no PC: `npm run dev`, F9 (chamadas, triângulos e luzes) e o benchmark do F9 nos três presets. Sem isso o número de quadros ainda é palpite.
  2. Vegetação instanciada do Bastião (1,2 milhão de triângulos): dividir em blocos para o recorte funcionar. Depende de decisão de densidade do dono.
  3. Sombra 4096 no preset alto: testar no PC (custo de memória).
  4. Outras luzes pontuais de cenário ainda reais: portão de cidade (`CityGate`), mapas pintados (`PaintedScenery`) e objetos com braseiro (`ObjectView`). Mesmo caso das tochas. Aguardam decisão.
  5. Pendências antigas: cores e brilho do cristal, texto "Cidade" no toque do Bastião, balanceamento do dano de contato.
- **Lições:**
  - Eventos de nascimento fora do tick somem sem `flushEvents()`. Medir horda assim mostra corpos que não existem.
  - Unidade fora da tela não entra na contagem: a câmera precisa estar apontada para a horda.
  - Mesma fase em todas as cenas, senão a diferença mistura planejamento com batalha.
  - Não encerrar processo por padrão de texto no mesmo shell: isso derrubou o shell duas vezes.

## Lições (curtas)
- **Terreno e água:** textura do dono em WebP nítido. Canvas pintado por código e esticado borra de perto.
- **Nada pode flutuar:** conferir a altura (y) e o screenshot de perto.
- **Visual não altera a grade:** a grade (`zones.ts`) é gameplay.
- **Medir a montagem da cena** antes e depois de mudar cenário (`window.__vg.enterBattle`, só em DEV).
- **Git:** trabalhar na branch da sessão (`claude/festive-curie-5iy45i`). A `main` recebe o que o dono envia com ENVIAR_PARA_GITHUB.bat.
- **Tema decide o cenário:** o tema planície não desenha estradas de pedra nem a água de fosso fino; o portão da cidade é uma paliçada de borda. Castelo fechado usa o flag `castle`. Fosso precisa de 2 tiles para ler como água.
