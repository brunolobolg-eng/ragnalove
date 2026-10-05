// @ts-nocheck - aplica funil nos portões 7-wide (uso único)
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'src/config/zones.ts');
const lines = readFileSync(file, 'utf8').split('\n');

const setCols = (s, cols, ch) => {
  const a = [...s];
  for (const c of cols) a[c] = ch;
  return a.join('');
};
let current = '';
let edited = 0;
for (let i = 0; i < lines.length; i++) {
  const zm = lines[i].match(/^  (\w+): \{$/);
  if (zm) current = zm[1];
  if (!lines[i].includes("'") || !lines[i].includes('ggggggg')) continue;
  // fileira do portão: 7 -> 5 (cols 20-24)
  const m = lines[i].match(/'([^']*)'/);
  if (!m || m[1].length !== 45 || m[1].indexOf('ggggggg') !== 19) {
    console.log(`pulado ${current}: formato inesperado`);
    continue;
  }
  lines[i] = lines[i].replace(m[1], setCols(m[1], [19, 25], 'W'));
  // asas: 3 fileiras à ESQUERDA; à direita só na boca (fileira do portão-1)
  // para não tapar a linha de tiro do Mago (27,36) pelo corredor.
  // Desvia de setup (22,35) e barreiras (20,37)(24,37)(18,34).
  const wing = (idx, cols) => {
    const mm = lines[idx].match(/'([^']*)'/);
    if (!mm || mm[1].length !== 45) throw new Error(`fileira ruim em ${current}:${idx}`);
    lines[idx] = lines[idx].replace(mm[1], setCols(mm[1], cols, '#'));
  };
  wing(i - 1, [16, 17, 18, 19, 25, 26, 27, 28]);
  wing(i - 2, [18, 19]);
  wing(i - 3, [19]);
  console.log(`funil em ${current} (linha ${i + 1})`);
  edited++;
}
writeFileSync(file, lines.join('\n'));
console.log(`zonas editadas: ${edited}`);
