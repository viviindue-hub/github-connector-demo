import { useEffect } from 'react';
import { useStore, startPlaybackLoop } from './state/store';
import { UploadDropzone } from './components/UploadDropzone';
import { CesiumViewer } from './map/CesiumViewer';
import { Barogram } from './components/Barogram';
import { PlaybackControls } from './components/PlaybackControls';
import { StatsPanel } from './components/StatsPanel';
import { ThermalList } from './components/ThermalList';
import { CoachPanel } from './components/CoachPanel';

export default function App() {
  const status = useStore((s) => s.status);
  const reset = useStore((s) => s.reset);

  useEffect(() => startPlaybackLoop(), []);

  if (status !== 'ready') {
    return <UploadDropzone />;
  }

  return (
    <div className="app-layout">
      <header className="topbar">
        <span className="logo">SkyCoach</span>
        <button className="link-btn" onClick={reset}>
          carica un altro volo
        </button>
      </header>
      <div className="main-row">
        <div className="map-col">
          <CesiumViewer />
          <PlaybackControls />
          <Barogram />
        </div>
        <aside className="sidebar">
          <StatsPanel />
          <CoachPanel />
          <ThermalList />
        </aside>
      </div>
    </div>
  );
}
