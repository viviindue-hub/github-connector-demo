import { haversine } from '../geo';
import type { DerivedSeries } from '../types';

/**
 * Distanza XC "libera" (stile XContest free flight): start + fino a 3 punti di
 * virata + fine, tutti liberi e in ordine temporale, massimizzando la somma
 * delle 4 tratte. È la distanza che conta per la performance XC; la velocità
 * media su questa distanza è il numero chiave (più dei settori temporali).
 *
 * Ottimizzazione DP su una traccia ricampionata (~maxPts punti): O(4·N²).
 */
export function freeDistanceKm(series: DerivedSeries, maxPts = 180): number {
  const n = series.t.length;
  if (n < 2) return 0;

  // ricampiona uniformemente, includendo l'ultimo punto
  const step = Math.max(1, Math.ceil(n / maxPts));
  const lat: number[] = [];
  const lon: number[] = [];
  for (let i = 0; i < n; i += step) {
    lat.push(series.lat[i]);
    lon.push(series.lon[i]);
  }
  if ((n - 1) % step !== 0) {
    lat.push(series.lat[n - 1]);
    lon.push(series.lon[n - 1]);
  }
  const m = lat.length;
  if (m < 2) return 0;

  const d = (i: number, j: number) => haversine(lat[i], lon[i], lat[j], lon[j]);

  // best[j] = miglior distanza accumulata con k tratte e ultimo punto in j
  let prev = new Float64Array(m); // k=0: 0 ovunque (start libero)
  for (let k = 0; k < 4; k++) {
    const cur = new Float64Array(m).fill(-Infinity);
    for (let j = 0; j < m; j++) {
      let best = -Infinity;
      for (let i = 0; i <= j; i++) {
        const v = prev[i] + d(i, j);
        if (v > best) best = v;
      }
      cur[j] = best;
    }
    prev = cur;
  }
  let max = 0;
  for (let j = 0; j < m; j++) if (prev[j] > max) max = prev[j];
  return max / 1000;
}

/** Velocità XC media (km/h) su una distanza data e una durata in minuti. */
export function xcSpeedKmh(distanceKm: number, durationMin: number): number {
  return durationMin > 0 ? distanceKm / (durationMin / 60) : 0;
}
