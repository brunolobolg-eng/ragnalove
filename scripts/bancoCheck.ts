/**
 * Checagem headless do banco de Zen (meta) e dos contadores que o alimentam. Rode: npm run banco:check
 * (a) Migração: save antigo sem zenGanho, sem zenNoBloco e sem banco abre com zero; migrar de novo não muda nada.
 * (b) Contador da jornada: Zen de jogo conta (onda, evento, carroça); venda e gasto não contam.
 * (c) Contador do Bastião: o bloco de 20 noites soma o Zen da noite; derrota no meio do bloco zera o contador.
 */
import { createProfile, addZeni, applyWaveResult, ganharZeni, migrateProfile, type Profile, type WaveResult } from '../src/core/progression/profile';
import { newRun, applyEventEffects, sellItem, makeItem, migrateRun } from '../src/core/run/run';
import { newBastion, migrateBastion, type BastionState } from '../src/core/bastion/bastion';
import { applyNight, startAttempt, type NightOutcome } from '../src/core/bastion/rules';
import { emptyCollection } from '../src/core/progression/cards';
import { ARVORE_BANCO } from '../src/config/arvoreGlobal';
import { GAME_CONFIG } from '../src/config/gameConfig';

let falhas = 0;
let total = 0;
const check = (label: string, cond: boolean, extra = '') => {
  total++;
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${label}${extra ? ` · ${extra}` : ''}`);
  if (!cond) falhas++;
};

const ida = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// ---------------- (a) migração de saves antigos ----------------
{
  const antigo = ida(createProfile()) as Partial<Profile>;
  delete antigo.zenGanho;
  antigo.zeni = 340;
  const m = migrateProfile(antigo as Profile);
  check('perfil antigo sem zenGanho abre com zero', m.zenGanho === 0 && m.zeni === 340);
  const depois = JSON.stringify(migrateProfile(ida(m)));
  check('migrar o perfil de novo não muda nada (idempotente)', depois === JSON.stringify(migrateProfile(ida(JSON.parse(depois)))));
  const lixo = ida(createProfile()) as Profile;
  lixo.zenGanho = -50;
  check('zenGanho negativo vira zero na migração', migrateProfile(lixo).zenGanho === 0);
  const texto = ida(createProfile()) as Profile;
  (texto as { zenGanho: unknown }).zenGanho = 'muito';
  check('zenGanho que não é número vira zero', migrateProfile(texto).zenGanho === 0);
}
{
  const r = newRun('warrior', 99);
  const velha = ida(r) as { profile: Partial<Profile> };
  delete velha.profile.zenGanho;
  const m = migrateRun(velha as unknown as typeof r);
  check('jornada antiga (sem o contador) migra e abre', m.profile.zenGanho === 0 && m.profile.version === 2);
}
{
  const b = newBastion(7, emptyCollection());
  const velho = ida(b) as Partial<BastionState>;
  delete velho.zenNoBloco;
  const m = migrateBastion(velho as BastionState);
  check('Bastião antigo sem o contador de bloco abre com zero', m.zenNoBloco === 0);
  const hoje = JSON.stringify(m);
  check('migrar o Bastião de novo não muda nada (idempotente)', JSON.stringify(migrateBastion(JSON.parse(hoje) as BastionState)) === hoje);
}

// ---------------- (b) contador da jornada: só Zen de jogo ----------------
{
  const p = createProfile();
  ganharZeni(p, 150);
  check('ganho de jogo soma na carteira e conta', p.zeni === 150 && p.zenGanho === 150);
  addZeni(p, 40);
  check('ajuste sem contar (addZeni) não entra no contador', p.zeni === 190 && p.zenGanho === 150);
  ganharZeni(p, -500);
  check('gasto (negativo) não conta e não deixa a carteira negativa', p.zeni === 0 && p.zenGanho === 150);
}
{
  const p = createProfile();
  const wave: WaveResult = { souls: 0, zeni: 77, heroes: {}, drops: [] };
  applyWaveResult(p, wave);
  check('Zen da onda (applyWaveResult) conta no contador', p.zenGanho === 77 && p.zeni === 77);
}
{
  const r = newRun('warrior', 4321);
  r.profile.zeni = 0;
  applyEventEffects(r, [{ zeni: 100 }]);
  check('evento que dá Zen conta (ato I: valor × 1)', r.profile.zenGanho === 100 && r.profile.zeni === 100, `zenGanho ${r.profile.zenGanho}`);
  applyEventEffects(r, [{ zeni: -30 }]);
  check('evento que tira Zen não conta', r.profile.zenGanho === 100 && r.profile.zeni === 70);
}
{
  const r = newRun('warrior', 5);
  r.profile.inventory.push(makeItem('common'));
  const id = r.profile.inventory[0].id;
  const antes = r.profile.zenGanho ?? 0;
  const erro = sellItem(r, id);
  check('venda de equipamento não entra no contador', erro === 'Vendido.' && (r.profile.zenGanho ?? 0) === antes && r.profile.zeni > 0);
}

// ---------------- (c) contador do Bastião: bloco de noites ----------------
const N = ARVORE_BANCO.bastiao.noitesPorBloco;
const onda = (zeni: number): NightOutcome => ({ victory: true, coreHp: 900, structures: [], wave: { souls: 0, zeni, heroes: {}, drops: [] } });
const derrota = (zeni: number): NightOutcome => ({ ...onda(zeni), victory: false });
{
  const b = newBastion(11, emptyCollection());
  const cards = emptyCollection();
  let ultimoBloco: { numero: number; zen: number } | undefined;
  let blocosFechados = 0;
  for (let i = 1; i <= N; i++) {
    const res = applyNight(b, onda(10), `night:1:${i}:${i}`, cards);
    if (res?.bloco) {
      blocosFechados++;
      ultimoBloco = res.bloco;
    }
  }
  const porNoite = 10 + GAME_CONFIG.zeni.waveClearBonus + 0; // onda + bônus de onda limpa (sem bônus de árvore)
  check('a 20ª noite fecha um bloco e informa o número e o Zen', blocosFechados === 1 && ultimoBloco?.numero === 1, `bloco ${ultimoBloco?.numero}`);
  check('Zen do bloco = soma das noites (onda + bônus de onda limpa)', ultimoBloco?.zen === porNoite * N, `${ultimoBloco?.zen} (esperado ${porNoite * N})`);
  check('contador do bloco zera depois de fechar', b.zenNoBloco === 0);
  const prox = applyNight(b, onda(10), `night:1:${N + 1}:${N + 1}`, cards);
  check('a noite seguinte começa um bloco novo (sem bloco fechado)', prox?.bloco === undefined && b.zenNoBloco === porNoite);
}
{
  // derrota no meio de um bloco: nada é fechado e a tentativa nova começa com o contador zerado
  const b = newBastion(12, emptyCollection());
  const cards = emptyCollection();
  for (let i = 1; i <= N / 2; i++) applyNight(b, onda(10), `night:1:${i}:${i}`, cards);
  const perdeu = applyNight(b, derrota(0), `night:1:${N / 2 + 1}:${N / 2 + 1}`, cards);
  check('derrota no meio do bloco não fecha bloco', perdeu?.bloco === undefined && b.attemptEnded === true);
  startAttempt(b, cards);
  check('recomeçar a tentativa zera o contador do bloco', b.zenNoBloco === 0);
}
{
  // o mesmo resultado aplicado de novo (reabrir o relatório) não soma no contador nem fecha bloco de novo
  const b = newBastion(13, emptyCollection());
  const cards = emptyCollection();
  for (let i = 1; i < N; i++) applyNight(b, onda(10), `night:1:${i}:${i}`, cards);
  const fecha = applyNight(b, onda(10), `night:1:${N}:${N}`, cards);
  const de_novo = applyNight(b, onda(10), `night:1:${N}:${N}`, cards);
  check('bloco fechado uma vez: a mesma noite de novo não fecha outro', fecha?.bloco !== undefined && de_novo === undefined);
}

console.log(`\n${total - falhas}/${total} ok${falhas ? ` · ${falhas} FALHA(S)` : ''}`);
if (falhas) throw new Error(`bancoCheck: ${falhas} falha(s)`);
