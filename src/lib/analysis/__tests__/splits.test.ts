import { describe, it, expect } from 'vitest';
import { computeSplits } from '../splits';
import type { DerivedSeries } from '../../types';
import { destination } from '../../geo';

/** Costruisce una serie 1 Hz da una lista di punti {lat,lon,alt}. */
function makeSeries(points: Array<{ lat: number; lon: number; alt: number }>): DerivedSeries {
  const n = points.length;
  const z = () => new Float64Array(n);
  const s: DerivedSeries = {
    t: Float64Array.from({ length: n }, (_, i) => i * 1000),
    lat: Float64Array.from(points, (p) => p.lat),
    lon: Float64Array.from(points, (p) => p.lon),
    alt: Float64Array.from(points, (p) => p.alt),
    altSource: 'baro',
    vario: z(),
    groundSpeed: z(),
    heading: z(),
    turnRate: z(),
    agl: null,
    gaps: [],
  };
  return s;
}

describe('computeSplits', () => {
  it('volo dritto: avanzamento ≈ velocità sulla traccia', () => {
    // 121 punti (120 s) avanzando ~10 m/s verso est
    const pts = [];
    let p = { lat: 46, lon: 11 };
    for (let i = 0; i < 121; i++) {
      pts.push({ lat: p.lat, lon: p.lon, alt: 1000 });
      p = destination(p.lat, p.lon, 90, 10); // 10 m a step → 10 m/s
    }
    const splits = computeSplits(makeSeries(pts), 60);
    expect(splits.length).toBe(2);
    for (const sp of splits) {
      expect(sp.madeGoodKmh).toBeCloseTo(sp.trackKmh, 0); // dritto: coincidono
      expect(sp.madeGoodKmh).toBeGreaterThan(30); // ~36 km/h
    }
  });

  it('giri in tondo: avanzamento basso, traccia alta', () => {
    // cerchio: torna quasi al punto di partenza → spostamento netto ~0
    const pts = [];
    const R = 0.001; // ~111 m
    for (let i = 0; i < 121; i++) {
      const ang = (i / 120) * 2 * Math.PI;
      pts.push({ lat: 46 + R * Math.cos(ang), lon: 11 + R * Math.sin(ang), alt: 1000 + i });
    }
    const splits = computeSplits(makeSeries(pts), 120);
    expect(splits.length).toBe(1);
    expect(splits[0].trackKmh).toBeGreaterThan(splits[0].madeGoodKmh + 5); // traccia >> avanzamento
    expect(splits[0].madeGoodKmh).toBeLessThan(5); // quasi fermo come avanzamento
    expect(splits[0].altChangeM).toBeCloseTo(120, 0);
  });

  it('rispetta l’intervallo richiesto', () => {
    const pts = Array.from({ length: 301 }, (_, i) => ({ lat: 46, lon: 11 + i * 0.0001, alt: 1000 }));
    expect(computeSplits(makeSeries(pts), 60)).toHaveLength(5); // 300 s / 60
  });
});
