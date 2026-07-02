import { haversine } from '../geo';
import type { DerivedSeries } from '../types';

/**
 * Distanza XC "libera" (stile XContest free flight): start + fino a 3 punti di
 * virata + fine, tutti liberi e in ordine temporale, massimizzando la somma
 * delle tratte. Oltre alla distanza, ricostruiamo la ROTTA (gli indici dei
 * punti): serve per i settori con velocità media per tratta.
 *
 * Ottimizzazione DP con backtracking su traccia ricampionata (~maxPts punti).
 */

export interface XcRoute {
  km: number;
  /** indici (nella serie originale) di start, virate, fine: 2..5 punti */
  idxs: number[];
}

export function freeRoute(series: DerivedSeries, maxPts = 180): XcRoute {
  const n = series.t.length;
  if (n < 2) return { km: 0, idxs: [] };

  // ricampiona uniformemente, includendo l'ultimo punto, ricordando gli indici originali
  const step = Math.max(1, Math.ceil(n / maxPts));
  const orig: number[] = [];
  for (let i = 0; i < n; i += step) orig.push(i);
  if (orig[orig.length - 1] !== n - 1) orig.push(n - 1);
  const m = orig.length;
  if (m < 2) return { km: 0, idxs: [] };

  const lat = orig.map((i) => series.lat[i]);
  const lon = orig.map((i) => series.lon[i]);
  const d = (i: number, j: number) => haversine(lat[i], lon[i], lat[j], lon[j]);

  // DP: best[k][j] = massima distanza con k tratte terminando in j; parent per backtracking
  let prev = new Float64Array(m); // k=0: start libero, costo 0
  const parents: Int32Array[] = [];
  for (let k = 0; k < 4; k++) {
    const cur = new Float64Array(m).fill(-Infinity);
    const par = new Int32Array(m);
    for (let j = 0; j < m; j++) {
      let best = -Infinity;
      let bi = j;
      for (let i = 0; i <= j; i++) {
        const v = prev[i] + d(i, j);
        if (v > best) {
          best = v;
          bi = i;
        }
      }
      cur[j] = best;
      par[j] = bi;
    }
    parents.push(par);
    prev = cur;
  }

  let end = 0;
  for (let j = 1; j < m; j++) if (prev[j] > prev[end]) end = j;
  const km = prev[end] / 1000;

  // backtrack dei 5 punti (con dedup dei consecutivi uguali)
  const chain = [end];
  for (let k = 3; k >= 0; k--) chain.unshift(parents[k][chain[0]]);
  const idxs: number[] = [];
  for (const c of chain) {
    const oi = orig[c];
    if (idxs.length === 0 || idxs[idxs.length - 1] !== oi) idxs.push(oi);
  }
  return { km, idxs };
}

/** Distanza libera (km) — wrapper di freeRoute. */
export function freeDistanceKm(series: DerivedSeries, maxPts = 180): number {
  return freeRoute(series, maxPts).km;
}

export interface XcLeg {
  /** indice del settore (1-based) */
  n: number;
  startIdx: number;
  endIdx: number;
  startT: number;
  endT: number;
  distanceKm: number;
  /** velocità media sul settore (km/h, in linea d'aria sulla tratta) */
  speedKmh: number;
  altChangeM: number;
}

/** Settori della rotta libera con velocità media per tratta. */
export function xcLegs(series: DerivedSeries, route: XcRoute): XcLeg[] {
  const legs: XcLeg[] = [];
  for (let i = 0; i < route.idxs.length - 1; i++) {
    const a = route.idxs[i];
    const b = route.idxs[i + 1];
    const dt = (series.t[b] - series.t[a]) / 1000;
    if (dt <= 0) continue;
    const dist = haversine(series.lat[a], series.lon[a], series.lat[b], series.lon[b]);
    legs.push({
      n: legs.length + 1,
      startIdx: a,
      endIdx: b,
      startT: series.t[a],
      endT: series.t[b],
      distanceKm: dist / 1000,
      speedKmh: (dist / dt) * 3.6,
      altChangeM: series.alt[b] - series.alt[a],
    });
  }
  return legs;
}

/** Velocità XC media (km/h) su una distanza data e una durata in minuti. */
export function xcSpeedKmh(distanceKm: number, durationMin: number): number {
  return durationMin > 0 ? distanceKm / (durationMin / 60) : 0;
}
