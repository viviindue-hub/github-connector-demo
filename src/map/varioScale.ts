import { Color } from 'cesium';

/**
 * Scala colori del vario condivisa tra la traccia 3D e la legenda.
 * Convenzione familiare ai piloti (lignaggio Ayvri/Doarama): blu = discendenza,
 * verde ≈ 0, giallo→rosso = salita. Un unico set di stop così traccia e legenda
 * coincidono al pixel.
 */
export interface VarioStop {
  /** velocità verticale m/s */
  v: number;
  rgb: [number, number, number];
}

export const VARIO_STOPS: VarioStop[] = [
  { v: -4, rgb: [75, 47, 168] }, // indaco/viola — discendenza forte
  { v: -2, rgb: [47, 109, 246] }, // blu
  { v: -1, rgb: [40, 194, 224] }, // ciano
  { v: 0, rgb: [67, 209, 122] }, // verde — aria neutra
  { v: 1, rgb: [232, 229, 74] }, // giallo
  { v: 2, rgb: [245, 166, 35] }, // arancio
  { v: 4, rgb: [232, 49, 47] }, // rosso — salita forte
];

const MIN_V = VARIO_STOPS[0].v;
const MAX_V = VARIO_STOPS[VARIO_STOPS.length - 1].v;

function lerp(a: number, b: number, w: number): number {
  return a + (b - a) * w;
}

/** RGB interpolato (0-255) per un valore di vario, con clamp ai bordi della scala. */
export function varioRgb(varioMs: number): [number, number, number] {
  if (varioMs <= MIN_V) return VARIO_STOPS[0].rgb;
  if (varioMs >= MAX_V) return VARIO_STOPS[VARIO_STOPS.length - 1].rgb;
  for (let i = 0; i < VARIO_STOPS.length - 1; i++) {
    const a = VARIO_STOPS[i];
    const b = VARIO_STOPS[i + 1];
    if (varioMs >= a.v && varioMs <= b.v) {
      const w = (varioMs - a.v) / (b.v - a.v);
      return [
        Math.round(lerp(a.rgb[0], b.rgb[0], w)),
        Math.round(lerp(a.rgb[1], b.rgb[1], w)),
        Math.round(lerp(a.rgb[2], b.rgb[2], w)),
      ];
    }
  }
  return VARIO_STOPS[VARIO_STOPS.length - 1].rgb;
}

/** Colore Cesium per la traccia colorata per vario. */
export function varioColor(varioMs: number, alpha = 0.95): Color {
  const [r, g, b] = varioRgb(varioMs);
  return new Color(r / 255, g / 255, b / 255, alpha);
}

/** Stringa `rgb(r,g,b)` per CSS / SVG. */
export function varioRgbCss(varioMs: number): string {
  const [r, g, b] = varioRgb(varioMs);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Gradiente CSS verticale per la legenda (vario alto in cima).
 * `to top` → 0% = fondo = vario minimo, 100% = cima = vario massimo.
 */
export function varioCssGradient(): string {
  const stops = VARIO_STOPS.map((s) => {
    const pct = ((s.v - MIN_V) / (MAX_V - MIN_V)) * 100;
    return `rgb(${s.rgb[0]}, ${s.rgb[1]}, ${s.rgb[2]}) ${pct.toFixed(0)}%`;
  });
  return `linear-gradient(to top, ${stops.join(', ')})`;
}

// ---- scala VELOCITÀ di avanzamento (km/h): rosso=lento/lotta → verde=veloce ----
export const SPEED_STOPS: VarioStop[] = [
  { v: 0, rgb: [210, 60, 50] }, // fermo / in lotta
  { v: 10, rgb: [245, 166, 35] }, // arancio
  { v: 20, rgb: [232, 229, 74] }, // giallo
  { v: 30, rgb: [111, 209, 82] }, // verde
  { v: 40, rgb: [40, 194, 224] }, // ciano = molto veloce
];
const SPEED_MIN = SPEED_STOPS[0].v;
const SPEED_MAX = SPEED_STOPS[SPEED_STOPS.length - 1].v;

export function speedColor(kmh: number, alpha = 0.95): Color {
  let v = kmh;
  if (v <= SPEED_MIN) v = SPEED_MIN;
  if (v >= SPEED_MAX) v = SPEED_MAX;
  let rgb = SPEED_STOPS[SPEED_STOPS.length - 1].rgb;
  for (let i = 0; i < SPEED_STOPS.length - 1; i++) {
    const a = SPEED_STOPS[i];
    const b = SPEED_STOPS[i + 1];
    if (v >= a.v && v <= b.v) {
      const w = (v - a.v) / (b.v - a.v);
      rgb = [
        Math.round(lerp(a.rgb[0], b.rgb[0], w)),
        Math.round(lerp(a.rgb[1], b.rgb[1], w)),
        Math.round(lerp(a.rgb[2], b.rgb[2], w)),
      ];
      break;
    }
  }
  return new Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, alpha);
}

export function speedCssGradient(): string {
  const stops = SPEED_STOPS.map((s) => {
    const pct = ((s.v - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 100;
    return `rgb(${s.rgb[0]}, ${s.rgb[1]}, ${s.rgb[2]}) ${pct.toFixed(0)}%`;
  });
  return `linear-gradient(to top, ${stops.join(', ')})`;
}
