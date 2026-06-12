import { describe, expect, it } from 'vitest';
import { parseIgc } from '../../igc/parse';
import { attachAgl, preprocess } from '../preprocess';
import { detectThermals, detectGlides, windProfile } from '../segments';
import { extractDecisionPoints } from '../decisions';
import { analyze, buildSummaryForAI, lttb } from '../summary';
import { glide, startFlight, thermal, toIgc } from '../../../../test/synthIgc';
import type { ElevationFetcher } from '../preprocess';

/** Terreno piatto a quota fissa, per controllare l'AGL nei test. */
const flatGround = (elevation: number): ElevationFetcher => async (points) =>
  points.map(() => elevation);

function seriesOf(buildFn: ReturnType<typeof startFlight> | string) {
  const igc = typeof buildFn === 'string' ? buildFn : toIgc(buildFn);
  return preprocess(parseIgc(igc));
}

describe('preprocess', () => {
  it('vario corretto su planata a -1.1 m/s (media, per via della quantizzazione a metri interi)', () => {
    const s = startFlight();
    glide(s, 300, 10, -1.1);
    const series = seriesOf(s);
    const mid = Math.floor(series.t.length / 2);
    let sum = 0;
    for (let i = mid - 50; i < mid + 50; i++) sum += series.vario[i];
    expect(sum / 100).toBeCloseTo(-1.1, 1);
  });

  it('ground speed corretta su planata a 10 m/s', () => {
    const s = startFlight();
    glide(s, 300, 10);
    const series = seriesOf(s);
    const mid = Math.floor(series.t.length / 2);
    expect(series.groundSpeed[mid]).toBeCloseTo(10, 0);
  });

  it('turn rate ~8.6 °/s in termica (9 m/s su raggio 60 m)', () => {
    const s = startFlight();
    glide(s, 60);
    thermal(s, 240, 1.5, 60);
    glide(s, 60);
    const series = seriesOf(s);
    const mid = Math.floor(series.t.length / 2);
    const expected = ((9 / 60) * 180) / Math.PI; // ≈ 8.59 °/s
    expect(Math.abs(series.turnRate[mid])).toBeGreaterThan(expected - 2);
    expect(Math.abs(series.turnRate[mid])).toBeLessThan(expected + 2);
  });

  it('attachAgl calcola la quota sul terreno', async () => {
    const s = startFlight(46, 11, 1500);
    glide(s, 120);
    let series = seriesOf(s);
    series = await attachAgl(series, flatGround(500));
    expect(series.agl).not.toBeNull();
    expect(series.agl![0]).toBeCloseTo(1000, -1);
  });

  it('attachAgl degrada con grazia se la rete fallisce', async () => {
    const s = startFlight();
    glide(s, 120);
    let series = seriesOf(s);
    series = await attachAgl(series, async () => {
      throw new Error('offline');
    });
    expect(series.agl).toBeNull();
  });
});

describe('segments', () => {
  it('rileva esattamente una termica con gain corretto', () => {
    const s = startFlight();
    glide(s, 180);
    thermal(s, 300, 1.5); // +450 m
    glide(s, 180);
    const series = seriesOf(s);
    const thermals = detectThermals(series);
    expect(thermals.length).toBe(1);
    expect(thermals[0].gain).toBeGreaterThan(380);
    expect(thermals[0].gain).toBeLessThan(480);
    expect(thermals[0].avgClimb).toBeGreaterThan(1.2);
    expect(thermals[0].avgClimb).toBeLessThan(1.7);
  });

  it('non rileva termiche su un volo tutto planata', () => {
    const s = startFlight(46, 11, 3000);
    glide(s, 600);
    const thermals = detectThermals(seriesOf(s));
    expect(thermals.length).toBe(0);
  });

  it('fonde due circling vicini (gap < 45 s) in una sola termica', () => {
    const s = startFlight();
    glide(s, 120);
    thermal(s, 120, 1.5);
    glide(s, 30); // pausa breve
    thermal(s, 120, 1.5);
    glide(s, 120);
    const thermals = detectThermals(seriesOf(s));
    expect(thermals.length).toBe(1);
  });

  it('rileva le planate tra le termiche con efficienza ~9', () => {
    const s = startFlight(46, 11, 2500);
    glide(s, 300, 9.9, -1.1); // ~9:1
    thermal(s, 200, 1.5);
    glide(s, 300, 9.9, -1.1);
    const series = seriesOf(s);
    const thermals = detectThermals(series);
    const glides = detectGlides(series, thermals);
    expect(glides.length).toBe(2);
    expect(glides[0].ratio).toBeGreaterThan(7);
    expect(glides[0].ratio).toBeLessThan(11);
  });

  it('stima il vento dalla deriva delle termiche', () => {
    const s = startFlight();
    glide(s, 120);
    thermal(s, 300, 1.5, 60, 4, 90); // deriva 4 m/s verso est
    glide(s, 120);
    const thermals = detectThermals(seriesOf(s));
    expect(thermals.length).toBe(1);
    expect(thermals[0].drift.speedMs).toBeGreaterThan(2.5);
    expect(thermals[0].drift.dirDeg).toBeGreaterThan(45);
    expect(thermals[0].drift.dirDeg).toBeLessThan(135);
    const wind = windProfile(thermals);
    expect(wind.length).toBe(1);
  });
});

describe('decision points', () => {
  /**
   * Volo "pulito": termiche portate in cima fino al decadimento (taper
   * finale a 0.2 m/s, come fa un pilota che lascia quando non sale più).
   */
  function cleanFlight() {
    const s = startFlight(46, 11, 1500);
    glide(s, 120, 10, -1.0);
    thermal(s, 240, 2.0);
    thermal(s, 90, 0.2); // decadimento in cima: si lascia quando non tira più
    glide(s, 240, 10, -1.0);
    thermal(s, 240, 2.0);
    thermal(s, 90, 0.2);
    glide(s, 240, 10, -1.0);
    return s;
  }

  it('il volo pulito non genera early_exit né weak_thermal_persist né sink_line', () => {
    const series = seriesOf(cleanFlight());
    const thermals = detectThermals(series);
    const glides = detectGlides(series, thermals);
    const dps = extractDecisionPoints(series, thermals, glides);
    expect(dps.filter((d) => d.type === 'early_exit')).toHaveLength(0);
    expect(dps.filter((d) => d.type === 'weak_thermal_persist')).toHaveLength(0);
    expect(dps.filter((d) => d.type === 'sink_line')).toHaveLength(0);
  });

  it('early_exit: lasciare a +2 m/s una termica e risalire 400 m dopo', () => {
    const s = startFlight(46, 11, 1200);
    glide(s, 120);
    thermal(s, 180, 2.0); // lasciata mentre sale forte (esce a ~1560)
    glide(s, 180, 10, -1.0);
    thermal(s, 400, 2.0); // poi su fino a ~2200 → laterMax >> exit+300
    glide(s, 120);
    const series = seriesOf(s);
    const thermals = detectThermals(series);
    const dps = extractDecisionPoints(series, thermals, detectGlides(series, thermals));
    expect(dps.filter((d) => d.type === 'early_exit').length).toBeGreaterThanOrEqual(1);
  });

  it('weak_thermal_persist: 4 min a 0.3 m/s in giornata da 2 m/s', () => {
    const s = startFlight(46, 11, 1500);
    glide(s, 120);
    thermal(s, 300, 2.0);
    glide(s, 120);
    thermal(s, 300, 2.0);
    glide(s, 120);
    thermal(s, 240, 0.3); // la termica debole su cui si insiste
    glide(s, 120);
    const series = seriesOf(s);
    const thermals = detectThermals(series);
    const dps = extractDecisionPoints(series, thermals, detectGlides(series, thermals));
    const weak = dps.filter((d) => d.type === 'weak_thermal_persist');
    expect(weak.length).toBe(1);
  });

  it('sink_line: 2 min a -2.5 m/s in planata', () => {
    const s = startFlight(46, 11, 2500);
    glide(s, 120, 10, -1.0);
    glide(s, 120, 12, -2.5); // linea di discendenza
    glide(s, 120, 10, -1.0);
    thermal(s, 120, 1.5);
    glide(s, 60);
    const series = seriesOf(s);
    const thermals = detectThermals(series);
    const dps = extractDecisionPoints(series, thermals, detectGlides(series, thermals));
    expect(dps.filter((d) => d.type === 'sink_line').length).toBeGreaterThanOrEqual(1);
  });

  it('low_save: sotto i 250 m AGL e poi +400 m (merito)', async () => {
    const s = startFlight(46, 11, 1200);
    glide(s, 400, 10, -2.4); // scende fino a ~240 → AGL ~140 con terreno a 100
    thermal(s, 400, 1.5); // risale ~600 m
    glide(s, 120);
    let series = seriesOf(s);
    series = await attachAgl(series, flatGround(100));
    const thermals = detectThermals(series);
    const dps = extractDecisionPoints(series, thermals, detectGlides(series, thermals));
    const saves = dps.filter((d) => d.type === 'low_save');
    expect(saves.length).toBe(1);
    expect(saves[0].severity).toBe('praise');
  });
});

describe('summary per il coach AI', () => {
  it('il JSON è compatto (< 20 KB) e gli ID sono coerenti', () => {
    const s = startFlight(46, 11, 1500);
    for (let i = 0; i < 6; i++) {
      glide(s, 200, 10, -1.0);
      thermal(s, 250, 1.2 + (i % 3) * 0.5);
    }
    glide(s, 300, 10, -1.0);
    const track = parseIgc(toIgc(s));
    const series = preprocess(track);
    const analysis = analyze(series);
    const summary = buildSummaryForAI(track, analysis, 'it');
    const json = JSON.stringify(summary);
    expect(json.length).toBeLessThan(20_000);
    const ids = new Set([
      ...summary.thermals.map((t) => t.id),
      ...summary.glides.map((g) => g.id),
      ...summary.decisionPoints.map((d) => d.id),
    ]);
    // ogni planata riferisce una termica esistente (o null)
    for (const gl of summary.glides) {
      if (gl.fromThermal) expect(ids.has(gl.fromThermal)).toBe(true);
    }
    expect(summary.meta.durationMin).toBeGreaterThan(30);
  });

  it('lttb riduce a ~2000 punti preservando gli estremi', () => {
    const n = 20000;
    const t = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      t[i] = i * 1000;
      y[i] = Math.sin(i / 200) * 100 + i / 100;
    }
    const out = lttb(t, y, 2000);
    expect(out.length).toBe(2000);
    expect(out[0][0]).toBe(0);
    expect(out[out.length - 1][0]).toBe((n - 1) * 1000);
  });
});
