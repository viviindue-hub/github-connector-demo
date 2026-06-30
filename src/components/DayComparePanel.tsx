import { useState } from 'react';
import { useStore } from '../state/store';
import { fetchDayFlights, isSkylinesConfigured } from '../api/skylines';
import { t } from '../i18n';

/**
 * Primo tassello del confronto "col giorno": carica da SkyLines (via proxy
 * backend) i voli pubblici della stessa data e ne mostra il numero e le
 * distanze. La decodifica delle tracce e l'aggregazione per zona/fascia
 * arrivano nel passo successivo, una volta verificata la pipeline dal browser.
 */
export function DayComparePanel() {
  const track = useStore((s) => s.track);
  const lang = useStore((s) => s.lang);
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [count, setCount] = useState(0);
  const [avgKm, setAvgKm] = useState<number | null>(null);
  const [maxKm, setMaxKm] = useState<number | null>(null);

  if (!track || !isSkylinesConfigured()) return null;

  const load = async () => {
    setState('loading');
    try {
      const data = await fetchDayFlights(track.date);
      const flights = data.flights ?? [];
      setCount(data.count ?? flights.length);
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
      )}
    </div>
  );
}
