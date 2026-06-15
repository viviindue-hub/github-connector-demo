import { varioCssGradient } from '../map/varioScale';

/** Legenda della scala colori del vario, sovrapposta alla mappa. */
export function VarioLegend() {
  const labels = ['+4', '+2', '+1', '0', '-1', '-2', '-4'];
  return (
    <div className="vario-legend" aria-label="Scala vario in m/s">
      <span className="vario-legend-title">m/s</span>
      <div className="vario-legend-body">
        <div className="vario-legend-bar" style={{ background: varioCssGradient() }} />
        <div className="vario-legend-labels">
          {labels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
