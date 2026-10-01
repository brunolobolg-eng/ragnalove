#!/bin/bash
# Monta web/ (jogo pronto para o Electron) SEM Vite: tsc + módulos ES + importmap.
# Build de produção: import.meta.env.DEV = false e o módulo de debug não é copiado.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
THREE_DIR="${THREE_DIR:-$ROOT/node_modules/three}"
OUT="${1:-$ROOT/web}"
rm -rf "$OUT"; mkdir -p "$OUT"
cd "$ROOT"
tsc -p tsconfig.json --types three --preserveSymlinks --noEmit false --outDir "$OUT/.tsc" --rootDir .
mv "$OUT/.tsc/src" "$OUT/src"; rm -rf "$OUT/.tsc" "$OUT/src/debug"
find "$OUT/src" -name "*.js" -exec sed -i -E \
  "s#(from ['\"])(\.{1,2}/[^'\"]+)(['\"])#\1\2.js\3#g; s#(import\(['\"])(\.{1,2}/[^'\"]+)(['\"]\))#\1\2.js\3#g; s#\.js\.js#.js#g; s#import\.meta\.env\.DEV#false#g" {} \;
cp src/ui/style.css "$OUT/src/ui/"
mkdir -p "$OUT/src/assets" && cp -r src/assets/* "$OUT/src/assets/"
cp -r public/* "$OUT/"
mkdir -p "$OUT/three/build" "$OUT/three/examples/jsm"
cp "$THREE_DIR/build/three.module.js" "$THREE_DIR/build/three.core.js" "$OUT/three/build/" 2>/dev/null || cp "$THREE_DIR/build/three.module.js" "$OUT/three/build/"
for d in postprocessing shaders environments utils loaders; do cp -r "$THREE_DIR/examples/jsm/$d" "$OUT/three/examples/jsm/"; done
cat > "$OUT/index.html" <<'HTML'
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ROguard</title>
    <link rel="icon" href="icon.png" />
    <link rel="stylesheet" href="src/ui/style.css" />
    <script type="importmap">{"imports":{"three":"./three/build/three.module.js","three/examples/jsm/":"./three/examples/jsm/"}}</script>
  </head>
  <body>
    <div id="app"></div>
    <div id="hud"></div>
    <script type="module" src="src/main.js"></script>
  </body>
</html>
HTML
echo "web/ pronto em $OUT ($(du -sh "$OUT" | cut -f1))"
