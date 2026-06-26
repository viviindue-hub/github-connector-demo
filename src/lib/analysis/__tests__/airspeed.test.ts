import { describe, it, expect } from 'vitest';
import { estimateAvgAirspeedKmh, avgGroundSpeedKmh } from '../airspeed';
import type { DerivedSeries, ThermalSegment } from '../../types';

function series(n: number, groundMs: number, headingDeg: number, alt: number): DerivedSeries {
  const f = (v: number) => Float64Array.from({ length: n }, () => v);
  return {
    t: Float64Array.from({ length: n }, (_, i) => i * 1000),
    lat: f(46),
    lon: f(11),
    alt: f(alt),
    altSource: 'baro',
    vario: f(0),
    groundSpeed: f(groundMs),
    heading: f(headingDeg),
    turnRate: f(0),
    agl: null,
    gaps: [],
  };
}

function thermal(dirDeg: number, speedMs: number, alt: number): ThermalSegment {
  return {
    id: 'th1',
    startIdx: 0,
    endIdx: 1,
    startT: 0,
    endT: 1,
    entryAlt: alt - 100,
    exitAlt: alt + 100,
    gain: 200,
    durationS: 100,
    avgClimb: 2,
    best30s: 3,
    meanRadius: 50,
    drift: { dirDeg, speedMs },
    lat: 46,
    lon: 11,
  };
}

describe('estimateAvgAirspeedKmh', () => {
  it('sottrae il vento: suolo 10 m/s verso E, vento 3 m/s verso E → aria 7 m/s', () => {
    const s = series(5, 10, 90, 1500); // ground 10 m/s heading 90° (est)
    const th = thermal(90, 3, 1500); // vento spinge verso E a 3 m/s
    const air = estimateAvgAirspeedKmh(s, [th]);
    expect(air).not.toBeNull();
    expect(air!).toBeCloseTo(7 * 3.6, 1); // 25.2 km/h
  });

  it('vento contrario aumenta la velocità all’aria rispetto al suolo', () => {
    const s = series(5, 8, 90, 1500); // suolo 8 m/s verso E
    const th = thermal(270, 4, 1500); // vento spinge verso O (contrario) 4 m/s
    const air = estimateAvgAirspeedKmh(s, [th]);
    expect(air!).toBeCloseTo(12 * 3.6, 1); // 8 - (-4) = 12 m/s
  });

  it('senza stima di vento torna null (onesto)', () => {
    const s = series(5, 10, 90, 1500);
    expect(estimateAvgAirspeedKmh(s, [])).toBeNull();
  });
});

describe('avgGroundSpeedKmh', () => {
  it('media semplice in km/h', () => {
    expect(avgGroundSpeedKmh(series(4, 10, 0, 1000))!).toBeCloseTo(36, 5);
  });
});
