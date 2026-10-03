---
name: inventory-equipment
description: Inventário e equipamentos do ROguard — os 10 slots, tipos de item, raridades, rolagens de atributo, arma atk/matk, restrição de classe, refino, despertar, bolsa, loja e drops; também o plano de Pet e Asas. Use ao mexer em itens, equipar/desequipar, bolsa, ferreiro ou na UI de equipamento.
---

# Inventário e equipamento (`core/progression/equipment.ts`)

## Slots (10)
`weapon` Arma · `offhand` Escudo/Talismã · `head` Capacete · `armor` Armadura · `cloak` Capa · `boots` Botas ·
`earring` Brincos · `amulet` Colar · `ring` Anel · `belt` Cinto. Grupos (`SLOT_GROUP`): arma / armadura / acessório
(definem efeito do refino e filtro da bolsa). Hoje é **1 anel** só.
Layout padrão na UI: esquerda cabeça, armadura, capa, arma, botas; direita brincos, colar, escudo, anel, cinto.

## Item
`{ id, slot, rarity, rolls[], kind?, atk?, matk?, refine?, awakened? }`
- Raridades: Comum, Incomum, Raro, Épico, Lendário, Mítico (`RARITY_INFO`: cor e nº de rolagens).
- Rolagens (`ATTRIBUTE_ROLL_POOL`): regen de vida, recarga, vel. de ataque, bloqueio, esquiva, +atributo, +todos.
- Armas: `atk` físico ou `matk` (cajado/livro); `WEAPON_USERS` define quem usa cada arma (`canUse`).
- Refino até +10 (chance cai a partir de +5, aura cosmética ≥ +5); despertar Lendário/Mítico com almas (×1,5).
- Bônus total: `gearBonus(itens)`. Nome/linhas: `itemName`, `itemLines`. Ícone: `itemIconUrl` (`ui/itemArt.ts`).
- Gerar item: `rollItem(rng, sorte, id, force?, users?)` — sempre com o `Rng` da run.
- Bolsa: `profile.inventory`; itens melhores são equipados sozinhos (`autoEquip` no profile).

## Regras
- Equipar/desequipar só via `equip()/unequip()` do profile; a UI chama pelo callback e o main salva.
- Novo slot/tipo: atualizar `Slot`, `SLOTS`, `SLOT_KINDS`, `SLOT_LABEL`, `SLOT_GROUP`, `SLOT_WEIGHT`, arte em `itemArt`,
  UI (Hud + HeroCard) e **migração** se mudar o formato salvo.
- Loja/ferreiro (em `core/run/run.ts`): `shopStock`, `buyItem`, `sellItem`, `refineItem`, `rerollItem`, `awakenItem`, `makeItem`.
- Ainda não há: nível mínimo, descarte, pilhas (stack), segundo anel, Pet e Asas. Ao criar, mantenha
  dados em config e regras no core.

## Pet e Asas (planejado)
Slots especiais fora dos 10 (não rolam como equipamento comum). Proposta: `HeroProgress.pet?/wings?` com tipo próprio
(id do pet/asa, nível, bônus), dados em um arquivo de config novo, bônus somados em `heroStats`. A UI já tem os espaços.
