import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { windLayers, compass } from '../lib/analysis/explain';
import {
  aggregateWindByBand,
  samplesNear,
  loadSamples,
  addFlight,
  clearSamples,
  flightCount,
  type WindSample,
} from '../lib/analysis/regionalWind';
import { t } from '../i18n';

/**
 * Vento di ZONA per quota: aggrega i campioni di vento (dalle termiche) dei
 * voli aggiunti vicino a questo decollo. È il prototipo della versione
 * aggregata: lo stesso aggregatore verrà alimentato dal feed live (SkyLines)
 * via backend, al posto dei voli caricati a mano.
 */
export function RegionalWindPanel() {
  const analysis = useStore((s) => s.analysis);
  const track = useStore((s) => s.track);
  const series = useStore((s) => s.series);
  const lang = useStore((s) => s.lang);
  const [version, setVersion] = useState(0);

  const currentSamples: WindSample[] = useMemo(
    () =>
      analysis
        ? windLayers(analysis.thermals).map((w) => ({
            alt: w.alt,
            fromDeg: w.fromDeg,
            speedKmh: w.speedKmh,
            t: w.t,
            lat: w.lat,
            lon: w.lon,
          }))
        : [],
    [analysis],
  );

  const lat0 = series?.lat[0] ?? 0;
  const lon0 = series?.lon[0] ?? 0;

  const { bands, flights } = useMemo(() => {
    const near = samplesNear(loadSamples(), lat0, lon0, 40);
    return { bands: aggregateWindByBand(near), flights: flightCount() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, lat0, lon0]);

  if (!analysis || !track || !series) return null;

  const flightKey = `${track.date}@${lat0.toFixed(3)},${lon0.toFixed(3)}`;

  const onAdd = () => {
    addFlight(flightKey, currentSamples);
    setVersion((v) => v + 1);
  };
  const onClear = () => {
    clearSamples();
    setVersion((v) => v + 1);
  };

  return (
    <div className="panel">
      <h3>{t(lang, 'regWindTitle')}</h3>
      <p className="muted wind-note">{t(lang, 'regWindNote')}</p>
      <div className="reg-wind-actions">
        <button className="ai-btn" onClick={onAdd} disabled={currentSamples.length === 0}>
          {t(lang, 'regWindAdd')}
        </button>
        {flights > 0 && (
          <button className="link-btn" onClick={onClear}>
            {t(lang, 'regWindClear')}
          </button>
        )}
      </div>
      {bands.length === 0 ? (
        <p className="muted">{t(lang, 'regWindEmpty')}</p>
      ) : (
        <>
          <p className="muted reg-wind-count">
            {flights} {t(lang, 'regWindFlights')}
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
