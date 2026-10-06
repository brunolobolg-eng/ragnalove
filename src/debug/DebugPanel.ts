/**
 * Painel de DEBUG (somente build de desenvolvimento).
 *
 * Carregado por `import()` dinâmico dentro de `if (import.meta.env.DEV)` em main.ts:
 * no build de produção (Steam) o Vite troca DEV por `false`, o bloco some e este
 * arquivo nem entra no pacote.
 *
 * Regra: nenhum comando aqui tem lógica própria — todos chamam as funções públicas
 * do jogo recebidas em `DevApi` (as mesmas usadas pela HUD, pela onda e pelo save).
 */
import * as THREE from 'three';
import { RARITIES, RARITY_INFO, SLOTS, SLOT_LABEL, type Rarity, type Slot } from '../core/progression/equipment';

export type FxName = 'fireBarrier' | 'cleave' | 'frostBolt' | 'bash' | 'soul' | 'levelup' | 'drop';

export interface DevApi {
  heroes: readonly string[];
  heroLine(kind: string): string;
  souls(): number;
  zeni(): number;
  inventorySize(): number;
  /** false quando a onda está rodando (progressão só muda entre ondas). */
  canEditProgression(): boolean;
  addExperience(kind: string, amount: number): void;
  setLevel(kind: string, level: number): void;
  resetLevel(kind: string): void;
  addAttributePoints(kind: string, n: number): void;
  resetAttributes(kind: string): void;
  setLuck(kind: string, value: number): void;
  addSouls(n: number): void;
  addZeni(n: number): void;
  clearSouls(): void;
  createItem(rarity: Rarity, slot?: Slot): void;
  clearInventory(): void;
  spawnEnemies(n: number): number;
  spawnKind(kind: string): boolean;
  /** Ajustes 8: spawn forçado num portal, dano/vida da cidade e objetos do mapa. */
  spawnAt(point: number, kind: string): boolean;
  cityDamage(n: number): void;
  setCityHp(n: number): void;
  useAllObjects(): void;
  triggerObjects(): void;
  cityLine(): string;
  startWave(): void;
  skipWave(): void;
  restartWave(): void;
  killAllEnemies(): number;
  cheats: { invincible: boolean; noCooldowns: boolean };
  applyCheats(): void;
  setSpeed(s: number): void;
  forceFx(name: FxName): void;
  /** Pior caso (100 zumbis + magias) em cada preset; aplica o recomendado. */
  benchmark(progress: (msg: string) => void): Promise<{ results: { preset: string; avg: number; low1: number }[]; recommended: string }>;
  stats(): { fps: number; particles: number; lights: number; enemies: number; tick: number; phase: string };
  /** Custo do campo de fluxo por tile (Infinity = inalcançável), ou undefined fora de onda. */
  flowCost(x: number, y: number): number | undefined;
  boardSize(): { w: number; h: number };
  occupants(): { x: number; y: number; team: 'party' | 'enemy' }[];
  tileToScreen(x: number, y: number): { x: number; y: number; visible: boolean };
  /** Marca tiles no overlay de grade do jogo (cores aditivas). */
  setOverlayHook(fn: ((mark: (tiles: { x: number; y: number }[], color: THREE.Color, strength: number) => void) => void) | undefined): void;
  log(text: string): void;
  /** Comandos da run (Ajustes 7). */
  run: {
    skillPoints(kind: string, n: number): void;
    unlockTree(kind: string): void;
    nextPhase(): void;
    jumpAct(act: number): void;
    refine(kind: string, level: number): void;
    line(): string;
  };
}

const ICON_BUG = `<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="13.5" rx="5" ry="6.5" fill="currentColor"/><circle cx="12" cy="6" r="2.6" fill="currentColor"/><path d="M4 9l3.5 2M20 9l-3.5 2M3.5 14h3.5M20.5 14H17M4.5 19.5l3-2M19.5 19.5l-3-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const HOTKEY = 'F9';

const RARITY_DOT: Record<Rarity, string> = { common: 'cinza', uncommon: 'verde', rare: 'azul', epic: 'roxo', legendary: 'dourado', mythic: 'vermelho' };

export function installDebug(root: HTMLElement, api: DevApi, addBarButton: (html: string, title: string, onClick: () => void) => void): void {
  const panel = document.createElement('div');
  panel.className = 'win debug-win';
  panel.hidden = true;
  const heroOpts = api.heroes.map((k) => `<option value="${k}">${{ mage: 'Mago', warrior: 'Guerreiro', archer: 'Arqueira' }[k]}</option>`).join('');
  panel.innerHTML = `
    <div class="win-title"><span>Debug · ${HOTKEY}</span><span class="dbg-dev">DEV</span><button class="x" data-close>×</button></div>
    <div class="win-body">
      <section><h4>Herói</h4>
        <div class="dbg-row"><select data-hero>${heroOpts}</select><span class="dbg-line" data-heroline></span></div>
        <div class="dbg-row"><button data-cmd="exp" data-n="50">+50 EXP</button><button data-cmd="exp" data-n="500">+500 EXP</button>
          <input type="number" min="1" max="99" value="10" data-level><button data-cmd="setLevel">Definir nível</button><button data-cmd="resetLevel">Resetar nível</button></div>
        <div class="dbg-row"><button data-cmd="points" data-n="5">+5 pontos</button><button data-cmd="resetAttrs">Resetar distribuição</button>
          <input type="number" min="0" max="200" value="30" data-luck><button data-cmd="luck">Definir Sorte</button></div>
        <small class="dbg-lock" data-lock hidden>Progressão só muda entre ondas (reinicie a onda).</small>
      </section>
      <section><h4>Almas e equipamentos</h4>
        <div class="dbg-row"><button data-cmd="souls" data-n="100">+100 almas</button><button data-cmd="clearSouls">Zerar almas</button><span class="dbg-line" data-souls></span></div>
        <div class="dbg-row"><button data-cmd="zeni" data-n="1000">+1000 Zen</button><button data-cmd="zeni" data-n="-999999">Zerar Zen</button></div>
        <div class="dbg-row"><select data-slot><option value="">Slot aleatório</option>${SLOTS.map((s) => `<option value="${s}">${SLOT_LABEL[s]}</option>`).join('')}</select>
          ${RARITIES.map((r) => `<button data-cmd="item" data-rarity="${r}" style="--rc:${RARITY_INFO[r].color}" class="rar">${RARITY_INFO[r].label} <small>(${RARITY_DOT[r]})</small></button>`).join('')}</div>
        <div class="dbg-row"><button data-cmd="clearInv">Limpar inventário</button><span class="dbg-line" data-inv></span></div>
      </section>
      <section><h4>Run</h4>
        <div class="dbg-row"><span class="dbg-line" data-runline></span></div>
        <div class="dbg-row"><button data-cmd="skillPts" data-n="5">+5 pts habilidade</button><button data-cmd="unlockTree">Liberar árvore (máx.)</button>
          <button data-cmd="refine" data-n="5">Refino +5 (equipados)</button><button data-cmd="refine" data-n="9">Refino +9</button></div>
        <div class="dbg-row"><button data-cmd="nextPhase">Pular para a próxima fase</button>${[0, 1, 2].map((a) => `<button data-cmd="jumpAct" data-n="${a}">Ir ao Ato ${['I', 'II', 'III'][a]}</button>`).join('')}</div>
      </section>
      <section><h4>Combate</h4>
        <div class="dbg-row"><button data-cmd="start">Iniciar onda</button><button data-cmd="skip">Pular onda</button><button data-cmd="restart">Reiniciar onda</button></div>
        <div class="dbg-row"><button data-cmd="spawn" data-n="1">Spawnar 1</button><button data-cmd="spawn" data-n="10">Spawnar 10</button><button data-cmd="spawn" data-n="100">Spawnar 100</button><button data-cmd="kill">Matar todos</button>
          <button data-cmd="boss">Spawnar chefe</button><select data-kind><option value="grunt">comum</option><option value="runner">rápido</option><option value="brute">pesado</option><option value="necro">necromante</option><option value="elite">elite</option><option value="boss">Colosso</option><option value="boss2">Colosso Solar</option><option value="orcboss">Senhor Orc</option></select><button data-cmd="spawnKind">Spawnar tipo</button></div>
        <div class="dbg-row"><label><input type="checkbox" data-cheat="invincible"> Invencível</label><label><input type="checkbox" data-cheat="noCooldowns"> Sem recarga</label></div>
      </section>
      <section><h4>Mapa e cidade</h4>
        <div class="dbg-row"><span class="dbg-line" data-cityline></span></div>
        <div class="dbg-row"><button data-cmd="spawnAt" data-n="0">Spawnar no portal 1</button><button data-cmd="spawnAt" data-n="1">Spawnar no portal 2</button><span>(tipo do seletor acima)</span></div>
        <div class="dbg-row"><button data-cmd="cityDmg" data-n="50">Cidade −50</button><button data-cmd="cityDmg" data-n="200">Cidade −200</button><button data-cmd="cityHp" data-n="1000">Cidade cheia</button><button data-cmd="cityHp" data-n="150">Cidade em 150</button></div>
        <div class="dbg-row"><button data-cmd="useObjs">Usar todos os objetos (planejamento)</button><button data-cmd="trigObjs">Disparar gatilhos dos objetos</button></div>
      </section>
      <section><h4>Tempo</h4>
        <div class="dbg-row">${[0, 1, 2, 4, 8].map((s) => `<button data-speed="${s}">${s === 0 ? 'Pausa' : `x${s}`}</button>`).join('')}</div>
      </section>
      <section><h4>Visual</h4>
        <div class="dbg-row"><button data-cmd="bench">Benchmark de pior caso (≈30 s)</button><span class="dbg-line" data-bench></span></div>
        <div class="dbg-row"><label><input type="checkbox" data-view="grid"> Grade + custos</label><label><input type="checkbox" data-view="hitbox"> Hitboxes</label><label><input type="checkbox" data-view="stats" checked> FPS / partículas / luzes</label></div>
        <div class="dbg-row">${(
          [
            ['fireBarrier', 'Barreira'],
            ['cleave', 'Golpe em Área'],
            ['frostBolt', 'Raio Gélido'],
            ['bash', 'Investida'],
            ['soul', 'Alma'],
            ['levelup', 'Level up'],
            ['drop', 'Drop'],
          ] as const
        )
          .map(([k, l]) => `<button data-fx="${k}">${l}</button>`)
          .join('')}</div>
      </section>
    </div>`;
  root.appendChild(panel);

  const statsEl = document.createElement('div');
  statsEl.className = 'dbg-stats';
  root.appendChild(statsEl);
  const costs = document.createElement('canvas');
  costs.className = 'dbg-costs';
  root.appendChild(costs);

  const q = <T extends HTMLElement>(s: string) => panel.querySelector<T>(s)!;
  const hero = () => q<HTMLSelectElement>('[data-hero]').value;
  const view = { grid: false, hitbox: false, stats: true };

  const toggle = () => {
    panel.hidden = !panel.hidden;
    refresh();
  };
  addBarButton(ICON_BUG, `Debug (${HOTKEY}) — só em desenvolvimento`, toggle);
  q('[data-close]').addEventListener('click', toggle);
  window.addEventListener('keydown', (e) => {
    if (e.key === HOTKEY) {
      e.preventDefault();
      toggle();
    }
  });

  function refresh(): void {
    q('[data-heroline]').textContent = api.heroLine(hero());
    q('[data-souls]').textContent = `${api.souls()} almas · ${api.zeni()} Zen`;
    q('[data-runline]').textContent = api.run.line();
    q('[data-inv]').textContent = `${api.inventorySize()} itens no inventário`;
    q('[data-cityline]').textContent = api.cityLine();
    const editable = api.canEditProgression();
    q('[data-lock]').hidden = editable;
    panel.querySelectorAll<HTMLButtonElement>('[data-cmd="exp"],[data-cmd="setLevel"],[data-cmd="resetLevel"],[data-cmd="points"],[data-cmd="resetAttrs"],[data-cmd="luck"]').forEach((b) => (b.disabled = !editable));
  }
  q('[data-hero]').addEventListener('change', refresh);

  panel.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b || b.disabled) return;
    const k = hero();
    const n = Number(b.dataset.n ?? 0);
    switch (b.dataset.cmd) {
      case 'exp':
        api.addExperience(k, n);
        break;
      case 'setLevel':
        api.setLevel(k, Number(q<HTMLInputElement>('[data-level]').value));
        break;
      case 'resetLevel':
        api.resetLevel(k);
        break;
      case 'points':
        api.addAttributePoints(k, n);
        break;
      case 'resetAttrs':
        api.resetAttributes(k);
        break;
      case 'luck':
        api.setLuck(k, Number(q<HTMLInputElement>('[data-luck]').value));
        break;
      case 'souls':
        api.addSouls(n);
        break;
      case 'zeni':
        api.addZeni(n);
        break;
      case 'skillPts':
        api.run.skillPoints(k, n);
        break;
      case 'unlockTree':
        api.run.unlockTree(k);
        break;
      case 'refine':
        api.run.refine(k, n);
        break;
      case 'nextPhase':
        api.run.nextPhase();
        break;
      case 'jumpAct':
        api.run.jumpAct(n);
        break;
      case 'clearSouls':
        api.clearSouls();
        break;
      case 'item':
        api.createItem(b.dataset.rarity as Rarity, (q<HTMLSelectElement>('[data-slot]').value || undefined) as Slot | undefined);
        break;
      case 'clearInv':
        api.clearInventory();
        break;
      case 'start':
        api.startWave();
        break;
      case 'skip':
        api.skipWave();
        break;
      case 'restart':
        api.restartWave();
        break;
      case 'spawn':
        api.log(`[debug] ${api.spawnEnemies(n)} inimigo(s) na fila de spawn.`);
        break;
      case 'boss':
        api.log(api.spawnKind('boss') ? '[debug] Chefe spawnado.' : '[debug] Sem espaço na linha de spawn.');
        break;
      case 'spawnKind':
        api.spawnKind(q<HTMLSelectElement>('[data-kind]').value);
        break;
      case 'spawnAt':
        if (!api.spawnAt(n, q<HTMLSelectElement>('[data-kind]').value)) api.log('[debug] Portal ocupado.');
        break;
      case 'cityDmg':
        api.cityDamage(n);
        break;
      case 'cityHp':
        api.setCityHp(n);
        break;
      case 'useObjs':
        api.useAllObjects();
        break;
      case 'trigObjs':
        api.triggerObjects();
        break;
      case 'bench': {
        b.disabled = true;
        const el = q('[data-bench]');
        void api
          .benchmark((m) => (el.textContent = m))
          .then((r) => {
            b.disabled = false;
            el.textContent = `Recomendado: ${r.recommended}`;
            api.log('[debug] Benchmark (100 zumbis + magias):');
            for (const x of r.results) api.log(`  ${x.preset}: ${x.avg.toFixed(0)} FPS médio · 1% baixo ${x.low1.toFixed(0)}`);
            api.log(`[debug] Preset aplicado: ${r.recommended}.`);
          });
        break;
      }
      case 'kill':
        api.log(`[debug] ${api.killAllEnemies()} inimigo(s) mortos.`);
        break;
    }
    if (b.dataset.speed !== undefined) {
      api.setSpeed(Number(b.dataset.speed));
      panel.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b));
    }
    if (b.dataset.fx) api.forceFx(b.dataset.fx as FxName);
    refresh();
  });
  panel.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.cheat) {
      api.cheats[el.dataset.cheat as 'invincible' | 'noCooldowns'] = el.checked;
      api.applyCheats();
    }
    if (el.dataset.view) {
      view[el.dataset.view as keyof typeof view] = el.checked;
      updateHook();
    }
  });

  // ---- grade / hitboxes: marcam o overlay de tiles do próprio jogo ----
  const C_GRID = new THREE.Color(0.18, 0.18, 0.22);
  const C_PARTY = new THREE.Color(0.1, 0.5, 1.0);
  const C_ENEMY = new THREE.Color(1.0, 0.15, 0.1);
  function updateHook(): void {
    if (!view.grid && !view.hitbox) return api.setOverlayHook(undefined);
    api.setOverlayHook((mark) => {
      const { w, h } = api.boardSize();
      if (view.grid) {
        const all: { x: number; y: number }[] = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) all.push({ x, y });
        mark(all, C_GRID, 1);
      }
      if (view.hitbox) for (const o of api.occupants()) mark([o], o.team === 'party' ? C_PARTY : C_ENEMY, 0.9);
    });
  }

  // ---- números de custo do pathfinding + leitura de desempenho (1x por frame) ----
  const g = costs.getContext('2d')!;
  let frames = 0;
  const loop = () => {
    const s = api.stats();
    statsEl.hidden = !view.stats;
    if (view.stats) statsEl.textContent = `${Math.round(s.fps)} FPS · partículas ${s.particles} · luzes ${s.lights} · inimigos ${s.enemies} · tick ${s.tick} · ${s.phase}`;
    const dpr = window.devicePixelRatio || 1;
    if (costs.width !== innerWidth * dpr || costs.height !== innerHeight * dpr) {
      costs.width = innerWidth * dpr;
      costs.height = innerHeight * dpr;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    if (view.grid) {
      const { w, h } = api.boardSize();
      g.font = '10px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const p = api.tileToScreen(x, y);
          if (!p.visible) continue;
          const c = api.flowCost(x, y);
          const txt = c === undefined ? `${x},${y}` : Number.isFinite(c) ? String(Math.round(c)) : '∞';
          g.fillStyle = 'rgba(0,0,0,0.55)';
          g.fillRect(p.x - 13, p.y - 6, 26, 12);
          g.fillStyle = c === undefined ? '#9fb3d9' : c >= 150 ? '#ff8a5c' : '#e6f0ff';
          g.fillText(txt, p.x, p.y);
        }
    }
    if (!panel.hidden && ++frames % 15 === 0) refresh(); // mantém EXP/almas atualizados durante a onda
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  api.log(`[debug] Painel de debug disponível (${HOTKEY}).`);
}
