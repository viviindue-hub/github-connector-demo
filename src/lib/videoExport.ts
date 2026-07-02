/**
 * Consegna del video generato: condivisione con lo share sheet nativo
 * (Instagram/WhatsApp/…) o download. La generazione vera è in renderVideo.ts.
 */

/**
 * Condivide il video con lo share sheet nativo: su Instagram si sceglie lì
 * storia/reel/post — è il flusso che iOS/IG permettono. Va chiamata da un
 * gesto dell'utente. true se condiviso.
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
