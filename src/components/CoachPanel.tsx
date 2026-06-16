import { Fragment, useCallback, useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { isCoachConfigured, streamDebrief } from '../api/debrief';
import { buildLocalDebrief } from '../lib/analysis/explain';
import { t } from '../i18n';

/**
 * Pannello di debriefing. Di default mostra il debriefing generato in LOCALE
 * (regole + template, niente rete). Se il backend AI è configurato
 * (VITE_DEBRIEF_URL) offre in più una versione scritta da Claude in streaming.
 * In entrambi i casi i marker [[id]] diventano chip cliccabili → fly-to.
 */
export function CoachPanel() {
  const track = useStore((s) => s.track);
  const analysis = useStore((s) => s.analysis);
  const weather = useStore((s) => s.weather);
  const summary = useStore((s) => s.summaryForAI);
  const lang = useStore((s) => s.lang);
  const requestFlyTo = useStore((s) => s.requestFlyTo);

  const [aiText, setAiText] = useState('');
  const [state, setState] = useState<'local' | 'streaming' | 'done' | 'error'>('local');
  const [error, setError] = useState('');

  const localText = useMemo(
    () => (track && analysis ? buildLocalDebrief(track, analysis, weather, lang) : ''),
    [track, analysis, weather, lang],
  );

  const startAi = useCallback(async () => {
    if (!summary) return;
    setAiText('');
    setState('streaming');
    try {
      await streamDebrief(summary, (delta) => setAiText((t) => t + delta));
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'errore');
      setState('error');
    }
  }, [summary]);

  const onAnchorClick = useCallback(
    (id: string) => {
      if (!analysis) return;
      const th = analysis.thermals.find((t) => t.id === id);
      if (th) return requestFlyTo({ lat: th.lat, lon: th.lon, alt: th.exitAlt, t: th.startT });
      const gl = analysis.glides.find((g) => g.id === id);
      if (gl) {
        const series = useStore.getState().series;
        if (series) {
          const mid = Math.floor((gl.startIdx + gl.endIdx) / 2);
          return requestFlyTo({
            lat: series.lat[mid],
            lon: series.lon[mid],
            alt: series.alt[mid],
            t: series.t[mid],
          });
        }
      }
      const dp = analysis.decisionPoints.find((d) => d.id === id);
      if (dp) return requestFlyTo({ lat: dp.lat, lon: dp.lon, alt: dp.alt, t: dp.t });
    },
    [analysis, requestFlyTo],
  );

  if (!analysis) return null;

  const knownIds = new Set([
    ...analysis.thermals.map((t) => t.id),
    ...analysis.glides.map((g) => g.id),
    ...analysis.decisionPoints.map((d) => d.id),
  ]);

  const showingAi = state !== 'local';

  return (
    <div className="panel coach-panel">
      <h3>{t(lang, 'debriefTitle')}</h3>

      {!showingAi && isCoachConfigured() && (
        <button className="ai-btn" onClick={() => void startAi()}>
          {t(lang, 'aiVersion')}
        </button>
      )}

      <div className="coach-text">
        {renderWithAnchors(showingAi ? aiText : localText, knownIds, onAnchorClick)}
        {state === 'streaming' && <span className="cursor">▌</span>}
        {state === 'error' && <p className="error">{error}</p>}
        {state === 'done' && (
          <button className="ai-btn" onClick={() => setState('local')}>
            {t(lang, 'backToLocal')}
          </button>
        )}
      </div>
    </div>
  );
}

function renderWithAnchors(
  text: string,
  knownIds: Set<string>,
  onClick: (id: string) => void,
): React.ReactNode {
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs.map((para, pi) => {
    if (para.startsWith('## ')) {
      return (
        <h4 key={pi} className="debrief-h">
          {para.slice(3)}
        </h4>
      );
    }
    return (
      <p key={pi}>
        {para.split(/(\[\[(?:th|gl|dp)\d+\]\])/g).map((part, i) => {
          const m = /^\[\[((?:th|gl|dp)\d+)\]\]$/.exec(part);
          if (m && knownIds.has(m[1])) {
            return (
              <button key={i} className="anchor-chip" onClick={() => onClick(m[1])}>
                {m[1]}
              </button>
            );
          }
          // marker sconosciuto: lo si scarta in silenzio
          if (m) return <Fragment key={i} />;
          return <Fragment key={i}>{part}</Fragment>;
        })}
      </p>
    );
  });
}
