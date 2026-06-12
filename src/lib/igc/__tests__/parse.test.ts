import { describe, expect, it } from 'vitest';
import { parseIgc, parseBRecordsLoose, IgcParseError } from '../parse';
import { glide, startFlight, thermal, toIgc } from '../../../../test/synthIgc';

function syntheticIgc(): string {
  const s = startFlight();
  glide(s, 120);
  thermal(s, 180, 1.5);
  glide(s, 120);
  return toIgc(s);
}

describe('parseIgc', () => {
  it('parsa una traccia sintetica valida', () => {
    const track = parseIgc(syntheticIgc());
    expect(track.date).toBe('2026-06-01');
    expect(track.pilot).toContain('Test Pilot');
    expect(track.fixes.length).toBeGreaterThan(400);
    expect(track.fixes[0].lat).toBeCloseTo(46.0, 3);
    expect(track.fixes[0].lon).toBeCloseTo(11.0, 3);
  });

  it('i timestamp sono monotoni e a passo 1 s', () => {
    const track = parseIgc(syntheticIgc());
    for (let i = 1; i < track.fixes.length; i++) {
      expect(track.fixes[i].t - track.fixes[i - 1].t).toBe(1000);
    }
  });

  it('rifiuta file troppo corti', () => {
    const s = startFlight();
    glide(s, 10);
    expect(() => parseIgc(toIgc(s))).toThrow(IgcParseError);
  });

  it('fallback loose: gestisce il rollover di mezzanotte UTC', () => {
    const s = startFlight();
    glide(s, 200);
    const igc = toIgc(s, '2026-06-01', '23:58:30');
    const track = parseBRecordsLoose(igc);
    expect(track.fixes.length).toBe(201);
    for (let i = 1; i < track.fixes.length; i++) {
      expect(track.fixes[i].t).toBeGreaterThan(track.fixes[i - 1].t);
    }
    const lastDate = new Date(track.fixes[track.fixes.length - 1].t).toISOString();
    expect(lastDate.startsWith('2026-06-02')).toBe(true);
  });

  it('fallback loose: parsa anche senza header del pilota', () => {
    const s = startFlight();
    glide(s, 100);
    const igc = toIgc(s)
      .split('\r\n')
      .filter((l) => !l.startsWith('HFPLT'))
      .join('\r\n');
    const track = parseBRecordsLoose(igc);
    expect(track.pilot).toBeNull();
    expect(track.fixes.length).toBe(101);
  });
});
