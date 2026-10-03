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
public/audio/         música e sons
public/tela-entrada.jpg  arte do menu principal
public/icon.png, emblem.png   favicon e emblema
electron/icon.ico (16–256), icon.png, splash_logo.png   ícone do .exe/janela e splash
```

## Regras
- **Originais pesados não entram no repo** (GLB de 50–70 MB, PSD, vídeos brutos). Otimize para `public/` e guarde o
  original zipado na branch **`fontes`** (zips < 95 MB cada, com LEIA-ME explicando o que vira o quê).
- GLB: personagem precisa de esqueleto do jogo (rig por `autoRig`/glbMonsters) e cor por vértice; texturas em **WebP**
  (`npx @gltf-transform/cli webp in.glb out.glb --quality 90` — saída SEMPRE com extensão `.glb`).
  Não quantize/meshopt sem ajustar o loader: o código lê atributos como Float32 e o material usa `vertexColors`.
- Imagens: arte opaca → JPG q≈90; com transparência → PNG otimizado (oxipng) ou WebP. Verifique se o código usa o caminho.
- Sprites com fundo verde: `python scripts/process_sprites.py <folha> <prefixo> <poses...>`.
- Ícone do jogo: arte do dono (atual: brasão "RC's"); gerar `.ico` com 16,24,32,48,64,128,256 e nitidez leve ≤ 64 px.
- Antes de remover um asset, confirme com grep (inclusive caminhos montados dinamicamente: `sprites/${prefix}${i}.png`,
  `models/zombie_${n}.jpg`).
- Depois de otimizar: carregar cada GLB no navegador (GLTFLoader) e conferir textura/animação + screenshot.
