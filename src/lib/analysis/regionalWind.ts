import { haversine } from '../geo';

/**
 * Profilo vento di ZONA: aggrega i campioni di vento (ricavati dalle termiche
 * di più voli) in fasce di quota. È lo stesso aggregatore che alimenterà la
 * versione live/aggregata multi-pilota (il feed esterno produrrà gli stessi
 * WindSample). Pura e testabile; lo storage è separato e degrada senza browser.
 */

export interface WindSample {
  alt: number;
  /** provenienza del vento (°, "da") */
  fromDeg: number;
  speedKmh: number;
  /** epoch ms */
  t: number;
  lat: number;
  lon: number;
}

export interface WindBand {
  low: number;
  high: number;
  /** provenienza media (°, "da") */
  fromDeg: number;
  speedKmh: number;
  /** numero di campioni nella fascia */
  count: number;
}

/** Aggrega i campioni per fasce di quota (default 300 m), media circolare della direzione. */
export function aggregateWindByBand(samples: WindSample[], bandM = 300): WindBand[] {
  const groups = new Map<number, WindSample[]>();
  for (const s of samples) {
    const key = Math.floor(s.alt / bandM);
    const arr = groups.get(key);
    if (arr) arr.push(s);
    else groups.set(key, [s]);
  }
  const bands: WindBand[] = [];
  for (const [key, arr] of groups) {
    let x = 0;
    let y = 0;
    let spd = 0;
    for (const s of arr) {
      const r = (s.fromDeg * Math.PI) / 180;
      x += Math.cos(r);
      y += Math.sin(r);
      spd += s.speedKmh;
    }
    let dir = (Math.atan2(y / arr.length, x / arr.length) * 180) / Math.PI;
    if (dir < 0) dir += 360;
    bands.push({
      low: key * bandM,
      high: key * bandM + bandM,
      fromDeg: Math.round(dir) % 360,
      speedKmh: Math.round(spd / arr.length),
      count: arr.length,
    });
  }
  return bands.sort((a, b) => b.low - a.low);
}

/** Tiene solo i campioni entro radiusKm dal punto dato. */
export function samplesNear(
  samples: WindSample[],
  lat: number,
  lon: number,
  radiusKm = 40,
): WindSample[] {
  return samples.filter((s) => haversine(lat, lon, s.lat, s.lon) <= radiusKm * 1000);
}

// ---- storage locale (degrada senza localStorage) ----

const KEY = 'skycoach-wind-samples';
const FLIGHTS_KEY = 'skycoach-wind-flights';

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadSamples(): WindSample[] {
  const s = safeStorage();
  if (!s) return [];
  try {
    return JSON.parse(s.getItem(KEY) ?? '[]') as WindSample[];
  } catch {
    return [];
  }
}

function loadFlightKeys(): string[] {
  const s = safeStorage();
  if (!s) return [];
  try {
    return JSON.parse(s.getItem(FLIGHTS_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/** Aggiunge i campioni di un volo, deduplicando per chiave di volo. Ritorna true se aggiunto. */
export function addFlight(flightKey: string, samples: WindSample[]): boolean {
  const s = safeStorage();
  if (!s) return false;
  const keys = loadFlightKeys();
  if (keys.includes(flightKey)) return false;
  const all = loadSamples().concat(samples);
  s.setItem(KEY, JSON.stringify(all));
  s.setItem(FLIGHTS_KEY, JSON.stringify(keys.concat(flightKey)));
  return true;
}

export function flightCount(): number {
  return loadFlightKeys().length;
}

export function clearSamples(): void {
  const s = safeStorage();
  if (!s) return;
  s.removeItem(KEY);
  s.removeItem(FLIGHTS_KEY);
}
