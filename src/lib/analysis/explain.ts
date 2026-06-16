import type {
  DecisionPoint,
  FlightAnalysis,
  FlightTrack,
  GlideSegment,
  ThermalSegment,
  WeatherSummary,
} from '../types';
import type { Lang } from '../../i18n';

/**
 * Generatore di debriefing in LOCALE (niente AI, niente rete): trasforma
 * l'analisi già calcolata in testo comprensibile in IT/EN/DE, con marker
 * `[[th1]]/[[gl2]]/[[dp3]]` identici a quelli del coach AI, così il rendering
 * e il click-to-fly esistenti funzionano senza modifiche.
 */

const num = (v: number | string | undefined): number =>
  typeof v === 'number' ? v : Number(v ?? 0);

function fmtDuration(min: number, lang: Lang): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return lang === 'de' ? `${h} Std ${m} min` : `${h}h ${m}m`;
}

const COMPASS: Record<Lang, string[]> = {
  it: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
  de: ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'],
};
export function compass(deg: number, lang: Lang): string {
  return COMPASS[lang][Math.round(((((deg % 360) + 360) % 360) / 45)) % 8];
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
export function explainDecisionShort(dp: DecisionPoint, lang: Lang): string {
  const d = dp.data;
  const it = lang === 'it';
  const en = lang === 'en';
  switch (dp.type) {
    case 'early_exit':
      return it
        ? `Lasciata ${d.thermal} a ${dp.alt} m mentre saliva ancora a +${num(d.climbAtExit)} m/s — dopo sei risalito fino a ${num(d.laterMaxAlt)} m.`
        : en
          ? `Left ${d.thermal} at ${dp.alt} m while still climbing +${num(d.climbAtExit)} m/s — later you got back up to ${num(d.laterMaxAlt)} m.`
          : `${d.thermal} bei ${dp.alt} m verlassen, obwohl es noch mit +${num(d.climbAtExit)} m/s stieg — danach bis ${num(d.laterMaxAlt)} m zurück.`;
    case 'weak_thermal_persist':
      return it
        ? `${num(d.minutes)}′ su una termica da ${num(d.avgClimb)} m/s, con la mediana del giorno a ${num(d.dayMedian)} m/s.`
        : en
          ? `${num(d.minutes)} min on a ${num(d.avgClimb)} m/s thermal, with the day's median at ${num(d.dayMedian)} m/s.`
          : `${num(d.minutes)} min an einem ${num(d.avgClimb)} m/s-Bart, Tagesmedian ${num(d.dayMedian)} m/s.`;
    case 'low_save':
      return it
        ? `Recuperato da ${num(d.aglAtLow)} m dal suolo rimontando ${num(d.regained)} m. 👏`
        : en
          ? `Saved it from ${num(d.aglAtLow)} m AGL, climbing back ${num(d.regained)} m. 👏`
          : `Aus ${num(d.aglAtLow)} m über Grund gerettet, ${num(d.regained)} m zurückgestiegen. 👏`;
    case 'sink_line':
      return it
        ? `${num(d.sustainedSinkS)}s filati sotto −2 m/s in planata (${d.glide}).`
        : en
          ? `${num(d.sustainedSinkS)}s straight below −2 m/s on glide (${d.glide}).`
          : `${num(d.sustainedSinkS)}s am Stück unter −2 m/s im Gleiten (${d.glide}).`;
    case 'low_crossing':
      if (d.endedFlight === 'yes')
        return it
          ? `Sceso a ${num(d.minAgl)} m dal suolo: qui è finito il volo.`
          : en
            ? `Down to ${num(d.minAgl)} m AGL: the flight ended here.`
            : `Auf ${num(d.minAgl)} m über Grund: hier endete der Flug.`;
      return it
        ? `Attraversamento a soli ${num(d.minAgl)} m dal suolo (${d.glide}).`
        : en
          ? `Crossing at only ${num(d.minAgl)} m AGL (${d.glide}).`
          : `Querung bei nur ${num(d.minAgl)} m über Grund (${d.glide}).`;
  }
}

/** Frase completa con il *perché* e il marker [[dpN]] per il debriefing. */
export function explainDecisionFull(dp: DecisionPoint, lang: Lang): string {
  const d = dp.data;
  const m = `[[${dp.id}]]`;
  const it = lang === 'it';
  const en = lang === 'en';
  switch (dp.type) {
    case 'early_exit':
      return it
        ? `Hai lasciato la termica ${d.thermal} a ${dp.alt} m mentre saliva ancora a +${num(d.climbAtExit)} m/s ${m}; nei 30 minuti dopo la quota massima è stata ${num(d.laterMaxAlt)} m. Restando ancora un po' evitavi di ripartire più in basso.`
        : en
          ? `You left thermal ${d.thermal} at ${dp.alt} m while it was still climbing +${num(d.climbAtExit)} m/s ${m}; in the next 30 minutes your max altitude was ${num(d.laterMaxAlt)} m. Staying a bit longer would have spared you a lower restart.`
          : `Du hast den Bart ${d.thermal} bei ${dp.alt} m verlassen, obwohl er noch mit +${num(d.climbAtExit)} m/s stieg ${m}; in den nächsten 30 Minuten lag deine Maximalhöhe bei ${num(d.laterMaxAlt)} m. Etwas länger zu bleiben hätte dir einen tieferen Neustart erspart.`;
    case 'weak_thermal_persist':
      return it
        ? `Sei rimasto ${num(d.minutes)} minuti nella termica ${d.thermal} a soli ${num(d.avgClimb)} m/s ${m}, quando la mediana della giornata era ${num(d.dayMedian)} m/s. In una giornata così conveniva mollarla e cercarne una più forte.`
        : en
          ? `You stayed ${num(d.minutes)} minutes in thermal ${d.thermal} at just ${num(d.avgClimb)} m/s ${m}, while the day's median was ${num(d.dayMedian)} m/s. On a day like this it pays to leave it and look for a stronger one.`
          : `Du bist ${num(d.minutes)} Minuten im Bart ${d.thermal} bei nur ${num(d.avgClimb)} m/s geblieben ${m}, während der Tagesmedian ${num(d.dayMedian)} m/s war. An so einem Tag lohnt es sich, ihn zu verlassen und einen stärkeren zu suchen.`;
    case 'low_save':
      return it
        ? `Bel recupero ${m}: eri a ${num(d.aglAtLow)} m dal suolo e hai rimontato ${num(d.regained)} m. Sangue freddo e centraggio pagano.`
        : en
          ? `Nice save ${m}: you were ${num(d.aglAtLow)} m AGL and climbed back ${num(d.regained)} m. Cool head and good centering pay off.`
          : `Schöner Save ${m}: du warst ${num(d.aglAtLow)} m über Grund und bist ${num(d.regained)} m zurückgestiegen. Kühler Kopf und gutes Zentrieren zahlen sich aus.`;
    case 'sink_line':
      return it
        ? `Hai attraversato una linea di discendenza ${m} (${num(d.sustainedSinkS)}s sotto −2 m/s). Quando l'aria scende così, spostarti di lato per uscirne in fretta limita la perdita di quota.`
        : en
          ? `You crossed a sink line ${m} (${num(d.sustainedSinkS)}s below −2 m/s). When the air sinks like that, moving sideways to get out quickly limits the height loss.`
          : `Du bist durch eine Abwindlinie geflogen ${m} (${num(d.sustainedSinkS)}s unter −2 m/s). Wenn die Luft so absinkt, begrenzt seitliches Ausweichen den Höhenverlust.`;
    case 'low_crossing':
      if (d.endedFlight === 'yes')
        return it
          ? `Attraversamento basso a ${num(d.minAgl)} m dal suolo ${m}: qui è finito il volo. Con più margine avresti avuto più opzioni per riagganciare.`
          : en
            ? `Low crossing at ${num(d.minAgl)} m AGL ${m}: the flight ended here. With more margin you'd have had more options to climb again.`
            : `Tiefe Querung bei ${num(d.minAgl)} m über Grund ${m}: hier endete der Flug. Mit mehr Reserve hättest du mehr Möglichkeiten zum Wiederaufdrehen gehabt.`;
      return it
        ? `Sei sceso a soli ${num(d.minAgl)} m dal suolo ${m}. Più margine in attraversamento dà più scelte se non trovi la salita.`
        : en
          ? `You got down to just ${num(d.minAgl)} m AGL ${m}. More margin on crossings gives you more options if you don't find lift.`
          : `Du bist auf nur ${num(d.minAgl)} m über Grund gesunken ${m}. Mehr Reserve bei Querungen gibt dir mehr Optionen, falls du kein Steigen findest.`;
  }
}

function bestThermal(thermals: ThermalSegment[]): ThermalSegment | null {
  if (thermals.length === 0) return null;
  return thermals.reduce((a, b) => (b.best30s > a.best30s ? b : a));
}

function centeringNote(avgRadius: number, lang: Lang): string {
  if (lang === 'it')
    return avgRadius <= 60
      ? ' — centraggio stretto, buono.'
      : avgRadius <= 90
        ? " — centraggio discreto, c'è margine per stringere."
        : ' — virate larghe: stringendo guadagneresti di più.';
  if (lang === 'en')
    return avgRadius <= 60
      ? ' — tight centering, good.'
      : avgRadius <= 90
        ? ' — decent centering, room to tighten.'
        : ' — wide turns: tightening would gain you more.';
  return avgRadius <= 60
    ? ' — enges Zentrieren, gut.'
    : avgRadius <= 90
      ? ' — ordentliches Zentrieren, Luft nach oben.'
      : ' — weite Kreise: enger drehen bringt mehr.';
}

/** Paragrafo "storia del volo". */
export function buildFlightStory(track: FlightTrack, analysis: FlightAnalysis, lang: Lang): string {
  const { totals, thermals, windProfile } = analysis;
  const parts: string[] = [];
  const it = lang === 'it';
  const en = lang === 'en';
  const where = track.site ? (it ? ` da ${track.site}` : en ? ` from ${track.site}` : ` ab ${track.site}`) : '';
  const dur = fmtDuration(totals.durationMin, lang);

  parts.push(
    it
      ? `Volo${where} di ${dur}: ${totals.trackDistanceKm} km di traccia, quota massima ${totals.maxAltM} m.`
      : en
        ? `Flight${where} of ${dur}: ${totals.trackDistanceKm} km of track, max altitude ${totals.maxAltM} m.`
        : `Flug${where} über ${dur}: ${totals.trackDistanceKm} km Strecke, max. Höhe ${totals.maxAltM} m.`,
  );

  if (thermals.length > 0) {
    const best = bestThermal(thermals);
    const avgRadius = Math.round(thermals.reduce((s, t) => s + t.meanRadius, 0) / thermals.length);
    const bestTxt = best
      ? it
        ? `, la migliore [[${best.id}]] a +${best.best30s.toFixed(1)} m/s sui 30 secondi`
        : en
          ? `, the best [[${best.id}]] at +${best.best30s.toFixed(1)} m/s over 30 s`
          : `, der beste [[${best.id}]] mit +${best.best30s.toFixed(1)} m/s über 30 s`
      : '';
    const head = it
      ? `Hai sfruttato ${thermals.length} termiche${bestTxt}. Raggio medio di virata ${avgRadius} m`
      : en
        ? `You used ${thermals.length} thermals${bestTxt}. Average turn radius ${avgRadius} m`
        : `Du hast ${thermals.length} Bärte genutzt${bestTxt}. Mittlerer Kreisradius ${avgRadius} m`;
    parts.push(head + centeringNote(avgRadius, lang));
  }

  const wastedTxt =
    totals.minutesWasted > 0
      ? it
        ? `, con ${totals.minutesWasted} min in termiche deboli.`
        : en
          ? `, with ${totals.minutesWasted} min in weak thermals.`
          : `, davon ${totals.minutesWasted} min in schwachen Bärten.`
      : '.';
  parts.push(
    it
      ? `Hai passato il ${totals.pctClimb}% del tempo in salita e il ${totals.pctGlide}% in planata${wastedTxt}`
      : en
        ? `You spent ${totals.pctClimb}% of the time climbing and ${totals.pctGlide}% gliding${wastedTxt}`
        : `Du warst ${totals.pctClimb}% der Zeit im Steigen und ${totals.pctGlide}% im Gleiten${wastedTxt}`,
  );

  const wind = meanWind(windProfile.length > 0 ? windProfile : thermals.map((t) => t.drift));
  if (wind && wind.speedMs >= 0.5) {
    const kmh = Math.round(wind.speedMs * 3.6);
    const dir = compass(wind.dirDeg, lang);
    parts.push(
      it
        ? `Vento stimato dalla deriva delle termiche: ~${kmh} km/h da ${dir}.`
        : en
          ? `Wind estimated from thermal drift: ~${kmh} km/h from ${dir}.`
          : `Aus der Bartdrift geschätzter Wind: ~${kmh} km/h aus ${dir}.`,
    );
  }

  return parts.join('\n\n');
}

/** Cosa è andato bene. */
function buildGoodPoints(analysis: FlightAnalysis, lang: Lang): string | null {
  const { thermals, glides, decisionPoints } = analysis;
  const it = lang === 'it';
  const en = lang === 'en';
  const lines: string[] = [];

  for (const dp of decisionPoints.filter((d) => d.severity === 'praise')) {
    lines.push(explainDecisionFull(dp, lang));
  }

  let bestGlide: GlideSegment | null = null;
  for (const g of glides) {
    if (isFinite(g.ratio) && (!bestGlide || g.ratio > bestGlide.ratio)) bestGlide = g;
  }
  if (bestGlide && bestGlide.ratio >= 8) {
    lines.push(
      it
        ? `Buona planata [[${bestGlide.id}]]: ${bestGlide.ratio.toFixed(1)}:1 su ${bestGlide.distanceKm.toFixed(1)} km, efficiente.`
        : en
          ? `Good glide [[${bestGlide.id}]]: ${bestGlide.ratio.toFixed(1)}:1 over ${bestGlide.distanceKm.toFixed(1)} km, efficient.`
          : `Guter Gleitflug [[${bestGlide.id}]]: ${bestGlide.ratio.toFixed(1)}:1 über ${bestGlide.distanceKm.toFixed(1)} km, effizient.`,
    );
  }

  if (lines.length === 0 && thermals.length > 0) {
    lines.push(
      it
        ? 'Hai agganciato e sfruttato le termiche con costanza: buona base.'
        : en
          ? 'You found and worked thermals consistently: a solid base.'
          : 'Du hast Bärte konstant gefunden und genutzt: gute Basis.',
    );
  }
  return lines.length > 0 ? lines.join('\n\n') : null;
}

const FOCUS_TIPS: Record<Lang, Record<string, string>> = {
  it: {
    none: 'Volo pulito, nessun errore evidente. Prossimo passo: spingere di più sulle transizioni e stringere il centraggio per salire più in fretta.',
    early_exit:
      'Resta in termica finché la salita non cala per davvero: esci quando il vario scende sotto la media della giornata, non al primo calo.',
    weak_thermal_persist:
      "Allena la disciplina di mollare le termiche deboli: se dopo 1-2 giri non sale come la media del giorno, vai a cercarne un'altra.",
    sink_line:
      "Quando entri in discendenza prolungata, cambia rotta subito per uscire dalla massa d'aria che scende invece di insistere dritto.",
    low_crossing:
      'Pianifica gli attraversamenti con più margine di quota: parti più alto e tieni sempre un atterrabile a portata.',
  },
  en: {
    none: 'Clean flight, no obvious mistakes. Next step: push harder on transitions and tighten your centering to climb faster.',
    early_exit:
      "Stay in the thermal until the climb really fades: leave when the vario drops below the day's average, not at the first dip.",
    weak_thermal_persist:
      "Train the discipline to drop weak thermals: if after 1-2 turns it isn't climbing like the day's average, go find another.",
    sink_line:
      'When you hit sustained sink, change course immediately to get out of the sinking air instead of pushing straight on.',
    low_crossing:
      'Plan crossings with more height margin: start higher and always keep a landing field within reach.',
  },
  de: {
    none: 'Sauberer Flug, keine offensichtlichen Fehler. Nächster Schritt: bei Übergängen mehr Druck machen und enger zentrieren, um schneller zu steigen.',
    early_exit:
      'Bleib im Bart, bis das Steigen wirklich nachlässt: verlasse ihn, wenn das Vario unter den Tagesschnitt fällt, nicht beim ersten Einbruch.',
    weak_thermal_persist:
      'Übe die Disziplin, schwache Bärte loszulassen: steigt er nach 1-2 Kreisen nicht wie der Tagesschnitt, such einen anderen.',
    sink_line:
      'Bei anhaltendem Sinken sofort den Kurs ändern, um aus der absinkenden Luft zu kommen, statt stur geradeaus zu fliegen.',
    low_crossing:
      'Plane Querungen mit mehr Höhenreserve: starte höher und halte immer ein Landefeld in Reichweite.',
  },
};

/** "La cosa da allenare", scelta dal tipo di errore più ricorrente. */
function buildFocus(decisionPoints: DecisionPoint[], lang: Lang): string {
  const issues = decisionPoints.filter((d) => d.severity === 'warn' || d.severity === 'critical');
  if (issues.length === 0) return FOCUS_TIPS[lang].none;
  const counts = new Map<string, number>();
  for (const d of issues) counts.set(d.type, (counts.get(d.type) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return FOCUS_TIPS[lang][top] ?? FOCUS_TIPS[lang].none;
}

const HEADINGS: Record<Lang, { good: string; key: string; focus: string }> = {
  it: { good: '## Cosa è andato bene', key: '## Decisioni chiave', focus: '## La cosa da allenare' },
  en: { good: '## What went well', key: '## Key decisions', focus: '## What to train' },
  de: { good: '## Was gut lief', key: '## Schlüsselentscheidungen', focus: '## Woran arbeiten' },
};

/** Debriefing completo in markdown leggero con marker [[id]], nella lingua scelta. */
export function buildLocalDebrief(
  track: FlightTrack,
  analysis: FlightAnalysis,
  _weather: WeatherSummary | undefined,
  lang: Lang,
): string {
  const blocks: string[] = [];
  blocks.push(buildFlightStory(track, analysis, lang));

  const good = buildGoodPoints(analysis, lang);
  if (good) blocks.push(HEADINGS[lang].good, good);

  const issues = analysis.decisionPoints
    .filter((d) => d.severity === 'warn' || d.severity === 'critical')
    .slice(0, 5);
  if (issues.length > 0) {
    blocks.push(HEADINGS[lang].key);
    for (const dp of issues) blocks.push(explainDecisionFull(dp, lang));
  }

  blocks.push(HEADINGS[lang].focus, buildFocus(analysis.decisionPoints, lang));

  return blocks.join('\n\n');
}
