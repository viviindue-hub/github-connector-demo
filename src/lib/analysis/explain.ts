import type {
  DecisionPoint,
  FlightAnalysis,
  FlightTrack,
  GlideSegment,
  ThermalSegment,
  WeatherSummary,
} from '../types';

/**
 * Generatore di debriefing in LOCALE (niente AI, niente rete): trasforma
 * l'analisi già calcolata in testo italiano comprensibile, con marker
 * `[[th1]]/[[gl2]]/[[dp3]]` identici a quelli del coach AI, così il rendering
 * e il click-to-fly esistenti funzionano senza modifiche.
 */

const num = (v: number | string | undefined): number =>
  typeof v === 'number' ? v : Number(v ?? 0);

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

const COMPASS_IT = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
export function compass(deg: number): string {
  return COMPASS_IT[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

/** Media vettoriale di una serie di direzioni+intensità. */
function meanWind(items: Array<{ dirDeg: number; speedMs: number }>):
  | { dirDeg: number; speedMs: number }
  | null {
  if (items.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const it of items) {
    const r = (it.dirDeg * Math.PI) / 180;
    x += Math.cos(r) * it.speedMs;
    y += Math.sin(r) * it.speedMs;
  }
  x /= items.length;
  y /= items.length;
  const speedMs = Math.hypot(x, y);
  let dirDeg = (Math.atan2(y, x) * 180) / Math.PI;
  if (dirDeg < 0) dirDeg += 360;
  return { dirDeg, speedMs };
}

/** Riga breve per la lista decisioni (senza marker, testo semplice). */
export function explainDecisionShort(dp: DecisionPoint): string {
  const d = dp.data;
  switch (dp.type) {
    case 'early_exit':
      return `Lasciata ${d.thermal} a ${dp.alt} m mentre saliva ancora a +${num(d.climbAtExit)} m/s — dopo sei risalito fino a ${num(d.laterMaxAlt)} m.`;
    case 'weak_thermal_persist':
      return `${num(d.minutes)}′ su una termica da ${num(d.avgClimb)} m/s, con la mediana del giorno a ${num(d.dayMedian)} m/s.`;
    case 'low_save':
      return `Recuperato da ${num(d.aglAtLow)} m dal suolo rimontando ${num(d.regained)} m. 👏`;
    case 'sink_line':
      return `${num(d.sustainedSinkS)}s filati sotto −2 m/s in planata (${d.glide}).`;
    case 'low_crossing':
      return d.endedFlight === 'yes'
        ? `Sceso a ${num(d.minAgl)} m dal suolo: qui è finito il volo.`
        : `Attraversamento a soli ${num(d.minAgl)} m dal suolo (${d.glide}).`;
  }
}

/** Frase completa con il *perché* e il marker [[dpN]] per il debriefing. */
export function explainDecisionFull(dp: DecisionPoint): string {
  const d = dp.data;
  const m = `[[${dp.id}]]`;
  switch (dp.type) {
    case 'early_exit':
      return `Hai lasciato la termica ${d.thermal} a ${dp.alt} m mentre saliva ancora a +${num(d.climbAtExit)} m/s ${m}; nei 30 minuti dopo la quota massima è stata ${num(d.laterMaxAlt)} m. Restando ancora un po' evitavi di ripartire più in basso.`;
    case 'weak_thermal_persist':
      return `Sei rimasto ${num(d.minutes)} minuti nella termica ${d.thermal} a soli ${num(d.avgClimb)} m/s ${m}, quando la mediana della giornata era ${num(d.dayMedian)} m/s. In una giornata così conveniva mollarla e cercarne una più forte.`;
    case 'low_save':
      return `Bel recupero ${m}: eri a ${num(d.aglAtLow)} m dal suolo e hai rimontato ${num(d.regained)} m. Sangue freddo e centraggio pagano.`;
    case 'sink_line':
      return `Hai attraversato una linea di discendenza ${m} (${num(d.sustainedSinkS)}s sotto −2 m/s). Quando l'aria scende così, spostarti di lato per uscirne in fretta limita la perdita di quota.`;
    case 'low_crossing':
      return d.endedFlight === 'yes'
        ? `Attraversamento basso a ${num(d.minAgl)} m dal suolo ${m}: qui è finito il volo. Con più margine avresti avuto più opzioni per riagganciare.`
        : `Sei sceso a soli ${num(d.minAgl)} m dal suolo ${m}. Più margine in attraversamento dà più scelte se non trovi la salita.`;
  }
}

function bestThermal(thermals: ThermalSegment[]): ThermalSegment | null {
  if (thermals.length === 0) return null;
  return thermals.reduce((a, b) => (b.best30s > a.best30s ? b : a));
}

/** Paragrafo "storia del volo". */
export function buildFlightStory(track: FlightTrack, analysis: FlightAnalysis): string {
  const { totals, thermals, windProfile } = analysis;
  const parts: string[] = [];

  const where = track.site ? ` da ${track.site}` : '';
  parts.push(
    `Volo${where} di ${fmtDuration(totals.durationMin)}: ${totals.trackDistanceKm} km di traccia, quota massima ${totals.maxAltM} m.`,
  );

  if (thermals.length > 0) {
    const best = bestThermal(thermals);
    const avgRadius = Math.round(
      thermals.reduce((s, t) => s + t.meanRadius, 0) / thermals.length,
    );
    let s = `Hai sfruttato ${thermals.length} termiche`;
    if (best) s += `, la migliore [[${best.id}]] a +${best.best30s.toFixed(1)} m/s sui 30 secondi`;
    s += `. Raggio medio di virata ${avgRadius} m`;
    s +=
      avgRadius <= 60
        ? ' — centraggio stretto, buono.'
        : avgRadius <= 90
          ? ' — centraggio discreto, c\'è margine per stringere.'
          : ' — virate larghe: stringendo guadagneresti di più.';
    parts.push(s);
  }

  parts.push(
    `Hai passato il ${totals.pctClimb}% del tempo in salita e il ${totals.pctGlide}% in planata` +
      (totals.minutesWasted > 0
        ? `, con ${totals.minutesWasted} min in termiche deboli.`
        : '.'),
  );

  const wind = meanWind(windProfile.length > 0 ? windProfile : thermals.map((t) => t.drift));
  if (wind && wind.speedMs >= 0.5) {
    parts.push(
      `Vento stimato dalla deriva delle termiche: ~${Math.round(wind.speedMs * 3.6)} km/h da ${compass(wind.dirDeg)}.`,
    );
  }

  // un paragrafo per ogni frase così ognuna è isolata e i marker restano cliccabili
  return parts.join('\n\n');
}

/** Cosa è andato bene. */
function buildGoodPoints(analysis: FlightAnalysis): string | null {
  const { thermals, glides, decisionPoints } = analysis;
  const lines: string[] = [];

  for (const dp of decisionPoints.filter((d) => d.severity === 'praise')) {
    lines.push(explainDecisionFull(dp));
  }

  let bestGlide: GlideSegment | null = null;
  for (const g of glides) {
    if (isFinite(g.ratio) && (!bestGlide || g.ratio > bestGlide.ratio)) bestGlide = g;
  }
  if (bestGlide && bestGlide.ratio >= 8) {
    lines.push(
      `Buona planata [[${bestGlide.id}]]: ${bestGlide.ratio.toFixed(1)}:1 su ${bestGlide.distanceKm.toFixed(1)} km, efficiente.`,
    );
  }

  if (lines.length === 0 && thermals.length > 0) {
    lines.push('Hai agganciato e sfruttato le termiche con costanza: buona base.');
  }
  return lines.length > 0 ? lines.join('\n\n') : null;
}

/** "La cosa da allenare", scelta dal tipo di errore più ricorrente. */
function buildFocus(decisionPoints: DecisionPoint[]): string {
  const issues = decisionPoints.filter((d) => d.severity === 'warn' || d.severity === 'critical');
  if (issues.length === 0) {
    return 'Volo pulito, nessun errore evidente. Prossimo passo: spingere di più sulle transizioni e stringere il centraggio per salire più in fretta.';
  }
  const counts = new Map<string, number>();
  for (const d of issues) counts.set(d.type, (counts.get(d.type) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const tips: Record<string, string> = {
    early_exit:
      'Resta in termica finché la salita non cala per davvero: esci quando il vario scende sotto la media della giornata, non al primo calo.',
    weak_thermal_persist:
      'Allena la disciplina di mollare le termiche deboli: se dopo 1-2 giri non sale come la media del giorno, vai a cercarne un\'altra.',
    sink_line:
      'Quando entri in discendenza prolungata, cambia rotta subito per uscire dalla massa d\'aria che scende invece di insistere dritto.',
    low_crossing:
      'Pianifica gli attraversamenti con più margine di quota: parti più alto e tieni sempre un atterrabile a portata.',
    low_save: 'Continua così con la gestione delle quote basse.',
  };
  return tips[top] ?? 'Lavora sulla lettura della giornata e sulla scelta delle termiche.';
}

/**
 * Debriefing completo in markdown leggero con marker [[id]].
 * Le intestazioni iniziano con "## " (gestite dal renderer del pannello).
 * `lang` previsto per il futuro; per ora il testo locale è in italiano.
 */
export function buildLocalDebrief(
  track: FlightTrack,
  analysis: FlightAnalysis,
  _weather?: WeatherSummary,
  _lang: 'it' | 'en' = 'it',
): string {
  const blocks: string[] = [];
  blocks.push(buildFlightStory(track, analysis));

  const good = buildGoodPoints(analysis);
  if (good) blocks.push('## Cosa è andato bene', good);

  const issues = analysis.decisionPoints
    .filter((d) => d.severity === 'warn' || d.severity === 'critical')
    .slice(0, 5);
  if (issues.length > 0) {
    blocks.push('## Decisioni chiave');
    for (const dp of issues) blocks.push(explainDecisionFull(dp));
  }

  blocks.push('## La cosa da allenare', buildFocus(analysis.decisionPoints));

  return blocks.join('\n\n');
}
