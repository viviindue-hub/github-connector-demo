import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { compass } from '../lib/analysis/explain';
import { aggregateWindByBand, type WindBand, type WindSample } from '../lib/analysis/regionalWind';
import { fetchWindSamplesNear, isWindDbConfigured } from '../api/windDb';
import { t } from '../i18n';

/**
 * Vento di ZONA per quota: aggrega i campioni di vento ANONIMI condivisi da
 * tutti i voli (DB) entro ~40 km dal decollo. Il contributo avviene
 * automaticamente all'upload (con la spunta di consenso): qui si legge soltanto.
 */
export function RegionalWindPanel() {
  const series = useStore((s) => s.series);
  const lang = useStore((s) => s.lang);
  const [bands, setBands] = useState<WindBand[]>([]);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');

  const lat0 = series?.lat[0];
  const lon0 = series?.lon[0];

  useEffect(() => {
    if (lat0 === undefined || lon0 === undefined || !isWindDbConfigured()) {
      setStatus('done');
      setBands([]);
      return;
    }
    let cancelled = false;
    setStatus('loading');
    fetchWindSamplesNear(lat0, lon0, 40)
      .then((rows) => {
        if (cancelled) return;
        const samples: WindSample[] = rows.map((r) => ({
          alt: r.alt,
          fromDeg: r.from_deg,
          speedKmh: r.speed_kmh,
          t: 0,
          lat: r.lat,
          lon: r.lon,
        }));
        setCount(samples.length);
        setBands(aggregateWindByBand(samples));
        setStatus('done');
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
    };
  }, [lat0, lon0]);

  if (!series) return null;

  return (
    <div className="panel">
      <h3>{t(lang, 'regWindTitle')}</h3>
      <p className="muted wind-note">{t(lang, 'regWindNote')}</p>
      {status === 'loading' && <p className="muted">{t(lang, 'dayLoading')}</p>}
      {status === 'error' && <p className="error">{t(lang, 'dayError')}</p>}
      {status === 'done' && bands.length === 0 && (
        <p className="muted">{t(lang, 'regWindEmpty')}</p>
      )}
      {status === 'done' && bands.length > 0 && (
        <>
          <p className="muted reg-wind-count">
            {count} {t(lang, 'regWindSamples')}
          </p>
          <ul className="item-list wind-list">
            {bands.map((b) => (
              <li key={b.low}>
                <span className="wind-alt">
                  {b.low}–{b.high} m
                </span>
                <span
                  className="wind-arrow"
                  style={{ transform: `rotate(${(b.fromDeg + 180) % 360}deg)` }}
                  aria-hidden
                >
                  ↑
                </span>
                <span className="wind-val">
                  {b.speedKmh} km/h {t(lang, 'from')} {compass(b.fromDeg, lang)} ({b.fromDeg}°)
                </span>
                <span className="wind-time">×{b.count}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
