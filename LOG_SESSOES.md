# LOG DE SESSÕES — ROguard / Vanguarda

Registro do que foi conversado e decidido com o dono, e do que ficou pendente.
O histórico técnico de cada versão está no `CHANGELOG.md`; o estado atual do projeto, no `VANGUARDA_CONTEXT.md`.

Cada entrega grande ganha uma entrada nova no fim: data, pedido do dono, decisões, pendências e commits.

## Pendências em aberto (resumo)
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

## Lições (curtas)
- **Terreno e água:** textura do dono em WebP nítido. Canvas pintado por código e esticado borra de perto.
- **Nada pode flutuar:** conferir a altura (y) e o screenshot de perto.
- **Visual não altera a grade:** a grade (`zones.ts`) é gameplay.
- **Medir a montagem da cena** antes e depois de mudar cenário (`window.__vg.enterBattle`, só em DEV).
- **Git:** trabalhar na branch da sessão (`claude/festive-curie-5iy45i`). A `main` recebe o que o dono envia com ENVIAR_PARA_GITHUB.bat.
