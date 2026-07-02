import { useStore } from '../state/store';
import { varioCssGradient, speedCssGradient } from '../map/varioScale';
import { t } from '../i18n';

/**
 * Filtri della mappa: stile traccia (pulita / vario / velocità) + layer
 * "Settori XC". La linea parte pulita; i colori e i layer si attivano come
 * filtri, così la mappa mostra solo ciò che vuoi vedere.
 */
export function VarioLegend() {
  const colorMode = useStore((s) => s.colorMode);
  const setColorMode = useStore((s) => s.setColorMode);
  const showRoute = useStore((s) => s.showRoute);
  const setShowRoute = useStore((s) => s.setShowRoute);
  const lang = useStore((s) => s.lang);

  const isClean = colorMode === 'clean';
  const isSpeed = colorMode === 'speed';
  const gradient = isSpeed ? speedCssGradient() : varioCssGradient();
  const labels = isSpeed
    ? ['40', '30', '20', '10', '0']
    : ['+4', '+2', '+1', '0', '-1', '-2', '-4'];
  const unit = isSpeed ? 'km/h' : 'm/s';

  return (
    <div className="vario-legend" aria-label="Filtri mappa">
      <div className="lang-switch legend-toggle">
        <button
          className={`lang-btn${isClean ? ' active' : ''}`}
          onClick={() => setColorMode('clean')}
        >
          {t(lang, 'colClean')}
        </button>
        <button
          className={`lang-btn${colorMode === 'vario' ? ' active' : ''}`}
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
      {!isClean && (
        <>
          <span className="vario-legend-title">{unit}</span>
          <div className="vario-legend-body">
            <div className="vario-legend-bar" style={{ background: gradient }} />
            <div className="vario-legend-labels">
              {labels.map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
          </div>
        </>
      )}
      <label className="follow-toggle legend-route">
        <input
          type="checkbox"
          checked={showRoute}
          onChange={(e) => setShowRoute(e.target.checked)}
        />
        {t(lang, 'legsTitle')}
      </label>
    </div>
  );
}
