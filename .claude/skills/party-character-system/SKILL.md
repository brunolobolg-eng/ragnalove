---
name: party-character-system
description: Party e personagens do ROguard — as 6 classes, desbloqueio, nível/EXP, pontos de atributo, árvore de habilidades, equipamento por herói, morte e reviver, retratos e arte. Use ao mexer em heróis, progressão, profile.ts, skills.ts ou telas de personagem.
---

# Party e personagens

## Classes (`HeroKind`)
`warrior` Guerreiro (linha de frente) · `mage` Mago (controle de área, barreiras de fogo) · `archer` Arqueira (distância)
· `sorcerer` Feiticeira · `warlock` Bruxa · `assassin` Assassino. Família (`warrior|mage|archer`) define arma e fórmulas.
Ordem/textos em `HERO_INFO`/`HERO_ORDER` (`config/heroes.ts`); IA em `core/archetypes/<classe>.ts`.

## Progressão (`core/progression/profile.ts`, vive dentro do `RunState`)
- `HeroProgress`: `level, exp, attrs, points, zeniPoints, skills, skillPoints, equipment`.
- A jornada começa com 1 herói; cada **chefe de ato** libera outro (`run.party`). Derrota total = nova jornada do zero.
- Atributos: Força, Inteligência, Vitalidade, Destreza, Sorte. Pontos por nível; compra extra com Zeni (preço sobe);
  refazer pontos no Mestre de Armas da cidade.
- Habilidades: 1 ponto por nível + Zeni na cidade; pré-requisitos por nível de outra habilidade.
- Herói caído fica em `run.dead`; reviver custa Zeni (`reviveCost`) ou efeito de evento.
- Funções: `addPoint`, `equip`, `unequip`, `heroStats`, `addExperience`, `resetAttributes`... — **use-as**, não reimplemente.

## Visual
Modelo 3D por herói em `HERO_MODELS` (visualConfig). Retrato/corpo inteiro/caminhada são renderizados do modelo
(`CharSelect.portrait/fullBody/walkFrames`) e cacheados no main (`PORTRAITS`, `FULL_BODY`).
Telas: `Hud` (ficha completa C), `HeroCard` (janelinha no mapa), `SkillTree` (K), `CharSelect`.

## Pet e Asas
Ainda **não existem** como sistema (aparecem "Em breve" no HeroCard). Ao implementar: slots novos no `HeroProgress`
(ex.: `pet?`, `wings?`) com migração de save, bônus somados em `heroStats`, dados em config, e UI já reservada.
