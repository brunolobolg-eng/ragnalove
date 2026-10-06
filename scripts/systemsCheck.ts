// Checagem dos 4 sistemas: árvore (caminho automático), atributos 0/5/10/15/20,
// Templo (reparo/reviver) e party (entrar vivo). Sem DOM: só lógica do core/run.
import { ATTRIBUTES_CONFIG, computeStats } from '../src/core/progression/attributes';
import { BRANCHES, SKILL_BY_ID, chosenBranch, heroSkills, lvOf, missingRequirements, prereqPath } from '../src/core/progression/skills';
import { createProfile, heroStats, starterWeapon } from '../src/core/progression/profile';
import { gearBonus } from '../src/core/progression/equipment';
import { learnPath, learnSkill, newRun, repairCity, repairCost, respecSkills, revive, reviveCost, unlockHero } from '../src/core/run/run';

let failures = 0;
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${label}${extra ? ` · ${extra}` : ''}`);
  if (!cond) failures++;
};

// ---------- 1) ÁRVORE: caminho automático até skill final ----------
{
  const run = newRun('mage', 42);
  run.party = ['mage'];
  const p = run.profile;
  p.heroes.mage.skillPoints = 30;
  p.zeni = 20000;
  // alvo: Tempestade Elétrica (tier 3, ramo arcana): frostNova 3 + fireBarrier 3 (frostNova pede frostBolt 3)
  const target = SKILL_BY_ID.thunderstorm;
  const path = prereqPath(p.heroes.mage.skills, 'mage', target.id);
  check('caminho calculado sem bloqueio', !path.blocked.length, `${target.id}: ${path.steps.map((s) => `${s.id}→${s.to}`).join(', ')}`);
  const needPoints = path.steps.reduce((s, x) => s + x.points, 0);
  const needZeni = path.steps.reduce((s, x) => s + x.zeni, 0);
  check('totais batem com os passos', path.points === needPoints && path.zeni === needZeni, `${path.points} pts + ${path.zeni} Zen`);
  // sem o caminho, o alvo é impossível
  check('alvo direto é impossível sem pré-requisitos', (learnSkill(run, 'mage', target.id) ?? '').includes('Pré-requisito'));
  // compra o caminho de uma vez
  const ptsBefore = p.heroes.mage.skillPoints;
  const zBefore = p.zeni;
  check('compra do caminho', !learnPath(run, 'mage', target.id));
  check('pontos e Zen descontados exatos', ptsBefore - p.heroes.mage.skillPoints === path.points && zBefore - p.zeni === path.zeni);
  check('alvo liberado após o caminho', !missingRequirements(p.heroes.mage.skills, target.id).length);
  p.heroes.mage.skillPoints += 5;
  check('compra do alvo final', !learnSkill(run, 'mage', target.id), `nv ${lvOf(p.heroes.mage.skills, target.id)}`);
  // pontos insuficientes
  const run2 = newRun('warrior', 43);
  run2.party = ['warrior'];
  run2.profile.heroes.warrior.skillPoints = 1;
  run2.profile.zeni = 99999;
  const wtarget = SKILL_BY_ID.shockwave;
  const wpath = prereqPath(run2.profile.heroes.warrior.skills, 'warrior', wtarget.id);
  if (wpath.steps.length && !wpath.blocked.length)
    check('caminho sem pontos falha com mensagem', (learnPath(run2, 'warrior', wtarget.id) ?? '').includes('ponto(s)'));
  // Zen insuficiente
  const run3 = newRun('warrior', 44);
  run3.party = ['warrior'];
  run3.profile.heroes.warrior.skillPoints = 99;
  run3.profile.zeni = 0;
  if (wpath.steps.length && !wpath.blocked.length)
    check('caminho sem Zen falha com mensagem', (learnPath(run3, 'warrior', wtarget.id) ?? '').includes('Zen'));
  // ramo: escolheu divina, caminho arcana bloqueia (a escolha continua do jogador)
  const run4 = newRun('mage', 45);
  run4.party = ['mage'];
  run4.profile.heroes.mage.skillPoints = 99;
  run4.profile.zeni = 99999;
  const divina = heroSkills('mage').find((d) => d.branch === 'divina' && d.tier === 1)!;
  check('ramo divina escolhido', !learnSkill(run4, 'mage', divina.id), `ramo=${chosenBranch('mage', run4.profile.heroes.mage.skills)}`);
  const arcanaT3 = heroSkills('mage').find((d) => d.tier === 3 && d.branch === 'arcana')!;
  const bp = prereqPath(run4.profile.heroes.mage.skills, 'mage', arcanaT3.id);
  check('caminho do outro ramo bloqueia', bp.blocked.length > 0, bp.blocked[0] ?? '');
  check('compra do caminho bloqueado falha', !!learnPath(run4, 'mage', arcanaT3.id));
  void BRANCHES;
}

// ---------- 2) ATRIBUTOS: 0/5/10/15/20 acima da base ----------
{
  const base = ATTRIBUTES_CONFIG.base;
  // com a arma inicial (ATQ 12), como um herói real joga — sem ela o mult da arma (0,45) achata tudo
  const gearOf = (kind: string) => gearBonus([starterWeapon(kind)]);
  const at = (kind: string, k: string, n: number) => ({ ...base[kind], [k]: base[kind][k as keyof typeof base.warrior] + n });
  const w = (n: number) => computeStats('warrior', at('warrior', 'str', n) as never, gearOf('warrior'), {});
  const v = (n: number) => computeStats('warrior', at('warrior', 'vit', n) as never, gearOf('warrior'), {});
  const m = (n: number) => computeStats('mage', at('mage', 'int', n) as never, gearOf('mage'), {});
  const dx = (n: number) => computeStats('archer', at('archer', 'dex', n) as never, gearOf('archer'), {});
  const lk = (n: number) => computeStats('warrior', at('warrior', 'luk', n) as never, gearOf('warrior'), {});
  const rows: string[] = [];
  for (const n of [0, 5, 10, 15, 20]) rows.push(`str${n}:${Math.round(w(n).cleaveDamage)}/${Math.round(w(n).bashDamage)} vit${n}:${v(n).maxHp} int${n}:${m(n).boltDamage.toFixed(1)} dex${n}:${(dx(n).skillHaste * 100).toFixed(1)}%/${dx(n).arrowDamage.toFixed(1)} luk${n}:${(lk(n).crit * 100).toFixed(1)}%/${(lk(n).dodge * 100).toFixed(1)}%`);
  console.log('   atributos 0/5/10/15/20 →', rows.join(' | '));
  // cada degrau de 5 tem que ser visível
  for (const n of [5, 10, 15, 20]) {
    check(`força +5 (passo ${n})`, w(n).cleaveDamage - w(n - 5).cleaveDamage >= 8, `+${(w(n).cleaveDamage - w(n - 5).cleaveDamage).toFixed(1)} dano`);
    check(`vitalidade +5 (passo ${n})`, v(n).maxHp - v(n - 5).maxHp >= 48, `+${v(n).maxHp - v(n - 5).maxHp} HP`);
    check(`inteligência +5 (passo ${n})`, m(n).boltDamage - m(n - 5).boltDamage >= 4, `+${(m(n).boltDamage - m(n - 5).boltDamage).toFixed(1)} dano`);
    check(`destreza +5 (passo ${n})`, dx(n).skillHaste - dx(n - 5).skillHaste >= 0.08, `+${(((dx(n).skillHaste - dx(n - 5).skillHaste) * 100).toFixed(1))}% haste`);
    check(`sorte +5 (passo ${n})`, lk(n).crit - lk(n - 5).crit >= 0.03, `+${(((lk(n).crit - lk(n - 5).crit) * 100).toFixed(1))}% crit`);
  }
  // sem dominância absurda: 20 pts de um atributo não passam de ~3,5× o dano base da classe
  const cleaveMult = w(20).cleaveDamage / Math.max(1, w(0).cleaveDamage);
  check('força 20 não quebra o jogo', cleaveMult <= 3.5, `×${cleaveMult.toFixed(2)}`);
  check('tetos respeitados', dx(20).skillHaste <= 0.6 && lk(20).dodge <= 0.5 && lk(20).crit <= 0.6);
  void SKILL_BY_ID;
}

// ---------- 3) TEMPLO: reparo + reviver ----------
{
  const run = newRun('warrior', 46);
  run.cityHp = 700;
  run.profile.zeni = 1000;
  const step = Math.min(run.cityMaxHp - run.cityHp, 100);
  const cost = repairCost(run, step);
  check('reparo parcial soma HP e cobra', repairCity(run, false)?.startsWith('Muralha') === true && run.cityHp === 700 + step && run.profile.zeni === 1000 - cost, `+${step} por ${cost}`);
  run.profile.zeni = 5;
  const before = run.cityHp;
  check('reparo sem Zen falha sem cobrar', (repairCity(run, false) ?? '').includes('insuficiente') && run.cityHp === before && run.profile.zeni === 5);
  run.cityHp = run.cityMaxHp;
  check('muralha cheia não cobra', (repairCity(run, false) ?? '').includes('inteira') && run.profile.zeni === 5);
  // reviver: custa metade, sai do caído, entra vivo
  run.party = ['warrior', 'mage'];
  run.dead = ['mage'];
  run.profile.zeni = 1000;
  check('reviver custa metade do Zen', reviveCost(run) === 500);
  check('reviver funciona', revive(run, 'mage') === true && !run.dead.includes('mage') && run.profile.zeni === 500);
  check('reviver vivo falha', revive(run, 'mage') === false);
  run.dead = ['mage'];
  run.profile.zeni = 0;
  check('reviver de graça com bolsa vazia', revive(run, 'mage') === true && run.profile.zeni === 0);
}

// ---------- 4) PARTY: quem entra, entra vivo ----------
{
  const run = newRun('warrior', 47);
  // herói novo entra vivo com HP válido
  unlockHero(run, 'mage');
  const st = heroStats(run.profile, 'mage');
  check('recruta entra vivo', run.party.includes('mage') && !run.dead.includes('mage') && st.maxHp > 0, `HP ${st.maxHp}`);
  // caído de outro contexto não carrega a morte
  run.dead = ['archer'];
  unlockHero(run, 'archer');
  check('morte antiga não entra na party', run.party.includes('archer') && !run.dead.includes('archer'));
  // remover e readmitir (ciclo Dev Lab)
  run.party = run.party.filter((h) => h !== 'archer');
  run.dead = ['archer'];
  unlockHero(run, 'archer');
  check('readmissão limpa o caído', !run.dead.includes('archer'));
  // respec de habilidades continua íntegro após revive/unlock
  const p = createProfile();
  p.heroes.mage.skillPoints = 3;
  const r2 = newRun('mage', 48);
  (r2 as { profile: typeof p }).profile = p;
  r2.profile.zeni = 9999;
  check('respec devolve pontos', (learnSkill(r2, 'mage', 'meditation') === undefined && respecSkills(r2, 'mage')) === true);
}

if (failures) {
  console.error(`systemsCheck: ${failures} FALHA(S)`);
  throw new Error('systemsCheck falhou');
}
console.log('systemsCheck: tudo certo');
