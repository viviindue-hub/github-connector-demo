import type { FlightSummaryForAI } from '../lib/types';

/**
 * Client del coach AI. Lo streaming arriva come SSE dalla edge function
 * Supabase (vedi supabase/functions/debrief). La chiave Anthropic vive
 * solo lato server.
 */
const DEBRIEF_URL = import.meta.env.VITE_DEBRIEF_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function isCoachConfigured(): boolean {
  return Boolean(DEBRIEF_URL);
}

export async function streamDebrief(
  summary: FlightSummaryForAI,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!DEBRIEF_URL) throw new Error('Coach AI non configurato (VITE_DEBRIEF_URL mancante)');
  const res = await fetch(DEBRIEF_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(SUPABASE_ANON_KEY ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {}),
    },
    body: JSON.stringify({ summary }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Coach AI: errore ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE: eventi separati da doppio newline, payload nelle righe "data:"
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const evt of events) {
      for (const line of evt.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const parsed = JSON.parse(payload);
          if (typeof parsed.text === 'string') onDelta(parsed.text);
        } catch {
          // riga non-JSON: la ignoriamo
        }
      }
    }
  }
}

/** Estrae gli anchor [[th1]]/[[gl2]]/[[dp3]] dal markdown del coach. */
export function extractAnchors(text: string): string[] {
  return [...text.matchAll(/\[\[((?:th|gl|dp)\d+)\]\]/g)].map((m) => m[1]);
}
