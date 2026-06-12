import { Fragment, useCallback, useState } from 'react';
import { useStore } from '../state/store';
import { isCoachConfigured, streamDebrief } from '../api/debrief';

/**
 * Pannello del coach AI. Renderizza il testo in streaming e trasforma i
 * marker [[id]] in chip cliccabili che portano camera e replay sul punto.
 */
export function CoachPanel() {
  const summary = useStore((s) => s.summaryForAI);
  const analysis = useStore((s) => s.analysis);
  const requestFlyTo = useStore((s) => s.requestFlyTo);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const start = useCallback(async () => {
    if (!summary) return;
    setText('');
    setState('streaming');
    try {
      await streamDebrief(summary, (delta) => setText((t) => t + delta));
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

  if (!summary) return null;

  const knownIds = new Set([
    ...(analysis?.thermals.map((t) => t.id) ?? []),
    ...(analysis?.glides.map((g) => g.id) ?? []),
    ...(analysis?.decisionPoints.map((d) => d.id) ?? []),
  ]);

  return (
    <div className="panel coach-panel">
      <h3>Coach AI</h3>
      {!isCoachConfigured() ? (
        <p className="muted">
          Il debriefing AI si attiva configurando il backend (variabile{' '}
          <code>VITE_DEBRIEF_URL</code> → edge function Supabase). L'analisi che vedi qui
          sopra è già pronta per essere raccontata.
        </p>
      ) : state === 'idle' ? (
        <button className="file-btn" onClick={() => void start()}>
          Genera il debriefing
        </button>
      ) : (
        <div className="coach-text">
          {renderWithAnchors(text, knownIds, onAnchorClick)}
          {state === 'streaming' && <span className="cursor">▌</span>}
          {state === 'error' && <p className="error">{error}</p>}
          {state === 'done' && (
            <button className="file-btn" onClick={() => void start()}>
              Rigenera
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function renderWithAnchors(
  text: string,
  knownIds: Set<string>,
  onClick: (id: string) => void,
): React.ReactNode {
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs.map((para, pi) => (
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
  ));
}
