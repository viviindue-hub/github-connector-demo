import type {
  DecisionPoint,
  DerivedSeries,
  GlideSegment,
  ThermalSegment,
} from '../types';

// Soglie dal piano
const EARLY_EXIT_CLIMB = 0.8; // m/s ancora presenti negli ultimi 90 s
const EARLY_EXIT_LOOKAHEAD_S = 30 * 60;
const EARLY_EXIT_MARGIN = 300; // m sotto la quota max successiva
const WEAK_PERSIST_MIN_S = 3 * 60;
const WEAK_PERSIST_CLIMB = 0.5;
const WEAK_PERSIST_DAY_MEDIAN = 1.5;
const LOW_SAVE_AGL = 250;
const LOW_SAVE_GAIN = 400;
const SINK_VARIO = -2.0;
const SINK_SUSTAIN_S = 90;
const LOW_CROSSING_AGL = 400;
const LANDING_WINDOW_S = 15 * 60;

/**
 * Estrae i punti di decisione che alimentano il coach AI.
 * Ogni regola è indipendente e testabile sul suo scenario sintetico.
 */
export function extractDecisionPoints(
  series: DerivedSeries,
  thermals: ThermalSegment[],
  glides: GlideSegment[],
): DecisionPoint[] {
  const points: DecisionPoint[] = [];
  const push = (p: Omit<DecisionPoint, 'id'>) =>
    points.push({ ...p, id: `dp${points.length + 1}` });

  const n = series.t.length;
  const landingT = series.t[n - 1];

  const climbs = thermals.map((t) => t.avgClimb).sort((a, b) => a - b);
  const dayMedian = climbs.length > 0 ? climbs[Math.floor(climbs.length / 2)] : 0;

  // --- early_exit: uscito da una termica che saliva ancora ---
  for (const th of thermals) {
    const tail = Math.max(th.startIdx, th.endIdx - 90);
    const tailClimb = (series.alt[th.endIdx] - series.alt[tail]) / Math.max(1, th.endIdx - tail);
    if (tailClimb <= EARLY_EXIT_CLIMB) continue;
    let laterMax = -Infinity;
    const horizon = th.endT + EARLY_EXIT_LOOKAHEAD_S * 1000;
    for (let i = th.endIdx; i < n && series.t[i] <= horizon; i++) {
      laterMax = Math.max(laterMax, series.alt[i]);
    }
    if (laterMax > th.exitAlt + EARLY_EXIT_MARGIN) {
      push({
        type: 'early_exit',
        t: th.endT,
        lat: series.lat[th.endIdx],
        lon: series.lon[th.endIdx],
        alt: Math.round(th.exitAlt),
        severity: 'warn',
        data: {
          thermal: th.id,
          climbAtExit: Math.round(tailClimb * 10) / 10,
          laterMaxAlt: Math.round(laterMax),
        },
      });
    }
  }

  // --- weak_thermal_persist: insistere su termiche deboli in una giornata buona ---
  if (dayMedian > WEAK_PERSIST_DAY_MEDIAN) {
    for (const th of thermals) {
      if (th.durationS > WEAK_PERSIST_MIN_S && th.avgClimb < WEAK_PERSIST_CLIMB) {
        push({
          type: 'weak_thermal_persist',
          t: th.startT,
          lat: th.lat,
          lon: th.lon,
          alt: Math.round(th.entryAlt),
          severity: 'warn',
          data: {
            thermal: th.id,
            minutes: Math.round(th.durationS / 60),
            avgClimb: Math.round(th.avgClimb * 10) / 10,
            dayMedian: Math.round(dayMedian * 10) / 10,
          },
        });
      }
    }
  }

  // --- low_save: riagganciata bassa (merito) ---
  if (series.agl) {
    let i = 0;
    while (i < n) {
      if (series.agl[i] < LOW_SAVE_AGL) {
        const lowIdx = i;
        const lowAlt = series.alt[i];
        let j = i;
        let saved = false;
        while (j < n && series.alt[j] - lowAlt < LOW_SAVE_GAIN) {
          // se atterra (AGL ~0 e fermo) interrompiamo
          if (series.agl[j] < 20 && series.groundSpeed[j] < 1.5) break;
          j++;
        }
        if (j < n && series.alt[j] - lowAlt >= LOW_SAVE_GAIN) saved = true;
        if (saved) {
          push({
            type: 'low_save',
            t: series.t[lowIdx],
            lat: series.lat[lowIdx],
            lon: series.lon[lowIdx],
            alt: Math.round(series.alt[lowIdx]),
            severity: 'praise',
            data: {
              aglAtLow: Math.round(series.agl[lowIdx]),
              regained: Math.round(series.alt[j] - lowAlt),
            },
          });
          i = j;
        }
      }
      i++;
    }
  }

  // --- sink_line: linea di discendenza prolungata in planata ---
  for (const gl of glides) {
    let run = 0;
    for (let i = gl.startIdx; i <= gl.endIdx; i++) {
      if (series.vario[i] < SINK_VARIO) {
        run++;
        if (run === SINK_SUSTAIN_S) {
          const mid = i - Math.floor(SINK_SUSTAIN_S / 2);
          push({
            type: 'sink_line',
            t: series.t[mid],
            lat: series.lat[mid],
            lon: series.lon[mid],
            alt: Math.round(series.alt[mid]),
            severity: 'warn',
            data: { glide: gl.id, sustainedSinkS: SINK_SUSTAIN_S },
          });
        }
      } else {
        run = 0;
      }
    }
  }

  // --- low_crossing: planata che scende molto bassa sul terreno ---
  if (series.agl) {
    for (const gl of glides) {
      let minIdx = -1;
      let minAgl = Infinity;
      for (let i = gl.startIdx; i <= gl.endIdx; i++) {
        if (series.agl[i] < minAgl) {
          minAgl = series.agl[i];
          minIdx = i;
        }
      }
      // ignora il finale (atterraggio fisiologico)
      const endsFlight = landingT - series.t[gl.endIdx] < LANDING_WINDOW_S * 1000;
      if (minIdx >= 0 && minAgl < LOW_CROSSING_AGL && minAgl > 30) {
        const isFinalDescent = endsFlight && minIdx > gl.endIdx - 120;
        if (!isFinalDescent) {
          push({
            type: 'low_crossing',
            t: series.t[minIdx],
            lat: series.lat[minIdx],
            lon: series.lon[minIdx],
            alt: Math.round(series.alt[minIdx]),
            severity: endsFlight ? 'critical' : 'warn',
            data: {
              glide: gl.id,
              minAgl: Math.round(minAgl),
              endedFlight: endsFlight ? 'yes' : 'no',
            },
          });
        }
      }
    }
  }

  return points.sort((a, b) => a.t - b.t).map((p, i) => ({ ...p, id: `dp${i + 1}` }));
}
