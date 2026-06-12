import type { WeatherSummary } from '../types';
import type { ElevationFetcher } from '../analysis/preprocess';

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';

/**
 * Meteo storica del giorno del volo al decollo (gratis, senza chiave, CORS aperto).
 * Prende l'ora centrale del volo per i venti in quota.
 */
export async function fetchFlightWeather(
  lat: number,
  lon: number,
  dateIso: string,
  midFlightHourUtc: number,
): Promise<WeatherSummary | undefined> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start_date: dateIso,
    end_date: dateIso,
    hourly:
      'temperature_2m,wind_speed_925hPa,wind_direction_925hPa,wind_speed_850hPa,wind_direction_850hPa,cape,boundary_layer_height',
    timezone: 'UTC',
  });
  try {
    const res = await fetch(`${ARCHIVE_URL}?${params}`);
    if (!res.ok) return undefined;
    const data = await res.json();
    const h = data.hourly;
    if (!h?.time) return undefined;
    const idx = Math.min(Math.max(0, Math.round(midFlightHourUtc)), h.time.length - 1);
    const temps: number[] = (h.temperature_2m ?? []).filter((v: unknown) => v !== null);
    return {
      source: 'open-meteo-archive',
      tempMaxC: temps.length ? Math.max(...temps) : undefined,
      cape: h.cape?.[idx] ?? undefined,
      boundaryLayerM: h.boundary_layer_height?.[idx] ?? undefined,
      wind925:
        h.wind_speed_925hPa?.[idx] != null
          ? { speedKmh: h.wind_speed_925hPa[idx], dirDeg: h.wind_direction_925hPa[idx] }
          : undefined,
      wind850:
        h.wind_speed_850hPa?.[idx] != null
          ? { speedKmh: h.wind_speed_850hPa[idx], dirDeg: h.wind_direction_850hPa[idx] }
          : undefined,
    };
  } catch {
    return undefined;
  }
}

/** ElevationFetcher di produzione: batch da 100 coordinate per richiesta. */
export const openMeteoElevation: ElevationFetcher = async (points) => {
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 100) {
    const batch = points.slice(i, i + 100);
    const params = new URLSearchParams({
      latitude: batch.map((p) => p.lat.toFixed(5)).join(','),
      longitude: batch.map((p) => p.lon.toFixed(5)).join(','),
    });
    const res = await fetch(`${ELEVATION_URL}?${params}`);
    if (!res.ok) throw new Error(`elevation API ${res.status}`);
    const data = await res.json();
    out.push(...data.elevation);
  }
  return out;
};
