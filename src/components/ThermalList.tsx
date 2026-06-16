import { useStore } from '../state/store';
import { explainDecisionShort } from '../lib/analysis/explain';
import { t, type StringKey } from '../i18n';

const TYPE_KEY: Record<string, StringKey> = {
  early_exit: 'dt_early_exit',
  weak_thermal_persist: 'dt_weak_thermal_persist',
  low_save: 'dt_low_save',
  sink_line: 'dt_sink_line',
  low_crossing: 'dt_low_crossing',
};

export function ThermalList() {
  const analysis = useStore((s) => s.analysis);
  const requestFlyTo = useStore((s) => s.requestFlyTo);
  const lang = useStore((s) => s.lang);

  if (!analysis) return null;

  return (
    <div className="panel">
      <h3>
        {t(lang, 'thermals')} ({analysis.thermals.length})
      </h3>
      <ul className="item-list">
        {analysis.thermals.map((th) => (
          <li
            key={th.id}
            onClick={() =>
              requestFlyTo({ lat: th.lat, lon: th.lon, alt: th.exitAlt, t: th.startT })
            }
          >
            <span className="item-id">{th.id}</span>
            <span>
              +{Math.round(th.gain)} m · {th.avgClimb.toFixed(1)} m/s ·{' '}
              {Math.round(th.durationS / 60)} min · {t(lang, 'radius')}{' '}
              {Math.round(th.meanRadius)} m
            </span>
          </li>
        ))}
      </ul>

      {analysis.decisionPoints.length > 0 && (
        <>
          <h3>
            {t(lang, 'decisionPoints')} ({analysis.decisionPoints.length})
          </h3>
          <ul className="item-list">
            {analysis.decisionPoints.map((dp) => (
              <li
                key={dp.id}
                className={`severity-${dp.severity} decision`}
                onClick={() => requestFlyTo({ lat: dp.lat, lon: dp.lon, alt: dp.alt, t: dp.t })}
              >
                <span className="item-id">{dp.id}</span>
                <span className="decision-body">
                  <span className="decision-label">
                    {TYPE_KEY[dp.type] ? t(lang, TYPE_KEY[dp.type]) : dp.type} ·{' '}
                    {new Date(dp.t).toISOString().slice(11, 16)} UTC
                  </span>
                  <span className="decision-why">{explainDecisionShort(dp, lang)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
