import { describe, it, expect } from 'vitest';
import { classifyFlight } from '../flightType';
import type { FlightAnalysis, ThermalSegment } from '../../types';

function analysis(opts: { thermals?: number; pctClimb?: number }): FlightAnalysis {
  const th = Array.from({ length: opts.thermals ?? 0 }, (_, i) => ({ id: `th${i}` }) as ThermalSegment);
  return {
    totals: {
      durationMin: 60,
      trackDistanceKm: 0,
      maxAltM: 2000,
      pctClimb: opts.pctClimb ?? 0,
      pctGlide: 0,
      pctWasted: 0,
      avgClimb: 0,
      medianThermalClimb: 0,
      minutesWasted: 0,
    },
    thermals: th,
    glides: [],
    decisionPoints: [],
    windProfile: [],
  };
}

describe('classifyFlight', () => {
  it('distanza libera grande → xc', () => {
    expect(classifyFlight(analysis({ thermals: 5, pctClimb: 30 }), 42)).toBe('xc');
  });
  it('sale ma resta in zona → local', () => {
    expect(classifyFlight(analysis({ thermals: 3, pctClimb: 25 }), 6)).toBe('local');
  });
  it('non sale e poca distanza → sled', () => {
    expect(classifyFlight(analysis({ thermals: 0, pctClimb: 0 }), 2)).toBe('sled');
  });
});
