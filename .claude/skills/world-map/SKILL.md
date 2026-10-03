---
name: world-map
description: Mapa-múndi e estrutura da jornada do ROguard — Aurenthal, 3 atos × 5 fases, tipos de nó (horda, elite, evento, cidade, chefe, sobrevivência), regiões e cidades, caminhos, névoa, eventos e recompensas. Use ao mexer em world.ts, run.ts, WorldMap.ts, CityScreen ou eventos.
---

# Mapa-múndi e jornada

## Estrutura
```
Jornada (RunState)
 └── Ato (ACTS[0..2]: nome, chefe, hpMult/dmgMult)
      └── Fase/nó (ACTS[a].nodes[n]: região + opções de caminho)
           └── escolha: horda | elite | evento | cidade | chefe | sobrevivência
```
- 15 fases no total (`totalPhases()`); o jogador **só escolhe entre as opções do nó atual** — nunca pula para
  qualquer ponto do mapa. Rota definida pelos dados em `ACTS`.
- Regiões em grade 7×4 (`REGIONS`): bioma, zona de combate (`zones.ts`), ato, cidades (abertas/trancadas com motivo),
  chefe do ato, `future` (aparece "em breve").
- Ato I — O Cerco de Valdrec · Ato II — Areias Vermelhas · Ato III — O Cume das Cinzas (chefe Senhor Orc).
- Cidades: loja, ferreiro (refino), mestre de armas (atributos), oráculo, templo (repara a cidade/revive).
- Eventos (`EVENTS`): opções com custo em Zeni e efeitos (`zeni`, `souls`, `exp`, `item`, `attrPoints`, `skillPoints`,
  `reviveFree`, `cityHp`, `gamble`). Valores multiplicam por ato.
- Sobrevivência: hordas infinitas; quanto mais durar, melhor a roleta; cair não encerra a jornada.

## Código
- Regras: `core/run/run.ts` (`newRun`, `battleFor`, `advance`, `pickEvent`, `applyEventEffects`, `unlockHero`,
  `revive`, `repairCity`, `survivalRewards`, loja/ferreiro).
- Tela: `ui/WorldMap.ts` (arte `MAP_ART`, névoa que revela regiões visitadas, trilha, marcador da party animado,
  painel lateral com fase/região/party, cartões de escolha) + `ui/HeroCard.ts` (clique no herói).
- O main monta `MapState` (`mapState()`) e trata `onChoose`.

## Regras
- Nova região/ato/evento = dados em `world.ts` (+ zona em `zones.ts` + âncora na arte em `MAP_ART.anchors`).
- A UI do mapa não decide caminho; mostra `options` do nó e chama `onChoose`.

## Mapas pintados (arte do dono como chão)
- `ZoneDef.painted = { image, fx }` (ex.: `ZONES.serene`, Floresta Serena 80×40 — pronta, mas hoje fora da jornada: o dono preferiu voltar aos mapas 3D).
  A imagem (`public/maps/*.webp`) cobre a grade inteira; a grade (`map`) só diz onde se anda (T = bloqueado, ~ = rio,
  g = porta da cidade). Render: `render/scenery/PaintedScenery.ts` (pintura sem luz, plano de sombras, tochas, névoa, brilho).
- Câmera: `Stage.setPainted` — sem névoa, zoom em `VISUAL_CONFIG.cameraControl.painted`, presa dentro da pintura; sem giro.
- Novo mapa pintado: arte SEM interface, mesmo ângulo de câmera (~55°, vista de frente), largura/altura da imagem na proporção
  W : H×0,82. Marque a grade sobre a imagem com uma grade numerada e confira com BFS que o portal alcança a porta da cidade.
