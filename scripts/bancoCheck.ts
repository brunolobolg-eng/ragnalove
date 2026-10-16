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
import { bancoDoMeta, chaveBloco, chaveJornada, creditoBastiao, creditoCampanha, gravarComCredito, type ChaveDisco } from '../src/core/progression/banco';

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
  // decisão 8: o Zen de evento é o valor de world.ts × ato (1, 1,6 e 2,4), não um valor sem escala
  const r2 = newRun('warrior', 909);
  r2.act = 1;
  r2.profile.zeni = 0;
  applyEventEffects(r2, [{ zeni: 100 }]);
  const ato2 = r2.profile.zeni;
  r2.act = 2;
  r2.profile.zeni = 0;
  applyEventEffects(r2, [{ zeni: 100 }]);
  check('Zen de evento escala por ato: 100 → 160 (ato II) e 240 (ato III)', ato2 === 160 && r2.profile.zeni === 240, `${ato2} e ${r2.profile.zeni}`);
}
{
  const r = newRun('warrior', 5);
  r.profile.inventory.push(makeItem(r, 'common'));
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

// ---------------- (d) queda entre as escritas: nunca paga em dobro, nunca perde o crédito ----------------
/** Disco de faz de conta. `queda` = número da escrita que "cai" (o app fecha antes de gravar). */
function discoDeFaz(inicial: { meta?: string | null; run?: string | null; bastion?: string | null }, queda?: number) {
  const dados: Record<ChaveDisco, string | null> = { meta: inicial.meta ?? null, run: inicial.run ?? null, bastion: inicial.bastion ?? null };
  let escritas = 0;
  return {
    dados,
    get: (k: ChaveDisco) => dados[k],
    set: (k: ChaveDisco, texto: string) => {
      escritas++;
      if (escritas === queda) throw new Error('queda do app');
      dados[k] = texto;
      return true;
    },
  };
}
/** Tenta a gravação e, se o app "cair", devolve true (a queda aconteceu). */
const comQueda = (fn: () => unknown): boolean => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

// jornada da campanha: vitória com 1000 Zen ganhos → 50% = 500 no banco
{
  const seed = 777;
  const ativa = JSON.stringify({ seed, ended: undefined });
  const encerrada = JSON.stringify({ seed, ended: 'victory' });
  const valor = creditoCampanha(1000, 'vitoria');
  check('vitória paga 50% do Zen ganho na jornada (1000 → 500)', valor === 500);
  for (const queda of [1, 2]) {
    const d = discoDeFaz({ meta: '{}', run: ativa }, queda);
    const caiu = comQueda(() => gravarComCredito(d, chaveJornada(seed), valor, { chave: 'run', texto: encerrada }));
    // invariante: jornada encerrada ⇒ crédito já no banco (o contrário pode acontecer: crédito sem a jornada encerrada, e a repetição fecha)
    const invariante = d.dados.run !== encerrada || bancoDoMeta(d.dados.meta).saldo === valor;
    check(`queda na escrita ${queda}: a jornada só fica encerrada se o crédito já está no banco`, caiu && invariante, `saldo ${bancoDoMeta(d.dados.meta).saldo} · run ${d.dados.run === encerrada ? 'encerrada' : 'ativa'}`);
    // repetição (o jogo reabre e refaz o fim): paga o que falta e nada além
    gravarComCredito(d, chaveJornada(seed), valor, { chave: 'run', texto: encerrada });
    check(`queda na escrita ${queda}: depois da repetição o crédito vale uma vez só e a jornada fica encerrada`, bancoDoMeta(d.dados.meta).saldo === valor && d.dados.run === encerrada, `saldo ${bancoDoMeta(d.dados.meta).saldo}`);
  }
  {
    const d = discoDeFaz({ meta: '{}', run: encerrada });
    gravarComCredito(d, chaveJornada(seed), valor, { chave: 'run', texto: encerrada });
    gravarComCredito(d, chaveJornada(seed), valor, { chave: 'run', texto: encerrada });
    check('encerrar a mesma jornada duas vezes não paga duas vezes', bancoDoMeta(d.dados.meta).saldo === valor && bancoDoMeta(d.dados.meta).creditos.length === 1);
  }
  {
    const d = discoDeFaz({ meta: '{}', run: ativa });
    const r = gravarComCredito(d, chaveJornada(seed), creditoCampanha(1000, 'abandono'), { chave: 'run', texto: JSON.stringify({ seed, ended: 'defeat' }) });
    check('abandono não cria crédito nem chave (o meta não é tocado)', r === 'ok' && d.dados.meta === '{}' && bancoDoMeta(d.dados.meta).saldo === 0);
  }
  {
    const d = discoDeFaz({ meta: '{ quebrado', run: ativa });
    const r = gravarComCredito(d, chaveJornada(seed), valor, { chave: 'run', texto: encerrada });
    check('meta ilegível: o progresso é gravado mesmo assim, e o aviso sai (sem-banco)', r === 'sem-banco' && d.dados.run === encerrada && d.dados.meta === '{ quebrado');
  }
}

// bloco de 20 noites do Bastião: a 20ª noite vence, paga 30% do Zen do bloco, e o Bastião é gravado depois
{
  const cards = emptyCollection();
  const semente = 4242;
  const b0 = newBastion(semente, cards);
  for (let i = 1; i < N; i++) applyNight(b0, onda(10), `night:1:${i}:${i}`, cards);
  const antes = JSON.stringify(b0);
  const zenBloco = (10 + GAME_CONFIG.zeni.waveClearBonus) * N;
  const valor = creditoBastiao(zenBloco);
  check('bloco de 20 noites paga 30% do Zen do bloco', valor === Math.floor(zenBloco * 0.3), `${zenBloco} → ${valor}`);
  const chave = chaveBloco(semente, 1, 1);
  for (const queda of [1, 2]) {
    const d = discoDeFaz({ meta: '{}', bastion: antes }, queda);
    const b1 = JSON.parse(antes) as BastionState;
    const res = applyNight(b1, onda(10), `night:1:${N}:${N}`, cards);
    const depois = JSON.stringify(b1);
    const caiu = comQueda(() => gravarComCredito(d, chave, valor, { chave: 'bastion', texto: depois }));
    // invariante: Bastião avançado (noite aplicada) ⇒ crédito do bloco já no banco
    const invariante = d.dados.bastion !== depois || bancoDoMeta(d.dados.meta).saldo === valor;
    check(`bloco, queda na escrita ${queda}: o Bastião só avança se o crédito já está no banco`, caiu && invariante && res?.bloco !== undefined, `saldo ${bancoDoMeta(d.dados.meta).saldo}`);
    // repetição: o jogo recarrega a noite do selo (determinística) e aplica de novo
    const bRec = JSON.parse(d.dados.bastion ?? antes) as BastionState;
    const res2 = applyNight(bRec, onda(10), `night:1:${N}:${N}`, cards);
    if (res2?.bloco) gravarComCredito(d, chave, creditoBastiao(res2.bloco.zen), { chave: 'bastion', texto: JSON.stringify(bRec) });
    check(`bloco, queda na escrita ${queda}: depois da repetição o bloco paga uma vez só`, bancoDoMeta(d.dados.meta).saldo === valor && bancoDoMeta(d.dados.meta).creditos.length === 1, `saldo ${bancoDoMeta(d.dados.meta).saldo}`);
    check(`bloco, queda na escrita ${queda}: o Bastião termina com as ${N} noites`, bRec.nightsInAttempt === N);
  }
}

console.log(`\n${total - falhas}/${total} ok${falhas ? ` · ${falhas} FALHA(S)` : ''}`);
if (falhas) throw new Error(`bancoCheck: ${falhas} falha(s)`);
