import { ITEM_KIND_LABEL, RARITIES, RARITY_INFO, SLOTS, SLOT_LABEL, itemKind, itemLines, type Item, type Rarity } from '../core/progression/equipment';
import { itemIconUrl } from './itemArt';

/**
 * Roleta de recompensa no estilo "abrir caixa": uma fita de itens passa rápido e desacelera
 * até parar no prêmio sob o marcador central. O prêmio já vem decidido (a roleta é só
 * apresentação); os itens de enchimento seguem a proporção das raridades.
 */
const CARD = 162; // largura de cada carta + espaço (150 + 12)
const WIN_INDEX = 46;
const FILLER_WEIGHTS: Record<Rarity, number> = { common: 52, uncommon: 30, rare: 18, epic: 0, legendary: 0, mythic: 0 };

export class Roulette {
  readonly el: HTMLElement;

  constructor(private readonly sound: (name: 'roulette' | 'jackpot' | 'coin') => void) {
    this.el = document.createElement('div');
    this.el.className = 'roulette-veil';
    this.el.hidden = true;
    document.body.appendChild(this.el);
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  /** Mostra a roleta parando em `prize`. Resolve quando o jogador pega o item. */
  spin(title: string, subtitle: string, prize: Item, fillerSlot = () => 'weapon' as Item['slot']): Promise<void> {
    return new Promise((resolve) => {
      const cards: Item[] = [];
      for (let i = 0; i < WIN_INDEX + 8; i++) {
        if (i === WIN_INDEX) cards.push(prize);
        else cards.push({ id: `f${i}`, slot: i % 3 === 0 ? fillerSlot() : SLOTS[Math.floor(Math.random() * SLOTS.length)], rarity: pickFiller(), rolls: [] });
      }
      this.el.innerHTML = `
        <div class="roulette">
          <i class="rl-emblem" aria-hidden="true"></i>
          <h2 class="rl-title"><span class="rl-flour">❧</span>${title}<span class="rl-flour r">❧</span></h2>
          <p class="rl-sub"><i>◆</i>${subtitle}<i>◆</i></p>
          <div class="rl-rail">
            <i class="rl-arrow l">‹</i>
            <div class="rl-window"><div class="rl-strip">${cards.map((c) => this.card(c)).join('')}</div><i class="rl-marker"></i></div>
            <i class="rl-arrow r">›</i>
          </div>
          <div class="rl-result" hidden></div>
          <div class="rl-btns"><button class="primary rl-take" data-k="take" disabled>Girando...</button></div>
        </div>`;
      this.el.hidden = false;
      const strip = this.el.querySelector<HTMLElement>('.rl-strip')!;
      const win = this.el.querySelector<HTMLElement>('.rl-window')!;
      const btn = this.el.querySelector<HTMLButtonElement>('[data-k="take"]')!;
      const center = win.clientWidth / 2;
      const jitter = (Math.random() - 0.5) * (CARD * 0.16); // para dentro da moldura central
      const target = WIN_INDEX * CARD + CARD / 2 - center + jitter;
      const dur = 5200;
      const t0 = performance.now();
      let lastIdx = -1;
      const ease = (k: number) => 1 - Math.pow(1 - k, 4);
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / dur);
        const x = target * ease(k);
        strip.style.transform = `translateX(${-x}px)`;
        const idx = Math.floor((x + center) / CARD);
        if (idx !== lastIdx) {
          lastIdx = idx;
          this.sound('roulette');
        }
        if (k < 1) requestAnimationFrame(tick);
        else done();
      };
      const done = () => {
        const good = RARITIES.indexOf(prize.rarity) >= 2;
        this.sound(good ? 'jackpot' : 'coin');
        strip.children[WIN_INDEX].classList.add('won');
        const res = this.el.querySelector<HTMLElement>('.rl-result')!;
        const info = RARITY_INFO[prize.rarity];
        const lines = itemLines(prize);
        res.style.setProperty('--rc', info.color);
        res.innerHTML = `<div class="rl-prize r-${prize.rarity}"><img src="${itemIconUrl(prize)}" alt="">
            <div><b>${kindName(prize)}${prize.refine ? ` +${prize.refine}` : ''}</b><em>${info.label}</em><small>${SLOT_LABEL[prize.slot]}</small></div></div>
          <div class="rl-attrs"><h4>Atributos</h4><ul>${lines.map((l) => `<li>${l}</li>`).join('') || '<li>—</li>'}</ul></div>`;
        res.hidden = false;
        this.el.querySelector('.roulette')!.classList.add('done', `r-${prize.rarity}`);
        btn.disabled = false;
        btn.textContent = 'Pegar ➜';
      };
      btn.onclick = () => {
        this.el.hidden = true;
        resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  private card(it: Item): string {
    const info = RARITY_INFO[it.rarity];
    const url = itemIconUrl(it);
    return `<div class="rl-card r-${it.rarity}" style="--rc:${info.color}"><div class="rl-art"><img src="${url}" alt=""></div><span>${info.label}</span><small>${kindName(it)}</small></div>`;
  }
}

function pickFiller(): Rarity {
  const total = Object.values(FILLER_WEIGHTS).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const k of RARITIES) {
    r -= FILLER_WEIGHTS[k];
    if (r < 0) return k;
  }
  return 'common';
}

/** Nome curto do item (tipo: Espada, Capa, Anel...). */
function kindName(it: Item): string {
  return ITEM_KIND_LABEL[itemKind(it)] ?? SLOT_LABEL[it.slot];
}
