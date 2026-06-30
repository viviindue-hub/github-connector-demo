import type { DerivedSeries, GlideSegment, ThermalSegment } from '../types';
import { bearing } from '../geo';
import { buildWindModel } from './airspeed';

/**
 * Statistiche OGGETTIVE per ogni planata (energy-line per transizione):
 * efficienza misurata (L/D), velocità all'aria e al suolo, quota persa,
 * componente di vento lungo la rotta (+ a favore / − contro). Nessun giudizio.
 */
export interface GlideStat {
  id: string;
  /** L/D misurato (straight / heightLost); null se non perde quota */
  ratio: number | null;
  groundKmh: number;
  /** stima velocità all'aria; null senza stima di vento */
  airKmh: number | null;
  heightLostM: number;
  distanceKm: number;
  /** componente vento lungo la rotta in km/h (+ a favore, − contro); null senza vento */
  windCompKmh: number | null;
  startT: number;
  midIdx: number;
}

export function glideStats(
  series: DerivedSeries,
  thermals: ThermalSegment[],
  glides: GlideSegment[],
): GlideStat[] {
  const wind = buildWindModel(thermals);

  return glides.map((g) => {
    let gsum = 0;
    let asum = 0;
    let cnt = 0;
    for (let i = g.startIdx; i <= g.endIdx; i++) {
      const gs = series.groundSpeed[i];
      gsum += gs;
      if (wind.ok) {
        const hr = (series.heading[i] * Math.PI) / 180;
        const gE = gs * Math.sin(hr);
        const gN = gs * Math.cos(hr);
        const w = wind.at(series.alt[i]);
        asum += Math.hypot(gE - w.e, gN - w.n);
      }
      cnt += 1;
    }
    cnt = Math.max(1, cnt);

    let windCompKmh: number | null = null;
    if (wind.ok) {
      const crs = bearing(
        series.lat[g.startIdx],
        series.lon[g.startIdx],
        series.lat[g.endIdx],
        series.lon[g.endIdx],
      );
      const cr = (crs * Math.PI) / 180;
      const midAlt = (series.alt[g.startIdx] + series.alt[g.endIdx]) / 2;
      const w = wind.at(midAlt); // vettore "verso cui" spinge il vento
      const along = w.e * Math.sin(cr) + w.n * Math.cos(cr); // + = a favore
      windCompKmh = along * 3.6;
    }

    return {
      id: g.id,
      ratio: isFinite(g.ratio) ? g.ratio : null,
      groundKmh: (gsum / cnt) * 3.6,
      airKmh: wind.ok ? (asum / cnt) * 3.6 : null,
      heightLostM: g.heightLost,
      distanceKm: g.straightKm,
      windCompKmh,
      startT: g.startT,
      midIdx: Math.floor((g.startIdx + g.endIdx) / 2),
    };
  });
}
