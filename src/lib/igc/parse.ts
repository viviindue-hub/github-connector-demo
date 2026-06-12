import IGCParser from 'igc-parser';
import type { FlightTrack, Fix } from '../types';

export class IgcParseError extends Error {}

const MIN_FIXES = 60;

/**
 * Unico punto del codice che importa igc-parser: converte un file IGC nel
 * nostro FlightTrack. Se il parser strutturato fallisce, prova un fallback
 * permissivo sui soli B-record (alcuni vario producono header sporchi).
 */
export function parseIgc(text: string): FlightTrack {
  let track: FlightTrack | null = null;
  try {
    const file = IGCParser.parse(text, { lenient: true });
    if (file.date && file.fixes.length >= MIN_FIXES) {
      track = {
        date: file.date,
        pilot: file.pilot ?? null,
        gliderType: file.gliderType ?? null,
        site: file.site ?? null,
        fixes: file.fixes.map(
          (f): Fix => ({
            t: f.timestamp,
            lat: f.latitude,
            lon: f.longitude,
            gpsAlt: f.gpsAltitude,
            baroAlt: f.pressureAltitude,
            valid: f.valid,
          }),
        ),
      };
    }
  } catch {
    // si passa al fallback
  }

  if (!track) track = parseBRecordsLoose(text);

  if (track.fixes.length < MIN_FIXES) {
    throw new IgcParseError(
      `File IGC troppo corto o illeggibile (${track.fixes.length} fix, minimo ${MIN_FIXES})`,
    );
  }
  return track;
}

/**
 * Fallback: estrae data (HFDTE) e B-record via regex, gestendo il rollover
 * di mezzanotte UTC (orari che decrescono => +24h).
 */
export function parseBRecordsLoose(text: string): FlightTrack {
  const dateMatch = text.match(/HFDTE(?:DATE:)?\s*(\d{2})(\d{2})(\d{2})/);
  if (!dateMatch) throw new IgcParseError('Data del volo (HFDTE) non trovata');
  const [, dd, mm, yy] = dateMatch;
  const year = 2000 + parseInt(yy, 10);
  const date = `${year}-${mm}-${dd}`;
  const dayStart = Date.parse(`${date}T00:00:00Z`);

  const pilot = text.match(/HFPLTPILOT(?:INCHARGE)?:\s*(.+)/)?.[1]?.trim() ?? null;
  const glider = text.match(/HFGTYGLIDERTYPE:\s*(.+)/)?.[1]?.trim() ?? null;
  const site = text.match(/HFSITSITE:\s*(.+)/)?.[1]?.trim() ?? null;

  const bRe =
    /^B(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})([NS])(\d{3})(\d{2})(\d{3})([EW])([AV])(\d{5}|-\d{4})(\d{5})/;
  const fixes: Fix[] = [];
  let prevSec = -1;
  let dayOffsetMs = 0;

  for (const line of text.split(/\r?\n/)) {
    const m = bRe.exec(line);
    if (!m) continue;
    const [, hh, mi, ss, latD, latM, latMm, ns, lonD, lonM, lonMm, ew, av, baro, gps] = m;
    const sec = +hh * 3600 + +mi * 60 + +ss;
    if (prevSec >= 0 && sec < prevSec - 3600) dayOffsetMs += 86400000; // rollover mezzanotte
    prevSec = sec;
    const lat = (+latD + (+latM + +latMm / 1000) / 60) * (ns === 'S' ? -1 : 1);
    const lon = (+lonD + (+lonM + +lonMm / 1000) / 60) * (ew === 'W' ? -1 : 1);
    const baroAlt = parseInt(baro, 10);
    const gpsAlt = parseInt(gps, 10);
    fixes.push({
      t: dayStart + dayOffsetMs + sec * 1000,
      lat,
      lon,
      baroAlt: baroAlt === 0 ? null : baroAlt,
      gpsAlt: gpsAlt === 0 ? null : gpsAlt,
      valid: av === 'A',
    });
  }

  return { date, pilot, gliderType: glider, site, fixes };
}
