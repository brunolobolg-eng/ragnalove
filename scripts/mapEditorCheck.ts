/**
 * Prova de integração do editor de mapas (Etapa 1):
 * MapDoc -> ZoneDef -> parseZone (lógica real) -> applyZone (jogo de verdade).
 * Uso: node node_modules/tsx/dist/cli.mjs scripts/mapEditorCheck.ts
 */
import { applyZone, GAME_CONFIG } from '../src/config/gameConfig';
import { parseZone, ZONES } from '../src/config/zones';
import { fromZoneDef, newMap, resize, serialize, toZoneDef } from '../src/mapEditor/mapDoc';
import { deserialize } from '../src/mapEditor/mapDoc';
import { validate } from '../src/mapEditor/validate';

let failures = 0;
const check = (name: string, cond: boolean): void => {
  if (cond) console.log(`  ok: ${name}`);
  else {
    failures++;
    console.error(`  FALHA: ${name}`);
  }
};

// 1. zona real do jogo faz round-trip pelo documento
const doc = fromZoneDef(ZONES.bridge);
const back = toZoneDef(doc);
const a = parseZone(ZONES.bridge);
const b = parseZone(back);
check('round-trip bridge: mesmas paredes', a.walls.length === b.walls.length);
check('round-trip bridge: mesmos props', a.props.length === b.props.length);
check('round-trip bridge: mesmos spawns', JSON.stringify(a.spawnPoints) === JSON.stringify(b.spawnPoints));

// 2. novo mapa passa na validação após pequenos ajustes
const fresh = newMap('Teste', 20, 15, 'plains');
let v = validate(fresh);
check('mapa novo sem erros fatais de formato', v.errors.filter((e) => e.includes('rejeitado')).length === 0);
console.log(`  info: novo mapa -> erros=${v.errors.length} avisos=${v.warnings.length}`);
// adiciona portão + libera spawns
fresh.grid[0] = 'g'.repeat(20);
v = validate(fresh);
check('com portão: sem erros', v.errors.length === 0);

// 3. serialização preserva tudo
const rt = deserialize(serialize(doc));
check('JSON round-trip idêntico', serialize(rt) === serialize(doc));

// 4. resize preserva conteúdo
const r = fromZoneDef(ZONES.bridge);
resize(r, 30, 25);
check('resize mantém área comum', r.grid[0] === ZONES.bridge.map[0].slice(0, 30));
check('resize prende spawns', r.spawnPoints.every((p) => p.x < 30 && p.y < 25));

// 5. applyZone aceita o ZoneDef gerado (integração real com o jogo)
applyZone(back);
check('applyZone: tabuleiro 45x39', GAME_CONFIG.board.width === 45 && GAME_CONFIG.board.height === 39);
check('applyZone: paredes carregadas', GAME_CONFIG.board.walls.length === a.walls.length);

if (failures) throw new Error(`${failures} FALHA(S)`);
console.log('\nIntegração do editor OK.');
