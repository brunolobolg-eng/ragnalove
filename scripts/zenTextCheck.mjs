// Varredura de texto: nenhum "Zeni" visível ao jogador pode restar.
// Identificadores internos e chaves de config (allowlist) continuam "zeni".
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const ALLOW = [
  'addZeni', 'buyPointWithZeni', 'respecWithZeni', 'skillZeniCost', 'SKILL_ZENI',
  'grantZeni', 'repairZeniPerHp', 'zeniPoints', 'zeni-ico', 'zeni-total', 'zeni-line',
  'lastZeni', 'zeniTotal', 'data-cmd="zeni"', 'data-f="zeni"', 'data-val="zeni"',
  'game/zeni/', "'zeni'", '"zeni"', 'zeni +=', 'zeni *', '(rw.zeni', 'api.zeni()',
  's.zeni', 'p.zeni', 'r.zeni', 'profile.zeni', '.zeni', 'zeni:', 'ZENI',
];
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (/\.(ts|tsx|css|html)$/.test(f)) files.push(p);
  }
};
walk(ROOT);
let bad = 0;
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((ln, i) => {
    if (!ln.includes('Zeni')) return;
    if (ALLOW.some((a) => ln.includes(a))) return;
    bad++;
    console.log(`TEXTO: ${f.split('src')[1]}:${i + 1}: ${ln.trim().slice(0, 110)}`);
  });
}
if (bad) {
  console.error(`zenTextCheck: ${bad} ocorrência(s) de "Zeni" visível`);
  process.exit(1);
}
console.log(`zenTextCheck: nenhum "Zeni" visível (${files.length} arquivos)`);
