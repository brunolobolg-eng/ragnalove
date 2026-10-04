import * as THREE from 'three';
import { DEFAULT_SETUP, GAME_CONFIG, ZONE_STATE, applyZone, barriersShield, type PartySetup, type WaveOptions } from './config/gameConfig';
import { parseZone, type ZoneDef } from './config/zones';
import { ACTS, EVENTS, REGION_BY_ID, NODE_LABEL, type NodeType } from './config/world';
import {
  HEROES,
  HERO_NAME,
  nextUnlock,
  unlockHero,
  advance,
  applyEventEffects,
  battleFor,
  currentAct,
  currentNode,
  currentRegion,
  isCombat,
  migrateRun,
  newRun,
  phaseNumber,
  pickEvent,
  revive,
  reviveCost,
  survivalRewards,
  makeItem,
  starterGift,
  bossMythicReward,
  totalPhases,
  recordNight,
  objectActions,
  useMapObject,
  type RunState,
} from './core/run/run';
import { OBJECT_RULES } from './core/sim/objects';
import { NightReport, type NightReportVM } from './ui/WaveReport';
import { CHARSELECT_ART, MUSIC, POSTFX, VISUAL_CONFIG } from './config/visualConfig';
import type { PostFxSituation } from './render/fx/kit/PostFX';
import type { WaveReport } from './core/sim/types';
import { SKILL_BY_ID, SKILL_NUM, SKILLS, lvOf, type HeroKind, type SkillId } from './core/progression/skills';
import { WorldMap, PORTRAITS } from './ui/WorldMap';
import { CharSelect } from './ui/CharSelect';
import { CityScreen } from './ui/CityScreen';
import { SkillTree } from './ui/SkillTree';
import { Modal, paintEventArt } from './ui/RunScreens';
import { SKILL_ICONS } from './ui/icons';
import { maxRefine, itemName, type Item } from './core/progression/equipment';
import { Roulette } from './ui/Roulette';
import { conePattern, linePattern } from './core/grid/patterns';
import { ORIENTATIONS, type Orientation, type Vec2 } from './core/grid/types';
import { Simulation } from './core/sim/Simulation';
import type { SimEvent, Unit } from './core/sim/types';
import { GameView } from './render/GameView';
import { Stage } from './render/Stage';
import { Hud, type CharacterVM, type HudMember, type Tool } from './ui/Hud';
import { ATTRIBUTES_CONFIG, weaponMult } from './core/progression/attributes';
import { RARITY_INFO, SLOTS, SLOT_LABEL, gearBonus, isMagicWeapon, itemKind } from './core/progression/equipment';
import { itemIconUrl } from './ui/itemArt';
import type { HeroCardVM } from './ui/HeroCard';
import {
  PROGRESSION,
  addPoint,
  applyWaveResult,
  autoEquip,
  attrPointCost,
  spentPoints,
  addZeni,
  equip,
  expToNext,
  heroStats,
  heroEquipped,
  heroLockedKeys,
  unequip,
  addExperience,
  setLevel,
  resetLevel,
  addAttributePoints,
  resetAttributes,
  setAttribute,
  addSouls,
  clearSouls,
  addItem,
  clearInventory,
  type Profile,
} from './core/progression/profile';
import { rollItem } from './core/progression/equipment';
import { Rng } from './core/sim/rng';
import { tileToWorld } from './render/coords';
import type { DevApi } from './debug/DebugPanel';
import type { DevLabApi } from './dev/DevLab/DevLab';
import { DEV_MODE } from './dev/devConfig';
import { neutralMods } from './core/sim/RangeSystem';
import { REFINE, WEAPON_USERS } from './core/progression/equipment';
import type { HeroLoadout } from './core/sim/Simulation';
import { slotCount } from './core/progression/skillSlots';
import { MainMenu, type MenuState } from './ui/menu/MainMenu';
import { legendsFrom } from './ui/menu/HallOfLegends';
import { emptyRecords, updateRecords, type Records } from './core/run/records';
import { SaveStore, type SaveKey } from './save/SaveStore';
import type { BattleSeal } from './core/run/run';
import { SettingsStore, graphicsFrom } from './settings/Settings';
import { AudioEngine, type SfxName } from './audio/AudioEngine';
import { SettingsPanels } from './ui/SettingsPanels';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { ParticleSystem } from './render/fx/Particles';
import { VFXManager } from './render/fx/vfx/VFXManager';
import { UNIT_STYLE } from './render/units/createUnitView';
import { ModelUnitView } from './render/units/model/ModelUnitView';
import { BoardView } from './render/BoardView';
import { loadBossModel } from './render/units/model/bossLoader';
import { loadMonsterModels } from './render/units/model/glbMonsters';
import { VFX } from './render/fx/kit/vfxSettings';
import { QUALITY_LABEL, type QualityPreset } from './settings/Settings';
import { applyOverrides } from './editor/overrides';
import { HERO_INFO, HERO_ORDER, emptyMeta, heroUnlocked, isHeroKind, type MetaStats } from './config/heroes';
import { BALANCE_OVERRIDES } from './config/balance';

// ---------- Balanceamento salvo pelo Game Editor (vale em todos os builds) ----------
applyOverrides(BALANCE_OVERRIDES);

// ---------- Configurações do jogador + áudio ----------
const settings = new SettingsStore();
const audio = new AudioEngine();

// ---------- Menu principal (jogo offline: sem login) — criado depois dos painéis, abaixo ----------
const hudRoot = document.getElementById('hud')!;
hudRoot.style.visibility = 'hidden';
audio.setVolumes(settings.value.audio);
audio.playMenuMusic(MUSIC.menu);

// ---------- Run (jornada de 3 atos) salva localmente ----------
const RUN_KEY: SaveKey = 'run';
const META_KEY: SaveKey = 'meta';
function loadRun(): RunState | undefined {
  try {
    const raw = SaveStore.get(RUN_KEY);
    if (raw) {
      const r = JSON.parse(raw) as RunState;
      if (r && r.version === 1 && r.profile?.heroes?.warrior && !r.ended) return migrateRun(r);
    }
  } catch {
    /* sem storage: joga sem salvar */
  }
  return undefined;
}
/** Itens já vistos: só os NOVOS entram no equipar automático (o que o jogador desequipa fica quieto). */
let seenItems: Set<string> | undefined;
function markSeen(): Set<string> {
  const s = (seenItems ??= new Set());
  for (const it of profile.inventory) s.add(it.id);
  for (const h of Object.values(profile.heroes)) for (const it of Object.values(h.equipment)) if (it) s.add(it.id);
  return s;
}
function autoGear(): void {
  if (!seenItems) {
    markSeen();
    return;
  }
  const fresh = profile.inventory.filter((it) => !seenItems!.has(it.id));
  if (!fresh.length) return;
  const swaps = autoEquip(profile, run.party, fresh);
  markSeen();
  if (!swaps.length) return;
  for (const s of swaps) hud.log(`⚔ ${NAME_PT[s.hero as HeroKind]} equipou ${itemName(s.item)} automaticamente.`, 'good');
  hud.setCharacter(characterVM());
}
function saveProfile(): void {
  autoGear();
  try {
    SaveStore.set(RUN_KEY, JSON.stringify(run));
  } catch {
    /* ignora */
  }
}
/** Conquistas entre jornadas (liberam as classes avançadas) — no mesmo save do jogador. */
function loadMetaStats(): MetaStats {
  try {
    const m = JSON.parse(SaveStore.get(META_KEY) ?? '{}') as { wins?: number; stats?: Partial<MetaStats> };
    return { ...emptyMeta(), ...m.stats, runsWon: m.wins ?? 0, bossesKilled: { ...(m.stats?.bossesKilled ?? {}) } };
  } catch {
    return emptyMeta();
  }
}
function saveMetaStats(st: MetaStats): void {
  try {
    const m = JSON.parse(SaveStore.get(META_KEY) ?? '{}') as Record<string, unknown>;
    m.stats = { kills: st.kills, perfectNights: st.perfectNights, bossesKilled: st.bossesKilled };
    SaveStore.set(META_KEY, JSON.stringify(m));
  } catch {
    /* ignora */
  }
}
/** Heróis que a conta já desbloqueou. */
function availableHeroes(): HeroKind[] {
  const m = loadMetaStats();
  return HERO_ORDER.filter((k) => heroUnlocked(k, m));
}
function saveMeta(result: 'defeat' | 'victory'): void {
  try {
    const m = JSON.parse(SaveStore.get(META_KEY) ?? '{}') as { runs?: number; wins?: number; best?: number };
    m.runs = (m.runs ?? 0) + 1;
    if (result === 'victory') m.wins = (m.wins ?? 0) + 1;
    m.best = Math.max(m.best ?? 0, phaseNumber(run));
    SaveStore.set(META_KEY, JSON.stringify(m));
  } catch {
    /* ignora */
  }
}
/** Recordes do Ranking da tela inicial — no mesmo save das conquistas (`best` antigo vira a fase mais distante). */
function loadRecords(): { rec: Records; runs: number } {
  try {
    const m = JSON.parse(SaveStore.get(META_KEY) ?? '{}') as { runs?: number; best?: number; records?: Partial<Records> };
    const rec = { ...emptyRecords(), ...m.records };
    rec.farthestPhase = Math.max(rec.farthestPhase, m.best ?? 0);
    return { rec, runs: m.runs ?? 0 };
  } catch {
    return { rec: emptyRecords(), runs: 0 };
  }
}
/** Atualiza os recordes com a jornada atual (fim de onda e fim de fase). */
function noteRecords(): void {
  try {
    const m = JSON.parse(SaveStore.get(META_KEY) ?? '{}') as Record<string, unknown>;
    m.records = updateRecords(loadRecords().rec, run);
    SaveStore.set(META_KEY, JSON.stringify(m));
  } catch {
    /* ignora */
  }
}
const savedRun = loadRun();
let hasSavedRun = !!savedRun;
let run: RunState = savedRun ?? newRun();
let profile: Profile = run.profile;
markSeen();
function loadout(): Record<string, HeroLoadout> {
  const out: Record<string, HeroLoadout> = {};
  for (const k of Object.keys(profile.heroes)) {
    const h = profile.heroes[k];
    out[k] = { stats: heroStats(profile, k), level: h.level, exp: h.exp, locked: heroLockedKeys(profile, k) };
  }
  return out;
}

const C_HOVER = new THREE.Color(0.35, 0.35, 0.4);
const C_BARRIER = new THREE.Color(1.1, 0.45, 0.1);
const C_CONE = new THREE.Color(0.35, 0.55, 1.0);
const C_CLEAVE = new THREE.Color(1.2, 0.3, 0.15);
const C_BAD = new THREE.Color(0.8, 0.1, 0.1);
const C_BARRIER2 = new THREE.Color(1.2, 0.3, 0.05);
const C_CITY = new THREE.Color(1.0, 0.7, 0.2);
const C_SPAWN = new THREE.Color(0.8, 0.15, 0.7);
const C_OIL = new THREE.Color(0.9, 0.55, 0.15);
const C_WALL = new THREE.Color(0.75, 0.7, 0.6);
const C_HANDLE = new THREE.Color(1.4, 1.2, 0.5);

const stage = new Stage(document.getElementById('app')!, GAME_CONFIG.board.width, GAME_CONFIG.board.height);
const view = new GameView(stage);
view.onBossDeath = (kind) => onFinalBossDeath(kind);
// Toda mudança nas Configurações vale na hora (sem reiniciar).
UNIT_STYLE.value = settings.value.video.characters;
let lastVsync = settings.value.video.vsync;
// Chefe final importado (orc em GLB + auto-rig). Carrega enquanto o menu principal está aberto.
void loadBossModel().catch((err) => console.warn('Chefe GLB indisponível, usando o Colosso procedural.', err));
// Monstros dos Atos I e II e classes avançadas (GLB já riggados). Heróis: refaz retratos ao carregar.
void loadMonsterModels((kind) => {
  if (!isHeroKind(kind)) return;
  charSelect.refreshHero(kind);
  refreshHeroArt(kind);
  if (sim.phase !== 'running' && mode === 'battle') view.bind(sim);
});
settings.onChange((s) => {
  const g = graphicsFrom(s);
  stage.applyGraphics(g);
  ParticleSystem.density = g.particleDensity;
  VFXManager.density = g.particleDensity;
  ModelUnitView.outlines = g.preset.outlines;
  // efeitos: preset + acessibilidade ("reduzir flashes" corta brilho de impacto e aberração)
  VFX.flash = s.video.reduceFlashes ? 0.4 : 1;
  VFX.aberration = g.preset.aberration && !s.video.reduceFlashes;
  VFX.heat = g.preset.heat;
  VFX.decals = g.preset.decals;
  // V-Sync real só existe na versão desktop (o Chromium aplica ao abrir o jogo)
  if (window.vanguardaDesktop && s.video.vsync !== lastVsync) {
    lastVsync = s.video.vsync;
    void window.vanguardaDesktop.setVsync(s.video.vsync).then((now) => {
      if (!now) hud?.log('V-Sync muda ao reabrir o jogo.', 'info');
    });
  }
  BoardView.sceneryLights = g.maxLights > 0;
  view.boardView?.setSceneryLights(g.maxLights > 0);
  audio.setVolumes(s.audio);
  // Trocar 3D ↔ sprites recria as unidades (durante a onda, vale a partir da próxima).
  if (s.video.characters !== UNIT_STYLE.value) {
    UNIT_STYLE.value = s.video.characters;
    if (typeof sim !== 'undefined' && sim.phase !== 'running') view.bind(sim);
  }
});

let setup: PartySetup = structuredClone(DEFAULT_SETUP);
/** Setup efetivo: heróis caídos (não revividos) ficam fora da fase. */
function liveSetup(): PartySetup {
  const s = structuredClone(setup);
  s.members = s.members.filter((m) => run.party.includes(m.archetype) && !run.dead.includes(m.archetype));
  return s;
}
/** Índice da barreira da ferramenta selecionada (-1 = herói). */
const barrierIndex = (t: Tool) => (t === 'barrier' ? 0 : t === 'barrier2' ? 1 : t === 'barrier3' ? 2 : -1);
/** Estado da run que a onda precisa: vida da cidade e objetos já acionados nesta fase. */
function simOpts() {
  return { cityHp: run.cityHp, cityMaxHp: run.cityMaxHp, usedObjects: run.usedObjects ?? [] };
}
let sim = new Simulation(liveSetup(), undefined, loadout(), { cityHp: run.cityHp, cityMaxHp: run.cityMaxHp });
view.bind(sim);
view.onCityHit = (dmg, hp, max) => {
  hud.setCity(hp, max, sim.reachedCity);
  if (dmg > 0) audio.sfx('cityHit');
};

let tool: Tool = 'warrior';
let speed = 1;
let hover: Vec2 | undefined;
let acc = 0;

const hud = new Hud(document.getElementById('hud')!, {
  onTool: (t) => selectTool(t),
  onOrientation: (o) => {
    const bi = Math.max(0, barrierIndex(tool));
    setup.barriers[bi].orientation = o;
  },
  onRetreat: () => {
    if (sim.phase === 'running') sim.endSurvival();
  },
  onStart: () => startHorde(),
  onReset: () => {
    if (sim.phase !== 'setup') return;
    setup = withPartyMembers(structuredClone(ZONE_STATE.current.defaultSetup), ZONE_STATE.current);
    setup.wall = defaultWall(setup);
    resetSim(false);
  },
  onSpeed: (s) => (speed = s),
  onAttr: (kind, key, n) => {
    let any = false;
    for (let i = 0; i < n && addPoint(profile, kind, key); i++) any = true;
    progressionChanged(any);
  },
  onSkills: () => openSkills(),
  onEquip: (kind, id) => {
    equip(profile, kind, id);
    progressionChanged(true);
  },
  onUnequip: (kind, slot) => {
    unequip(profile, kind, slot);
    progressionChanged(true);
  },
});

const panels = new SettingsPanels(hudRoot, settings, () => audio.sfx('ui'));
const confirmBox = new ConfirmDialog(() => audio.sfx('ui'));

/** Estado que o menu principal mostra: run em andamento e recordes. */
function menuState(): MenuState {
  return {
    continueLabel: hasSavedRun && !run.ended ? `${currentAct(run).name.split(' — ')[0]} · fase ${phaseNumber(run)}/${totalPhases()}` : undefined,
    legends: (({ rec, runs }) => legendsFrom(rec, runs))(loadRecords()),
  };
}
const menu = new MainMenu({
  onStart: () => {
    audio.stopMenuMusic(); // a música do menu é só da tela inicial
    audio.unlock(); // o navegador só libera som após um gesto do jogador
    audio.preloadMusic([MUSIC.city, MUSIC.battle]);
    hudRoot.classList.remove('menu-options');
    panels.closeAll();
    hudRoot.style.visibility = '';
    if (hasSavedRun && !run.ended) {
      if (run.battle) resumeBattle(run.battle);
      else openMap();
    } else openCharSelect();
  },
  // Opções: as mesmas janelas de Áudio/Vídeo da HUD, mostradas por cima do menu
  onOptions: (id) => {
    hudRoot.classList.add('menu-options');
    panels.closeAll();
    panels.toggle(id);
  },
  onCloseOptions: () => {
    panels.closeAll();
    hudRoot.classList.remove('menu-options');
  },
  onUi: () => audio.sfx('ui'),
  state: menuState,
});

// ---------- Fluxo da run: mapa-múndi → fase (batalha/cidade/evento) → mapa ----------
type Mode = 'menu' | 'select' | 'map' | 'battle' | 'city' | 'event' | 'end';
let mode: Mode = 'menu';
const ui = () => audio.sfx('ui');
const worldMap = new WorldMap({
  onChoose: (t) => chooseNode(t),
  onCharacter: (k) => {
    if (k) hud.selectCharacter(k);
    hud.toggleCharacter(true);
  },
  onSkills: (k) => openSkills(k),
  heroCard: (k) => heroCardVM(k),
  onAbandon: () =>
    confirmBox.ask('Abandonar jornada', 'A jornada atual será encerrada e todo o progresso dos heróis nela será perdido.', 'Abandonar', () => {
      run.ended = 'defeat';
      saveMeta('defeat');
      startNewRun();
    }),
  onRevive: (k) => {
    if (revive(run, k)) {
      audio.sfx('levelup');
      saveProfile();
      openMap();
    }
  },
  onUi: ui,
});
const city = new CityScreen({
  onChange: (snd) => {
    if (snd) audio.sfx(snd);
    saveProfile();
    hud.setCharacter(characterVM());
  },
  onLeave: () => completeNode('cidade'),
  onSkills: (h) => openSkills(h),
  onCharacter: () => hud.toggleCharacter(),
});
const skillTree = new SkillTree({
  onChange: (learned) => {
    if (learned) audio.sfx('levelup');
    saveProfile();
    hud.setCharacter(characterVM());
    city.refresh();
    if (learned && mode === 'battle' && sim.phase === 'setup') resetSim(false); // slots/níveis novos já valem nesta onda
  },
  onUi: ui,
});
const charSelect = new CharSelect(
  () => {
    charSelect.close();
    returnToMenu();
  },
  ui,
  () => {
    const a = CHARSELECT_ART;
    audio.playSample(a.hoverSounds[Math.floor(Math.random() * a.hoverSounds.length)], a.hoverVolume, 1 + (Math.random() * 2 - 1) * a.hoverPitch);
  },
);
/** Arte de corpo inteiro de cada herói (renderizada do modelo 3D em refreshHeroArt). */
const FULL_BODY: Partial<Record<HeroKind, string>> = {};
// Retrato da Arqueira: renderizado do próprio modelo 3D
// Marcador da party no mapa: heróis andando, renderizados dos modelos 3D
for (const k of HERO_ORDER) refreshHeroArt(k);
/** Retrato, corpo inteiro e quadros de caminhada do herói (renderizados do modelo 3D atual). */
function refreshHeroArt(k: HeroKind): void {
  if (!PORTRAITS[k]) {
    PORTRAITS[k] = charSelect.portrait(k);
    hud.setPortrait(k, PORTRAITS[k]);
  }
  worldMap.setWalkFrames(k, charSelect.walkFrames(k));
  FULL_BODY[k] = charSelect.fullBody(k);
  hud.setFullBody(k, FULL_BODY[k]!);
}
hud.setParty(run.party, run.dead);
const resultModal = new NightReport();
const roulette = new Roulette((n) => audio.sfx(n));
const eventModal = new Modal('event');
const endModal = new Modal('end');

/** Mapa, cidade e fim cobrem a tela; o HUD de batalha some (fica a janela de personagem e as configurações). */
function setMode(m: Mode): void {
  mode = m;
  document.body.dataset.mode = m;
  // música da tela: batalha nos mapas de horda; cidade no resto da partida (o menu tem a dele)
  if (m === 'battle') audio.playMusic(MUSIC.battle, MUSIC.fadeMs);
  else if (m !== 'menu') audio.playMusic(MUSIC.city, MUSIC.fadeMs);
}

function closeOverlays(): void {
  worldMap.hide();
  charSelect.close();
  city.close();
  skillTree.close();
  resultModal.hide();
  eventModal.hide();
  endModal.hide();
}

function refreshOverlays(): void {
  if (mode === 'map') openMap(true);
  city.refresh();
}

function mapState() {
  const act = currentAct(run);
  const node = currentNode(run);
  const visited = run.history.map((h) => h.region);
  visited.push(node.region);
  return {
    act: run.act,
    node: run.node,
    phase: phaseNumber(run),
    totalPhases: totalPhases(),
    zeni: profile.zeni,
    souls: profile.souls,
    heroes: run.party.map((h) => {
      const p = profile.heroes[h];
      const wpn = p.equipment.weapon;
      return {
        kind: h,
        level: p.level,
        dead: run.dead.includes(h),
        points: p.points,
        skillPoints: p.skillPoints,
        maxHp: heroStats(profile, h).maxHp,
        weaponIcon: wpn ? itemIconUrl(wpn) : undefined,
        weaponColor: wpn ? RARITY_INFO[wpn.rarity].color : undefined,
      };
    }),
    cityHp: run.cityHp,
    cityMaxHp: run.cityMaxHp,
    visited: visited.filter((id, i) => i === 0 || visited[i - 1] !== id),
    current: node.region,
    options: node.options,
    cityName: node.city,
    reviveCost: reviveCost(run),
    actName: act.name,
  };
}

/** Janelinha do herói no mapa: equipamento, vida e status principais. */
function heroCardVM(kind: HeroKind): HeroCardVM {
  const h = profile.heroes[kind];
  const st = heroStats(profile, kind);
  const gear = gearBonus(SLOTS.map((s) => h.equipment[s]));
  const wpn = h.equipment.weapon;
  const magic = wpn ? isMagicWeapon(itemKind(wpn)) : HERO_INFO[kind].family === 'mage';
  const dead = run.dead.includes(kind);
  return {
    kind,
    level: h.level,
    dead,
    hp: dead ? 0 : st.maxHp,
    maxHp: st.maxHp,
    mana: st.mana,
    slots: `${heroEquipped(profile, kind).length}/${slotCount(kind, st.mana)}`,
    atk: magic ? gear.matk : gear.atk,
    magic,
    dodge: st.dodge,
    block: st.block,
    points: h.points,
    skillPoints: h.skillPoints,
    art: FULL_BODY[kind] ?? PORTRAITS[kind] ?? '',
    equipment: h.equipment,
  };
}

/** `redraw`: só atualiza o mapa (ex.: distribuiu um ponto) sem fechar a janela de Personagem. */
function openMap(redraw = false): void {
  const hero = mode === 'map' ? worldMap.heroOpen : undefined; // redesenho do mapa (ex.: equipou um item) mantém a janelinha
  closeOverlays();
  setMode('map');
  if (!hero && !redraw) hud.toggleCharacter(false);
  hud.setCharacter(characterVM()); // no mapa a ficha é sempre editável
  worldMap.show(mapState());
  if (hero) worldMap.openHero(hero);
}

function startNewRun(): void {
  openCharSelect();
}

/** Tela de escolha do herói inicial → nova jornada. */
function openCharSelect(): void {
  closeOverlays();
  setMode('select');
  const meta = loadMetaStats();
  audio.preloadSamples(CHARSELECT_ART.hoverSounds);
  charSelect.open((h) => {
    charSelect.close();
    run = newRun(h);
    profile = run.profile;
    hasSavedRun = true;
    claimOpen = false;
    saveProfile();
    hud.clearLog();
    hud.setParty(run.party, run.dead);
    hud.setCharacter(characterVM());
    openMap();
  }, HERO_ORDER.filter((k) => !heroUnlocked(k, meta)), meta);
}

/** Opção escolhida no nó atual do mapa. */
function chooseNode(t: NodeType): void {
  claimOpen = false; // novo contexto: só o desfecho deste nó libera conclusão
  run.choice = t;
  saveProfile();
  worldMap.hide();
  if (isCombat(t)) enterBattle(t);
  else if (t === 'city') openCity();
  else openEvent();
}

function enterBattle(t: NodeType): void {
  cinePlayed = false;
  cinePause = false;
  cinePromise = undefined;
  const { zone, wave } = battleFor(run, t);
  loadZone(zone, wave);
  setMode('battle');
  const reg = currentRegion(run);
  hud.setStage(`Fase ${phaseNumber(run)}/${totalPhases()} · ${NODE_LABEL[t]}`, `${reg.name} — ${currentAct(run).name.split(' — ')[0]}`);
  hud.clearLog();
  hud.log(`${reg.name}: ${t === 'boss' ? `${currentAct(run).bossName} aguarda no fim da horda.` : t === 'elite' ? 'um mini-chefe lidera esta horda.' : 'a horda se aproxima.'}`, 'warn');
  hud.log(`Planejamento: posicione a party e a Barreira de Fogo. A horda vem sozinha em ${GAME_CONFIG.wave.autoStartSeconds} s (Espaço inicia antes).`, 'info');
  hud.log('A horda vem em levas pelos 2 portais roxos, se espalha pelo caminho e vai para o portão da cidade (dourado). Cada inimigo que entrar desconta a vida da cidade.', 'info');
  if (sim.objects.size) hud.log('Objetos brilhando no mapa podem ser usados antes da horda (clique neles).', 'info');
  if (run.dead.length) hud.log(`${run.dead.map((h) => NAME_PT[h]).join(' e ')} está caído e não luta nesta fase.`, 'warn');
  // a câmera começa na party (o jogador pode inspecionar o mapa antes de iniciar)
  focusParty(true);
  // a horda começa sozinha após a contagem (o jogador pode iniciar antes)
  autoStartLeft = GAME_CONFIG.wave.autoStartSeconds;
}

/** Segundos que faltam para a horda começar sozinha (0 = sem contagem). */
let autoStartLeft = 0;
let lastCountShown = 0;
/** Contagem regressiva do planejamento: corre em tempo real (pausa com janelas abertas) e inicia a horda no zero. */
function tickAutoStart(dt: number, paused: boolean): void {
  if (mode !== 'battle' || sim.phase !== 'setup') autoStartLeft = 0;
  if (autoStartLeft > 0 && !paused && !menu.active) {
    autoStartLeft = Math.max(0, autoStartLeft - dt);
    if (autoStartLeft === 0) startHorde();
  }
  const n = autoStartLeft > 0 ? Math.ceil(autoStartLeft) : 0;
  if (n === lastCountShown) return;
  if (n > 0 && n <= 3) audio.sfx('ui'); // tique nos últimos segundos
  lastCountShown = n;
  hud.setCountdown(n);
}

/**
 * Inicia a horda e grava o selo de batalha (formação + status com que a onda começou).
 * Fechar o jogo ou voltar ao menu no meio não descarta mais a onda: ela recomeça igual (resumeBattle).
 */
function startHorde(): void {
  if (sim.phase !== 'setup') return;
  autoStartLeft = 0;
  if (mode === 'battle' && run.choice) {
    run.battle = { act: run.act, node: run.node, choice: run.choice, setup: structuredClone(sim.setup), loadout: loadout() };
    // a formação fica salva para as próximas hordas (a última e a desta zona)
    run.lastLayout = structuredClone(setup);
    run.layouts = { ...run.layouts, [ZONE_STATE.current.id]: structuredClone(setup) };
    SaveStore.set(RUN_KEY, JSON.stringify(run));
  }
  sim.start();
  hud.log('A horda se aproxima!', 'warn');
  hud.setPlanning(false);
}

/** Batalha interrompida (jogo fechado/queda/menu no meio da onda): recomeça do zero com o selo, travada. */
function resumeBattle(seal: BattleSeal): void {
  if (seal.act !== run.act || seal.node !== run.node) {
    run.battle = undefined;
    saveProfile();
    return openMap();
  }
  run.choice = seal.choice;
  enterBattle(seal.choice);
  setup = structuredClone(seal.setup);
  resetSim(false, seal);
  focusParty(true);
  hud.log('A batalha foi interrompida e recomeça do início, com a mesma formação.', 'warn');
  sim.start();
  hud.setPlanning(false);
}

// Ao fechar a janela (X, ALT+F4): grava o relógio da jornada. Queda/travamento não passa por aqui —
// por isso o selo de batalha já está no disco desde o início da horda.
window.addEventListener('beforeunload', () => {
  if (hasSavedRun) SaveStore.set(RUN_KEY, JSON.stringify(run));
});

/** Centraliza a câmera na party. */
function focusParty(immediate = false): void {
  const ms = setup.members.filter((m) => run.party.includes(m.archetype) && !run.dead.includes(m.archetype));
  if (!ms.length) return;
  const c = new THREE.Vector3();
  for (const m of ms) c.add(tileToWorld(m.x, m.y));
  c.divideScalar(ms.length);
  c.z -= 3; // um pouco à frente: mostra por onde a horda chega
  stage.setFocus(c, immediate);
}

/** Troca a zona ativa: grade, cenário, atmosfera e setup padrão. */
function loadZone(zone: ZoneDef, wave: WaveOptions): void {
  const themeChanged = ZONE_STATE.current.id !== zone.id;
  applyZone(zone, wave);
  stage.applyTheme(zone.theme);
  stage.setPainted(!!zone.painted);
  audio.setAmbience(zone.theme);
  if (themeChanged || !view.boardView) view.rebuildBoard();
  run.usedObjects ??= [];
  const base = withPartyMembers(structuredClone(zone.defaultSetup), zone);
  if (run.party.length === 1 && run.party[0] === 'mage') {
    const m = base.members.find((mm) => mm.archetype === 'mage')!;
    base.barriers = barriersShield(m.x, m.y);
  }
  base.wall = defaultWall(base);
  // a formação do jogador vale entre as hordas: a última usada (se couber neste mapa) ou a desta zona
  setup = savedLayout(zone, base) ?? base;
  tool = run.party[0];
  resetSim(false);
}

/**
 * Formação salva do jogador adaptada à zona: heróis e barreiras só em chão livre deste mapa
 * (o que não couber volta ao lugar padrão). Undefined = nada salvo que sirva.
 */
function savedLayout(zone: ZoneDef, base: PartySetup): PartySetup | undefined {
  const pz = parseZone(zone);
  const floor = new Set(pz.floor.map((f) => `${f.x},${f.y}`));
  const fits = (l: PartySetup) => l.members.filter((m) => run.party.includes(m.archetype as HeroKind)).every((m) => floor.has(`${m.x},${m.y}`));
  const pick = [run.lastLayout, run.layouts?.[zone.id]].find((l) => l && fits(l));
  if (!pick) return undefined;
  const out = structuredClone(pick);
  out.members = out.members.filter((m) => run.party.includes(m.archetype as HeroKind));
  for (const m of base.members) if (!out.members.some((o) => o.archetype === m.archetype)) out.members.push({ ...m });
  out.barriers = base.barriers.map((b, i) => {
    const s = out.barriers[i];
    return s && floor.has(`${s.x},${s.y}`) ? s : b;
  });
  if (!out.wall || !floor.has(`${out.wall.x},${out.wall.y}`)) out.wall = base.wall;
  // dois heróis no mesmo tile (o padrão de quem entrou caiu em cima de alguém): usa o padrão
  const tiles = out.members.map((m) => `${m.x},${m.y}`);
  return new Set(tiles).size === tiles.length ? out : undefined;
}

/** Muralha padrão: duas casas à frente do Guerreiro. */
function defaultWall(s: PartySetup): PartySetup['wall'] {
  const wm = s.members.find((mm) => mm.archetype === 'warrior');
  return wm ? { x: wm.x, y: wm.y - 2, orientation: 'H' } : undefined;
}

/** Heróis da party que não estão no setup padrão da zona entram em tiles livres perto do grupo. */
function withPartyMembers(s: PartySetup, zone: ZoneDef): PartySetup {
  // a classe inicial ocupa o lugar padrão da classe-base da mesma família (ex.: Feiticeira no lugar do Mago)
  for (const k of run.party) {
    if (s.members.some((m) => m.archetype === k)) continue;
    const fam = HERO_INFO[k].family;
    const slot = s.members.find((m) => m.archetype === fam && !run.party.includes(fam));
    if (slot) slot.archetype = k;
  }
  for (const k of run.party) if (!s.members.some((m) => m.archetype === k)) s = withMember(s, zone, k);
  return s;
}

/** Coloca `kind` num tile livre perto do Mago (ou do primeiro herói). */
function withMember(s: PartySetup, zone: ZoneDef, kind: HeroKind): PartySetup {
  if (s.members.some((m) => m.archetype === kind)) return s;
  const pz = parseZone(zone);
  const free = (x: number, y: number) => pz.floor.some((f) => f.x === x && f.y === y) && !s.members.some((m) => m.x === x && m.y === y);
  const m = s.members.find((mm) => mm.archetype === 'mage') ?? s.members[0];
  const tries: [number, number][] = [[2, 0], [-2, 0], [2, 1], [-2, 1], [1, 1], [-1, 1], [3, 0], [-3, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of tries)
    if (free(m.x + dx, m.y + dy)) {
      s.members.push({ archetype: kind, x: m.x + dx, y: m.y + dy });
      return s;
    }
  const f = pz.floor.filter((t) => t.y > pz.height / 2 && free(t.x, t.y))[0];
  if (f) s.members.push({ archetype: kind, x: f.x, y: f.y });
  return s;
}

/** Conclui o nó atual e volta para o mapa (viagem animada se mudou de ato). Consumo único: só anda se uma conclusão foi aberta (relatório/cidade/evento) — duplo-clique não avança 2×. */
let claimOpen = false;
function completeNode(outcome: string): void {
  if (!claimOpen) return;
  claimOpen = false;
  const from = currentNode(run).region;
  const newAct = advance(run, outcome);
  noteRecords();
  saveProfile();
  if (run.ended === 'victory') {
    saveMeta('victory');
    saveProfile();
    showRunEnd(true);
    return;
  }
  openMap();
  if (newAct) {
    const to = currentNode(run).region;
    worldMap.show({ ...mapState(), current: from });
    worldMap.travelTo(from, to, () => worldMap.show(mapState()));
    hud.log(`Começa o ${currentAct(run).name}.`, 'warn');
  }
}

function openCity(): void {
  closeOverlays();
  setMode('city');
  claimOpen = true; // sair da cidade conclui o nó (uma vez)
  const node = currentNode(run);
  city.open(run, node.city ?? 'Cidade', REGION_BY_ID[node.region].biome);
}

function openEvent(): void {
  closeOverlays();
  setMode('event');
  worldMap.show(mapState());
  const ev = run.eventId ? EVENTS.find((e) => e.id === run.eventId) ?? pickEvent(run) : pickEvent(run);
  run.eventId = ev.id;
  saveProfile();
  const body = `<div class="ev-art"></div><p class="ev-text">${ev.text}</p>`;
  eventModal.show(
    ev.title,
    body,
    ev.options.map((o) => ({
      label: `${o.label}${o.cost ? ` (${o.cost} z)` : ''}`,
      disabled: (o.cost ?? 0) > profile.zeni,
      onClick: () => {
        const payKey = `e:${run.act}:${run.node}:${ev.id}`;
        claimOpen = true; // o resultado vai abrir: uma conclusão liberada
        let out: string[] = [];
        if (run.paidKey !== payKey) {
          run.paidKey = payKey;
          if (o.cost) profile.zeni -= o.cost;
          out = applyEventEffects(run, o.effects);
          audio.sfx(out.length ? 'coin' : 'ui');
          saveProfile();
        }
        hud.setCharacter(characterVM());
        eventModal.show(ev.title, `<p class="ev-text">${o.result || out[0] || ''}</p>${out.length ? `<ul class="run-sum">${out.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}`, [
          { label: 'Continuar ➜', primary: true, onClick: () => (eventModal.hide(), completeNode(`evento:${ev.id}`)) },
        ]);
      },
    })),
  );
  paintEventArt(eventModal.el, ev.id);
}

function showRunEnd(victory: boolean, cityFell = false): void {
  closeOverlays();
  setMode('end');
  const lv = run.party.map((h) => `${NAME_PT[h]} Nv. ${profile.heroes[h].level}`).join(' · ');
  endModal.show(
    victory ? 'Aurenthal está salva!' : 'A jornada terminou',
    `<div class="end-art ${victory ? 'win' : 'lose'}"></div>
     <p class="ev-text">${victory ? 'O Senhor Orc das Cinzas caiu. Os portões de Valdrec se abrem para os heróis.' : cityFell ? 'A horda rompeu a muralha e a cidade caiu. Toda jornada ensina algo — a próxima começa do zero.' : 'A party caiu em combate. Toda jornada ensina algo — a próxima começa do zero.'}</p>
     <ul class="run-sum"><li>Chegou à fase ${phaseNumber(run)} de ${totalPhases()} (${currentAct(run).name.split(' — ')[0]})</li><li>${run.kills} inimigos abatidos</li><li>${lv}</li></ul>`,
    [
      { label: 'Nova jornada', primary: true, onClick: () => startNewRun() },
      { label: 'Tela inicial', onClick: () => (endModal.hide(), returnToMenu()) },
    ],
  );
}

function openSkills(hero: HeroKind = 'warrior'): void {
  if (skillTree.visible) return skillTree.close();
  skillTree.open(run, hero, mode === 'city');
}

const CD_KEY: Partial<Record<SkillId, string>> = { doubleBarrier: 'fireBarrier2' };
const skillIcon = (id: string) => (iconCache[id] ??= SKILL_ICONS[id]?.() ?? '');
/**
 * Barra de baixo: ataque básico + os 5 slots de habilidade do herói (Mana).
 * Slot além do que a Mana libera = bloqueado; liberado sem habilidade = livre.
 */
function slotsVM(k: HeroKind, u: Unit | undefined): Pick<HudMember, 'basic' | 'slots'> {
  const eq = heroEquipped(profile, k);
  const total = slotCount(k, heroStats(profile, k).mana);
  const running = !!u && sim.phase === 'running';
  const frac = (key: string, len: number) => (running ? Math.min(1, Math.max(0, (u!.cooldowns[key] ?? 0) - sim.tick) / Math.max(1, len)) : 0);
  const basicId = HERO_INFO[k].basic;
  return {
    basic: { icon: skillIcon(basicId), name: SKILL_BY_ID[basicId].name, cd: frac(BASIC_KEY[k], BASIC_CD(k)) },
    slots: Array.from({ length: GAME_CONFIG.mana.maxSlots }, (_, i) => {
      if (i >= total) return { cd: 0, locked: true };
      const id = eq[i];
      if (!id) return { cd: 0, locked: false };
      const len = id === HERO_INFO[k].area ? SKILL_CD(k) : extraCd(k, id);
      return { id, name: SKILL_BY_ID[id].name, icon: skillIcon(id), cd: frac(CD_KEY[id] ?? id, len), locked: false };
    }),
  };
}
const iconCache: Record<string, string> = {};
function extraCd(k: HeroKind, id: SkillId): number {
  const lv = lvOf(profile.heroes[k].skills, id);
  const st = heroStats(profile, k);
  switch (id) {
    case 'doubleBarrier':
      return st.barrierCooldownTicks;
    case 'fury':
      return SKILL_NUM.fury(lv).cooldown;
    default: {
      const n = (SKILL_NUM[id] as (l: number) => { cooldown?: number })(Math.max(1, lv));
      return Math.max(1, Math.round((n.cooldown ?? 100) * st.cooldownMult));
    }
  }
}
void SKILL_BY_ID;
void ACTS;

/** ESC na partida → confirmação → volta para a tela inicial (onda em andamento fica selada e recomeça igual). */
function returnToMenu(): void {
  panels.closeAll();
  closeOverlays();
  setMode('menu');
  claimOpen = false;
  resetSim();
  saveProfile();
  hudRoot.style.visibility = 'hidden';
  audio.stopGameMusic();
  audio.playMenuMusic(MUSIC.menu, MUSIC.fadeMs);
  menu.open();
}

/** Mudanças de atributo/equipamento só entre ondas: salva e recria a onda com os novos status. */
function progressionChanged(changed: boolean): void {
  if (!changed || sim.phase === 'running') return;
  saveProfile();
  if (mode === 'battle') resetSim(false);
  else {
    hud.setCharacter(characterVM());
    refreshOverlays();
  }
}

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
function characterVM(): CharacterVM {
  return {
    editable: sim.phase === 'setup' || mode !== 'battle',
    souls: profile.souls,
    zeni: profile.zeni,
    respecCost: 0,
    soulAbsorb: PROGRESSION.soulAbsorb,
    inventory: profile.inventory,
    heroes: run.party.map((kind) => {
      const h = profile.heroes[kind];
      const st = heroStats(profile, kind);
      const gear = gearBonus(SLOTS.map((s) => h.equipment[s]));
      const wm = weaponMult(kind, gear);
      const common: [string, string][] = [
        ['HP', String(st.maxHp)],
        [HERO_INFO[kind].family === 'mage' ? 'Ataque mágico' : 'Ataque', `${HERO_INFO[kind].family === 'mage' ? gear.matk : gear.atk} → dano ×${wm.toFixed(2)}`],
        ['Mana (slots de habilidade)', `${st.mana} → ${heroEquipped(profile, kind).length}/${slotCount(kind, st.mana)} slots`],
        ['Skill Haste', fmtPct(st.skillHaste)],
        ['Chance de crítico', fmtPct(st.crit)],
        ['Dano crítico', fmtPct(st.critDamage)],
        ['Esquiva / Bloqueio', `${fmtPct(st.dodge)} / ${fmtPct(st.block)}`],
        ['Regeneração de vida', `${st.hpRegenPerSec}/s`],
        ['Sorte (drop e raridade)', `${st.luck}`],
      ];
      const cdS = (t: number) => `${(t / GAME_CONFIG.sim.tickRate).toFixed(1)} s`;
      const own: [string, string][] =
        kind === 'sorcerer' || kind === 'warlock' || kind === 'assassin'
          ? [
              ['Poder da classe (dano ×)', st.classPower.toFixed(2)],
              [`${SKILL_BY_ID[HERO_INFO[kind].area].name}: recarga`, cdS(SKILL_CD(kind))],
              [`${SKILL_BY_ID[HERO_INFO[kind].basic].name}: recarga`, cdS(BASIC_CD(kind))],
            ]
          : kind === 'archer'
          ? [
              ['Flecha Precisa: dano / alcance', `${st.arrowDamage.toFixed(1)} / ${st.arrowRange}`],
              ['Flecha: recarga', cdS(st.arrowCooldownTicks)],
              ['Chuva de Flechas: dano / área', `${st.rainDamage.toFixed(1)} / ${st.rainRadius * 2 + 1}×${st.rainRadius * 2 + 1}`],
              ['Chuva: recarga', cdS(st.rainCooldownTicks)],
            ]
          : kind === 'warrior'
          ? [
              ['Golpe em Área: dano', st.cleaveDamage.toFixed(1)],
              ['Golpe: alcance / ângulo', `${st.cleaveRange} tiles / ${Math.round(st.cleaveHalfAngleDeg * 2)}°`],
              ['Investida: dano', st.bashDamage.toFixed(1)],
              ['Recargas: golpe / investida', `${cdS(st.cleaveCooldownTicks)} / ${cdS(st.bashCooldownTicks)}`],
            ]
          : [
              ['Barreira: tamanho', `${st.barrierLength} tiles`],
              ['Barreira: duração', `${(st.barrierDurationTicks / GAME_CONFIG.sim.tickRate).toFixed(1)} s`],
              ['Raio Gélido: dano / alcance', `${st.boltDamage.toFixed(1)} / ${st.boltRange}`],
              ['Recargas: barreira / raio', `${cdS(st.barrierCooldownTicks)} / ${cdS(st.boltCooldownTicks)}`],
            ];
      return {
        kind,
        level: h.level,
        points: h.points,
        pointCost: attrPointCost(profile, kind),
        spent: spentPoints(h, kind) > 0,
        attrs: h.attrs,
        base: ATTRIBUTES_CONFIG.base[kind],
        gearAttrs: gear.attrs,
        derived: [...own, ...common],
        equipment: h.equipment,
      };
    }),
  };
}

/** Relatório da noite (WAVE_RESULT da simulação) → vida da cidade e histórico da run. */
function nightReport(): WaveReport {
  const rep = sim.report(run.nights + 1);
  recordNight(run, rep);
  hud.setCity(run.cityHp, run.cityMaxHp, rep.enemiesReachedCity);
  return rep;
}

/** Dados da tela do Relatório da Noite: party (vida no fim da onda, EXP, quem subiu), itens e fase atual. */
function nightVM(report: WaveReport, title: string, items: Item[], before: Record<string, number>, extra: { zeniBonus?: number; extraHtml?: string } = {}): NightReportVM {
  const units = [...sim.units.values()].filter((u) => u.team === 'party');
  const node = currentNode(run);
  return {
    title,
    report,
    zeniBonus: extra.zeniBonus,
    extraHtml: extra.extraHtml,
    portraits: PORTRAITS,
    items,
    heroes: run.party.map((k) => {
      const h = profile.heroes[k];
      const u = units.find((x) => x.kind === k);
      const maxHp = u?.maxHp ?? heroStats(profile, k).maxHp;
      const dead = run.dead.includes(k) || (u ? !u.alive : false);
      return { kind: k, level: h.level, leveled: h.level > (before[k] ?? h.level), dead, hp: dead ? 0 : Math.round(u?.hp ?? maxHp), maxHp: Math.round(maxHp), exp: h.exp / expToNext(h.level) };
    }),
    phase: { phase: phaseNumber(run), total: totalPhases(), region: REGION_BY_ID[node.region].name, act: currentAct(run).name, node: run.choice ?? 'horde' },
    bank: { zeni: profile.zeni, souls: profile.souls },
  };
}

/** Fim de onda: aplica EXP/níveis/almas/drops no perfil, coleta os itens do chão. Recompensa paga 1× por nó (paidKey); rejogar após crash mostra o relatório sem pagar de novo. */
function finishWave(): void {
  run.battle = undefined; // a onda terminou: o selo sai junto com o próximo save
  if (run.choice === 'survival') return finishSurvival();
  const report = nightReport();
  const r = sim.result();
  const firstPhase = run.act === 0 && run.node === 0;
  const before = Object.fromEntries(run.party.map((h) => [h, profile.heroes[h].level]));
  const won = sim.phase === 'victory';
  const bonus = won ? Math.round(GAME_CONFIG.zeni.waveClearBonus * (1 + run.act * 0.6)) : 0;
  const payKey = `w:${run.act}:${run.node}`;
  claimOpen = true; // o relatório vai abrir: uma conclusão liberada
  let summary = '';
  let unlockHtml = '';
  let gifts: Item[] = [];
  let mythic: Item | undefined;
  if (run.paidKey !== payKey) {
    run.paidKey = payKey;
    applyWaveResult(profile, r);
    if (won) {
      profile.wavesWon = (profile.wavesWon ?? 0) + 1;
      addZeni(profile, bonus);
    }
    run.kills += sim.killed;
    run.damage = (run.damage ?? 0) + report.damageDealtByUnit.reduce((s, d) => s + d.amount, 0);
    noteRecords();
    // conquistas entre jornadas (liberam classes): abates, noites perfeitas e chefes
    const metaBefore = loadMetaStats();
    const meta: MetaStats = { ...metaBefore, bossesKilled: { ...metaBefore.bossesKilled } };
    meta.kills += sim.killed;
    if (won && report.cityDamageTaken <= 0) meta.perfectNights++;
    if (won && run.choice === 'boss' && GAME_CONFIG.wave.boss) meta.bossesKilled[GAME_CONFIG.wave.boss] = (meta.bossesKilled[GAME_CONFIG.wave.boss] ?? 0) + 1;
    saveMetaStats(meta);
    const newClasses = HERO_ORDER.filter((k) => !heroUnlocked(k, metaBefore) && heroUnlocked(k, meta));
    for (const k of newClasses) hud.log(`Nova classe desbloqueada: ${NAME_PT[k]}! Escolha-a ao iniciar uma nova jornada.`, 'good');
    hud.log(`Zeni ganho: ${r.zeni + bonus}${won ? ' (inclui bônus de vitória)' : ''}.`, 'good');
    const n = view.collectDrops();
    if (n > 0) hud.log(`Coletado: ${r.drops.map((d) => itemName(d)).join(', ')}.`, 'good');
    summary = newClasses.map((k) => `<div class="unlock"><img src="${PORTRAITS[k] ?? ''}" alt=""><div><b>Nova classe desbloqueada: ${NAME_PT[k]}!</b><small>Disponível ao iniciar uma nova jornada (e como reforço quando um chefe cair).</small></div></div>`).join('');
    const node = run.choice ?? 'horde';
    // Chefe de ato derrotado: um novo herói se junta à party
    if (won && node === 'boss') {
      const nh = nextUnlock(run, availableHeroes());
      if (nh) {
        unlockHero(run, nh);
        unlockHtml = `<div class="unlock"><img src="${PORTRAITS[nh]}" alt=""><div><b>${NAME_PT[nh]} se juntou à party!</b><small>Chega no nível ${profile.heroes[nh].level}, com pontos para distribuir.</small></div></div>`;
        hud.setParty(run.party, run.dead);
      }
    }
    // 1ª vitória: presente de raridade SORTEADA (1 ou 2 itens) — cada jornada começa diferente.
    // 1º chefe vencido: 1 recompensa Mítica garantida (uma vez por jornada).
    // (Só na vitória, como antes: a derrota sai pelo caminho do relatório sem presentes.)
    if (won) {
      gifts = firstPhase ? starterGift(run) : [];
      mythic = bossMythicReward(run, run.choice, r.drops) ?? undefined;
      for (const it of [...gifts, ...(mythic ? [mythic] : [])]) profile.inventory.push(it);
    }
    saveProfile();
  }
  // quem terminou a fase caído fica fora até ser revivido (idempotente: ignora quem já está fora)
  const alive = new Set([...sim.units.values()].filter((u) => u.team === 'party' && u.alive).map((u) => u.kind));
  const fell = run.party.filter((h) => !run.dead.includes(h) && setup.members.some((m) => m.archetype === h) && !alive.has(h));
  run.dead.push(...fell);
  hud.setCharacter(characterVM());
  const node = run.choice ?? 'horde';
  if (!won || run.dead.length >= run.party.length || run.cityHp <= 0) {
    run.ended = 'defeat';
    saveMeta('defeat');
    saveProfile();
    const cityFell = run.cityHp <= 0;
    // mesmo na derrota o relatório da noite aparece antes do fim da jornada
    window.setTimeout(() => {
      resultModal.show(nightVM(report, `Relatório da Noite ${report.night}`, r.drops, before, { zeniBonus: bonus, extraHtml: summary }), [{ label: 'Continuar ➜', primary: true, onClick: () => (resultModal.hide(), showRunEnd(false, cityFell)) }]);
    }, 1400);
    return;
  }
  window.setTimeout(async () => {
    for (const it of gifts) await roulette.spin('Recompensa da primeira vitória', 'Um presente dos refugiados de Valdrec... o que veio desta vez?', it, () => it.slot);
    if (mythic) await roulette.spin('Garantia Mítica', 'O chefe caiu! Uma relíquia lendária de Aurenthal se revela...', mythic, () => mythic.slot);
    const buttons: { label: string; primary?: boolean; disabled?: boolean; onClick: () => void }[] = [];
    for (const h of run.dead) {
      const c = reviveCost(run);
      buttons.push({
        label: `Reviver ${NAME_PT[h]} (${c} z)`,
        disabled: profile.zeni < c,
        onClick: () => {
          if (!revive(run, h)) {
            hud.log(`${NAME_PT[h]} não pôde ser revivido (Zeni insuficiente).`, 'warn');
            return;
          }
          audio.sfx('levelup');
          saveProfile();
          resultModal.hide();
          completeNode(`${node}:vitória`);
        },
      });
    }
    buttons.push({ label: run.dead.length ? 'Seguir sem reviver' : 'Continuar ➜', primary: !run.dead.length, onClick: () => (resultModal.hide(), completeNode(`${node}:vitória`)) });
    const deadTxt = run.dead.length ? `<p class="warn">${run.dead.map((h) => NAME_PT[h]).join(' e ')} caiu. Reviver custa 50% do Zeni (ou faça isso depois, no templo de uma cidade).</p>` : '';
    const head = node === 'boss' ? 'Chefe derrotado! — ' : node === 'elite' ? 'Elite derrotada! — ' : '';
    resultModal.show(nightVM(report, `${head}Relatório da Noite ${report.night}`, [...r.drops, ...gifts, ...(mythic ? [mythic] : [])], before, { zeniBonus: bonus, extraHtml: unlockHtml + summary + deadTxt }), buttons);
  }, 1300);
}

/** Fim da Sobrevivência (queda ou recuo): pontuação → roleta de prêmios. Cair aqui não mata ninguém. Prêmio 1× por nó (paidKey). */
function finishSurvival(): void {
  const report = nightReport();
  const r = sim.result();
  const before = Object.fromEntries(run.party.map((h) => [h, profile.heroes[h].level]));
  const payKey = `s:${run.act}:${run.node}`;
  claimOpen = true;
  let prizes: Item[] = [];
  let score = 0;
  if (run.paidKey !== payKey) {
    run.paidKey = payKey;
    applyWaveResult(profile, r);
    run.kills += sim.killed;
    run.damage = (run.damage ?? 0) + report.damageDealtByUnit.reduce((s, d) => s + d.amount, 0);
    noteRecords();
    view.collectDrops();
    const seconds = Math.round(sim.tick / GAME_CONFIG.sim.tickRate);
    const res = survivalRewards(sim.killed, seconds);
    score = res.score;
    prizes = res.rarities.map((ra) => makeItem(ra, undefined, run.party));
    profile.inventory.push(...prizes);
    saveProfile();
  } else {
    const seconds = Math.round(sim.tick / GAME_CONFIG.sim.tickRate);
    score = survivalRewards(sim.killed, seconds).score;
  }
  const seconds = Math.round(sim.tick / GAME_CONFIG.sim.tickRate);
  hud.setSurvival(false);
  window.setTimeout(async () => {
    for (let i = 0; i < prizes.length; i++)
      await roulette.spin(`Prêmio da Sobrevivência ${prizes.length > 1 ? `(${i + 1}/${prizes.length})` : ''}`, `Pontuação ${score} · ${sim.killed} abates · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} · estágio ${sim.stage + 1}`, prizes[i]);
    const summary = `<ul class="run-sum"><li>Pontuação: <b>${score}</b> (abates + tempo)</li><li>Estágio alcançado: ${sim.stage + 1}</li></ul>`;
    resultModal.show(nightVM(report, `Sobrevivência — Relatório da Noite ${report.night}`, [...r.drops, ...prizes], before, { extraHtml: summary }), [{ label: 'Continuar ➜', primary: true, onClick: () => (resultModal.hide(), completeNode(`sobrevivência:${score}`)) }]);
  }, 1200);
}

/** Trapaças de teste ligadas no painel de debug (sobrevivem ao reinício da onda). */
const cheats = { invincible: false, noCooldowns: false, oneHit: false };
/** Modificadores de teste do Dev Lab (temporários, só em memória; neutros fora do Dev Lab). */
const simMods = neutralMods();

function resetSim(clearLog = true, seal?: BattleSeal): void {
  sim = new Simulation(seal?.setup ?? liveSetup(), undefined, seal?.loadout ?? loadout(), simOpts());
  view.setHeroAuras(Object.fromEntries(run.party.map((h) => [h, maxRefine(SLOTS.map((s) => profile.heroes[h].equipment[s]))])));
  hud.setParty(run.party, run.dead);
  hud.setSurvival(GAME_CONFIG.wave.endless);
  Object.assign(sim.cheats, cheats);
  sim.mods = simMods;
  view.bind(sim);
  acc = 0;
  lastSouls.mage = lastSouls.warrior = 0;
  hud.setPlanning(true);
  hud.showBanner('', '');
  if (clearLog) {
    hud.clearLog();
    hud.log('Planejamento: posicione a party e a Barreira de Fogo.', 'info');
  }
  hud.setCharacter(characterVM());
  hud.setCity(sim.cityHp, sim.cityMaxHp, 0);
  hud.hideObjectMenu();
  lastPhase = sim.phase;
}

// ---------- Entrada (planejamento) ----------
const ndc = new THREE.Vector2();
const canvas = stage.renderer.domElement;
/** Arrastar no planejamento: pega um herói ou uma barreira direto no campo. */
let drag: { tool: Tool; from: Vec2; moved: boolean; rotate?: boolean } | undefined;
/** Muralha disponível (Guerreiro na fase com a habilidade). */
const wallActive = () => run.party.includes('warrior') && !run.dead.includes('warrior') && lvOf(profile.heroes.warrior?.skills, 'shieldWall') > 0;
const wallLength = () => SKILL_NUM.shieldWall(Math.max(1, lvOf(profile.heroes.warrior?.skills, 'shieldWall'))).length;
/** Linha (centro + orientação) de uma ferramenta de linha: barreira ou muralha. */
function linePlan(t: Tool): { plan: { x: number; y: number; orientation: Orientation }; len: number } | undefined {
  const bi = barrierIndex(t);
  if (bi >= 0) return { plan: setup.barriers[bi], len: heroStats(profile, 'mage').barrierLength };
  if (t === 'wall' && setup.wall) return { plan: setup.wall, len: wallLength() };
  return undefined;
}
const lineTiles = (t: Tool) => {
  const l = linePlan(t);
  return l ? sim.board.clip(linePattern(l.plan, l.plan.orientation, l.len)) : [];
};
/** Quem está sob o cursor (herói tem prioridade sobre barreira/muralha). */
function grabbableAt(t: Vec2): Tool | undefined {
  const m = setup.members.find((mm) => mm.x === t.x && mm.y === t.y && !run.dead.includes(mm.archetype as HeroKind));
  if (m) return m.archetype as Tool;
  const lines: Tool[] = [];
  if (setup.members.some((mm) => mm.archetype === 'mage') && !run.dead.includes('mage')) lines.push('barrier', 'barrier2', 'barrier3');
  if (wallActive()) lines.push('wall');
  for (const tl of lines) if (lineTiles(tl).some((p) => p.x === t.x && p.y === t.y)) return tl;
  return undefined;
}
/** O tile é uma das pontas da linha? (arrastar a ponta gira; o meio move) */
function isLineEnd(t: Tool, at: Vec2): boolean {
  const l = linePlan(t);
  if (!l) return false;
  const tiles = linePattern(l.plan, l.plan.orientation, l.len);
  const a = tiles[0];
  const b = tiles[tiles.length - 1];
  return (a.x === at.x && a.y === at.y) || (b.x === at.x && b.y === at.y);
}
/** Orientação da linha apontando do centro para `to` (o jogador "puxa" a ponta). */
function orientationToward(c: Vec2, to: Vec2): Orientation | undefined {
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  if (dx === 0 && dy === 0) return undefined;
  if (Math.abs(dx) >= 2 * Math.abs(dy)) return 'H';
  if (Math.abs(dy) >= 2 * Math.abs(dx)) return 'V';
  return Math.sign(dx) === Math.sign(dy) ? 'DIAG_DOWN' : 'DIAG_UP';
}
/** Objeto do mapa sob o cursor (id), se houver. */
function objectAt(t: Vec2): number | undefined {
  for (const o of sim.objects.values()) if (o.tiles.some((p) => p.x === t.x && p.y === t.y)) return o.id;
  return undefined;
}

/** Clique num objeto no planejamento: menu com o que ele faz e as ações. */
function openObjectMenu(id: number, cx: number, cy: number): void {
  const o = sim.objects.get(id);
  if (!o) return;
  const rule = OBJECT_RULES[o.type];
  const used = run.usedObjects.includes(id) || o.state !== 'idle';
  const acts = used ? [] : objectActions(run, o.type, id);
  hud.showObjectMenu(
    cx,
    cy,
    rule.label + (used && rule.action ? ' (já usado)' : ''),
    rule.desc,
    acts.map((a) => ({
      label: a.label,
      disabled: a.disabled,
      onClick: () => {
        const msg = useMapObject(run, o.type, id, a.id);
        if (!msg) return;
        audio.sfx(o.type === 'cart' ? 'coin' : o.type === 'torch' || o.type === 'campfire' ? 'fireBarrier' : o.type === 'altar' ? 'levelup' : 'ui');
        hud.log(msg, 'good');
        saveProfile();
        hud.setCharacter(characterVM());
        resetSim(false);
      },
    })),
  );
}

/** A ferramenta existe nesta fase? (barreiras só com o Mago vivo na party; muralha só com a habilidade) */
function toolAvailable(t: Tool): boolean {
  const alive = (h: HeroKind) => setup.members.some((m) => m.archetype === h) && !run.dead.includes(h);
  if (t.startsWith('barrier')) return alive('mage');
  if (t === 'wall') return wallActive();
  return alive(t as HeroKind);
}
function selectTool(t: Tool): void {
  if (!toolAvailable(t)) {
    // sem dono na party: volta para o primeiro herói disponível
    const h = setup.members.find((m) => !run.dead.includes(m.archetype as HeroKind));
    if (!h) return;
    t = h.archetype as Tool;
  }
  tool = t;
  hud.setTool(t);
}
/** Gira uma linha (barreira ou muralha) para a próxima orientação. */
function rotateLine(t: Tool, dir = 1): void {
  const l = linePlan(t);
  if (!l) return;
  const n = ORIENTATIONS.length;
  l.plan.orientation = ORIENTATIONS[(ORIENTATIONS.indexOf(l.plan.orientation) + dir + n) % n];
}
function pickTile(e: PointerEvent | WheelEvent | MouseEvent): Vec2 | undefined {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  return view.boardView.pick(ndc, stage.camera);
}
function placeTool(t: Tool, at: Vec2): void {
  if (!toolAvailable(t)) return;
  const bi = barrierIndex(t);
  if (bi >= 0) {
    setup.barriers[bi].x = at.x;
    setup.barriers[bi].y = at.y;
    return;
  }
  if (t === 'wall') {
    if (wallActive()) setup.wall = { x: at.x, y: at.y, orientation: setup.wall?.orientation ?? 'H' };
    return;
  }
  if (!canPlaceMember(t, at)) return;
  const m = setup.members.find((mm) => mm.archetype === t);
  if (m) {
    m.x = at.x;
    m.y = at.y;
  }
  // ordem: o herói vai andando até o posto novo (em vez de "teletransportar")
  view.keepPartyPositions();
  resetSim();
  if (m) {
    view.orderMarker(at.x, at.y, isHeroKind(t) ? HERO_INFO[t].color : 0xffd67a);
    audio.sfx('ui');
  }
}
/** Arrastar a câmera com o botão direito/do meio (em qualquer fase da batalha). */
let camDrag: { x: number; y: number; moved: boolean; button: number } | undefined;
const groundAt = (cx: number, cy: number) => {
  ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  return view.boardView.groundPoint(ndc, stage.camera);
};
canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'battle' || (e.button !== 1 && e.button !== 2)) return;
  camDrag = { x: e.clientX, y: e.clientY, moved: false, button: e.button };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!camDrag) return;
  if (Math.abs(e.clientX - camDrag.x) + Math.abs(e.clientY - camDrag.y) < 4 && !camDrag.moved) return;
  const a = groundAt(camDrag.x, camDrag.y);
  const b = groundAt(e.clientX, e.clientY);
  if (a && b) stage.panBy(a.x - b.x, a.z - b.z);
  camDrag.x = e.clientX;
  camDrag.y = e.clientY;
  camDrag.moved = true;
});
canvas.addEventListener('pointerup', (e) => {
  if (!camDrag || (e.button !== 1 && e.button !== 2)) return;
  const d = camDrag;
  canvas.releasePointerCapture?.(e.pointerId);
  window.setTimeout(() => {
    if (camDrag === d) camDrag = undefined;
  }, 0);
});
canvas.addEventListener('pointermove', (e) => {
  hover = pickTile(e);
  if (sim.phase !== 'setup' || mode !== 'battle') {
    canvas.style.cursor = '';
    hud.planHint(undefined);
    return;
  }
  if (drag) {
    if (hover && (hover.x !== drag.from.x || hover.y !== drag.from.y)) drag.moved = true;
    canvas.style.cursor = 'grabbing';
    // puxando a ponta: a linha gira para apontar para o cursor
    const l = drag.rotate ? linePlan(drag.tool) : undefined;
    if (l && hover) {
      const o = orientationToward(l.plan, hover);
      if (o) l.plan.orientation = o;
    }
    hud.planHint(drag.rotate ? 'Solte para fixar a direção' : undefined, e.clientX, e.clientY);
    return;
  }
  const g = hover && grabbableAt(hover);
  const oid = !g && hover ? objectAt(hover) : undefined;
  const obj = oid !== undefined ? sim.objects.get(oid) : undefined;
  canvas.style.cursor = g ? 'grab' : obj ? 'pointer' : '';
  hud.planHint(
    g
      ? g.startsWith('barrier') || g === 'wall'
        ? isLineEnd(g, hover!)
          ? `${g === 'wall' ? 'Muralha' : 'Barreira'}: arraste a ponta para girar`
          : `${g === 'wall' ? 'Muralha' : 'Barreira'}: arraste para mover · clique para girar`
        : g === tool
          ? `${NAME_PT[g as HeroKind]} aguarda ordens — clique no chão para mandar`
          : `Clique para dar ordens: ${NAME_PT[g as HeroKind]}`
      : obj
        ? `${OBJECT_RULES[obj.type].label} — clique para ver`
        : hover && GAME_CONFIG.wave.spawnPoints.some((p) => p.x === hover!.x && p.y === hover!.y)
          ? 'Portal de spawn: a horda nasce aqui'
          : hover && sim.board.isCity(hover.x, hover.y)
            ? 'Portão da cidade: inimigo que chegar aqui invade a cidade'
            : hover && isHeroKind(tool) && setup.members.some((mm) => mm.archetype === tool)
              ? canPlaceMember(tool, hover)
                ? `Ordem: ${NAME_PT[tool as HeroKind]} vai para cá`
                : 'Não dá para ir até aqui'
              : undefined,
    e.clientX,
    e.clientY,
  );
});
canvas.addEventListener('pointerleave', () => {
  hover = undefined;
  hud.planHint(undefined);
});
canvas.addEventListener('pointerdown', (e) => {
  if (sim.phase !== 'setup' || e.button !== 0) return;
  const t = pickTile(e);
  if (!t) return;
  const g = grabbableAt(t);
  // herói: clicar seleciona (o jogador dá ordens; não carrega o boneco)
  if (g && !linePlan(g)) {
    selectTool(g);
    audio.sfx('ui');
    return;
  }
  if (g) {
    selectTool(g);
    drag = { tool: g, from: t, moved: false, rotate: isLineEnd(g, t) };
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  // objeto do mapa: abre o menu dele
  const oid = objectAt(t);
  if (oid !== undefined) {
    openObjectMenu(oid, e.clientX, e.clientY);
    return;
  }
  hud.hideObjectMenu();
  // chão vazio: coloca o que estiver selecionado no painel (jeito antigo continua valendo)
  placeTool(tool, t);
});
canvas.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag;
  drag = undefined;
  canvas.releasePointerCapture?.(e.pointerId);
  const t = pickTile(e);
  const isLine = !!linePlan(d.tool);
  if (!d.moved) {
    if (isLine) rotateLine(d.tool); // clique simples na barreira/muralha: gira
    return;
  }
  if (d.rotate) return; // girou puxando a ponta
  if (t) placeTool(d.tool, t);
});
// botão direito / roda do mouse sobre uma barreira: gira
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  // foi um arrasto de câmera, não um clique
  if (camDrag?.moved) return;
  if (sim.phase !== 'setup') return;
  const t = pickTile(e);
  const g = t && grabbableAt(t);
  if (g && linePlan(g)) {
    selectTool(g);
    rotateLine(g);
  }
});
canvas.addEventListener(
  'wheel',
  (e) => {
    if (mode !== 'battle') return;
    e.preventDefault();
    const t = sim.phase === 'setup' ? pickTile(e) : undefined;
    const g = t && grabbableAt(t);
    if (g && linePlan(g)) {
      selectTool(g);
      rotateLine(g, e.deltaY > 0 ? 1 : -1);
      return;
    }
    // fora das barreiras: zoom da câmera
    stage.zoomBy(e.deltaY > 0 ? 1 : -1);
  },
  { passive: false },
);
/** Teclas de câmera seguradas (WASD / setas). */
const camKeys = new Set<string>();
const CAM_DIR: Record<string, [number, number]> = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
window.addEventListener('keydown', (e) => {
  if (mode !== 'battle' || menu.active || e.target instanceof HTMLInputElement) return;
  if (CAM_DIR[e.code]) {
    camKeys.add(e.code);
    e.preventDefault();
  }
  if (e.code === 'KeyF') {
    stage.resumeFollow();
    if (sim.phase === 'setup') focusParty();
  }
});
window.addEventListener('keyup', (e) => camKeys.delete(e.code));
window.addEventListener('blur', () => camKeys.clear());
function updateCamera(dt: number): void {
  if (mode !== 'battle') return;
  let dx = 0;
  let dz = 0;
  for (const k of camKeys) {
    dx += CAM_DIR[k][0];
    dz += CAM_DIR[k][1];
  }
  if (dx || dz) {
    const v = VISUAL_CONFIG.cameraControl.panSpeed * dt;
    stage.panBy(dx * v, dz * v);
  }
  // na onda a câmera acompanha a frente da batalha (até o jogador mexer nela)
  if (sim.phase === 'running' && stage.following) {
    const c = view.actionCenter();
    if (c) stage.follow(c);
  }
}
window.addEventListener('keydown', (e) => {
  if (menu.active || mode === 'menu') return;
  if (e.key === 'Escape') {
    e.preventDefault();
    confirmBox.ask(
      'Voltar ao menu',
      mode === 'battle'
        ? sim.phase === 'running'
          ? 'Deseja voltar para a tela inicial? A onda recomeça do início, com a mesma formação, quando você continuar a jornada.'
          : 'Deseja voltar para a tela inicial? A fase atual recomeça quando você continuar a jornada.'
        : 'Deseja voltar para a tela inicial? A jornada fica salva.',
      'Sim, voltar ao menu',
      returnToMenu,
    );
    return;
  }
  if ((e.key === 'c' || e.key === 'C') && !(e.target instanceof HTMLInputElement)) hud.toggleCharacter();
  if (e.key === 'k' || e.key === 'K') openSkills();
  if (mode !== 'battle' || resultModal.visible) return;
  if (e.key === 'r' || e.key === 'R') {
    if (sim.phase !== 'setup') return;
    const lt = linePlan(tool) ? tool : 'barrier';
    if (toolAvailable(lt)) rotateLine(lt);
  }
  // 1–4: velocidade do jogo
  const sp = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Numpad1: 1, Numpad2: 2, Numpad3: 3, Numpad4: 4 }[e.code];
  if (sp && !(e.target instanceof HTMLInputElement)) {
    speed = sp;
    hud.setSpeed(sp);
  }
  if (e.key === ' ') {
    e.preventDefault();
    startHorde();
  }
});

function canPlaceMember(kind: Tool, t: Vec2): boolean {
  if (!sim.board.isWalkable(t.x, t.y) || sim.board.isCity(t.x, t.y)) return false;
  // longe dos portais de spawn (a horda precisa de onde nascer)
  const R = GAME_CONFIG.wave.spawnSafeRadius;
  if (GAME_CONFIG.wave.spawnPoints.some((p) => Math.max(Math.abs(p.x - t.x), Math.abs(p.y - t.y)) <= R)) return false;
  return !setup.members.some((m) => m.archetype !== kind && m.x === t.x && m.y === t.y);
}

// ---------- Indicadores de grade ----------
let lastHighlight = '';
function drawOverlay(): void {
  const bv = view.boardView;
  bv.clearOverlay();
  const planning = sim.phase === 'setup';
  if (planning && !toolAvailable(tool)) selectTool(tool);
  if (planning) {
    const ms = heroStats(profile, 'mage');
    const ws = heroStats(profile, 'warrior');
    const hasMage = sim.setup.members.some((m) => m.archetype === 'mage');
    const sel = barrierIndex(drag?.tool ?? tool);
    if (hasMage)
      setup.barriers.forEach((b, i) => bv.mark(sim.board.clip(linePattern(b, b.orientation, ms.barrierLength)), i === sel ? C_BARRIER2 : C_BARRIER, i === sel ? 0.75 : 0.5));
    if (wallActive()) bv.mark(lineTiles('wall'), C_WALL, (drag?.tool ?? tool) === 'wall' ? 0.8 : 0.5);
    // pontas da linha selecionada: "alças" para girar
    const selLine = drag?.tool ?? tool;
    const sl = linePlan(selLine);
    if (sl && (selLine !== 'wall' || wallActive()) && (barrierIndex(selLine) < 0 || hasMage)) {
      const ends = linePattern(sl.plan, sl.plan.orientation, sl.len);
      bv.mark(sim.board.clip([ends[0], ends[ends.length - 1]]), C_HANDLE, 0.9);
    }
    // herói selecionado (aguardando ordens): tile destacado
    const selHero = sim.setup.members.find((m) => m.archetype === tool);
    if (selHero) bv.mark([selHero], C_HANDLE, 0.55 + 0.25 * Math.sin(performance.now() / 220));
    const w = sim.setup.members.find((m) => m.archetype === 'warrior');
    if (w) bv.mark(sim.board.clip(conePattern(w, { x: 0, y: -1 }, ws.cleaveRange, ws.cleaveHalfAngleDeg)), C_CONE, 0.22);
    // alcance do Raio Gélido do Mago (anel sutil)
    const mg = sim.setup.members.find((m) => m.archetype === 'mage');
    if (mg) {
      const ring: Vec2[] = [];
      for (let y = 0; y < sim.board.height; y++)
        for (let x = 0; x < sim.board.width; x++) {
          const d = Math.hypot(x - mg.x, y - mg.y);
          if (d <= ms.boltRange && d > ms.boltRange - 1 && sim.board.isWalkable(x, y)) ring.push({ x, y });
        }
      bv.mark(ring, C_BARRIER, 0.12);
    }
    // portão (zona de ameaça), área proibida em volta dos spawns e óleo derramado
    bv.mark(sim.board.cityTiles(), C_CITY, 0.35);
    const R = GAME_CONFIG.wave.spawnSafeRadius;
    const nearSpawn: Vec2[] = [];
    for (const p of GAME_CONFIG.wave.spawnPoints) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) nearSpawn.push({ x: p.x + dx, y: p.y + dy });
    bv.mark(nearSpawn.filter((p) => sim.board.isWalkable(p.x, p.y)), C_SPAWN, 0.12);
    for (const o of sim.objects.values()) if (o.state === 'spilled') bv.mark(o.area, C_OIL, 0.25);
    if (hover) {
      const grab = !drag && grabbableAt(hover);
      if (grab) {
        // destaque do que dá para pegar
        const gi = barrierIndex(grab);
        if (gi >= 0) bv.mark(sim.board.clip(linePattern(setup.barriers[gi], setup.barriers[gi].orientation, ms.barrierLength)), C_HOVER, 0.55);
        else bv.mark([hover], C_HOVER, 0.8);
      } else if (sel >= 0 && hasMage && !drag?.rotate) {
        bv.mark(sim.board.clip(linePattern(hover, setup.barriers[sel].orientation, ms.barrierLength)), C_BARRIER2, drag ? 0.7 : 0.35);
      } else if ((drag?.tool ?? tool) === 'wall' && wallActive() && !drag?.rotate) {
        bv.mark(sim.board.clip(linePattern(hover, setup.wall?.orientation ?? 'H', wallLength())), C_WALL, drag ? 0.75 : 0.4);
      } else if (drag?.rotate) {
        /* girando: a linha já mostra a direção */
      } else {
        const t = drag?.tool ?? tool;
        bv.mark([hover], canPlaceMember(t, hover) ? C_HOVER : C_BAD, 1);
      }
    }
  } else if (hover) {
    bv.mark([hover], C_HOVER, 0.4);
  }
  const f = view.lastCleaveFlash;
  if (f) bv.mark(f.tiles, C_CLEAVE, 0.6 * f.strength);
  // anel de destaque nos objetos que ainda dá para usar (só no planejamento)
  const hl = planning ? view.interactiveObjects(run.usedObjects) : [];
  const hlKey = hl.join(',');
  if (hlKey !== lastHighlight) {
    lastHighlight = hlKey;
    view.objectView?.setHighlight(hl, planning);
  }
  overlayHook?.((tiles, color, strength) => bv.mark(tiles, color, strength));
  bv.flushOverlay();
}

// ---------- Loop: simulação em passo fixo + render interpolado ----------
/** Camada extra de marcação de tiles (usada pelo debug: grade, hitboxes). */
let overlayHook: ((mark: (tiles: Vec2[], color: THREE.Color, strength: number) => void) => void) | undefined;

const tickDt = 1 / GAME_CONFIG.sim.tickRate;
let last = performance.now();
let lastDrawn = 0;
let fps = 60;
let lastPhase = sim.phase;

// ---------------- Cinemática do chefe final ----------------
function isFinalBossFight(): boolean {
  return run.act === ACTS.length - 1 && run.choice === 'boss' && !GAME_CONFIG.wave.endless;
}

let cineEl: HTMLElement | undefined;
/** Batalha congelada durante a cinemática do golpe final. */
let cinePause = false;
let cinePlayed = false;
let cinePromise: Promise<void> | undefined;

/** Golpe final no chefe: congela a batalha e roda a cinemática antes de ele cair. */
function onFinalBossDeath(kind: string): boolean {
  if (!isFinalBossFight() || cinePlayed || kind !== ACTS[run.act].boss) return false;
  cinePlayed = true;
  cinePause = true;
  cinePromise = bossCinematic(true).then(() => {
    cinePause = false;
  });
  return true;
}

/** Vitória na luta final: espera a cinemática do golpe final (a morte pode chegar um pouco depois, com o projétil). */
function waitFinalCinematic(): Promise<void> {
  return new Promise((resolve) => {
    let n = 0;
    const poll = () => {
      if (cinePromise) return void cinePromise.then(resolve);
      if (++n > 15) return void bossCinematic(true).then(resolve);
      window.setTimeout(poll, 100);
    };
    poll();
  });
}
let cineRun: { t: number; ev: { at: number; fn: () => void }[] } | undefined;
function tickCinematic(dt: number): void {
  const c = cineRun;
  if (!c) return;
  c.t += dt;
  const due = c.ev.filter((e) => e.at <= c.t);
  c.ev = c.ev.filter((e) => e.at > c.t);
  for (const e of due) e.fn();
}
/**
 * Close no chefe final quando a batalha termina: ele rosna uma fala (com legenda).
 * Heróis vencem → "ESSE NÃO É O FIM EU VOLTAREI !!" e ele cai; chefe vence → "ORCUS CASCA GROSSA".
 * Clique pula.
 */
function bossCinematic(heroesWon: boolean): Promise<void> {
  if (!cineEl) {
    cineEl = document.createElement('div');
    cineEl.id = 'cine';
    cineEl.innerHTML = `<i class="bar top"></i><i class="bar bot"></i>
      <div class="cine-sub"><small></small><b></b></div><em class="cine-skip">clique para pular</em>`;
    document.body.appendChild(cineEl);
  }
  const el = cineEl;
  const act = ACTS[run.act];
  const line = heroesWon ? 'ESSE NÃO É O FIM EU VOLTAREI !!' : 'ORCUS CASCA GROSSA';
  const v = view.cinematicBoss(act.boss);
  const h = v instanceof ModelUnitView ? v.height : 2.4;
  stage.setCinematic(v.root.position, h);
  // luz de destaque no rosto do chefe durante a cena
  const key = stage.acquireLight(heroesWon ? 0xff8a5a : 0xffb070);
  if (key) {
    key.position.copy(v.root.position).add(new THREE.Vector3(1.2, h * 0.95, 2.2));
    key.distance = 9;
    key.intensity = 7;
  }
  el.querySelector('small')!.textContent = act.bossName;
  const sub = el.querySelector('b')!;
  sub.textContent = '';
  el.classList.remove('on', 'talk', 'lose');
  el.classList.toggle('lose', !heroesWon);
  document.body.classList.add('cine');
  requestAnimationFrame(() => el.classList.add('on'));
  // relógio da cena avança com o frame do jogo (não com o relógio da parede)
  const clock: NonNullable<typeof cineRun> = { t: 0, ev: [] };
  cineRun = clock;
  const at = (sec: number, fn: () => void) => clock.ev.push({ at: sec, fn });
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clock.ev = [];
      el.removeEventListener('click', finish);
      stage.setCinematic(undefined);
      el.classList.remove('on', 'talk');
      at(clock.t + 0.65, () => {
        document.body.classList.remove('cine');
        if (key) stage.releaseLight(key);
        view.endCinematic();
        cineRun = undefined;
        resolve();
      });
    };
    el.addEventListener('click', finish);
    at(1.0, () => {
      audio.sfx(heroesWon ? 'growlLose' : 'growlWin');
      v.cast();
      stage.addShake(heroesWon ? 0.08 : 0.16);
      el.classList.add('talk');
      // legenda digitada no ritmo do rosnado
      const chars = [...line];
      chars.forEach((_, i) => at(1.0 + (i * 1.6) / chars.length, () => (sub.textContent = chars.slice(0, i + 1).join(''))));
    });
    if (heroesWon) {
      at(1.7, () => v.hit());
      at(2.4, () => v.hit());
      at(3.3, () => {
        if (view.heldBoss === v) view.releaseHeldBoss();
        else v.die();
        stage.addShake(0.22);
      });
      at(5.6, finish);
    } else {
      at(2.1, () => {
        if ('attack' in v) (v as ModelUnitView).attack('heavy');
        stage.addShake(0.2);
      });
      at(3.0, () => v.cast());
      at(5.2, finish);
    }
  });
}

/** Momento da cena para o Aurenthal PostFX: planejamento, combate ou chefe em campo. */
const POSTFX_BOSSES = new Set(POSTFX.bossKinds);
function postFxSituation(): PostFxSituation {
  if (sim.phase !== 'running') return 'calm';
  for (const u of sim.units.values()) if (u.alive && u.team === 'enemy' && POSTFX_BOSSES.has(u.kind)) return 'boss';
  return 'battle';
}

function frame(now: number): void {
  // Limite de FPS: pula o frame se ainda não deu o intervalo (margem de 1 ms para não perder vsync).
  const cap = settings.value.video.fpsCap;
  if (cap > 0 && now - lastDrawn < 1000 / cap - 1) {
    requestAnimationFrame(frame);
    return;
  }
  lastDrawn = now;
  let dt = Math.min(0.1, (now - last) / 1000);
  // (dev) passo fixo para capturas determinísticas: window.__vgFixedDt = 1/60
  if (import.meta.env.DEV) {
    const w = window as unknown as { __vgFixedDt?: number; __vgFrames?: number; __vgBudget?: number; __vgOnFrame?: (dt: number) => void };
    if (w.__vgFixedDt) dt = w.__vgFixedDt;
    // captura quadro a quadro: com __vgBudget definido, o jogo só avança quando há "passos" disponíveis
    if (w.__vgBudget !== undefined) {
      if (w.__vgBudget > 0) w.__vgBudget--;
      else dt = 0;
    }
    if (dt > 0) w.__vgOnFrame?.(dt);
    w.__vgFrames = (w.__vgFrames ?? 0) + 1;
  }
  if (now > last) fps += (1000 / (now - last) - fps) * 0.1;
  panels.setFps(fps);
  tickCinematic(dt);
  last = now;
  // relógio da jornada (Ranking "mais rápido"): só com a jornada aberta; dt já vem limitado (janela minimizada não conta)
  if (!menu.active && !run.ended && mode !== 'menu' && mode !== 'select' && mode !== 'end') run.playMs = (run.playMs ?? 0) + dt * 1000;
  const paused = confirmBox.isOpen || skillTree.visible || mode !== 'battle';
  const gdt = paused ? 0 : dt * speed; // pausa com confirmação/árvore abertas ou fora da batalha
  tickAutoStart(dt, paused);

  if (sim.phase === 'running' && !cinePause) {
    acc += gdt;
    while (acc >= tickDt) {
      acc -= tickDt;
      const events = sim.step();
      view.handle(events);
      logEvents(events);
      playSounds(events);
      if (sim.phase !== 'running') {
        acc = 0;
        break;
      }
    }
  }
  if (sim.phase !== lastPhase) {
    lastPhase = sim.phase;
    const ended = sim.phase === 'victory' || sim.phase === 'defeat';
    const announce = () => {
      if (sim.phase === 'victory') hud.showBanner('VITÓRIA', 'victory');
      if (sim.phase === 'defeat') hud.showBanner(GAME_CONFIG.wave.endless ? 'FIM DA RESISTÊNCIA' : 'DERROTA', 'defeat');
      finishWave();
    };
    // vitória: a cinemática roda no golpe final (chefe congelado antes de cair); derrota: o chefe comemora
    if (ended && isFinalBossFight() && sim.phase === 'victory') void waitFinalCinematic().then(announce);
    else if (ended && isFinalBossFight() && !cinePlayed) void bossCinematic(false).then(announce, announce);
    else if (ended) announce();
    else hud.setCharacter(characterVM());
  }

  // Menu principal, mapa, cidade e fim de jornada cobrem a tela: a cena 3D não é desenhada.
  if (menu.active || mode === 'map' || mode === 'city' || mode === 'end' || mode === 'select') {
    requestAnimationFrame(frame);
    return;
  }
  updateCamera(dt);
  stage.postfx.setSituation(postFxSituation());
  view.update(gdt, sim.tick + acc / tickDt);
  drawOverlay();
  updateStatus();
  stage.render(dt);
  requestAnimationFrame(frame);
}

// ---------- HUD: só lê o estado da simulação ----------
const NAME_PT: Record<string, string> = HERO_NAME;
/** RNG só para itens criados pelo debug (não toca nos RNGs da onda). */
const debugRng = new Rng(Date.now() >>> 0);
/** Recarga total de cada habilidade, já com Destreza/equipamento. */
const ADV = GAME_CONFIG.archetypes;
function SKILL_CD(k: HeroKind): number {
  const st = heroStats(profile, k);
  const c = (t: number) => Math.max(1, Math.round(t * st.cooldownMult));
  if (k === 'sorcerer') return c(ADV.sorcerer.meteor.cooldownTicks);
  if (k === 'warlock') return c(ADV.warlock.curse.cooldownTicks);
  if (k === 'assassin') return c(ADV.assassin.fan.cooldownTicks);
  return k === 'mage' ? st.barrierCooldownTicks : k === 'archer' ? st.rainCooldownTicks : st.cleaveCooldownTicks;
}
/** Ataque básico de alvo único de cada classe. */
const BASIC_KEY = Object.fromEntries(HERO_ORDER.map((k) => [k, HERO_INFO[k].basic])) as Record<HeroKind, string>;
function BASIC_CD(k: HeroKind): number {
  const st = heroStats(profile, k);
  const c = (t: number) => Math.max(1, Math.round(t * st.cooldownMult));
  if (k === 'sorcerer') return c(ADV.sorcerer.orb.cooldownTicks);
  if (k === 'warlock') return c(ADV.warlock.drain.cooldownTicks);
  if (k === 'assassin') return c(ADV.assassin.backstab.cooldownTicks);
  return k === 'mage' ? st.boltCooldownTicks : k === 'archer' ? st.arrowCooldownTicks : st.bashCooldownTicks;
}

/** Almas de heróis caídos continuam visíveis no HUD. */
const lastSouls: Record<string, number> = Object.fromEntries(HERO_ORDER.map((k) => [k, 0]));

function updateStatus(): void {
  hud.setCity(sim.cityHp, sim.cityMaxHp, sim.reachedCity);
  for (const u of sim.units.values()) if (u.team === 'party') lastSouls[u.kind] = u.souls;
  const party = [...sim.units.values()].filter((u) => u.team === 'party');
  hud.update({
    phase: sim.phase,
    killed: sim.killed,
    souls: sim.souls,
    zeni: profile.zeni + (sim.phase === 'running' ? sim.zeni : 0),
    total: GAME_CONFIG.wave.endless ? 0 : GAME_CONFIG.wave.count + (GAME_CONFIG.wave.boss ? 1 : 0),
    survival: GAME_CONFIG.wave.endless ? { stage: sim.stage + 1, seconds: Math.floor(sim.tick / GAME_CONFIG.sim.tickRate) } : undefined,
    members: run.party.map((k) => {
      const u = party.find((p) => p.kind === k);
      return {
        kind: k,
        hp: u?.hp ?? 0,
        maxHp: u?.maxHp ?? heroStats(profile, k).maxHp,
        alive: !!u,
        ...slotsVM(k, u),
        souls: u?.souls ?? lastSouls[k],
        level: u?.level ?? profile.heroes[k].level,
        exp: u?.exp ?? profile.heroes[k].exp,
        expNext: expToNext(u?.level ?? profile.heroes[k].level),
      };
    }),
  });
}

/** Sons a partir dos eventos (camada de apresentação, como o render). */
function playSounds(events: SimEvent[]): void {
  const s = (n: SfxName) => audio.sfx(n);
  // som no mesmo instante do impacto visual (os tempos seguem a velocidade do jogo)
  const later = (n: SfxName, sec: number) => window.setTimeout(() => s(n), (sec * 1000) / Math.max(0.25, speed));
  for (const e of events) {
    if (e.type === 'cast') later('fireBarrier', 0.15);
    else if (e.type === 'bolt') {
      later('frostBolt', 0.1);
      later('frostHit', 0.26);
    } else if (e.type === 'cleave') later('cleave', 0.12);
    else if (e.type === 'bash') later('bash', 0.28);
    else if (e.type === 'melee') s('hit');
    else if (e.type === 'nova') s('nova');
    else if (e.type === 'storm') later('thunder', 0.06);
    else if (e.type === 'taunt' || e.type === 'fury') s('roar');
    else if (e.type === 'shockwave') later('shock', 0.2);
    else if (e.type === 'soul') s('soul');
    else if (e.type === 'levelup') s('levelup');
    else if (e.type === 'drop') s('drop');
    else if (e.type === 'death') s(HEROES.includes(view.unitKind(e.unitId) as HeroKind) ? 'heroDeath' : 'enemyDeath');
    else if (e.type === 'arrow') s('bow');
    else if (e.type === 'shadowBolt') s('spell');
    else if (e.type === 'stomp') s('shock');
    else if (e.type === 'meteor') later('meteor', 0.2);
    else if (e.type === 'rain') (s('bow'), later('rainArrows', 0.45));
    else if (e.type === 'pierce') s('bow');
    else if (e.type === 'focus') s('levelup');
    else if (e.type === 'ruinCollapse') later('ruin', 0.05);
    else if (e.type === 'oilIgnite') s('fireBarrier');
    else if (e.type === 'objectState' && e.state === 'broken') s('ruin');
    else if (e.type === 'objectHit') s('hit');
    else if (e.type === 'mud') s('mud');
    else if (e.type === 'sandWarn' || (e.type === 'sandstorm' && e.on)) s('sandstorm');
    else if (e.type === 'phase' && e.phase === 'victory') s('victory');
    else if (e.type === 'phase' && e.phase === 'defeat') s('defeat');
  }
}

let meteorWarned = false;
/** Registro de batalha (caixa de mensagens) a partir dos eventos do tick. */
function logEvents(events: SimEvent[]): void {
  for (const e of events) {
    if (e.type === 'cast') hud.log(e.ability === 'fireBarrier2' ? 'Mago conjurou a segunda barreira!' : 'Mago conjurou Barreira de Fogo!', 'skill');
    else if (e.type === 'spawn' && GAME_CONFIG.bossKinds.includes(sim.units.get(e.unitId)?.kind ?? '')) {
      const k = sim.units.get(e.unitId)!.kind;
      hud.log(k === 'elite' ? 'Um mini-chefe surge da horda!' : `${currentAct(run).bossName} entra em campo!`, 'warn');
    } else if (e.type === 'nova') hud.log('Mago lançou Nova Congelante!', 'skill');
    else if (e.type === 'storm') hud.log('Tempestade Elétrica!', 'skill');
    else if (e.type === 'taunt') hud.log(`Guerreiro provocou ${e.pulled.length} inimigo(s)!`, 'skill');
    else if (e.type === 'shockwave') hud.log('Onda de Choque!', 'skill');
    else if (e.type === 'fury') hud.log('O Guerreiro entrou em Fúria!', 'skill');
    else if (e.type === 'focus') hud.log('A Arqueira entrou em Foco do Caçador!', 'skill');
    else if (e.type === 'telegraph' && !meteorWarned) {
      meteorWarned = true;
      hud.log('Meteoros! Os círculos vermelhos marcam onde vão cair.', 'warn');
    }
    else if (e.type === 'pierce') hud.log('Flecha Perfurante!', 'skill');
    else if (e.type === 'cityHit' && e.damage > 0) {
      const k = view.unitKind(e.unitId);
      hud.log(`Um inimigo${k && GAME_CONFIG.bossKinds.includes(k) ? ' poderoso' : ''} invadiu a cidade! −${e.damage} (${e.cityHp}/${e.cityMaxHp})`, 'warn');
    } else if (e.type === 'oilIgnite') hud.log('O óleo pegou fogo!', 'skill');
    else if (e.type === 'ruinCollapse') hud.log('A ruína desabou sobre a horda!', 'skill');
    else if (e.type === 'mud') hud.log('O gelo encharcou o oásis: lama atrasa a horda.', 'skill');
    else if (e.type === 'objectState' && e.state === 'broken') {
      const o = sim.objects.get(e.objectId);
      if (o) hud.log(`${OBJECT_RULES[o.type].label} foi destruída!`, 'warn');
    } else if (e.type === 'sandWarn') hud.log('O vento está mudando... tempestade de areia chegando!', 'warn');
    else if (e.type === 'sandstorm') hud.log(e.on ? 'Tempestade de areia! Alcance menor e projéteis desviando.' : 'A tempestade passou.', e.on ? 'warn' : 'info');
    else if (e.type === 'levelup') {
      const k = view.unitKind(e.unitId);
      hud.log(`${NAME_PT[k ?? ''] ?? 'Herói'} subiu para o nível ${e.level}! (+${PROGRESSION.pointsPerLevel} atributo, +${PROGRESSION.skillPointsPerLevel} habilidade)`, 'good');
    } else if (e.type === 'drop') hud.log(`Drop: ${itemName(e.item)}!`, 'skill');
    else if (e.type === 'cleave' && e.hits >= 3) hud.log(`Golpe em Área atingiu ${e.hits} inimigos!`, 'skill');
    else if (e.type === 'death') {
      const u = view.unitKind(e.unitId);
      if (HEROES.includes(u as HeroKind)) hud.log(`${NAME_PT[u!]} caiu em combate.`, 'warn');
      else if (sim.killed % 10 === 0 && sim.killed > 0) hud.log(`${sim.killed} inimigos abatidos.`, 'info');
    } else if (e.type === 'phase' && e.phase === 'victory') hud.log('A horda foi contida. Vitória!', 'good');
    else if (e.type === 'phase' && e.phase === 'defeat') hud.log('A party foi derrotada...', 'warn');
  }
}

hud.setPlanning(true);
hud.setCharacter(characterVM());
requestAnimationFrame(frame);

// ---------- Game Editor V1 (F10): só em desenvolvimento; o balance salvo continua valendo ----------
const desktopBalance = window.vanguardaDesktop?.balance;
if (desktopBalance)
  void desktopBalance.load().then(async (r) => {
    // o balanceamento salvo (balance.ts do projeto ou do jogador) vale por cima do que veio no build,
    // mesmo antes de recompilar (o executável dentro da pasta do projeto grava no balance.ts)
    if (r.data) applyOverrides(r.data);
    if (!import.meta.env.DEV) return;
    const { installEditor } = await import('./editor/GameEditor');
    installEditor(r.data, (h, t, fn) => panels.addButton(h, t, fn));
  });

// ---------- Editor de mapas (F6): mesma condição do Game Editor (client desktop) ----------
if (import.meta.env.DEV && desktopBalance)
  void import('./mapEditor/MapEditor').then(({ installMapEditor }) => installMapEditor((h, t, fn) => panels.addButton(h, t, fn)));

// ---------- Painel de debug: só em desenvolvimento ----------
// No build de produção o Vite troca `import.meta.env.DEV` por `false`, este bloco
// é eliminado e o módulo de debug não entra no pacote da Steam.
if (import.meta.env.DEV) {
  (window as unknown as { __vg: unknown }).__vg = { view, stage, audio, get sim() { return sim; }, get run() { return run; }, enterBattle, openCity, openMap, completeNode, openSkills, openEvent, chooseNode, charSelect, bossCinematic }; // inspeção no console (dev)
  void import('./debug/DebugPanel').then(({ installDebug }) => installDebug(hudRoot, devApi(), (h, t, fn) => panels.addButton(h, t, fn)));}

// ---------- Dev Lab (F8): só no client desktop (executável) e com DEV_MODE ligado ----------
if (DEV_MODE && window.vanguardaDesktop)
  void import('./dev/DevLab/DevLab').then(({ installDevLab }) => installDevLab(hudRoot, devLabApi(), (h, t, fn) => panels.addButton(h, t, fn)));

/** O que o Dev Lab pode fazer — por cima da DevApi, sempre pelas funções do jogo. */
function devLabApi(): DevLabApi {
  sim.mods = simMods;
  /** Setup da party numa zona (mesma regra do loadZone), sem os heróis caídos. */
  const setupFor = (zone: ZoneDef): PartySetup => {
    const s = withPartyMembers(structuredClone(zone.defaultSetup), zone);
    if (run.party.length === 1 && run.party[0] === 'mage') {
      const m = s.members.find((mm) => mm.archetype === 'mage');
      if (m) s.barriers = barriersShield(m.x, m.y);
    }
    s.wall = defaultWall(s);
    s.members = s.members.filter((m) => run.party.includes(m.archetype) && !run.dead.includes(m.archetype));
    return s;
  };
  const flush = () => {
    const ev = sim.flushEvents();
    view.handle(ev);
    logEvents(ev);
    playSounds(ev);
  };
  return {
    base: devApi(),
    cheats,
    mods: simMods,
    sim: () => sim,
    flush,
    mode: () => mode,
    party: () => [...run.party],
    dead: () => [...run.dead],
    heroLevel: (k) => ({ level: profile.heroes[k].level, exp: profile.heroes[k].exp, next: expToNext(profile.heroes[k].level), skills: { ...profile.heroes[k].skills } }),
    setPartyMember: (k, on) => {
      if (!isHeroKind(k)) return `Herói desconhecido: ${k}.`;
      if (sim.phase === 'running') return 'A equipe só muda entre ondas (resete a arena).';
      if (on) {
        unlockHero(run, k);
        run.dead = run.dead.filter((h) => h !== k);
      } else {
        if (!run.party.includes(k)) return undefined;
        if (run.party.length <= 1) return 'A party precisa de pelo menos 1 herói.';
        run.party = run.party.filter((h) => h !== k);
        run.dead = run.dead.filter((h) => h !== k);
      }
      saveProfile();
      hud.setParty(run.party, run.dead);
      if (mode === 'battle') {
        setup = setupFor(ZONE_STATE.current);
        resetSim(false);
      }
      return undefined;
    },
    maxGear: (k) => {
      if (sim.phase === 'running') return 'Equipamento só muda entre ondas (resete a arena).';
      for (const slot of SLOTS) {
        const it = rollItem(debugRng, 0, `dev-${slot}-${Date.now()}-${debugRng.int(1e9)}`, { rarity: 'mythic', slot, kind: slot === 'weapon' ? WEAPON_USERS[k]?.[0] : undefined }, [k]);
        it.refine = REFINE.max;
        addItem(profile, it);
        equip(profile, k, it.id);
      }
      saveProfile();
      progressionChanged(true);
      return undefined;
    },
    currencies: () => ({ zeni: profile.zeni, souls: profile.souls }),
    setCurrency: (which, n) => {
      profile[which] = Math.max(0, Math.round(n));
      saveProfile();
      hud.setCharacter(characterVM());
    },
    castSkill: (k, id) => {
      const u = [...sim.units.values()].find((x) => x.team === 'party' && x.kind === k && x.alive);
      if (!u) return false;
      const ok = sim.castSkill(u, id);
      flush();
      return ok;
    },
    headless: {
      zoneFor: (act, node, type) => battleFor({ ...run, act, node }, type),
      setupFor,
      loadout: () => loadout(),
      cityMaxHp: () => run.cityMaxHp,
    },
    playPhase: (act, node, type) => {
      if (sim.phase === 'running') return;
      run.act = act;
      run.node = node;
      run.choice = type;
      saveProfile();
      closeOverlays();
      enterBattle(type);
    },
    scenarioStore: window.vanguardaDesktop?.devlab,
    setSpeed: (s) => {
      speed = s;
      if (s > 0) hud.setSpeed(s);
    },
    getSpeed: () => speed,
    waveFor: (act, node, type) => {
      const { zone, wave } = battleFor({ ...run, act, node }, type);
      return { count: wave.count ?? zone.wave.count, mix: wave.mix ?? zone.wave.mix, boss: wave.boss === null ? undefined : (wave.boss ?? zone.wave.boss), zone: zone.name };
    },
  };
}

/** Ids negativos para efeitos forçados pelo debug (não colidem com os da simulação). */
let debugFxId = -1;

/** Tudo o que o debug pode fazer — sempre pelas mesmas funções do jogo. */
function devApi(): DevApi {
  const commit = () => {
    saveProfile();
    progressionChanged(true);
  };
  const party = (k: string) => [...sim.units.values()].find((u) => u.team === 'party' && u.kind === k);
  let spawnQueue = 0;
  let spawnTimer = 0;
  const handle = (events: SimEvent[]) => {
    view.handle(events);
    playSounds(events);
  };
  const w = new THREE.Vector3();
  return {
    heroes: HEROES,
    heroLine: (k) => {
      const h = profile.heroes[k];
      return `Nv. ${h.level} · EXP ${h.exp}/${expToNext(h.level)} · ${h.points} pts · Sorte ${h.attrs.luk}`;
    },
    souls: () => profile.souls,
    zeni: () => profile.zeni,
    inventorySize: () => profile.inventory.length,
    canEditProgression: () => sim.phase !== 'running',
    addExperience: (k, n) => {
      const lv = addExperience(profile, k, n);
      if (lv > 0) hud.log(`[debug] ${NAME_PT[k]} +${lv} nível(is).`, 'good');
      commit();
    },
    setLevel: (k, n) => (setLevel(profile, k, n), commit()),
    resetLevel: (k) => (resetLevel(profile, k), commit()),
    addAttributePoints: (k, n) => (addAttributePoints(profile, k, n), commit()),
    resetAttributes: (k) => (resetAttributes(profile, k), commit()),
    setLuck: (k, v) => (setAttribute(profile, k, 'luk', v), commit()),
    addSouls: (n) => (addSouls(profile, n), saveProfile(), hud.setCharacter(characterVM())),
    addZeni: (n) => (addZeni(profile, n), saveProfile(), hud.setCharacter(characterVM())),
    clearSouls: () => (clearSouls(profile), saveProfile(), hud.setCharacter(characterVM())),
    createItem: (rarity, slot) => {
      const it = rollItem(debugRng, heroStats(profile, 'warrior').luck, `dbg-${Date.now()}-${debugRng.int(1e9)}`, { rarity, slot });
      addItem(profile, it);
      saveProfile();
      hud.setCharacter(characterVM());
      hud.log(`[debug] Criado: ${SLOT_LABEL[it.slot]} · ${RARITY_INFO[it.rarity].label}.`, 'skill');
    },
    clearInventory: () => (clearInventory(profile), saveProfile(), hud.setCharacter(characterVM())),
    run: {
      skillPoints: (k, n) => {
        profile.heroes[k].skillPoints += n;
        commit();
      },
      unlockTree: (k) => {
        for (const d of SKILLS) if (d.hero === k) profile.heroes[k].skills[d.id] = d.maxLevel;
        commit();
        hud.log(`[debug] Árvore do ${NAME_PT[k]} no máximo.`, 'skill');
      },
      refine: (k, lv) => {
        for (const s of SLOTS) {
          const it = profile.heroes[k].equipment[s];
          if (it) it.refine = lv;
        }
        commit();
        hud.log(`[debug] Equipamentos do ${NAME_PT[k]} em +${lv} (equipe itens antes).`, 'skill');
      },
      nextPhase: () => {
        if (mode === 'battle' && sim.phase === 'running') return;
        claimOpen = true;
        completeNode('debug');
      },
      jumpAct: (a) => {
        run.act = a;
        run.node = 0;
        run.choice = undefined;
        saveProfile();
        openMap();
      },
      line: () => `Ato ${run.act + 1} · fase ${phaseNumber(run)}/${totalPhases()} · modo ${mode} · caídos: ${run.dead.join(', ') || '—'}`,
    },
    spawnAt: (point, kind) => {
      const u = sim.spawnEnemy(kind, point);
      const ev = sim.flushEvents();
      handle(ev);
      logEvents(ev);
      return !!u;
    },
    cityDamage: (n) => {
      sim.debugCityDamage(n);
      const ev = sim.flushEvents();
      handle(ev);
      logEvents(ev);
    },
    setCityHp: (n) => {
      run.cityHp = Math.max(0, Math.min(run.cityMaxHp, n));
      saveProfile();
      if (sim.phase === 'setup') resetSim(false);
      hud.log(`[debug] Vida da cidade: ${run.cityHp}/${run.cityMaxHp}.`, 'info');
    },
    useAllObjects: () => {
      if (sim.phase !== 'setup') return;
      for (const o of sim.objects.values()) {
        if (!OBJECT_RULES[o.type].action || run.usedObjects.includes(o.id)) continue;
        const acts = objectActions(run, o.type, o.id);
        if (acts[0]) useMapObject(run, o.type, o.id, acts[0].id);
      }
      saveProfile();
      resetSim(false);
    },
    triggerObjects: () => {
      // simula os gatilhos de combate: fogo no óleo, golpe perto das ruínas, gelo no oásis, dano nas colunas
      for (const o of sim.objects.values()) {
        if (o.type === 'unstableRuin' && o.state === 'idle') sim.collapseRuin(o, -1);
        else if (o.maxHp && o.state === 'idle') sim.damageObject(o, o.hp, -1);
        else if (o.type === 'dryOasis' && o.state === 'idle') sim.emit({ type: 'nova', unitId: -1, x: o.x, y: o.y, radius: 1 });
        else if (o.type === 'oilBarrel' && o.state === 'spilled') sim.emit({ type: 'effectStart', effect: { id: -999, kind: 'fireBarrier', ownerId: -1, tiles: o.area.slice(0, 1), startTick: sim.tick, endTick: sim.tick, hostileTo: 'enemy' } });
      }
      // o fogo "de mentira" só serve de gatilho: não vira efeito visual
      const ev = sim.flushEvents().filter((x) => !(x.type === 'effectStart' && x.effect.id === -999));
      handle(ev);
      logEvents(ev);
    },
    spawnKind: (kind) => {
      const u = sim.spawnEnemy(kind);
      const ev = sim.flushEvents();
      handle(ev);
      logEvents(ev);
      return !!u;
    },
    spawnEnemies: (n) => {
      // Fila: entra pela linha de spawn conforme abre espaço (mesma regra da onda).
      spawnQueue += n;
      if (!spawnTimer)
        spawnTimer = window.setInterval(() => {
          if (sim.phase === 'running' || sim.phase === 'setup') {
            while (spawnQueue > 0 && sim.spawnEnemy()) spawnQueue--;
            handle(sim.flushEvents());
          }
          if (spawnQueue <= 0 || sim.phase === 'victory' || sim.phase === 'defeat') {
            spawnQueue = 0;
            window.clearInterval(spawnTimer);
            spawnTimer = 0;
          }
        }, 150);
      return n;
    },
    startWave: () => {
      if (sim.phase !== 'setup') return;
      sim.start();
      hud.log('A horda se aproxima!', 'warn');
      hud.setPlanning(false);
    },
    skipWave: () => {
      sim.skipWave();
      const ev = sim.flushEvents();
      handle(ev);
      logEvents(ev);
    },
    restartWave: () => resetSim(),
    killAllEnemies: () => {
      const n = sim.killAllEnemies();
      const ev = sim.flushEvents();
      handle(ev);
      logEvents(ev);
      return n;
    },
    cheats,
    applyCheats: () => Object.assign(sim.cheats, cheats),
    setSpeed: (s) => (speed = s),
    forceFx: (name) => {
      const wa = party('warrior');
      const ma = party('mage');
      const up = { x: 0, y: -1 };
      if (name === 'fireBarrier' && ma) {
        const b = setup.barriers[0];
        const ms = heroStats(profile, 'mage');
        const id = debugFxId--;
        const tiles = sim.board.clip(linePattern(b, b.orientation, ms.barrierLength));
        handle([
          { type: 'cast', unitId: ma.id, ability: 'fireBarrier' },
          { type: 'effectStart', effect: { id, kind: 'fireBarrier', ownerId: ma.id, tiles, startTick: 0, endTick: 0, hostileTo: 'enemy' } },
        ]);
        view.schedule([{ type: 'effectEnd', effectId: id }], 4);
      } else if (name === 'cleave' && wa) {
        const ws = heroStats(profile, 'warrior');
        const tiles = sim.board.clip(conePattern(wa, up, ws.cleaveRange, ws.cleaveHalfAngleDeg));
        handle([{ type: 'cleave', unitId: wa.id, facing: up, tiles, hitTiles: tiles.slice(0, 3), hits: 3 }]);
      } else if (name === 'frostBolt' && ma) {
        handle([{ type: 'bolt', unitId: ma.id, targetId: -1, from: { x: ma.x, y: ma.y }, to: { x: ma.x, y: Math.max(0, ma.y - 5) } }]);
      } else if (name === 'bash' && wa) {
        handle([{ type: 'bash', unitId: wa.id, targetId: -1, x: wa.x, y: wa.y - 1 }]);
      } else if (name === 'soul' && wa) {
        handle([{ type: 'soul', fromId: -1, toId: wa.id, amount: 1, x: wa.x + 1, y: Math.max(0, wa.y - 3) }]);
      } else if (name === 'levelup') {
        for (const u of [wa, ma]) if (u) handle([{ type: 'levelup', unitId: u.id, level: u.level + 1 }]);
      } else if (name === 'drop' && wa) {
        const it = rollItem(debugRng, 0, `fx-${debugRng.int(1e9)}`, { rarity: 'mythic' });
        handle([{ type: 'drop', item: it, x: wa.x + 1, y: Math.max(0, wa.y - 2) }]);
      }
    },
    benchmark: async (progress) => {
      // Pior caso: 100 zumbis + todas as magias em loop, em cada preset. Mede FPS real.
      const saved = structuredClone(settings.value.video);
      const savedCheats = { ...cheats };
      const presets: QualityPreset[] = ['low', 'medium', 'high', 'ultra'];
      const out: { preset: string; avg: number; low1: number }[] = [];
      const frames = (ms: number) =>
        new Promise<number[]>((res) => {
          const dts: number[] = [];
          let prev = performance.now();
          const t0 = prev;
          const tick = (now: number) => {
            dts.push(now - prev);
            prev = now;
            if (now - t0 < ms) requestAnimationFrame(tick);
            else res(dts);
          };
          requestAnimationFrame(tick);
        });
      const fxNames = ['fireBarrier', 'cleave', 'frostBolt', 'bash', 'soul'] as const;
      for (const p of presets) {
        progress(`Medindo ${QUALITY_LABEL[p]}...`);
        settings.update((s) => {
          s.video.preset = p;
          s.video.fpsCap = 0;
          s.video.particles = 1;
        });
        cheats.invincible = true;
        cheats.noCooldowns = false;
        resetSim(false);
        Object.assign(sim.cheats, cheats);
        sim.start();
        hud.setPlanning(false);
        for (let i = 0; i < 100; i++) sim.spawnEnemy();
        let k = 0;
        const loop = window.setInterval(() => devApi().forceFx(fxNames[k++ % fxNames.length]), 350);
        const spawner = window.setInterval(() => {
          for (let i = 0; i < 8; i++) sim.spawnEnemy();
        }, 400);
        await frames(2000); // aquecimento (compila shaders, enche a tela)
        const dts = await frames(5000);
        window.clearInterval(loop);
        window.clearInterval(spawner);
        const avg = 1000 / (dts.reduce((a, b) => a + b, 0) / dts.length);
        const sorted = [...dts].sort((a, b) => b - a);
        const worst = sorted.slice(0, Math.max(1, Math.floor(dts.length / 100)));
        const low1 = 1000 / (worst.reduce((a, b) => a + b, 0) / worst.length);
        out.push({ preset: QUALITY_LABEL[p], avg, low1 });
      }
      // recomendação: o preset mais alto que segura ~60 FPS de média e 1% baixo ≥ 40
      const okIdx = out.map((r, i) => (r.avg >= 55 && r.low1 >= 40 ? i : -1)).filter((i) => i >= 0);
      const best = presets[okIdx.length ? Math.max(...okIdx) : 0];
      settings.update((s) => {
        s.video = { ...saved, preset: best };
      });
      Object.assign(cheats, savedCheats);
      resetSim();
      return { results: out, recommended: QUALITY_LABEL[best] };
    },
    stats: () => ({ fps, particles: view.particles.aliveCount() + view.vfx.aliveCount(), lights: stage.lightsInUse(), enemies: sim.enemies().length, tick: sim.tick, phase: sim.phase }),
    flowCost: (x, y) => (sim.phase === 'running' ? sim.flowCost(x, y) : undefined),
    boardSize: () => ({ w: sim.board.width, h: sim.board.height }),
    cityLine: () => `Cidade ${sim.cityHp}/${sim.cityMaxHp} · invadiram ${sim.reachedCity} (−${sim.cityDamage}) · run ${run.cityHp}/${run.cityMaxHp} · noite ${run.nights}`,
    occupants: () => [...sim.units.values()].filter((u) => u.alive).map((u) => ({ x: u.x, y: u.y, team: u.team })),
    tileToScreen: (x, y) => {
      tileToWorld(x, y, w, 0).project(stage.camera);
      return { x: ((w.x + 1) / 2) * innerWidth, y: ((1 - w.y) / 2) * innerHeight, visible: w.z < 1 && Math.abs(w.x) <= 1.05 && Math.abs(w.y) <= 1.05 };
    },
    setOverlayHook: (fn) => (overlayHook = fn),
    log: (t) => hud.log(t, 'info'),
  };
}
