import * as THREE from 'three';
import { VISUAL_CONFIG } from '../../config/visualConfig';
import type { ParsedZone, ZoneTheme } from '../../config/zones';
import type { ParticleLayer } from '../fx/Particles';
import { softCircle } from '../textures';
import { buildEmperium } from './Emperium';
import { placeProp } from './props';
import { muralhaRetas, trechosDeTiles } from './muralhaGlb';

/**
 * Muralha e portão da cidade no lado oposto aos spawns (só visual; o bloqueio vem dos tiles
 * 'W' e a zona de ameaça dos tiles 'g' do mapa). A muralha é a peça muros.glb do dono (muralhaGlb.ts);
 * as torres e a bandeira são peças GLB do dono (public/models/props/castle e flag), tingidas pela cor do bioma.
 * Nada de caixa, cilindro ou cubo de cor lisa: o que não tem arte do dono sai do cenário.
 */
export interface CityGateHandle {
  group: THREE.Group;
  update(dt: number, particles: ParticleLayer): void;
  setLights(on: boolean): void;
}

interface Style {
  /** Cor que tinge as torres de pedra (multiplica a textura do dono). */
  wall: number;
  /** Cor da bandeira no topo das torres. */
  banner: number;
}

// tons claros: a textura do dono (castelo) segue visível; tons escuros viravam bloco chapado
const STYLE: Record<string, Style> = {
  forest: { wall: 0xc4a47c, banner: 0x2e6a3a },
  plains: { wall: 0xdcd8cc, banner: 0x2e4a8a },
  desert: { wall: 0xf2dcb0, banner: 0xb8401e },
  mountain: { wall: 0xd2d8e2, banner: 0x3a5a8a },
  ash: { wall: 0xa8968c, banner: 0x8a1e14 },
};

/**
 * Castelo fechado (zona com `castle`): muralha de pedra ao longo dos tiles 'W' do mapa (muros.glb em trechos).
 * Os portões são aberturas no muro, e o Emperium (tiles 'E', no centro) é desenhado por buildEmperium.
 * Não usa a torre do portão, que é só da cidade aberta.
 */
function buildCastleWalls(zone: ParsedZone): CityGateHandle {
  const root = new THREE.Group();
  const X = (x: number) => x - zone.width / 2 + 0.5;
  const Z = (y: number) => y - zone.height / 2 + 0.5;
  const muroTiles = zone.props.filter((p) => p.kind === 'cityWall');
  // muralha do castelo com a peça muros.glb: trechos retos ao longo dos tiles 'W' (as aberturas são os portões)
  muralhaRetas(root, trechosDeTiles(muroTiles, X, Z), VISUAL_CONFIG.muralha.alturaCastelo);
  const emperio = buildEmperium(zone, X, Z);
  root.add(emperio.group);
  // o interruptor de luzes do cenário também liga os veios do Emperium (médio e alto), como nas luzes das tochas
  return { group: root, update: (dt) => emperio.update(dt), setLights: (on) => emperio.setDetalhe(on) };
}

export function buildCityGate(zone: ParsedZone, theme: ZoneTheme): CityGateHandle {
  if (zone.castle) return buildCastleWalls(zone);
  const root = new THREE.Group();
  const W = zone.width;
  const H = zone.height;
  const X = (x: number) => x - W / 2 + 0.5;
  const Z = (y: number) => y - H / 2 + 0.5;
  const st = STYLE[theme] ?? STYLE.plains;
  const gate = zone.city;
  if (!gate.length) return { group: root, update: () => {}, setLights: () => {} };
  const gx0 = Math.min(...gate.map((g) => g.x));
  const gx1 = Math.max(...gate.map((g) => g.x));
  const gy = gate[0].y;
  const z = Z(gy) + 0.25;

  // ---------------- Muralha (dos dois lados do portão, até as bordas do mapa) ----------------
  const left = X(gx0) - 0.5;
  const right = X(gx1) + 0.5;
  muralhaRetas(
    root,
    [
      { a: X(0) - 0.5 - 6, b: left - 0.9, linha: z + 0.2, eixo: 'x' as const },
      { a: right + 0.9, b: X(W - 1) + 0.5 + 6, linha: z + 0.2, eixo: 'x' as const },
    ],
    VISUAL_CONFIG.muralha.alturaCidade,
  );

  // ---------------- Casa do portão: duas torres do castelo do dono, com bandeira no topo ----------------
  const gh = new THREE.Group();
  gh.position.set((left + right) / 2, 0, z);
  const span = right - left;
  for (const s of [-1, 1]) {
    const tx = s * (span / 2 + 0.55);
    // torre com janelas do castelo do dono (o detalhe vem da textura, não de caixa lisa)
    placeProp(gh, 'castle/tower-square-mid-windows', tx, 0, { scale: 1.35, tint: st.wall });
    // bandeira do bioma no topo, virada para fora do portão
    placeProp(gh, 'castle/flag', tx, 0, { y: 1.36, scale: 1.4, rot: s < 0 ? Math.PI : 0, tint: st.banner });
  }
  root.add(gh);

  // ---------------- Tochas no portão ----------------
  const glowMat = new THREE.SpriteMaterial({ map: softCircle(), color: new THREE.Color(2.4, 1.1, 0.35), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const torches: { s: THREE.Sprite; l?: THREE.PointLight; ph: number; pos: THREE.Vector3 }[] = [];
  for (const s of [-1, 1]) {
    const pos = new THREE.Vector3((left + right) / 2 + s * (span / 2 + 0.05), 1.3, z - 0.6);
    const sp = new THREE.Sprite(glowMat);
    sp.position.copy(pos);
    sp.scale.setScalar(0.8);
    const l = new THREE.PointLight(0xff8a3a, 2.4, 7, 1.5);
    l.position.copy(pos);
    root.add(sp, l);
    torches.push({ s: sp, l, ph: s * 3, pos });
  }
  let t = 0;
  let acc = 0;
  return {
    group: root,
    setLights(on) {
      for (const tc of torches) if (tc.l) tc.l.visible = on;
    },
    update(dt, particles) {
      t += dt;
      acc += dt;
      const emit = acc > 1 / 20;
      if (emit) acc = 0;
      for (const tc of torches) {
        const k = 0.82 + Math.sin(t * 13 + tc.ph) * 0.08 + Math.sin(t * 7.3 + tc.ph * 2) * 0.1;
        tc.s.scale.setScalar(0.8 * k);
        if (tc.l) tc.l.intensity = 2.4 * k;
        if (emit) particles.glow.emit({ pos: tc.pos, posJitter: 0.05, vel: new THREE.Vector3(0, 1.0, 0), velJitter: 0.2, life: 0.45, size: 0.14, sizeEnd: 0.02, color: new THREE.Color(3, 1.3, 0.35), colorEnd: new THREE.Color(0.6, 0.1, 0.02), gravity: -0.6 });
      }
    },
  };
}
