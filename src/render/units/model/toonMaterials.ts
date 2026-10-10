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
      .replace(
        '#include <common>',
        `#include <common>
uniform float uIntensity;
uniform vec3 uGhost;
uniform float uTime;
varying vec3 vN;
varying vec3 vV;
varying float vH;
float aHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float aNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(aHash(i), aHash(i + vec2(1.0, 0.0)), f.x), mix(aHash(i + vec2(0.0, 1.0)), aHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`,
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
         // halo suave: forte na silhueta e apagado sobre o corpo (sem recorte seco)
         float rim = smoothstep(0.2, 1.0, f);
         // fiapos fluidos subindo pelo corpo (ruído de valor animado, sem degrau)
         float w = aNoise(vec2(vH * 2.4 - uTime * 1.4, f * 3.0 + uTime * 0.35));
         // miolo na cor da magia (HDR, brilha no bloom) e borda quente quase branca
         vec3 hot = mix(uGhost, vec3(1.0), 0.4);
         vec3 col = mix(uGhost * 0.5, hot, rim) * (0.8 + 0.4 * w);
         float a = clamp(uIntensity, 0.0, 1.0) * rim * (0.3 + 0.7 * w);
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
