import * as THREE from 'three';

/**
 * Armas presas nos ossos da mão dos heróis importados (GLB que vêm de mãos vazias).
 * Medidas em unidades do modelo (altura do boneco ≈ 1). Na pose de descanso a mão aponta
 * para baixo e a arma fica ao longo de +Z (para a frente); ao erguer o braço para atirar ou
 * golpear, ela acompanha o osso.
 */
export type WeaponType = 'bow' | 'dagger' | 'axe';
export interface WeaponAttach {
  type: WeaponType;
  bone: string;
  /** cor de destaque (gume, pontas) */
  accent?: number;
  /** inclina a arma (graus, em volta do X da mão): + leva a ponta de +Z para baixo */
  tilt?: number;
  /** tamanho da arma (1 = padrão) */
  scale?: number;
}

function toon(color: number, emissive = 0x000000, emissiveIntensity = 0): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, emissive, emissiveIntensity });
}

/** Arco: braços curvos de madeira com pontas douradas e corda. A barriga aponta para onde a mão aponta (−Y). */
function bow(accent: number): THREE.Group {
  const g = new THREE.Group();
  const len = 0.26;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 12 - 1;
    // recurvo: curva principal + pontas que voltam
    const bend = -0.075 * (1 - t * t) + 0.018 * Math.pow(Math.abs(t), 6);
    pts.push(new THREE.Vector3(0, bend, t * len));
  }
  const limb = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.009, 6), toon(0x7a4a24));
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.06, 8).rotateX(Math.PI / 2), toon(0x3a2414));
  grip.position.set(0, -0.075, 0);
  const tipMat = toon(0xe8c060, accent, 0.35);
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.035, 6).rotateX((s * Math.PI) / 2), tipMat);
    tip.position.set(0, pts[s < 0 ? 0 : 24].y, s * (len + 0.012));
    g.add(tip);
  }
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, len * 2, 4).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf2ead8 }));
  string.position.set(0, pts[0].y + 0.002, 0);
  g.add(limb, grip, string);
  // o punho fica na mão
  g.position.set(0, 0.07, 0);
  return g;
}

/** Adaga: lâmina losango com gume brilhante, guarda, cabo e pomo. Lâmina ao longo de +Z. */
function dagger(accent: number): THREE.Group {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.022, 0.17, 4, 1).rotateX(Math.PI / 2).scale(1, 0.32, 1), toon(0xd8deea, accent, 0.25));
  blade.position.z = 0.115;
  const edge = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.026, 0.175, 4, 1).rotateX(Math.PI / 2).scale(1, 0.12, 1), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  edge.position.z = 0.115;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.016, 0.014), toon(0x4a3a52, accent, 0.2));
  guard.position.z = 0.028;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.05, 8).rotateX(Math.PI / 2), toon(0x24182a));
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), toon(0x4a3a52, accent, 0.4));
  pommel.position.z = -0.03;
  g.add(blade, edge, guard, grip, pommel);
  return g;
}

/**
 * Machado de batalha: cabo de madeira com tiras de couro, cabeça de aço com lâmina em meia-lua
 * (gume para +X), contra-ponta de osso e ponta no topo. Cabo ao longo de +Z, a mão perto do pé.
 */
function axe(accent: number): THREE.Group {
  const g = new THREE.Group();
  const len = 0.46;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.016, len, 8).rotateX(Math.PI / 2), toon(0x5a3a22));
  handle.position.z = len / 2 - 0.08;
  g.add(handle);
  const wrapMat = toon(0x2e1c12);
  for (const z of [-0.02, 0.02, 0.2]) {
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.022, 8).rotateX(Math.PI / 2), wrapMat);
    wrap.position.z = z;
    g.add(wrap);
  }
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), toon(0x6a6e78));
  pommel.position.z = -0.085;
  g.add(pommel);
  // lâmina em meia-lua no plano XZ (gume em +X), espessura em Y
  const head = len - 0.12;
  const s = new THREE.Shape();
  s.moveTo(0.012, -0.05);
  s.quadraticCurveTo(0.07, -0.07, 0.13, -0.12);
  s.quadraticCurveTo(0.165, 0, 0.13, 0.12);
  s.quadraticCurveTo(0.07, 0.07, 0.012, 0.05);
  s.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(s, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 10 });
  bladeGeo.translate(0, 0, -0.007).rotateX(-Math.PI / 2);
  const blade = new THREE.Mesh(bladeGeo, toon(0xaab2bf, accent, 0.12));
  blade.position.z = head;
  // gume claro (aço afiado), só um filete na borda
  const e = new THREE.Shape();
  e.moveTo(0.118, -0.11);
  e.quadraticCurveTo(0.165, 0, 0.118, 0.11);
  e.quadraticCurveTo(0.148, 0, 0.118, -0.11);
  const edgeGeo = new THREE.ExtrudeGeometry(e, { depth: 0.03, bevelEnabled: false, curveSegments: 10 });
  edgeGeo.translate(0, 0, -0.015).rotateX(-Math.PI / 2);
  const edge = new THREE.Mesh(edgeGeo, toon(0xeef3fa));
  edge.position.z = head;
  // contra-ponta de osso do lado oposto e ponta no topo
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.08, 6).rotateZ(Math.PI / 2), toon(0xe6dcc4));
  spike.position.set(-0.05, 0, head);
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.06, 6).rotateX(Math.PI / 2), toon(0x8a909c));
  top.position.z = len - 0.05;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.07, 8).rotateX(Math.PI / 2), toon(0x3e3a40));
  collar.position.z = head;
  g.add(blade, edge, spike, top, collar);
  return g;
}

/** Cria a arma e a prende no osso (nada acontece se o osso não existir). */
export function attachWeapon(bones: Map<string, THREE.Bone>, w: WeaponAttach): THREE.Object3D | undefined {
  const b = bones.get(w.bone);
  if (!b) return undefined;
  const accent = w.accent ?? 0xffd67a;
  const mesh = w.type === 'bow' ? bow(accent) : w.type === 'axe' ? axe(accent) : dagger(accent);
  if (w.tilt) mesh.rotation.x = (w.tilt * Math.PI) / 180;
  if (w.scale) mesh.scale.setScalar(w.scale);
  // um pouco para dentro da palma
  mesh.position.y -= 0.035;
  mesh.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  b.add(mesh);
  return mesh;
}
