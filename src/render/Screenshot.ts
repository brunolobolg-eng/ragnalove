/**
 * Foto do quadro 3D atual, reduzida e em JPEG. Só o canvas do jogo entra (sem a interface).
 * Precisa ser chamada logo depois de desenhar o quadro, no mesmo passo: fora dele o canvas WebGL vem vazio.
 */
export function snapshotCanvas(source: HTMLCanvasElement, width: number, quality: number): string {
  const height = Math.round((width * source.height) / source.width);
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(source, 0, 0, width, height);
  return out.toDataURL('image/jpeg', quality);
}
