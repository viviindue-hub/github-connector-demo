import { useRef, useState } from 'react';
import { useStore } from '../state/store';
import { t } from '../i18n';
import { downloadBlob, shareBlob } from '../lib/videoExport';
import { generateFlightVideo, isGenerateSupported } from '../lib/renderVideo';

const SPEEDS = [1, 10, 25, 50, 100];

export function PlaybackControls() {
  const series = useStore((s) => s.series);
  const track = useStore((s) => s.track);
  const analysis = useStore((s) => s.analysis);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const currentTime = useStore((s) => s.currentTime);
  const followPilot = useStore((s) => s.followPilot);
  const lang = useStore((s) => s.lang);
  const { setPlaying, setSpeed, setTime, setFollowPilot } = useStore.getState();

  const [genPct, setGenPct] = useState<number | null>(null);
  const [video, setVideo] = useState<{ blob: Blob; ext: string } | null>(null);
  const busyRef = useRef(false);

  if (!series) return null;
  const t0 = series.t[0];
  const t1 = series.t[series.t.length - 1];

  const onGenerate = async () => {
    if (!track || !analysis || busyRef.current) return;
    if (!isGenerateSupported()) {
      alert(t(lang, 'videoUnsupported'));
      return;
    }
    busyRef.current = true;
    setVideo(null);
    setGenPct(0);
    try {
      // tutto in background su un viewer nascosto: qui si continua a usare l'app
      const blob = await generateFlightVideo(series, analysis, track, (p) => setGenPct(p));
      setVideo({ blob, ext: 'mp4' });
    } catch {
      alert(t(lang, 'videoUnsupported'));
    } finally {
      busyRef.current = false;
      setGenPct(null);
    }
  };

  const onShareVideo = async () => {
    if (!video || !track) return;
    const name = `skycoach-${track.date}.${video.ext}`;
    const shared = await shareBlob(video.blob, name);
    if (!shared) downloadBlob(video.blob, name);
  };

  return (
    <>
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
        <button
          className="video-btn"
          onClick={() => void onGenerate()}
          disabled={genPct !== null}
          title={t(lang, 'videoTitle')}
        >
          {genPct === null ? '🎬' : `⏳ ${Math.round(genPct * 100)}%`}
        </button>
      </div>
      {video && (
        <div className="video-ready">
          <span className="video-ready-label">🎬 {t(lang, 'videoReady')}</span>
          <button className="share-btn" onClick={() => void onShareVideo()}>
            {t(lang, 'videoShare')}
          </button>
          <button
            className="ai-btn"
            onClick={() => track && downloadBlob(video.blob, `skycoach-${track.date}.${video.ext}`)}
          >
            {t(lang, 'videoSave')}
          </button>
          <button className="link-btn" onClick={() => setVideo(null)}>
            ✕
          </button>
        </div>
      )}
    </>
  );
}
