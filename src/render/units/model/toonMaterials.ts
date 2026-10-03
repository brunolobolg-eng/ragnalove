import * as THREE from 'three';

/**
 * Materiais dos personagens 3D (estilo cel/toon, originais):
 *  - corpo: MeshToonMaterial em 3 faixas + luz de recorte (fresnel) + tinta de dano/queimadura + fade;
 *  - contorno: casco invertido (inverted hull) extrudado pelas normais suavizadas;
 *  - espectro: casco aditivo maior, só fresnel, para o "espectro de combate".
 * Todos funcionam com SkinnedMesh (a extrusão acontece depois do skinning).
 */

let gradient: THREE.DataTexture | undefined;
/** Rampa de 3 tons: sombra, meio-tom, luz — o "degrau" típico de cel shading. */
function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const d = new Uint8Array([128, 128, 128, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

/** Uniforms compartilhados por todas as partes de UMA unidade (um flash de dano pinta tudo). */
export interface UnitUniforms {
  uTint: { value: THREE.Color };
  uRim: { value: number };
  uRimColor: { value: THREE.Color };
  uOpacity: { value: number };
}

export function createUnitUniforms(): UnitUniforms {
  return {
    uTint: { value: new THREE.Color(1, 1, 1) },
    uRim: { value: 0.45 },
    uRimColor: { value: new THREE.Color(1.0, 0.92, 0.75) },
    uOpacity: { value: 1 },
  };
}

export function createBodyMaterial(u: UnitUniforms): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint;\nuniform float uRim;\nuniform vec3 uRimColor;\nuniform float uOpacity;')
      .replace(
        '#include <opaque_fragment>',
        `float rimK = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
         rimK = smoothstep(0.58, 1.0, rimK) * 0.95;
         outgoingLight = outgoingLight * uTint + uRimColor * rimK * uRim;
         diffuseColor.a *= uOpacity;
         #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'vg-toon-body';
  return m;
}

/** Contorno escuro (casco invertido). `thickness` em unidades do modelo. */
export function createOutlineMaterial(u: UnitUniforms, thickness: number, color = 0x1a1420): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  const th = { value: thickness };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOutline = th;
    sh.uniforms.uOpacity = u.uOpacity;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aSmoothNormal;\nuniform float uOutline;')
      // usa a normal suavizada (sem rachar nas quinas) — o skinning transforma ela em seguida
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = aSmoothNormal;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\ntransformed += normalize(objectNormal) * uOutline;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uOpacity;')
      .replace('#include <opaque_fragment>', 'diffuseColor.a *= uOpacity;\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'vg-toon-outline';
  return m;
}

/** Espectro de combate: casco aditivo translúcido com borda brilhante, cresce com `uGrow`. */
export function createSpectreMaterial(color: THREE.Color): THREE.MeshBasicMaterial & { userData: { grow: { value: number }; intensity: { value: number }; time: { value: number } } } {
  const grow = { value: 0 };
  const intensity = { value: 0 };
  const time = { value: 0 };
  const col = { value: color.clone() };
  // Faces de trás do casco inflado: o corpo tampa o miolo e sobra só a aura em volta da silhueta.
  // Estilo anime: faixa sólida em volta da silhueta (mistura normal), não um brilho que estoura no bloom.
  const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.BackSide });
  m.userData = { grow, intensity, time };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uGrow: grow, uIntensity: intensity, uTime: time, uGhost: col });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aSmoothNormal;\nuniform float uGrow;\nuniform float uTime;\nvarying vec3 vN;\nvarying vec3 vV;\nvarying float vH;')
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = aSmoothNormal;')
      .replace(
        '#include <skinning_vertex>',
        `#include <skinning_vertex>
         vH = transformed.y;
         // cresce e "sobe" um pouco, ondulando como fumaça
         transformed += normalize(objectNormal) * uGrow * (0.6 + 0.4 * sin(uTime * 6.0 + transformed.y * 9.0));
         transformed.y += uGrow * 0.5;`,
      )
      .replace('#include <project_vertex>', '#include <project_vertex>\nvN = normalize(normalMatrix * objectNormal);\nvV = -mvPosition.xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uIntensity;\nuniform vec3 uGhost;\nuniform float uTime;\nvarying vec3 vN;\nvarying vec3 vV;\nvarying float vH;')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
         // cor sem estourar (o tom do herói, no máximo 1) e dois tons: miolo cheio + borda externa clara
         vec3 base = uGhost / max(1.0, max(uGhost.r, max(uGhost.g, uGhost.b)));
         vec3 col = mix(base * 0.85, mix(base, vec3(1.0), 0.6), step(0.72, f));
         // labaredas subindo recortadas a seco (traço de anime, sem degradê)
         float tongue = step(0.22, fract(vH * 7.0 - uTime * 1.6 + sin(vH * 31.0) * 0.15));
         // só a faixa da silhueta: as costas do casco por trás de braços/cabelo (de frente pra câmera) não pintam o corpo
         float a = clamp(uIntensity * 1.5, 0.0, 0.9) * mix(0.55, 1.0, tongue) * step(0.6, f);
         vec4 diffuseColor = vec4(col, a);`,
      );
  };
  m.customProgramCacheKey = () => 'vg-toon-spectre';
  return m as ReturnType<typeof createSpectreMaterial>;
}

/** Material "emissivo" para brilhos (orbe do cajado, olhos do zumbi) — o bloom pega. */
export function createGlowMaterial(u: UnitUniforms, color: THREE.Color): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOpacity = u.uOpacity;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uOpacity;')
      .replace('#include <opaque_fragment>', 'diffuseColor.a *= uOpacity;\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'vg-glow';
  return m;
}
