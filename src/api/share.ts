/**
 * Condivisione volo via link: l'IGC viene salvato su Supabase con un token
 * casuale; la lettura è possibile SOLO conoscendo il token (RPC dedicata,
 * nessuna policy di select → niente enumerazione).
 */
const BASE = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function isShareConfigured(): boolean {
  return Boolean(BASE && KEY);
}

function randomToken(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Carica l'IGC e ritorna l'URL condivisibile. */
export async function shareFlight(igc: string): Promise<string> {
  if (!BASE || !KEY) throw new Error('backend non configurato');
  const token = randomToken();
  const res = await fetch(`${BASE}/rest/v1/shared_flights`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ token, igc }),
  });
  if (!res.ok) throw new Error(`share ${res.status}`);
  return `${location.origin}${location.pathname}?f=${token}`;
}

/** Recupera l'IGC di un volo condiviso dal token. */
export async function fetchSharedFlight(token: string): Promise<string> {
  if (!BASE || !KEY) throw new Error('backend non configurato');
  const res = await fetch(`${BASE}/rest/v1/rpc/get_shared_flight`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_token: token }),
  });
  if (!res.ok) throw new Error(`shared ${res.status}`);
  const igc = (await res.json()) as string | null;
  if (!igc) throw new Error('not found');
  return igc;
}
