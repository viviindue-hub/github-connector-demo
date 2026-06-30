import { useMemo } from 'react';
import { useStore } from './store';
import { classifyFlight, type FlightType } from '../lib/analysis/flightType';
import { freeDistanceKm } from '../lib/analysis/xc';

/** Tipo di volo riconosciuto dai dati + tipo effettivo (con eventuale override). */
export function useFlightType(): { detected: FlightType | null; effective: FlightType | null } {
  const series = useStore((s) => s.series);
  const analysis = useStore((s) => s.analysis);
  const override = useStore((s) => s.flightTypeOverride);

  const detected = useMemo(
    () => (series && analysis ? classifyFlight(analysis, freeDistanceKm(series)) : null),
    [series, analysis],
  );
  const effective = override === 'auto' ? detected : override;
  return { detected, effective };
}
