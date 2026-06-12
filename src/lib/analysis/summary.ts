import type {
  DerivedSeries,
  FlightAnalysis,
  FlightSummaryForAI,
  FlightTrack,
  WeatherSummary,
} from '../types';
import { detectGlides, detectThermals, windProfile } from './segments';
import { computeTotals } from './metrics';
import { extractDecisionPoints } from './decisions';

/** Esegue l'intera pipeline di analisi su una serie preprocessata. */
export function analyze(series: DerivedSeries): FlightAnalysis {
  const thermals = detectThermals(series);
  const glides = detectGlides(series, thermals);
  return {
    totals: computeTotals(series, thermals, glides),
    thermals,
    glides,
    decisionPoints: extractDecisionPoints(series, thermals, glides),
    windProfile: windProfile(thermals),
  };
}

function hhmmss(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(11, 19);
}

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/** Costruisce il JSON compatto per il coach AI (mai i fix grezzi). */
export function buildSummaryForAI(
  track: FlightTrack,
  analysis: FlightAnalysis,
  lang: 'it' | 'en',
  weather?: WeatherSummary,
): FlightSummaryForAI {
  const { totals, thermals, glides, decisionPoints } = analysis;

  // collega ogni planata alla termica che la precede
  const fromThermal = (glStartIdx: number): string | null => {
    let best: string | null = null;
    for (const th of thermals) {
      if (th.endIdx <= glStartIdx) best = th.id;
      else break;
    }
    return best;
  };

  return {
    meta: {
      date: track.date,
      site: track.site ?? undefined,
      pilot: track.pilot ?? undefined,
      glider: track.gliderType ?? undefined,
      durationMin: totals.durationMin,
      distanceKm: totals.trackDistanceKm,
      maxAltM: totals.maxAltM,
      lang,
    },
    weather,
    totals,
    thermals: thermals.map((th) => ({
      id: th.id,
      t: hhmmss(th.startT),
      lat: round(th.lat, 5),
      lon: round(th.lon, 5),
      entryAlt: Math.round(th.entryAlt),
      exitAlt: Math.round(th.exitAlt),
      gain: Math.round(th.gain),
      avgClimb: round(th.avgClimb, 2),
      best30s: round(th.best30s, 2),
      driftDirDeg: Math.round(th.drift.dirDeg),
      driftSpeedMs: round(th.drift.speedMs, 1),
    })),
    glides: glides.map((gl) => ({
      id: gl.id,
      fromThermal: fromThermal(gl.startIdx),
      ratio: isFinite(gl.ratio) ? round(gl.ratio, 1) : null,
      avgSpeedKmh: round(gl.avgSpeedMs * 3.6, 0),
      minAgl: gl.minAgl !== null && isFinite(gl.minAgl) ? Math.round(gl.minAgl) : null,
      distanceKm: round(gl.distanceKm, 1),
    })),
    decisionPoints: decisionPoints.map((dp) => ({
      id: dp.id,
      type: dp.type,
      t: hhmmss(dp.t),
      lat: round(dp.lat, 5),
      lon: round(dp.lon, 5),
      alt: dp.alt,
      severity: dp.severity,
      data: dp.data,
    })),
  };
}

/**
 * Downsampling LTTB (Largest-Triangle-Three-Buckets) per il barogramma:
 * preserva la forma visiva della curva con ~2000 punti.
 */
export function lttb(
  t: ArrayLike<number>,
  y: ArrayLike<number>,
  threshold = 2000,
): Array<[number, number]> {
  const n = t.length;
  if (n <= threshold) {
    const out: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) out.push([t[i] as number, y[i] as number]);
    return out;
  }
  const out: Array<[number, number]> = [[t[0] as number, y[0] as number]];
  const bucketSize = (n - 2) / (threshold - 2);
  let a = 0;
  for (let i = 0; i < threshold - 2; i++) {
    const bStart = Math.floor((i + 0) * bucketSize) + 1;
    const bEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, n - 1);
    const cStart = Math.min(Math.floor((i + 1) * bucketSize) + 1, n - 1);
    const cEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);
    // media del bucket successivo
    let avgT = 0;
    let avgY = 0;
    const cLen = Math.max(1, cEnd - cStart);
    for (let k = cStart; k < cEnd; k++) {
      avgT += t[k] as number;
      avgY += y[k] as number;
    }
    avgT /= cLen;
    avgY /= cLen;
    // punto del bucket corrente con triangolo massimo
    let maxArea = -1;
    let chosen = bStart;
    for (let k = bStart; k < bEnd; k++) {
      const area = Math.abs(
        ((t[a] as number) - avgT) * ((y[k] as number) - (y[a] as number)) -
          ((t[a] as number) - (t[k] as number)) * (avgY - (y[a] as number)),
      );
      if (area > maxArea) {
        maxArea = area;
        chosen = k;
      }
    }
    out.push([t[chosen] as number, y[chosen] as number]);
    a = chosen;
  }
  out.push([t[n - 1] as number, y[n - 1] as number]);
  return out;
}
