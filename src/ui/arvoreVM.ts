import { ARVORE_CONFIG, CONEXOES, FAMILIAS, MASTERIES, NOS, REGIOES, TIPO_NO_LABEL, type MasteryDef, type MasteryId, type NoDef, type NoTipo } from '../config/arvoreGlobal';
import { HERO_NAME, HERO_ORDER } from '../config/heroes';
import { RAIZ_ID, estadoNo, masteryDoHeroi, masteryDesbloqueada, pontosDisponiveis, pontosGastos, pontosTotais, previsaoAtribuir, previsaoReorganizar, textoBonus, type EstadoNo } from '../core/progression/arvore';
import { heroDisplayName, type Profile } from '../core/progression/profile';
import type { HeroKind } from '../core/progression/skills';

/**
 * View model da Árvore Global: só traduz o estado do núcleo (core/progression/arvore.ts) em texto e
 * números para a tela. Nenhuma regra é decidida aqui: estados, custos e motivos vêm das funções do núcleo.
 */

export interface NoVM {
  id: string;
  nome: string;
  tipo: NoTipo;
  tipoNome: string;
  regiao: string;
  regiaoNome: string;
  cor: string;
  x: number;
  y: number;
  custo: number;
  estado: EstadoNo;
  /** Texto do estado para o painel de detalhes (pt-BR). */
  estadoTexto: string;
  descricao: string;
  bonus: string[];
  /** Quem recebe o bônus ("Todos os heróis" ou os nomes). */
  para: string;
  /** Só pontos de Mastery: a Mastery que este ponto desbloqueia. */
  mastery?: string;
  raiz: boolean;
}

export interface RegiaoVM {
  id: string;
  nome: string;
  descricao: string;
  cor: string;
  cx: number;
  cy: number;
}

export interface CandidatoVM {
  kind: HeroKind;
  nome: string;
  retrato: string;
  nivel: number;
  /** Pode receber esta Mastery pela regra de elegibilidade (falso = nem aparece como opção). */
  elegivel: boolean;
  /** Motivo para não atribuir agora (ausente = pode). */
  erro?: string;
}

export interface MasteryVM {
  id: MasteryId;
  nome: string;
  familia: string;
  identidade: string;
  efeito: string;
  nivelMin: number;
  noId: string;
  noNome: string;
  noAberto: boolean;
  portador?: HeroKind;
  portadorNome?: string;
  candidatos: CandidatoVM[];
  custo: number;
}

export interface HeroiVM {
  kind: HeroKind;
  nome: string;
  retrato: string;
  nivel: number;
  mastery?: string;
}

export interface ArvoreVM {
  pontos: { disponiveis: number; total: number; gastos: number };
  zeni: number;
  reorganizar: { custo: number; erro?: string };
  emCombate: boolean;
  nos: NoVM[];
  conexoes: [string, string][];
  regioes: RegiaoVM[];
  herois: HeroiVM[];
  masteries: MasteryVM[];
}

const ESTADO_TEXTO = (estado: EstadoNo, custo: number, falta: number): string => {
  if (estado === 'aberto') return 'Aberto';
  if (estado === 'disponivel') return `Disponível: abre com os pontos que você tem (${custo} ponto${custo > 1 ? 's' : ''}).`;
  if (estado === 'sem-pontos') return `Falta${falta > 1 ? 'm' : ''} ${falta} ponto${falta > 1 ? 's' : ''} de árvore.`;
  return 'Bloqueado: abra antes um nó ligado a este.';
};

const paraTexto = (no: NoDef): string => (no.para === 'todos' ? 'Todos os heróis' : no.para.map((k) => HERO_NAME[k]).join(', '));

/** Monta a tela com o estado atual do perfil. `retratos`: imagem de cada herói (vazio = inicial no lugar). */
export function montarArvoreVM(p: Profile, retratos: Record<string, string>, ctx: { emCombate?: boolean } = {}): ArvoreVM {
  const disponiveis = pontosDisponiveis(p);
  const nos: NoVM[] = NOS.map((no) => {
    const estado = estadoNo(p, no.id);
    const falta = Math.max(0, no.custo - disponiveis);
    const mastery = no.mastery ? MASTERIES.find((m) => m.id === no.mastery) : undefined;
    return {
      id: no.id,
      nome: no.nome,
      tipo: no.tipo,
      tipoNome: TIPO_NO_LABEL[no.tipo],
      regiao: no.regiao,
      regiaoNome: REGIOES[no.regiao]?.nome ?? no.regiao,
      cor: REGIOES[no.regiao]?.cor ?? '#c79d48',
      x: no.x,
      y: no.y,
      custo: no.custo,
      estado,
      estadoTexto: no.id === RAIZ_ID ? 'Ponto de partida: sempre aberto.' : ESTADO_TEXTO(estado, no.custo, falta),
      descricao: no.descricao,
      bonus: textoBonus(no.bonus),
      para: paraTexto(no),
      mastery: mastery?.nome,
      raiz: no.tipo === 'raiz',
    };
  });
  const regioes: RegiaoVM[] = Object.values(REGIOES).map((r) => {
    const dos = NOS.filter((n) => n.regiao === r.id);
    const cx = dos.reduce((s, n) => s + n.x, 0) / Math.max(1, dos.length);
    const cy = dos.reduce((s, n) => s + n.y, 0) / Math.max(1, dos.length);
    return { id: r.id, nome: r.nome, descricao: r.descricao, cor: r.cor, cx, cy };
  });
  const nomeHeroi = (k: HeroKind) => heroDisplayName(p, k);
  const herois: HeroiVM[] = HERO_ORDER.map((k) => {
    const m = masteryDoHeroi(p, k);
    return { kind: k, nome: nomeHeroi(k), retrato: retratos[k] ?? '', nivel: p.heroes[k]?.level ?? 1, mastery: m?.nome };
  });
  const masteries: MasteryVM[] = MASTERIES.map((m: MasteryDef) => {
    const noM = NOS.find((n) => n.id === m.noRequerido);
    const portador: HeroKind | undefined = p.arvore?.masteries[m.id];
    const candidatos: CandidatoVM[] = HERO_ORDER.map((k) => {
      const prev = previsaoAtribuir(p, m.id, k, ctx);
      return { kind: k, nome: nomeHeroi(k), retrato: retratos[k] ?? '', nivel: p.heroes[k]?.level ?? 1, elegivel: m.elegiveis.includes(k), erro: prev.erro };
    });
    return {
      id: m.id,
      nome: m.nome,
      familia: FAMILIAS.find((f) => f.id === m.familia)?.nome ?? m.familia,
      identidade: m.identidade,
      efeito: m.efeito,
      nivelMin: m.nivelMin,
      noId: m.noRequerido,
      noNome: noM?.nome ?? m.noRequerido,
      noAberto: masteryDesbloqueada(p, m.id),
      portador,
      portadorNome: portador ? nomeHeroi(portador) : undefined,
      candidatos,
      custo: ARVORE_CONFIG.atribuirZen,
    };
  });
  const reorg = previsaoReorganizar(p, ctx);
  return {
    pontos: { disponiveis, total: pontosTotais(p), gastos: pontosGastos(p) },
    zeni: p.zeni,
    reorganizar: { custo: reorg.custo, erro: reorg.erro },
    emCombate: !!ctx.emCombate,
    nos,
    conexoes: CONEXOES,
    regioes,
    herois,
    masteries,
  };
}
