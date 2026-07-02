import { useEffect } from 'react';
import { useStore, startPlaybackLoop } from './state/store';
import { UploadDropzone } from './components/UploadDropzone';
import { CesiumViewer } from './map/CesiumViewer';
import { Barogram } from './components/Barogram';
import { PlaybackControls } from './components/PlaybackControls';
import { XcHeadline } from './components/XcHeadline';
import { StatsPanel } from './components/StatsPanel';
import { GlideEfficiencyPanel } from './components/GlideEfficiencyPanel';
import { ThermalList } from './components/ThermalList';
import { WindProfilePanel } from './components/WindProfilePanel';
import { RegionalWindPanel } from './components/RegionalWindPanel';
import { CoachPanel } from './components/CoachPanel';
import { FlightTypeBadge } from './components/FlightTypeBadge';
import { LangSwitcher } from './components/LangSwitcher';
import { MapResizer } from './components/MapResizer';
import { ShareButton } from './components/ShareButton';
import { XcLegsPanel } from './components/XcLegsPanel';
import { useFlightType } from './state/useFlightType';
import { fetchSharedFlight } from './api/share';
import { loadFlightFromText } from './lib/loadFlight';
import { t } from './i18n';

export default function App() {
  const status = useStore((s) => s.status);
  const lang = useStore((s) => s.lang);
  const reset = useStore((s) => s.reset);
  const { effective } = useFlightType();

  useEffect(() => startPlaybackLoop(), []);

  // volo condiviso via link (?f=token): caricalo all'avvio
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('f');
    if (!token) return;
    const st = useStore.getState();
    if (st.status !== 'empty') return;
    st.setLoading();
    fetchSharedFlight(token)
      .then((igc) => loadFlightFromText(igc))
      .catch(() => useStore.getState().setError(t(useStore.getState().lang, 'sharedNotFound')));
  }, []);

  if (status !== 'ready') {
    return <UploadDropzone />;
  }

  // adatta l'UI al tipo di volo: niente info inutili/fuorvianti
  const isSled = effective === 'sled'; // planata: niente termiche/vento/XC
  const isXc = effective === 'xc'; // solo l'XC mostra la velocità XC in cima
  const showThermalsWind = !isSled;

  return (
    <div className="app-layout">
      <header className="topbar">
        <span className="logo">SkyCoach</span>
        <div className="topbar-right">
          <ShareButton />
          <LangSwitcher />
          <button className="link-btn" onClick={reset}>
            {t(lang, 'loadAnother')}
          </button>
        </div>
      </header>
      <div className="main-row">
        <div className="map-col">
          <CesiumViewer />
          <MapResizer />
          {isXc && <XcHeadline />}
          <PlaybackControls />
          <Barogram />
        </div>
        <aside className="sidebar">
          <FlightTypeBadge />
          <StatsPanel />
          {isXc && <XcLegsPanel />}
          <CoachPanel />
          {showThermalsWind && <ThermalList />}
          <GlideEfficiencyPanel />
          {showThermalsWind && <WindProfilePanel />}
          {showThermalsWind && <RegionalWindPanel />}
        </aside>
      </div>
    </div>
  );
}
