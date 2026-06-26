import { useEffect, useRef } from 'react';

const KEY = 'skycoach-map-h';
const MIN_VH = 32;
const MAX_VH = 85;

/**
 * Maniglia per ridimensionare l'altezza dello schermo del volo (mappa 3D),
 * così su mobile si può rimpicciolire per leggere meglio le insight sotto.
 * Imposta la variabile CSS --map-h (usata da .map-col nel layout mobile).
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

  return (
    <div
      ref={ref}
      className="map-resizer"
      onPointerDown={onPointerDown}
      title="Trascina per ridimensionare la mappa"
      role="separator"
      aria-orientation="horizontal"
    >
      <span className="map-resizer-grip" />
    </div>
  );
}
