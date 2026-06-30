import { useState } from 'react';
import { useStore } from '../state/store';
import { fetchDayFlights, fetchSkylines, isSkylinesConfigured } from '../api/skylines';
import { t } from '../i18n';

/**
 * Primo tassello del confronto "col giorno": carica da SkyLines (via proxy)
 * i voli pubblici della stessa data e ne mostra numero e distanze.
 * Include una piccola diagnostica per scoprire la forma reale dei dati
 * (campi del volo + traccia), così si costruisce il confronto su basi certe.
 */
export function DayComparePanel() {
  const track = useStore((s) => s.track);
  const lang = useStore((s) => s.lang);
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [count, setCount] = useState(0);
  const [avgKm, setAvgKm] = useState<number | null>(null);
  const [maxKm, setMaxKm] = useState<number | null>(null);
  const [first, setFirst] = useState<Record<string, unknown> | null>(null);
  const [probe, setProbe] = useState<string>('');

  if (!track || !isSkylinesConfigured()) return null;

  const load = async () => {
    setState('loading');
    setProbe('');
    try {
      const data = await fetchDayFlights(track.date);
      const flights = data.flights ?? [];
      setCount(data.count ?? flights.length);
      setFirst((flights[0] as Record<string, unknown>) ?? null);
      const dists = flights
        .map((f) => Number((f as Record<string, unknown>).distance))
        .filter((d) => Number.isFinite(d) && d > 0);
      if (dists.length) {
        setAvgKm(dists.reduce((a, b) => a + b, 0) / dists.length / 1000);
        setMaxKm(Math.max(...dists) / 1000);
      } else {
        setAvgKm(null);
        setMaxKm(null);
      }
      setState('done');
    } catch {
      setState('error');
    }
  };

  // diagnostica: scopre la forma della traccia di un volo (points/barogram + IGC)
  const inspect = async () => {
    if (!first) return;
    const id = first.id ?? first.flightId ?? first.sfid;
    if (id === undefined) {
      setProbe('nessun campo id nel volo');
      return;
    }
    setProbe('ispeziono…');
    try {
      const json = await fetchSkylines<Record<string, unknown>>(`flights/${id}/json`);
      const keys = Object.keys(json);
      const len = (k: string) => {
        const v = json[k];
        return typeof v === 'string' ? `${k}(str ${v.length})` : Array.isArray(v) ? `${k}(arr ${v.length})` : k;
      };
      setProbe(`traccia id=${id} → ${keys.map(len).join(', ')}`);
    } catch (e) {
      setProbe(`errore traccia: ${String(e)}`);
    }
  };

  return (
    <div className="panel">
      <h3>{t(lang, 'dayTitle')}</h3>
      <p className="muted wind-note">{t(lang, 'dayHint')}</p>
      {state === 'idle' && (
        <button className="ai-btn" onClick={() => void load()}>
          {t(lang, 'dayLoad')}
        </button>
      )}
      {state === 'loading' && <p className="muted">{t(lang, 'dayLoading')}</p>}
      {state === 'error' && <p className="error">{t(lang, 'dayError')}</p>}
      {state === 'done' && (
        <>
          <div className="stats-grid">
            <div className="stat">
              <span className="stat-value">{count}</span>
              <span className="stat-label">{t(lang, 'dayFlightsWord')}</span>
            </div>
            {avgKm !== null && (
              <div className="stat">
                <span className="stat-value">{Math.round(avgKm)} km</span>
                <span className="stat-label">{t(lang, 'dayDist')} ⌀</span>
              </div>
            )}
            {maxKm !== null && (
              <div className="stat">
                <span className="stat-value">{Math.round(maxKm)} km</span>
                <span className="stat-label">{t(lang, 'dayDist')} max</span>
              </div>
            )}
          </div>
          {first && (
            <details className="dev-details">
              <summary>dettagli tecnici (sviluppo)</summary>
              <p className="dev-keys">campi volo: {Object.keys(first).join(', ')}</p>
              <pre className="dev-pre">{JSON.stringify(first).slice(0, 700)}</pre>
              <button className="ai-btn" onClick={() => void inspect()}>
                ispeziona la traccia del 1° volo
              </button>
              {probe && <pre className="dev-pre">{probe}</pre>}
            </details>
          )}
        </>
      )}
    </div>
  );
}
