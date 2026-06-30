import { useEffect, useRef } from 'react';

const KEY = 'skycoach-map-h';
const MIN_VH = 18;
const MAX_VH = 80;

/**
 * Maniglia (subito sotto la mappa) per ridimensionarne l'altezza su mobile.
 * Imposta --map-h, usata da .cesium-wrap: ridimensiona SOLO la mappa, così
 * barogramma e maniglia restano sempre visibili (la mappa si recupera sempre).
 * Doppio tap = reset all'altezza predefinita.
 */
export function MapResizer() {
  const ref = useRef<HTMLDivElement>(null);

  // ripristina l'altezza salvata
  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (saved) document.documentElement.style.setProperty('--map-h', `${saved}vh`);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const col = ref.current?.parentElement;
    if (!col) return;
    const top = col.getBoundingClientRect().top;

    const move = (ev: PointerEvent) => {
      const vh = Math.min(
        MAX_VH,
        Math.max(MIN_VH, ((ev.clientY - top) / window.innerHeight) * 100),
      );
      document.documentElement.style.setProperty('--map-h', `${vh.toFixed(1)}vh`);
      localStorage.setItem(KEY, vh.toFixed(1));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const reset = () => {
    document.documentElement.style.removeProperty('--map-h');
    localStorage.removeItem(KEY);
  };

  return (
    <div
      ref={ref}
      className="map-resizer"
      onPointerDown={onPointerDown}
      onDoubleClick={reset}
      title="Trascina per ridimensionare · doppio tap per reset"
      role="separator"
      aria-orientation="horizontal"
    >
      <span className="map-resizer-grip" />
    </div>
  );
}
