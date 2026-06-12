/** Un fix GPS normalizzato (indipendente da igc-parser). */
export interface Fix {
  /** epoch ms UTC */
  t: number;
  lat: number;
  lon: number;
  gpsAlt: number | null;
  baroAlt: number | null;
  valid: boolean;
}

export interface FlightTrack {
  /** ISO date (YYYY-MM-DD) del volo */
  date: string;
  pilot: string | null;
  gliderType: string | null;
  site: string | null;
  fixes: Fix[];
}

/** Serie derivate, allineate a una timeline uniforme a 1 Hz. */
export interface DerivedSeries {
  /** epoch ms, passo 1000 ms */
  t: Float64Array;
  lat: Float64Array;
  lon: Float64Array;
  /** quota usata per l'analisi (baro se sana, altrimenti GPS), m MSL */
  alt: Float64Array;
  altSource: 'baro' | 'gps';
  /** m/s, regressione su finestra 9 s */
  vario: Float64Array;
  /** m/s al suolo, finestra 3 s */
  groundSpeed: Float64Array;
  /** gradi 0-360 */
  heading: Float64Array;
  /** gradi/s con segno, finestra 5 s */
  turnRate: Float64Array;
  /** m sopra il terreno; null finché non calcolato (richiede rete) */
  agl: Float64Array | null;
  /** intervalli [startIdx, endIdx] interpolati su gap > 30 s nel log originale */
  gaps: Array<[number, number]>;
}

export interface ThermalSegment {
  id: string; // th1, th2, ...
  startIdx: number;
  endIdx: number;
  startT: number;
  endT: number;
  entryAlt: number;
  exitAlt: number;
  gain: number;
  durationS: number;
  avgClimb: number;
  best30s: number;
  /** raggio medio di rotazione stimato, m */
  meanRadius: number;
  /** deriva delle circonferenze: stima vento locale */
  drift: { dirDeg: number; speedMs: number };
  /** baricentro */
  lat: number;
  lon: number;
}

export interface GlideSegment {
  id: string; // gl1, gl2, ...
  startIdx: number;
  endIdx: number;
  startT: number;
  endT: number;
  /** km lungo la traccia */
  distanceKm: number;
  /** km in linea retta */
  straightKm: number;
  heightLost: number;
  /** rapporto di planata (straight distance / height lost); Infinity se non perde quota */
  ratio: number;
  avgSpeedMs: number;
  avgVario: number;
  minAgl: number | null;
}

export type DecisionType =
  | 'early_exit'
  | 'weak_thermal_persist'
  | 'low_save'
  | 'sink_line'
  | 'low_crossing';

export interface DecisionPoint {
  id: string; // dp1, dp2, ...
  type: DecisionType;
  /** epoch ms */
  t: number;
  lat: number;
  lon: number;
  alt: number;
  severity: 'info' | 'warn' | 'critical' | 'praise';
  data: Record<string, number | string>;
}

export interface FlightTotals {
  durationMin: number;
  trackDistanceKm: number;
  maxAltM: number;
  pctClimb: number;
  pctGlide: number;
  pctWasted: number;
  avgClimb: number;
  medianThermalClimb: number;
  minutesWasted: number;
}

export interface WindEstimate {
  /** epoch ms del centro della fascia */
  t: number;
  dirDeg: number;
  speedMs: number;
}

export interface WeatherSummary {
  source: 'open-meteo-archive';
  tempMaxC?: number;
  cape?: number;
  boundaryLayerM?: number;
  wind850?: { speedKmh: number; dirDeg: number };
  wind925?: { speedKmh: number; dirDeg: number };
}

export interface FlightAnalysis {
  totals: FlightTotals;
  thermals: ThermalSegment[];
  glides: GlideSegment[];
  decisionPoints: DecisionPoint[];
  windProfile: WindEstimate[];
}

/** Il JSON compatto inviato al coach AI (mai i fix grezzi). */
export interface FlightSummaryForAI {
  meta: {
    date: string;
    site?: string;
    pilot?: string;
    glider?: string;
    durationMin: number;
    distanceKm: number;
    maxAltM: number;
    lang: 'it' | 'en';
  };
  weather?: WeatherSummary;
  totals: FlightTotals;
  thermals: Array<{
    id: string;
    t: string;
    lat: number;
    lon: number;
    entryAlt: number;
    exitAlt: number;
    gain: number;
    avgClimb: number;
    best30s: number;
    driftDirDeg: number;
    driftSpeedMs: number;
  }>;
  glides: Array<{
    id: string;
    fromThermal: string | null;
    ratio: number | null;
    avgSpeedKmh: number;
    minAgl: number | null;
    distanceKm: number;
  }>;
  decisionPoints: Array<{
    id: string;
    type: DecisionType;
    t: string;
    lat: number;
    lon: number;
    alt: number;
    severity: string;
    data: Record<string, number | string>;
  }>;
}
