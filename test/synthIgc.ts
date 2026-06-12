/**
 * Generatore di tracce IGC sintetiche per i test: scenari scriptati con
 * output attesi esatti (termica a rateo noto, planata a efficienza nota,
 * low save, linea di discendenza).
 */
import { destination } from '../src/lib/geo';

export interface SynthFix {
  sec: number; // secondi dalla partenza
  lat: number;
  lon: number;
  alt: number;
}

export interface SynthState {
  lat: number;
  lon: number;
  alt: number;
  headingDeg: number;
  sec: number;
  fixes: SynthFix[];
}

export function startFlight(lat = 46.0, lon = 11.0, alt = 1500): SynthState {
  const s: SynthState = { lat, lon, alt, headingDeg: 0, sec: 0, fixes: [] };
  record(s);
  return s;
}

function record(s: SynthState) {
  s.fixes.push({ sec: s.sec, lat: s.lat, lon: s.lon, alt: s.alt });
}

/** Planata rettilinea: velocità e vario costanti. */
export function glide(
  s: SynthState,
  seconds: number,
  speedMs = 10,
  varioMs = -1.1,
  headingDeg = s.headingDeg,
): SynthState {
  s.headingDeg = headingDeg;
  for (let i = 0; i < seconds; i++) {
    const p = destination(s.lat, s.lon, headingDeg, speedMs);
    s.lat = p.lat;
    s.lon = p.lon;
    s.alt += varioMs;
    s.sec += 1;
    record(s);
  }
  return s;
}

/** Termica: cerchi a raggio e rateo costanti, con deriva opzionale (vento). */
export function thermal(
  s: SynthState,
  seconds: number,
  climbMs = 1.5,
  radiusM = 60,
  driftMs = 0,
  driftDirDeg = 0,
  circleSpeedMs = 9,
): SynthState {
  const turnRateDeg = ((circleSpeedMs / radiusM) * 180) / Math.PI; // °/s
  for (let i = 0; i < seconds; i++) {
    s.headingDeg = (s.headingDeg + turnRateDeg) % 360;
    let p = destination(s.lat, s.lon, s.headingDeg, circleSpeedMs);
    if (driftMs > 0) p = destination(p.lat, p.lon, driftDirDeg, driftMs);
    s.lat = p.lat;
    s.lon = p.lon;
    s.alt += climbMs;
    s.sec += 1;
    record(s);
  }
  return s;
}

/** Serializza in IGC valido (header minimo + B-record a 1 Hz). */
export function toIgc(s: SynthState, date = '2026-06-01', startUtc = '10:00:00'): string {
  const [Y, M, D] = date.split('-');
  const startSec =
    parseInt(startUtc.slice(0, 2)) * 3600 +
    parseInt(startUtc.slice(3, 5)) * 60 +
    parseInt(startUtc.slice(6, 8));
  const lines = [
    'AXXX001 SynthLogger',
    `HFDTEDATE:${D}${M}${Y.slice(2)}`,
    'HFPLTPILOTINCHARGE: Test Pilot',
    'HFGTYGLIDERTYPE: Synth Wing',
    'HFSITSITE: Synth Site',
  ];
  for (const f of s.fixes) {
    const t = startSec + f.sec;
    const hh = String(Math.floor(t / 3600)).padStart(2, '0');
    const mm = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
    const ss = String(t % 60).padStart(2, '0');
    lines.push(`B${hh}${mm}${ss}${igcLat(f.lat)}${igcLon(f.lon)}A${igcAlt(f.alt)}${igcAlt(f.alt)}`);
  }
  lines.push('GSYNTHSECURITY');
  return lines.join('\r\n');
}

function igcLat(lat: number): string {
  const hemi = lat >= 0 ? 'N' : 'S';
  const a = Math.abs(lat);
  const deg = Math.floor(a);
  const minThousandths = Math.round((a - deg) * 60000);
  return `${String(deg).padStart(2, '0')}${String(minThousandths).padStart(5, '0')}${hemi}`;
}

function igcLon(lon: number): string {
  const hemi = lon >= 0 ? 'E' : 'W';
  const a = Math.abs(lon);
  const deg = Math.floor(a);
  const minThousandths = Math.round((a - deg) * 60000);
  return `${String(deg).padStart(3, '0')}${String(minThousandths).padStart(5, '0')}${hemi}`;
}

function igcAlt(alt: number): string {
  return String(Math.max(0, Math.round(alt))).padStart(5, '0');
}
