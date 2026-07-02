/**
 * Video per i social (formato Reels/Storie 9:16): cattura il canvas Cesium
 * durante il replay, lo ritaglia a 720×1280 e ci disegna sopra un overlay
 * (sito, data, numeri chiave). MediaRecorder → mp4 su Safari/iPhone, webm
 * altrove. Tutto nel browser, nessun upload.
 */

export interface VideoOverlay {
  title: string;
  sub: string;
  stats: string;
}

export interface VideoHandle {
  stop: () => void;
}

const FONT = "-apple-system, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif";

export function isVideoSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined';
}

export function startFlightVideo(
  overlay: VideoOverlay,
  onDone: (blob: Blob, ext: string) => void,
): VideoHandle | null {
  const src = document.querySelector('.cesium-widget canvas') as HTMLCanvasElement | null;
  if (!src || !isVideoSupported()) return null;

  const W = 720;
  const H = 1280;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const stream = canvas.captureStream(30);
  const mime = MediaRecorder.isTypeSupported('video/mp4')
    ? 'video/mp4'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 7_000_000 });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  rec.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    onDone(new Blob(chunks, { type: mime }), mime.includes('mp4') ? 'mp4' : 'webm');
  };

  let raf = 0;
  const draw = () => {
    // ritaglio "cover" centrato del canvas mappa nel 9:16
    const sA = src.width / src.height;
    const dA = W / H;
    let sw: number, sh: number, sx: number, sy: number;
    if (sA > dA) {
      sh = src.height;
      sw = sh * dA;
      sx = (src.width - sw) / 2;
      sy = 0;
    } else {
      sw = src.width;
      sh = sw / dA;
      sx = 0;
      sy = (src.height - sh) / 2;
    }
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, W, H);

    // overlay in basso: gradiente + testi
    const g = ctx.createLinearGradient(0, H - 380, 0, H);
    g.addColorStop(0, 'rgba(10,13,18,0)');
    g.addColorStop(1, 'rgba(10,13,18,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H - 380, W, 380);

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#e8b33c';
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText('SkyCoach', 40, H - 262);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 52px ${FONT}`;
    ctx.fillText(overlay.title, 40, H - 196);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `400 32px ${FONT}`;
    ctx.fillText(overlay.sub, 40, H - 142);
    ctx.fillStyle = '#e8b33c';
    ctx.font = `600 40px ${FONT}`;
    ctx.fillText(overlay.stats, 40, H - 66);

    raf = requestAnimationFrame(draw);
  };

  rec.start(250);
  raf = requestAnimationFrame(draw);

  return {
    stop: () => {
      cancelAnimationFrame(raf);
      if (rec.state !== 'inactive') rec.stop();
    },
  };
}

/**
 * Condivide il video con lo share sheet nativo (Instagram/WhatsApp/…):
 * su Instagram si sceglie lì storia/reel/post — è il flusso che iOS/IG
 * permettono. Va chiamata da un gesto dell'utente. true se condiviso.
 */
export async function shareBlob(blob: Blob, filename: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & {
    canShare?: (d: { files: File[] }) => boolean;
    share?: (d: { files: File[] }) => Promise<void>;
  };
  if (!nav.canShare || !nav.share || !nav.canShare({ files: [file] })) return false;
  try {
    await nav.share({ files: [file] });
    return true;
  } catch {
    return false; // annullato o negato: il chiamante offre il download
  }
}

/** Scarica il blob come file (su iPhone apre il foglio di salvataggio). */
export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
