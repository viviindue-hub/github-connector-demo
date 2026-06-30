/**
 * Client del proxy SkyLines (edge function Supabase `skylines`). Il proxy gira
 * server-side e aggira il CORS; l'anon key autorizza la chiamata.
 * Doc API SkyLines: /flights/date/<YYYY-MM-DD>, /flights/<id>/json, ecc.
 */
const BASE = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function isSkylinesConfigured(): boolean {
  return Boolean(BASE && KEY);
}

export async function fetchSkylines<T = unknown>(
  path: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  if (!BASE || !KEY) throw new Error('Backend non configurato');
  const u = new URL(`${BASE}/functions/v1/skylines`);
  u.searchParams.set('path', path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const res = await fetch(u.toString(), {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`SkyLines ${res.status}`);
  return (await res.json()) as T;
}

export interface SkylinesFlightList {
  flights?: Array<Record<string, unknown>>;
  count?: number;
}

/** Voli pubblici su SkyLines in una certa data (YYYY-MM-DD). */
export function fetchDayFlights(dateIso: string): Promise<SkylinesFlightList> {
  return fetchSkylines<SkylinesFlightList>(`flights/date/${dateIso}`);
}
