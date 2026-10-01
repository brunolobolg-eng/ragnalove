import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ParsedZone, ZoneTheme } from '../../config/zones';
import type { ParticleLayer } from '../fx/Particles';
import { softCircle } from '../textures';

/**
 * Muralha e portão da cidade no lado oposto aos spawns (só visual; o bloqueio vem dos tiles
 * 'W' e a zona de ameaça dos tiles 'g' do mapa). Cada bioma tem seu material:
 * paliçada de troncos (floresta), pedra (planície/montanha/cinzas) e arenito com sol (deserto).
 */
export interface CityGateHandle {
  group: THREE.Group;
  update(dt: number, particles: ParticleLayer): void;
  setLights(on: boolean): void;
}

interface Style {
  wall: number;
  top: number;
  wood: number;
  banner: number;
  palisade: boolean;
  sun: boolean;
}

const STYLE: Record<string, Style> = {
  forest: { wall: 0x6a4a2e, top: 0x4a3420, wood: 0x5a3e24, banner: 0x2e6a3a, palisade: true, sun: false },
  plains: { wall: 0x8a8478, top: 0x6a665c, wood: 0x6a4a2e, banner: 0x2e4a8a, palisade: false, sun: false },
  desert: { wall: 0xd2a872, top: 0xb88a56, wood: 0x7a5634, banner: 0xb8401e, palisade: false, sun: true },
  mountain: { wall: 0x7c8490, top: 0x5c6470, wood: 0x4a3a2c, banner: 0x3a5a8a, palisade: false, sun: false },
  ash: { wall: 0x4a3c36, top: 0x2e2420, wood: 0x2a1e18, banner: 0x8a1e14, palisade: false, sun: false },
};

export function buildCityGate(zone: ParsedZone, theme: ZoneTheme): CityGateHandle {
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
  const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const wallMat = mat(st.wall);
  const topMat = mat(st.top);
  const woodMat = mat(st.wood);

  // ---------------- Muralha (dos dois lados do portão, até as bordas do mapa) ----------------
  const geos: THREE.BufferGeometry[] = [];
  const tops: THREE.BufferGeometry[] = [];
  const addWall = (xa: number, xb: number) => {
    const len = xb - xa;
    if (len <= 0) return;
    if (st.palisade) {
      // troncos lado a lado com ponta afiada, alturas variando
      for (let x = xa + 0.18; x < xb; x += 0.34) {
        const h = 1.15 + Math.sin(x * 3.1) * 0.12;
        geos.push(new THREE.CylinderGeometry(0.16, 0.18, h, 6).translate(x, h / 2, z));
        tops.push(new THREE.ConeGeometry(0.16, 0.34, 6).translate(x, h + 0.17, z));
      }
      geos.push(new THREE.BoxGeometry(len, 0.12, 0.12).translate((xa + xb) / 2, 0.7, z - 0.2));
    } else {
      geos.push(new THREE.BoxGeometry(len, 1.1, 1.0).translate((xa + xb) / 2, 0.55, z + 0.2));
      tops.push(new THREE.BoxGeometry(len + 0.05, 0.12, 1.12).translate((xa + xb) / 2, 1.15, z + 0.2));
      for (let x = xa + 0.3; x < xb - 0.1; x += 0.72) tops.push(new THREE.BoxGeometry(0.42, 0.3, 0.3).translate(x, 1.36, z - 0.18));
    }
  };
  const left = X(gx0) - 0.5;
  const right = X(gx1) + 0.5;
  addWall(X(0) - 0.5 - 6, left - 0.9);
  addWall(right + 0.9, X(W - 1) + 0.5 + 6);
  const wall = new THREE.Mesh(mergeGeometries(geos)!, wallMat);
  const top = new THREE.Mesh(mergeGeometries(tops)!, st.palisade ? woodMat : topMat);
  for (const m of [wall, top]) {
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }

  // ---------------- Casa do portão: torres + arco + portas abertas ----------------
  const gh = new THREE.Group();
  gh.position.set((left + right) / 2, 0, z);
  const span = right - left;
  for (const s of [-1, 1]) {
    const tower = new THREE.Group();
    tower.position.x = s * (span / 2 + 0.55);
    if (st.palisade) {
      // pilares baixos (a câmera vem do lado da cidade: nada alto na frente da defesa)
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.35, 1.0), woodMat);
      body.position.y = 0.675;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 6), woodMat);
      for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
        const c = cap.clone();
        c.position.set(dx, 1.52, dz);
        tower.add(c);
      }
      tower.add(body);
    } else {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 1.35, 12), wallMat);
      body.position.y = 0.675;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.16, 12), topMat);
      ring.position.y = 1.42;
      tower.add(body, ring);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), st.sun ? mat(0xb8401e) : topMat);
        m.position.set(Math.cos(a) * 0.6, 1.6, Math.sin(a) * 0.6);
        tower.add(m);
      }
    }
    // estandarte na torre
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.9, 1, 4), new THREE.MeshLambertMaterial({ color: st.banner, side: THREE.DoubleSide }));
    flag.position.set(0, 1.0, -0.72);
    tower.add(flag);
    tower.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    gh.add(tower);
  }
  if (st.sun) {
    // disco solar entalhado sobre o arco
    const sun = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), new THREE.MeshLambertMaterial({ color: 0xe8b050, emissive: 0x5a3000 }));
    sun.position.set(-(span / 2 + 0.55), 1.2, -0.75);
    sun.rotation.y = Math.PI;
    gh.add(sun);
    for (let i = 0; i < 12; i++) {
      const ray = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.02), sun.material);
      const a = (i / 12) * Math.PI * 2;
      ray.position.set(-(span / 2 + 0.55) + Math.cos(a) * 0.46, 1.2 + Math.sin(a) * 0.46, -0.755);
      ray.rotation.z = a - Math.PI / 2;
      gh.add(ray);
    }
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
