import { haversine } from '../geo';
import type { DerivedSeries } from '../types';

/**
 * "Split" del volo a intervallo di TEMPO fisso (stile Strava), non per termica.
 * Per ogni blocco misura la velocità di AVANZAMENTO (in linea d'aria: spostamento
 * netto ÷ tempo) e la velocità sulla traccia (lunghezza percorsa ÷ tempo). Se in
 * un blocco hai girato molto, l'avanzamento crolla mentre la traccia resta alta:
 * è lì che si vede, oggettivamente, "ho girato troppo". Niente giudizi.
 */

/**
 * Velocità di avanzamento (in linea d'aria) per OGNI punto, su finestra mobile
 * centrata (default ±60 s): serve a colorare la traccia per "andatura" — rosso
 * dove si è in lotta/fermi, verde dove si avanza forte. km/h.
 */
export function rollingMadeGoodKmh(series: DerivedSeries, windowSec = 120): Float64Array {
  const n = series.t.length;
  const out = new Float64Array(n);
  const half = Math.max(1, Math.round(windowSec / 2));
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n - 1, i + half);
    const dt = (series.t[b] - series.t[a]) / 1000;
    if (dt <= 0) {
      out[i] = 0;
      continue;
    }
    const straight = haversine(series.lat[a], series.lon[a], series.lat[b], series.lon[b]);
    out[i] = (straight / dt) * 3.6;
  }
  return out;
}

export interface FlightSplit {
  startIdx: number;
  endIdx: number;
  startT: number;
  endT: number;
  durationS: number;
  /** velocità di avanzamento in linea d'aria (km/h) */
  madeGoodKmh: number;
  /** velocità lungo la traccia (km/h) */
  trackKmh: number;
  /** variazione di quota nel blocco (m, con segno) */
  altChangeM: number;
}

/**
 * Divide la serie (1 Hz) in blocchi di `intervalSec` secondi.
 * L'ultimo blocco può essere più corto; viene incluso se dura almeno 60 s.
 */
export function computeSplits(series: DerivedSeries, intervalSec: number): FlightSplit[] {
  const n = series.t.length;
  if (n < 2 || intervalSec < 1) return [];
  const step = Math.max(1, Math.round(intervalSec)); // 1 campione = 1 s
  const splits: FlightSplit[] = [];

  for (let a = 0; a < n - 1; a += step) {
    const b = Math.min(a + step, n - 1);
    const durationS = (series.t[b] - series.t[a]) / 1000;
    if (durationS < 60 && b !== n - 1) continue; // blocco troppo corto (non finale)
    if (durationS <= 0) continue;

    let track = 0;
    for (let i = a + 1; i <= b; i++) {
      track += haversine(series.lat[i - 1], series.lon[i - 1], series.lat[i], series.lon[i]);
    }
    const straight = haversine(series.lat[a], series.lon[a], series.lat[b], series.lon[b]);

    splits.push({
      startIdx: a,
      endIdx: b,
      startT: series.t[a],
      endT: series.t[b],
      durationS,
      madeGoodKmh: (straight / durationS) * 3.6,
      trackKmh: (track / durationS) * 3.6,
      altChangeM: series.alt[b] - series.alt[a],
    });
  }
  return splits;
}
