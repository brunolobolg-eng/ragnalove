import { HERO_NAME } from '../config/heroes';
import { GAME_CONFIG } from '../config/gameConfig';
import { RARITY_INFO, type Rarity } from '../core/progression/equipment';
import type { WaveReport } from '../core/sim/types';

const NAME: Record<string, string> = HERO_NAME;
const ENEMY: Record<string, string> = { grunt: 'comuns', runner: 'rápidos', brute: 'pesados', necro: 'necromantes', elite: 'elite', boss: 'chefe', boss2: 'chefe', orcboss: 'chefe' };

/**
 * Relatório da Noite — só desenha o WAVE_RESULT que veio da simulação (a HUD não calcula nada).
 * Três seções: Desempenho da Party, Ameaça à Cidade e Recompensas.
 */
export function waveReportHtml(r: WaveReport, extra: { zeniBonus?: number; portraits?: Record<string, string> } = {}): string {
  const S = GAME_CONFIG.cityDefense.states;
  const top = (list: { kind: string; amount: number }[]) => list.find((x) => x.amount > 0);
  const dealt = top(r.damageDealtByUnit);
  const taken = top(r.damageTakenByUnit);
  const skills = r.skillsUsedByUnit.find((x) => x.count > 0);
  const who = (k: string) => `${extra.portraits?.[k] ? `<img src="${extra.portraits[k]}" alt="">` : ''}<b>${NAME[k] ?? k}</b>`;
  const party = `
    <section class="wr-sec">
      <h4>Desempenho da Party</h4>
      <div class="wr-grid">
        <div class="wr-card"><small>Maior dano causado</small>${dealt ? `<div class="wr-who">${who(dealt.kind)}<span>${dealt.amount.toLocaleString('pt-BR')}</span></div>` : '<div class="wr-who">—</div>'}</div>
        <div class="wr-card"><small>Mais dano sofrido</small>${taken ? `<div class="wr-who">${who(taken.kind)}<span>${taken.amount.toLocaleString('pt-BR')}</span></div>` : '<div class="wr-who">Ninguém se feriu</div>'}</div>
        <div class="wr-card"><small>Mais habilidades usadas</small>${skills ? `<div class="wr-who">${who(skills.kind)}<span>${skills.count}×</span></div>` : '<div class="wr-who">—</div>'}</div>
      </div>
      <div class="wr-line"><span>☠ ${r.enemiesKilled} inimigos eliminados</span><span><i class="soul-ico"></i>${r.soulsCollected} almas coletadas</span></div>
    </section>`;

  const lost = r.cityDamageTaken;
  const frac = r.cityMaxHp ? r.cityHpRemaining / r.cityMaxHp : 0;
  const state = r.cityHpRemaining <= 0 ? 'fallen' : frac < S.critical ? 'critical' : frac < S.pressure ? 'danger' : frac < S.safe ? 'warn' : 'safe';
  const stateTxt =
    state === 'fallen'
      ? 'A cidade caiu!'
      : state === 'critical' || state === 'danger'
        ? 'A cidade está em perigo crítico!'
        : state === 'warn'
          ? 'A cidade está sob pressão.'
          : 'Cidade segura.';
  const kinds = Object.entries(r.reachedByKind)
    .map(([k, n]) => `${n} ${ENEMY[k] ?? k}`)
    .join(' · ');
  const threat = Math.round(r.cityThreatPercent * 100);
  const city = `
    <section class="wr-sec wr-city ${state}">
      <h4>Ameaça à Cidade</h4>
      ${
        r.enemiesReachedCity === 0
          ? '<div class="wr-perfect">✦ Defesa perfeita! A cidade não foi ameaçada.</div>'
          : `<div class="wr-line"><span>${r.enemiesReachedCity} inimigo${r.enemiesReachedCity > 1 ? 's' : ''} alcançaram a cidade${kinds ? ` <em>(${kinds})</em>` : ''}</span></div>
             <div class="wr-line"><span>A cidade sofreu <b>${lost}</b> de dano (${threat}% da vida total)</span></div>`
      }
      <div class="wr-bar threat" title="Ameaça sofrida nesta noite"><i style="width:${Math.min(100, threat)}%"></i><span>Ameaça da noite: ${threat}%</span></div>
      <div class="wr-bar hp ${state}" title="Vida atual da cidade"><i style="width:${Math.max(0, frac * 100)}%"></i><span>Vida da cidade: ${r.cityHpRemaining} / ${r.cityMaxHp}</span></div>
      <div class="wr-state ${state}">${stateTxt}</div>
    </section>`;

  const items = r.itemsDropped.length
    ? r.itemsDropped.map((d) => `<li style="color:${RARITY_INFO[d.rarity as Rarity]?.color ?? '#fff'}">◆ ${d.name} <small>(${RARITY_INFO[d.rarity as Rarity]?.label ?? d.rarity})</small></li>`).join('')
    : '<li class="dim">Nenhum item nesta noite</li>';
  const zeni = r.zeniEarned + (extra.zeniBonus ?? 0);
  const rewards = `
    <section class="wr-sec">
      <h4>Recompensas</h4>
      <div class="wr-line"><span>✧ +${r.expEarned} EXP para a party</span><span><i class="soul-ico"></i>+${r.soulsCollected} almas</span><span><i class="zeni-ico"></i>+${zeni.toLocaleString('pt-BR')} Zeni${extra.zeniBonus ? ` <em>(inclui ${extra.zeniBonus} de bônus)</em>` : ''}</span></div>
      <ul class="run-sum wr-items">${items}</ul>
    </section>`;
  return `<div class="wave-report">${party}${city}${rewards}</div>`;
}
