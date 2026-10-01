import { SKILL_BY_ID, heroSkills, lvOf, missingRequirements, skillState, skillZeniCost, type HeroKind, type SkillDef, type SkillId } from '../core/progression/skills';
import { learnSkill, type RunState } from '../core/run/run';
import { SKILL_ICONS } from './icons';

/**
 * Janela da árvore de habilidades: nós ligados por linhas, estados bloqueado / disponível /
 * aprendido / máximo, detalhes com requisito, efeito atual e do próximo nível e custo.
 * Aprender só com o Mestre de Armas (na cidade).
 */
export interface SkillTreeCallbacks {
  onChange(learned: boolean): void;
  onUi(): void;
}

const HERO_PT: Record<HeroKind, string> = { warrior: 'Guerreiro', mage: 'Mago', archer: 'Arqueira' };
const NODE_W = 150;
const NODE_H = 118;

export class SkillTree {
  readonly el: HTMLElement;
  private run?: RunState;
  private hero: HeroKind = 'warrior';
  private sel?: SkillId;
  private canLearn = false;
  private msg = '';
  private icons: Record<string, string> = {};

  constructor(private readonly cb: SkillTreeCallbacks) {
    this.el = document.createElement('div');
    this.el.className = 'skilltree-veil';
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.el) return this.close();
      const b = t.closest<HTMLElement>('[data-c]');
      if (!b || b.hasAttribute('disabled')) return;
      this.cb.onUi();
      const c = b.dataset.c;
      if (c === 'close') return this.close();
      if (c === 'tab') {
        this.hero = b.dataset.h as HeroKind;
        this.sel = undefined;
        this.msg = '';
      } else if (c === 'node') this.sel = b.dataset.id as SkillId;
      else if (c === 'learn' && this.sel && this.run) {
        const err = learnSkill(this.run, this.hero, this.sel);
        this.msg = err ?? `${SKILL_BY_ID[this.sel].name} agora no nível ${lvOf(this.run.profile.heroes[this.hero].skills, this.sel)}!`;
        this.cb.onChange(!err);
        if (!err) this.pulse(this.sel);
      }
      this.render();
    });
    window.addEventListener(
      'keydown',
      (e) => {
        if (this.el.hidden) return;
        if (e.key === 'Escape' || e.key === 'k' || e.key === 'K') {
          e.stopImmediatePropagation();
          e.preventDefault();
          this.close();
        }
      },
      true,
    );
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  open(run: RunState, hero: HeroKind, canLearn: boolean): void {
    this.run = run;
    this.hero = run.party.includes(hero) ? hero : run.party[0];
    this.canLearn = canLearn;
    this.sel = undefined;
    this.msg = '';
    this.el.hidden = false;
    this.render();
  }

  close(): void {
    this.el.hidden = true;
  }

  private icon(id: string): string {
    return (this.icons[id] ??= SKILL_ICONS[id]?.() ?? '');
  }

  private pulse(id: SkillId): void {
    requestAnimationFrame(() => {
      const n = this.el.querySelector<HTMLElement>(`[data-id="${id}"]`);
      n?.classList.add('pulse');
    });
  }

  private render(): void {
    const r = this.run!;
    const hp = r.profile.heroes[this.hero];
    const skills = heroSkills(this.hero);
    const pos = (d: SkillDef) => ({ x: 30 + d.col * (NODE_W + 40), y: 24 + (d.tier - 1) * (NODE_H + 34) });
    const lines = skills
      .flatMap((d) =>
        d.requires.map((req) => {
          const a = pos(SKILL_BY_ID[req.id]);
          const b = pos(d);
          const ok = lvOf(hp.skills, req.id) >= req.level;
          const x0 = a.x + NODE_W / 2;
          const y0 = a.y + 74;
          const x1 = b.x + NODE_W / 2;
          const y1 = b.y + 6;
          return `<path d="M${x0},${y0} C${x0},${(y0 + y1) / 2} ${x1},${(y0 + y1) / 2} ${x1},${y1}" class="${ok ? 'ok' : ''}"/><text x="${(x0 + x1) / 2 + 4}" y="${(y0 + y1) / 2}" class="${ok ? 'ok' : ''}">nv ${req.level}</text>`;
        }),
      )
      .join('');
    const nodes = skills
      .map((d) => {
        const p = pos(d);
        const lv = lvOf(hp.skills, d.id);
        const st = skillState(hp.skills, d.id);
        return `<button class="sk-node ${st} ${this.sel === d.id ? 'sel' : ''}" data-c="node" data-id="${d.id}" style="left:${p.x}px;top:${p.y}px">
          <img src="${this.icon(d.id)}" alt=""><span class="lv">${lv}/${d.maxLevel}</span>
          <b>${d.name}</b><small>${d.kind === 'active' ? 'Ativa' : 'Passiva'} · Tier ${d.tier}</small></button>`;
      })
      .join('');
    let detail = '<p class="sk-hint">Clique numa habilidade para ver os detalhes.</p>';
    if (this.sel) {
      const d = SKILL_BY_ID[this.sel];
      const lv = lvOf(hp.skills, d.id);
      const miss = missingRequirements(hp.skills, d.id);
      const max = lv >= d.maxLevel;
      const cost = max ? 0 : skillZeniCost(d.id, lv + 1);
      const can = this.canLearn && !max && !miss.length && hp.skillPoints > 0 && r.profile.zeni >= cost;
      detail = `<div class="sk-detail"><img src="${this.icon(d.id)}" alt=""><div><h3>${d.name}</h3><small>${d.kind === 'active' ? 'Ativa (o herói usa sozinho)' : 'Passiva'} · nível ${lv}/${d.maxLevel}</small></div></div>
        <p>${d.desc}</p>
        ${d.requires.length ? `<p class="req">Requisitos: ${d.requires.map((q) => `<span class="${lvOf(hp.skills, q.id) >= q.level ? 'ok' : 'no'}">${SKILL_BY_ID[q.id].name} nv ${q.level}</span>`).join(', ')}</p>` : ''}
        ${lv > 0 ? `<p><b>Agora:</b> ${d.effect(lv)}</p>` : ''}
        ${max ? '<p><b>Nível máximo.</b></p>' : `<p><b>Próximo nível:</b> ${d.effect(lv + 1)}</p><p class="cost">Custo: 1 ponto de habilidade + <i class="zeni-ico"></i>${cost} Zeni</p>`}
        ${max ? '' : `<button class="primary" data-c="learn"${can ? '' : ' disabled'}>${lv ? 'Subir de nível' : 'Aprender'}</button>`}
        ${!this.canLearn && !max ? '<p class="note">Aprenda com o Mestre de Armas, numa cidade.</p>' : ''}`;
    }
    this.el.innerHTML = `
      <div class="win skilltree">
        <div class="win-title"><span>Árvore de habilidades</span><button class="x" data-c="close" title="Fechar (Esc/K)">×</button></div>
        <div class="win-body">
          <div class="tabs-row">${r.party.map((h) => `<button data-c="tab" data-h="${h}" class="${h === this.hero ? 'on' : ''}">${HERO_PT[h]} <small>Nv.${r.profile.heroes[h].level}</small>${r.profile.heroes[h].skillPoints ? ` <span class="badge">${r.profile.heroes[h].skillPoints}</span>` : ''}</button>`).join('')}
            <span class="sk-bank">Pontos: <b>${hp.skillPoints}</b> · <i class="zeni-ico"></i>${r.profile.zeni.toLocaleString('pt-BR')}</span></div>
          <div class="sk-wrap">
            <div class="sk-tree"><svg width="${3 * NODE_W + 2 * 40 + 60}" height="${3 * NODE_H + 2 * 34 + 40}">${lines}</svg>${nodes}</div>
            <div class="sk-side">${detail}<div class="sk-msg">${this.msg}</div></div>
          </div>
        </div>
      </div>`;
  }
}
