import { useStore } from '../state/store';
import { LANGS, LANG_LABEL } from '../i18n';

/** Selettore lingua IT / EN / DE. */
export function LangSwitcher() {
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  return (
    <div className="lang-switch" role="group" aria-label="Lingua">
      {LANGS.map((l) => (
        <button
          key={l}
          className={`lang-btn${l === lang ? ' active' : ''}`}
          onClick={() => setLang(l)}
        >
          {LANG_LABEL[l]}
        </button>
      ))}
    </div>
  );
}
