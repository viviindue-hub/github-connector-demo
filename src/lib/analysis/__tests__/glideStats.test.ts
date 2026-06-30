import { describe, it, expect } from 'vitest';
import { glideStats } from '../glideStats';
import type { DerivedSeries, GlideSegment, ThermalSegment } from '../../types';
import { destination } from '../../geo';

// 101 punti che planano verso EST a 10 m/s al suolo, perdendo 1 m/s di quota.
function glideSeries(): DerivedSeries {
  const n = 101;
  const lat = new Float64Array(n);
  const lon = new Float64Array(n);
  const alt = new Float64Array(n);
  let p = { lat: 46, lon: 11 };
  for (let i = 0; i < n; i++) {
    lat[i] = p.lat;
    lon[i] = p.lon;
    alt[i] = 2000 - i; // -1 m/s
    p = destination(p.lat, p.lon, 90, 10);
  }
  const f = (v: number) => Float64Array.from({ length: n }, () => v);
  return {
    t: Float64Array.from({ length: n }, (_, i) => i * 1000),
    lat,
    lon,
    alt,
    altSource: 'baro',
    vario: f(-1),
    groundSpeed: f(10),
    heading: f(90), // est
    turnRate: f(0),
    agl: null,
    gaps: [],
  };
}

const glide: GlideSegment = {
  id: 'gl1',
  startIdx: 0,
  endIdx: 100,
  startT: 0,
  endT: 100_000,
  distanceKm: 1,
  straightKm: 1,
  heightLost: 100,
  ratio: 10,
  avgSpeedMs: 10,
  avgVario: -1,
  minAgl: null,
};

function thermal(dirDeg: number, speedMs: number): ThermalSegment {
  return {
    id: 'th1', startIdx: 0, endIdx: 1, startT: 0, endT: 1, entryAlt: 1500, exitAlt: 2500,
    gain: 1000, durationS: 100, avgClimb: 2, best30s: 3, meanRadius: 50,
    drift: { dirDeg, speedMs }, lat: 46, lon: 11,
  };
}

describe('glideStats', () => {
  it('vento a favore (verso est): airspeed < ground, componente vento positiva', () => {
    const [st] = glideStats(glideSeries(), [thermal(90, 3)], [glide]);
    expect(st.groundKmh).toBeCloseTo(36, 0);
    expect(st.airKmh!).toBeCloseTo(7 * 3.6, 0); // 10 - 3 m/s
    expect(st.windCompKmh!).toBeCloseTo(3 * 3.6, 0); // +10.8 = a favore
    expect(st.ratio).toBe(10);
    expect(st.heightLostM).toBe(100);
  });

  it('vento contro (da est): airspeed > ground, componente negativa', () => {
    const [st] = glideStats(glideSeries(), [thermal(270, 4)], [glide]);
    expect(st.airKmh!).toBeCloseTo(14 * 3.6, 0); // 10 + 4
    expect(st.windCompKmh!).toBeCloseTo(-4 * 3.6, 0); // contro
  });

  it('senza stima di vento: air e windComp null, ground presente', () => {
    const [st] = glideStats(glideSeries(), [], [glide]);
    expect(st.airKmh).toBeNull();
    expect(st.windCompKmh).toBeNull();
    expect(st.groundKmh).toBeCloseTo(36, 0);
  });
});
