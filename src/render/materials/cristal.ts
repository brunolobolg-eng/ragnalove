import * as THREE from 'three';
import { VISUAL_CONFIG } from '../../config/visualConfig';
import { RUIDO_3D_GLSL } from './glsl';

/**
 * Cristal mágico reutilizável: um Phong translúcido do three.js com um trecho de shader por cima. A iluminação, as
 * sombras e o tone mapping são os do material original. Os veios de energia são só emissão, calculada pela posição
 * no modelo (sem textura). O brilho e a velocidade vêm de `VISUAL_CONFIG.emperium`. Liga e desliga por preset.
 */

export interface MaterialCristal {
  readonly material: THREE.MeshPhongMaterial;
  /** Liga (médio e alto) ou desliga (baixo) os veios. Sem veios, o cristal fica com o degradê original. */
  setVeios(ligado: boolean): void;
  /** Faixa de altura do modelo (eixo Z antes da rotação) que o degradê ocupa, da base ao topo. */
  setAltura(zMin: number, zMax: number): void;
  /** Avança o tempo do pulso e dos veios. */
  update(dt: number): void;
}

export interface CoresCristal {
  base: THREE.ColorRepresentation;
  meio: THREE.ColorRepresentation;
  topo: THREE.ColorRepresentation;
}

export function criarMaterialCristal(params: THREE.MeshPhongMaterialParameters, cores: CoresCristal): MaterialCristal {
  const cfg = VISUAL_CONFIG.emperium;
  const uniforms = {
    uTempo: { value: 0 },
    uVeios: { value: 1 },
    uAlturaMin: { value: 0 },
    uAlturaMax: { value: 1 },
    uCorBase: { value: new THREE.Color(cores.base) },
    uCorMeio: { value: new THREE.Color(cores.meio) },
    uCorTopo: { value: new THREE.Color(cores.topo) },
    uEscala: { value: cfg.veinScale },
    uNitidez: { value: cfg.veinSharpness },
    uFluxo: { value: cfg.veinFlow },
    uBrilho: { value: cfg.veinBrightness },
    uPulso: { value: cfg.pulseDepth },
  };
  const material = new THREE.MeshPhongMaterial(params);
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTempo, uVeios, uAlturaMin, uAlturaMax, uEscala, uNitidez, uFluxo, uBrilho, uPulso;
uniform vec3 uCorBase, uCorMeio, uCorTopo;
varying vec3 vLocal;
${RUIDO_3D_GLSL}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  // altura normalizada: 0 na base, 1 no topo (o eixo Z do modelo é o "para cima" antes da rotação)
  float h = clamp((vLocal.z - uAlturaMin) / max(uAlturaMax - uAlturaMin, 1e-3), 0.0, 1.0);
  // veios: ruído em duas escalas, subindo devagar; a crista do ruído vira uma linha fina
  vec3 q = vLocal * uEscala + vec3(0.0, -uTempo * uFluxo, 0.0);
  float n = ruido3(q) * 0.65 + ruido3(q * 2.07 + 7.3) * 0.35;
  float veio = pow(1.0 - abs(n * 2.0 - 1.0), uNitidez);
  // pulso lento e irregular: duas ondas de períodos diferentes, uma defasada pela altura
  float pulso = 1.0 + uPulso * (0.6 * sin(uTempo * 0.95) + 0.4 * sin(uTempo * 0.43 + 1.7 * h));
  vec3 cor = mix(uCorBase, uCorMeio, smoothstep(0.0, 0.5, h));
  cor = mix(cor, uCorTopo, smoothstep(0.5, 1.0, h));
  totalEmissiveRadiance += cor * veio * pulso * uBrilho * uVeios;
}`,
      );
  };
  material.customProgramCacheKey = () => 'vg-cristal-veios';
  return {
    material,
    setVeios(ligado) {
      uniforms.uVeios.value = ligado ? 1 : 0;
    },
    setAltura(zMin, zMax) {
      uniforms.uAlturaMin.value = zMin;
      uniforms.uAlturaMax.value = zMax;
    },
    update(dt) {
      uniforms.uTempo.value += dt;
    },
  };
}
