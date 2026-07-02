import type { DerivedSeries, FlightAnalysis } from './types';

/**
 * Regista automatico del video social (~30 s): sceglie i momenti chiave del
 * volo dall'analisi e costruisce uno storyboard — panoramica di apertura,
 * 2-3 highlight con camera che segue, zoom-out finale. Nessuna regia manuale.
 * Lo storyboard è consumato dal renderer in background (renderVideo.ts).
 */

export interface Scene {
  kind: 'overview' | 'follow';
  startT?: number;
  endT?: number;
  durS: number;
}

const HIGHLIGHT_S = 6.5;

export function buildStoryboard(series: DerivedSeries, analysis: FlightAnalysis): Scene[] {
  const t0 = series.t[0];
  const t1 = series.t[series.t.length - 1];
  const clamp = (v: number) => Math.max(t0, Math.min(t1, v));
  const win = (s: number, e: number) => ({ s: clamp(s), e: clamp(e) });

  const picks: Array<{ s: number; e: number }> = [];

  // migliore termica: l'uscita è il momento visivamente più forte
  const th = [...analysis.thermals].sort((a, b) => b.best30s - a.best30s)[0];
  if (th) picks.push(win(th.endT - 180_000, th.endT + 45_000));

  // planata più lunga: il tratto centrale
  const gl = [...analysis.glides].sort((a, b) => b.straightKm - a.straightKm)[0];
  if (gl) {
    const mid = (gl.startT + gl.endT) / 2;
    picks.push(win(mid - 150_000, mid + 150_000));
  }

  // low save: dramma vero
  const save = analysis.decisionPoints.find((d) => d.type === 'low_save');
  if (save) picks.push(win(save.t - 60_000, save.t + 120_000));

  // riempi fino a 3 highlight con finestre distribuite sul volo
  for (const frac of [0.25, 0.55, 0.8]) {
    if (picks.length >= 3) break;
    const c = t0 + (t1 - t0) * frac;
    const cand = win(c - 150_000, c + 150_000);
    if (!picks.some((p) => cand.s < p.e && p.s < cand.e)) picks.push(cand);
  }

  // ordina, elimina sovrapposizioni, massimo 3
  picks.sort((a, b) => a.s - b.s);
  const chosen: Array<{ s: number; e: number }> = [];
  for (const p of picks) {
    if (chosen.length >= 3) break;
    if (chosen.length === 0 || p.s >= chosen[chosen.length - 1].e - 30_000) chosen.push(p);
  }

  const scenes: Scene[] = [{ kind: 'overview', durS: 4.5 }];
  for (const p of chosen) {
    if (p.e - p.s < 30_000) continue;
    scenes.push({ kind: 'follow', startT: p.s, endT: p.e, durS: HIGHLIGHT_S });
  }
  scenes.push({ kind: 'overview', durS: 6 });
  return scenes;
}
