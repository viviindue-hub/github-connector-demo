import { describe, it, expect } from 'vitest';
import { freeDistanceKm, freeRoute, xcLegs, xcSpeedKmh } from '../xc';
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

describe('freeRoute + xcLegs', () => {
  it('andata e ritorno: virata a metà e 2 settori con velocità media', () => {
    const pts = [];
    let p = { lat: 46, lon: 11 };
    for (let i = 0; i < 60; i++) {
      pts.push({ ...p });
      p = destination(p.lat, p.lon, 90, 200);
    } // ~12 km a est in 60 s
    for (let i = 0; i < 60; i++) {
      p = destination(p.lat, p.lon, 270, 200);
      pts.push({ ...p });
    } // ritorno
    const s = fromPath(pts);
    const route = freeRoute(s);
    expect(route.idxs[0]).toBe(0); // parte dall'inizio
    expect(route.idxs[route.idxs.length - 1]).toBeGreaterThan(100); // finisce verso la fine
    const legs = xcLegs(s, route);
    expect(legs.length).toBeGreaterThanOrEqual(2);
    // ogni settore ha una velocità media plausibile (~200 m/s * 3.6 ≈ 720 km/h nel giocattolo)
    for (const leg of legs) {
      expect(leg.distanceKm).toBeGreaterThan(0);
      expect(leg.speedKmh).toBeGreaterThan(0);
      expect(leg.endT).toBeGreaterThan(leg.startT);
    }
    // la somma dei settori ≈ distanza rotta
    const sum = legs.reduce((a, l) => a + l.distanceKm, 0);
    expect(sum).toBeCloseTo(route.km, 1);
  });
});

describe('xcSpeedKmh', () => {
  it('distanza / tempo', () => {
    expect(xcSpeedKmh(60, 120)).toBeCloseTo(30, 5); // 60 km in 2h = 30 km/h
    expect(xcSpeedKmh(10, 0)).toBe(0);
  });
});
