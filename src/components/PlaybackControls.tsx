import { useStore } from '../state/store';
import { t } from '../i18n';

const SPEEDS = [1, 10, 25, 50, 100];

export function PlaybackControls() {
  const series = useStore((s) => s.series);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const currentTime = useStore((s) => s.currentTime);
  const followPilot = useStore((s) => s.followPilot);
  const lang = useStore((s) => s.lang);
  const { setPlaying, setSpeed, setTime, setFollowPilot } = useStore.getState();

  if (!series) return null;
  const t0 = series.t[0];
  const t1 = series.t[series.t.length - 1];

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
    </div>
  );
}
