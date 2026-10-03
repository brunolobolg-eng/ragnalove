import * as THREE from 'three';
import { RARITY_INFO, type Item } from '../../core/progression/equipment';
import { itemArtCanvas, itemKind } from '../../ui/itemArt';
import { glowTexture, traceTexture } from './kit/vfxTextures';
import type { ParticleLayer } from './Particles';

const beamTexture = traceTexture;

/**
 * Equipamento no chão onde o monstro morreu: ícone flutuando, feixe e brilho na cor da
 * raridade. Fica até o fim da onda, quando é coletado automaticamente (sobe e some).
 */
export class LootFX {
  readonly group = new THREE.Group();
  private readonly icon: THREE.Sprite;
  private readonly beam: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly ring: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly color: THREE.Color;
  private t = Math.random() * 3;
  private age = 0;
  private collectT = -1;
  private sparkAcc = 0;
  done = false;

  constructor(
    readonly item: Item,
    pos: THREE.Vector3,
    private readonly particles: ParticleLayer,
  ) {
    const info = RARITY_INFO[item.rarity];
    this.color = new THREE.Color(info.color);
    const glowColor = this.color.clone().multiplyScalar(2.2);
    const tex = new THREE.CanvasTexture(itemArtCanvas(itemKind(item), item.rarity, 64));
    tex.colorSpace = THREE.SRGBColorSpace;
    this.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    this.icon.scale.setScalar(0.42);
    this.icon.renderOrder = 8;
    this.beam = new THREE.Mesh(
      new THREE.PlaneGeometry(0.35, 1.8).translate(0, 0.9, 0),
      new THREE.MeshBasicMaterial({ map: beamTexture(), color: glowColor, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.beam.renderOrder = 7;
    this.ring = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: glowColor, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.ring.position.y = 0.02;
    this.group.add(this.beam, this.ring, this.icon);
    this.group.position.copy(pos);
    // Míticos e épicos têm feixe mais alto: dá para "ler" o valor do drop de longe.
    const tier = Math.max(0, ['uncommon', 'rare', 'epic', 'mythic'].indexOf(item.rarity === 'legendary' ? 'epic' : item.rarity));
    this.beam.scale.y = 0.7 + tier * 0.35;
  }

  collect(): void {
    if (this.collectT < 0) this.collectT = 0;
  }

  update(dt: number, cam: THREE.Camera): void {
    if (this.done) return;
    this.t += dt;
    this.age += dt;
    const appear = Math.min(1, this.age / 0.25);
    this.beam.rotation.y = Math.atan2(cam.position.x - this.group.position.x, cam.position.z - this.group.position.z);
    this.icon.position.y = 0.45 + Math.sin(this.t * 3) * 0.06;
    const pulse = 0.75 + 0.25 * Math.sin(this.t * 4);
    this.beam.material.opacity = 0.55 * pulse * appear;
    this.ring.material.opacity = 0.6 * pulse * appear;
    this.ring.scale.setScalar(0.9 + 0.1 * pulse);
    this.icon.scale.setScalar(0.42 * appear);
    this.sparkAcc += dt * 4;
    while (this.sparkAcc >= 1) {
      this.sparkAcc--;
      this.particles.glow.emit({
        pos: this.group.position.clone().setY(0.2),
        posJitter: 0.2,
        vel: new THREE.Vector3(0, 0.9, 0),
        velJitter: 0.2,
        life: 0.8,
        size: 0.07,
        sizeEnd: 0.02,
        color: this.color.clone().multiplyScalar(2.5),
      });
    }
    if (this.collectT >= 0) {
      this.collectT += dt;
      const k = Math.min(1, this.collectT / 0.6);
      this.icon.position.y += k * k * 2.2;
      this.icon.material.opacity = 1 - k;
      this.beam.material.opacity *= 1 - k;
      this.ring.material.opacity *= 1 - k;
      if (k >= 1) this.dispose();
    }
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    this.icon.material.map?.dispose();
    this.icon.material.dispose();
    this.beam.material.dispose();
    this.beam.geometry.dispose();
    this.ring.material.dispose();
    this.ring.geometry.dispose();
    this.group.removeFromParent();
  }
}
