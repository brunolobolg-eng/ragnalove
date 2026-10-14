# AURENTHAL — Environment Starter Pack (PT-BR)

## Arquivos
- `AURENTHAL_Stylized_Environment_Props.glb`: biblioteca modular de árvores, rochas, arbustos, ruínas, troncos, barricadas e bandeira. Peças nomeadas, low-poly estilizado, cores de vértice.
- `textures/`: 6 materiais de terreno (Grass_Lush, Grass_Shadow, Dirt_Trail, Stone_BlueSlate, Cobblestone_Night, Mossy_Ruins), cada um com BaseColor, Roughness e Normal em PNG.
- `Texture_Preview.jpg`: prévia rápida.

## Carregar o GLB no Three.js
```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const loader = new GLTFLoader();
loader.load('/assets/AURENTHAL_Stylized_Environment_Props.glb', (gltf) => {
  scene.add(gltf.scene);
  console.log(gltf.scene.children.map(o => o.name));
});
```
O GLB é uma biblioteca de demonstração: as peças ficam espaçadas em fileiras para inspeção. Em produção, copie/clone as peças desejadas e posicione-as no mapa.

## Material de terreno
```js
import * as THREE from 'three';
const loader = new THREE.TextureLoader();
const color = loader.load('/assets/textures/Grass_Lush_BaseColor.png');
color.colorSpace = THREE.SRGBColorSpace;
color.wrapS = color.wrapT = THREE.RepeatWrapping;
color.repeat.set(8, 8);
const rough = loader.load('/assets/textures/Grass_Lush_Roughness.png');
rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
rough.repeat.set(8, 8);
const normal = loader.load('/assets/textures/Grass_Lush_Normal.png');
normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
normal.repeat.set(8, 8);
const material = new THREE.MeshStandardMaterial({map: color, roughnessMap: rough, normalMap: normal, roughness: 1});
```
Aplique `SRGBColorSpace` somente no BaseColor. Ajuste o `repeat` à escala real do seu terreno.

## Direção de arte
Use Grass_Lush como base; Grass_Shadow em clareiras sombreadas; Dirt_Trail para caminhos; Stone_BlueSlate e Mossy_Ruins em ruínas; Cobblestone_Night em cidades/arenas. Agrupe árvores e rochas em bordas, faça clareiras e trilhas, e deixe o centro do combate legível. O pacote é uma base procedural estilizada, não um cenário AAA finalizado; o acabamento final depende também de iluminação, composição, pós-processamento e integração com o mapa.
