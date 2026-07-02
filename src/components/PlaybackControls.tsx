import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { t } from '../i18n';
import {
  downloadBlob,
  isVideoSupported,
  shareBlob,
  startFlightVideo,
  type VideoHandle,
} from '../lib/videoExport';
import { buildStoryboard, runCinema, type CinemaHandle } from '../lib/cinema';
import { freeDistanceKm, xcSpeedKmh } from '../lib/analysis/xc';

const SPEEDS = [1, 10, 25, 50, 100];

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
  const [video, setVideo] = useState<{ blob: Blob; ext: string } | null>(null);
  const recRef = useRef<VideoHandle | null>(null);
  const cinemaRef = useRef<CinemaHandle | null>(null);
  const prevSpeedRef = useRef(25);

  const stopRec = () => {
    cinemaRef.current?.cancel();
    cinemaRef.current = null;
    recRef.current?.stop(); // onstop → setVideo
    recRef.current = null;
    setPlaying(false);
    setSpeed(prevSpeedRef.current);
    setFollowPilot(false);
    setRecording(false);
  };

  // sicurezza: chiudi tutto se il componente muore
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
    const handle = startFlightVideo(overlay, (blob, ext) => setVideo({ blob, ext }));
    if (!handle) {
      alert(t(lang, 'videoUnsupported'));
      return;
    }
    recRef.current = handle;
    prevSpeedRef.current = speed;
    setVideo(null);
    setRecording(true);
    // il REGISTA pilota tutto: panoramica → highlights → finale (~30 s)
    const scenes = buildStoryboard(series, analysis);
    cinemaRef.current = runCinema(scenes, stopRec);
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
        <label className="follow-toggle">
          <input
            type="checkbox"
            checked={showWind}
            onChange={(e) => setShowWind(e.target.checked)}
          />
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
      {video && !recording && (
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
