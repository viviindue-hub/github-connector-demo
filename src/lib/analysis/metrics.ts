import type { DerivedSeries, FlightTotals, GlideSegment, ThermalSegment } from '../types';
import { haversine } from '../geo';

const WEAK_CLIMB = 0.5; // m/s: sotto questa soglia il tempo in termica è "sprecato"

export function computeTotals(
  series: DerivedSeries,
  thermals: ThermalSegment[],
  glides: GlideSegment[],
): FlightTotals {
  const n = series.t.length;
  const durationS = (series.t[n - 1] - series.t[0]) / 1000;

  let trackDist = 0;
  for (let i = 1; i < n; i++) {
    trackDist += haversine(series.lat[i - 1], series.lon[i - 1], series.lat[i], series.lon[i]);
  }

  let maxAlt = -Infinity;
  for (let i = 0; i < n; i++) maxAlt = Math.max(maxAlt, series.alt[i]);

  const climbS = thermals.reduce((s, th) => s + th.durationS, 0);
  const glideS = glides.reduce((s, gl) => s + (gl.endIdx - gl.startIdx), 0);

  const climbs = thermals.map((t) => t.avgClimb).sort((a, b) => a - b);
  const medianThermalClimb =
    climbs.length > 0 ? climbs[Math.floor(climbs.length / 2)] : 0;

  // minuti "sprecati": tempo in termiche deboli rispetto alla giornata
  let wastedS = 0;
  for (const th of thermals) {
    if (th.avgClimb < WEAK_CLIMB) wastedS += th.durationS;
  }

  const totalGain = thermals.reduce((s, th) => s + Math.max(0, th.gain), 0);

  return {
    durationMin: Math.round(durationS / 60),
    trackDistanceKm: Math.round((trackDist / 1000) * 10) / 10,
    maxAltM: Math.round(maxAlt),
    pctClimb: Math.round((climbS / durationS) * 100),
    pctGlide: Math.round((glideS / durationS) * 100),
    pctWasted: Math.round((wastedS / durationS) * 100),
    avgClimb: climbS > 0 ? Math.round((totalGain / climbS) * 100) / 100 : 0,
    medianThermalClimb: Math.round(medianThermalClimb * 100) / 100,
    minutesWasted: Math.round(wastedS / 60),
  };
}

/** Istogramma dei ratei di salita in termica (bin da 0.5 m/s, per la UI). */
export function climbHistogram(thermals: ThermalSegment[]): Array<{ bin: number; count: number }> {
  const bins = new Map<number, number>();
  for (const th of thermals) {
    const bin = Math.floor(th.avgClimb / 0.5) * 0.5;
    bins.set(bin, (bins.get(bin) ?? 0) + 1);
  }
  return [...bins.entries()].sort(([a], [b]) => a - b).map(([bin, count]) => ({ bin, count }));
}
