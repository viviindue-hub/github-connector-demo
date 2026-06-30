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
