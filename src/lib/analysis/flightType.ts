import type { FlightAnalysis } from '../types';

/**
 * Tipo di volo riconosciuto dai dati, per mostrare solo le analisi pertinenti
 * (niente info inutili/fuorvianti):
 * - 'xc'    cross country: distanza libera significativa
 * - 'local' giri/soaring ma resta in zona (sale ma poca distanza)
 * - 'sled'  planata: non sale, scende e basta
 */
export type FlightType = 'xc' | 'local' | 'sled';

/** Distanza libera (km) oltre la quale consideriamo il volo un XC. */
const XC_KM = 15;

export function classifyFlight(analysis: FlightAnalysis, freeKm: number): FlightType {
  if (freeKm >= XC_KM) return 'xc';
  const climbed = analysis.thermals.length > 0 || analysis.totals.pctClimb > 8;
  return climbed ? 'local' : 'sled';
}
