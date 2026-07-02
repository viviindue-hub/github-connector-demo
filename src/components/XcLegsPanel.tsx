import { useMemo } from 'react';
import { useStore } from '../state/store';
import { freeRoute, xcLegs } from '../lib/analysis/xc';
import { t } from '../i18n';

/**
 * Settori della rotta XC (tra i punti di virata della distanza libera):
 * velocità media per settore — il dato che dice dove correvi e dove no,
 * senza giudizi. Click sul settore → la mappa ci vola.
 */
export function XcLegsPanel() {
  const series = useStore((s) => s.series);
  const lang = useStore((s) => s.lang);
  const requestFlyTo = useStore((s) => s.requestFlyTo);

  const legs = useMemo(() => {
    if (!series) return [];
    return xcLegs(series, freeRoute(series));
  }, [series]);

  if (!series || legs.length < 2) return null;

  const maxSpd = Math.max(...legs.map((l) => l.speedKmh), 1);
  const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);

  return (
    <div className="panel">
      <h3>{t(lang, 'legsTitle')}</h3>
      <p className="muted wind-note">{t(lang, 'legsNote')}</p>
      <ul className="item-list split-list">
        {legs.map((leg) => {
          const mid = Math.floor((leg.startIdx + leg.endIdx) / 2);
          return (
            <li
              key={leg.n}
              onClick={() =>
                requestFlyTo({
                  lat: series.lat[mid],
                  lon: series.lon[mid],
                  alt: series.alt[mid],
                  t: series.t[mid],
                })
              }
            >
              <span className="split-time">
                S{leg.n} · {hhmm(leg.startT)}–{hhmm(leg.endT)}
              </span>
              <span className="split-bar-wrap">
                <span
                  className="split-bar"
                  style={{ width: `${Math.round((leg.speedKmh / maxSpd) * 100)}%` }}
                />
              </span>
              <span className="split-mg">{Math.round(leg.speedKmh)} km/h</span>
              <span className="split-extra">
                {leg.distanceKm.toFixed(1)} km · {leg.altChangeM >= 0 ? '+' : ''}
                {Math.round(leg.altChangeM)} m
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
