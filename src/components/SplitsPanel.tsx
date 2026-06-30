import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { computeSplits } from '../lib/analysis/splits';
import { t } from '../i18n';

const INTERVALS = [5, 10, 15]; // minuti

/**
 * Andatura del volo per tratti a TEMPO fisso (regolabile). Mostra la velocità
 * di avanzamento (in linea d'aria) per blocco: è il modo oggettivo di vedere
 * dove si è avanzato bene e dove si è girato molto, senza dipendere dalla
 * durata delle singole termiche/planate.
 */
export function SplitsPanel() {
  const series = useStore((s) => s.series);
  const lang = useStore((s) => s.lang);
  const requestFlyTo = useStore((s) => s.requestFlyTo);
  const [intervalMin, setIntervalMin] = useState(10);

  const splits = useMemo(
    () => (series ? computeSplits(series, intervalMin * 60) : []),
    [series, intervalMin],
  );

  if (!series || splits.length === 0) return null;

  // scala per la barra: la migliore andatura del volo
  const maxMg = Math.max(...splits.map((s) => s.madeGoodKmh), 1);
  const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);

  return (
    <div className="panel">
      <h3>{t(lang, 'splitsTitle')}</h3>
      <p className="muted wind-note">{t(lang, 'splitsNote')}</p>
      <div className="lang-switch split-intervals">
        {INTERVALS.map((m) => (
          <button
            key={m}
            className={`lang-btn${m === intervalMin ? ' active' : ''}`}
            onClick={() => setIntervalMin(m)}
          >
            {m}′
          </button>
        ))}
      </div>
      <ul className="item-list split-list">
        {splits.map((sp) => {
          const mid = Math.floor((sp.startIdx + sp.endIdx) / 2);
          return (
            <li
              key={sp.startT}
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
                {hhmm(sp.startT)}–{hhmm(sp.endT)}
              </span>
              <span className="split-bar-wrap">
                <span
                  className="split-bar"
                  style={{ width: `${Math.round((sp.madeGoodKmh / maxMg) * 100)}%` }}
                />
              </span>
              <span className="split-mg">{Math.round(sp.madeGoodKmh)} km/h</span>
              <span className="split-extra">
                {t(lang, 'splitTrack')} {Math.round(sp.trackKmh)} ·{' '}
                {sp.altChangeM >= 0 ? '+' : ''}
                {Math.round(sp.altChangeM)} m
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
