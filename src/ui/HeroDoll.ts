/**
 * Boneco 3D animado para as janelas de personagem (HeroCard): o herói em
 * idle com giro vitrine, no lugar da imagem estática. Um renderer pequeno
 * próprio, desligado fora da janela.
 */
import * as THREE from 'three';
import type { HeroKind } from '../core/progression/skills';
import { ModelUnitView } from '../render/units/model/ModelUnitView';

export class HeroDoll {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly view: ModelUnitView;
  private readonly spin = new THREE.Group();
  private raf = 0;
  private last = 0;
  private dead = false;

  constructor(
    private readonly container: HTMLElement,
    kind: HeroKind,
  ) {
    const canvas = document.createElement('canvas');
    this.container.appendChild(canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 50);
    this.scene.add(new THREE.HemisphereLight(0x9ab0e8, 0x201812, 0.9));
    const key = new THREE.DirectionalLight(0xfff0d8, 1.1);
    key.position.set(-2.5, 5, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6a8cff, 0.5);
    rim.position.set(2.5, 3, -3);
    this.scene.add(rim);
    this.view = new ModelUnitView(kind, 'party');
    this.view.hideHp();
    this.spin.add(this.view.root);
    this.scene.add(this.spin);
    const hh = this.view.height || 2;
    this.camera.position.set(0, hh * 0.62, hh * 1.9);
    this.camera.lookAt(0, hh * 0.48, 0);
  }

  /** Liga a vitrine (chamar com a janela já visível). */
  start(): void {
    this.fit();
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.dead) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.spin.rotation.y += dt * 0.55;
      this.view.update(dt, 1, 1, this.camera.quaternion);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private fit(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  dispose(): void {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.view.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
