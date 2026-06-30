import { useMemo } from 'react';
import { useStore } from '../state/store';
import { freeDistanceKm, xcSpeedKmh } from '../lib/analysis/xc';
import { t } from '../i18n';

/**
 * Numero chiave in cima alla timeline: la velocità XC media sulla distanza
 * libera (stile XContest). È ciò che conta per la performance, più dei
 * settori temporali.
 */
export function XcHeadline() {
  const series = useStore((s) => s.series);
  const analysis = useStore((s) => s.analysis);
  const lang = useStore((s) => s.lang);

  const km = useMemo(() => (series ? freeDistanceKm(series) : 0), [series]);
  if (!series || !analysis) return null;
  const spd = xcSpeedKmh(km, analysis.totals.durationMin);

  return (
    <div className="xc-bar" title={t(lang, 'xcTitle')}>
      <span className="xc-key">{t(lang, 'xcLabel')}</span>
      <span className="xc-val">{spd.toFixed(0)} km/h</span>
      <span className="xc-sub">{km.toFixed(0)} km</span>
    </div>
  );
}
