import { useStore } from '../state/store';
import { varioCssGradient, speedCssGradient } from '../map/varioScale';
import { t } from '../i18n';

/**
 * Legenda della scala colori della traccia, con interruttore vario / velocità.
 * In modalità "velocità" la traccia è colorata per andatura (rosso = in lotta,
 * verde/ciano = avanzi forte): si vede a colpo d'occhio dove hai combattuto.
 */
export function VarioLegend() {
  const colorMode = useStore((s) => s.colorMode);
  const setColorMode = useStore((s) => s.setColorMode);
  const lang = useStore((s) => s.lang);

  const isSpeed = colorMode === 'speed';
  const gradient = isSpeed ? speedCssGradient() : varioCssGradient();
  const labels = isSpeed
    ? ['40', '30', '20', '10', '0']
    : ['+4', '+2', '+1', '0', '-1', '-2', '-4'];
  const unit = isSpeed ? 'km/h' : 'm/s';

  return (
    <div className="vario-legend" aria-label="Scala colori traccia">
      <div className="lang-switch legend-toggle">
        <button
          className={`lang-btn${!isSpeed ? ' active' : ''}`}
          onClick={() => setColorMode('vario')}
        >
          {t(lang, 'colVario')}
        </button>
        <button
          className={`lang-btn${isSpeed ? ' active' : ''}`}
          onClick={() => setColorMode('speed')}
        >
          {t(lang, 'colSpeed')}
        </button>
      </div>
      <span className="vario-legend-title">{unit}</span>
      <div className="vario-legend-body">
        <div className="vario-legend-bar" style={{ background: gradient }} />
        <div className="vario-legend-labels">
          {labels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
