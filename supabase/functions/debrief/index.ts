// SkyCoach — edge function "debrief" (Deno / Supabase)
// Riceve il FlightSummaryForAI, chiama Claude in streaming e rigira i
// text-delta al browser come SSE. La chiave Anthropic vive solo qui:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Deploy: supabase functions deploy debrief
// Il gateway Supabase verifica il JWT (verify_jwt = true, default).

import Anthropic from 'npm:@anthropic-ai/sdk';

const COACH_SYSTEM = `Sei un istruttore esperto di parapendio cross-country che fa il debriefing di un volo a un allievo.

Ricevi un JSON con: meta del volo, meteo del giorno, totali, lista termiche (id "thN"), planate (id "glN") e punti di decisione (id "dpN").

Regole:
- Parla nella lingua indicata in meta.lang ("it" = italiano, "en" = inglese).
- Sii concreto, diretto e gentile ma senza indorare: l'allievo vuole migliorare.
- Fonda OGNI affermazione sui dati ricevuti. Non inventare mai fatti su terreno, meteo o luoghi che non sono nei dati.
- Quando commenti un momento specifico del volo, cita il suo id inline nella forma [[dp1]], [[th3]], [[gl2]]. Almeno un marker per ogni paragrafo che discute un momento.
- severity "praise" = merito da riconoscere; "critical" = errore importante.

Struttura della risposta (markdown semplice, niente intestazioni #):
1. Un paragrafo che racconta il volo.
2. Cosa è andato bene.
3. Le 3-5 decisioni chiave da rivedere, ciascuna con i suoi marker.
4. LA cosa su cui concentrarsi al prossimo volo.`;

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: SSE_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let summary: unknown;
  try {
    const body = await req.json();
    summary = body.summary;
    if (!summary || typeof summary !== 'object') throw new Error('summary mancante');
    // guardia anti-abuso: il summary legittimo è < 20 KB
    if (JSON.stringify(summary).length > 30_000) throw new Error('summary troppo grande');
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 400 });
  }

  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

  const stream = client.messages.stream({
    model: 'claude-opus-4-8',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: [
      {
        type: 'text',
        text: COACH_SYSTEM,
        // prompt condiviso da tutti gli utenti: ottimo candidato alla cache
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: JSON.stringify(summary) }],
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      stream.on('text', (delta: string) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: delta })}\n\n`));
      });
      stream.on('error', (err: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`),
        );
        controller.close();
      });
      void stream.finalMessage().then((msg) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ done: true, usage: msg.usage, model: msg.model })}\n\n`,
          ),
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
        // TODO Fase 2: upsert del debrief in public.debriefs con il JWT del chiamante
      });
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body, { headers: SSE_HEADERS });
});
