import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export const MAX_HEAT = 8;

/**
 * Passe de pós-processamento dos efeitos (antes do bloom):
 *  - distorção de calor em volta das fontes de fogo (posições vindas dos efeitos, em tela)
 *  - aberração cromática breve (pulso nos impactos fortes)
 *  - correção de cor (saturação/contraste/tons) + vinheta leve
 */
export function createVfxPass(): ShaderPass {
  const heat: THREE.Vector4[] = [];
  for (let i = 0; i < MAX_HEAT; i++) heat.push(new THREE.Vector4(0, 0, 0, 0));
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uHeat: { value: heat },
      uHeatN: { value: 0 },
      uAberr: { value: 0 },
      uVignette: { value: 0.28 },
      uSat: { value: 1.14 },
      uContrast: { value: 1.07 },
      uShadowTint: { value: new THREE.Color(0.95, 0.98, 1.1) },
      uHighTint: { value: new THREE.Color(1.06, 1.02, 0.94) },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uTime, uAspect, uAberr, uVignette, uSat, uContrast;
      uniform vec4 uHeat[${MAX_HEAT}];
      uniform int uHeatN;
      uniform vec3 uShadowTint, uHighTint;
      varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 uv = vUv;
        // calor: ondulação que sobe, mais forte logo acima da chama
        vec2 off = vec2(0.0);
        for (int i = 0; i < ${MAX_HEAT}; i++) {
          if (i >= uHeatN) break;
          vec4 H = uHeat[i];
          vec2 d = (uv - H.xy) / vec2(H.z, H.z * uAspect);
          float w = smoothstep(1.0, 0.0, length(vec2(d.x, d.y * 0.7 - 0.2))) * H.w;
          vec2 q = uv * vec2(38.0, 22.0) + vec2(0.0, -uTime * 3.2);
          off += (vec2(n(q), n(q + 17.3)) - 0.5) * 0.009 * w;
        }
        uv += off;
        // aberração cromática radial
        vec2 dir = (uv - 0.5) * uAberr;
        vec3 col = vec3(texture2D(tDiffuse, uv + dir).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dir).b);
        // correção de cor (em HDR linear, antes do tone mapping)
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(l), col, uSat);
        col = (col - 0.18) * uContrast + 0.18;
        col *= mix(uShadowTint, uHighTint, smoothstep(0.05, 0.8, l));
        // vinheta
        float v = smoothstep(0.45, 1.0, length((vUv - 0.5) * vec2(1.0, 0.85)) * 1.35);
        col *= 1.0 - v * uVignette;
        gl_FragColor = vec4(max(col, 0.0), 1.0);
      }`,
  });
}
