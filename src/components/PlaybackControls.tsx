import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { t } from '../i18n';
import { downloadBlob, isVideoSupported, startFlightVideo, type VideoHandle } from '../lib/videoExport';
import { freeDistanceKm, xcSpeedKmh } from '../lib/analysis/xc';

const SPEEDS = [1, 10, 25, 50, 100];
/** durata target del video social (secondi) */
const VIDEO_S = 28;

export function PlaybackControls() {
  const series = useStore((s) => s.series);
  const track = useStore((s) => s.track);
  const analysis = useStore((s) => s.analysis);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const currentTime = useStore((s) => s.currentTime);
  const followPilot = useStore((s) => s.followPilot);
  const showWind = useStore((s) => s.showWind);
  const lang = useStore((s) => s.lang);
  const { setPlaying, setSpeed, setTime, setFollowPilot, setShowWind } = useStore.getState();

  const [recording, setRecording] = useState(false);
  const recRef = useRef<VideoHandle | null>(null);
  const prevSpeedRef = useRef(25);
  const watchRef = useRef<number>(0);

  const stopRec = () => {
    if (watchRef.current) clearInterval(watchRef.current);
    watchRef.current = 0;
    recRef.current?.stop();
    recRef.current = null;
    setPlaying(false);
    setSpeed(prevSpeedRef.current);
    setRecording(false);
  };

  // sicurezza: ferma la registrazione se il componente muore
  useEffect(() => () => stopRec(), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!series) return null;
  const t0 = series.t[0];
  const t1 = series.t[series.t.length - 1];

  const startRec = () => {
    if (!track || !analysis || recording) return;
    if (!isVideoSupported()) {
      alert(t(lang, 'videoUnsupported'));
      return;
    }
    const km = freeDistanceKm(series);
    const spd = xcSpeedKmh(km, analysis.totals.durationMin);
    const overlay = {
      title: track.site ?? 'Flight',
      sub: track.date,
      stats: `${km.toFixed(0)} km · ${spd.toFixed(0)} km/h · ↑${analysis.totals.maxAltM} m`,
    };
    const handle = startFlightVideo(overlay, (blob, ext) => {
      downloadBlob(blob, `skycoach-${track.date}.${ext}`);
    });
    if (!handle) {
      alert(t(lang, 'videoUnsupported'));
      return;
    }
    recRef.current = handle;
    prevSpeedRef.current = speed;
    setRecording(true);
    // replay dell'intero volo in ~VIDEO_S secondi, con camera che segue
    setTime(t0);
    setFollowPilot(true);
    setSpeed(Math.max(1, Math.round((t1 - t0) / 1000 / VIDEO_S)));
    setPlaying(true);
    // il loop di playback si ferma da solo a fine volo → chiudi la registrazione
    watchRef.current = window.setInterval(() => {
      const st = useStore.getState();
      if (!st.playing || st.currentTime >= t1) stopRec();
    }, 300);
  };

  return (
    <div className="playback">
      <button
        className="play-btn"
        onClick={() => {
          if (!playing && currentTime >= t1) setTime(t0);
          setPlaying(!playing);
        }}
        title={playing ? t(lang, 'pause') : t(lang, 'play')}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <select
        value={speed}
        onChange={(e) => setSpeed(Number(e.target.value))}
        title={t(lang, 'speed')}
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>
      <input
        type="range"
        min={t0}
        max={t1}
        step={1000}
        value={currentTime}
        onChange={(e) => setTime(Number(e.target.value))}
      />
      <span className="time-label">{new Date(currentTime).toISOString().slice(11, 19)} UTC</span>
      <label className="follow-toggle">
        <input
          type="checkbox"
          checked={followPilot}
          onChange={(e) => setFollowPilot(e.target.checked)}
        />
        {t(lang, 'follow')}
      </label>
      <label className="follow-toggle">
        <input type="checkbox" checked={showWind} onChange={(e) => setShowWind(e.target.checked)} />
        {t(lang, 'windToggle')}
      </label>
      <button
        className={`video-btn${recording ? ' rec' : ''}`}
        onClick={() => (recording ? stopRec() : startRec())}
        title={recording ? t(lang, 'videoStop') : t(lang, 'videoTitle')}
      >
        {recording ? '⏺ REC' : '🎬'}
      </button>
    </div>
  );
}
