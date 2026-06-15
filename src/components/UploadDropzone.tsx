import { useCallback, useState } from 'react';
import { useStore } from '../state/store';
import { parseIgc } from '../lib/igc/parse';
import { attachAgl, preprocess } from '../lib/analysis/preprocess';
import { analyze, buildSummaryForAI } from '../lib/analysis/summary';
import { fetchFlightWeather, openMeteoElevation } from '../lib/weather/openMeteo';

export function UploadDropzone() {
  const [dragOver, setDragOver] = useState(false);
  const status = useStore((s) => s.status);
  const errorMsg = useStore((s) => s.errorMsg);

  const handleFile = useCallback(async (file: File) => {
    const { setLoading, setError, setFlight, updateSeries, setWeather } = useStore.getState();
    setLoading();
    try {
      const text = await file.text();
      const track = parseIgc(text);
      let series = preprocess(track);
      let analysis = analyze(series);

      // mostra subito il volo: meteo e AGL arrivano in background e non
      // devono bloccare la visualizzazione di mappa e statistiche
      setFlight({
        track,
        series,
        analysis,
        weather: undefined,
        summaryForAI: buildSummaryForAI(track, analysis, 'it', undefined),
      });

      // meteo del giorno al decollo (non bloccante: se fallisce, niente card)
      const midIdx = Math.floor(series.t.length / 2);
      const midHourUtc = new Date(series.t[midIdx]).getUTCHours();
      void fetchFlightWeather(series.lat[0], series.lon[0], track.date, midHourUtc)
        .then((weather) => {
          if (weather) setWeather(weather, buildSummaryForAI(track, analysis, 'it', weather));
        })
        .catch(() => {});

      // AGL in background: quando arriva, ricalcola i detector che lo usano
      const withAgl = await attachAgl(series, openMeteoElevation);
      if (withAgl.agl) {
        series = withAgl;
        analysis = analyze(series);
        const weather = useStore.getState().weather;
        updateSeries(series, analysis, buildSummaryForAI(track, analysis, 'it', weather));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore di lettura del file');
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  return (
    <div
      className={`dropzone${dragOver ? ' drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="dropzone-inner">
        <h1>SkyCoach</h1>
        <p>Il debriefing del tuo volo, da istruttore.</p>
        <p className="muted">
          Trascina qui il tuo file <strong>.igc</strong> oppure
        </p>
        <label className="file-btn">
          scegli un file
          <input
            type="file"
            accept=".igc,.IGC"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </label>
        {status === 'loading' && <p className="muted">Analisi in corso…</p>}
        {status === 'error' && <p className="error">{errorMsg}</p>}
        <p className="privacy-note">
          Tutto avviene nel tuo browser: il file non viene caricato da nessuna parte.
        </p>
      </div>
    </div>
  );
}
