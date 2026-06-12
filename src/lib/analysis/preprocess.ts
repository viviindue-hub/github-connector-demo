import type { DerivedSeries, FlightTrack } from '../types';
import { bearing, haversine, angleDiff } from '../geo';

const STEP_MS = 1000;
const GAP_MARK_S = 30;
const VARIO_WIN = 9; // s, finestra regressione
const SPEED_SPAN = 3; // s
const TURN_WIN = 5; // s

/**
 * Ricampiona la traccia a 1 Hz e calcola le serie derivate.
 * Funzione pura e sincrona: l'AGL (che richiede rete) si aggiunge dopo
 * con attachAgl().
 */
export function preprocess(track: FlightTrack): DerivedSeries {
  const fixes = track.fixes.filter((f) => f.valid || f.gpsAlt !== null || f.baroAlt !== null);
  if (fixes.length < 2) throw new Error('Traccia troppo corta');

  // scelta sorgente quota: baro se presente e coerente col GPS (mediana |Δ| < 150 m)
  const deltas: number[] = [];
  for (const f of fixes) {
    if (f.baroAlt !== null && f.gpsAlt !== null) deltas.push(Math.abs(f.baroAlt - f.gpsAlt));
  }
  deltas.sort((a, b) => a - b);
  const baroCount = fixes.filter((f) => f.baroAlt !== null).length;
  const baroSane =
    baroCount > fixes.length * 0.9 &&
    (deltas.length === 0 || deltas[Math.floor(deltas.length / 2)] < 150);
  const altSource: 'baro' | 'gps' = baroSane ? 'baro' : 'gps';
  const rawAlt = (i: number): number => {
    const f = fixes[i];
    const v = altSource === 'baro' ? f.baroAlt ?? f.gpsAlt : f.gpsAlt ?? f.baroAlt;
    return v ?? 0;
  };

  const t0 = Math.ceil(fixes[0].t / STEP_MS) * STEP_MS;
  const t1 = Math.floor(fixes[fixes.length - 1].t / STEP_MS) * STEP_MS;
  const n = Math.max(2, Math.floor((t1 - t0) / STEP_MS) + 1);

  const t = new Float64Array(n);
  const lat = new Float64Array(n);
  const lon = new Float64Array(n);
  const alt = new Float64Array(n);
  const gaps: Array<[number, number]> = [];

  // interpolazione lineare su timeline uniforme
  let j = 0;
  let gapStart = -1;
  for (let i = 0; i < n; i++) {
    const ti = t0 + i * STEP_MS;
    t[i] = ti;
    while (j < fixes.length - 2 && fixes[j + 1].t <= ti) j++;
    const a = fixes[j];
    const b = fixes[Math.min(j + 1, fixes.length - 1)];
    const span = Math.max(1, b.t - a.t);
    const w = Math.min(1, Math.max(0, (ti - a.t) / span));
    lat[i] = a.lat + (b.lat - a.lat) * w;
    lon[i] = a.lon + (b.lon - a.lon) * w;
    alt[i] = rawAlt(j) + (rawAlt(Math.min(j + 1, fixes.length - 1)) - rawAlt(j)) * w;
    const inGap = span > GAP_MARK_S * 1000 && ti > a.t && ti < b.t;
    if (inGap && gapStart < 0) gapStart = i;
    if (!inGap && gapStart >= 0) {
      gaps.push([gapStart, i - 1]);
      gapStart = -1;
    }
  }
  if (gapStart >= 0) gaps.push([gapStart, n - 1]);

  const vario = regressionSlope(alt, VARIO_WIN);

  // velocità al suolo e heading su span di 3 s centrato
  const groundSpeed = new Float64Array(n);
  const heading = new Float64Array(n);
  const half = Math.floor(SPEED_SPAN / 2);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n - 1, i + half + (SPEED_SPAN % 2 === 0 ? 0 : 1));
    const dt = (t[b] - t[a]) / 1000;
    const d = haversine(lat[a], lon[a], lat[b], lon[b]);
    groundSpeed[i] = dt > 0 ? d / dt : 0;
    heading[i] = d > 0.5 ? bearing(lat[a], lon[a], lat[b], lon[b]) : i > 0 ? heading[i - 1] : 0;
  }

  // heading "srotolato" e turn rate come pendenza su finestra di 5 s
  const unwrapped = new Float64Array(n);
  unwrapped[0] = heading[0];
  for (let i = 1; i < n; i++) {
    unwrapped[i] = unwrapped[i - 1] + angleDiff(heading[i - 1], heading[i]);
  }
  const turnRate = regressionSlope(unwrapped, TURN_WIN);

  return { t, lat, lon, alt, altSource, vario, groundSpeed, heading, turnRate, agl: null, gaps };
}

/**
 * Pendenza per punto via regressione lineare su finestra centrata di `win`
 * campioni (timeline uniforme a 1 Hz => pendenza in unità/s).
 */
export function regressionSlope(y: ArrayLike<number>, win: number): Float64Array {
  const n = y.length;
  const out = new Float64Array(n);
  const half = Math.floor(win / 2);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n - 1, i + half);
    const m = b - a + 1;
    if (m < 2) continue;
    const xbar = (a + b) / 2;
    let num = 0;
    let den = 0;
    for (let k = a; k <= b; k++) {
      const dx = k - xbar;
      num += dx * (y[k] as number);
      den += dx * dx;
    }
    out[i] = den > 0 ? num / den : 0;
  }
  return out;
}

export type ElevationFetcher = (
  points: Array<{ lat: number; lon: number }>,
) => Promise<number[]>;

/**
 * Calcola l'AGL campionando il terreno ~1 punto ogni 10 s e interpolando.
 * `fetcher` è iniettabile (Open-Meteo in produzione, fake nei test).
 * In caso di errore di rete la serie resta null: i detector degradano a MSL.
 */
export async function attachAgl(
  series: DerivedSeries,
  fetcher: ElevationFetcher,
): Promise<DerivedSeries> {
  const n = series.t.length;
  const stride = 10;
  const idxs: number[] = [];
  for (let i = 0; i < n; i += stride) idxs.push(i);
  if (idxs[idxs.length - 1] !== n - 1) idxs.push(n - 1);

  try {
    const elevations = await fetcher(
      idxs.map((i) => ({ lat: series.lat[i], lon: series.lon[i] })),
    );
    const agl = new Float64Array(n);
    for (let k = 0; k < idxs.length - 1; k++) {
      const a = idxs[k];
      const b = idxs[k + 1];
      for (let i = a; i <= b; i++) {
        const w = (i - a) / Math.max(1, b - a);
        const ground = elevations[k] + (elevations[k + 1] - elevations[k]) * w;
        agl[i] = series.alt[i] - ground;
      }
    }
    return { ...series, agl };
  } catch {
    return series;
  }
}
