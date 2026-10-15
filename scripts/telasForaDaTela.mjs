/**
 * Varredura de layout: procura o que sai da tela ou é cortado em cada tela do jogo.
 *
 * Como rodar (com o servidor de dev aberto):
 *   1) npx vite --port 5561 --strictPort          (ou o que estiver em UI_URL)
 *   2) npm run ui:fora-da-tela                     (todas as telas, 4 tamanhos)
 *
 * Opções (depois de `--`):
 *   --telas menu,relatorio     só as telas cujo id contém um dos termos
 *   --tamanhos 1280x800,390x844  tamanhos da janela (padrão: 1280x800,1366x768,1920x1080,390x844)
 *   --capturas <pasta>         salva um PNG de cada tela e tamanho
 *   --url http://localhost:5561/  endereço do jogo (ou variável UI_URL)
 *
 * Ambiente (opcional):
 *   CHROMIUM_PATH   executável do Chromium (padrão: o do Playwright)
 *   PLAYWRIGHT_MODULE  caminho do módulo playwright (padrão: 'playwright', depois /opt/node22/...)
 *
 * O que mede em cada tela (só conta o que o jogador vê: elemento coberto por outra janela ou
 * totalmente fora da janela não entra):
 *   (a) fora da janela: elemento que sai (parcialmente) da área da janela
 *   (b) cortado pelo pai: elemento que sai do retângulo de um ancestral com overflow hidden/clip
 *   (c) rolagem horizontal da página (a página não deve andar para os lados)
 *   (d) texto que sai da própria caixa (medido pelo texto, não pelo tamanho do elemento)
 *   (i) só para conferir: reticências (texto truncado de propósito) e rolagem vertical da página
 * Também lista erros de console/página novos. Sai com código 1 se achar (a)-(d) ou erro de página.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------- argumentos
const args = process.argv.slice(2);
const opt = (nome, padrao) => {
  const i = args.indexOf(nome);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
};
const URL_JOGO = opt('--url', process.env.UI_URL ?? 'http://localhost:5561/');
const FILTRO = opt('--telas', '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const TAMANHOS = opt('--tamanhos', '1280x800,1366x768,1920x1080,390x844')
  .split(',')
  .map((t) => t.trim().split('x').map(Number))
  .map(([w, h]) => ({ w, h }));
const PASTA_CAPTURAS = opt('--capturas', '');

// ---------------------------------------------------------------- navegador
async function carregarPlaywright() {
  const candidatos = [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node22/lib/node_modules/playwright/index.mjs'].filter(Boolean);
  for (const c of candidatos) {
    try {
      return (await import(c)).chromium;
    } catch {
      /* tenta o próximo */
    }
  }
  throw new Error('Playwright não encontrado. Defina PLAYWRIGHT_MODULE com o caminho do módulo.');
}

const chromium = await carregarPlaywright();
const navegador = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--ignore-gpu-blocklist'],
});

// ---------------------------------------------------------------- ações para abrir cada tela
const clicar = (p, sel) =>
  p.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) throw new Error(`não achei ${s}`);
    el.click();
  }, sel);

const esperarMapa = (p) => p.waitForFunction(() => document.body.dataset.mode === 'map', null, { timeout: 60000 });

/** Menu → seleção de heróis → mapa-múndi (jornada nova). */
async function iniciarJornada(p) {
  await clicar(p, '.mm-hot-start');
  await p.waitForSelector('.cs-actions [data-a="go"]', { timeout: 60000 });
  await clicar(p, '.cs-actions [data-a="go"]');
  await esperarMapa(p);
}

const vg = (p, codigo) => p.evaluate(codigo);

/** Telas da varredura: id, nome e como abrir. */
const TELAS = [
  { id: 'menu', nome: 'Menu principal', abrir: async () => {} },
  { id: 'menu-opcoes', nome: 'Menu > Opções (engrenagem)', abrir: async (p) => clicar(p, '.mm-gear') },
  { id: 'menu-info', nome: 'Menu > Info', abrir: async (p) => clicar(p, '.mm-hot-info') },
  { id: 'menu-donate', nome: 'Menu > Donate', abrir: async (p) => clicar(p, '.mm-hot-donate') },
  { id: 'selecao-heroi', nome: 'Seleção de heróis', abrir: async (p) => { await clicar(p, '.mm-hot-start'); await p.waitForSelector('.cs-actions [data-a="go"]', { timeout: 60000 }); } },
  { id: 'mapa-party-cheia', nome: 'Mapa-múndi (party de 6)', abrir: async (p) => { await iniciarJornada(p); await vg(p, `(() => { __vg.run.party = ['warrior','mage','archer','sorcerer','warlock','assassin']; __vg.run.dead = []; __vg.openMap(true); })()`); } },
  { id: 'mapa-party-caido', nome: 'Mapa-múndi (party com 1 caído)', abrir: async (p) => { await iniciarJornada(p); await vg(p, `(() => { __vg.run.party = ['warrior','mage','archer']; __vg.run.dead = ['warrior']; __vg.openMap(true); })()`); } },
  { id: 'relatorio-vitoria', nome: 'Relatório da Noite (sem caídos)', abrir: async (p) => { await iniciarJornada(p); await vg(p, '__vg.reportPreview(0)'); } },
  { id: 'relatorio-1-caido', nome: 'Relatório da Noite (1 caído)', abrir: async (p) => { await iniciarJornada(p); await vg(p, '__vg.reportPreview(1)'); } },
  { id: 'relatorio-2-caidos', nome: 'Relatório da Noite (2 caídos: 3 botões)', abrir: async (p) => { await iniciarJornada(p); await vg(p, '__vg.reportPreview(2)'); } },
  { id: 'evento', nome: 'Evento na estrada', abrir: async (p) => { await iniciarJornada(p); await vg(p, '__vg.openEvent()'); } },
  { id: 'roleta', nome: 'Roleta de prêmio', abrir: async (p) => { await iniciarJornada(p); await vg(p, '__vg.rouletteDemo()'); } },
  { id: 'pacote-cartas', nome: 'Pacote de cartas', abrir: async (p) => { await iniciarJornada(p); await vg(p, '__vg.cardPackDemo()'); } },
  { id: 'cidade', nome: 'Cidade (serviços)', abrir: async (p) => { await iniciarJornada(p); await vg(p, '__vg.openCity()'); } },
  { id: 'ficha', nome: 'Ficha do personagem (C)', abrir: async (p) => { await iniciarJornada(p); await vg(p, '__vg.hud.toggleCharacter(true)'); } },
  { id: 'arvore-habilidades', nome: 'Árvore de habilidades (K)', abrir: async (p) => { await iniciarJornada(p); await vg(p, `__vg.openSkills('warrior')`); } },
  { id: 'colecao', nome: 'Coleção de cartas', abrir: async (p) => { await iniciarJornada(p); await vg(p, '__vg.collectionDemo()'); } },
  { id: 'bastiao-hub', nome: 'Último Bastião (hub)', abrir: async (p) => { await clicar(p, '.mm-hot-bastion'); await p.waitForTimeout(800); } },
  { id: 'fim-vitoria', nome: 'Fim da jornada (vitória)', abrir: async (p) => { await iniciarJornada(p); await vg(p, '__vg.fimDaJornada(true)'); } },
  { id: 'fim-derrota', nome: 'Fim da jornada (derrota)', abrir: async (p) => { await iniciarJornada(p); await vg(p, '__vg.fimDaJornada(false)'); } },
];

// ---------------------------------------------------------------- medição (roda dentro da página)
function medirNaPagina() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const EPS = 0.5;
  const nome = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    const cls = [...el.classList].slice(0, 3).join('.');
    if (cls) s += `.${cls}`;
    const txt = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 36);
    return txt ? `${s} "${txt}"` : s;
  };
  const visivel = (el) => {
    for (let a = el; a && a.nodeType === 1; a = a.parentElement) {
      if (a.hidden) return false;
      const cs = getComputedStyle(a);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const todos = [...document.body.querySelectorAll('*')].filter(
    (el) => el.tagName !== 'CANVAS' && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' && !(el.closest('svg') && el.tagName.toLowerCase() !== 'svg'),
  );
  // coberto por outra camada (ex.: o mapa por baixo do Relatório da Noite) não conta: o jogador não vê
  const aoUsuario = (el) => {
    const r = el.getBoundingClientRect();
    const pts = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + 2, r.top + 2],
      [r.right - 2, r.top + 2],
      [r.left + 2, r.bottom - 2],
      [r.right - 2, r.bottom - 2],
    ];
    for (const [x, y] of pts) {
      if (x < 0 || y < 0 || x > W || y > H) continue;
      const t = document.elementFromPoint(x, y);
      if (t && (t === el || el.contains(t) || t.contains(el))) return true;
    }
    return false; // totalmente fora da janela ou coberto: o jogador não vê (ex.: o mapa atrás do relatório)
  };
  const vis = todos.filter(visivel).filter(aoUsuario);
  const topo = (lista) => lista.filter((el) => !lista.some((o) => o !== el && o.contains(el)));

  // painel com rolagem (overflow auto/scroll): o que está fora da área visível do painel é alcançado rolando
  const scrollavel = (el) => {
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY)) return true;
    }
    return false;
  };

  // (a) fora da janela
  const foraLista = vis.filter((el) => {
    const r = el.getBoundingClientRect();
    return (r.left < -EPS || r.right > W + EPS || r.top < -EPS || r.bottom > H + EPS) && !scrollavel(el);
  });
  const fora = topo(foraLista).map((el) => {
    const r = el.getBoundingClientRect();
    const lados = [];
    if (r.left < -EPS) lados.push(`esq ${Math.round(-r.left)}px`);
    if (r.right > W + EPS) lados.push(`dir ${Math.round(r.right - W)}px`);
    if (r.top < -EPS) lados.push(`topo ${Math.round(-r.top)}px`);
    if (r.bottom > H + EPS) lados.push(`base ${Math.round(r.bottom - H)}px`);
    return `${nome(el)} sai ${lados.join(', ')}`;
  });

  // (a2) totalmente fora da janela e sem rolagem que a alcance: o jogador não consegue chegar (ex.: botão abaixo da base).
  // Dentro de um painel com rolagem (overflow auto/scroll) não conta: o painel rola até o item.
  const inalcancavel = vis
    .filter((el) => {
      const r = el.getBoundingClientRect();
      const fora = r.right <= 0 || r.bottom <= 0 || r.left >= W || r.top >= H;
      return fora && !scrollavel(el);
    })
    .filter((el) => !el.closest('[hidden]'));
  const inalcancaveisTopo = topo(inalcancavel).map((el) => {
    const r = el.getBoundingClientRect();
    return `${nome(el)} fora da janela e sem rolagem (y ${Math.round(r.top)}-${Math.round(r.bottom)}, janela ${H})`;
  });
  fora.push(...inalcancaveisTopo);

  // (b) cortado por um ancestral com overflow hidden/clip
  const cortadoLista = [];
  for (const el of vis) {
    const r = el.getBoundingClientRect();
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY)) break; // painel com rolagem: alcançável
      const cx = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
      const cy = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
      if (!cx && !cy) continue;
      const ar = a.getBoundingClientRect();
      const lados = [];
      if (cx) {
        if (r.left < ar.left - EPS) lados.push(`esq ${Math.round(ar.left - r.left)}px`);
        if (r.right > ar.right + EPS) lados.push(`dir ${Math.round(r.right - ar.right)}px`);
      }
      if (cy) {
        if (r.top < ar.top - EPS) lados.push(`topo ${Math.round(ar.top - r.top)}px`);
        if (r.bottom > ar.bottom + EPS) lados.push(`base ${Math.round(r.bottom - ar.bottom)}px`);
      }
      if (lados.length) {
        cortadoLista.push({ el, texto: `${nome(el)} cortado por ${nome(a)} (${lados.join(', ')})` });
        break;
      }
    }
  }
  const cortados = topo(cortadoLista.map((c) => c.el)).map((el) => cortadoLista.find((c) => c.el === el).texto);

  // (c) rolagem horizontal da página (e vertical, só para conferir)
  const rolagemH = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - W;
  const rolagemV = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - H;

  // (d) texto que sai da caixa do elemento (medido pelo texto, não pelo scrollWidth: brilhos animados não contam)
  const textos = [];
  for (const el of vis) {
    const cs = getComputedStyle(el);
    const ri = el.getBoundingClientRect();
    const box = {
      l: ri.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft),
      r: ri.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight),
      t: ri.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop),
      b: ri.bottom - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingBottom),
    };
    const clipX = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
    let maxR = -Infinity;
    let maxB = -Infinity;
    for (const no of el.childNodes) {
      if (no.nodeType !== 3 || !no.textContent.trim()) continue;
      const rg = document.createRange();
      rg.selectNodeContents(no);
      for (const q of rg.getClientRects()) {
        maxR = Math.max(maxR, q.right);
        maxB = Math.max(maxB, q.bottom);
      }
    }
    if (maxR === -Infinity) continue;
    if (maxR > box.r + 1.5) {
      const tipo = clipX ? 'texto cortado' : 'texto sai da caixa';
      textos.push(`${nome(el)} ${tipo} na largura (${Math.round(maxR - box.r)}px além)`);
    }
    if (maxB > box.b + 1.5) textos.push(`${nome(el)} texto sai da altura (${Math.round(maxB - box.b)}px além)`);
  }
  const reticencias = vis.filter((el) => getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 2).map((el) => `${nome(el)} (${el.scrollWidth} > ${el.clientWidth})`);

  return { fora, cortados, rolagemH, rolagemV, textos, reticencias };
}

// ---------------------------------------------------------------- varredura
const resultados = [];
const errosVistos = new Set();
if (PASTA_CAPTURAS) mkdirSync(PASTA_CAPTURAS, { recursive: true });

const telas = TELAS.filter((t) => !FILTRO.length || FILTRO.some((f) => t.id.includes(f)));

for (const tamanho of TAMANHOS) {
  for (const tela of telas) {
    const contexto = await navegador.newContext({ viewport: { width: tamanho.w, height: tamanho.h } });
    const p = await contexto.newPage();
    const erros = [];
    p.on('pageerror', (e) => erros.push(`erro de página: ${e.message}`));
    p.on('console', (m) => {
      if (m.type() === 'error') erros.push(`console: ${m.text()}`);
    });
    const rotulo = `${tela.id} @ ${tamanho.w}x${tamanho.h}`;
    try {
      await p.goto(URL_JOGO, { waitUntil: 'load', timeout: 120000 });
      await p.waitForFunction(() => !!window.__vg, null, { timeout: 120000 });
      await p.waitForSelector('.mm-hot', { timeout: 60000 });
      await tela.abrir(p);
      await p.waitForTimeout(900); // animações de entrada (≤ 0,3 s) e fontes
      const med = await p.evaluate(medirNaPagina);
      if (PASTA_CAPTURAS) {
        await p.screenshot({ path: join(PASTA_CAPTURAS, `${tela.id}-${tamanho.w}x${tamanho.h}.png`), timeout: 240000 });
      }
      resultados.push({ rotulo, tela: tela.nome, tamanho, ...med, erros });
    } catch (err) {
      resultados.push({ rotulo, tela: tela.nome, tamanho, fora: [], cortados: [], rolagemH: 0, textos: [], reticencias: [], erros, falha: String(err.message ?? err) });
    } finally {
      await contexto.close();
    }
  }
}
await navegador.close();

// ---------------------------------------------------------------- relatório no terminal
let problemas = 0;
let errosNovos = 0;
console.log(`\nVarredura de layout — ${URL_JOGO}`);
console.log('tela'.padEnd(36) + 'tamanho'.padEnd(12) + 'fora  cortado  rolagemH  texto  reticências');
for (const r of resultados) {
  const linha = `${r.tela}`.slice(0, 35).padEnd(36) + `${r.tamanho.w}x${r.tamanho.h}`.padEnd(12);
  const rolH = r.rolagemH > 1 ? r.rolagemH : 0;
  const nums = `${r.fora.length}`.padEnd(6) + `${r.cortados.length}`.padEnd(9) + `${rolH}`.padEnd(9) + `${r.textos.length}`.padEnd(7) + `${r.reticencias.length}`;
  console.log(linha + nums + (r.falha ? `  FALHA: ${r.falha}` : ''));
  problemas += r.fora.length + r.cortados.length + (rolH ? 1 : 0) + r.textos.length + (r.falha ? 1 : 0);
  for (const f of r.fora) console.log(`    (a) ${f}`);
  for (const c of r.cortados) console.log(`    (b) ${c}`);
  if (rolH) console.log(`    (c) página com rolagem horizontal de ${rolH}px`);
  if (r.rolagemV > 1) console.log(`    (i) página rola na vertical ${r.rolagemV}px (conferir se a tela cabe)`);
  for (const t of r.textos) console.log(`    (d) ${t}`);
  for (const t of r.reticencias) console.log(`    (i) reticências: ${t}`);
  for (const e of r.erros) {
    const chave = `${r.tela}|${e}`;
    if (!errosVistos.has(chave)) {
      errosVistos.add(chave);
      errosNovos++;
      console.log(`    (erro) ${e.slice(0, 220)}`);
    }
  }
}
console.log(`\nTotal: ${problemas} problema(s) de layout, ${errosNovos} erro(s) de console/página distintos.`);
process.exit(problemas || errosNovos ? 1 : 0);
