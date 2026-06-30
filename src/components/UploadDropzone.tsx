import { useCallback, useState } from 'react';
import { useStore } from '../state/store';
import { parseIgc } from '../lib/igc/parse';
import { attachAgl, preprocess } from '../lib/analysis/preprocess';
import { analyze, buildSummaryForAI } from '../lib/analysis/summary';
import { fetchFlightWeather, openMeteoElevation } from '../lib/weather/openMeteo';
import { windLayers } from '../lib/analysis/explain';
import { insertWindSamples, isWindDbConfigured } from '../api/windDb';
import { t } from '../i18n';
import { LangSwitcher } from './LangSwitcher';

/** arrotonda a ~0.05° (~5 km) per anonimizzare la posizione. */
const coarse = (v: number) => Math.round(v * 20) / 20;

export function UploadDropzone() {
  const [dragOver, setDragOver] = useState(false);
  const status = useStore((s) => s.status);
  const errorMsg = useStore((s) => s.errorMsg);
  const lang = useStore((s) => s.lang);
  const shareAnon = useStore((s) => s.shareAnon);
  const setShareAnon = useStore((s) => s.setShareAnon);

  const handleFile = useCallback(async (file: File) => {
    const { setLoading, setError, setFlight, updateSeries, setWeather, lang: cur } =
      useStore.getState();
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
        summaryForAI: buildSummaryForAI(track, analysis, cur === 'en' ? 'en' : 'it', undefined),
      });

      // contributo ANONIMO al profilo vento di zona (solo se consenso):
      // niente file, niente traccia, solo campioni di vento con posizione
      // arrotondata. Fire-and-forget, non blocca nulla.
      if (useStore.getState().shareAnon && isWindDbConfigured()) {
        const rows = windLayers(analysis.thermals).map((w) => ({
          flight_date: track.date,
          lat: coarse(w.lat),
          lon: coarse(w.lon),
          alt: w.alt,
          from_deg: w.fromDeg,
          speed_kmh: w.speedKmh,
        }));
        void insertWindSamples(rows).catch(() => {});
      }

      // meteo del giorno al decollo (non bloccante: se fallisce, niente card)
      const midIdx = Math.floor(series.t.length / 2);
      const midHourUtc = new Date(series.t[midIdx]).getUTCHours();
      const aiLang = cur === 'en' ? 'en' : 'it';
      void fetchFlightWeather(series.lat[0], series.lon[0], track.date, midHourUtc)
        .then((weather) => {
          if (weather) setWeather(weather, buildSummaryForAI(track, analysis, aiLang, weather));
        })
        .catch(() => {});

      // AGL in background: quando arriva, ricalcola i detector che lo usano
      const withAgl = await attachAgl(series, openMeteoElevation);
      if (withAgl.agl) {
        series = withAgl;
        analysis = analyze(series);
        const weather = useStore.getState().weather;
        updateSeries(series, analysis, buildSummaryForAI(track, analysis, aiLang, weather));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t(useStore.getState().lang, 'readError'));
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
        <div className="dropzone-lang">
          <LangSwitcher />
        </div>
        <h1>SkyCoach</h1>
        <p>{t(lang, 'tagline')}</p>
        <p className="muted">{t(lang, 'dropHint')}</p>
        <label className="file-btn">
          {t(lang, 'chooseFile')}
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
        {status === 'loading' && <p className="muted">{t(lang, 'analyzing')}</p>}
        {status === 'error' && <p className="error">{errorMsg}</p>}
        <p className="privacy-note">{t(lang, 'privacy')}</p>
        <label className="share-consent">
          <input
            type="checkbox"
            checked={shareAnon}
            onChange={(e) => setShareAnon(e.target.checked)}
          />
          {t(lang, 'shareConsent')}
        </label>
      </div>
    </div>
  );
}
