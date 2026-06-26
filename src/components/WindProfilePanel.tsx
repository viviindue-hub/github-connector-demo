import { useStore } from '../state/store';
import { windLayers, compass } from '../lib/analysis/explain';
import { t } from '../i18n';

/**
 * Vento per quota MISURATO dalla deriva reale delle termiche del volo.
 * Risponde a "che vento c'è stato, a che ora, a quale quota" per strati —
 * cosa che le previsioni non danno. Base per la futura versione aggregata.
 */
export function WindProfilePanel() {
  const analysis = useStore((s) => s.analysis);
  const lang = useStore((s) => s.lang);
  const requestFlyTo = useStore((s) => s.requestFlyTo);

  if (!analysis) return null;
  const layers = windLayers(analysis.thermals);

  return (
    <div className="panel">
      <h3>{t(lang, 'windProfileTitle')}</h3>
      <p className="muted wind-note">{t(lang, 'windProfileNote')}</p>
      {layers.length === 0 ? (
        <p className="muted">{t(lang, 'windNone')}</p>
      ) : (
        <ul className="item-list wind-list">
          {layers.map((w) => {
            const th = analysis.thermals.find((x) => x.id === w.id);
            return (
              <li
                key={w.id}
                onClick={() =>
                  th && requestFlyTo({ lat: th.lat, lon: th.lon, alt: th.exitAlt, t: th.startT })
                }
              >
                <span className="wind-alt">{w.alt} m</span>
                <span
                  className="wind-arrow"
                  /* la freccia punta dove spinge il vento (sottovento) */
                  style={{ transform: `rotate(${(w.fromDeg + 180) % 360}deg)` }}
                  aria-hidden
                >
                  ↑
                </span>
                <span className="wind-val">
                  {w.speedKmh} km/h {t(lang, 'from')} {compass(w.fromDeg, lang)} ({w.fromDeg}°)
                </span>
                <span className="wind-time">{new Date(w.t).toISOString().slice(11, 16)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
