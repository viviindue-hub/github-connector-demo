import type { DerivedSeries, ThermalSegment } from '../types';

/**
 * Stima della velocità all'aria media. L'IGC dà solo la velocità al suolo;
 * sottraendo il vettore vento (stimato dalla deriva delle termiche, per quota)
 * dal vettore velocità-al-suolo si ottiene la velocità relativa all'aria:
 *   v_aria = v_suolo − v_vento
 * Non distingue trim/acceleratore istante per istante, ma la media è solida.
 */

interface WindVec {
  alt: number;
  e: number; // componente est (m/s), direzione VERSO cui spinge il vento
  n: number; // componente nord (m/s)
}

function windByAltitude(thermals: ThermalSegment[]): WindVec[] {
  return thermals
    .filter((t) => t.drift.speedMs >= 0.3)
    .map((t) => {
      const r = (t.drift.dirDeg * Math.PI) / 180; // drift = direzione "verso cui" (sottovento)
      return {
        alt: (t.entryAlt + t.exitAlt) / 2,
        e: t.drift.speedMs * Math.sin(r),
        n: t.drift.speedMs * Math.cos(r),
      };
    })
    .sort((a, b) => a.alt - b.alt);
}

function windAt(layers: WindVec[], alt: number): { e: number; n: number } {
  if (layers.length === 0) return { e: 0, n: 0 };
  if (alt <= layers[0].alt) return { e: layers[0].e, n: layers[0].n };
  const last = layers[layers.length - 1];
  if (alt >= last.alt) return { e: last.e, n: last.n };
  for (let i = 0; i < layers.length - 1; i++) {
    const a = layers[i];
    const b = layers[i + 1];
    if (alt >= a.alt && alt <= b.alt) {
      const w = (alt - a.alt) / (b.alt - a.alt);
      return { e: a.e + (b.e - a.e) * w, n: a.n + (b.n - a.n) * w };
    }
  }
  return { e: last.e, n: last.n };
}

/** Velocità al suolo media (km/h). */
export function avgGroundSpeedKmh(series: DerivedSeries): number | null {
  const n = series.t.length;
  if (n === 0) return null;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += series.groundSpeed[i];
  return (sum / n) * 3.6;
}

/**
 * Velocità all'aria media stimata (km/h). Richiede almeno una stima di vento
 * (una termica con deriva), altrimenti torna null: senza vento non la
 * distinguiamo dalla velocità al suolo e dichiararla sarebbe disonesto.
 */
export function estimateAvgAirspeedKmh(
  series: DerivedSeries,
  thermals: ThermalSegment[],
): number | null {
  const layers = windByAltitude(thermals);
  if (layers.length === 0) return null;
  const n = series.t.length;
  if (n === 0) return null;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const gs = series.groundSpeed[i];
    const hr = (series.heading[i] * Math.PI) / 180;
    const gE = gs * Math.sin(hr);
    const gN = gs * Math.cos(hr);
    const w = windAt(layers, series.alt[i]);
    sum += Math.hypot(gE - w.e, gN - w.n);
  }
  return (sum / n) * 3.6;
}
