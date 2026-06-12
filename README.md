# SkyCoach ✈️

**Il debriefing del tuo volo in parapendio, da istruttore.**

Carichi il file IGC del volo e SkyCoach ti mostra un replay 3D su mappa con
terreno reale, il barogramma, le statistiche — e (con il backend attivo) un
debriefing AI in linguaggio umano che ti spiega *perché* il volo è andato
così e cosa cambiare: ogni commento è ancorato a un punto sulla mappa.

> A differenza dei viewer IGC esistenti (SkyViz, XCFinder, XCviewer…) che
> mostrano *cosa* hai fatto, SkyCoach spiega le **decisioni**: "hai lasciato
> la termica a 1.800 m con +1,4 m/s `[[dp1]]`; l'attraversamento basso della
> valle `[[dp3]]` ti è costato l'atterraggio".

## Avvio rapido

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # suite vitest (parser, analisi, decision points)
npm run build      # bundle statico in dist/
```

Trascina un file `.igc` nella pagina. Tutta l'analisi della Fase 1 avviene
**nel browser**: il file non lascia il tuo computer.

### Variabili d'ambiente (opzionali)

| Variabile | Effetto |
|---|---|
| `VITE_CESIUM_ION_TOKEN` | Terreno 3D Cesium World Terrain (senza token: ellissoide + imagery satellitare) |
| `VITE_DEBRIEF_URL` | URL della edge function `debrief` → attiva il pannello Coach AI |
| `VITE_SUPABASE_ANON_KEY` | Inviata come Bearer alla edge function |

## Architettura

```
src/lib/igc/parse.ts        wrapper igc-parser + fallback B-record permissivo
src/lib/analysis/           motore puro TS, testato con tracce sintetiche:
  preprocess.ts               resample 1 Hz, vario, heading, turn rate, AGL
  segments.ts                 termiche (macchina a stati circling), planate,
                              stima vento dalla deriva
  metrics.ts                  totali, % salita/planata/tempo sprecato
  decisions.ts                punti di decisione: early_exit, weak_thermal_persist,
                              low_save, sink_line, low_crossing
  summary.ts                  FlightSummaryForAI (3-8 KB) per il coach + LTTB
src/map/                    CesiumJS: traccia colorata per vario, replay, fly-to
src/components/             barogramma ECharts, statistiche, coach panel
supabase/                   Fase 2: schema Postgres + edge function Claude
```

### Il coach AI (Fase 2)

La edge function `supabase/functions/debrief` riceve il riassunto compatto
del volo (mai i fix grezzi), chiama Claude (`claude-opus-4-8`) in streaming
e rigira i delta come SSE. Il prompt impone marker `[[id]]` su ogni
affermazione puntuale: il client li rende chip cliccabili che portano camera
e replay esattamente su quel momento del volo.

Setup:

```bash
supabase db push                          # applica supabase/migrations/
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy debrief
```

## Roadmap

- [x] **Fase 1** — analisi client-side: parser, termiche/planate, decision
      points, replay 3D, barogramma, meteo storica (Open-Meteo)
- [ ] **Fase 2** — Supabase: auth, logbook persistente, coach AI in streaming
- [ ] **Fase 3** — confronto multi-traccia (IGC di altri piloti) e
      condivisione pubblica `/f/:token`
