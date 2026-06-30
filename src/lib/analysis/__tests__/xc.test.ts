import { describe, it, expect } from 'vitest';
import { freeDistanceKm, xcSpeedKmh } from '../xc';
import type { DerivedSeries } from '../../types';
import { destination } from '../../geo';

function fromPath(points: Array<{ lat: number; lon: number }>): DerivedSeries {
  const n = points.length;
  const f = () => new Float64Array(n);
  return {
    t: Float64Array.from({ length: n }, (_, i) => i * 1000),
    lat: Float64Array.from(points, (p) => p.lat),
    lon: Float64Array.from(points, (p) => p.lon),
    alt: f(),
    altSource: 'baro',
    vario: f(),
    groundSpeed: f(),
    heading: f(),
    turnRate: f(),
    agl: null,
    gaps: [],
  };
}

describe('freeDistanceKm', () => {
  it('linea retta: ~ lunghezza totale', () => {
    const pts = [];
    let p = { lat: 46, lon: 11 };
    for (let i = 0; i < 100; i++) {
      pts.push({ ...p });
      p = destination(p.lat, p.lon, 90, 200); // 200 m/passo → ~19.8 km su 99 passi
    }
    const km = freeDistanceKm(fromPath(pts));
    expect(km).toBeGreaterThan(19);
    expect(km).toBeLessThan(20.5);
  });

  it('andata e ritorno: ~ doppio della tratta', () => {
    const pts = [];
    let p = { lat: 46, lon: 11 };
    for (let i = 0; i < 50; i++) {
      pts.push({ ...p });
      p = destination(p.lat, p.lon, 90, 200);
    } // 10 km a est
    for (let i = 0; i < 50; i++) {
      p = destination(p.lat, p.lon, 270, 200);
      pts.push({ ...p });
    } // torna a ovest
    const km = freeDistanceKm(fromPath(pts));
    expect(km).toBeGreaterThan(18); // ~20 km (andata+ritorno)
  });
});

describe('xcSpeedKmh', () => {
  it('distanza / tempo', () => {
    expect(xcSpeedKmh(60, 120)).toBeCloseTo(30, 5); // 60 km in 2h = 30 km/h
    expect(xcSpeedKmh(10, 0)).toBe(0);
  });
});
