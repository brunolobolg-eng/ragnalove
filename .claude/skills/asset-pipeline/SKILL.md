---
name: asset-pipeline
description: Pipeline de arte do ROguard — onde ficam modelos GLB, sprites, retratos, ícones, mapas, áudio e vídeo; formatos (WebP/PNG/JPG/GLB), otimização com gltf-transform e oxipng, ícone do executável, e onde guardar os originais editáveis. Use ao adicionar, trocar ou otimizar qualquer arte, modelo ou som.
---

# Assets

## Onde ficam (o jogo só carrega de `public/`)
```
public/models/        GLB dos heróis e monstros (HERO_MODELS / MONSTER_MODELS em visualConfig.ts)
public/models/*.jpg   skins alternativas (ex.: zombie_*.jpg)
public/sprites/       retratos (portrait_*), cartas/chibis da seleção (cs/), ícones de nó (nodes/),
                      item_icons.png (atlas), cidade/mapa (city_valnor_chibi.jpg, world_aurenthal.jpg),
                      sprites 2D antigos (estilo alternativo leve) + meta.json
public/audio/         música (menu.mp3, cidade.mp3, batalha.mp3 — escolhidas em MUSIC, visualConfig.ts) e sons
public/fx/kenney/     texturas de TODOS os efeitos (Kenney Particle Pack, CC0) — geradas por
                      scripts/build_kenney_fx.py; código em render/fx/kit/vfxTextures.ts (fxTexture)
public/tela-entrada.jpg  arte do menu principal
public/icon.png, emblem.png   favicon e emblema
public/models/props/   peças de cenário GLB da Kenney (CC0): town, castle, survival, nature (+ Textures/colormap.png
                      de cada pacote). Use `placeProp(parent, 'pacote/nome', x, z, {scale, rot, tint})` (render/scenery/props.ts).
public/maps/           mapas pintados de batalha (WebP ~1 MB, 2× a arte original; sem interface pintada)
public/icons/skills/   ícones de habilidade do dono (128 px WebP), por classe: guerreiro, arqueiro, mago, ladrao,
                      clerigo, monge, cruzado, professor (+ clerigo-cartas, artes grandes). catalogo.json lista
                      todos; os usados hoje estão em SKILL_ART (src/ui/icons.ts) — o resto é reserva para skills futuras.
electron/icon.ico (16–256), icon.png, splash_logo.png   ícone do .exe/janela e splash
```

## GLB novo: checagem obrigatória (regra do dono)
Todo `.glb` que entrar no projeto (novo ou substituto) passa por estes quatro pontos antes de ir para `public/models/`:
1. **Cor**: de onde vem? Cor por vértice (`COLOR_0`), textura (`baseColorTexture`) ou cor chapada. Sem cor = modelo
   cinza: confirme com o dono.
2. **Animações**: tem? Quais nomes? Cada clipe precisa de chaves suaves (mediana de pelo menos ~24 chaves por segundo
   por canal), sem interpolação em degrau (`STEP`) e com a emenda do loop no lugar. Se o arquivo não atende, use o
   conjunto de clipes do jogo (`clips: 'cultist'`, animações da UAL) com `bind: 'ibm'` quando a pose dos nós divergir
   do bind (a auditoria avisa).
3. **Tamanho e otimização**: `node scripts/auditar_glb.cjs arquivo.glb` mostra cor, ossos, animações, pesos e o que
   ajustar. Meta de personagem: 1,5 a 4 MB, até ~40 mil triângulos, texturas WebP de até 1024 px e no máximo 4 ossos
   por vértice. Se não estiver nessa meta, otimize com `scripts/otimizar_glb.mjs` (ele mantém os 4 pesos maiores e
   renormaliza; sem isso a pele encolhe nas juntas e a animação perde fluidez).
4. **Fluidez é o critério final**: confira quadros seguidos (andando, golpe, magia) no navegador, com screenshot.
   Movimento travado ou pele deformada não entrega, mesmo com a auditoria limpa.
Original acima de ~8 MB: guarde zipado na branch `fontes` e não deixe no repositório (ver Regras).

## Regras
- **Originais pesados não entram no repo** (GLB de 50–70 MB, PSD, vídeos brutos). Otimize para `public/` e guarde o
  original zipado na branch **`fontes`** (zips < 95 MB cada, com LEIA-ME explicando o que vira o quê).
- GLB: personagem precisa de esqueleto do jogo (rig por `autoRig`/glbMonsters) e cor por vértice; texturas em **WebP**
  (`npx @gltf-transform/cli webp in.glb out.glb --quality 90` — saída SEMPRE com extensão `.glb`).
  Não quantize/meshopt sem ajustar o loader: o código lê atributos como Float32 e o material usa `vertexColors`.
- Imagens: arte opaca → JPG q≈90; com transparência → PNG otimizado (oxipng) ou WebP. Verifique se o código usa o caminho.
- Efeitos: nunca desenhar textura de efeito em canvas/código. Use `fxTexture(...)`/os atalhos de `vfxTextures.ts`;
  textura nova = adicionar no `build_kenney_fx.py` (branca, forma no alfa; cor vem do efeito) e regerar.
  Pacote original zipado na branch `fontes` (kenney_particle_pack.zip).
- Sprites com fundo verde: `python scripts/process_sprites.py <folha> <prefixo> <poses...>`.
- Ícone do jogo: arte do dono (atual: brasão "RC's"); gerar `.ico` com 16,24,32,48,64,128,256 e nitidez leve ≤ 64 px.
- Antes de remover um asset, confirme com grep (inclusive caminhos montados dinamicamente: `sprites/${prefix}${i}.png`,
  `models/zombie_${n}.jpg`).
- Depois de otimizar: carregar cada GLB no navegador (GLTFLoader) e conferir textura/animação + screenshot.
