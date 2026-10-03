---
name: game-ui
description: Interface do ROguard — padrão visual (chibi, fantasia medieval, MMORPG clássico, azul-marinho + dourado), componentes existentes (janelas, slots de equipamento, tooltips, barras, cartões), como criar uma tela nova e como verificar no navegador. Use para qualquer tela, janela, HUD, menu, botão ou ajuste visual.
---

# UI

## Identidade visual (padrão atual a seguir)
- Fantasia medieval chibi, charme de MMORPG coreano dos anos 2000 — **original**.
- Telas de jornada (mapa, HeroCard, menus novos): **azul-marinho translúcido + bordas douradas** (`#c79d48`/`#b8913f`),
  títulos em **Cinzel** / **Cinzel Decorative** (embutidas em `src/assets/fonts`), texto claro `#e9eefc`/`#fff3d6`,
  destaque dourado `#ffd36a`, vida vermelha, raridade pela cor de `RARITY_INFO`.
- O HUD de batalha usa a pele clássica clara (`.win`, azul-acinzentado) — não misture sem pedir.
- Ícones grandes e legíveis, cantos arredondados, brilho sutil, animações curtas (≤ 200 ms), hover dourado.
- **Aurenthal UI FX** (fim do `style.css`): brilho que passa (`fxShine`, ~4 s) nas cartas de caminho, itens Épico+
  e herói selecionado; aura viva (`fxAura`, gradiente radial 0.95↔1.05) atrás do herói no HeroCard. Sempre com
  `prefers-reduced-motion` desligando. Use esses mesmos efeitos em telas novas em vez de inventar outros.
- **Aurenthal PostFX** (cena 3D): ver skill `performance` / `render/fx/kit/PostFX.ts`. Presets e gradientes por região
  ficam em `POSTFX` (`config/visualConfig.ts`). Regra: sutil, nunca exagerar.

## Componentes existentes (reaproveite)
| Componente | Onde |
|---|---|
| Janela clássica `.win` / `.win-title` / `.win-body` | `style.css` |
| Ficha completa (atributos, status, bolsa, slots, tooltip de item) | `ui/Hud.ts` (`renderCharacter`, `tipHtml`) |
| Janelinha do herói (slots em volta do boneco, vida, status, Pet/Asas, ações) | `ui/HeroCard.ts` |
| Cartões da party, painel de fase, escolha de caminho | `ui/WorldMap.ts` |
| Ícones de item / slot vazio | `itemIconUrl`, `itemArtCanvas` (`ui/itemArt.ts`) |
| Ícones de habilidade | `SKILL_ICONS` (`ui/icons.ts`) |
| Confirmação | `ui/ConfirmDialog.ts` · Modais de resultado/evento: `ui/RunScreens.ts` |
| Configurações (áudio/vídeo) | `ui/SettingsPanels.ts` |

## Como fazer uma tela nova
1. Classe em `src/ui/` com `el`, `open(vm)`, `close()`, `visible`; callbacks no construtor; Esc e clique fora fecham.
2. Recebe **view model** pronto montado no `main.ts` (dados do core) — a tela não calcula regra.
3. CSS no fim de `src/ui/style.css`, com prefixo próprio (ex.: `.hc-*`), sem quebrar regras antigas.
4. Textos pt-BR; números formatados (`toLocaleString('pt-BR')`, `%`).
5. Escape de texto em `title`/HTML vindo de dados.
6. Verifique: `npm run dev`, Playwright no Chromium (`/opt/pw-browsers`) navegando até a tela, screenshot em 1600×900
   (e uma resolução menor), e mande o print ao dono.

## Navegação até as telas no teste
Menu: `.mm-hot` (primeiro = começar) → seleção: `.cs-actions [data-a="go"]` → mapa (`body[data-mode=map]`).
F9 abre o debug (botões `[data-cmd="item"]` criam itens), F8 Dev Lab, F10 editor (só em dev).
