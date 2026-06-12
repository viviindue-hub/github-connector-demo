import type { DerivedSeries, GlideSegment, ThermalSegment, WindEstimate } from '../types';
import { bearing, haversine } from '../geo';

// Soglie macchina a stati circling (vedi piano)
const ENTER_RATE = 6; // °/s sostenuti
const ENTER_SUSTAIN_S = 15;
const ENTER_CUM_DEG = 270; // gradi cumulativi stesso segno
const ENTER_CUM_WIN_S = 30;
const EXIT_RATE = 4; // °/s (isteresi)
const EXIT_SUSTAIN_S = 20;
const MERGE_GAP_S = 45;
const MIN_THERMAL_S = 60;
const MIN_GLIDE_S = 30;

interface RawSeg {
  start: number;
  end: number; // indici inclusivi
}

/** Indici (inclusivi) dei segmenti in cui il pilota sta girando. */
export function detectCircling(series: DerivedSeries): RawSeg[] {
  const { turnRate } = series;
  const n = turnRate.length;
  const segs: RawSeg[] = [];
  let circling = false;
  let segStart = 0;
  let calmRun = 0;

  for (let i = 0; i < n; i++) {
    if (!circling) {
      if (enterConditionAt(series, i)) {
        circling = true;
        // retrodatiamo l'inizio a quando la rotazione è effettivamente partita
        let s = i;
        while (s > 0 && Math.abs(turnRate[s - 1]) >= EXIT_RATE) s--;
        segStart = s;
        calmRun = 0;
      }
    } else {
      if (Math.abs(turnRate[i]) < EXIT_RATE) {
        calmRun++;
        if (calmRun >= EXIT_SUSTAIN_S) {
          segs.push({ start: segStart, end: i - calmRun });
          circling = false;
        }
      } else {
        calmRun = 0;
      }
    }
  }
  if (circling) segs.push({ start: segStart, end: n - 1 });
  return segs;
}

function enterConditionAt(series: DerivedSeries, i: number): boolean {
  const { turnRate, heading } = series;
  const n = turnRate.length;
  // condizione A: |turnRate| >= 6°/s sostenuto per 15 s che terminano in i
  if (i >= ENTER_SUSTAIN_S - 1) {
    let ok = true;
    for (let k = i - ENTER_SUSTAIN_S + 1; k <= i; k++) {
      if (Math.abs(turnRate[k]) < ENTER_RATE) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  // condizione B: 270° cumulativi nello stesso senso negli ultimi 30 s
  if (i >= 1) {
    const a = Math.max(0, i - ENTER_CUM_WIN_S + 1);
    let cum = 0;
    for (let k = a + 1; k <= Math.min(i, n - 1); k++) {
      // usiamo il turnRate integrato che è già smussato
      cum += turnRate[k];
    }
    if (Math.abs(cum) >= ENTER_CUM_DEG) return true;
  }
  void heading;
  return false;
}

/** Fonde segmenti circling vicini e tiene solo quelli da termica vera. */
export function detectThermals(series: DerivedSeries): ThermalSegment[] {
  const raw = detectCircling(series);
  const merged: RawSeg[] = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last && seg.start - last.end <= MERGE_GAP_S) last.end = seg.end;
    else merged.push({ ...seg });
  }

  const thermals: ThermalSegment[] = [];
  for (const seg of merged) {
    const durationS = seg.end - seg.start;
    if (durationS < MIN_THERMAL_S) continue;
    const entryAlt = series.alt[seg.start];
    const exitAlt = series.alt[seg.end];
    const gain = exitAlt - entryAlt;

    // miglior salita su 30 s
    let best30s = -Infinity;
    for (let i = seg.start; i + 30 <= seg.end; i++) {
      best30s = Math.max(best30s, (series.alt[i + 30] - series.alt[i]) / 30);
    }
    if (!isFinite(best30s)) best30s = gain / Math.max(1, durationS);

    // raggio medio: v = ω r  =>  r = v / ω
    let rSum = 0;
    let rCount = 0;
    for (let i = seg.start; i <= seg.end; i++) {
      const omega = (Math.abs(series.turnRate[i]) * Math.PI) / 180;
      if (omega > 0.02) {
        rSum += series.groundSpeed[i] / omega;
        rCount++;
      }
    }

    // deriva: spostamento del baricentro tra prima e seconda metà
    const mid = Math.floor((seg.start + seg.end) / 2);
    const c1 = centroid(series, seg.start, mid);
    const c2 = centroid(series, mid, seg.end);
    const driftDist = haversine(c1.lat, c1.lon, c2.lat, c2.lon);
    const driftTime = Math.max(1, (seg.end - seg.start) / 2);
    const drift = {
      dirDeg: driftDist > 5 ? bearing(c1.lat, c1.lon, c2.lat, c2.lon) : 0,
      speedMs: driftDist / driftTime,
    };

    const c = centroid(series, seg.start, seg.end);
    thermals.push({
      id: `th${thermals.length + 1}`,
      startIdx: seg.start,
      endIdx: seg.end,
      startT: series.t[seg.start],
      endT: series.t[seg.end],
      entryAlt,
      exitAlt,
      gain,
      durationS,
      avgClimb: gain / Math.max(1, durationS),
      best30s,
      meanRadius: rCount > 0 ? rSum / rCount : 0,
      drift,
      lat: c.lat,
      lon: c.lon,
    });
  }
  return thermals;
}

function centroid(series: DerivedSeries, a: number, b: number): { lat: number; lon: number } {
  let lat = 0;
  let lon = 0;
  const m = b - a + 1;
  for (let i = a; i <= b; i++) {
    lat += series.lat[i];
    lon += series.lon[i];
  }
  return { lat: lat / m, lon: lon / m };
}

/** Le planate sono ciò che sta tra le termiche (durata >= 30 s). */
export function detectGlides(series: DerivedSeries, thermals: ThermalSegment[]): GlideSegment[] {
  const n = series.t.length;
  const glides: GlideSegment[] = [];
  const bounds: Array<[number, number]> = [];
  let cursor = 0;
  for (const th of thermals) {
    if (th.startIdx - cursor >= MIN_GLIDE_S) bounds.push([cursor, th.startIdx]);
    cursor = th.endIdx;
  }
  if (n - 1 - cursor >= MIN_GLIDE_S) bounds.push([cursor, n - 1]);

  for (const [a, b] of bounds) {
    let dist = 0;
    let varioSum = 0;
    let speedSum = 0;
    let minAgl = Infinity;
    for (let i = a + 1; i <= b; i++) {
      dist += haversine(series.lat[i - 1], series.lon[i - 1], series.lat[i], series.lon[i]);
      varioSum += series.vario[i];
      speedSum += series.groundSpeed[i];
      if (series.agl) minAgl = Math.min(minAgl, series.agl[i]);
    }
    const m = b - a;
    const straight = haversine(series.lat[a], series.lon[a], series.lat[b], series.lon[b]);
    const heightLost = series.alt[a] - series.alt[b];
    glides.push({
      id: `gl${glides.length + 1}`,
      startIdx: a,
      endIdx: b,
      startT: series.t[a],
      endT: series.t[b],
      distanceKm: dist / 1000,
      straightKm: straight / 1000,
      heightLost,
      ratio: heightLost > 1 ? straight / heightLost : Infinity,
      avgSpeedMs: speedSum / m,
      avgVario: varioSum / m,
      minAgl: series.agl ? minAgl : null,
    });
  }
  return glides;
}

/** Profilo vento per fasce di 30 min, dai vettori di deriva delle termiche. */
export function windProfile(thermals: ThermalSegment[]): WindEstimate[] {
  if (thermals.length === 0) return [];
  const BUCKET_MS = 30 * 60 * 1000;
  const buckets = new Map<number, { u: number; v: number; n: number }>();
  for (const th of thermals) {
    if (th.drift.speedMs < 0.3) continue; // deriva trascurabile, non informativa
    const key = Math.floor(th.startT / BUCKET_MS);
    const rad = (th.drift.dirDeg * Math.PI) / 180;
    const e = buckets.get(key) ?? { u: 0, v: 0, n: 0 };
    e.u += th.drift.speedMs * Math.sin(rad);
    e.v += th.drift.speedMs * Math.cos(rad);
    e.n++;
    buckets.set(key, e);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([key, { u, v, n }]) => {
      const uu = u / n;
      const vv = v / n;
      return {
        t: key * BUCKET_MS + BUCKET_MS / 2,
        dirDeg: ((Math.atan2(uu, vv) * 180) / Math.PI + 360) % 360,
        speedMs: Math.hypot(uu, vv),
      };
    });
}
