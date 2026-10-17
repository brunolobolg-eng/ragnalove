# LOG DE SESSÕES — ROguard / Vanguarda

Registro do que foi conversado e decidido com o dono, e do que ficou pendente.
O histórico técnico de cada versão está no `CHANGELOG.md`; o estado atual do projeto, no `VANGUARDA_CONTEXT.md`.

Cada entrega grande ganha uma entrada nova no fim: data, pedido do dono, decisões, pendências e commits.

## Pendências em aberto (resumo)
- **O Último Bastião (v0.11, em andamento):** prévia translúcida, muralhas em qualquer ponto, mover muralhas recentes, horda ordenada (mini-chefe a cada 5 noites, MVP a cada 10) e caminho aberto antes de quebrar, já no código (commits 35153a7 e 742b601). Pendências do dono: testar no PC; confirmar a ordem da horda e se o turno também avança na derrota; decidir se mover sai do modo depois de mover (hoje sai); zoom global ou só no Bastião. Detalhes na entrada de 2026-10-12 abaixo.
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
  3. Sombra 4096 no preset alto: testar no PC (custo de memória). Fechado: o dono aprovou a sombra atual (D44).
  4. Outras luzes pontuais de cenário ainda reais: portão de cidade (`CityGate`), mapas pintados (`PaintedScenery`) e objetos com braseiro (`ObjectView`). Mesmo caso das tochas. Aguardam decisão.
  5. Pendências antigas: cores e brilho do cristal, texto "Cidade" no toque do Bastião, balanceamento do dano de contato.
- **Lições:**
  - Eventos de nascimento fora do tick somem sem `flushEvents()`. Medir horda assim mostra corpos que não existem.
  - Unidade fora da tela não entra na contagem: a câmera precisa estar apontada para a horda.
  - Mesma fase em todas as cenas, senão a diferença mistura planejamento com batalha.
  - Não encerrar processo por padrão de texto no mesmo shell: isso derrubou o shell duas vezes.

## 2026-10-11 — Pacote de shaders: auditoria e primeira melhoria, o Emperium (v0.11, em andamento)
- **Pedido do dono:** pacote de qualidade visual em sete fases, sem reescrever o renderizador e sem bibliotecas novas. Começar pela auditoria, implementar a primeira melhoria completa e validar antes de avançar.
- **Fase 1, auditoria (resumo):**
  - **Engine:** Three.js 0.169.0 (`package.json`), com Vite 5.4, TypeScript 5.6 e Electron 36.
  - **Renderizador** (`src/render/Stage.ts`): WebGL 2 (o r169 não tem caminho WebGL 1). Antisserrilhado desligado no canvas e MSAA 4× no alvo do composer (HalfFloat). Tone mapping Neutral, com exposição por tema. Sombra PCFSoft só do sol/lua: 2048 no alto, 1024 no médio, desligada no baixo. Névoa linear que acompanha o zoom. Ambiente PMREM de uma sala padrão (`RoomEnvironment`), com intensidade de 0,08 a 0,14.
  - **Pós-processamento:** `RenderPass`, passe de efeitos (calor, aberração, correção de cor, gradiente), bloom (`UnrealBloomPass`, limiar de 0,82 a 0,9 por tema) e passe final (nitidez, vinheta, grão). Climas em `visualConfig.ts` (bloco `POSTFX`): dia, pôr do sol, noite, batalha e chefe.
  - **Materiais:** a maior parte do cenário é `MeshLambertMaterial` com textura de cor, e `MeshBasicMaterial` para brilhos, lâmpadas e sobreposições. `MeshStandardMaterial` só aparece em unidades procedurais. Há 5 `ShaderMaterial` (água, Emperium, magias).
  - **Texturas:** mais de 140 texturas de cor (pedra, madeira, água, copa de árvore, areia, grama). **Não há mapa de normal, rugosidade, oclusão, emissão ou metal no projeto.** Relevo e rugosidade dependem de arte nova do dono.
  - **Presets:** `src/settings/Settings.ts` (`QUALITY_PRESETS`) → `graphicsFrom` → `Stage.applyGraphics`. O interruptor de luzes do cenário (`BoardView.setSceneryLights`, ligado com `maxLights > 0`) virou o gancho para efeitos caros de cenário.
  - **Limites:** WebGL 2; o alvo do pós-processamento em HalfFloat com MSAA 4× é o maior custo de memória (estimativa de cerca de 170 MB a 1080p, não medida); sombra 2048² (cerca de 16 MB).
- **Fase 2, identidade (proposta):** fantasia medieval com material rico, magia azul com detalhes dourados, sombras suaves e legíveis, névoa para profundidade, emissão para magia, cristal e tocha, contraste sem saturação. Nada de aplicar o mesmo efeito em tudo.
- **Decisões:**
  - **D33 — Primeira melhoria: o Emperium.** Contida (um material, um objeto), visível, está na zona de validação e não muda cenário nem jogo. As fases 3 a 7 ficam para as próximas etapas.
  - **D34 — Biblioteca de materiais:** `src/render/materials/cristal.ts`, com o cristal mágico. Os demais materiais da lista ficam pendentes: ou usam as texturas de cor já existentes, ou esperam mapas do dono.
  - **D35 — Veios por shader, sem textura:** emissão calculada pela posição no modelo. Iluminação, sombra e tone mapping continuam os do material original.
  - **D36 — Presets:** os veios ligam com o interruptor de luzes do cenário, ou seja, médio e alto. O baixo mantém o cristal original.
  - **D37 — Números em configuração:** `VISUAL_CONFIG.emperium` (densidade, nitidez, fluxo, brilho, pulso e cor do meio).
- **Entregue:** `src/render/materials/cristal.ts` (novo), `src/render/scenery/Emperium.ts`, `src/render/scenery/CityGate.ts` (interruptor do castelo) e `src/config/visualConfig.ts`. Commits `f9735a9` (veios) e `da02062` (ajuste dos valores).
- **Testes** (Chromium headless, mesma câmera e mesmo tempo fixo, antes e depois):
  - Sem erro de console nas capturas.
  - Bastião sem horda: 256 chamadas e 1,2 milhão de triângulos, antes e depois. Programas: 52 e 52.
  - Horda de 120 vivos, todos na tela: 976 chamadas antes e depois. Visibilidade dos inimigos igual.
  - Emperium de perto (preset alto): 705 chamadas e 54 programas, antes e depois. Veios visíveis, sem artefato.
  - Preset baixo: 193 chamadas e 616 mil triângulos, antes e depois. Cristal igual ao original.
  - `npm run build`, `npm run sim:check` e `npm run bastion:check` passam.
- **Limitações desta entrega:**
  - Veios conferidos em imagem fixa com tempo fixo. O pulso é lento, de cerca de 6 segundos, e o movimento não foi visto em vídeo.
  - O cristal segue com opacidade de 0,88, e isso esconde inimigos atrás dele. Já era assim. Não mexi, porque mudaria a leitura do minério sem decisão do dono.
  - O preset médio usa o mesmo interruptor do alto, mas não foi capturado separadamente.
  - Ponte (dia e noite) e pântano não foram recapturados: nada deles mudou nesta entrega. A ponte só tem noite no jogo.
  - FPS não medido (renderização por software). Memória estimada, não medida.
- **Pendências (próximas fases, em ordem sugerida):**
  1. Água: reflexo sutil e variação de normal no shader existente (`BridgeScenery.ts`, `waterMaterial`, e `BiomeScenery.ts`, `liquidMesh`).
  2. Magias: dissolução e ondas nos shaders já existentes (`magicVfx`, `FireBarrierFX`, `Particles`).
  3. Materiais de cenário: pedir ao dono mapas de normal e de rugosidade para pedra e madeira. Sem eles não há relevo. Fechado: o dono decidiu não ter mapas (D42).
  4. Iluminação e atmosfera: névoa baixa para o pântano e calibração da sombra.
  5. Opacidade do cristal: decidir com o dono se reduz para proteger a visibilidade dos inimigos. Fechado: o dono aprovou a opacidade atual (D43).
- **Lições:**
  - O interruptor de luzes do cenário serve bem como gancho de preset para efeitos caros de cenário.
  - Conferir o eixo antes de escrever o shader: a altura do cristal está no eixo Z do modelo, não no Y.

## 2026-10-11 — Pacote de shaders: água, escudo sagrado e ruído compartilhado (v0.11, em andamento)
- **Pedido do dono:** seguir com as próximas melhorias do pacote, na ordem da auditoria: água (fase 4C), magias (fase 4B), depois materiais (espera mapas do dono) e atmosfera.
- **Entregue:**
  - **Água** (`src/render/scenery/groundLayers.ts`, `src/render/BoardView.ts`, `VISUAL_CONFIG.agua`): ondulação discreta nas camadas de água com fluxo (rio, lago e poças), reflexo do céu nas bordas de visão e brilho nas cristas. Sem geometria nova. Liga só nos presets médio e alto, pelo mesmo interruptor do cenário.
  - **Escudo Sagrado** (`src/render/fx/combat/mageFx.ts`, `MAGE_FX.holyShield`): a cúpula se desfaz por um ruído entre `fadeAt` e `fadeAt + fadeTime`, com a frente acesa, em vez de apagar de uma vez. Vale em todos os presets.
  - **Ruído compartilhado** (`src/render/materials/glsl.ts`): o ruído 3D saiu de dentro do cristal e agora é usado também pelo escudo.
- **Decisões:**
  - **D38 — Reflexo da água em 0,07 (era 0,14):** com 0,14 o fosso clareava e perdia saturação. Em 0,07 o efeito fica sutil e as cristas continuam legíveis. É só `VISUAL_CONFIG.agua.reflexo`.
  - **D39 — Parâmetros da dissolução mantidos** (`dissolveScale 2.6`, `dissolveWidth 0.12`, `dissolveGlow 1.4`): na ampliação 3× o padrão lê como dissolução, com pedaços e borda acesa.
  - **D40 — Cúpula pequena no zoom do jogo (pendente do dono):** no zoom mínimo a cúpula é pequena, e a diferença para o código anterior fica em cerca de 0,5% dos pixels no instante de 0,9 s. Para ficar mais visível, o caminho é aumentar `domeRadius` ou `domeAlpha` em `config/fx/mage.ts`. Não mudei, porque muda a leitura da magia.
  - **D41 — Verificação com quadros exatos:** as capturas antigas esperavam quadros pelo contador `__vgFrames`, que pegava quadros a mais conforme a latência do navegador. Duas capturas idênticas diferiam em 1,8% dos pixels. Agora o avanço é por `__vgBudget` (passos exatos), e a região de controle (pedra) fica igual nos dois lados (0,00).
- **Correção da validação anterior do escudo:** as capturas do escudo feitas antes deste registro não mostravam a cúpula. A party do Bastião não tem mago, e o efeito da cúpula é escolhido pela classe de quem lança. A captura agora trata o lançador como mago só na visualização (`vg.view.kinds`), o mesmo caminho do jogo quando um mago conjura. Para isolar a cúpula, os heróis somem pelo `sim.isVisible`, porque o `GameView` zera a visibilidade das unidades a cada quadro.
- **Testes:**
  - `npm run build`, `npm run sim:check` (determinístico: true) e `npm run bastion:check` passam.
  - **Escudo** (zoom mínimo, heróis ocultos, quadros exatos): erros 0. Antes e depois são iguais em 0,4 s, como esperado, porque a dissolução começa em 0,45 s. Em 0,9 s o depois muda 0,49% dos pixels em 1× e 2,9% na ampliação 3×. Em 1,2 s, 0,07% e 0,31%. `uDissolve` mede 0, 0,563 e 0,938, batendo com a curva.
  - **Água** (Bastião, quadros exatos): erros 0; chamadas e triângulos iguais; programas 52 → 53. No fosso de perto, a diferença média é (6,3; 4,8; 6,4) com reflexo 0,07, contra (8,6; 5,9; 8,0) com 0,14. Pedra de controle: 0,00.
  - **Emperium** (preset alto, refeito após o refactor do ruído): erros 0; 256 chamadas e 1,2 milhão de triângulos sem horda; 976 chamadas com horda de 120; 705 chamadas de perto, com 52, 54 e 54 programas. Os números batem com a validação anterior, e os veios comparados lado a lado estão iguais.
- **Limitações:**
  - FPS e memória não medidos (renderização por software).
  - Sem mapas de normal nem de rugosidade no projeto. O dono decidiu que não vai ter (D42), então a fase 3 fica encerrada com os materiais atuais.
  - O cristal segue com opacidade 0,88, que esconde inimigos atrás dele. O dono aprovou a leitura (D43).
  - Não há zona de pântano de verdade, então a névoa do pântano não tem onde ser validada.
  - Vale (fechado depois): com quadros exatos, antes e depois da água dão 266 chamadas e 980 594 triângulos. A diferença da captura antiga (2 chamadas, 128 triângulos) era do método de captura, não da água. Na imagem, a mudança fica só nos pixels da água (0,14%, média 0,1 em toda a tela).
- **Respostas do dono (depois do registro):**
  - **D42 — Sem mapas de normal e de rugosidade.** A fase 3 (materiais com relevo) sai do plano. Os materiais seguem com as texturas de cor que já existem.
  - **D43 — Opacidade do cristal mantida (0,88).** O dono achou boa. Nada muda em `VISUAL_CONFIG`.
  - **D44 — Sombra mantida.** O dono achou boa, então o mapa de sombra 4096 não entra. Segue 2048 no preset alto.
- **Pendências:**
  1. Dono: a cúpula deve ficar mais visível no zoom do jogo? (D40)
  2. FPS no PC com o F9 nos três presets.
  3. Luzes pontuais de cenário que ainda são reais (portão, paliçada e `ObjectView`). Sem decisão ainda.
  4. Fase 4B, magias, ainda incompleta: só a dissolução do escudo entrou. Faltam as ondas nos shaders existentes (`magicVfx`, `FireBarrierFX`, `Particles`). Fica para depois da decisão sobre a cúpula (item 1), porque ela muda a leitura de qualquer efeito de magia.
- **Lições:**
  - Captura que espera quadros pelo tempo não é exata. Para comparar antes e depois, avançar por passos (`__vgBudget`) e conferir uma região de controle que não pode mudar (tem que dar 0,00).
  - Antes de comparar um efeito, confirmar que ele apareceu na cena. A cúpula não existia nas capturas, e a diferença que se via era de outra coisa.
  - Para ocultar unidades numa captura, usar `sim.isVisible`. Ocultar o nó não adianta, porque o `GameView` redefine a visibilidade a cada quadro.

## 2026-10-11 — Cartas de monstro: efeitos por gatilho, tiers e vocações (v0.11, em andamento)
- **Pedido do dono:** trocar os bônus de atributo das cartas por algo mais inovador (não só números), com tiers como os equipamentos, referência do Ragnarok Online adaptada às magias e mecânicas daqui, e um bônus por vocação (todas as classes podem usar; certas classes ganham bônus com certas cartas).
- **Entregue:**
  - **Núcleo** (`src/core/progression/cards.ts`): formato de carta (efeito base + bônus de vocação), tiers, derivação das regras por herói (`cardRuntimeFor`), textos em pt-BR e validação do catálogo (`validarCatalogo`).
  - **Dados** (`src/core/progression/cardCatalog/`): 112 cartas, cada uma com nome do efeito base, nome do efeito de vocação, gatilho, tier e a referência do RO em uma linha.
  - **Motor** (`src/core/sim/cardRules.ts`, ganchos em `Simulation.ts`): gatilhos `start`, `tick`, `hit`, `crit`, `kill`, `hurt`, `lowHp`, `dodge` e `cast`. Efeitos: escudo, cura, bênção, fúria, recargas, lentidão, maldição, congelar, reflexo, golpe extra, veneno e almas. Chances usam o RNG de combate, e cada regra tem a própria recarga.
  - **Apresentação:** texto flutuante com o nome do efeito quando dispara (`cardProc`), tier na moldura e no painel, e resumo do herói com os nomes dos efeitos ativos.
  - **Save:** `cardAttrs` sai do perfil. `cards` é derivado da coleção a cada run. A coleção, os IDs e a fusão não mudam.
- **Decisões:**
  - **D45 — Efeitos por gatilho, não atributos.** Cada carta dá um efeito base para todas as classes e um bônus de vocação, que só a classe indicada recebe.
  - **D46 — Tiers na escala dos equipamentos.** Normais em Comum, Incomum e Raro. Mini-Bosses em Épico e Lendário. MVPs em Mítico. O tier escala a força dos números (×1 a ×2), não a chance de gatilho.
  - **D47 — Vocações distribuídas:** Guerreiro 19, Mago 19, Arqueira 19, Feiticeira 19, Bruxa 18 e Assassino 18.
  - **D48 — Referência do RO.** Cada carta traz o efeito original do rAthena (banco de dados de itens, cruzado pelo nome do monstro), traduzido em uma linha. Oito cartas não têm carta equivalente no rAthena (Femur, Fireblend, Gorgon, Memorial, Mermand, Myomewnee, Rooween e Soldier): o efeito é autoral, inspirado no monstro.
  - **D49 — Golpe extra não critica e não dispara outras cartas.** Evita crítico em cima de crítico e laço de gatilhos.
- **Achados:**
  - O teste da curva de slots (`scripts/cardCheck.ts`) já estava desatualizado desde o commit `56bfa5d`, que mudou `CARD_SLOT_WINS`. A expectativa foi atualizada para a curva vigente.
  - A checagem de save do Bastião agora testa o que importa: o mapa da coleção (`owned`) não vai ao save. Os ids das cartas aparecem nas regras derivadas, como referência.
  - Sem cartas equipadas, o `sim:check` dá exatamente o mesmo resultado de antes (determinismo intacto).
- **Testes:**
  - `npm run build`, `npm run sim:check`, `npm run bastion:check` e `scripts/cardCheck.ts` passam.
  - `cardCheck` cobre: validação do catálogo, pacote, fusão, slots, equipar, regras por classe e tier, migração, revelação e o motor dentro da batalha (início, a cada 1 s, golpe extra, almas, determinismo e nenhum disparo sem cartas).
  - Álbum e painel de detalhe no Chromium headless, sem erro de console. Os nomes dos efeitos aparecem no painel e no resumo do herói.
- **Limitações:**
  - **Balanceamento não testado em partida com cartas equipadas.** Só há checagem de sanidade e determinismo. Números a revisar: golpe extra de 78% do dano em carta Raro, "Tempestade Constante" (congela a cada 5 s) e "Peste Lenta", que os redatores apontaram como os bônus mais fortes.
  - Runs em andamento de saves antigos começam sem cartas (campo `cards` ausente = vazio) até a próxima jornada.
  - Os efeitos são individuais: não há escudo nem cura em área para aliados. Só texto flutuante, sem efeito visual próprio por carta.
  - FPS e memória não medidos.
- **Pendências:**
  1. Playtest com cartas equipadas, para ajustar chances, durações e `TIER_POWER` em `cardCatalog/`.
  2. Decidir se entram efeitos sobre aliados (escudo ou cura em grupo).
  3. Efeitos visuais próprios por tipo de efeito (opcional).

## 2026-10-11 — Muralhas com a peça muros.glb do dono (v0.11, em andamento)
- **Pedido:** trocar as muralhas de todos os mapas, porque as atuais estavam sem textura. Primeiro conferir a ponte (zona `bridge`, "Ponte e Portões de Valdrec") e depois aplicar nos demais.
- **Peça:** o `muros.glb` do dono (9,3 MB, 1 milhão de triângulos, textura JPEG 4096 e mapas de rugosidade) virou `public/models/muros.glb`: 4.002 triângulos, cor em WebP 1024 (375 KB), sem mapas de rugosidade e normal, atributos em Float32 e índices inteiros. Arquivo final: 0,48 MB. O original não entrou no repositório.
- **Decisões:**
  - **D50 — Mesma peça em todas as muralhas.** Cada módulo tem 1 m com torres e ameias nas pontas. Ele é esticado até a altura da muralha com escala uniforme (a pedra não deforma) e repetido ao longo de cada trecho. Cada chamada gera um único InstancedMesh.
  - **D51 — Volta por configuração.** `VISUAL_CONFIG.muralha.glb` (padrão `true`). Com `false`, voltam as muralhas antigas (caixas, paliçada e blocos com ameias).
  - **D52 — Alturas:** cidade 1,3 e castelo 1,4 (como antes); vila 0,9.
  - **D53 — Torres de portão em pedra.** Os corpos das torres (cilindros e blocos) usam a pedra nova, e a paliçada de madeira da floresta sai. Cúpulas e bandeiras mantêm as cores.
  - **D54 — Não mudou:** rochas dos tiles `#` (já são rochas texturizadas do kit), a muralha que o guerreiro constrói (kit `fortress.glb`, já texturizado) e os mapas pintados, cuja muralha está na própria arte.
  - **Castelo:** os tiles `W` viram trechos contínuos de linhas e colunas, com esquinas fechadas e as aberturas dos portões preservadas.
  - Nada muda na grade (`zones.ts`) nem na simulação.
- **Achados:**
  - A auditoria (`auditar_glb.cjs`) acusa "sem esqueleto e sem animação": é esperado numa peça estática.
  - O otimizador do projeto (`scripts/otimizar_glb.mjs`) não lê GLB comprimido com meshopt (`EXT_meshopt_compression`). A peça foi otimizada com um script à parte, fora do repositório.
  - Um primeiro otimizador deixava os índices em Float32, e a GPU recusava a malha (`GL_INVALID_ENUM` em `glDrawElements`). Corrigido e checado pela contagem de triângulos desenhados.
- **Medição** (`stage.sceneStats()`, antes → depois):
  - Ponte: 281 → 279 desenhos; 125.571 → 220.083 triângulos.
  - Castelo: 231 → 229; 1.202.538 → 1.328.682.
  - Floresta (`crookedWood`): 257 → 255; 1.107.010 → 1.208.362.
  - Planície (`dryCrossing`): 196 → 194; 648.688 → 758.968.
  - Vila (`town`): 289 → 287; 95.776 → 158.944.
  - O aumento vem dos 4.002 triângulos por módulo. Se o FPS cair no PC, a saída é otimizar com razão menor (1.500 triângulos já foi testado e mantém a silhueta).
- **Testes:**
  - `npm run build`, `npm run sim:check` (determinístico) e `npm run bastion:check` passam.
  - Capturas no Chromium headless do primeiro mapa (antes/depois, normal e aproximada) e das zonas `bastionKeep`, `crookedWood`, `dryCrossing` e `town`. Sem erro de console.
- **Limitações:**
  - Sob a luz noturna da ponte a pedra fica mais escura que o muro antigo.
  - Os pilares do portão da ponte continuam caixas (texturizadas), e o topo fica azulado pela luz.
  - FPS não medido (sem GPU real aqui).
- **Pendências:**
  1. Dono confirmar a leitura de "muralhas" (cidade, portões, castelo e vila) e se os afloramentos `#` e a muralha do guerreiro ficam como estão.
  2. Guardar o original de 9,3 MB zipado na branch `fontes`, se o dono autorizar.
  3. Registrar o decodificador meshopt no `scripts/otimizar_glb.mjs`.

## 2026-10-12 — Montar Defesa jogável: menu, construção e noites (v0.11, em andamento)
- **Pedido do dono:** menu principal do Montar Defesa e modo funcional; engrenagem discreta no canto do menu; fundo de menu por temporada (a imagem nova ainda não chegou como arquivo).
- **Modo (`src/bastion/bastionSession.ts`):** entra pelo botão Montar Defesa do menu. Enquanto roda, a jornada (run e perfil) fica guardada e a batalha usa a cidade do modo; o save da jornada não é gravado. Save próprio (chave `bastion`).
  - **D50 — Hub do modo:** cidade (núcleo, Zen, noites), Construir, Iniciar noite, Nova tentativa, Reparar núcleo, Cartas e Sair; abas Estruturas, Projetos e Heróis.
  - **D51 — Barra de construção no planejamento:** Muralha de pedra (5 Zen, dobra a cada muralha da cidade) e Torre de tiro (120 Zen, com o projeto Torres de tiro e a Arqueira). Clique numa casa da área liberada constrói; clique numa construção seleciona e mostra reparar, aprimorar e remover.
  - **D52 — Noite:** só pelo botão, sem relógio automático. A batalha usa as construções da cidade e a semente da onda. No fim, `applyNight` aplica vida, Zen, progressão e pacotes, e o relatório mostra "Horda repelida" ou "A horda invadiu".
  - **D53 — Esc:** no planejamento abre o hub; no hub sai ao menu; na barra de construção volta ao hub.
  - **D54 — Zen inicial provisório: 20** (`BASTION.startZeni`), o bastante para as primeiras quatro muralhas antes da primeira onda. Valor a calibrar com o dono.
  - **D55 — Cartas:** a coleção é a mesma da jornada. O botão Cartas abre a coleção com os slots contados pelas ondas vencidas no Bastião.
- **Menu:** engrenagem discreta no canto (ícone `ico_gear` do kit) abre as Opções. O botão Montar Defesa entra no lugar de Opções, com rótulo provisório por cima do botão pintado (a arte atual não tem o botão). Fundo por temporada em `src/config/temporadas.ts` (`temporadaAtual`): a temporada 1 segue com a arte atual até a imagem nova chegar.
- **Achados:**
  - Sem Zen inicial, a cidade nova não conseguia construir nada antes da primeira onda. Por isso o D54.
  - `onCanvasClick` devolve verdadeiro também quando a colocação é recusada: o clique é consumido e o motivo aparece no painel.
  - A jornada-sombra precisa ter a vida do núcleo e a party sincronizadas antes de cada batalha; sem isso, a batalha seguinte reabria com a vida antiga.
  - No navegador de teste (renderização em software) a noite anda a ~0,4 tick/s: uma noite completa levaria ~16 min. Por isso o teste de ponta a ponta encerra a noite por vitória forçada. A duração real foi validada pelo `sim:check` (bastionKeep: vitória em 388 ticks).
  - Os avisos `THREE.BufferGeometry.toNonIndexed` no console são anteriores ao modo (chamadas do cenário e da arte de kit).
- **Testes:** `npm run build`, `npm run sim:check` (determinístico) e `npm run bastion:check` passam. Teste de ponta a ponta no Chromium: menu e engrenagem, hub, construir (2 muralhas gravadas; a terceira recusada por Zen), noite com vitória forçada, relatório, volta ao hub, Esc para o menu, save da jornada intacto, cidade salva com 1 noite e 2 muralhas.
- **Limitações:**
  - Se o jogo fechar no meio de uma noite, a noite recomeça do planejamento (sem selo, ao contrário da jornada).
  - A formação dos heróis não é guardada entre noites: volta ao padrão a cada planejamento.
  - Serviços urbanos (loja, forja, templo) não entram: são a Etapa 5 do plano do Bastião.
  - Com uma estrutura selecionada, o painel de construção rola, e os botões de aprimorar e remover podem ficar abaixo da área visível.
  - Custos, vida, ondas e o crescimento de dificuldade por noite ainda não foram calibrados com o dono.
- **Pendências:**
  1. Dono: confirmar o Zen inicial (D54), os custos e a curva de dificuldade do Bastião.
  2. ~~Imagem nova da tela de entrada e retirada do rótulo provisório do Montar Defesa~~ (feito na entrada seguinte).
  3. Revisar a barra de construção com estrutura selecionada (compactar textos ou rolagem melhor).
  4. Guardar a formação dos heróis entre noites e criar um selo para retomar a noite depois de fechar o jogo.

## 2026-10-12 — Tela de entrada com a arte nova (temporada 1, v0.11, em andamento)
- **Pedido do dono:** a imagem nova (`images/38.webp`, 1752×897) vira o fundo principal do menu. Os botões precisam funcionar, o Ranking mostra valores vivos e a engrenagem continua no canto.
- **Arte e layout:** a arte está em `public/menu/temporada1.webp`, que é a temporada 1 de `config/temporadas.ts`. O layout foi medido nela e fica em `MENU_VISUAL` (`config/visualConfig.ts`), em pixels da arte: botões, peças (esquerda, Ranking e slogan), valores do Ranking, lista de apoiadores, rodapé e a linha "jornada em andamento".
  - **D56 — Botões:** Começar jornada abre a run; Montar defesa abre o hub do Bastião; Info e Donate abrem cartões. A Torre do Infinito fica desativada ("Em breve"): sem reação ao clique e fora da navegação por teclado. Os rótulos já estão pintados na arte, então o menu não escreve texto por cima.
  - **D57 — Ranking:** cada valor de exemplo pintado na arte é coberto por uma capa escura do jogo, ancorada à direita e na altura da linha (`rankValues`). Sem recorde, a capa mostra "???"; com recorde, mostra o valor. A lista de apoiadores segue a mesma regra (`donors`).
  - **D58 — Peças e corte:** quando a tela corta a arte (ex.: 16:9 em janela de outra proporção), botões, Ranking e rodapé são empurrados para dentro da tela. A borda que encosta na tela não esfuma: além dela não há arte, e o esfumado deixaria aparecer a arte de trás fora do lugar.
  - **D59 — Rodapé e engrenagem:** o rodapé é uma caixa opaca por cima da versão antiga pintada na arte ("v0.8c · jogo offline"); o cartão Info já explica o salvamento. A engrenagem foi para o canto inferior esquerdo: no superior direito ela caía sobre o enfeite do Ranking, e embaixo à esquerda não há arte.
- **Achados:**
  - Os valores de exemplo terminam em x≈1700. A borda direita da capa passou para 1704, e o último pixel pintado fica em ~1702.
  - A capa de cada linha precisa de um limite esquerdo próprio: "Fase 15/15" (linha 2) começa em x≈1632, mas a legenda da linha 2 termina em ~1590, então ela começa em 1600. A legenda da linha 3 termina em ~1633, então as demais começam em 1636.
  - Com a borda direita encostada na tela, o esfumado deixava aparecer "Ato", "ne 1" e "87." da arte de trás (corrigido por D58).
  - Medição sem corte: a arte em 1752×897 (escala 1:1) é a referência para todas as coordenadas.
- **Testes:** `npx tsc --noEmit`, `npm run build` e `npm run sim:check` (determinístico) passam. No Chromium: 1600×900 e 1280×720 sem nada fora da tela e sem erro no console; recorte ampliado do canto inferior direito conferido nas duas resoluções.
- **Limitações:**
  - A arte traz a versão antiga pintada ("v0.6.2"). Em 16:9 a caixa do rodapé cobre esse trecho. Em proporções ultralargas (21:9), que não foram testadas, um pedaço do fim da linha antiga pode aparecer à direita da caixa.
  - As posições de `rankValues` e `versionBox` foram medidas nesta arte. Se o dono trocar a arte, é preciso medir de novo.
- **Pendências:**
  1. Dono: conferir no PC (16:9 e outras telas) e dizer se a engrenagem fica no canto inferior esquerdo ou volta para o superior direito.
  2. Dono: decidir se a versão antiga pintada na arte deve ser trocada no arquivo original. Se for, a caixa do rodapé deixa de ser necessária.

## 2026-10-12 — Vocações: duas evoluções por classe e o Bárbaro (v0.11, em andamento)
- **Pedido do dono:** preparar todas as classes para receber 2 novas vocações. O Bárbaro (`barbaridade.glb`) entra como uma das evoluções do Guerreiro.
- **Dados (`src/config/vocations.ts`):** `VOCATIONS` tem duas vagas por classe, e `VOCATIONS_CONFIG.level` define o nível da escolha (10). Vaga `null` = "Em breve" na ficha, sem escolha.
  - **D60 — Escolha única:** ao chegar ao nível 10, o herói escolhe UMA vocação, com confirmação (botão dourado). Vale até o fim da jornada; não há troca depois.
  - **D61 — Bônus de atributo:** a vocação soma atributos (`bonus`) como o equipamento. Pontos gastos e atributos guardados não mudam, então a redistribuição continua normal. Bárbaro: +3 Força e +2 Vitalidade (provisório, a balancear).
  - **D62 — Vagas:** o Guerreiro tem o Bárbaro e uma vaga a definir; as outras cinco classes têm as duas vagas a definir.
  - **D63 — Onde evolui:** na ficha (tecla C), no bloco "Vocação", fora da batalha. O nome da vocação aparece na ficha, no cartão do herói e no mapa.
  - **D64 — Visual:** a unidade de batalha leva `visual` (modelo da vocação) quando esse modelo existe em `HERO_MODELS`; senão usa o modelo da classe. Regras e simulação não mudam.
- **Save:** campo opcional `HeroProgress.vocation`, sem subir a versão. `migrateProfile` tira id que não existe ou que é de outra classe.
- **Código:** `profile.ts` (`vocationOf`, `evolveBlocker`, `evolve`, `heroDisplayName`), `attributes.ts` (`computeStats` aceita bônus de atributo), `Hud.ts` (bloco Vocação), `main.ts` (VM e confirmação). `ConfirmDialog.ask` ganhou o tom `'normal'`; o padrão continua vermelho, para o "Abandonar jornada".
- **Testes:** `npm run vocation:check` (novo): dados, escolha (nível, uma vez, classe certa), atributos (bônus sem virar ponto gasto), save (ida e volta, save antigo, id desconhecido, idempotência). No Chromium: nível 1 bloqueado com aviso; nível 10 liberado; confirmação dourada; nome no painel e no cartão; sem erro no console. Regressão: `build`, `sim:check` (determinístico) e `bastion:check` passam.
- **Limitações:**
  - O Bárbaro ainda usa o modelo do Guerreiro; retrato e corpo inteiro também, porque saem da classe base.
  - As habilidades do Bárbaro são, por enquanto, a árvore do Guerreiro.
  - Nomes na árvore de habilidades, na cidade e no relatório continuam com o nome da classe.
- **Pendências:**
  1. Dono: o `barbaridade.glb` está em `public/barbaridade.glb` na `main` (24,5 MB, 2 milhões de triângulos, texturas de 8192 px, **sem esqueleto e sem animações**). ~~Falta otimizar e dar animação ao modelo~~ (feito na entrada seguinte). O original deve sair do repositório e ir zipado para a branch `fontes`, o que precisa de autorização.
  2. Dono: confirmar a segunda vaga do Guerreiro. O Cavaleiro Rúnico (conjunto de teste) é a candidata natural.
  3. Dono: o nível 10 e o bônus do Bárbaro (+3 Força, +2 Vitalidade) são provisórios.
  4. Dono: desenhar as onze vagas restantes (nomes, modelos e habilidades).

## 2026-10-12 — Bárbaro: modelo do dono com animação (v0.11, em andamento)
- **Pedido do dono:** o `barbaridade.glb` entra como o Bárbaro, a evolução do Guerreiro.
- **Problema do arquivo:** original de 24,5 MB, com 2 milhões de triângulos, texturas de 8192 px, **sem esqueleto e sem animação**. Sem tratamento, o Bárbaro entraria parado.
- **D65 — Auto-rig com juntas medidas:** o projeto já põe esqueleto em malha estática humanoide (auto-rig, usado nos chefes). A detecção automática errou neste chibi: quadril na altura dos joelhos, capa e tiras do quadril presas ao braço. Por isso as juntas foram medidas à mão no corte da malha (`BARBARIAN_JOINTS` em `visualConfig.ts`), com três limites opcionais para o braço (`armZ`, `armMinY`, `armMaxY`). Sem esses campos, o auto-rig age como antes.
- **D66 — Registro `rig: 'auto'`:** o carregador (`glbMonsters.ts`) põe o esqueleto em GLB estático e usa os clipes do jogo. Clipes do Bárbaro: `warriorUAL` (captura UAL no descanso, andar, dano e morte; golpe, investida e conjuração do Guerreiro).
- **D67 — Otimização:** `public/models/barbarian.glb` tem 1,5 MB, 39.758 triângulos e texturas WebP de 1024 px (cor, normal e ORM). O otimizador lê o original comprimido com meshopt, grava em float32 e gira em Y pelo quinto argumento (`-90` para modelo que olha para +X). A limpeza de nomes saiu do script: ela apagava os nomes dos ossos, que o carregador usa.
- **Código:** `autoRig.ts` (parâmetros opcionais; sem eles, igual ao anterior), `glbMonsters.ts` (ramo `rig: 'auto'`), `visualConfig.ts` (`RigJointsVisual`, `BARBARIAN_JOINTS`, entrada `barbarian`) e `vocations.ts` (`modelo: 'barbarian'`).
- **Testes:** `npm run build`, `sim:check` (determinístico), `vocation:check` e `bastion:check` passam. Batalha no Chromium: a unidade do Guerreiro evoluído sai com o modelo `barbarian`, sem erro de página nem de console. O subagente verificou idle, andar, golpe, dano e morte em quadros seguidos; o golpe mostra o arco de ataque, sem rasgo.
- **Limitações:**
  - Retrato e corpo inteiro ainda são os do Guerreiro, com escudo. Isso contradiz a descrição "troca o escudo pela fúria" e precisa de arte nova do dono.
  - O Bárbaro empunha um machado na mão direita (campo `weapons` do registro: `tilt` 35°, `scale` 1,1, como o machado do orc). Conferido em jogo de costas, com câmera de batalha; o ajuste fino fica para o teste no PC.
  - A câmera do jogo mostra as costas do herói; a frente só aparece na vitrine.
  - No golpe, o bracelete da manga que bate fica largo, como placa. É geometria do arquivo, não rasgo.
  - As juntas foram medidas à mão: um chibi novo pode precisar das suas.
- **Pendências:**
  1. Dono: testar no PC, principalmente a câmera de jogo e a fluidez do golpe.
  2. Dono: dizer se o auto-rig serve. Se não servir, o caminho de melhor qualidade é um GLB com esqueleto no padrão do `guerreiro.glb`.
  3. Dono: arte nova de retrato e corpo inteiro do Bárbaro, sem escudo.
  4. ~~Dono: arma do Bárbaro~~ (machado, escolhido pelo dono nesta entrega).
  5. Dono: autorizar mover o original de 24,5 MB do `public/` da `main` para a branch `fontes`, zipado. Ainda não foi feito.

## 2026-10-12 — Bastião: construir travava a tela (v0.11, em andamento)
- **Pedido do dono:** "iniciar horda" bugado, não dava para construir e, depois de construir, a tela inteira travava.
- **Diagnóstico (medido no Chromium):**
  - Cada muralha disparava 10 compilações e 5 links de shader. Os muros vinham de um cache do kit (`fortress.ts`), e o `ObjectView` descartava essa geometria e esse material a cada construção, o que obrigava o WebGL a recompilar. O `bind` também refazia todas as unidades, com o mesmo efeito. Na placa de vídeo a compilação é síncrona, e leva segundos no Windows: esse é o travamento.
  - O cenário do Bastião é pesado: cerca de 1,37 milhão de triângulos e 309 chamadas de desenho por quadro. Neste ambiente sem GPU, um quadro leva cerca de 4,5 s, inclusive sem construir nada.
- **Correções:**
  - `fortress.ts`: as peças do cache são marcadas como compartilhadas.
  - `ObjectView.dispose`: não descarta recursos compartilhados. `GameView.bind` monta o objeto novo antes de descartar o antigo.
  - `GameView.bind(sim, manter)`: no replanejamento do Bastião (`rebuildSim`), as unidades vivas com mesma classe e modelo ficam de pé e são reposicionadas. Nas demais batalhas, o comportamento é o de antes.
- **Testes:** `npm run build`, `sim:check` (determinístico) e `bastion:check` passam. No Chromium: com 2 muralhas, os heróis aparecem desenhados na casa certa; "Iniciar noite" entra na fase de batalha, sem erro de página nem de console. Depois da correção, a construção não dispara mais compilação de shader.
- **Limitações:** o quadro do Bastião continua pesado (triângulos). Em PC com GPU a expectativa é de quadros bem mais rápidos, mas isso não foi medido aqui.
- **Pendências:**
  1. Dono: testar no PC (construir, mover herói, iniciar horda) e dizer o que ainda trava ou quais erros aparecem na horda.
  2. Se ainda pesar: reduzir os triângulos do cenário do Bastião (grama e muros). Precisa de decisão visual sua.

## 2026-10-12 — Bárbaro com socos e roleta que encerra no clique (v0.11, em andamento)
- **Pedido do dono:** (1) clicar no meio da tela durante a roleta deve encerrar o giro na hora; (2) o machado do Bárbaro ficou ruim: trocar por socos, usando as animações do pacote Universal Animation Library (Standard) que o dono enviou.
- **D68 — Socos com a UAL:** `Punch_Jab` (soco rápido, no golpe básico) e `Punch_Cross` (soco cruzado, na investida) entram no conjunto `barbarianUAL`. Descanso, andar, dano e morte seguem da UAL; a conjuração segue o procedural do Guerreiro. O Bárbaro não tem arma: o registro não traz mais `weapons`.
- **D69 — Extração:** `scripts/extractUALAnims.mjs` passou a extrair os dois socos, e `ualClips.ts` foi regerado. A regeneração só acrescenta clipes; o único trecho trocado é a união de tipos. O pacote da UAL não está no repositório: o script aponta para a pasta dele.
- **D70 — Sem arco de lâmina:** o Bárbaro não ganha o tufão de vento do golpe nem o arco da investida do Guerreiro. O impacto segue com o efeito normal de dano.
- **D71 — Roleta:** um clique em qualquer lugar da tela durante o giro encerra o giro no quadro seguinte. O prêmio aparece, e o botão Pegar só libera depois disso.
- **Testes:**
  - `npm run build`, `sim:check` (determinístico), `vocation:check` e `bastion:check` passam.
  - Bárbaro no Chromium, em quadros determinísticos com câmera de batalha: repouso sem arma, soco rápido com o braço à frente e soco cruzado com os dois braços. Sem erro de página nem de console.
  - Roleta no mapa, com clique real do mouse: o prêmio aparece 65 ms depois do clique (antes o giro levava 5,2 s), e o botão Pegar, clicado com o mouse, fecha o véu.
- **Limitações:**
  - Com o menu principal aberto (a demonstração F9 da roleta, no menu inicial), o clique não chega ao véu: a camada do menu (z-index 100) fica acima da roleta (75). O problema já existia; as recompensas reais abrem no mapa, onde o clique funciona. Não foi alterado.
  - A pose foi conferida em quadros parados, e o brilho de combate cobre parte do corpo. A fluidez em tempo real só se confirma no PC.
- **Pendências:**
  1. Dono: testar no PC o ritmo do soco (0,87 s) e dizer se combina com o combate.
  2. Dono: arte nova do retrato e do corpo inteiro do Bárbaro (ainda do Guerreiro, com escudo).
  3. Dono: autorizar mover o original de 24,5 MB do `public/` da `main` para a branch `fontes`, zipado.

## 2026-10-12 — Último Bastião: construir deixa de esperar o disco no executável (v0.11, em andamento)
- **Pedido do dono:** o modo defesa "ainda está bem travado" depois da correção de shaders.
- **Diagnóstico (medido no Chromium, com renderização por software):**
  - O JavaScript não pesa: em 14 s de construção, 99% do tempo do perfil fica em código nativo (renderização e driver); coleta de lixo, 42 ms.
  - O quadro do planejamento é limitado por preenchimento de pixels: sem os passes de pós-processamento, o quadro cai de ~4,6 s para ~1,9 s; com a resolução pela metade, cai na mesma proporção. Os triângulos (1,36 milhão por quadro, dos quais ~670 mil na passagem de sombra) pesam menos: sem sombra, só ~5%.
  - **Causa provável no executável (não reproduzível aqui):** cada ação do Bastião salvava por IPC síncrono. O processo principal faz duas leituras JSON do save, um `fsync`, uma cópia `.bak` e a troca do arquivo, e a tela fica parada até terminar. No Windows, com antivírus, isso pode levar centenas de milissegundos por construção. No navegador de teste o save vai para `localStorage`, por isso a trava não aparece lá.
  - Tentativa descartada: MSAA só no desenho da cena, em vez de no compositor inteiro. A imagem ficou igual (diferença média de 0,03 por canal), mas o quadro não mostrou ganho confiável (a variação do ambiente chega a ±30%). Desfeita.
- **D72 — Bastião em segundo plano:** o save do Último Bastião usa `SaveStore.setLazy`. O cache muda na hora; o disco recebe a versão mais nova em segundo plano, uma escrita por vez. Falha no disco vira aviso (`onWriteError`). Ao fechar a janela, `SaveStore.flush()` grava o que estiver pendente.
- **D73 — Jornada e conquistas seguem síncronas:** o selo de batalha depende de o save estar no disco antes da horda. Por isso `run` e `meta` continuam com `set` (espera o disco).
- **Código:** `src/save/SaveStore.ts` (fila), `electron/main.cjs` (gravação compartilhada, síncrona e assíncrona), `electron/preload.cjs` (`writeAsync`), `src/env.d.ts`, `src/main.ts` (aviso e flush ao fechar), `src/bastion/bastionSession.ts`.
- **Testes:**
  - `tsc --noEmit` e `node --check` nos arquivos do Electron passam.
  - Teste da fila com disco simulado (12 verificações): não espera o disco; rajada de 50 vira 2 envios, com a última versão por último; falha chega ao aviso; flush grava o pendente; jornada segue síncrona.
  - Regressão no navegador: construir grava a cidade (estruturas de 0 para 1), sem erro de página nem de console.
- **Limitações:**
  - O executável Electron não roda neste ambiente: o ganho de tela no Windows precisa de teste no PC.
  - Um fechamento forçado (queda de energia, processo morto) nos milissegundos depois de uma construção pode perder só essa última ação do Bastião. O fechamento normal grava tudo.
  - O quadro do planejamento continua pesado por causa da placa de vídeo. Nenhum visual foi alterado.
- **Pendências:**
  1. Dono: testar no PC construir muralhas e dizer se a trava sumiu.
  2. Dono, se ainda pesar, são decisões visuais: (a) sombras só no cenário fixo durante o planejamento; (b) MSAA 2× no preset Alto; (c) reduzir os triângulos das árvores e arbustos com sombra (~610 mil triângulos).
  3. Alternativa imediata: preset Médio ou Baixo em Opções → Vídeo.

## 2026-10-12 — Animações: morte completa, andar no ritmo do passo e chefes com anel (v0.11, em andamento)
- **Pedido do dono:** refinar as animações de personagens e monstros (auditoria, integração, combate, mortes), sem mudar mecânica.
- **Auditoria (somente leitura, dois auditores + medição no navegador sem desenho):**
  - Pacote UAL: a pasta `Universal Animation Library[Standard]` **não está no repositório**. Só existe uma cópia de trabalho fora dele (`scratchpad`, 43 animações). Os geradores (`scripts/extractUALAnims.mjs`, `scripts/retargetUALMixamo.cjs`) apontam para caminhos que não existem aqui.
  - Clipes usados: os da UAL (morte de 2,4 s; ataque, andar e parado), os embutidos nos GLB de rato e goblin (7 nomes exatos) e os procedurais (zumbis, orcs, fallbacks).
  - Morte: o corpo sumia em 1,76 s, mas a morte da UAL dura 2,4 s. A morte era cortada.
  - Monstros ficavam parados durante o adiamento do impacto (0,28 s): a view pulava unidades que a simulação já tinha tirado.
  - Andar e parado: os inimigos paravam 1 tick (0,1 s) quando presos na fila, e o andar só esperava 0,18 s antes de virar parado. Cada espera virava um piscar.
- **Correções feitas:**
  1. **Morte completa:** o corpo fica até o clipe de morte terminar e só então desvanece (mínimo de 0,4 s). Herói: corpo na cena por 2,80 s (antes 1,76 s).
  2. **Morte adiada sem congelar:** o corpo segue o clipe até o golpe chegar. Verificado: o clipe avança durante a espera.
  3. **Andar no ritmo do passo:** a velocidade do ciclo acompanha a cadência real (passo de 0,5 s = velocidade-base; passo mais longo anda mais devagar; passo curto, mais depressa). Limites de 0,5 a 1,6.
  4. **Parado só depois de um tempo:** inimigo espera 0,45 s antes de virar parado (antes 0,18 s). Medido em 10 s de horda: quedas de andar para parado de 15 para 1; fração de tempo parado de 4,3% para 0,5%.
  5. **Brilho de combate pelo clipe:** a duração do espectro acompanha o clipe que está tocando (antes 0,55, 0,4 e 0,85 s fixos).
  6. **Chefe de ato com anel e sombra:** o anel de energia e a sombra usavam o nome do modelo (`ratBoss`), não o tipo da simulação (`boss`), e nunca apareciam. Verificado: anel e sombra presentes.
  7. Anel de chefe some junto com a morte.
- **Correção de registro (D70):** o tufão de vento do Guerreiro **nunca apareceu ao vivo**: o handler de classe consome golpe e investida antes do caso padrão do `GameView`. A condição que pus para o Bárbaro nesse ponto não tinha efeito; foi desfeita. A descrição de D70 estava errada.
- **Testes:**
  - `tsc`, `npm run build`, `sim:check` (determinístico), `bastion:check` e `vocation:check` passam.
  - Horda sem desenho, 600 quadros: piscar de andar para parado (ver item 4).
  - Morte pelo caminho do jogo (`sim.damage` + entrega dos eventos à view): herói 2,80 s, inimigo 1,76 s, clipe de morte desde o começo.
  - Visual: quatro quadros da morte do herói (1,0 s caído; 1,8 s desvanecendo; 2,6 s fora da cena).
  - Chefe de ato: anel e sombra presentes. Ritmo do andar: passo de 0,5 s dá 1,3 (rato) e passo de 0,3 s dá 3,84 (corredor), como calculado.
  - Sem erro de página nem de console em nenhum teste.
- **Limitações (dependem de clipe, dado ou rig que não está no pacote):**
  - O dano visual ainda aparece em tempo fixo (0,26 a 0,30 s) depois do início do ataque. O pacote não traz marcadores de impacto por clipe. *(Resolvido para o Bárbaro e os dinossauros; ver a entrada seguinte.)*
  - A barra de vida mostra o HP da simulação, que cai antes do impacto. *(Resolvido; ver a entrada seguinte.)*
  - Postura de combate própria por classe: o pacote tem `Sword_Idle` e `Spell_Simple_Idle_Loop`, mas os heróis usam rig Mixamo e precisam de clipes regenerados.
  - Reação por direção (`Hit_Head`, `Hit_Chest`, `Hit_Knockback` existem no pacote): o jogo usa um só clipe de reação.
  - Hit-stop congela animações e efeitos, não o deslocamento (até 0,3 s de deslizamento).
  - Pesos de pele do bongun: só as quatro maiores influências são lidas.
  - Nada de PC testado; GPU não medida.
- **Pendências:**
  1. Dono: confirmar onde está o pacote UAL no repositório (ou autorizar que o cópia de trabalho entre no repo) para integrar os clipes que faltam. *(Resolvido: o dono respondeu "1 sim" e o pacote foi copiado para o repositório.)*
  2. Dono: testar no PC morte e andar de monstros e dizer se o ritmo do andar combina.

## 2026-10-12 — Animações: impacto no golpe, reação forte e pacote UAL no repositório (v0.11, em andamento)
- **Pedido do dono:** "1 sim", para copiar o pacote UAL para o repositório. Assim o extrator reproduz os clipes.
- **Pacote no repositório:** `Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb` (7,6 MB, 43 animações, 65 ossos), abaixo do limite de 8 MB. Não entra no build: o jogo lê os clipes de `src/render/units/model/ualClips.ts`, gerado por `scripts/extractUALAnims.mjs`.
- **Mapeamento:** `Punch_Jab` → golpe rápido do Bárbaro; `Punch_Cross` → investida; `Hit_Head` → reação forte (`hitHeavy`); `Sword_Attack` → ataque (disponível, ainda sem conjunto que o use). Dinossauros e bongun usam o `Punch_Jab` pelo retarget Mixamo (mesma duração, 0,867 s).
- **Instante do impacto medido no clipe** (pico de velocidade da mão): `punchJab` 0,167 s, `punchCross` 0,233 s, `Sword_Attack` 0,400 s (`UAL_IMPACT`). Cada modelo leva o seu (`ModelDef.impact`, preenchido a partir de `SET_IMPACT` em `anims.ts`). Sem medida, vale o tempo padrão de 0,28 s.
- **Correções:**
  1. **Dano no impacto:** o número e a reação saem no instante do golpe, não em tempo fixo. Medido: o golpe do Bárbaro sai no quadro de 0,183 s (0,167 s mais um quadro de arredondamento); o do dinossauro, igual.
  2. **Barra de vida no impacto:** antes, a barra descia no instante do golpe, antes do número. Agora mostra a vida de antes até o impacto e a nova depois. A simulação passa `hpBefore`/`hpAfter` no evento de dano (campos opcionais; eventos de demonstração não os têm). Medido: barra em 100% até o impacto e em 60% depois (vida da simulação: 60).
  3. **Reação forte:** golpe com 20% ou mais da vida máxima (`heavyHitFrac`) troca a reação do Bárbaro para `hitHeavy`. Medido: disparou 0,283 s após o golpe.
  4. **Ataque repetido:** o segundo golpe recomeça do zero (antes, continuava do meio do clipe). Medido: 0,1 s antes do segundo golpe e 0 logo depois.
  5. **Dinossauros:** o ataque toca o clipe de soco, e o dano sai no impacto (medido).
- **Testes:**
  - `tsc`, `npm run build`, `npm run sim:check` (determinístico) e `npm run vocation:check` passam.
  - `scripts/validateUAL.ts` agora inclui o conjunto do Bárbaro (socos e `hitHeavy`): todas as faixas apontam para ossos que existem; o quadril desloca no máximo 0,12 m (na morte), contra o limite de 0,6 m.
  - Sem desenho (`impacto_barbaro`, `impacto_dino`, `verif_anim`, `morte_teste2`): tempos e barra conferidos, sem erro de página nem de console.
  - Com desenho (print): soco com inimigo colado (número 40 no quadro de 0,25 s, depois do impacto) e reação forte (`hitHeavy`, número 61 no impacto). Visto de cima, a extensão do braço no soco fica pouco legível.
  - Linha do tempo de 600 quadros: não comparada com as referências guardadas. Cada execução sorteia outra horda (as duas referências antigas já divergem entre si), então essa comparação não prova nada. A prova de que a simulação não mudou é o `sim:check`.
- **Limitações (ainda valem):**
  - Reações de direção (`Hit_Chest`, `Hit_Knockback`): não integradas; a simulação não tem knockback.
  - Postura de combate própria por classe: pendente (precisa de clipes do rig Mixamo regenerados).
  - Corredor (`Sprint`): não integrado; os monstros usam o andar com cadência.
  - Guerreiro comum, mago e arqueira: sem medida de impacto (usam 0,28 s).
  - Hit-stop congela animação e efeitos, não o deslocamento.
  - `scripts/retargetUALMixamo.cjs` ainda aponta para um caminho temporário do Windows; não foi regenerado nesta entrega.
  - PC e GPU não medidos.
- **Pendências:**
  1. Dono: testar no PC o soco e a reação forte do Bárbaro, e dizer se o soco parece bem visto de perto.

## 2026-10-12 — Montar Defesa travava: erro de barreira matava o laço; chão em camadas mais leve (v0.11, em andamento)
- **Pedido do dono:** o Montar Defesa segue travado. Menus respondem, mas o Emperium para de girar e iniciar a horda também trava.
- **Causa (verificada, não só lida):** no Bastião a party padrão é Guerreiro + Mago, e o setup começa sem barreira (`barriers: []` em `src/config/zones.ts`). Com o Mago na formação, `linePlan` devolvia `{ plan: undefined }` e `lineTiles` lia `plan.orientation`: **TypeError a cada quadro** ao (a) passar o mouse sobre um tile vazio do campo (`pointermove` → `grabbableAt`) ou (b) selecionar um dos botões de Barreira de Fogo da barra (`drawOverlay`, a cada quadro). `frame()` não tinha `try/catch` e só agendava o próximo quadro no fim, então o laço morria e a cena congelava com os menus ainda clicáveis. Só recarregar a página resolvia.
- **Antes e depois (Chromium headless, mesma máquina):**
  - HEAD `e631cd7`: clicar no botão de Barreira gera `reading 'orientation'` e 0 quadros em 3 s. Mouse sobre o campo gera o erro e os quadros caem de 2 para 0.
  - Com a correção: nenhum erro nos dois gatilhos, e o laço segue (43 quadros durante o movimento do mouse). Forçando um erro em todo quadro, o laço segue (241 quadros em 4 s), com um aviso no console e um na HUD.
- **Correções:**
  1. `linePlan` devolve `undefined` quando não há barreira; `lineTiles`, `isLineEnd`, `rotateLine` e `grabbableAt` deixam de quebrar. Guardas também em `onOrientation`, `placeTool` e no destaque do hover (`drawOverlay`).
  2. A ferramenta de barreira só fica disponível se o setup tem a barreira (`toolAvailable`). Antes aparecia na barra e não fazia nada.
  3. `frame()` agenda o próximo quadro antes do trabalho e envolve o desenho em `try/catch` (`drawFrame` + `reportFrameError`, um aviso por mensagem). Isso é rede de segurança: a causa acima é a correção.
- **Desempenho (o outro lado do problema):** o chão tinha 10 camadas transparentes do tamanho do mapa, e cada pixel era misturado até 10 vezes, mesmo com a máscara vazia (40 a 99% dos tiles de cada camada são vazios). Agora cada camada desenha só os tiles com tinta, com 1 tile de margem para a amostragem bilinear. UV e normal seguem o plano original, então a imagem não muda.
  - Medido no Bastião (SwiftShader, só como proporção): 0,27 para 0,40 fps. Com o chão transparente desligado, teto do ganho: 0,49.
  - Visual: recorte ampliado 3x idêntico. Diferença de pixels de 1 a 8 níveis, no ruído de precisão. Controle com o mesmo código: diferença média 0,011, contra 0,41 da mudança fora da região do herói, sem forma de costura. Zonas de floresta usam o mesmo chão, então também ganham.
- **Hipóteses descartadas por medição:** compilação de shader na noite (pré-compilar não muda o início); vazamento de cena (3 entradas, mesmos 695 mil triângulos); pool de partículas (ocultar não muda); brilhos e Emperium isolados (não mudam nada).
- **Presets no Bastião (SwiftShader, depois da correção):** Alto 0,40 fps, Médio 0,51, Baixo 0,98. O padrão do jogo é Alto.
- **Investigação:** workflow com quatro frentes (cena, pipeline de render, laço de quadros, início da noite), cada causa refutada por um revisor cético. Confirmou o laço (era a hipótese mais forte). Refutou o decor como causa do travamento: ele custa fps, mas não para o quadro.
- **Testes:** `npm run build`, `npm run sim:check` (determinístico), `npm run vocation:check`. Regressão: horda normal com Mago e 3 barreiras (mouse sobre 16 tiles, sem erro); fluxo do Bastião (construir 8 muralhas, iniciar a noite, recarregar com o save, nova noite, sem erro).
- **Limitações:** SwiftShader não é a GPU do dono, então os números valem só como proporção. Nada foi testado no PC.
- **Decisões e pendências do dono:**
  1. Barreira de Fogo no Bastião: hoje a ferramenta fica oculta no Bastião, porque o campo não tem barreira. Dar barreiras ao padrão do Bastião muda o balanço do Mago, então depende de aval.
  2. Testar no PC (`BAIXAR_DO_GITHUB.bat`, depois `ATUALIZAR_JOGO.bat`). Se o campo ainda estiver lento, testar a Qualidade Médio ou Baixo em Opções → Vídeo e dizer o fps.
  3. Próximos cortes de custo, se precisar, por ordem e sempre medindo antes: camadas de água sem sombra; sombra do mapa atualizada só quando a câmera ou a construção muda; MSAA 2x no preset Alto; sombra só em árvores e muralha (decor pequeno sem sombra); decor em blocos espaciais para o recorte de tela.

## 2026-10-12 — prévia, muralhas livres, mover recentes, horda ordenada e caminho aberto no Bastião (v0.11, em andamento)
- **Pedido do dono:** tornar o Bastião mais interativo: (1) prévia translúcida da muralha ou torre no tile do cursor, mostrando onde e como fica; (2) muralha em qualquer região do mapa (torre segue nos lotes azuis); (3) monstro só ataca muralha quando não tem mais caminho até o portão, então várias muralhas podem fechar todos os caminhos; (4) muralha construída no turno de planejamento pode ser movida até a noite começar, e depois fica fixa; (5) zoom da câmera limitado um pouco; (6) horda com todos os inimigos do jogo, com mini-chefe a cada 5 "níveis" e MVP a cada 10.
- **Decisões tomadas sem o dono (conferir):**
  - "Nível" = a noite que vem: vitórias da cidade + 1. A contagem vem da cidade, então atravessa tentativas.
  - Ordem dos chefes: noites 5, 15, 25, 35, 45, 55 têm mini-chefe em ciclo (Elite, Krexx pequeno, Krexx retorcido, Dino, Líder goblin, Elite). Noites 10, 20, 30 têm MVP em ciclo (Colosso, Colosso Solar, Senhor Orc), e depois repetem.
  - Noites comuns: 60 inimigos; zumbis 40%, corredores 24%, pesados 14%, Raydric 12%, necromantes 10%.
  - Mover é de graça e pode ser repetido no mesmo turno. Depois de mover, o modo de mover sai (é preciso clicar em Mover de novo). Torres não movem; muralha destruída não move.
  - O turno avança também na derrota.
  - Zoom: limite global 1,9 → 1,5 (e 1,75 → 1,5 no cenário pintado), porque a câmera é compartilhada com a campanha.
  - Muralha só é quebrada quando a unidade não tem caminho aberto até o alvo, decidido por unidade. Sem estrutura de pé, o pathing é o de antes: a saída do `sim:check` continua idêntica à linha de base.
  - Esc com a Coleção aberta agora a fecha, como o tooltip "Fechar (Esc)" já prometia. Isso vale também na campanha.
- **O que foi feito:**
  - Core: `src/core/bastion/horde.ts` (ordem da horda, função pura); `rules.ts` (colocação sem checagem de rota, `checkMove` e `moveStructure`, `applyNight` avança o turno); `bastion.ts` (campos `turn` e `placedTurn`, migração).
  - Simulação (`Simulation.ts`): campos abertos, com muralha como obstáculo, usados só quando há estrutura de pé; foco e provocação sem caminho aberto não travam mais a noite.
  - Interface: `BastionGhostView.ts` (prévia com o modelo real translúcido, contorno e anel de alcance da torre); `BastionSession` (modo de mover, Próxima horda); `BastionHub`; `BastionBuildPanel`; `Collection` (Esc e retorno ao Bastião).
  - Heróis não entram em tile com construção nem sobre a formação padrão, e reconstruir com herói no tile é recusado.
- **Revisão:** três revisores adversariais (pathing, regras e save, interface). Corrigidos: foco e provocação travando a noite; ordem dos mini-chefes; `boss` `undefined` em noite comum (agora `null`); herói sobre muralha sumia da batalha; Cartas sem volta ao Bastião; modo de mover preso depois de mover; textos e comentário do zoom.
- **Testes:**
  - `npx tsc --noEmit`, `npm run build`: passam.
  - `npm run sim:check`: saída idêntica à linha de base (determinístico).
  - `npm run bastion:check`: 212 checagens ok, sem falha.
  - `npm run bastion:path` (novo): brecha, cerco, bolsão, anel com herói murado, corredor com fila, determinismo.
  - `npm run vocation:check`: passa.
- **Navegador (Chromium, SwiftShader; não é a GPU do dono):** hub mostra "Próxima horda: Noite 1 · comum"; prévia verde "Pode construir aqui por 5 Zen" num tile fora do lote; muralha colocada (Zen 20 → 15, `placedTurn` 0); "Mover" habilitado; mudou de tile sem custo; zoom parou em 1,5; sem erro de página nem de console. Prints guardados no scratchpad da sessão, não versionados.
- **Limitações e pendências técnicas:**
  - A formação dos heróis não é guardada entre noites: volta ao padrão a cada noite. Pré-existente.
  - Anel de muralhas do Guerreiro (`shieldWall`) com bastião de pé ainda trava o foco na campanha e no Bastião. Pré-existente; o patch de correção ficou pronto no scratchpad, mas não foi aplicado (muda a campanha quando há escudo).
  - Fogo conta como caminho aberto (o custo do fogo é finito), então a horda atravessa fogo antes de quebrar. O mapa do Bastião não tem fogo, então é latente.
  - Golpe corpo a corpo atravessa a quina de muralha (`adjacentHero` usa Chebyshev). Pré-existente.
  - A armadilha da Arqueira (`pathAhead`) ainda usa o campo de quebra.
  - Remover uma muralha fixa e erguer outra noutro lugar é uma forma de mover depois da noite, com perda do reembolso parcial. Precisa de decisão do dono.
  - Aviso `toNonIndexed` no console vem de `fortress.ts`, `Emperium.ts` e `BiomeScenery.ts`. Pré-existente.
  - Desempenho medido só no SwiftShader; FPS na GPU do dono não medido.
- **Pendências do dono:**
  1. Testar no PC: prévia, mover, Próxima horda, zoom (`BAIXAR_DO_GITHUB.bat`, depois `ATUALIZAR_JOGO.bat`).
  2. Confirmar a ordem dos mini-chefes. Como a ordem é a declarada, os 13 inimigos só aparecem até a noite 45.
  3. Confirmar se o turno também avança na derrota.
  4. Decidir se mover sai do modo depois de cada movimento (hoje sai) e se remover-e-reerguer deve ser barrado.
  5. Confirmar se o limite de zoom vale para a campanha também (hoje vale).
- **Commits:** `35153a7` (feature), `742b601` (correções da revisão) e o commit de documentação desta entrada.

## 2026-10-12 — Esc fecha tudo, zoom por modo, modelos da horda e derrota zera (v0.11, em andamento)
- **Respostas do dono às decisões da entrada anterior:**
  1. Nível da horda atravessa tentativas: "sim". **Contradição:** a resposta 3 mandou zerar tudo na derrota, inclusive o nível. Implementei a resposta mais recente (zera), e a pergunta fica aberta abaixo.
  2. Não há limite de noites: a rotação dos chefes segue sem fim. A horda usa só modelos de alta qualidade, com prioridade para qualidade sobre desempenho.
  3. Turno não avança na derrota. A derrota zera e o jogador recomeça do 0. O dono escolheu "Tudo, inclusive o nível da horda" entre as três opções.
  5. Zoom: a campanha volta a 1,9 (mapa pintado 1,75). O Bastião tem limite próprio de 1,5, em `VISUAL_CONFIG.cameraControl.bastion`.
  6. Esc fecha todos os menus de uma vez.
- **O que foi feito:**
  - **Zoom (commit 2182c35):** `Stage.setZoomProfile('campaign' | 'bastion')`, chamado ao entrar e sair do Bastião.
  - **Esc (commit dc695b9):** registro de janelas em `src/ui/overlays.ts`. Um Esc fecha todas. Sem janela aberta, o padrão segue: a campanha pergunta sobre voltar ao menu; o Bastião abre o hub. Esc em campo de texto só tira o foco; Esc com o modo de mover cancela o movimento antes de tudo.
  - **Modelos (commit aa63412):** o Bastião roda no ato 0 (ratos), mas `currentAct()` não acha região para `bastionKeep`, então `ACT_MONSTERS` nunca era aplicado: grunt, runner, brute, necro, elite, boss e boss2 saíam procedurais. Agora `BASTION_MONSTERS` (dados em `visualConfig.ts`) dá a cada tipo o seu GLB: comuns = zumbis, necromante = Bongun, elite = orc com machado, raydric e mini-chefes com os modelos dedicados, chefes com ratochefe, goblinboss e orcLord.
  - **Derrota zera (ainda sem commit no momento desta entrada; ver commit seguinte):** `startAttempt` (Nova tentativa, agora "Recomeçar do zero") zera cidade (estruturas, projetos só o castelo, núcleo cheio), noites (a horda volta à noite 1 e os ciclos de chefe recomeçam) e heróis (perfil novo, nível 1, sem equipamento; a party escolhida é mantida). A derrota não avança o turno. Mantidos: recordes, número de tentativas, semente, coleção compartilhada e o total de vitórias (`records.totalNights`, novo), que alimenta pacotes e slots. O socorro foi removido da abertura do modo, porque o recomeço já devolve Zen e núcleo.
- **Testes:**
  - `tsc --noEmit`, `npm run build`: passam.
  - `npm run sim:check`: saída idêntica à linha de base.
  - `npm run bastion:check`: 233 ok, sem falha.
  - `npm run bastion:path` e `npm run vocation:check`: passam.
  - Navegador (SwiftShader): zoom campanha 1,9, Bastião 1,5, mapa pintado 1,75, zero erro de console. Esc fecha 5 janelas de uma vez. Derrota forçada com muralha: "Recomeçar do zero" leva a tentativa para 2, zera noites e estruturas, devolve 20 Zen, mantém `totalNights` em 3, sem erro.
- **Decisões que precisam de confirmação do dono:**
  1. Nível da horda: o "sim" (atravessa tentativas) e a resposta de zerar tudo se contradizem. Hoje vale zerar tudo.
  2. Heróis também voltam ao nível 1 e sem equipamento ("tudo"). Se só a cidade deve zerar, muda uma linha em `startAttempt`.
  3. Pacotes e slots contam todas as vitórias, para o recomeço não tirar slots de cartas.
  4. Família dos comuns: zumbis, e não ratos. Colosso da Clareira = ratochefe; Colosso Solar = goblinboss; Senhor Orc = orcLord (o da campanha).
  5. Socorro: a função `rescueIfStuck` e a configuração ficaram sem uso na abertura do modo. Podem sair.
- **Pendências técnicas:**
  - Bongun: `auditar_glb.cjs` aponta pose de descanso divergente do bind, mais de 4 ossos por vértice e canais STEP. O registro de `zombieNecro` não usa `bind: 'ibm'`. Se a malha sair torta no Bastião, a correção vale também para a campanha.
  - `goblin_warlord.glb` não foi auditado (erro de byteStride no script), mas carrega no jogo.
  - Fotos de identificação dos 13 tipos não separaram cada um com segurança no zoom padrão; falta uma foto de perto.
- **Commits:** `2182c35` (zoom), `dc695b9` (Esc), `aa63412` (modelos) e o commit de derrota e documentação desta entrada.

## 2026-10-12 — confirmações do dono sobre a derrota e remoção do socorro (v0.11, em andamento)
- **Respostas do dono:** 1) zerar tudo (nível da horda incluído); 2) heróis e cidade zeram juntos; 3) os slots de carta não resetam (vêm do total de vitórias de todas as tentativas); 4) e 5) de acordo com as decisões de família dos monstros e de remover o socorro.
- **Feito:** socorro removido por completo (configuração `BASTION.rescue`, `rescueIfStuck`, campo `rescuedAttempt` e os testes). Saves antigos com o campo continuam abrindo: a chave extra é ignorada.
- **Testes:** `tsc`, `build`, `bastion:check` (229 ok, sem falha), `bastion:path`, `vocation:check` passam; `sim:check` idêntico à linha de base.
- **Pendências técnicas que continuam:** bongun (pose e bind, ver entrada anterior) e identificação de perto dos 13 tipos no Bastião.

## 2026-10-12 — muralhas com o módulo do castelo e faixa lateral fechada no Bastião (v0.11, em andamento)
- **Pedido do dono (screenshot):** os monstros andavam pelo lado do forte e as muralhas do jogador pareciam peças de lego.
- **Caminho:** medido, a volta é o caminho aberto mais curto. Com o portão oeste fechado, a horda dá a volta pela faixa de 1 tile entre o fosso e a muralha oeste e entra pelo norte ou sul. Não é travamento nem deriva. O dono escolheu tampar a faixa no mapa.
- **Por que rocha e não raiz:** a primeira tentativa usou 11 raízes (`roots`). Um pesado quebra a raiz e a volta volta. Troquei por rochas (`R`, parede de terreno com decoração de rocha), que já existem no jogo e não quebram. São 11 tiles, e saíram 11 tiles de lote de construção (850 para 839).
- **Muralha:** as muralhas do jogador agora são uma peça só por trecho, com a mesma peça, altura e espessura das muralhas do castelo. Muralhas vizinhas se emendam em retas, cantos, T e cruzes. Muralha isolada de um tile ainda fica curta: falta uma peça de um tile da arte do dono.
- **Testes:** `tsc`, `build`, `bastion:check`, `bastion:path` (seções 7 e 8 novas) e `vocation:check` passam. `sim:check`: só a linha bastionKeep mudou (abatidos 25 → 28, invasões 35 → 32), as outras idênticas. Navegador: sem erro de console.
- **Pendências:** confirmar com o dono se as rochas ficaram bem vistas de perto na faixa; peça de muralha de um tile da arte do dono; ver se o layout real dele tem um terceiro bloco (fechar o portão exige 3 muralhas, porque os tiles x=22 não são construíveis).

## 2026-10-13 — pedra clara da ponte, praça e barreira com a arte do SUPERPACK (em andamento)
- **Pedido do dono:** o chão de pedra da ponte está escuro e tem que ser claro; cidade não é feita de pedra daquele jeito; a barreira da cidade também precisa do rework. Aplicar o máximo do pacote substituindo o antigo, começando por campanha e Bastião.
- **Análise do pacote (`SUPERPACK/`, untracked, não versionado):** o kit Medieval Village MegaKit tem os blocos de pedra certos (`T_Brick`, `T_UnevenBrick`, `T_RockTrim`). As texturas de pedra do `Textures/` (`Rocks_Diffuse`, `PathRocks`) são verde-escuras e não servem para cidade. `Rocks_Desert` é arenito claro, guardado para deserto.
- **Feito:**
  - Novas texturas em `public/textures/cidade/` (WebP 1024 px): `pedra_bloco_claro.webp` (tabuleiro, muralhas, cais, escada), `calcamento_praca.webp` (praça), `pedra_aparada.webp` (ainda sem uso).
  - `bridgeTextures.ts`: a pedra pintada em canvas (`wallBlockTexture`) virou `pedraBlocos()`, com a textura do dono. A lateral da ponte continua com o arco pintado, e os blocos entram quando a imagem chega.
  - `BridgeScenery.ts` e `CityGate.ts`: tabuleiro, praça, cais, escada e muralhas com as texturas novas. Cor da praça de `0xc4c8d0` para `0xffffff` (o tom azulado escurecia a textura).
  - `muralhaGlb.ts`: a barreira (`muros.glb`) usa `pedra_bloco_claro` no lugar do mapa embutido no GLB, que era escuro. Vale para a campanha, o castelo e o Bastião.
  - `naturKit.ts`: `imageOf` exportado para reutilizar o cache de imagem.
  - Removido `public/textures/pedras/pedra_lousa.webp` (sem referências no código).
- **Testes:** `tsc --noEmit` e `npm run build` passam; `npm run sim:check` com `determinístico: true` (sem mudança no core). Navegador (Chrome do Windows via playwright-core, SwiftShader): zona `bridge` e `openBastionMap` sem erro de página; screenshots da ponte, da praça de perto e do Bastião conferidos.
- **Limitações:**
  - A barreira não foi conferida de perto: a câmera segue o herói e não consegui enquadrá-la. Só vi no screenshot geral.
  - A cena da ponte é noturna (`mood.bridge: 'night'`), então a praça ainda tem tom azul. Clara de verdade pede mudar a iluminação da zona, o que é decisão de direção de arte.
  - A montagem da batalha não foi medida antes e depois (regra do `CLAUDE.md`).
  - Os chãos de planície, floresta e as pedras de decoração (`naturKit.ts`) ainda usam as texturas antigas. Não entraram nesta etapa.
  - `Rocks_Desert`, `PathRocks` e os troncos do pacote de natureza ficaram de fora.
- **Pendências do dono:**
  1. Confirmar se a ponte deve continuar noturna ou ir para um tom de dia/entardecer.
  2. Dizer se a barreira com a pedra clara fica boa no PC (`BAIXAR_DO_GITHUB.bat`, depois `ATUALIZAR_JOGO.bat`).
  3. Dizer se a próxima etapa deve trocar os chãos de planície e floresta pelas texturas do pacote.
## 2026-10-12 — cartas com tier por fusão (escada 5-2-2-2), bônus por nível e habilidade no nível 5 (v0.11, em andamento)
- **Pedido do dono:** raridade passa a ser tier da carta. Cinco cópias viram a carta "+" (Fabre → Fabre+). No nível 5 a carta libera uma habilidade própria. Bônus refeitos com base na tabela dele (Carta / Onde vai / Efeito), adaptando o que não existe no jogo.
- **Decisões do dono:** "Onde vai" é só categoria do bônus (as cartas continuam nos slots do herói). Escada de fusão 5-2-2-2: 5 cópias do nível 1 viram nível 2; depois 2 cópias por nível (nível 5 = 40 cópias base).
- **Como ficou:**
  - Catálogo: 102 cartas (`normaisA.ts`, `normaisB.ts`, `especiais.ts`). Cada carta tem categoria (ofensiva, defensiva, sustentação, utilidade, mobilidade), bônus do nível 1 escalado por nível (1 · 1,25 · 1,5 · 1,75 · 2) e habilidade do nível 5 (sem escala).
  - Fusão por carta e nível (`fuseCard`); equipar guarda carta e nível; cópia equipada não conta como livre.
  - Pacote: 5 cartas sorteadas de forma uniforme do catálogo (raridade saiu).
  - Motor: novos efeitos `stat` (atributo ou derivado no começo da batalha), `modDano` (dano causado ou recebido por grupo de inimigo e fonte) e `respingo` (dano em área no acerto). Piso de 25% no multiplicador de `modDano`, para várias cópias não zerarem nem inverterem o dano.
  - Save: coleção migrada (posse numérica vira nível 1; equipadas em texto viram {id, nível 1}); 10 ids `_2` antigos viram a carta base (`CARD_ID_ALIAS`).
  - Interface: álbum com sufixo de nível, categoria, cópias por nível e botão "Fundir 5 → +"; pacote sem selos de raridade.
- **Testes:** `tsc`, `build`, `cardCheck` (63 ok), `cardRuleCheck` (29 ok, inclui o piso), `bastion:check`, `bastion:path`, `vocation:check` passam. `sim:check`: a diferença do bastionKeep é a do mapa de rochas (commit b47efdc), não das cartas. Navegador: álbum e pacote sem erro de console.
- **Decisões para confirmar:**
  1. Pacote: 5 cartas uniformes do catálogo (as antigas chances de mini-chefe e MVP saíram). Quer raridade de volta em algum lugar?
  2. Habilidade do nível 5 não escala (os números já são os finais).
  3. Aproximações de família: o motor não tem família por monstro. Inseto → comuns; humanoide → chefes e minis goblin/orc; animal → chefe rato e dino; demônio → chefe orc; morto-vivo e fantasma → necromante. A aproximação de inseto (BIGFOOT, CARAMEL) é a de maior impacto no balanço.
  4. Estados que o jogo não tem (sono, cegueira, atordoar, caos, petrificar, ressurreição, imunidades) viraram efeitos reais parecidos. Ex.: OSIRIS virou cura de 20% uma vez por batalha.
  5. Atributos: AGI = Destreza e ASPD = Skill Haste (o jogo não tem esses nomes).
  6. Classificação Fiel/Adaptado/Novo: só 4 cartas são fiéis à tabela, 27 adaptadas, 71 com efeito novo.
- **Não verificado:** combate real com cartas no navegador (respingo, modDano, gatilhos na tela); carregar um save real do HEAD pela interface (a migração foi testada só no cardCheck); largura de celular e executável.
- **Commit:** (ver o commit desta entrada).

## 2026-10-13 — auras de monstro: núcleo, visual e revisão (v0.11, em andamento)
- **Pedido do dono:** cinco auras para monstros (velocidade, crítico, mitigação de dano, regeneração de vida e queimação constante, que atinge heróis próximos). Sorteadas no Bastião a partir da noite 20 e na campanha depois de liberar o terceiro herói jogando (Feiticeira, Bruxa e Assassino).
- **Decisões do dono:** queimação atinge heróis perto do monstro; terceiro campeão = os três heróis que se liberam jogando todos liberados.
- **Como ficou:**
  - Sorteio determinístico com semente própria. Chance 12% por comum no Bastião (noite ≥ 20) e 8% na campanha. Sem auras, nenhum número a mais é sorteado (campanha idêntica).
  - Efeitos (números em `src/config/auras.ts`): velocidade ×0,75 no passo; crítico +20% de chance e ×1,5; mitigação −25% do dano da party; regeneração 2% da vida máxima por segundo; queimação 1 pulso por segundo, metade do dano do portador, no máximo um por segundo por herói.
  - Raio 2. Cada aura age uma vez por unidade. Chefes, elites e sobrevivência ficam sem aura.
  - Visual: anel no chão e faixa na cor do tipo para os 12 portadores mais próximos; brasas na queimação. Um material por tipo.
- **Correções da revisão:** recursos do kit de auras ficam marcados como compartilhados e o `UnitView.dispose` não os descarta mais; crítico de monstro sobre herói mostra "CRÍTICO INIMIGO!" em vermelho; a faixa deixou de alocar um vetor por quadro.
- **Testes:** `tsc`, `build`, `aura:check` (34 ok), `sim:check` idêntico, `bastion:check`, `bastion:path`, `vocation:check`, `cardCheck`, `cardRuleCheck`. Navegador (SwiftShader): cinco portadores com cinco materiais, teto de 12 faixas visíveis, morte remove anel e faixa, sem erro de console.
- **Decisões para confirmar:**
  1. Chefes e elites recebem o efeito das auras próximas, mesmo sem portar aura (regeneração inclusive). Intencional?
  2. Crítico vale só para golpe corpo a corpo; conjurações inimigas não criticam.
  3. Mitigação só reduz dano da party; torre do Bastião não é mitigada.
  4. Cores de mitigação e velocidade têm pouco contraste sobre monstros claros.
- **Não verificado:** FPS na GPU real; balanceamento em partida real; checagem visual depois dos três ajustes de código desta rodada (a mudança é pequena e as checagens passaram).

## 2026-10-14 — goblin novo, palhaço, boneco de treino, Detarderus e animações (v0.11, em andamento)
- **Modelos:** goblin.glb (52 MB → 1,8 MB) substitui os goblins verdes nos 5 tipos comuns do Ato II (clipes do cultista, bind 'ibm'), conferido em jogo. Palhaço = tipo novo 'palhaco' (Campos Cinzentos, 12% das ondas), auto-rig com juntas medidas. Boneco de treino = visual do 'trainingDummy' (Dev Lab). Detarderus = mini-chefe 'detarderus' no Passo da Geada (Ato III), no lugar do Krexx retorcido (que segue no Bastião), com zona própria provisória 'detarderusLair' (cópia do Cume das Cinzas), esqueleto do jogo com juntas medidas e simplificação com bordas travadas.
- **Animações:** misturas de golpe/magia/reação 0,06 s → 0,1 s e volta ao parado 0,15 s → 0,22 s (`VISUAL_CONFIG.unit.fadeAction/fadeBack`). Bongun (flutuante): golpe com o gesto de magia em vez do soco, morte solta até o chão (antes dobrava suspensa no ar) e impacto no tempo padrão.
- **Git:** `LOG_SESSOES.md` e `CHANGELOG.md` com `merge=union` no `.gitattributes`; no PC, `.git/info/attributes` com a mesma regra até ela chegar à main.
- **Testes:** tsc, build, sim:check (determinístico; linhas novas de ashenFields e detarderusLair), bastion:check, aura:check, zoneReachCheck.
- **Pendências:** pernas do palhaço ainda com massa no auto-rig; boneco de treino e malha do Detarderus sem foto limpa em jogo; bind 'ibm' do Bongun ainda não aplicado; goblin1/goblin2.glb sem uso (apagar só com o OK do dono); originais pesados na main devem ir zipados para a branch fontes; cenário definitivo do Detarderus (arquivos do dono).

## 2026-10-14 — movimento contínuo, sem parada a cada tile (render)
- **Pedido:** animação bem fluida em todos os heróis e monstros.
- **Diagnóstico:** a posição já era interpolada entre o tile anterior e o atual, com a fração do tick (`renderTick = sim.tick + acc/tickDt`). O degrau vinha da curva do passo: o smoothstep zera a velocidade na borda de cada tile, então a unidade parava a cada passo (8,8% dos pares de quadros em passo andavam a menos de 25% da velocidade). Também: voltar de golpe ou reação ao andar recomeçava a passada do zero.
- **Mudanças (só apresentação, `src/render`):** passo de velocidade constante de tile a tile; arranque suave só depois de pausa (`t²(2−t)`, que sai na velocidade do passo seguinte); unidade recém-criada não toca a pose de andar; voltar ao andar retoma a passada; limite do ritmo do passo do andar alargado de [0,5; 1,6] para [0,3; 2,5] (corredor e passo longo batem com o deslocamento).
- **Medição** (laço do `main.ts` sem render, 40 s de jogo, zona rootVale): pares em passo com deslocamento 7.821; quadros lentos 685 (8,8%) → 18 (0,2%); pior sequência 2 quadros (~33 ms), só no arranque; reinícios do andar após golpe ou reação 6 → 0.
- **Em tela:** três capturas com um inimigo focado (velocidade ×4, passo fixo 1/60 s): a cena e a câmera seguem a unidade, sem falha de render. A suavidade foi medida pelo laço, não a olho.
- **Pendências:**
  1. Hit-stop (até 0,3 s): a animação congela em 5%, mas a posição segue, então os pés deslizam nesse instante. Corrigir pede um relógio visual que também congele a posição. Decisão de design.
  2. Parada seca: quando a unidade para (fila bloqueada), para no centro do tile sem freio; o andar segue por 0,45 s nos inimigos.
  3. FPS real na GPU do dono não medido (o SwiftShader leva 5 a 9 s por quadro).
- **Testes:** `npm run build`, `sim:check` (determinístico: true, núcleo intocado), `bastion:check`.

## Lições (curtas)
- **Terreno e água:** textura do dono em WebP nítido. Canvas pintado por código e esticado borra de perto.
- **Nada pode flutuar:** conferir a altura (y) e o screenshot de perto.
- **Visual não altera a grade:** a grade (`zones.ts`) é gameplay.
- **Medir a montagem da cena** antes e depois de mudar cenário (`window.__vg.enterBattle`, só em DEV).
- **Git:** trabalhar na branch da sessão (`claude/festive-curie-5iy45i`). A `main` recebe o que o dono envia com ENVIAR_PARA_GITHUB.bat.
- **Tema decide o cenário:** o tema planície não desenha estradas de pedra nem a água de fosso fino; o portão da cidade é uma paliçada de borda. Castelo fechado usa o flag `castle`. Fosso precisa de 2 tiles para ler como água.

## Árvores de habilidade das vocações (Crusado e Hypnomancer) — branch vocacoes-skills
- **Pedido:** cada vocação ter as próprias habilidades, com os ícones do catálogo do dono (`public/icons/skills/catalogo.json`).
- **Feito:** 20 habilidades no Crusado (Guerreiro) e 20 no Hypnomancer (Bruxa). Árvore em `src/config/vocationSkills.ts` (dado puro: nomes, tier, coluna, requisitos, números, textos). Comportamento em `src/core/archetypes/vocationEngine.ts`, com 17 tipos de ação reaproveitados (golpe, cone, linha, área, alvo único, raio, armadilha, escudo, cura, bênção, guarda, fúria, teleporte, passivas). Crusado e Hypnomancer têm arquivos finos que chamam o motor.
- **Decisões (a confirmar com o dono):**
  - O ícone `professor` do catálogo é o Hypnomancer (confirmado: 20 ícones, e o catálogo tem Controle Mental, Veneno e Dreno de Mana).
  - Controle Mental atordoa e puxa o inimigo mais forte até a vocação; não faz o inimigo lutar pela party (isso exigiria IA de inimigo contra inimigo).
  - Ao escolher a vocação, a árvore da classe base some da tela e as habilidades dela deixam de disparar; o que já foi aprendido continua no save e as passivas de atributo dela continuam somando. Aprender habilidade da classe base depois da vocação fica bloqueado. Refazer habilidades devolve os pontos de todas as árvores.
  - Bárbaro segue com a árvore do Guerreiro (sem mudança).
  - Investida e Teleportar movem a vocação de uma vez (sem animação de caminhada).
- **Save:** só campos novos e aditivos (ids de habilidade e a vocação já existente). Saves antigos abrem igual; a migração põe o básico da vocação, se faltar.
- **Pendências:** conferir no PC do dono a árvore (tecla K) e as lutas com Crusado e Hypnomancer; a escolha do tile da Instalar Armadilha (caminho da horda) só se verifica no jogo, porque a arena de teste não tem cidade; os números são a primeira versão (rodar balanceamento); a Dev Lab (aba SKILLS) e "Desbloquear árvore" ainda não mostram as habilidades das vocações.

## Escudo e espada do Crusado — branch crusado-escudo
- **Pedido:** "o ataque e a maneira como o Crusado segura o escudo ficaram estranhos".
- **Diagnóstico (medido no bind dos dois GLB, não no palpite):** o `crusado.glb` tem outro descanso do osso da mão. Com o mesmo offset do Guerreiro, a face do escudo ficava 63° fora da dele (apontava para cima) e a lâmina 25° a 35° fora. Os clipes são os mesmos do Guerreiro; a diferença é o descanso da mão.
- **Feito:** `weapons.ts` ganhou `rot` opcional (rotação completa da arma no osso, vence `tilt`). Em `visualConfig.ts`, a entrada `crusado` usa `rot` no escudo ([-40, -50, -30]) e na espada ([-130, -30, 40]), alinhados à pegada do Guerreiro em andar, golpe e investida. Guerreiro sem mudança (não usa `rot`).
- **Verificado:** `npm run build`, `sim:check` (determinístico: true), `bastion:check`, `aura:check`. Screenshots de perto (de frente e de lado) numa página de teste standalone, sem a tela do jogo.
- **Pendências:**
  1. No golpe, a mão do Crusado fica na altura do capacete (o Guerreiro, na do peito): o modelo tem ombros e braços um pouco mais altos e longos. Corrigir pede clipe próprio do Crusado (não feito).
  2. A luva do Crusado segura a borda inferior do escudo, não o centro (não ajustado).
  3. Conferir no jogo com a vocação Crusado (não feito: a verificação foi standalone).
  4. No parado, o escudo do Guerreiro aparece de perfil (de frente ele é uma tábua). Agora o do Crusado também. Se o dono quer a face para a frente, é decisão de design para os dois.
- **Testes:** `npm run build`, `sim:check` (determinístico: true), `bastion:check`, `aura:check`.

## Morte do Bongun (cultista) — branch bongun-fix-wf
- **Pedido:** o Bongun (necromante, `zombieNecro`) afundava no cenário ao morrer.
- **Diagnóstico (medido na pose, com o clipe de morte congelado no Chromium, não no palpite):** a morte era o retarget puro do UAL, com pernas dobradas e o quadril abaixo do chão no impacto. Sem elevação, o ponto mais baixo da malha chegava a -0,69 unidade de mundo em 1,05 s, e o repouso ficava -1,3. A escala do modelo é 1,87: o `deathLift` 0,7 em unidades do modelo vira ~1,31 de mundo, por isso o corpo subia demais e ficava alto no repouso.
- **Feito:**
  1. A morte do cultista usa a morte de rig Mixamo (`monsterRigDeath`, a mesma dos goblins): pernas esticadas e pés no chão.
  2. `deathLiftCurve` (novo, em `visualConfig.ts`): elevação do quadril por tempo, medida na pose. Vale 0 até o impacto, sobe até ~0,33 em 1,05 s e fica em 0,16 no repouso (unidades do modelo, somadas ao `hover`). Substitui o `deathLift` do Bongun.
  3. Goblins sem mudança de comportamento: `monsterRigClips` só passou a chamar `monsterRigDeath` (mesmo cálculo); `liftLying` e o `deathLift` dos goblins não mudaram.
- **Medido (unidades de mundo, varredura do clipe):** o ponto mais baixo fica entre 0,00 e 0,05 depois do impacto (pior instante 0,002 em 1,05 s) e 0,05 no repouso; antes da queda, 0,18 a 0,21 (altura da flutuação).
- **Pendências:**
  1. No repouso, os pés do esqueleto ficam ~0,76 acima do chão, e só a malha mais baixa encosta. Pode parecer suspenso e não totalmente deitado: conferir no PC do dono.
  2. No impacto (~1,0 s a 1,1 s), o quadril sobe ~0,6 de mundo em ~0,2 s para não atravessar o chão. É o preço de manter o ponto mais baixo no nível do chão.
- **Testes:** `npm run build` (typecheck + build), `sim:check` (determinístico: true), medição de morte no Chromium (overlays da recompensa e da fase ocultados por CSS; o jogo segue).

## Ato III: tempestade no Cume das Cinzas (protótipo) — branch ato3-tempestade-proto
- **Pedido:** protótipo do clima de tempestade do Ato III (zona `ashPeak`): céu escuro azul-acinzentado com nuvens densas, chuva, relâmpagos, ruínas flutuando ao redor da arena e névoa fria. Atrás de uma flag, sem mexer na grade.
- **Feito:**
  1. Flag `ATO3_TEMPESTADE` em `src/config/visualConfig.ts`: `ativo` e `zonas: ['ashPeak']`. Com `ativo: false` o cenário volta ao de antes (conferido pela leitura do código; não foi rodado com a flag desligada).
  2. Imagens geradas offline por `scripts/gerarCeuTempestade.py`: `public/textures/cenario/ceu_tempestade.webp` (céu com nuvens; o horizonte tem a cor da névoa), `sombra_contato.webp` e `nevoa_suave.webp`.
  3. `src/render/scenery/tempestade.ts` (novo): esfera do céu, chuva em linhas (260 gotas, pela posição do tempo), relâmpagos com intervalo sorteado por semente fixa (clarão fraco no chão, brilho do céu e um traço nas laterais), 8 ruínas dos pacotes castle/town/survival com balanço e mancha de contato, 14 placas de névoa fria.
  4. `Stage.applyTheme(tema, tempestade)`: névoa mais densa (14 a 34 tiles), luz fria e gradiente cinza-azulado (`PostFX.setGradient`). `BoardView` e `main.ts` ligam a tempestade só nas zonas da flag.
- **Medido (Chromium por software, sem GPU real):** montagem síncrona do tabuleiro, 3 repetições: antes 430, 151 e 181 ms; depois 215, 344 e 397 ms (mediana de 181 para 344 ms). Variação alta, não conclusivo. FPS: 0,3 nos dois casos, o que não mede desempenho real.
- **Pendências:**
  1. O céu quase não aparece com a câmera do jogo: o chão cobre a tela até a borda. Só aparece com zoom muito aberto e foco no norte. Decidir se o clima fica na névoa e no chão ou se a câmera muda.
  2. As ruínas ficam nas laterais, fora da visão padrão. Na panorâmica se misturam com as pedras de lava que já existiam.
  3. No close-up, a sombra de contato quase não aparece sobre a lava.
  4. O relâmpago sobe o brilho de cerca de 16 para cerca de 33 em 0,1 s (dois pulsos). Se achar forte, reduza `relampago.clarao`.
  5. O Covil do Detarderus (também do Ato III) ficou de fora. Entra na lista `zonas` se for o caso.
  6. Ver no PC do dono: fluidez e visual no jogo real.
- **Testes:** `npm run build`, `sim:check` (determinístico: true), `aura:check` e `cenario:check` passaram.
## Krexx retorcido (goblinWarlord, mini-chefe do Passo da Geada) — branch krexx-retorcido-wf
- **Pedido:** "o goblin warlord está todo bugado nas animações também" (o dono chama o Krexx retorcido de goblin warlord).
- **Diagnóstico (medido no Chromium, com os estados disparados pela view e o quadro congelado, não no palpite):**
  - **Causa:** o `goblin_warlord.glb` perdeu os dados das matrizes inversas de bind (IBM) na otimização (commit dd5cab8, mantido em a436443). O arquivo original (f66a5df) tem as 61 IBM. Sem elas, o loader recalcula o bind a partir da pose de repouso dos nós, que fica 0,84 unidade acima do bind real da malha. Resultado: a malha afundava (ponto mais baixo em -1,48 unidade, com os pés dos ossos em y=0) e cada junta girava em torno de um pivô 0,84 deslocado.
  - **Parado, andar, ataque, magia e dano (antes):** malha enterrada, com ponto mais baixo entre -1,43 e -1,48 unidade (metade do corpo sob a neve). Braços e machado giravam em pivôs errados.
  - **Morte (antes):** ponto mais baixo -1,23 em 0,3 s, -1,10 em 0,7 s e -0,33 em 1,2 s.
- **Feito:** restauradas as 61 IBM do original no GLB atual (`bufferView` novo no buffer) e removidos os 190 accessors órfãos (195 para 6). A malha simplificada (45.562 vértices, 35.842 triângulos), a textura e os ossos ficam iguais. Antes, `scripts/auditar_glb.cjs` quebrava neste arquivo; agora roda. Sem mudança de código: o registro já usava `bind: 'ibm'`.
- **Medido depois (unidades de modelo, ponto mais baixo da malha):** parado -0,18; andar -0,20 a -0,30; ataque -0,14 a -0,17; magia -0,15; dano -0,17 a -0,18; morte -0,02 a +0,09 nos primeiros 0,7 s. Cabeça e topo da malha a ~2,6 de mundo: o Krexx volta a ficar de pé no anel.
- **Pendências:**
  1. **Morte, 1,2 s:** no harness de captura (com o mesmo código) o ponto mais baixo chega a -1,05 e o quadril local cai para 0,12. Não reproduzido nas varreduras de dados (quatro sequências, com a morte começando de parado, andar, ataque, magia e dano): o ponto mais baixo fica entre -0,08 e -0,16. Não mexi no registro da morte sem medida confirmada. Conferir a morte no PC do dono e, se afundar, medir de novo no jogo.
  2. Textura do Krexx continua JPG 2048; o auditor pede WebP de até 1024 px. Não mexida, por ser arte aprovada.
  3. Os pés dos ossos ficam em y=0 (tornozelo), e a sola fica ~0,18 abaixo. É a convenção do loader para todo modelo com `bind: 'ibm'`; não mudada aqui.
- **Testes:** `npm run build` (typecheck + build), `sim:check` (determinístico: true), `aura:check`. Capturas dos estados em `/tmp/claude-0/-home-user/4ff88cc6-6fa3-5e2c-bcc3-6df5759cbaa1/scratchpad/krexx/capturas`.

## Árvore global de progressão com Masteries táticas (protótipo) — branch arvore-global-proto
- **Pedido:** árvore global única (nós comuns, notáveis, caminhos alternativos e pontos de Mastery), três Masteries táticas que mudam o combate, atribuição e reorganização com Zen, tela no estilo da referência (rede de nós, zoom e pan), dados separados do núcleo, Profile com migração.
- **Feito (fases A a E, um commit por fase):**
  1. Dados em `src/config/arvoreGlobal.ts`: 19 nós em 5 regiões, 22 conexões com ciclos (caminhos alternativos), 3 Masteries com nó que as desbloqueia, nível mínimo e elegíveis.
  2. Núcleo em `src/core/progression/arvore.ts`: compra de nó com ligação, atribuição, remoção, reorganização, pré-visualização de custo, efeitos agregados na hora (sem efeito guardado), bloqueio em luta, validação do desenho e `normalizarArvore` (consertar save).
  3. Profile v2 com `arvore`. `migrateProfile` faz o passo v1 para v2 antes de qualquer outra coisa; o bastião usa a mesma migração.
  4. Efeitos de combate ligados em `Simulation.damage`: Golpe de Misericórdia (+35% de dano contra inimigo com até 30% da vida), Barreira de Contenção (escudo de 20% da vida máxima na primeira queda abaixo de 30%, uma vez por batalha) e Pressão Tática (25% de empurrar com golpe corpo a corpo). Sem Mastery, a saída do sim:check é idêntica à de antes.
  5. Tela `src/ui/ArvoreGlobal.ts` (DOM e SVG, sem Three.js) com view model em `src/ui/arvoreVM.ts`. Botão "Árvore" no painel da party do mapa.
- **Decisões que o dono precisa confirmar:**
  1. **Pontos de árvore** = 1 por nível que cada herói alcança (soma de todos). Não é moeda nova nem gasta pontos de habilidade. Quem já tem níveis num save antigo ganha os pontos sozinho.
  2. **Escopo da árvore:** a árvore vive no Profile da jornada, então zera a cada jornada (derrota total inclui). Se quiser progresso entre jornadas, a árvore passa para o save de meta.
  3. **Preços:** atribuir ou trocar Mastery 60 Zen (fixo); reorganizar 80 Zen, subindo a cada uso (como o respec de atributos); tirar uma Mastery é grátis.
  4. **Limite:** uma Mastery por personagem (`maxMasteriesPorHeroi`).
  5. **Famílias:** só 3 de 6 foram desenhadas (controle, proteção e execução). Destruição, mobilidade e sinergia ficaram de fora porque exigem mudar o combate; o motivo está em `FAMILIAS`.
- **Divergências com o pedido:**
  1. O pedido falava em 5 personagens e 3 na party. O projeto tem 6 classes e a party de campanha fecha em 3 por desbloqueio (`nextUnlock`); no bastião vai até 6. A árvore usa o elenco real.
  2. O plano de auditoria (`AUDITORIA_E_PLANO.md`) não existia no caminho pedido; o código foi lido diretamente.
  3. O comando de criação da worktree vinha com um `.` sobrando, que o git recusa; foi executado sem ele.
- **Lacunas:**
  1. **Apresentação dos efeitos de combate:** o escudo e o empurrão aparecem só no estado da simulação, sem aviso visual nem linha no log. O `holyShield` existente não serve porque é o efeito do Escudo Sagrado do Mago.
  2. **Elegibilidade na simulação:** a regra checa elegibilidade no perfil (`masteryDoHeroi`); a simulação recebe a regra pronta e não confere de novo.
  3. **Legibilidade:** verificada com 19 nós. Com muito mais nós será preciso reduzir os rótulos em zoom baixo.
  4. **Desempenho do zoom e do pan:** o comportamento foi verificado no Chromium, mas o FPS não foi medido.
- **Pendências:**
  1. Confirmar os preços e a regra dos pontos (decisões 1 a 4 acima).
  2. Ver no PC do dono: fluidez do zoom e leitura da tela em 1600×900 e 1280×720.
  3. Mudar a faixa de botões da party do mapa (agora grade de 2 colunas): conferir se o dono prefere outra disposição.
- **Testes:**
  - `npm run build` (typecheck e build), `sim:check` (determinístico: true, saída igual à linha de base), `aura:check`, `bastion:check`, `vocation:check` e `vocation:skills:check` passaram.
  - `arvore:check` (76 verificações: requisitos, caminho inválido, Zen insuficiente, cancelamento sem gasto, reorganizar removendo efeito, troca de party, Mastery seguindo o personagem, bloqueio em luta, estado de nó).
  - `arvore:save:check` (31: save v1 da jornada e do bastião abre, status iguais, migração idempotente, árvore corrompida consertada).
  - `arvore:combate:check` (24: cada efeito com e sem Mastery, limiar na fronteira, uma vez por batalha, perfil até a simulação, onda inteira com as regras ativas).
  - Chromium (dev, porta 5671): compra, prévia de custo, cancelamento sem gasto, atribuição, recusa de herói não elegível, zoom, arraste, reorganização cancelada e confirmada, Esc e 1280×720 sem erro de console. Varredura `ui:fora-da-tela` do mapa: 0 problemas (antes da grade de botões eram 12).


## Árvore Global — 100+ nós, árvore no meta (protótipo, branch arvore-global-proto)

- **Escopo do dono:** árvore com pelo menos 100 nós em seis categorias: progressão geral (21), campanha (16),
  Bastião (16), combate geral (25), Masteries táticas (18) e notáveis/caminhos de ligação (15). Total: 111 nós.
- **Árvore no save de meta:** decisão do dono. A árvore persiste entre jornadas e não zera na derrota. Ela fica em
  `MetaStats.arvore` (save `meta`). Jornada e Bastião só carregam uma referência em memória; o save de jornada e o
  do Bastião não guardam a árvore. Saves antigos com árvore na jornada são adotados pelo meta na primeira abertura.
- **Custo dos nós:** continua em pontos de árvore (1 por nível de personagem). Ponto único de decisão para o custo
  em Zen: `custoDoNo` em `src/config/arvoreGlobal.ts`. O dono decide junto com o balanceamento.
- **Economia (tetos em config):** EXP em combate 30%, almas 25%, Zen por tipo de nó 25% cada (horda, elite, chefe,
  sobrevivência), pontos de habilidade +1 por nível (teto 1), recrutas +nível (teto 3), descontos nas cidades 20%,
  reparo da muralha 25%, itens extras na loja (teto 2), construção do Bastião 25%, reparo do Bastião 30%, muralha
  +30%, Zen por noite +20 (teto).
- **Sem gancho ainda (14 nós, valor em zero):** Zen de eventos, Zen da cidade, recompensa da cidade, escolhas extras
  em eventos, portão do Bastião, blocos de construção e limite de peças. Motivos na config (`ARVORE_ECONOMIA`).
- **Interpretações a confirmar:** "velocidade de ataque" = Skill Haste (o único acelerador); "recrutas extras" =
  níveis extras ao recrutar; "sorte de loja" = itens extras no estoque. Não há bônus de chance de drop.
- **Masteries:** 18, três por família (seis famílias), cada uma com efeito de combate verificado. Cada Mastery vai
  para um personagem.
- **Testes:** `arvore:check` (99), `arvore:combate:check` (45), `arvore:save:check` (44). Simulação, aura, Bastião,
  vocações, cenário e build passam; a saída de `sim:check` continua igual à de antes da árvore.
## Ato IV: composição do protótipo de ilhas (chão, obstáculos, borda e pontes) — branch ato4-composicao-proto
- **Pedido:** o dono achou a composição do protótipo (zona `frostPass`, flag `ATO4_CEU_ILHAS`) sem sentido: árvore de terra no meio do chão de pedra, pedras de gelo azul ao lado, peças soltas. Pediu algo com mais sentido.
- **Diagnóstico (no código e medido nas capturas):** o cenário do bioma montado (`BiomeScenery`, opção `ceuIlhas`) ainda desenhava os obstáculos da grade com as peças de gelo e neve do bioma (`ICE_KIT`: `neveRocha`, `geloRocha`, `neveArvore`), e o acampamento do Ato III (`ActDressing`, fogueiras queimadas, ossos, estandartes) saía solto no meio da arena. As pontes ficavam com a base no lugar errado: o billboard encara a câmera (inclinação de ~55°), então o tabuleiro não caía no nível da grama.
- **Feito:**
  1. Obstáculos da grade (R, T, #, A...) trocados por peças das ilhas, por tipo de tile: rocha escura da ilha (`rocha_ilha.webp`, peça do naturKit com a textura do dono), pilares de ruína, pilar baixo e altar. Só visual: grade, tiles bloqueados e simulação não mudam. O muro da cidade (W) e as torres do portão continuam do `CityGate`.
  2. Sem árvore, planta nem pedra de gelo no chão. Chão só com as texturas das ilhas: pedra clara, azulejo no portão, grama só na borda; tile de raiz vira pedra com tom verde.
  3. `ActDressing` sai no céu de ilhas (`BoardView.ts`). Névoa de geada e partículas de neve do bioma saem no `BiomeScenery`.
  4. Decoração de borda reduzida a tocheiros, bandeiras, cercas e pilares dourados, em pares espelhados e em linha. Sai o arco, a estátua, os cristais e a fonte.
  5. Pontes: a base é calculada pela inclinação da câmera (`VISUAL_CONFIG.camera`) e pela linha do tabuleiro na imagem (`tabuleiro`). Ponte reta e ponte arco entram na grama da arena e na ilha ligada.
  6. Config: `ATO4_COMPOSICAO` em `visualConfig.ts`, com a lista do que pode aparecer em cada camada. O `ceuIlhas.ts` só usa peças dessas listas; a escolha da peça por tile é fixa (hash, sem `Math.random`).
- **Medido (mesmo enquadramento, Chromium por software, flag ligada):** chamadas de desenho 134 → 109; triângulos 302 mil → 257 mil; geometrias 113 → 89; texturas 71 → 56. Montagem da zona (3 repetições): 27,6 / 12,1 / 14,0 ms antes; 35,8 / 15,5 / 13,9 ms depois. A primeira montagem ficou ~8 ms mais lenta, por causa das rochas do naturKit. Medido em SwiftShader, não em GPU real.
- **Pendências:**
  1. A rocha da ilha é escura e puxa para o roxo (cor média da textura). Se ficar pesada no PC do dono, trocar a textura do anel ou o tom em `naturKit.ts` (`ilha_rocha_a/b`).
  2. Muralha da cidade e torres do portão (`CityGate`) ficaram como arquitetura da cidade, não do bioma. Decidir se entram na composição de ilhas.
  3. A luz quente de braseiros e lanternas (`B`, `L`) não foi portada para o céu de ilhas. A zona `frostPass` não tem nenhum, mas mapas futuros com esses tiles ficam sem luz.
  4. A neve que caía e a névoa de geada saíram do céu de ilhas. Confirmar com o dono se quer alguma atmosfera no lugar.
  5. Se a inclinação da câmera mudar, as pontes saem do lugar: o cálculo usa `VISUAL_CONFIG.camera` (height, distance, lookZ).
  6. Com `ativo: false` o cenário deve voltar ao de antes: a leitura do código confirma (mesmos caminhos quando `ceuIlhas` é falso), mas não foi renderizado nesta rodada.
  7. Ver no PC do dono: fluidez e visual no jogo real.
- **Testes:** `npm run build` (typecheck + build), `sim:check` (determinístico: true), `aura:check` e `cenario:check` passaram. Capturas em `/tmp/claude-0/-home-user/4ff88cc6-6fa3-5e2c-bcc3-6df5759cbaa1/scratchpad/ato4-composicao/` (antes_* e final_*).

## Balanceamento do Zen — árvore em Zen e banco no meta (branch zen-arvore-wf)

- **Data:** 2026-10-15. **Pedido:** aplicar a proposta de balanceamento (`PROPOSTA_ZEN.md`, decisões 1 a 18 aprovadas pelo dono).
- **Árvore:** segue no save de meta (já estava). Custo dos nós em Zen, por tipo, na tabela `CUSTO_ZEN_POR_TIPO`
  (comum 100, notável 250, caminho 100, Mastery 150). A soma dos 111 nós é 19.250 Zen; atribuir as 18 Masteries (60 cada)
  leva a 20.330. Pontos de nível deixam de pagar a árvore.
- **Banco de Zen (meta, `m.banco`):** crédito extra, não tira Zen da jornada nem do Bastião. Campanha: vitória 50%,
  derrota 25%, abandono 0% do Zen ganho na jornada. Bastião: 30% do Zen de cada bloco completo de 20 noites (derrota no
  meio do bloco não paga). Percentuais em `ARVORE_BANCO` (config).
- **Chaves de crédito:** `jornada:<semente>` e `bastiao:<semente>:<tentativa>:<bloco>`. A tentativa entra na chave do
  bloco porque as noites recomeçam em cada tentativa (a decisão 5 falava só em semente e bloco). Uma chave paga uma vez.
- **Ordem de escrita:** o crédito vai ao meta numa escrita só (saldo e chave juntos) e só depois o save principal
  (jornada encerrada ou noite do Bastião aplicada), em `gravarComCredito`. Queda entre as duas escritas não paga em dobro
  nem perde o crédito (`npm run banco:check` simula a queda em cada escrita).
- **Compra:** botão "Árvore" no menu principal (canto inferior esquerdo, ao lado da engrenagem), entre jornadas, sem
  campanha ativa. A cidade da campanha e o hub do Bastião seguem com acesso. Tudo é pago pelo banco.
- **Zen ganho na jornada (`zenGanho`):** conta combate, bônus de vitória, eventos e carroça. Venda de equipamento e
  reembolso de construção não contam (decisão 9). Zen dos eventos: vale o valor de `world.ts` × ato (×1, ×1,6, ×2,4),
  que é o que o código faz hoje (decisão 8 resolvida pelo código).
- **14 nós sem efeito (decisão 7):** ligados: Estrada Segura e Sorte de Evento (Zen dos eventos, +5% cada).
  Trocados (mesmo tipo, categoria, região e posição): Eventos Atentos → Veio de Prata; Pergaminhos → Pergaminho de Rota;
  Recompensa da Cidade → Mãos de Pedreiro; Festa da Vila → Fogueira Amiga; Zen de Vila → Feira de Vila (o Caminho da Vila
  passa a ligar a Feira); Clérigo de Vila → Poço do Viajante; Portão Reforçado → Vigas de Carvalho; Ferrolhos → Corrente
  de Ferro; Projetista → Ronda da Madrugada; Blocos de Reserva → Mestre de Obras; Pátio Extra → Pedreira Próxima;
  Estaleiro → Carpinteiro Veterano.
- **Bônus de vitória:** 42 / 67 / 92 saem do `main.ts`: base e multiplicador por ato em `GAME_CONFIG.zeni`
  (`waveClearActMult` 0,6), e a conta em `bonusVitoriaCampanha`. O Bastião segue com 42 fixo (já era config).
- **Save:** Profile e BastionState ganham campos novos com migração (`zenGanho`, `zenNoBloco`); o meta ganha `banco`.
  Save antigo abre com zero. O bloco em andamento de um Bastião antigo começa a contar daqui.
- **Bastião corrompido (decisão 10):** antes de criar a cidade nova, o arquivo ilegível vai para `bastionBackup`. O
  banco fica no meta e não é tocado. A chave `bastionBackup` entrou na lista de saves do Electron.
- **Números (medidos, com faixa):**
  - Campanha, horda por nó e uma party por ato (1, 2 e 3 heróis), 11 batalhas e sem eventos, carroça, sobrevivência
    nem lojas: 10.873 Zen. Vitória dá 5.436 de crédito; derrota no fim, 2.718. Faixa com a proposta: 10.900 a 13.600 Zen
    (5.400 a 6.800 de crédito na vitória).
  - Bastião, teto (20 noites, todos abatidos, 20 vitórias): 6.717 Zen, crédito de 2.015. Medição com 3 heróis, sem
    muralhas nem torres e layout padrão: 1 de 3 sementes fecha o bloco (3.504 Zen, crédito 1.051); as outras caem nas
    noites 19 e 20. Faixa do bloco: de 0 (sem defesa) a 2.015 (teto), dependendo da defesa que o jogador monta.
  - Jornadas para zerar a árvore (20.330 com Masteries): só vitórias, 4 (3 a 4 pela faixa); ciclos de vitória mais
    bloco, 3 (3 a 4); só blocos de Bastião, 11 no teto.
  - Sobrevivência: medida, mas não confiável. Com as construções padrão a party cai em 0,4 a 1,2 minuto. Ficou só
    medido, sem edição (decisão 13).
- **Testes:** `build`, `sim:check` (saída igual à da linha de base), `bastion:check` (seção 15 nova), `arvore:check`
  (112), `arvore:save:check` (44), `arvore:combate:check` (45), `aura:check` e `banco:check` (novo, 37). Visual: tela da
  árvore aberta pelo menu com banco de teste (screenshot), sem erros de console.
- **Pendências:**
  - 12 caminhos alternativos são só ligação (sem bônus próprio). Conta como efeito porque abrem rota, mas, se o dono
    contar só bônus ou Mastery, são 98 nós com efeito (abaixo de 100). Decidir se os caminhos ganham bônus.
  - Bastião: a medição é aproximada (layout padrão, sem as estruturas do jogador). O crédito do bloco depende da defesa.
  - Sobrevivência: medir de novo com barreiras de jogador antes de fechar a conta (decisão 13).
  - Fim de jornada e bloco do Bastião foram testados só com checagens headless e leitura do código, não no navegador.
  - Pré-existente, fora do escopo do Zen: o pacote de cartas da vitória é gravado depois de a jornada ficar encerrada.
    Queda entre as duas escritas perde o pacote.
  - Pré-existente: `survivalRewards` (core/run/run.ts) usa `Math.random()`, contra a regra 3 do núcleo. Não foi tocado.
  - Chave da jornada usa a semente. Semente corrompida (não finita) vira 1 na migração e pode colidir com outra jornada.

## Árvore visual: roda com caminho aceso (branch arvore-visual-wf)

- **Data:** 2026-10-15. **Pedido:** redesenhar a Árvore de Aurenthal com a arte da 15.webp (base da roda). Escopo final do
  dono: só a roda (cabeçalho, painéis laterais, "Tipos de nós", "Regiões temáticas", "Sua equipe", barra inferior e fundo
  com ilhas ficaram fora). Painéis de detalhe, Masteries, reorganizar em Zen e banco continuam como estavam.
- **Arte:** `scripts/recortarArvore.py <imagem>` gera `public/ui/arvore/` (seis emblemas de setor, núcleo ROGUARD, aro da
  moldura e miolo escuro). As caixas são frações da imagem: a HD roda sem ajuste manual.
- **Setores (15.webp):** topo = Destruição (regiões Campos Ígneos), esquerda-alta = Controle (Ermos), direita-alta =
  Proteção (Muralha), esquerda-baixa = Execução (Véu Sombrio), base = Mobilidade (Estradas e Cidades), direita-baixa =
  Sinergia (Fortaleza do Bastião, mais as três Masteries do núcleo). Nós do núcleo e caminhos de ligação ficam soltos.
  A troca de setor é uma linha em `SETOR_DA_REGIAO` (src/config/arvoreVisual.ts).
- **Roda:** anéis pela profundidade do grafo (BFS: 9 anéis, do 92 ao 356 px do centro, passo de 33 px). Os 111 nós não se cobrem e cabem no aro.
  Tamanhos no zoom 1: comum 34, notável 44, Mastery 46, caminho 30, núcleo 64 px (a arte do núcleo tem 118 px).
- **Caminho aceso:** passar o cursor sobre um nó acende o caminho até a rede aberta (nós, arestas e custo em Zen); clicar
  mantém o caminho até trocar a seleção. Nós abertos brilham na cor do setor; disponíveis pulsam; bloqueados em cinza.
- **Nomes:** 13 px no zoom 1. No zoom padrão de 1600x900 aparecem 47 dos 67 nomes de notáveis e Masteries (35 de 49 notáveis e 12 de 18 Masteries) (sem cobrir nó,
  medalhão ou outro nome). Os demais, e os nomes dos comuns, aparecem com o cursor. Abaixo de 0,75 de zoom, nenhum nome.
- **Checagem:** `npm run arvore:visual:check` (nós sem sobreposição, aro, cunhas, nomes livres e caminhos).
- **Pendências:**
  - Em 1280x720 o zoom padrão fica em ~0,76: a roda cabe, mas os nomes saem com ~10 px, pequenos para ler de perto.
    Em telas mais altas a roda tem mais espaço para os nomes; a janela continua com altura máxima de 860 px.
  - Ícones de classe nos nós de classe não foram feitos: a árvore tem poucos nós exclusivos de uma classe e os ícones
    de `public/icons/skills` ainda não têm uso definido. Decidir com o dono.
  - Bastião foi para Sinergia (e não Proteção) para equilibrar as cunhas (Proteção ficaria com 28 nós).
  - Fundo com ilhas e cidade: fora deste escopo. A arte é do dono; se for usada, precisa de uma versão sem os painéis.

## Árvore visual: refino (poluição, direção artística, composição, núcleo) — branch arvore-refino-wf

- **Data:** 2026-10-15. **Pedido:** refino visual da roda da Árvore de Aurenthal, sem trocar o sistema funcional pela imagem
  estática (compra, Masteries, reorganizar, filtro, zoom e pan e bloqueio em combate continuam como estavam).
- **Poluição:** a roda não escreve mais nenhum nome (0 textos na roda, medido no Chromium). Cada nó é uma forma com ícone:
  comum (círculo com ícone pequeno), notável (rosácea de 8 pontas com moldura), caminho (losango com linha) e Mastery
  (hexágono de moldura dupla com o emblema do setor). Nome, efeito, requisitos e custo vão para o painel de detalhes.
  Passar o cursor mostra um tooltip compacto que segue o mouse (nome, tipo, estado, caminho e Zen que faltam). No toque não
  há passagem: tocar num nó seleciona e o painel mostra tudo.
- **Ícones:** pelo primeiro bônus do nó, com a arte do kit do dono (`public/ui/kit`): vida = coração, defesa = escudo,
  dano = espadas, crítico = estrela, haste = calendário, Zen = moeda, EXP = pergaminho etc. A tabela está em
  `ICONE_POR_BONUS` (src/config/arvoreVisual.ts). Ponto de Mastery usa o emblema do setor. Para o dono revisar.
- **Composição:** três colunas. Esquerda: legenda curta (tipos de nó, regiões temáticas, estados). Centro: a roda.
  Direita: painel de detalhes com moldura (nome, estado, efeito, requisitos, custo, ação) e, em Masteries, a atribuição
  do herói dentro do painel do ponto dela. A janela passa de 1240 para 1400 px de largura máxima.
- **Núcleo:** o emblema oficial `public/emblem.png` (é o mesmo da entrada e da HUD), com brilho frio e opacidade de 90%.
  `public/ui/arvore/nucleo.webp` ficou sem uso (pode sair num próximo passo).
- **Direção artística:** fundo de pedra antiga (`public/textures/pedras/pedra_escura.webp`, discreto), vinheta nas bordas,
  anel tracejado arcano, brilho por setor (aceso nos abertos, no caminho e no cursor; discreto nos notáveis e Masteries).
  Setores um pouco menos saturados (config).
- **Transições:** hover e seleção com escala e opacidade (só `transform` e `opacity`), tempo e escala na config. Reduzir
  movimento desliga as animações.
- **Correções encontradas no caminho:** (1) a janela de desenho só era medida ao abrir ou ao redimensionar a janela; a faixa
  de mensagem muda a altura do canvas e deslocava o centro da roda, então cliques caíam fora do nó: agora um
  ResizeObserver acompanha o canvas. (2) Depois de refazer a roda, o tooltip podia ficar preso no nó antigo: agora o
  navegador é consultado pelo ponto do cursor. (3) O zoom padrão era medido antes do painel de detalhes existir: agora a
  roda é medida depois do primeiro desenho (em 1280x720 a roda cabe inteira).
- **Checagem:** `npm run arvore:visual:check`. A regra mudou (nenhum nome fica na roda), então a checagem (c) passou a validar
  que todo nó comum, notável e de Mastery tem ícone, que os ícones e a arte da roda existem em `public/`, e a (e) valida os
  tamanhos e o tamanho mínimo do ícone comum (20 px). Os limiares de zoom para nomes saíram com a regra antiga.
- **Pendências e decisões para o dono:**
  - Custo em Zen: o mock fala em "pontos" (4 pontos no topo, "Reiniciar · custo 100"). Mantivemos o Zen do banco, que é a
    decisão já tomada. O contador de pontos do mock não foi incluído.
  - Filtro por categoria: continua como seletor no canto da roda. A legenda mostra as regiões temáticas (os seis setores).
  - Tabela de ícones por bônus: conferir se cada ícone combina com o bônus (ex.: calendário para Haste, portão para muralha).
  - Acessibilidade por teclado nos nós: não existe (já era assim); a seleção por teclado fica para depois.
  - Não foi verificado no build do Electron/Steam: as capturas são do Chromium (servidor de desenvolvimento).
  - Item 5 de "interação e animação" veio cortado no pedido: implementamos só hover (tooltip e caminho aceso), seleção e
    transições suaves, como pedido.
## 2026-10-15 — ritmo das noites de horda: portais que abrem e ritmo crescente (v0.12, em andamento)

**Pedido do dono (fiel):** "preciso que voce reveja as hordas e a noite de cada run pois parece que tem algumas noites que acabam muito cedo e outras demoram muito... a idéia é que conforme vai passando o tempo mais locais de spawn ao redor do mapa vao sendo criados spawnando cada vez mais criatura até chegar o fim que vai ser quando o jogador matar a ultima criatura."

**Diagnóstico (antes):**
- Com a party típica de cada ato (builds de `scripts/runCheck.ts`), a duração de uma noite de horda variava de 600 a 3863 ticks; dentro do mesmo ato, até 3x (Ato I: 600 a 1365; Ato III: 1723 a 3863). Esse é o "acaba cedo / demora muito" que o dono viu.
- Correção à nota preliminar: as noites **não** acabam por cidade caindo. Medidas com a montagem da campanha (party por ato, formação padrão, builds típicas), as 55 noites vencem. A derrota da medição preliminar vinha de montagem errada: dois heróis no Ato I, sem o corte de tamanho da party e sem o ajuste de vida do ato.
- Conta nova, guerreiro nível 1, sem build (modo literal): a party morre em 50 de 55 noites, antes e depois desta mudança. Isso é balanceamento de combate, não ritmo: ficou para o dono decidir.
- O intervalo médio real entre criaturas é 0,85 × `spawnIntervalTicks` (as pausas das levas são sorteadas entre 0,45 e 1,25). Não corrigi isso, para não mexer no Bastião (usa o mesmo motor). A calibração já considera o fator.
- Teto de densidade (softAlive 35): em crookedWood, dryCrossing, rustGorge e ashenFields a noite é limitada pela capacidade da party, não pelo intervalo. Nessas zonas o ajuste foi no orçamento.

**O que foi feito:**
- **Portais extras:** cada zona de batalha da campanha (11) tem 2 portais a mais, que abrem com 30% e 60% do orçamento já nascido. Os 2 portais originais continuam abertos desde o começo; os extras começam fechados. Zonas sem batalha (whisperWood, frostPass), o cerco e o Bastião não têm extras.
- **Ritmo:** intervalo = intervalo da zona × curva(progresso) ÷ (1 + 0,5 × portais extras abertos). Curva `RITMO_CAMPANHA`: 1,3 no início, 1,0 no meio, 0,8 no fim (`src/config/zones.ts`).
- **Só portal aberto conta:** recebe criaturas, mostra setas e cenário, e restringe a colocação de heróis. Portal fechado não aparece (decisão: sem marca apagada). Ao abrir, cresce e aparece no log.
- **Fim da noite:** não mudou (orçamento nascido + última criatura morta). Agora o check confirma que a vitória cai no tick da última morte.
- **Noites do mesmo ato:** alvo de 1000 ticks (Ato I, 1 min 40 s), 1800 (Ato II, 3 min) e 2700 (Ato III, 4 min 30 s), ±15%. Chefe e elite entram na conta: têm 0,55 e 0,65 do orçamento e intervalo ×1/0,55 e ×1/0,65, para durar o mesmo tempo (`GAME_CONFIG.wave.nos`). Constantes em `ALVO_DE_NOITE` (config).
- **Cerco e Bastião:** sem curva. Assinatura da simulação idêntica ao commit anterior (18c06a8), bit a bit. O cerco de Dunas Vermelhas mantém o intervalo 8 (campo `intervaloCerco`), porque a calibração da horda mudou o intervalo da zona.
- **Editor de mapas:** antes só guardava 2 portais (salvar perderia os extras). Agora guarda todos e preserva `ativaEm` ao mover um portal.
- **Formação padrão da noite** foi para o núcleo (`src/core/run/formacao.ts`). `main.ts` usa a mesma função, sem mudança de jogo. O check usa essa função.

**Valores finais (`src/config/zones.ts`):**

| zona | nó | intervalo | orçamento | portais extras (x,y · abre em) |
|---|---|---|---|---|
| bridge | horda, Ato I | 23,5 | 160 (×0,6 com 1 herói) | (16,18) · 0,3; (43,29) · 0,6 |
| crookedWood | horda, Ato I | 7 | 170 (era 250) | (3,17) · 0,3; (42,17) · 0,6 |
| ravenGlade | chefe, Ato I | 17,2 | 130 | (3,18) · 0,3; (41,9) · 0,6 |
| rootVale | horda, Ato II | 11,2 | 240 | (3,10) · 0,3; (41,11) · 0,6 |
| dryCrossing | horda, Ato II | 5 | 416 (era 450) | (3,0) · 0,3; (44,11) · 0,6 |
| redDunes | horda, Ato II (cerco: intervalo 8) | 12,7 | 260 | (0,17) · 0,3; (44,17) · 0,6 |
| solarRuins | chefe, Ato II | 43,4 | 90 | (3,14) · 0,3; (41,13) · 0,6 |
| ashenFields | horda, Ato III | 5,3 | 600 | (0,12) · 0,3; (44,12) · 0,6 |
| rustGorge | horda, Ato III | 6 | 425 (era 600) | (9,8) · 0,3; (34,9) · 0,6 |
| detarderusLair | elite, Ato III | 15,3 | 240 | (2,5) · 0,3; (42,14) · 0,6 |
| ashPeak | chefe, Ato III | 17,6 | 240 | (2,5) · 0,3; (42,14) · 0,6 |

Os portais extras foram escolhidos com o cálculo de candidatos (chão livre, alcançável até o portão, a 18 a 38 tiles da cidade e a 8 ou mais dos spawns atuais). `horda:check` confere o alcance e a ordem.

**Medição antes/depois** (party típica, 5 sementes, muralha cheia a cada noite). "Ult." é o tick do último nascimento; no chefe, o do chefe.

| noite | antes (mín/méd/máx) | depois (mín/méd/máx) | ult. antes→depois | portais | resultado |
|---|---|---|---|---|---|
| bridge · horda I | 511/600/759 | 828/973/1100 | 384→688 | 2→4 | 5 vitórias |
| crookedWood · horda I | 1256/1365/1462 | 791/953/1052 | 1054→634 | 2→4 | 5 vitórias |
| ravenGlade · chefe I | 665/741/806 | 845/986/1097 | 287→535 (chefe 317→565) | 2→4 | 5 vitórias |
| rootVale · horda II | 1427/1667/1978 | 1432/1748/2049 | 1289→1390 | 2→4 | 5 vitórias |
| dryCrossing · horda II | 1901/2196/2520 | 1651/1833/2110 | 1947→1544 | 2→4 | 5 vitórias |
| redDunes · horda II | 1511/1907/2189 | 1595/1869/2058 | 1510→1463 | 2→4 | 5 vitórias |
| solarRuins · chefe II | 626/731/919 | 1373/1832/2156 | 221→1385 (chefe 251→1415) | 2→4 | 5 vitórias |
| ashenFields · horda III | 2801/3193/3579 | 2400/2725/3183 | 2924→2501 | 2→4 | 5 vitórias |
| rustGorge · horda III | 3336/3863/4465 | 2399/2711/3117 | 3555→2385 | 2→4 | 5 vitórias |
| detarderusLair · elite III | 1785/1881/1983 | 2503/2642/2821 | 983→1740 (chefe 1583→2340) | 2→4 | 5 vitórias |
| ashPeak · chefe III | 1624/1723/1853 | 2427/2755/3018 | 712→1735 (chefe 1312→2335) | 2→4 | 5 vitórias |

Portais: a abertura dos extras acontece, por exemplo, aos ticks 294 e 481 (bridge) e 710 e 1351 (ashenFields). Média por ato: Ato I 953 a 986 (alvo 1000); Ato II 1748 a 1869 (alvo 1800); Ato III 2642 a 2755 (alvo 2700).

**Modo literal (conta nova, sem build), antes → depois:** derrotas 50/55 → 50/55 (todas por party morta; nenhuma por cidade caindo).

**Verificação visual (Chromium headless, dev, renderização por software):** `captura_inicio.png` (crookedWood, mapa inteiro, início da noite): os dois anéis violeta no topo são os portais iniciais; os extras (a oeste e a leste, no meio do mapa) não aparecem; as trilhas de chão levam até esses pontos (decisão 4). `captura_meio_portal_v2.png` (mesma noite, tick 280, portal (3,17) aberto, 51 criaturas nasceram e 30 estão vivas): criaturas descem a trilha da esquerda. Nessa captura o anel do portal novo não aparece com nitidez. A leitura da cena confirma o portal aberto e visível (anel visível, setas visíveis). Antes da correção do commit 9468b56, o cenário do portal ainda fechado aparecia; agora fica oculto. Falta olhar o anel do portal novo no PC do dono.

**Testes:** `npm run build`, `npm run sim:check`, `npm run bastion:check`, `npm run aura:check`, `npm run cenario:check`, `npm run arvore:check` (112/112), `npm run banco:check` (37/37), `npm run horda:check` (novo, 31 ok, 0 falha), `zoneReachCheck`, `survivalCheck`, `skillArenaCheck`, `mapEditorCheck`. Neutralidade do Bastião e do cerco: assinatura igual ao commit 18c06a8.

**Linha de base do `sim:check` (atualizada de propósito):** o script só imprime, não compara números. Mudou em todas as zonas da campanha (e na ponte, que é a zona ativa por padrão), porque a noite nova nasce com outro ritmo e outros portais. As zonas de cerco e Bastião, não. Ex.: ponte · defesa padrão, antes "defeat em 788 ticks, abatidos 47"; depois "defeat em 1465 ticks, abatidos 81". Determinístico: true, como antes. Todas as zonas continuam terminando.

**Decisões para o dono:**
1. Chefe e elite nascem com menos criaturas, mais espaçadas (solarRuins: 49 criaturas em cerca de 1400 ticks). Se preferir noite de chefe curta e densa, é só mudar `GAME_CONFIG.wave.nos`, mas aí a dificuldade sobe.
2. Cortei o orçamento de crookedWood (250 → 170), rustGorge (600 → 425) e dryCrossing (450 → 416). É uma queda de dificuldade nessas noites. Confirmar.
3. Alvos: 1000 / 1800 / 2700 ticks (100 s, 180 s e 270 s), ±15%. Confirmar os números.
4. Portal fechado não aparece (sem marca apagada). As trilhas de chão continuam para todos os pontos (são geografia). Confirmar.
5. Balanceamento: em conta nova, sem build, a party morre na maioria das noites. Isso não é ritmo, e não mexi em combate.

**Limitações:** a medição não tem equipamento, gasto de habilidades pelo jogador nem formação salva; a muralha da cidade é reparada entre as noites. Não foi testada a fluidez no PC do dono (4 portais e cenário por portal aumentam as chamadas de desenho). Captura feita no Chromium headless com renderização por software, então não mede FPS.

**Commits:**
- 8a20972 Noite: portais que abrem e ritmo crescente no motor e na campanha
- a5e9ad4 Apresentação: portal aparece só quando abre
- 9468b56 Apresentação: cenário de portal fechado fica oculto desde o vínculo
- (este commit) Checagem horda:check e registro do ritmo das noites

## 2026-10-16 — Estabilização parte 1: checagens únicas e desenho

**Pedido do dono:** juntar as checagens num comando só, registrar o desenho do jogo num documento de referência e deixar os saves de fora desta etapa.

**O que mudou:**
- `npm run check`: roda o build e todas as checagens (13), em ordem alfabética, com timeout de 900 s por etapa. Mostra uma tabela (ok ou FALHA, tempo, código de saída e última linha) e termina com "N ok, M falhas". Opções: `npm run check:rapido` (sem o build) e `npm run check -- --so=<nome>` (uma etapa). As checagens são descobertas no `package.json` (nome com "check", mais `bastion:path`). Arquivo: `scripts/checkAll.ts`.
- `docs/DESENHO.md`: referência do jogo em 12 seções. Cada número traz o caminho do arquivo de origem; o que não deu para confirmar está como "a confirmar".
- `CLAUDE.md`, regra 5: passa a exigir `npm run check` e screenshot para mudança de UI ou visual.

**Verificação:** `npm run check` deu 14 ok e 0 falhas (build em 23,5 s). O caminho de falha foi testado num projeto de teste fora do repositório: código de saída 1, saída da etapa mostrada e resumo correto. O documento foi conferido contra o código (85 valores, mais as 11 misturas de criaturas da tabela).

**Decisões:**
- `checkAll.ts` usa `/// <reference types="node" />`, porque o `tsconfig` tem `types: []`. Os outros scripts com Node usam `@ts-nocheck`; este mantém a checagem de tipos.
- `ui:fora-da-tela` fica fora do comando, porque precisa de servidor de dev e de navegador. Aparece no fim da saída com o motivo.
- Saves ficam adiados nesta etapa: nenhuma mudança de formato, migração ou fixture.

**Correções do desenho em relação ao log:**
- O documento segue o código: chefe e elite com ×0,85 e ×0,9 (`GAME_CONFIG.wave.nos`, commit 0966d2f). A entrada de 2026-10-15 ainda cita ×0,55 e ×0,65, que estão desatualizados.
- A medição de 50 de 55 noites é do modo literal (conta nova, guerreiro nível 1, sem build), e não da party típica. Com party típica, as 55 noites vencem.

**Pendências:**
- Saves: adiados para a próxima etapa de estabilização.
- `ui:fora-da-tela`: fora do comando (precisa de servidor e navegador). Para rodar à mão: `npx vite --port 5561` e depois `npm run ui:fora-da-tela`.
- 15 arquivos de checagem em `scripts/` sem entrada no `package.json` não rodam no `npm run check` (lista em `docs/DESENHO.md`, seção 10). Decidir se entram no comando.
- Sobrevivência não medida: `horda:check` não cobre o modo. Duração da noite de sobrevivência: a confirmar.
- Dívida técnica (`docs/DESENHO.md`, seção 11): efeitos de magia em sistemas paralelos, duas árvores de habilidades, `main.ts` com 2973 linhas, 57 usos de `innerHTML` em `src/ui`, arte mista.
- Dono: confirmar o Zen inicial do Bastião (20, provisório) e a decisão sobre a conta nova (50 de 55 noites).

**Commits:**
- 4866b42 Checagem única: npm run check roda o build e todas as checagens
- 4d348ff Documento de desenho: docs/DESENHO.md com as 12 seções de referência
- eebd175 CLAUDE.md: regra 5 passa a exigir npm run check e screenshot para UI
- 6d92579 Registro da estabilização parte 1 em LOG_SESSOES.md
- (esta correção) docs/DESENHO.md: vocações sem desenho aparecem como "Em breve" (valor confirmado no código, `null` em `src/config/vocations.ts`)

## 2026-10-16 — Estabilização parte 2: checagens completas, determinismo do núcleo e revisão

**O que mudou:**
- Determinismo do núcleo (branch `estab-nucleo`, integrada): `newRun(starter, seed)` exige a semente, que vem da interface (`novaSemente()` em `src/main.ts`). Os sorteios de loot, loja, refino, eventos, cofres e sobrevivência saem de um fluxo derivado da semente da jornada. Ids de item viram `it-<contador>`, sem relógio. Nenhum campo novo é salvo, então não há migração.
- `npm run determinismo:check`: varredura de `src/core` (sem chamadas proibidas) e prova de que a mesma semente dá a mesma jornada.
- `npm run check`: 30 etapas (build e 29 checagens), todas ok. Passaram a entrar no comando as 15 checagens que estavam só em `scripts/`.
- `zenTextCheck`: falso positivo corrigido. Ele acusava identificadores como `ganharZeni` e `startZeni`. Agora só conta "Zeni" que começa uma palavra. Não havia texto visível com "Zeni".
- `cardRuleCheck`: a linha de base da campanha sem cartas foi re-ancorada (`82f09eb9acc64759`, antes `00fdbdc44cff71e4`). Bisect entre `69714ce` e `867ac0d` apontou `d2146067` como o primeiro commit que muda o hash. Esse commit pôs o palhaço na mistura dos Campos Cinzentos, de propósito. O motor não mudou: o hash é o mesmo no `867ac0d` e no branch.
- `docs/DESENHO.md` e a regra 5 do CLAUDE.md foram atualizados para refletir as checagens registradas.

**Verificação:**
- `sim:check`: `determinístico: true`. Saída igual à do `867ac0d` (diff vazio, medido pelo agente de determinismo).
- A linha de base do `sim:check` não foi alterada.

**Decisão em aberto (do dono):**
- O fluxo de sorteio não é salvo. Ao recarregar o jogo, ele recomeça da semente: dentro da sessão continua de onde parou, mas depois de uma recarga o próximo loot, loja ou refino sai igual ao da primeira vez. Antes da mudança, cada carga do jogo gerava aleatoriedade nova. Hoje, recarregar permite aprender a sequência e escolher o momento. Opções: (a) gravar a posição do fluxo no save, com campo novo e migração, junto com a etapa de saves; (b) aceitar.

**Pendências:**
- Saves: adiados nesta etapa, como pedido. Incluem a posição do fluxo (acima), a migração e as fixtures.
- `ui:fora-da-tela`: fica fora do comando, porque precisa de servidor de dev e de Chromium.
- Pacote de cartas: `src/main.ts` usa `Math.random` na interface (`rollPack`). Está fora do núcleo, mas o determinismo do pacote é uma tarefa à parte.
- Sobrevivência: a duração da noite não é medida; `horda:check` não cobre o modo.
- Comentário desatualizado em `src/config/gameConfig.ts` (linha ~81): diz que o Detarderus é "mini-chefe do Passo da Geada", mas em `src/config/world.ts` ele fica no Covil do Detarderus. Não corrigido.
- Zen inicial do Bastião (20): provisório, a confirmar pelo dono.
- Conta nova morre em 50 de 55 noites (modo literal): decisão do dono, ver entrada de 2026-10-15.
- Limpeza: a worktree `estab-check` e o cache de pip foram removidos para liberar espaço. Ainda há cerca de 12 GB de rascunhos em `scratchpad/` (cópias de trabalho antigas), a decidir.

**Commits:**
- `44ababa` Checagem única: npm run check roda o build e todas as checagens
- `cb66940` Documento de desenho: docs/DESENHO.md com as 12 seções de referência
- `4b0265d` CLAUDE.md: regra 5 passa a exigir npm run check e screenshot para UI
- `8cb9594` Registro da estabilização parte 1 em LOG_SESSOES.md
- `ae3c990` Desenho: vocações sem desenho aparecem como "Em breve"
- `cbae78b` Núcleo determinístico: seed vem de fora e sorteios saem da semente
- `00c2091` Checagem de determinismo do núcleo (determinismo:check)
- `14b2ca6` Checagens: registra as 15 checagens fora do comando e corrige falso positivo do zenTextCheck
- `b2ed067` Checagem de regras de carta: linha de base da campanha sem cartas re-ancorada em d2146067

## 2026-10-16 — Revisão independente do determinismo: recarga repete sorteios (decisão urgente do dono)

**Achado mais grave (alta):** desde o determinismo da jornada, o sorteio de loja, refino, cofre, evento e presente sai da seed da jornada, e a seed fica no save. O fluxo não é salvo, então ao recarregar ele recomeça da seed. Recarregar antes de cada tentativa de refino repete o mesmo resultado. Harness do revisor (cópia do branch, fora do repositório, 200 jornadas): em sementes com sorte favorável, chegar ao +10 leva 10 tentativas, sem falha, cerca de 3.700 Zen. Sem recarga, a média é 256 tentativas e 109.600 Zen.

- Antes da mudança (`867ac0d`), o sorteio vinha do relógio a cada carga e não ficava no save. Recarregar não dava vantagem (3 sucessos em 20 tentativas, na mesma proporção de quem não recarregava). Agora dá. O problema é novo como previsibilidade e como custo.
- Também previsíveis a partir do save: a vitrine da loja (primeiro item = `pool[floor(u0 × 4)]`, em 2000 de 2000 sementes), o cofre e o presente da primeira vitória (com recarga, o presente volta ao de quem não usou o cofre), e a aposta do evento (com recarga antes de cada aposta, vence 10 de 10 em cerca de 90% das sementes; o `paidKey` limita a uma vitória por nó).
- Causa: o sorteio da jornada é função pura da seed, e a seed está no save em texto. A constante do fluxo está no código público.
- O combate já era previsível pela seed do nó, na base e agora. Não mudou.

**Opções (decisão do dono, nada aplicado):**
- **(A) Gravar a posição do fluxo no save**, com campo novo e migração. A recarga continua a sequência: não repete e não rerrola. Previsível só para quem ler o JSON e calcular. Recomendado. Faz parte da etapa de saves.
- **(B) Não guardar a posição nem a seed do fluxo**, e começar de entropia nova a cada carga (a interface fornece, como a base fazia com `Date.now`). Fecha a repetição já, sem migração. O combate continua reproduzível pela seed do nó. Volta a dar um resultado novo a cada carga, como antes.

**O que a revisão achou além disso** (todos com harness próprio, fora do repositório):
- `determinismo:check` dava falsa segurança: só rodava a jornada, e um sorteio escondido no combate passava. **Corrigido** nesta entrada (commit `876d04b`): jornada e batalha rodam com guarda que lança erro em `Math.random`, `Date.now`, `performance.now`, `new Date()` e `crypto`; a varredura estática cobre `globalThis`, `window`, imports de `crypto`/`fs`/`process` e `.js`/`.mjs`. Seis mutantes (combate, contador de módulo, `new globalThis.Date()`, alias, `Reflect`, arquivo fora do caminho executado) saem com código 1.
- O check ainda não prova continuidade após recarga, e o cabeçalho diz isso. Esse é o ponto da opção A.
- Simulação sem seed explícita: o construtor de `Simulation` usa `GAME_CONFIG.wave.seed`, um global que `applyZone` reescreve. Hoje a campanha passa a seed certa pela ordem das chamadas, mas nada no núcleo impõe isso (média). Pendência.
- Pacote de cartas da vitória: `src/main.ts` sorteia com `rollPack(Math.random)` (baixa). A regra do pacote é do núcleo (`core/bastion/rules.ts` já recebe um RNG com semente), então a interface decide a sorte. Pergunta ao dono: o pacote deve sair da seed?
- Bastião: cada entrada cria `newRun(party[0], b.seed)`, e o fluxo recomeça (baixa, sem efeito hoje, porque o Bastião não sorteia loja nem cofre na run).
- Id de item: após vender um item e reabrir, o contador volta a 0 e um id pode ser reutilizado (baixa; não colide com item em uso).
- `src/config/temporadas.ts` tem `new Date()` como valor padrão (baixa; só a interface importa o arquivo).

**Estado:** a revisão de saves e a de reprodução do sim:check ainda estavam em andamento quando esta entrada foi escrita. Os achados acima já têm evidência. Entradas novas, se houver, vão para o log à parte.

## 2026-10-16 — Opção A: sequência de sorteios guardada no save (versão 2)

**Decisão do dono:** opção A (guardar a posição do sorteio no save, com migração). A recarga continua a sequência de onde parou, em vez de repetir o início.

**O que mudou:**
- `RunState` ganha `sorteio: { estado, itens }` e vai para a versão 2. Cada sorteio grava o novo estado na própria run (`SorteioDaRun`). O contador de ids de item fica no mesmo campo.
- `migrateRun` converte a v1: o estado começa da seed (como a versão anterior fazia ao abrir), e o contador começa acima do maior id `it-<base36>` visível no save. Cada campo é conferido sozinho.
- `lerJornada` (núcleo, pura) decide o que fazer com o texto do save: nova, ok, migrada, versão futura, corrompida ou encerrada. Versão futura ou ilegível não é migrada nem apagada.
- `acrescentarCopia`: a lista `runBackup` só cresce. Cada jornada não entendida entra nela, e a v1 entra antes da migração.
- Se a cópia falhar, `jornadaBloqueada` impede a gravação por cima e o encerramento da jornada (sem crédito de Zen). O aviso aparece uma vez por sessão.
- Ao trocar de run (jornada nova ou entrada no Bastião), os itens vistos da anterior são zerados. Sem isso, o equipar automático deixava de funcionar depois de uma derrota.
- Electron: a leitura devolve `runBackup` e o texto do principal mesmo quando ele não abre (antes virava "save novo" e era apagado na primeira gravação).

**Provas:**
- `npm run saves:check` (31 ok): fixtures reais de `867ac0d` e `f3b5bd9` (gerados com o código de cada versão, em `tests/saves/`) e `jornada_v2.json`. Migram, mantêm a seed, não reemitem id já usado, e a recarga não repete nem pula. Um controle com recarga que reinicia a seed é pego. Entradas inválidas, contador enorme, campo inválido e loja malformada são tratados.
- `npm run determinismo:check`: agora exige que a recarga continue a sequência.
- Teste de propriedade fora do repositório (verificação adversarial): 230 sequências, 27.600 ações, recarga antes de cada ação. Zero divergências depois da correção do reuso de id (antes, uma).
- O código antigo diverge em 40 de 40 sequências. A recarga errada (volta à seed, zera o contador, ou consome um sorteio) falha em 70 de 70.

**O que a verificação achou e foi corrigido:**
- (alta) `encerrarJornada` gravava `run` por cima mesmo bloqueada. Agora não grava e não credita.
- (média) Electron não lia `runBackup` de volta: a segunda cópia apagava a primeira. Corrigido.
- (média) JSON ilegível sem `.bak` virava "save novo". Corrigido: o texto principal é devolvido ao jogo.
- (média) Bloqueio mudo durante a partida. Agora o aviso sai uma vez e o texto diz o que fazer.
- (baixa) Exceção na leitura não bloqueava. Corrigido.
- (baixa, reproduzida) Migração v1 reemitia ids de itens vendidos. Corrigido com o maior id visível.
- (baixa) Contador acima de 2^53 travava o segundo sorteio (`do/while` sem saída). Limite de 1e9. Corrigido.
- (baixa) Um campo inválido do sorteio jogava fora o outro. Corrigido.
- (baixa) Loja malformada derrubava os sorteios. Corrigido (sai do save; a cidade regenera).

**Limites conhecidos (registrados, não corrigidos):**
- O primeiro sorteio depois da migração de um save v1 repete o conteúdo do primeiro sorteio de uma run nova com a mesma seed. Uma vez por save v1; o save v1 não guardava a posição.
- Um item vendido antes da migração, com número acima do maior id visível, pode voltar a ter o mesmo id. O save não guarda esse número.

**Pendências (fora desta mudança, no desenho, seção 11):**
- Ids de drop de combate não passam pelo contador da run e podem repetir entre batalhas. A verificar.
- `bastionBackup` sobrescreve a cópia anterior.
- `Simulation` usa `GAME_CONFIG.wave.seed` como padrão, um global que `applyZone` reescreve.
- Pacote de cartas da vitória sorteia com `Math.random` na interface.
- Loja e cofre dividem o mesmo sorteio: a ordem das ações escolhe o estoque. Decisão de design a registrar.

**Commits:** `179a8f7` (sorteio no save, migração, checagens), `5334afa` (ligação com a interface, runBackup, bloqueio), e o commit seguinte (correções da verificação, desenho e log).

## 2026-10-16 — Loja e cofre com sorteio próprio (decisão do dono)

**Decisão do dono:** loja e cofre não dividem sorteio. Antes, os dois puxavam do mesmo gerador da jornada, então abrir o cofre antes de ver a loja mudava o estoque (seed 7: loja `common, common, uncommon, rare` contra `rare, uncommon, uncommon, uncommon`). Seção 11 do desenho confirmada.

**O que mudou:**
- Save passa à versão 3. `Sorteio` tem `estados: { jornada, loja, cofre }` e `itens`. Cada fluxo tem o seu estado, guardado no save, e cada um continua de onde parou depois de uma recarga.
- `loja` usa o fluxo da loja (`shopStock`). `cofre` (objeto "Vasculhar a carga") usa o fluxo do cofre. Loot, refino, eventos, presente e reroll continuam na jornada.
- Migração: v2 preserva o estado da jornada (a sequência não recomeça); loja e cofre começam da seed. v1 começa os três da seed, como antes. Save v2 vai para a lista `runBackup` uma vez, na migração.
- O contador de ids continua compartilhado: id é nome, não entra no sorteio, então o conteúdo dos itens não depende dele.

**Provas:**
- `npm run saves:check`: fixture nova `tests/saves/jornada_v3.json` (gerada pelo código atual, com loja e cofre já usados). Testes de isolamento (loja não mexe no cofre e vice-versa), de recompensa do cofre (igual com ou sem loja antes), de loot da jornada (igual, ids à parte), de recarga contínua de loja e cofre, e dois controles que têm que falhar. A v2 real passa a migrar com o estado da jornada preservado.
- `npm run determinismo:check`: passa. O hash das sementes mudou, porque a loja e o cofre agora sorteiam de outro fluxo. Esperado.

**Achado nesta etapa (corrigido):** `determinismo:check` não cobria o ramo da tempestade de areia do combate (`Simulation.ts:681`), porque a batalha de teste era só a padrão. Trocar o sorteio desse ramo por `Math['ran' + 'dom']()` passava no check. Correção: a batalha roda também no deserto e exige tempestade; a varredura estática proíbe `Reflect`. Os três mutantes (nome calculado, `Reflect` e `Math.random` direto) agora falham.


**Revisão independente da mudança (depois do commit 74c4232):**
- Achados corrigidos: (média) a migração da v2 gravava a v3 mesmo se a cópia em runBackup falhasse; agora bloqueia a gravação, como os outros saves; (baixa) loja que não é lista derrubava a abertura do save, porque o contador de ids lia a loja; agora a loja sai antes; (baixa) estado fora de 32 bits virava 0 em silêncio; agora volta à seed; (baixa, verificada) loja e cofre repetiam a jornada deslocada por 1515 sorteios em 65536 sementes, porque seed XOR constante com o mesmo incremento do Rng deixava os estados iniciais alinhados; agora loja e cofre começam 2^30 e 2^31 estados à frente da jornada, no ciclo do gerador, então não se encontram numa run (a jornada não muda, para a v1 e a v2 continuarem a sequência). Medido em 4 milhões de sementes: 58 sobreposições antes, 0 depois. Saves já gravados com a versão anterior mantêm o estado antigo; neles a chance de sobreposição é de uma em cerca de 65 mil sementes e só aparece depois de mais de 1500 sorteios de um fluxo.
- Regressões em `saves:check` (sete casos): os sete falharam antes da correção e passam depois.
- Nota de desenho para o dono: quem já tem save v2 vai ver a sequência futura da jornada mudar em relação ao código antigo, quando a loja gerar estoque ou o cofre sortear. Isso é a separação decidida (seção 8), não um erro, mas o dono deve saber.
- Achado de texto (seção 11): o rótulo "Vasculhar a carga" aparece no objeto de mapa (fluxo do cofre) e na opção de evento com aposta (fluxo da jornada). Decisão do dono.
- A roleta de atributos do Ferreiro usa o fluxo da jornada; foi incluída na lista da seção 8.

**Decisões do dono (depois da revisão):**
- Rótulo duplicado: a opção de evento "Vasculhar a carga" virou "Revistar os panos rasgados" (`src/config/world.ts`). O objeto de mapa continua "Vasculhar a carga" (fluxo do cofre).
- Saves de versão 1 e 2 não são mais continuados. Eles sorteavam loja e cofre na mesma sequência da jornada, e o conflito é grande demais para migrar. Ao abrir, o texto inteiro vai para `runBackup` (cópia de segurança, não apagada), a jornada começa nova, e o menu avisa. O arquivo principal é substituído na primeira gravação da jornada nova. A cópia continua na pasta de saves até o dono apagá-la.
- Saves de versão 3 não mudam. Os gravados antes da correção das sobreposições (adc4ed7 e antes) mantêm o estado antigo de loja e cofre, com a chance de sobreposição já descrita.
- `saves:check` atualizado: v1 e v2 são testadas como descontinuadas; a migração de campos ausentes continua testada com `migrateRun` direto.
- Aviso do save descontinuado: no log do HUD ele não aparecia (o HUD fica oculto no menu, e o log é limpo quando a jornada nova começa). Agora sai como cartão no menu, na abertura (`MainMenu.aviso`). Conferido no navegador (modo dev, localStorage): v2 vira cópia com o motivo certo, o segundo boot não duplica a cópia, e v3 não gera cópia nem aviso. Captura em tela feita.

## Árvore de Aurenthal: otimização de desempenho

**Problema:** a árvore ficava travada (com nós disponíveis, ~15 quadros por segundo). Medido no navegador, modo dev, com 111 nós, 185 arestas, 104 ícones e 1105 elementos SVG.

**Medição** (Chromium, mesma máquina, 2 rodadas por cenário; valores relativos, sem GPU):

| Cenário | Antes | Depois |
|---|---|---|
| Repouso, com nós disponíveis pulsando | 17,5 fps | 60 fps |
| Passar o cursor pela roda | 15 fps | 46 a 50 fps |
| Arrastar a roda | 15 fps | 46 a 52 fps |
| Zoom com a roda do mouse | 15 fps | 35 fps |
| Clicar em 12 nós | 15 fps | 35 a 40 fps |

**O que pesava e foi tirado:**
- Animações infinitas dentro do SVG (anel pulsante dos nós disponíveis e anel girando da seleção): repintavam a roda inteira a cada quadro. Agora são estáticos (halo fixo nos disponíveis, anel de seleção parado).
- ~90 filtros de cinza nos ícones bloqueados: agora são arquivos `-cinza.webp` gerados por `scripts/gerarIconesArvoreCinza.py` (diferença média de 0,6 em 255 contra o filtro original).
- `drop-shadow` no nó aberto e no caminho aceso: trocados por um halo sem filtro atrás das arestas do caminho.
- `backdrop-filter` no véu: tirado. Medido: com ele, as interações caem para ~14 fps, porque a roda fica dentro do véu.
- Destaque e seleção refazendo a roda inteira: agora só mudam as classes que mudaram, e clicar num nó não redesenha a roda.
- Tooltip media o próprio tamanho a cada movimento do cursor (forçava layout): mede uma vez por conteúdo.

**Trade-off para o dono:** o nó disponível não pulsa mais, e a seleção não gira. O sinal de "pode abrir" continua no anel dourado e no estado.

**Ainda pesa:** arrastar e dar zoom repintam o SVG inteiro a cada quadro. Experimento: esconder cada camada grande (setores, miolo, aro, emblemas, sombra do núcleo) não muda muito, então o custo é estrutural. Próximo passo, se ainda precisar: levar pan e zoom para a composição do navegador (transform no elemento SVG, com `will-change` só durante o gesto). Mexe na geometria do ponteiro e no recorte da roda, por isso não foi feito agora.

**Conferido:** `npm run check` (inclusive `arvore:check`, `arvore:visual:check`); comportamento no navegador (destaque, seleção, filtro, Esc, reabrir, sem erro no console); capturas em 1600×900 e 1280×720.

## Último Bastião: construções 4×4, templo e escolha de personagem (2026-10-16)

**Pedido do dono:** (1) "Montar Defesa" abre a escolha de personagem, como a campanha; (2) cada construção da cidade (mercado, ferreiro etc.) é um quadrado 4×4 que bloqueia a passagem; (3) a cidade começa com um personagem só, e o templo libera os outros sacrificando almas + Zen.

**Decisões tomadas (o dono pode trocar):**
- "Templo" é uma construção 4×4 da cidade do Bastião, não o serviço de cura da cidade da campanha (Irmã Maela).
- Escolha de personagem igual à campanha: com cidade em andamento, retoma o planejamento; sem cidade (ou depois de derrota), abre a escolha. Voltar leva ao menu.
- Heróis liberados persistem entre derrotas, como os projetos. Almas e Zen zeram com a cidade.
- Custos do templo são provisórios (tabela em `docs/DESENHO.md`, seção 7). Zen inicial segue 20.
- Uma vida por construção 4×4: quebrar uma abre os 16 tiles de uma vez.
- Placeholder de arte: torre do kit em escala do quadrado. Arte definitiva das construções 4×4 pendente do dono.
- Migração: save antigo (sem `heroesLiberados`) ganha todos os heróis liberados, para não tirar nada de quem já jogava. Sem bump de versão de save.
- Compatibilidade: versão anterior não reconhece as construções novas nem `heroesLiberados`.

**Correção no caminho:** "Montar Defesa" abria a escolha com o menu principal por cima. Agora o menu fecha antes, como em "Começar jornada". A preparação de saída do menu (música, HUD) virou `prepararSaidaDoMenu` e é usada pelos dois caminhos.

**O que mudou:** núcleo (`footprint.ts`, `templo.ts`, `rules.ts`, `bastion.ts`), config (`bastion.ts`, `zones.ts`), simulação (`Simulation.ts`, `objects.ts`: bloco `bastionBuilding`), render (`ObjectView.ts`, `BastionGhostView.ts`), UI (`BastionHub.ts`, `BastionBuildPanel.ts`, `bastionVM.ts`, `MainMenu.ts`), sessão (`bastionSession.ts`), `main.ts` (`openCharSelect` com bloqueados, `structureAt` cobre o quadrado inteiro na batalha).

**Conferido:**
- `npm run check`: 31 de 31 ok. `bastion:check` tem seção 16 nova: quadrado 4×4, sobreposição, herói em tile que não é a origem, terreno, simulação com 16 tiles bloqueados, templo, almas e Zen, derrota e migração.
- Navegador (dev, 1600×900): escolha de personagem com 5 de 6 bloqueados; mercado e templo colocados; mago liberado pelo sacrifício; sem erro de página nem de console. Ajustes de Zen e almas feitos só na captura (ferramenta de dev).
- Desempenho: o hub do Bastião roda a ~1 fps no Chromium sem GPU, no HEAD e nesta versão (medido nas duas). Não é regressão desta mudança: é o cenário 3D atrás do painel, em renderização por software.

**Não verificado:** encaixe da construção 4×4 no chão, de perto. A câmera não chegou ao foco no navegador de teste (cerca de 1 quadro por segundo). Conferir no PC do dono.

**Pendências:** arte das construções 4×4; calibrar custos do templo e o Zen inicial; decidir se a vida passa a ser por tile; `PROJECTS.castle` ainda descreve só as muralhas (texto).

## Ponte de Valdrec: praça e tabuleiro com pedra clara (2026-10-17)

**Pedido do dono:** o primeiro mapa (a ponte) é o cartão de visita e estava escuro demais; a cidade parecia só umas barracas. Trocar a pedra escura por uma clara, procedural e bem detalhada.

**O que estava escuro:** a praça e o mercado usavam `pedras/pedra_cinza.webp` (97 px, marrom-acinzentada, média RGB ~ (104,89,78)) com filtro azul. Sob a luz de lua, ficava roxo-escuro. Além disso, o tabuleiro apontava para `pedra_lousa.webp`, que foi apagado no commit a001bfd: o tabuleiro saía sem textura. Os dois problemas foram resolvidos juntos.

**Decisão:** três abordagens procedurais geradas em paralelo (lajes de calcário, calçamento de seixos, aparelho de blocos) e julgadas por um painel de três juízes com lentes diferentes (cor, detalhe e repetição, coerência com cidade). Venceu o calcário em lajes (31 pontos; aparelho de blocos 26; seixos 24). Os juízes pediram quatro ajustes, aplicados: grão e cavidades mais visíveis, rejunte mais claro, mais trincas e lascas nas bordas, e média local afastada do piso.

**O que mudou:**
- `scripts/gerarPedraPraca.py` (novo) gera `public/textures/cenario/pedra_praca.webp` (1024 px, 124 KB, repete sem costura). Sementes fixas; as verificações falham alto se a textura sair da faixa combinada.
- `BridgeScenery.ts`: tabuleiro, praça e mercado usam a nova textura. As cores de filtro azul (`0xc4c8d0` e `0xc8ccd6`) viraram `0xffffff`, para a pedra não escurecer.
- `sceneryTextures.ts`: a textura entra na lista de pré-carregamento.

**Conferido:**
- `npm run check`: 31 de 31 ok.
- Montagem da batalha (`chooseNode`, síncrona): 29 ms antes e 26 ms depois. Sem erros de console.
- Navegador (dev, 1600×900): captura antes e depois, mesma cena. A praça saiu de roxo-escuro para calçamento claro e legível.

**Pendências e pontos para o dono:**
- Tabuleiro e praça usam a mesma pedra. A ponte deixa de se destacar da praça só pelo material. Se quiser contraste, pede-se uma segunda textura para o tabuleiro.
- A luz de lua do tema da ponte (`VISUAL_THEMES.bridge`) ainda dá um tom lilás. Mexer nela é decisão de iluminação, não de textura.
- A cidade continua com poucas barracas (`town/stall`, a cada 3 a 5 tiles). Mais construções ou barracas é decisão de layout, não foi feito.
- Verificação de perto não foi conclusa: a câmera de teste anda devagar no Chromium sem GPU. Conferir no PC do dono.
