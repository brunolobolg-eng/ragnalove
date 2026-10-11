/**
 * Shaders do pacote de VFX, portados do Godot para GLSL (Three.js), quase linha a linha:
 * - Magic Circles 3D Free (CC BY 4.0): área do círculo, ondulação e faíscas (area / circle / ripple / spark).
 * - Free Hit VFX (uso livre): golpe em fatia e anel de choque (hit_burst / impact_ring).
 * As texturas de ruído dos originais viraram ruído calculado na GPU: mesmo efeito, sem textura extra.
 * Sistema de coordenadas: a fatia e o anel usam UV com origem no topo, como o Godot.
 */

/** Ruído sem semente (golpe, anel, brasas). Mesmo hash inteiro da área, então não rasga em GPUs antigas. */
export const NOISE_GLSL = /* glsl */ `
#define TAU 6.283185307179586
#define PI 3.141592653589793
float nHash(ivec2 i) {
  uvec2 q = uvec2(i) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u;
  return float(n) * (1.0 / 4294967295.0);
}
float nValue(vec2 p) {
  vec2 fl = floor(p);
  vec2 f = p - fl;
  f = f * f * (3.0 - 2.0 * f);
  ivec2 i = ivec2(fl);
  return mix(mix(nHash(i), nHash(i + ivec2(1, 0)), f.x), mix(nHash(i + ivec2(0, 1)), nHash(i + ivec2(1, 1)), f.x), f.y);
}
float nFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int k = 0; k < 4; k++) {
    v += a * nValue(p);
    p = p * 2.0 + vec2(17.0, 9.0);
    a *= 0.5;
  }
  return clamp(v / 0.9375, 0.0, 1.0);
}
`;

/** Área do círculo mágico: ruído com semente (uSeed) e as runas, como em area.gdshaderinc. */
const AREA_GLSL = /* glsl */ `
uniform float uSeed;
int areaWrap(int i, float n) {
  return i - int(n) * int(floor((float(i) + 0.5) / n));
}
float areaHash(float x) {
  return nHash(ivec2(int(floor(x)), int(uSeed * 37.0) + 11));
}
float areaNoise(vec2 p, float period) {
  vec2 fl = floor(p);
  vec2 f = p - fl;
  f = f * f * (3.0 - 2.0 * f);
  int x0 = int(fl.x);
  int x1 = x0 + 1;
  int y0 = int(fl.y) + int(uSeed * 37.0) * 101;
  if (period > 0.0) {
    x0 = areaWrap(x0, period);
    x1 = areaWrap(x1, period);
  }
  return mix(mix(nHash(ivec2(x0, y0)), nHash(ivec2(x1, y0)), f.x),
             mix(nHash(ivec2(x0, y0 + 1)), nHash(ivec2(x1, y0 + 1)), f.x), f.y);
}
float areaLine(float d, float w) {
  return smoothstep(w, w * 0.35, abs(d));
}
float areaRune(vec2 q, float h, float w) {
  float bits = floor(h * 31.0) + 1.0;
  float s = 0.0;
  s += step(0.5, mod(bits, 2.0)) * areaLine(q.x - 0.5, w) * step(abs(q.y - 0.5), 0.36);
  s += step(0.5, mod(floor(bits / 2.0), 2.0)) * areaLine(q.y - 0.84, w) * step(abs(q.x - 0.5), 0.26);
  s += step(0.5, mod(floor(bits / 4.0), 2.0)) * areaLine(q.y - 0.16, w) * step(abs(q.x - 0.5), 0.26);
  s += step(0.5, mod(floor(bits / 8.0), 2.0)) * areaLine((q.y - 0.5) - (q.x - 0.5) * 1.3, w) * step(abs(q.x - 0.5), 0.26);
  s += step(0.5, mod(floor(bits / 16.0), 2.0)) * areaLine(length(q - vec2(0.5, 0.5)) - 0.2, w);
  return clamp(s, 0.0, 1.0);
}
uniform vec3 uColor;
uniform vec3 uEdge;
uniform float uEnergy;
uniform float uIntensity;
uniform float uGrow;
uniform float uAge;
uniform float uSides;
uniform float uTurb;
vec4 areaColor(float heat, float a) {
  vec3 c = mix(uEdge, uColor, clamp(heat, 0.0, 1.0));
  return vec4(c * uEnergy, clamp(a * uIntensity, 0.0, 1.0));
}
`;

const CIRCLE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Círculo mágico: anéis, faixa de runas girando, estrela com laços e brilho central. */
const CIRCLE_FRAG = /* glsl */ `
varying vec2 vUv;
float star(vec2 p, float n, float k, float r, float rot, float dotR) {
  float d = 1e3;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= n) break;
    float a0 = rot + TAU * float(i) / n;
    float a1 = rot + TAU * (float(i) + k) / n;
    vec2 a = r * vec2(cos(a0), sin(a0));
    vec2 ba = r * vec2(cos(a1), sin(a1)) - a;
    vec2 pa = p - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    d = min(d, length(pa - ba * h));
    if (dotR > 0.0) d = min(d, abs(length(pa) - dotR));
  }
  return d;
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float turn = fract(ang / TAU + 0.5);
  float w = max(fwidth(r) * 1.3, 0.007);
  float wob = (areaNoise(vec2(turn * 24.0, uAge * 3.0), 24.0) - 0.5) * uTurb * 0.035;
  float rr = r + wob;
  float rings = areaLine(rr - 0.955, w * 1.6) + areaLine(rr - 0.915, w) + areaLine(rr - 0.745, w)
              + areaLine(rr - 0.705, w * 1.5) + areaLine(rr - 0.3, w);
  float cells = 28.0;
  float band = fract(turn + uAge * 0.025);
  float cell = floor(band * cells);
  vec2 q = vec2(fract(band * cells), (r - 0.75) / 0.16);
  float runes = step(abs(r - 0.83), 0.08) * areaRune(q, areaHash(cell + 7.0), 0.09);
  float k = uSides >= 7.0 ? 3.0 : (uSides >= 5.0 ? 2.0 : 1.0);
  float rot = -uAge * 0.12 + uSeed;
  float figure = 0.0;
  if (r < 0.75) {
    figure = areaLine(star(p, uSides, k, 0.69, rot, 0.0), w * 1.3)
           + areaLine(star(p, uSides, 1.0, 0.69, rot, 0.06), w) * 0.7
           + areaLine(star(p, uSides, k, 0.3, -rot * 1.6, 0.0), w) * 0.8;
  }
  float centre = areaLine(r - 0.11, w) + smoothstep(0.08, 0.0, r) * 0.7;
  float shape = clamp(rings + runes + figure + centre, 0.0, 1.0);
  shape *= 1.0 - uTurb * 0.35 * areaNoise(vec2(uAge * 7.0, 3.0), 0.0);
  float pulse = 0.85 + 0.15 * sin(uAge * 3.0 + uSeed);
  float halo = exp(-abs(r - 0.83) * 9.0) * 0.3 + exp(-r * 3.0) * 0.2;
  // o desenho se fecha em volta: só aparece a parte já formada (uGrow vai de 0 a 1)
  float reveal = 1.0 - step(uGrow, fract(turn + 0.25));
  float a = (shape * pulse + halo * (1.0 - shape)) * reveal * smoothstep(1.0, 0.97, r);
  vec4 o = areaColor(shape * pulse, a);
  gl_FragColor = vec4(o.rgb, o.a);
}
`;

/** Ondulação: anéis que se espalham pelo chão e somem na borda. */
const RIPPLE_FRAG = /* glsl */ `
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float turn = fract(atan(p.y, p.x) / TAU + 0.5);
  float w = max(fwidth(r), 0.006);
  float wob = (areaNoise(vec2(turn * 12.0, r * 4.0 - uAge), 12.0) - 0.5) * uTurb * 0.12;
  float rings = 0.0;
  for (int i = 0; i < 4; i++) {
    float ph = fract(uAge * 0.45 + float(i) * 0.25);
    float width = 0.012 + ph * 0.05;
    rings += smoothstep(width + w, 0.0, abs(r + wob - ph * uGrow)) * (1.0 - ph) * smoothstep(0.0, 0.12, ph);
  }
  float arcs = mix(1.0, smoothstep(0.3, 0.6, areaNoise(vec2(turn * 10.0, uAge * 0.3 + r), 10.0)), 0.6);
  float shape = clamp(rings * arcs * 1.3, 0.0, 1.0);
  float centre = exp(-r * 6.0) * (0.55 + 0.2 * sin(uAge * 4.0 + uSeed));
  float rim = areaLine(r - 0.96, w * 1.5) * 0.35 * uGrow;
  float a = (shape + centre + rim) * smoothstep(1.0, 0.97, r);
  vec4 o = areaColor(shape + centre * 0.8, a);
  gl_FragColor = vec4(o.rgb, o.a);
}
`;

/** Faíscas (pontos): uma forma por partícula (spark.gdshader), cor e tamanho vindos de cada uma. */
const SPARK_VERT = /* glsl */ `
attribute vec3 aCore;
attribute vec3 aEdge;
attribute vec4 aParams;
uniform float uScale;
varying vec3 vCore;
varying vec3 vEdge;
varying vec4 vParams;
void main() {
  vCore = aCore;
  vEdge = aEdge;
  vParams = aParams;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(aParams.y * uScale / max(0.001, -mv.z), 256.0);
  gl_Position = projectionMatrix * mv;
}
`;

const SPARK_FRAG = /* glsl */ `
uniform float uEnergy;
uniform float uAge;
varying vec3 vCore;
varying vec3 vEdge;
varying vec4 vParams;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  float shape = vParams.z;
  float seed = vParams.w;
  float s;
  float heat;
  if (shape < 0.5) {
    s = exp(-r * r * 7.0);
    heat = exp(-r * r * 24.0) * 1.2;
  } else if (shape < 1.5) {
    vec2 q = abs(p);
    s = max(smoothstep(0.14, 0.0, q.x) * (1.0 - q.y), smoothstep(0.14, 0.0, q.y) * (1.0 - q.x)) + exp(-r * r * 18.0);
    heat = s;
  } else if (shape < 2.5) {
    float a6 = mod(atan(p.y, p.x) + PI / 6.0, PI / 3.0) - PI / 6.0;
    s = smoothstep(0.12, 0.03, r * abs(sin(a6))) * step(r, 0.9) + exp(-r * r * 20.0) * 0.5;
    heat = s;
  } else if (shape < 3.5) {
    s = smoothstep(0.14, 0.0, abs(r - 0.72)) + smoothstep(0.25, 0.0, length(p - vec2(-0.3, 0.3))) * 0.8 + 0.15 * step(r, 0.72);
    heat = 0.3 + 0.7 * smoothstep(0.25, 0.0, length(p - vec2(-0.3, 0.3)));
  } else if (shape < 4.5) {
    s = exp(-r * r * 9.0);
    heat = 1.0;
  } else if (shape < 5.5) {
    s = exp(-r * r * 3.0) * (0.3 + 0.4 * nValue(p * 2.5 + vec2(seed * 3.0, uAge * 0.5)));
    heat = 1.0 - r * 0.6;
  } else if (shape < 6.5) {
    vec2 q = vec2(p.x + p.y, p.y - p.x) * 0.7071;
    float e = length(q * vec2(1.0, 2.3));
    s = smoothstep(0.85, 0.65, e) * (0.75 + 0.25 * smoothstep(0.1, 0.0, abs(q.y)));
    heat = 0.35 + 0.65 * smoothstep(0.08, 0.0, abs(q.y)) * step(abs(q.x), 0.75);
  } else if (shape < 7.5) {
    float up = 0.5 * sqrt(clamp((p.y + 0.9) / 1.2, 0.0, 1.0));
    s = p.y < 0.3 ? smoothstep(up, up * 0.6, abs(p.x)) * step(-0.9, p.y)
      : smoothstep(0.5, 0.36, length(vec2(p.x, p.y - 0.3)));
    heat = 0.35 + 0.65 * exp(-dot(p - vec2(-0.15, 0.35), p - vec2(-0.15, 0.35)) * 12.0);
  } else if (shape < 8.5) {
    // cruz de cura (heal_particle): dois braços dentro de um quadrado
    s = step(max(abs(p.x), abs(p.y)), 1.0) * max(step(abs(p.x), 0.3), step(abs(p.y), 0.3));
    heat = 0.5 - 0.5 * p.y;
  } else {
    // cristal de gelo (ice_particle): raios que se ramificam, sorteados por partícula
    float ang = atan(p.x, p.y);
    float rand1 = floor(seed * 5.0);
    float rand2 = floor(seed * 3.0);
    float circleMask = max(1.0 - r, 0.0);
    float branches = pow(sin(r * PI * (3.0 + rand1)) * 0.5 + 0.5, 10.0) * circleMask;
    float streaks = cos(ang * (5.0 + rand2)) + pow(max(1.0 - r, 0.0), 4.0) * 4.0 + branches * 3.0;
    s = step(1.0, streaks);
    heat = 0.5 + 0.5 * cos(ang);
  }
  float a = clamp(s * vParams.x, 0.0, 1.0) * step(r, 1.0);
  if (a <= 0.001) discard;
  vec3 c = mix(vEdge, vCore, clamp(heat, 0.0, 1.0)) * uEnergy;
  gl_FragColor = vec4(c, a);
}
`;

/** Quad de frente para a câmera, mantendo a escala do nó (como o billboard do Godot). */
const BILLBOARD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  // UV com origem no topo (convenção do Godot)
  vUv = vec2(uv.x, 1.0 - uv.y);
  vec4 centerView = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 sc = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  gl_Position = projectionMatrix * vec4(centerView.xyz + vec3(position.xy * sc, 0.0), 1.0);
}
`;

/** Golpe em fatia (hit_burst): textura do pacote, dissolução com borda acesa e distorção. */
const SLASH_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uDissolveEdge;
uniform float uProgress;
uniform float uEmission;
uniform float uFadeIn;
uniform float uDissolveAmount;
uniform float uEdgeWidth;
uniform float uDistortion;
uniform float uNoiseScale;
uniform float uSpin;
uniform float uAngleOffset;
uniform vec2 uStretch;
uniform float uBlackCut;
varying vec2 vUv;
vec2 rotateUv(vec2 uv, float a) {
  float s = sin(a);
  float c = cos(a);
  uv -= 0.5;
  return vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) + 0.5;
}
void main() {
  float ang = uAngleOffset + uSpin * uProgress;
  vec2 uv = rotateUv(vUv, ang);
  uv = (uv - 0.5) / uStretch + 0.5;
  vec2 np = uv * uNoiseScale + vec2(uProgress * 0.35, -uProgress * 0.2);
  vec2 n = vec2(nFbm(np), nFbm(np + vec2(31.7, 12.3))) - 0.5;
  uv += n * uDistortion * uProgress;
  uv = clamp(uv, vec2(0.002), vec2(0.998));
  // a textura do Three vem com a imagem de cabeça para baixo: volta para a convenção do topo
  vec4 s = texture2D(uTex, vec2(uv.x, 1.0 - uv.y));
  float m = clamp((s.r - uBlackCut) / (1.0 - uBlackCut), 0.0, 1.0) * s.a;
  float envIn = smoothstep(0.0, uFadeIn, uProgress);
  float fadeOut = 1.0 - smoothstep(0.6, 1.0, uProgress);
  float dn = nFbm(rotateUv(vUv, uAngleOffset) * uNoiseScale * 1.7);
  float dissP = smoothstep(0.3, 1.0, uProgress) * uDissolveAmount;
  float threshold = dissP * (1.0 + uEdgeWidth) - uEdgeWidth * 0.5;
  float vis = smoothstep(threshold, threshold + 0.06, dn);
  float edge = (1.0 - smoothstep(threshold + 0.06, threshold + uEdgeWidth, dn)) * vis * step(0.02, dissP);
  float a = m * envIn * vis * fadeOut;
  vec3 col = mix(uColorA, uColorB, smoothstep(0.03, 0.26, uProgress));
  col += uDissolveEdge * edge;
  gl_FragColor = vec4(col * uEmission, clamp(a, 0.0, 1.0));
}
`;

/** Anel de choque (impact_ring): onda que se expande com flash no centro. */
const RING_FRAG = /* glsl */ `
uniform vec3 uRingColor;
uniform vec3 uHotColor;
uniform float uIntensityMult;
uniform float uEmission;
uniform float uProgress;
uniform float uRingWidth;
varying vec2 vUv;
void main() {
  vec2 c = vUv - 0.5;
  float dist = length(c) * 2.0;
  float angle = atan(c.y, c.x);
  // ruído num círculo: a borda do anel não tem costura
  float n = nFbm(vec2(cos(angle), sin(angle)) * 1.5 + vec2(3.1, 0.7));
  float lead = uProgress * (0.85 + 0.15 * n);
  float w = uRingWidth * (0.5 + uProgress);
  float band = smoothstep(lead - w, lead, dist) * (1.0 - smoothstep(lead, lead + w * 0.5, dist));
  float flash = pow(clamp(1.0 - dist * 1.6, 0.0, 1.0), 2.0) * pow(clamp(1.0 - uProgress * 2.2, 0.0, 1.0), 1.5);
  float fade = pow(clamp(1.0 - uProgress, 0.0, 1.0), 1.4);
  float a = (band * (0.55 + 0.45 * n) + flash) * fade * uIntensityMult;
  vec3 col = mix(uRingColor, uHotColor, clamp(flash + band * 0.3 * (1.0 - uProgress), 0.0, 1.0));
  gl_FragColor = vec4(col * uEmission, clamp(a, 0.0, 1.0));
}
`;

/** Flash radial do golpe (o clarão do primeiro instante do preset do Free Hit VFX). */
const FLASH_FRAG = /* glsl */ `
uniform vec3 uFlashColor;
uniform float uEmission;
uniform float uProgress;
uniform float uFlashLife;
varying vec2 vUv;
void main() {
  float dist = length(vUv - 0.5) * 2.0;
  float a = pow(clamp(1.0 - dist * 1.6, 0.0, 1.0), 2.0) * pow(clamp(1.0 - uProgress / uFlashLife, 0.0, 1.0), 1.5);
  gl_FragColor = vec4(uFlashColor * uEmission, clamp(a, 0.0, 1.0));
}
`;

/** Aura em cilindro (aura_sphere): faixa com ruído que escorre para cima, pulsa e some nas bordas. */
const AURA_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const AURA_FRAG = /* glsl */ `
uniform vec3 uPrimary;
uniform vec3 uSecondary;
uniform vec3 uTertiary;
uniform float uEmission;
uniform float uTime;
uniform float uTwist;
uniform vec2 uScroll;
uniform float uWaviness;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float u = vUv.x;
  float v = vUv.y;
  float wave = sin(v * 40.0 - uTime);
  float uu = u + wave * 0.1 * uWaviness;
  // ruído num círculo em volta do cilindro: sem costura na emenda da faixa
  float ang = (uu - v * uTwist) * TAU;
  vec2 cp = vec2(cos(ang), sin(ang)) * 1.2 + vec2(v * 1.6, 0.0) + uTime * uScroll;
  float noise = nFbm(cp * 1.5);
  // máscara vertical: a faixa aparece no meio e some em cima e embaixo
  float mask = pow(max((1.0 - abs(v * 2.0 - 1.0) - 0.5) / 0.5, 0.0), 0.2);
  // limiar mais baixo que o do Godot: o ruído aqui tem média menor, e a faixa precisa aparecer inteira
  float value = smoothstep(0.36, 0.72, max(noise * mask, 0.0));
  vec3 color = mix(uSecondary, uPrimary, value);
  if (!gl_FrontFacing) color = uTertiary;
  float a = clamp((value - 0.1), 0.0, 1.0) * uAlpha;
  gl_FragColor = vec4(color * uEmission, a);
}
`;

/** Brilho com textura do pacote (levelup, sparkglint, smokepuff): tingido pela cor do elemento, aditivo. */
const SPRITE_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec3 uTint;
uniform float uEmission;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  // a textura do Three vem de cabeça para baixo: volta para a convenção do topo, como no golpe
  vec4 s = texture2D(uTex, vec2(vUv.x, 1.0 - vUv.y));
  float a = s.a * uAlpha;
  if (a <= 0.001) discard;
  gl_FragColor = vec4(mix(vec3(1.0), uTint, 0.6) * s.rgb * uEmission, a);
}
`;

/** Fragmentos com as funções de ruído e área prontas para o material (ordem importa: ruído primeiro). */
export const SHADER_CIRCLE = { vertex: CIRCLE_VERT, fragment: /* glsl */ `${NOISE_GLSL}${AREA_GLSL}${CIRCLE_FRAG}` };
export const SHADER_RIPPLE = { vertex: CIRCLE_VERT, fragment: /* glsl */ `${NOISE_GLSL}${AREA_GLSL}${RIPPLE_FRAG}` };
export const SHADER_SPARK = { vertex: SPARK_VERT, fragment: /* glsl */ `${NOISE_GLSL}${SPARK_FRAG}` };
export const SHADER_SLASH = { vertex: BILLBOARD_VERT, fragment: /* glsl */ `${NOISE_GLSL}${SLASH_FRAG}` };
export const SHADER_RING = { vertex: BILLBOARD_VERT, fragment: /* glsl */ `${NOISE_GLSL}${RING_FRAG}` };
export const SHADER_FLASH = { vertex: BILLBOARD_VERT, fragment: FLASH_FRAG };
export const SHADER_AURA = { vertex: AURA_VERT, fragment: /* glsl */ `${NOISE_GLSL}${AURA_FRAG}` };
export const SHADER_SPRITE = { vertex: BILLBOARD_VERT, fragment: SPRITE_FRAG };
