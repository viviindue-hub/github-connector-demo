import type { DerivedSeries, FlightAnalysis } from './types';

/**
 * Regista automatico del video social (~30 s): sceglie i momenti chiave del
 * volo dall'analisi e costruisce uno storyboard — panoramica di apertura,
 * 2-3 highlight con camera che segue, zoom-out finale. Nessuna regia manuale.
 * Lo storyboard è consumato dal renderer in background (renderVideo.ts).
 *
 * CRITERI DI SCELTA degli highlight (in quest'ordine):
 * 1. la termica col miglior rateo sui 30 s (ripresa della fase finale + uscita)
 * 2. la planata più lunga in linea retta (il tratto centrale)
 * 3. un eventuale "low save" (riagganciata bassa)
 * Se non bastano, finestre a 25/55/80% del volo. Ogni scena porta un tag
 * (tipo + metrica) per la didascalia nel video.
 */

export type SceneTag = 'thermal' | 'glide' | 'save' | 'moment';

export interface Scene {
  kind: 'overview' | 'follow';
  startT?: number;
  endT?: number;
  durS: number;
  /** tipo di momento (per la didascalia nel video) */
  tag?: SceneTag;
  /** metrica già formattata, es. "+3.4 m/s" */
  metric?: string;
}

const HIGHLIGHT_S = 6.5;

interface Pick {
  s: number;
  e: number;
  tag: SceneTag;
  metric: string;
}

export function buildStoryboard(series: DerivedSeries, analysis: FlightAnalysis): Scene[] {
  const t0 = series.t[0];
  const t1 = series.t[series.t.length - 1];
  const clamp = (v: number) => Math.max(t0, Math.min(t1, v));
  const win = (s: number, e: number) => ({ s: clamp(s), e: clamp(e) });

  const picks: Pick[] = [];

  // 1. migliore termica: l'uscita è il momento visivamente più forte
  const th = [...analysis.thermals].sort((a, b) => b.best30s - a.best30s)[0];
  if (th)
    picks.push({
      ...win(th.endT - 180_000, th.endT + 45_000),
      tag: 'thermal',
      metric: `+${th.best30s.toFixed(1)} m/s`,
    });

  // 2. planata più lunga: il tratto centrale
  const gl = [...analysis.glides].sort((a, b) => b.straightKm - a.straightKm)[0];
  if (gl) {
    const mid = (gl.startT + gl.endT) / 2;
    picks.push({
      ...win(mid - 150_000, mid + 150_000),
      tag: 'glide',
      metric: `${gl.straightKm.toFixed(0)} km`,
    });
  }

  // 3. low save: dramma vero
  const save = analysis.decisionPoints.find((d) => d.type === 'low_save');
  if (save) {
    const regained = Number(save.data.regained ?? 0);
    picks.push({
      ...win(save.t - 60_000, save.t + 120_000),
      tag: 'save',
      metric: regained > 0 ? `+${Math.round(regained)} m` : '',
    });
  }

  // riempi fino a 3 highlight con finestre distribuite sul volo
  for (const frac of [0.25, 0.55, 0.8]) {
    if (picks.length >= 3) break;
    const c = t0 + (t1 - t0) * frac;
    const cand = win(c - 150_000, c + 150_000);
    if (!picks.some((p) => cand.s < p.e && p.s < cand.e))
      picks.push({ ...cand, tag: 'moment', metric: '' });
  }

  // ordina, elimina sovrapposizioni, massimo 3
  picks.sort((a, b) => a.s - b.s);
  const chosen: Pick[] = [];
  for (const p of picks) {
    if (chosen.length >= 3) break;
    if (chosen.length === 0 || p.s >= chosen[chosen.length - 1].e - 30_000) chosen.push(p);
  }

  const scenes: Scene[] = [{ kind: 'overview', durS: 4.5 }];
  for (const p of chosen) {
    if (p.e - p.s < 30_000) continue;
    scenes.push({
      kind: 'follow',
      startT: p.s,
      endT: p.e,
      durS: HIGHLIGHT_S,
      tag: p.tag,
      metric: p.metric,
    });
  }
  scenes.push({ kind: 'overview', durS: 6 });
  return scenes;
}
