import { useMemo } from 'react';
import { useStore } from '../state/store';
import { glideStats } from '../lib/analysis/glideStats';
import { t } from '../i18n';

/**
 * Efficienza per planata (energy-line oggettiva): L/D misurato, velocità
 * all'aria/suolo, quota persa, vento lungo la rotta. Solo dati, nessun giudizio.
 */
export function GlideEfficiencyPanel() {
  const series = useStore((s) => s.series);
  const analysis = useStore((s) => s.analysis);
  const lang = useStore((s) => s.lang);
  const requestFlyTo = useStore((s) => s.requestFlyTo);

  const stats = useMemo(
    () => (series && analysis ? glideStats(series, analysis.thermals, analysis.glides) : []),
    [series, analysis],
  );

  if (!series || !analysis) return null;

  return (
    <div className="panel">
      <h3>{t(lang, 'glideTitle')}</h3>
      <p className="muted wind-note">{t(lang, 'glideNote')}</p>
      {stats.length === 0 ? (
        <p className="muted">{t(lang, 'glNone')}</p>
      ) : (
        <ul className="item-list">
          {stats.map((g) => {
            const wc = g.windCompKmh === null ? null : Math.round(g.windCompKmh);
            return (
              <li
                key={g.id}
                className="decision"
                onClick={() =>
                  requestFlyTo({
                    lat: series.lat[g.midIdx],
                    lon: series.lon[g.midIdx],
                    alt: series.alt[g.midIdx],
                    t: series.t[g.midIdx],
                  })
                }
              >
                <span className="item-id">{g.id}</span>
                <span className="decision-body">
                  <span className="decision-label">
                    {g.ratio !== null ? `${g.ratio.toFixed(1)}:1` : '—'} ·{' '}
                    {g.distanceKm.toFixed(1)} km · {Math.round(g.heightLostM)} m
                  </span>
                  <span className="decision-why">
                    {g.airKmh !== null && (
                      <>
                        {Math.round(g.airKmh)} km/h {t(lang, 'glAir')} ·{' '}
                      </>
                    )}
                    {Math.round(g.groundKmh)} km/h {t(lang, 'glGround')}
                    {wc !== null && (
                      <>
                        {' · '}
                        {wc >= 0 ? `+${wc}` : wc} km/h {wc >= 0 ? t(lang, 'glTail') : t(lang, 'glHead')}
                      </>
                    )}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
