/**
 * Invio dei campioni di vento ANONIMI al database Supabase (tabella
 * wind_samples, via PostgREST con anon key + RLS). Niente identità, niente
 * traccia grezza: solo quota/direzione/intensità + data e posizione
 * arrotondata. Alimenta il profilo vento di zona crowd-sourced.
 */
const BASE = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function isWindDbConfigured(): boolean {
  return Boolean(BASE && KEY);
}

export interface WindRow {
  flight_date: string;
  lat: number;
  lon: number;
  alt: number;
  from_deg: number;
  speed_kmh: number;
}

/** Legge i campioni di vento anonimi entro un raggio (km) da un punto. */
export async function fetchWindSamplesNear(
  lat: number,
  lon: number,
  radiusKm = 40,
): Promise<WindRow[]> {
  if (!BASE || !KEY) return [];
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos((lat * Math.PI) / 180) || 1);
  const f = (v: number) => v.toFixed(3);
  const and = `and=(lat.gte.${f(lat - dLat)},lat.lte.${f(lat + dLat)},lon.gte.${f(lon - dLon)},lon.lte.${f(lon + dLon)})`;
  const res = await fetch(`${BASE}/rest/v1/wind_samples?${and}&limit=5000`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`wind_samples ${res.status}`);
  return (await res.json()) as WindRow[];
}

export async function insertWindSamples(rows: WindRow[]): Promise<void> {
  if (!BASE || !KEY || rows.length === 0) return;
  await fetch(`${BASE}/rest/v1/wind_samples`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
}
