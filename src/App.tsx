import { useEffect } from 'react';
import { useStore, startPlaybackLoop } from './state/store';
import { UploadDropzone } from './components/UploadDropzone';
import { CesiumViewer } from './map/CesiumViewer';
import { Barogram } from './components/Barogram';
import { PlaybackControls } from './components/PlaybackControls';
import { StatsPanel } from './components/StatsPanel';
import { ThermalList } from './components/ThermalList';
import { CoachPanel } from './components/CoachPanel';
import { LangSwitcher } from './components/LangSwitcher';
import { MapResizer } from './components/MapResizer';
import { t } from './i18n';

export default function App() {
  const status = useStore((s) => s.status);
  const lang = useStore((s) => s.lang);
  const reset = useStore((s) => s.reset);

  useEffect(() => startPlaybackLoop(), []);

  if (status !== 'ready') {
    return <UploadDropzone />;
  }

  return (
    <div className="app-layout">
      <header className="topbar">
        <span className="logo">SkyCoach</span>
        <div className="topbar-right">
          <LangSwitcher />
          <button className="link-btn" onClick={reset}>
            {t(lang, 'loadAnother')}
          </button>
        </div>
      </header>
      <div className="main-row">
        <div className="map-col">
          <CesiumViewer />
          <PlaybackControls />
          <Barogram />
          <MapResizer />
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
