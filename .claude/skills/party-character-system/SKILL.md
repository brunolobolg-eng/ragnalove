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


## Cavaleiro Rúnico (Guerreiro, conjunto de TESTE)
- `RUNIC_SKILLS` em `skills.ts`: Lâmina Encantada, Onda Sônica, Limite da Morte, Cem Lanças, Cortador de Vento.
  São a base da transformação futura do Guerreiro. **Ficam fora da árvore** (`heroSkills`), dos slots automáticos e dos
  iniciais; liberam-se pelo debug (Desbloquear árvore) e aparecem na Dev Lab (aba SKILLS). Sem árvore própria ainda.
- Números em `SKILL_NUM`; lógica em `core/archetypes/warrior.ts`; dano devolvido (`'reflect'`) e marca em `Simulation.damage`/`mark`.
- Cem Lanças exige `stats.weapon === 'spear'` (lança, já existe no equipamento). Cortador de Vento ganha alcance com lança.
  "Espadas de duas mãos" da arte de referência **não existe** no jogo (sem arma de duas mãos): não implementado.
- Limite da Morte não marca `GAME_CONFIG.bossKinds` (chefes e mini-chefes).

## Especializações (ramos exclusivos da árvore)
- `SkillDef.branch` + `BRANCHES` em `skills.ts`. Aprender a 1ª habilidade de um ramo escolhe a especialização;
  as habilidades dos outros ramos ficam travadas (`missingRequirements`). Refazer habilidades libera a troca.
  Não há campo extra no save: o ramo escolhido é derivado das habilidades aprendidas (`chosenBranch`).
- **Mago (Cléria, maga divina):** Cura/Divina (Cura, Santuário, Escudo Sagrado, Bênção, Dom da Cura) ×
  Dano/Arcana (Nova Congelante, Tempestade, Combustão, Julgamento Divino). Barreira, Raio Gélido, Meditação comuns.
- **Arqueira:** Armadilhas (Mina Terrestre, Armadilha Congelante, Claymore, Mestre Armadilheiro) ×
  Tiro (Flecha Perfurante, Tiro Duplo, Foco do Caçador). Armadilha (básica) e Chuva de Flechas comuns.
- Habilidade nova: mecânica inspirada nas skills do Ragnarok (midgardhub.com/tools/skills), adaptada ao que o
  jogo já tem (cura, escudo, buff de dano, congelar, atordoar, armadilhas, áreas, dano contínuo).
