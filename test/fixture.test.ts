import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseIgc } from '../src/lib/igc/parse';
import { preprocess } from '../src/lib/analysis/preprocess';
import { analyze, buildSummaryForAI } from '../src/lib/analysis/summary';

/**
 * Test end-to-end sul fixture XC: l'intera pipeline (parse → preprocess →
 * analisi → summary per il coach) su un volo completo con errori scriptati.
 */
describe('pipeline end-to-end su fixture XC', () => {
  const igc = readFileSync('test/fixtures/synthetic-xc.igc', 'utf8');

  it('parsa e analizza il volo completo', () => {
    const track = parseIgc(igc);
    expect(track.date).toBe('2026-05-17');
    const series = preprocess(track);
    const analysis = analyze(series);

    // il volo contiene 6 salite, alcune fuse: tra 4 e 7 termiche rilevate
    expect(analysis.thermals.length).toBeGreaterThanOrEqual(4);
    expect(analysis.thermals.length).toBeLessThanOrEqual(7);
    expect(analysis.glides.length).toBeGreaterThanOrEqual(3);

    // gli errori scriptati emergono nei punti di decisione
    const types = new Set(analysis.decisionPoints.map((d) => d.type));
    expect(types.has('weak_thermal_persist')).toBe(true);
    expect(types.has('sink_line')).toBe(true);

    // il vento stimato dalla deriva è ~da NE (verso SO = 225°)
    expect(analysis.windProfile.length).toBeGreaterThan(0);
    const dir = analysis.windProfile[0].dirDeg;
    expect(dir).toBeGreaterThan(180);
    expect(dir).toBeLessThan(270);
  });

  it('il summary per il coach è compatto e completo', () => {
    const track = parseIgc(igc);
    const analysis = analyze(preprocess(track));
    const summary = buildSummaryForAI(track, analysis, 'it');
    expect(JSON.stringify(summary).length).toBeLessThan(20_000);
    expect(summary.meta.lang).toBe('it');
    expect(summary.thermals.length).toBe(analysis.thermals.length);
    expect(summary.decisionPoints.length).toBe(analysis.decisionPoints.length);
  });
});
