import { useStore } from '../state/store';
import { parseIgc } from './igc/parse';
import { attachAgl, preprocess } from './analysis/preprocess';
import { analyze, buildSummaryForAI } from './analysis/summary';
import { fetchFlightWeather, openMeteoElevation } from './weather/openMeteo';
import { windLayers } from './analysis/explain';
import { insertWindSamples, isWindDbConfigured } from '../api/windDb';
import { t } from '../i18n';

/** arrotonda a ~0.05° (~5 km) per anonimizzare la posizione. */
const coarse = (v: number) => Math.round(v * 20) / 20;

/**
 * Pipeline completa di caricamento di un IGC (testo): parsing → analisi →
 * store, con meteo e AGL in background. Usata sia dall'upload locale sia
 * dai voli aperti via link condiviso.
 */
export async function loadFlightFromText(text: string): Promise<void> {
  const { setLoading, setError, setFlight, setIgcText, updateSeries, setWeather, lang: cur } =
    useStore.getState();
  setLoading();
  try {
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
    setIgcText(text);

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
}
