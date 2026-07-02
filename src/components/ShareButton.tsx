import { useState } from 'react';
import { useStore } from '../state/store';
import { isShareConfigured, shareFlight } from '../api/share';
import { t } from '../i18n';

/**
 * Condivide il volo corrente: salva l'IGC (leggibile solo col token) e apre
 * lo share sheet nativo (o copia il link negli appunti come fallback).
 */
export function ShareButton() {
  const igcText = useStore((s) => s.igcText);
  const lang = useStore((s) => s.lang);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  if (!igcText || !isShareConfigured()) return null;

  const onShare = async () => {
    setState('busy');
    try {
      const url = await shareFlight(igcText);
      try {
        await navigator.share({ title: 'SkyCoach', url });
      } catch {
        await navigator.clipboard.writeText(url);
      }
      setState('done');
      setTimeout(() => setState('idle'), 2500);
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 2500);
    }
  };

  return (
    <button className="share-btn" onClick={() => void onShare()} disabled={state === 'busy'}>
      {state === 'done'
        ? t(lang, 'shareCopied')
        : state === 'error'
          ? t(lang, 'shareFail')
          : `↗ ${t(lang, 'share')}`}
    </button>
  );
}
