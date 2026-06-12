import { create } from 'zustand';
import type {
  DerivedSeries,
  FlightAnalysis,
  FlightSummaryForAI,
  FlightTrack,
  WeatherSummary,
} from '../lib/types';

export interface FlyToTarget {
  lat: number;
  lon: number;
  alt: number;
  t: number;
  /** contatore per ritriggerare il fly-to anche sullo stesso punto */
  seq: number;
}

interface AppState {
  status: 'empty' | 'loading' | 'ready' | 'error';
  errorMsg: string | null;
  track: FlightTrack | null;
  series: DerivedSeries | null;
  analysis: FlightAnalysis | null;
  weather: WeatherSummary | undefined;
  summaryForAI: FlightSummaryForAI | null;

  /** epoch ms del cursore di replay */
  currentTime: number;
  playing: boolean;
  speed: number;
  flyTo: FlyToTarget | null;
  /** true mentre l'utente vuole la camera agganciata al pilota */
  followPilot: boolean;

  setLoading: () => void;
  setError: (msg: string) => void;
  setFlight: (data: {
    track: FlightTrack;
    series: DerivedSeries;
    analysis: FlightAnalysis;
    weather: WeatherSummary | undefined;
    summaryForAI: FlightSummaryForAI;
  }) => void;
  updateSeries: (series: DerivedSeries, analysis: FlightAnalysis, summaryForAI: FlightSummaryForAI) => void;
  setTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  setFollowPilot: (f: boolean) => void;
  requestFlyTo: (target: Omit<FlyToTarget, 'seq'>) => void;
  reset: () => void;
}

export const useStore = create<AppState>((set) => ({
  status: 'empty',
  errorMsg: null,
  track: null,
  series: null,
  analysis: null,
  weather: undefined,
  summaryForAI: null,
  currentTime: 0,
  playing: false,
  speed: 25,
  flyTo: null,
  followPilot: false,

  setLoading: () => set({ status: 'loading', errorMsg: null }),
  setError: (msg) => set({ status: 'error', errorMsg: msg, playing: false }),
  setFlight: ({ track, series, analysis, weather, summaryForAI }) =>
    set({
      status: 'ready',
      track,
      series,
      analysis,
      weather,
      summaryForAI,
      currentTime: series.t[0],
      playing: false,
    }),
  updateSeries: (series, analysis, summaryForAI) => set({ series, analysis, summaryForAI }),
  setTime: (t) => set({ currentTime: t }),
  setPlaying: (p) => set({ playing: p }),
  setSpeed: (s) => set({ speed: s }),
  setFollowPilot: (f) => set({ followPilot: f }),
  requestFlyTo: (target) =>
    set((st) => ({
      flyTo: { ...target, seq: (st.flyTo?.seq ?? 0) + 1 },
      currentTime: target.t,
      playing: false,
    })),
  reset: () =>
    set({
      status: 'empty',
      errorMsg: null,
      track: null,
      series: null,
      analysis: null,
      weather: undefined,
      summaryForAI: null,
      currentTime: 0,
      playing: false,
      flyTo: null,
    }),
}));

/** Avvia il loop di playback (RAF). Chiamare una volta da App. */
export function startPlaybackLoop(): () => void {
  let raf = 0;
  let last = performance.now();
  const tick = (now: number) => {
    const dt = now - last;
    last = now;
    const st = useStore.getState();
    if (st.playing && st.series) {
      const t0 = st.series.t[0];
      const t1 = st.series.t[st.series.t.length - 1];
      let next = st.currentTime + dt * st.speed;
      if (next >= t1) {
        next = t1;
        st.setPlaying(false);
      }
      st.setTime(Math.max(t0, next));
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
