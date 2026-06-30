import { useStore } from '../state/store';
import { useFlightType } from '../state/useFlightType';
import type { FlightType } from '../lib/analysis/flightType';
import { t, type StringKey } from '../i18n';

const KEY: Record<FlightType, StringKey> = { xc: 'ftXc', local: 'ftLocal', sled: 'ftSled' };
const OPTIONS: Array<'auto' | FlightType> = ['auto', 'xc', 'local', 'sled'];

/**
 * Mostra il tipo di volo riconosciuto e permette di forzarlo. In base al tipo
 * effettivo l'app mostra solo i pannelli pertinenti (vedi App).
 */
export function FlightTypeBadge() {
  const lang = useStore((s) => s.lang);
  const override = useStore((s) => s.flightTypeOverride);
  const setOverride = useStore((s) => s.setFlightTypeOverride);
  const { effective } = useFlightType();
  if (!effective) return null;

  return (
    <div className="panel flight-type">
      <div className="ft-row">
        <span className="ft-label">{t(lang, 'ftLabel')}</span>
        <span className="ft-detected">{t(lang, KEY[effective])}</span>
      </div>
      <div className="lang-switch ft-switch">
        {OPTIONS.map((o) => (
          <button
            key={o}
            className={`lang-btn${override === o ? ' active' : ''}`}
            onClick={() => setOverride(o)}
          >
            {o === 'auto' ? t(lang, 'ftAuto') : t(lang, KEY[o])}
          </button>
        ))}
      </div>
    </div>
  );
}
