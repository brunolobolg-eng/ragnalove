import * as THREE from 'three';

/**
 * Shaders dos sprites 2D — dão "presença" ao personagem plano:
 *  - rim light do lado da luz do sol + leve sombreamento do lado oposto e nos pés;
 *  - balanço secundário (cabelo/capa) no vertex shader, defasado por altura;
 *  - sombra projetada no chão com a silhueta do próprio sprite;
 *  - "espectro" translúcido para os golpes (camada aditiva).
 */

const SWAY_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform float uSway;
  uniform float uGrow;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float y = uv.y;
    // topo (cabelo/cabeça) e barra (capa/roupa) balançam com fases diferentes -> "camadas"
    float top = smoothstep(0.55, 1.0, y) * sin(uTime * 1.7 + uPhase + y * 2.5) * 0.022;
    float hem = (1.0 - smoothstep(0.05, 0.45, y)) * smoothstep(0.0, 0.08, y) * sin(uTime * 2.4 + uPhase * 1.3) * 0.02;
    p.x += (top + hem) * uSway;
    // crescimento a partir dos pés (usado pelo espectro)
    p.x *= 1.0 + uGrow;
    p.y *= 1.0 + uGrow * 1.1;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const SPRITE_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 uTint;
  uniform float uOpacity;
  uniform vec2 uTexel;
  uniform vec2 uLight;
  uniform vec3 uRimColor;
  uniform float uRim;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(map, vUv);
    if (c.a < 0.5) discard;
    // borda voltada para a luz: vizinhos naquela direção são transparentes
    float a1 = texture2D(map, vUv + uLight * uTexel * 2.5).a;
    float a2 = texture2D(map, vUv + uLight * uTexel * 5.0).a;
    float rim = clamp(1.0 - (a1 * 0.6 + a2 * 0.4), 0.0, 1.0);
    // lado oposto à luz um pouco mais escuro (volume)
    float b1 = texture2D(map, vUv - uLight * uTexel * 4.0).a;
    float shade = mix(0.8, 1.0, b1);
    // pés/barra levemente escurecidos (oclusão de contato)
    float ao = mix(0.8, 1.0, smoothstep(0.0, 0.22, vUv.y));
    vec3 col = c.rgb * uTint * shade * ao + uRimColor * rim * uRim;
    gl_FragColor = vec4(col, uOpacity);
  }
`;

export function createSpriteMaterial(phase: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SWAY_VERT,
    fragmentShader: SPRITE_FRAG,
    uniforms: {
      map: { value: null },
      uTime: { value: 0 },
      uPhase: { value: phase },
      uSway: { value: 1 },
      uGrow: { value: 0 },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uOpacity: { value: 1 },
      uTexel: { value: new THREE.Vector2(1 / 256, 1 / 256) },
      uLight: { value: new THREE.Vector2(-0.7, 0.7) },
      uRimColor: { value: new THREE.Color(1.0, 0.9, 0.7) },
      uRim: { value: 0.55 },
    },
    side: THREE.DoubleSide,
  });
}

const SHADOW_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform vec2 uTexel;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    // silhueta borrada (5 amostras) -> sombra suave
    float a = texture2D(map, vUv).a * 0.4;
    a += texture2D(map, vUv + vec2(uTexel.x * 6.0, 0.0)).a * 0.15;
    a += texture2D(map, vUv - vec2(uTexel.x * 6.0, 0.0)).a * 0.15;
    a += texture2D(map, vUv + vec2(0.0, uTexel.y * 6.0)).a * 0.15;
    a += texture2D(map, vUv - vec2(0.0, uTexel.y * 6.0)).a * 0.15;
    // mais forte junto aos pés, esmaece ao se afastar
    float fade = mix(1.0, 0.35, vUv.y);
    gl_FragColor = vec4(0.0, 0.0, 0.0, a * fade * uOpacity);
  }
`;

export function createShadowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SWAY_VERT,
    fragmentShader: SHADOW_FRAG,
    uniforms: {
      map: { value: null },
      uTime: { value: 0 },
      uPhase: { value: 0 },
      uSway: { value: 1 },
      uGrow: { value: 0 },
      uTexel: { value: new THREE.Vector2(1 / 256, 1 / 256) },
      uOpacity: { value: 0.32 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

const GHOST_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform vec2 uTexel;
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float a = texture2D(map, vUv).a;
    // contorno brilhante: diferença entre a silhueta e a silhueta "encolhida"
    float inner = texture2D(map, vUv + vec2(uTexel.x * 5.0, 0.0)).a
                * texture2D(map, vUv - vec2(uTexel.x * 5.0, 0.0)).a
                * texture2D(map, vUv + vec2(0.0, uTexel.y * 5.0)).a
                * texture2D(map, vUv - vec2(0.0, uTexel.y * 5.0)).a;
    float edge = clamp(a - inner, 0.0, 1.0);
    // corpo translúcido com ondulação etérea subindo
    float wave = 0.75 + 0.25 * sin(vUv.y * 22.0 - uTime * 9.0);
    float k = (edge * 1.6 + a * 0.28 * wave) * uIntensity;
    if (k < 0.01) discard;
    gl_FragColor = vec4(uColor * k, k);
  }
`;

export function createGhostMaterial(color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SWAY_VERT,
    fragmentShader: GHOST_FRAG,
    uniforms: {
      map: { value: null },
      uTime: { value: 0 },
      uPhase: { value: 0 },
      uSway: { value: 2.5 },
      uGrow: { value: 0 },
      uTexel: { value: new THREE.Vector2(1 / 256, 1 / 256) },
      uColor: { value: color },
      uIntensity: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}
