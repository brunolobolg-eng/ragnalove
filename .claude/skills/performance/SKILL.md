---
name: performance
description: Desempenho do ROguard — FPS, presets de qualidade, orçamento de partículas/luzes/decalques, pools, renderização Three.js, memória, tamanho de assets e tempo de carregamento. Use ao adicionar efeitos, modelos, muitas unidades, ou quando houver travamento/lentidão.
---

# Performance

## Já existe
- Simulação a 10 ticks/s separada do render (60+ fps com interpolação).
- Presets `low/medium/high/ultra` (`settings/Settings.ts → QUALITY_PRESETS`): densidade de partículas, pixelRatio,
  sombras e tamanho do shadow map, luzes, bloom, calor, aberração, decalques, contornos.
- Orçamento global em `GAME_CONFIG.vfx`: partículas por sistema, `maxDynamicLights`, `maxRibbons`, `maxDecals`
  (pools pré-alocados). Efeitos seguem 5 fases e respeitam o preset.
- Campo de fluxo único para a horda inteira (barato com muitos inimigos).
- Benchmark de pior caso no debug (F9): 100 zumbis + magias em cada preset.

## Regras
- Efeito novo: usar o kit (`render/fx/kit/`) e os pools; nada de criar geometria/material por frame.
- Reaproveitar geometria/material entre unidades iguais; liberar (`dispose`) ao trocar de cena.
- Renderizações caras (retratos/corpo inteiro do modelo) → gerar uma vez e cachear (ver `FULL_BODY` no main).
- Assets: texturas ≤ 1024 px para personagens, WebP dentro do GLB; imagens de tela em JPG quando opacas.
- Medir antes/depois (benchmark do F9, tamanho de `dist/` e `public/`).
