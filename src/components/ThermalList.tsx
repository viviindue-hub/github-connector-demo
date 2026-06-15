import { useStore } from '../state/store';
import { explainDecisionShort } from '../lib/analysis/explain';

const TYPE_LABELS: Record<string, string> = {
  early_exit: 'Termica lasciata presto',
  weak_thermal_persist: 'Insistito su termica debole',
  low_save: 'Riagganciata bassa 👏',
  sink_line: 'Linea di discendenza',
  low_crossing: 'Attraversamento basso',
};

export function ThermalList() {
  const analysis = useStore((s) => s.analysis);
  const requestFlyTo = useStore((s) => s.requestFlyTo);

  if (!analysis) return null;

  return (
    <div className="panel">
      <h3>Termiche ({analysis.thermals.length})</h3>
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
              {Math.round(th.durationS / 60)} min · raggio {Math.round(th.meanRadius)} m
            </span>
          </li>
        ))}
      </ul>

      {analysis.decisionPoints.length > 0 && (
        <>
          <h3>Punti di decisione ({analysis.decisionPoints.length})</h3>
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
                    {TYPE_LABELS[dp.type] ?? dp.type} ·{' '}
                    {new Date(dp.t).toISOString().slice(11, 16)} UTC
                  </span>
                  <span className="decision-why">{explainDecisionShort(dp)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
