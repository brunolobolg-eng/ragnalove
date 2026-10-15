/**
 * Checagem headless da Árvore Global de progressão e das Masteries táticas. Rode: npm run arvore:check
 * (a) Desenho: dados válidos, ciclo de caminho alternativo, pontos vindos do progresso.
 * (b) Nós: caminho inválido, requisito de ligação, pontos insuficientes, nó já aberto, compatibilidade.
 * (c) Masteries: Zen insuficiente, cancelamento sem gasto, elegibilidade, nível, uma por herói, troca cobra de novo.
 * (d) Mastery segue o personagem: a party muda e ela continua com o herói.
 * (e) Reorganizar: cobra Zen com custo crescente, zera nós e Masteries, e o efeito some (sem residual).
 * (f) Em luta: nada da árvore muda.
 * (g) Sem duplicar nem residual: nó repetido em save conta uma vez; Mastery sem o nó aberto não vale.
 * (h) Efeito real: nó aberto muda heroStats; reorganizar devolve exatamente os status de antes.
 */
import { ARVORE_CONFIG, MASTERY_BY_ID, NOS, type MasteryId } from '../src/config/arvoreGlobal';
import {
  BLOQUEIO_COMBATE,
  alcancavel,
  estadoNo,
  atribuirMastery,
  bonusDoHeroi,
  comprarNo,
  custoReorganizar,
  masteryDoHeroi,
  motivoComprarNo,
  pontosDisponiveis,
  pontosGastos,
  pontosTotais,
  previsaoAtribuir,
  previsaoReorganizar,
  removerMastery,
  reorganizarArvore,
  textoBonus,
  validarArvore,
  vizinhos,
  type ArvoreHost,
} from '../src/core/progression/arvore';
import { createProfile, heroStats, type Profile } from '../src/core/progression/profile';
import { newRun } from '../src/core/run/run';
import type { HeroKind } from '../src/core/progression/skills';

let falhas = 0;
let total = 0;
const check = (label: string, cond: boolean, extra = '') => {
  total++;
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${label}${extra ? ` · ${extra}` : ''}`);
  if (!cond) falhas++;
};

/** Perfil novo com os níveis dados (os outros heróis ficam no nível 1). */
function comNiveis(niveis: Partial<Record<HeroKind, number>>, zeni = 0): Profile {
  const p = createProfile();
  for (const [k, v] of Object.entries(niveis) as [HeroKind, number][]) p.heroes[k].level = v;
  p.zeni = zeni;
  return p;
}

const abrir = (h: ArvoreHost, ids: string[]) => ids.map((id) => comprarNo(h, id));
const semErro = (erros: (string | undefined)[]) => erros.every((e) => e === undefined);

// ---------------- (a) desenho ----------------
const erros = validarArvore();
check('desenho válido (validarArvore sem erros)', erros.length === 0, erros.join('; '));
check('16 a 20 nós na árvore', NOS.length >= 16 && NOS.length <= 20, `${NOS.length} nós`);
const tipos = (t: string) => NOS.filter((n) => n.tipo === t).length;
check('tem comuns, notáveis, caminhos alternativos e pontos de Mastery', tipos('comum') > 0 && tipos('notavel') > 0 && tipos('caminho') > 0 && tipos('mastery') > 0, `comum ${tipos('comum')} · notável ${tipos('notavel')} · caminho ${tipos('caminho')} · mastery ${tipos('mastery')}`);
check('três Masteries táticas, cada uma com ponto próprio', ['barreiraDeContencao', 'golpeDeMisericordia', 'pressaoTatica'].every((id) => MASTERY_BY_ID[id] && NOS.some((n) => n.mastery === id)));
check('notável Muralha Viva tem duas rotas (caminho alternativo)', vizinhos('muralhaViva').length >= 2, vizinhos('muralhaViva').join(', '));
check('custo de reorganizar começa em 80 e sobe a cada uso', custoReorganizar(comNiveis({})) === ARVORE_CONFIG.reorganizarZen);
check('perfil novo tem 0 pontos de árvore', pontosTotais(createProfile()) === 0);

const pNiv = comNiveis({ warrior: 5, mage: 4 });
check('pontos = (nível − 1) por herói, somados', pontosTotais(pNiv) === 4 + 3, `${pontosTotais(pNiv)} pontos`);

// ---------------- (b) nós: requisitos e caminho ----------------
{
  const p = comNiveis({ warrior: 10 }); // 9 pontos
  check('nó sem ligação com o aberto não abre', (comprarNo(p, 'brasaEterna') ?? '').includes('Abra primeiro'));
  check('caminho inválido não gasta ponto', pontosDisponiveis(p) === 9, `${pontosDisponiveis(p)} pontos`);
  check('abrir um nó ligado ao núcleo funciona', comprarNo(p, 'vigorDoReino') === undefined && pontosDisponiveis(p) === 8);
  check('nó já aberto não abre de novo', (comprarNo(p, 'vigorDoReino') ?? '').includes('já está aberto') && pontosDisponiveis(p) === 8);
  check('nó ligado a um aberto abre (escudoAntigo)', comprarNo(p, 'escudoAntigo') === undefined && pontosDisponiveis(p) === 7);
  check('ponto de Mastery custa 2', comprarNo(p, 'pontoBarreira') === undefined && pontosDisponiveis(p) === 5);
  check('caminho alternativo abre e liga ao notável', semErro([comprarNo(p, 'caminhoDaMuralha'), comprarNo(p, 'muralhaViva')]) && pontosDisponiveis(p) === 2);
  check('pontos gastos batem com os nós abertos', pontosGastos(p) === 7, `${pontosGastos(p)} gastos`);
}
{
  // rota alternativa sozinha: o notável abre pelo caminho, sem passar pelo escudo nem pelo ponto de barreira
  const p = comNiveis({ warrior: 10 });
  check('rota alternativa abre o notável sem o escudo', semErro(abrir(p, ['vigorDoReino', 'caminhoDaMuralha', 'muralhaViva'])) && p.arvore?.comprados.includes('muralhaViva') === true && !p.arvore?.comprados.includes('escudoAntigo'));
  check('nó sem ligação com nada aberto não é alcançável', alcancavel(p, 'pontoMisericordia') === false && alcancavel(p, 'muralhaViva') === true);
}
{
  const p = comNiveis({ warrior: 2 }); // 1 ponto
  check('pontos insuficientes são avisados', semErro([comprarNo(p, 'vigorDoReino')]) && (comprarNo(p, 'escudoAntigo') ?? '').includes('Faltam 1 ponto'));
  check('pontos insuficientes não mudam nada', pontosDisponiveis(p) === 0 && p.arvore?.comprados.length === 1);
}
{
  // cancelar sem gastar: a pré-visualização não mexe em nada
  const p = comNiveis({ warrior: 5 }, 0);
  const antes = pontosDisponiveis(p);
  motivoComprarNo(p, 'vigorDoReino');
  check('pré-visualizar compra não gasta ponto nem abre nó', pontosDisponiveis(p) === antes && (p.arvore?.comprados.length ?? 0) === 0);
}

// ---------------- (c) masteries: Zen, elegibilidade, nível, uma por herói ----------------
{
  const p = comNiveis({ warrior: 5 }, 0); // 4 pontos
  abrir(p, ['vigorDoReino', 'escudoAntigo', 'pontoBarreira']);
  check('ponto de Mastery aberto com 4 pontos', pontosDisponiveis(p) === 0);
  const prev = previsaoAtribuir(p, 'barreiraDeContencao', 'warrior');
  check('pré-visualização mostra o custo antes de confirmar', prev.custo === ARVORE_CONFIG.atribuirZen && (prev.erro ?? '').includes('Zen insuficiente'), `custo ${prev.custo} · ${prev.erro}`);
  check('Zen insuficiente não atribui', (atribuirMastery(p, 'barreiraDeContencao', 'warrior') ?? '').includes('Zen insuficiente') && !p.arvore?.masteries.barreiraDeContencao && p.zeni === 0);
  p.zeni = ARVORE_CONFIG.atribuirZen - 1;
  check('um Zen a menos ainda não basta', (atribuirMastery(p, 'barreiraDeContencao', 'warrior') ?? '').includes('Zen insuficiente') && p.zeni === ARVORE_CONFIG.atribuirZen - 1);
  p.zeni = ARVORE_CONFIG.atribuirZen;
  check('com Zen suficiente atribui e cobra o custo', atribuirMastery(p, 'barreiraDeContencao', 'warrior') === undefined && p.zeni === 0 && p.arvore?.masteries.barreiraDeContencao === 'warrior');
  check('a Mastery vale para o herói depois de atribuída', masteryDoHeroi(p, 'warrior')?.id === 'barreiraDeContencao');
}
{
  // cancelar: a confirmação nunca roda; o Zen fica intacto
  const p = comNiveis({ warrior: 5 }, 200);
  abrir(p, ['vigorDoReino', 'escudoAntigo', 'pontoBarreira']);
  previsaoAtribuir(p, 'barreiraDeContencao', 'warrior');
  previsaoAtribuir(p, 'barreiraDeContencao', 'warrior');
  check('cancelar a atribuição não gasta Zen nem atribui', p.zeni === 200 && !p.arvore?.masteries.barreiraDeContencao);
}
{
  const p = comNiveis({ warrior: 5, mage: 4, warlock: 3 }, 1000);
  abrir(p, ['vigorDoReino', 'escudoAntigo', 'pontoBarreira', 'sortePeregrina', 'pontoPressao']); // 4 + 3 = 7 pontos
  check('mage não é elegível para Pressão Tática', (atribuirMastery(p, 'pressaoTatica', 'mage') ?? '').includes('não serve'));
  check('archer não é elegível para Barreira de Contenção', (atribuirMastery(p, 'barreiraDeContencao', 'archer') ?? '').includes('não serve'));
  check('Barreira só vale depois de atribuída', masteryDoHeroi(p, 'warrior') === undefined);
  check('atribui Barreira ao Guerreiro', atribuirMastery(p, 'barreiraDeContencao', 'warrior') === undefined && p.zeni === 1000 - ARVORE_CONFIG.atribuirZen);
  check('um herói só carrega uma Mastery', (atribuirMastery(p, 'pressaoTatica', 'warrior') ?? '').includes('já carrega outra'));
  // troca: a Barreira vai ao Bruxo e cobra de novo; o Guerreiro fica sem ela
  check('trocar de personagem cobra de novo', atribuirMastery(p, 'barreiraDeContencao', 'warlock') === undefined && p.zeni === 1000 - 2 * ARVORE_CONFIG.atribuirZen);
  check('Mastery trocada sai do antigo herói (sem duplicar)', masteryDoHeroi(p, 'warrior') === undefined && masteryDoHeroi(p, 'warlock')?.id === 'barreiraDeContencao');
}
{
  // nível mínimo: Pressão Tática pede nível 2
  const p = comNiveis({ warrior: 5, assassin: 1 }, 500);
  abrir(p, ['sortePeregrina', 'pontoPressao']);
  check('nível mínimo é checado na atribuição', (atribuirMastery(p, 'pressaoTatica', 'assassin') ?? '').includes('nível 2'));
  p.heroes.assassin.level = 2;
  check('com o nível mínimo, atribui', atribuirMastery(p, 'pressaoTatica', 'assassin') === undefined);
}

// ---------------- (d) Mastery segue o personagem (party muda) ----------------
{
  const run = newRun('warrior', 4242);
  const p = run.profile;
  p.heroes.warrior.level = 5;
  p.zeni = 500;
  abrir(p, ['vigorDoReino', 'escudoAntigo', 'pontoBarreira']);
  atribuirMastery(p, 'barreiraDeContencao', 'warrior');
  run.party = ['warrior'];
  const naParty = masteryDoHeroi(p, 'warrior')?.id;
  run.party = ['mage'];
  check('Mastery continua com o Guerreiro quando ele sai da party', masteryDoHeroi(p, 'warrior')?.id === 'barreiraDeContencao', `na party: ${naParty}`);
  check('o Mago não herda a Mastery do Guerreiro', masteryDoHeroi(p, 'mage') === undefined);
  check('efeito de nó compatível segue o Guerreiro fora da party', heroStats(p, 'warrior').attrs.vit > heroStats(createProfile(), 'warrior').attrs.vit);
  run.party = ['warrior', 'mage'];
  check('volta à party e a Mastery continua a mesma', masteryDoHeroi(p, 'warrior')?.id === 'barreiraDeContencao' && naParty === 'barreiraDeContencao');
}

// ---------------- (e) reorganizar: custo crescente, efeito some ----------------
{
  const p = comNiveis({ warrior: 5, mage: 4 }, 300);
  abrir(p, ['vigorDoReino', 'escudoAntigo', 'pontoBarreira']);
  atribuirMastery(p, 'barreiraDeContencao', 'warrior');
  check('antes de reorganizar: zen 240, Mastery ativa', p.zeni === 240 && masteryDoHeroi(p, 'warrior') !== undefined);
  const prev = previsaoReorganizar(p);
  check('pré-visualização da reorganização mostra custo 80', prev.custo === 80 && prev.erro === undefined, `custo ${prev.custo}`);
  check('reorganizar cobra Zen e zera nós e Masteries', reorganizarArvore(p) === undefined && p.zeni === 160 && (p.arvore?.comprados.length ?? 0) === 0 && Object.keys(p.arvore?.masteries ?? {}).length === 0);
  check('depois de reorganizar, pontos voltam todos', pontosDisponiveis(p) === pontosTotais(p) && pontosTotais(p) === 7);
  check('Mastery saiu do herói (sem residual)', masteryDoHeroi(p, 'warrior') === undefined);
  check('efeito de nó saiu (bônus zerado)', bonusDoHeroi(p, 'warrior').attrs.vit === undefined && Object.keys(bonusDoHeroi(p, 'warrior').passiva).length === 0);
  abrir(p, ['vigorDoReino']);
  check('segunda reorganização custa o dobro', previsaoReorganizar(p).custo === 160);
  p.zeni = 100; // menos que o custo (160): a reorganização não pode acontecer
  check('Zen insuficiente bloqueia a reorganização', (reorganizarArvore(p) ?? '').includes('Zen insuficiente') && p.zeni === 100 && p.arvore?.comprados.length === 1);
  check('remover Mastery que não existe avisa', (removerMastery(p, 'pressaoTatica') ?? '').includes('guardada'));
}
{
  // remover Mastery é de graça: a Mastery volta para a guarda
  const p = comNiveis({ warrior: 5 }, 200);
  abrir(p, ['vigorDoReino', 'escudoAntigo', 'pontoBarreira']);
  atribuirMastery(p, 'barreiraDeContencao', 'warrior');
  const zen = p.zeni;
  check('tirar a Mastery é de graça e volta à guarda', removerMastery(p, 'barreiraDeContencao') === undefined && p.zeni === zen && masteryDoHeroi(p, 'warrior') === undefined);
}

// ---------------- (f) em luta, nada muda ----------------
{
  const p = comNiveis({ warrior: 5 }, 1000);
  abrir(p, ['vigorDoReino', 'escudoAntigo', 'pontoBarreira']);
  atribuirMastery(p, 'barreiraDeContencao', 'warrior');
  const ctx = { emCombate: true };
  const antes = JSON.stringify(p.arvore) + p.zeni;
  check('comprar em luta é bloqueado', comprarNo(p, 'caminhoDaMuralha', ctx) === BLOQUEIO_COMBATE);
  check('atribuir em luta é bloqueado', atribuirMastery(p, 'pressaoTatica', 'warrior', ctx) === BLOQUEIO_COMBATE);
  check('tirar Mastery em luta é bloqueado', removerMastery(p, 'barreiraDeContencao', ctx) === BLOQUEIO_COMBATE);
  check('reorganizar em luta é bloqueado', reorganizarArvore(p, ctx) === BLOQUEIO_COMBATE);
  check('nada muda em luta', JSON.stringify(p.arvore) + p.zeni === antes);
  check('previsão em luta já mostra o bloqueio', previsaoReorganizar(p, ctx).erro === BLOQUEIO_COMBATE);
}

// ---------------- (g) sem duplicar, sem residual ----------------
{
  // save com o mesmo nó duas vezes: conta uma vez
  const p = comNiveis({ warrior: 5 });
  p.arvore = { comprados: ['vigorDoReino', 'vigorDoReino'], masteries: {}, reorganizacoes: 0 };
  check('nó repetido no save dá o bônus uma vez', bonusDoHeroi(p, 'warrior').attrs.vit === 1);
  check('nó repetido no save custa uma vez', pontosGastos(p) === 1);
}
{
  // Mastery guardada sem o nó aberto (save inconsistente) não tem efeito
  const p = comNiveis({ warrior: 5 }, 0);
  p.arvore = { comprados: [], masteries: { barreiraDeContencao: 'warrior' as HeroKind }, reorganizacoes: 0 };
  check('Mastery sem o ponto aberto não vale (sem residual)', masteryDoHeroi(p, 'warrior') === undefined);
  // Mastery para herói que não é elegível não vale
  const q = comNiveis({ mage: 5 }, 0);
  q.arvore = { comprados: ['pontoPressao', 'sortePeregrina'], masteries: { pressaoTatica: 'mage' as HeroKind }, reorganizacoes: 0 };
  check('Mastery para herói não elegível não vale', masteryDoHeroi(q, 'mage') === undefined);
  // Mastery abaixo do nível mínimo não vale
  const r = comNiveis({ assassin: 1 }, 0);
  r.arvore = { comprados: ['pontoPressao', 'sortePeregrina'], masteries: { pressaoTatica: 'assassin' as HeroKind }, reorganizacoes: 0 };
  check('Mastery abaixo do nível mínimo não vale', masteryDoHeroi(r, 'assassin') === undefined);
}
{
  // compatibilidade: nó só para magos não dá nada ao guerreiro
  const p = comNiveis({ warrior: 5, mage: 5 });
  abrir(p, ['chamaAntiga']);
  check('nó de magia dá Inteligência ao mago', bonusDoHeroi(p, 'mage').attrs.int === 1);
  check('nó de magia não dá nada ao guerreiro', bonusDoHeroi(p, 'warrior').attrs.int === undefined);
  check('nó "todos" dá a todos', bonusDoHeroi(p, 'warrior').attrs.vit === undefined && bonusDoHeroi(createProfile(), 'warrior').attrs.vit === undefined);
}

// ---------------- (h) efeito real em heroStats ----------------
{
  const p = comNiveis({ warrior: 5 }, 0);
  const base = JSON.stringify(heroStats(p, 'warrior'));
  abrir(p, ['vigorDoReino', 'escudoAntigo']);
  const com = heroStats(p, 'warrior');
  check('nó aberto muda os status do herói', JSON.stringify(com) !== base && com.attrs.vit === heroStats(createProfile(), 'warrior').attrs.vit + 1);
  check('nó de escudo dá bloqueio ao guerreiro', com.block > heroStats(createProfile(), 'warrior').block);
  p.zeni = 500;
  reorganizarArvore(p);
  check('depois de reorganizar, os status voltam exatamente aos de antes', JSON.stringify(heroStats(p, 'warrior')) === base);
}
{
  // texto (pt-BR) dos bônus
  const txt = textoBonus({ reduce: 0.02, hp: 0.06, vit: 2 });
  check('textos dos bônus em pt-BR', txt.includes('−2% de dano recebido') && txt.includes('+6% de vida máxima') && txt.includes('+2 de Vitalidade'), txt.join(' | '));
}
{
  // ids de Mastery são estáveis (vão para o save)
  const ids: MasteryId[] = ['barreiraDeContencao', 'golpeDeMisericordia', 'pressaoTatica'];
  check('ids de Mastery existem na configuração', ids.every((id) => MASTERY_BY_ID[id]?.id === id));
}

// ---------------- (i) estado de cada nó para a tela ----------------
{
  const p = comNiveis({ warrior: 2 }); // 1 ponto
  check('estado: raiz e nó aberto são "aberto"', estadoNo(p, 'nucleo') === 'aberto');
  check('estado: nó ligado e com ponto é "disponivel"', estadoNo(p, 'vigorDoReino') === 'disponivel');
  check('estado: nó sem ligação é "bloqueado"', estadoNo(p, 'brasaEterna') === 'bloqueado');
  check('estado: nó ligado sem ponto é "sem-pontos"', (comprarNo(p, 'vigorDoReino'), estadoNo(p, 'escudoAntigo')) === 'sem-pontos');
  check('estado: depois de abrir vira "aberto"', estadoNo(p, 'vigorDoReino') === 'aberto');
  check('estado: nó desconhecido é "bloqueado"', estadoNo(p, 'naoExiste') === 'bloqueado');
}

console.log(`\n${total - falhas}/${total} ok${falhas ? ` · ${falhas} FALHA(S)` : ''}`);
if (falhas) throw new Error(`arvoreCheck: ${falhas} falha(s)`);
