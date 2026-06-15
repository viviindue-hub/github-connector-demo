import { describe, it, expect } from 'vitest';
import {
  buildFlightStory,
  buildLocalDebrief,
  explainDecisionFull,
  explainDecisionShort,
} from '../explain';
import type {
  DecisionPoint,
  FlightAnalysis,
  FlightTrack,
  ThermalSegment,
} from '../../types';

const track: FlightTrack = {
  date: '2024-05-01',
  pilot: 'Test',
  gliderType: 'EN-B',
  site: 'Monte Test',
  fixes: [],
};

function thermal(id: string, best30s: number): ThermalSegment {
  return {
    id,
    startIdx: 0,
    endIdx: 100,
    startT: 0,
    endT: 100_000,
    entryAlt: 1000,
    exitAlt: 1800,
    gain: 800,
    durationS: 300,
    avgClimb: 1.6,
    best30s,
    meanRadius: 55,
    drift: { dirDeg: 45, speedMs: 2 },
    lat: 46.0,
    lon: 8.0,
  };
}

function dp(type: DecisionPoint['type'], data: DecisionPoint['data'], extra?: Partial<DecisionPoint>): DecisionPoint {
  return {
    id: 'dp1',
    type,
    t: 0,
    lat: 46,
    lon: 8,
    alt: 1800,
    severity: 'warn',
    data,
    ...extra,
  };
}

function analysisWith(decisionPoints: DecisionPoint[]): FlightAnalysis {
  return {
    totals: {
      durationMin: 95,
      trackDistanceKm: 62,
      maxAltM: 2400,
      pctClimb: 38,
      pctGlide: 55,
      pctWasted: 7,
      avgClimb: 1.4,
      medianThermalClimb: 1.6,
      minutesWasted: 6,
    },
    thermals: [thermal('th1', 3.2)],
    glides: [],
    decisionPoints,
    windProfile: [{ t: 0, dirDeg: 45, speedMs: 3 }],
  };
}

describe('explainDecisionFull', () => {
  it('early_exit cita i numeri e il marker', () => {
    const d = dp('early_exit', { thermal: 'th1', climbAtExit: 0.9, laterMaxAlt: 2100 });
    const txt = explainDecisionFull(d);
    expect(txt).toContain('0.9');
    expect(txt).toContain('2100');
    expect(txt).toContain('[[dp1]]');
  });

  it('weak_thermal_persist cita minuti, climb e mediana', () => {
    const d = dp('weak_thermal_persist', {
      thermal: 'th2',
      minutes: 5,
      avgClimb: 0.4,
      dayMedian: 1.8,
    });
    const txt = explainDecisionFull(d);
    expect(txt).toContain('5');
    expect(txt).toContain('0.4');
    expect(txt).toContain('1.8');
    expect(txt).toContain('[[dp1]]');
  });

  it('low_save è un merito e cita il recupero', () => {
    const d = dp('low_save', { aglAtLow: 200, regained: 450 }, { severity: 'praise' });
    const txt = explainDecisionFull(d);
    expect(txt).toContain('200');
    expect(txt).toContain('450');
    expect(txt).toContain('[[dp1]]');
  });

  it('sink_line spiega la discendenza', () => {
    const d = dp('sink_line', { glide: 'gl1', sustainedSinkS: 90 });
    const txt = explainDecisionFull(d);
    expect(txt).toContain('90');
    expect(txt).toContain('[[dp1]]');
  });

  it('low_crossing distingue il finale di volo', () => {
    const ended = dp('low_crossing', { glide: 'gl2', minAgl: 300, endedFlight: 'yes' }, {
      severity: 'critical',
    });
    expect(explainDecisionFull(ended)).toContain('è finito il volo');
    const notEnded = dp('low_crossing', { glide: 'gl2', minAgl: 300, endedFlight: 'no' });
    expect(explainDecisionFull(notEnded)).not.toContain('è finito il volo');
  });
});

describe('explainDecisionShort', () => {
  it('produce testo non vuoto senza marker', () => {
    const d = dp('early_exit', { thermal: 'th1', climbAtExit: 0.9, laterMaxAlt: 2100 });
    const txt = explainDecisionShort(d);
    expect(txt.length).toBeGreaterThan(0);
    expect(txt).not.toContain('[[');
  });
});

describe('buildFlightStory', () => {
  it('contiene durata, distanza e il marker della migliore termica', () => {
    const txt = buildFlightStory(track, analysisWith([]));
    expect(txt).toContain('1h 35m');
    expect(txt).toContain('62 km');
    expect(txt).toContain('[[th1]]');
  });
});

describe('buildLocalDebrief', () => {
  it('ha le sezioni e spiega le decisioni con i marker', () => {
    const decisions = [
      dp('early_exit', { thermal: 'th1', climbAtExit: 0.9, laterMaxAlt: 2100 }),
    ];
    const md = buildLocalDebrief(track, analysisWith(decisions));
    expect(md).toContain('## Decisioni chiave');
    expect(md).toContain('## La cosa da allenare');
    expect(md).toContain('[[dp1]]');
  });

  it('su volo pulito dà un consiglio positivo senza sezione decisioni', () => {
    const md = buildLocalDebrief(track, analysisWith([]));
    expect(md).not.toContain('## Decisioni chiave');
    expect(md).toContain('## La cosa da allenare');
  });
});
