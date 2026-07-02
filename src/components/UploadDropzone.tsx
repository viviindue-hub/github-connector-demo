import { useCallback, useState } from 'react';
import { useStore } from '../state/store';
import { loadFlightFromText } from '../lib/loadFlight';
import { t } from '../i18n';
import { LangSwitcher } from './LangSwitcher';

export function UploadDropzone() {
  const [dragOver, setDragOver] = useState(false);
  const status = useStore((s) => s.status);
  const errorMsg = useStore((s) => s.errorMsg);
  const lang = useStore((s) => s.lang);
  const shareAnon = useStore((s) => s.shareAnon);
  const setShareAnon = useStore((s) => s.setShareAnon);

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    await loadFlightFromText(text);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  return (
    <div
      className={`dropzone${dragOver ? ' drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="dropzone-inner">
        <div className="dropzone-lang">
          <LangSwitcher />
        </div>
        <h1>SkyCoach</h1>
        <p>{t(lang, 'tagline')}</p>
        <p className="muted">{t(lang, 'dropHint')}</p>
        <label className="file-btn">
          {t(lang, 'chooseFile')}
          <input
            type="file"
            accept=".igc,.IGC"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </label>
        {status === 'loading' && <p className="muted">{t(lang, 'analyzing')}</p>}
        {status === 'error' && <p className="error">{errorMsg}</p>}
        <p className="privacy-note">{t(lang, 'privacy')}</p>
        <label className="share-consent">
          <input
            type="checkbox"
            checked={shareAnon}
            onChange={(e) => setShareAnon(e.target.checked)}
          />
          {t(lang, 'shareConsent')}
        </label>
      </div>
    </div>
  );
}
