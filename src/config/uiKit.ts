/** Provisório: será substituído pelo gerador do kit (scratchpad/ui_kit/gerar_uikit.py). */
export interface KitAsset {
  file: string;
  w: number;
  h: number;
  slice?: readonly [number, number, number, number];
  fill?: { top: string; bottom: string };
}
export const UI_KIT = {} as Record<string, KitAsset>;
export type KitId = string;
