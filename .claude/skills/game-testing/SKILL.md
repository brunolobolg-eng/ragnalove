---
name: game-testing
description: Testes do ROguard — checagens headless da simulação (sim:check, runCheck), typecheck/build, Dev Lab, e verificação visual no Chromium com Playwright (navegar até mapa/telas, screenshots, erros de console). Use antes de entregar qualquer mudança e ao investigar bugs.
---

# Testes

## Obrigatório antes de entregar
1. `npm run build` — typecheck (`tsc --noEmit`) + build Vite.
2. `npm run sim:check` — onda de referência + 12 zonas devem dar vitória; última linha `determinístico: true`.
3. Mudou balanceamento/jornada: `npx tsx scripts/runCheck.ts` (fases com builds típicos de cada ato).
4. Mudou UI/visual: rodar no navegador e olhar o screenshot.

## Navegador (Playwright já instalado)
```js
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
```
- `npx vite --port 5199 --strictPort` em background; abrir `http://localhost:5199/`.
- Use `page.evaluate(() => el.click())` para botões do menu (há elementos sobrepostos).
- Capture `pageerror` e `console` de erro; zero erros é o critério.
- Para estados avançados: F9 (debug) cria itens, níveis, almas; F8 Dev Lab tem cenários, testador de loot/skills/ondas.

## Testes de regra
O core é puro: escreva scripts `tsx` em `scripts/` que montam `createProfile()`/`newRun(seed)` e conferem resultado.
Bugs de combate: reproduza com seed fixa; a mesma seed precisa dar o mesmo resultado.
Nunca "conserte" teste removendo checagem.
