import * as THREE from 'three';
import type { ZoneDef } from '../../config/zones';
import type { ParticleLayer } from '../fx/Particles';
import { softCircle } from '../textures';
import type { SceneryHandle } from './BridgeScenery';

/**
 * Mapa PINTADO: a arte do dono é o chão inteiro da zona (sem cenário 3D por cima).
 * - A imagem cobre exatamente a grade (W × H tiles). Vista pela câmera tática (sem giro),
 *   ela aparece como foi pintada; a grade só marca onde se anda.
 * - Pintura sem luz/tone mapping (cores originais); um plano de sombras por cima recebe a
 *   sombra dos heróis e monstros, para eles "pisarem" no chão pintado.
 * - Vida: névoa das cachoeiras, chama das tochas e o brilho do portal (posições em `painted.fx`).
 */
const loader = new THREE.TextureLoader();

export function buildPaintedScenery(zone: ZoneDef): SceneryHandle {
  const P = zone.painted!;
  const W = zone.widthTiles;
  const H = zone.heightTiles;
  const group = new THREE.Group();

  const tex = loader.load(P.image);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  ground.renderOrder = -2;
  group.add(ground);
  // em volta: a própria pintura espelhada e escurecida (a mata "continua" se a câmera passar da borda)
  const rimTex = tex.clone();
  rimTex.wrapS = rimTex.wrapT = THREE.MirroredRepeatWrapping;
  rimTex.repeat.set(3, 3);
  rimTex.offset.set(-1, -1);
  const rim = new THREE.Mesh(new THREE.PlaneGeometry(W * 3, H * 3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: rimTex, color: new THREE.Color(0.38, 0.42, 0.4), toneMapped: false }));
  rim.position.y = -0.02;
  rim.renderOrder = -3;
  group.add(rim);
  // só as sombras das unidades
  const shadows = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.32 }));
  shadows.position.y = 0.004;
  shadows.receiveShadow = true;
  group.add(shadows);

  // ponto da imagem (0..1) → mundo
  const at = (u: number, v: number, y = 0) => new THREE.Vector3((u - 0.5) * W, y, (v - 0.5) * H);
  const torches = (P.fx?.torches ?? []).map(([u, v]) => at(u, v, 0.35));
  const mist = (P.fx?.mist ?? []).map(([u, v]) => at(u, v, 0.2));
  const glowMap = softCircle();
  const torchSprites = torches.map((p) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: new THREE.Color(2.2, 1.1, 0.35), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.copy(p);
    s.scale.setScalar(1.6);
    s.renderOrder = 4;
    group.add(s);
    return s;
  });
  const glows = (P.fx?.glow ?? []).map(([u, v, c]) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: new THREE.Color(c).multiplyScalar(1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
    s.position.copy(at(u, v, 0.6));
    s.scale.setScalar(5);
    s.renderOrder = 4;
    group.add(s);
    return { s, p: s.position.clone() };
  });
  const lights: THREE.PointLight[] = torches.slice(0, 4).map((p) => {
    const l = new THREE.PointLight(0xffa040, 2.2, 6, 1.6);
    l.position.copy(p).setY(1.2);
    group.add(l);
    return l;
  });

  let t = 0;
  let acc = 0;
  return {
    group,
    setLights(on: boolean) {
      for (const l of lights) l.visible = on;
    },
    update(dt: number, particles: ParticleLayer) {
      t += dt;
      acc += dt;
      torchSprites.forEach((s, i) => s.scale.setScalar(1.45 + Math.sin(t * 9 + i * 1.7) * 0.12 + Math.sin(t * 23 + i) * 0.05));
      lights.forEach((l, i) => (l.intensity = 2 + Math.sin(t * 11 + i * 2.1) * 0.35));
      for (const g of glows) (g.s.material as THREE.SpriteMaterial).opacity = 0.45 + Math.sin(t * 2.2) * 0.15;
      if (acc < 0.1) return;
      acc = 0;
      for (const p of torches)
        particles.fire.emit({ pos: p.clone().setY(0.45), posJitter: 0.06, vel: new THREE.Vector3(0, 0.9, 0), velJitter: 0.25, life: 0.45, size: 0.14, sizeEnd: 0.03, color: new THREE.Color(3, 1.3, 0.35), colorEnd: new THREE.Color(0.5, 0.08, 0), count: 1 });
      for (const p of mist)
        particles.smoke.emit({ pos: p, posJitter: 0.9, vel: new THREE.Vector3(0, 0.45, 0), velJitter: 0.25, life: 2.2, size: 0.6, sizeEnd: 1.6, color: new THREE.Color(0.85, 0.95, 1), alpha: 0.16, count: 1 });
      for (const g of glows)
        particles.glow.emit({ pos: g.p, posJitter: 1.1, vel: new THREE.Vector3(0, 0.7, 0), velJitter: 0.3, life: 1.2, size: 0.09, sizeEnd: 0.02, color: new THREE.Color(0.9, 1.4, 3), colorEnd: new THREE.Color(0.1, 0.2, 0.6), count: 1 });
    },
  };
}
