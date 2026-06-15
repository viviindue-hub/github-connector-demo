import { Cartesian3, Color } from 'cesium';
import type { DerivedSeries } from '../lib/types';
import { varioColor } from './varioScale';

export { varioColor };

export interface TrackGeometry {
  positions: Cartesian3[];
  colors: Color[];
}

/**
 * Geometria della traccia colorata per vario, decimata a ~maxVertices
 * per tenere leggera la polyline.
 */
export function buildTrackGeometry(series: DerivedSeries, maxVertices = 5000): TrackGeometry {
  const n = series.t.length;
  const stride = Math.max(1, Math.ceil(n / maxVertices));
  const positions: Cartesian3[] = [];
  const colors: Color[] = [];
  for (let i = 0; i < n; i += stride) {
    positions.push(Cartesian3.fromDegrees(series.lon[i], series.lat[i], series.alt[i]));
    colors.push(varioColor(series.vario[i]));
  }
  return { positions, colors };
}

/** Indice della serie per un epoch ms (clamp ai bordi). */
export function indexAtTime(series: DerivedSeries, epochMs: number): number {
  const t0 = series.t[0];
  const i = Math.round((epochMs - t0) / 1000);
  return Math.max(0, Math.min(series.t.length - 1, i));
}

/** Posizione interpolata del pilota a un certo istante. */
export function positionAtTime(series: DerivedSeries, epochMs: number): Cartesian3 {
  const t0 = series.t[0];
  const f = (epochMs - t0) / 1000;
  const i = Math.max(0, Math.min(series.t.length - 2, Math.floor(f)));
  const w = Math.max(0, Math.min(1, f - i));
  const lat = series.lat[i] + (series.lat[i + 1] - series.lat[i]) * w;
  const lon = series.lon[i] + (series.lon[i + 1] - series.lon[i]) * w;
  const alt = series.alt[i] + (series.alt[i + 1] - series.alt[i]) * w;
  return Cartesian3.fromDegrees(lon, lat, alt);
}
