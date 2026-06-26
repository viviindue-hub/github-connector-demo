import { describe, it, expect } from 'vitest';
import { aggregateWindByBand, samplesNear, type WindSample } from '../regionalWind';

const s = (alt: number, fromDeg: number, speedKmh: number, lat = 46, lon = 11): WindSample => ({
  alt,
  fromDeg,
  speedKmh,
  t: 0,
  lat,
  lon,
});

describe('aggregateWindByBand', () => {
  it('raggruppa per fascia di quota e ordina dalla più alta', () => {
    const bands = aggregateWindByBand(
      [s(1000, 90, 10), s(1100, 90, 20), s(2000, 270, 15)],
      300,
    );
    expect(bands).toHaveLength(2);
    expect(bands[0].low).toBe(1800); // fascia più alta per prima
    expect(bands[1].low).toBe(900);
    // media velocità nella fascia bassa
    expect(bands[1].speedKmh).toBe(15);
    expect(bands[1].count).toBe(2);
  });

  it('media circolare della direzione (non fa la media aritmetica attorno a 0°)', () => {
    const bands = aggregateWindByBand([s(1000, 350, 10), s(1000, 10, 10)], 300);
    expect(bands).toHaveLength(1);
    expect(bands[0].fromDeg).toBe(0); // non 180
  });
});

describe('samplesNear', () => {
  it('tiene solo i campioni entro il raggio', () => {
    const near = s(1000, 90, 10, 46.01, 11.01); // ~1 km
    const far = s(1000, 90, 10, 47, 11); // ~111 km
    const out = samplesNear([near, far], 46, 11, 40);
    expect(out).toHaveLength(1);
    expect(out[0].lat).toBeCloseTo(46.01);
  });
});
