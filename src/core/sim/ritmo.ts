/**
 * Ritmo da noite (função pura, sem estado). A curva é uma lista de pontos [progresso, fator], com
 * progresso = fração do orçamento da noite já nascida (0 a 1). Entre dois pontos interpola linearmente;
 * antes do primeiro e depois do último mantém o fator do extremo. Fator 1 = intervalo da zona.
 */
export type CurvaRitmo = readonly (readonly [number, number])[];

export function fatorDaCurva(curva: CurvaRitmo, progresso: number): number {
  if (curva.length === 0) return 1;
  const pts = [...curva].sort((a, b) => a[0] - b[0]);
  if (progresso <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    if (progresso <= x1) {
      const [x0, y0] = pts[i - 1];
      const t = x1 === x0 ? 1 : (progresso - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return pts[pts.length - 1][1];
}
