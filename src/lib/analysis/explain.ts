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
      // OGGETTIVO: solo i fatti + nota neutra. Lasciare con quota sufficiente
      // per la transizione è una scelta legittima — niente "dovevi girare".
      return it
        ? `Uscita da ${d.thermal} a ${dp.alt} m con ancora +${num(d.climbAtExit)} m/s ${m}; nei 30 minuti successivi la quota massima è stata ${num(d.laterMaxAlt)} m. Se avevi la quota per la linea successiva, è una scelta legittima; da rivedere solo se sei poi ripartito più in basso cercando salita.`
        : en
          ? `Left ${d.thermal} at ${dp.alt} m with +${num(d.climbAtExit)} m/s still showing ${m}; over the next 30 minutes your max altitude was ${num(d.laterMaxAlt)} m. If you had the height for the next leg this is a fair call; worth a look only if you then set off lower hunting for lift.`
          : `${d.thermal} bei ${dp.alt} m mit noch +${num(d.climbAtExit)} m/s verlassen ${m}; in den nächsten 30 Minuten lag die Maximalhöhe bei ${num(d.laterMaxAlt)} m. Hattest du die Höhe für den nächsten Schenkel, ist das legitim; nur prüfenswert, falls du danach tiefer auf Suche gegangen bist.`;
    case 'weak_thermal_persist':
      return it
        ? `${num(d.minutes)} min in ${d.thermal} a ${num(d.avgClimb)} m/s ${m}; mediana di salita del giorno ${num(d.dayMedian)} m/s. Dato: era tra le salite più deboli del volo. Utile sapere se in quel momento avevi alternative migliori a portata di planata.`
        : en
          ? `${num(d.minutes)} min in ${d.thermal} at ${num(d.avgClimb)} m/s ${m}; the day's median climb was ${num(d.dayMedian)} m/s. Fact: this was among your weakest climbs. Worth knowing whether you had a better option within glide at that moment.`
          : `${num(d.minutes)} min in ${d.thermal} bei ${num(d.avgClimb)} m/s ${m}; Tagesmedian ${num(d.dayMedian)} m/s. Fakt: einer deiner schwächsten Steigwerte. Relevant ist, ob du damals eine bessere Option in Gleitweite hattest.`;
    case 'low_save':
      return it
        ? `Recupero da ${num(d.aglAtLow)} m dal suolo, +${num(d.regained)} m guadagnati ${m}. Oggettivamente un aggancio difficile: buon dato di gestione delle quote basse.`
        : en
          ? `Save from ${num(d.aglAtLow)} m AGL, +${num(d.regained)} m regained ${m}. Objectively a hard connection: a solid low-altitude management data point.`
          : `Save aus ${num(d.aglAtLow)} m über Grund, +${num(d.regained)} m zurück ${m}. Objektiv ein schwieriger Anschluss: ein guter Wert fürs Tiefenmanagement.`;
    case 'sink_line':
      return it
        ? `Tratto con aria in discesa ${m}: ${num(d.sustainedSinkS)}s sotto −2 m/s. Dato di fatto sulla perdita di quota su quella linea. (Principio: in aria che scende, più velocità riduce il tempo di permanenza.)`
        : en
          ? `Sinking-air stretch ${m}: ${num(d.sustainedSinkS)}s below −2 m/s. A factual marker of the height lost on that line. (Principle: in sinking air, more speed cuts the time spent in it.)`
          : `Abwind-Abschnitt ${m}: ${num(d.sustainedSinkS)}s unter −2 m/s. Sachlicher Marker für den Höhenverlust auf dieser Linie. (Prinzip: in absinkender Luft verkürzt mehr Speed die Verweildauer.)`;
    case 'low_crossing':
      if (d.endedFlight === 'yes')
        return it
          ? `Quota minima ${num(d.minAgl)} m dal suolo ${m}: qui è finito il volo. Dato di sicurezza, non un giudizio: margine ridotto = meno opzioni in attraversamento.`
          : en
            ? `Minimum height ${num(d.minAgl)} m AGL ${m}: the flight ended here. A safety data point, not a verdict: low margin = fewer options on a crossing.`
            : `Minimalhöhe ${num(d.minAgl)} m über Grund ${m}: hier endete der Flug. Ein Sicherheits-Datenpunkt, kein Urteil: wenig Reserve = weniger Optionen bei der Querung.`;
      return it
        ? `Quota minima ${num(d.minAgl)} m dal suolo in attraversamento ${m}. Nota di sicurezza (non un giudizio): più basso il margine, meno opzioni se non agganci.`
        : en
          ? `Minimum height ${num(d.minAgl)} m AGL on a crossing ${m}. Safety note (not a verdict): the lower the margin, the fewer options if you don't connect.`
          : `Minimalhöhe ${num(d.minAgl)} m über Grund bei einer Querung ${m}. Sicherheitshinweis (kein Urteil): je weniger Reserve, desto weniger Optionen ohne Anschluss.`;
  }
}

export interface WindLayer {
  id: string;
  /** quota media della termica (m) */
  alt: number;
  /** provenienza meteorologica del vento (°, "da") */
  fromDeg: number;
  speedKmh: number;
  /** epoch ms (inizio termica) */
  t: number;
  lat: number;
  lon: number;
}

/**
 * Profilo del vento per quota, MISURATO dalla deriva reale delle termiche del
 * volo: ogni termica dà il vento alla sua quota e alla sua ora. È il dato che le
 * previsioni non danno per strati. Ordinato dalla quota più alta alla più bassa.
 */
export function windLayers(thermals: ThermalSegment[], minSpeedMs = 0.3): WindLayer[] {
  return thermals
    .filter((th) => th.drift.speedMs >= minSpeedMs)
    .map((th) => ({
      id: th.id,
      alt: Math.round((th.entryAlt + th.exitAlt) / 2),
      // drift = direzione VERSO cui spinge (sottovento); la provenienza è +180°
      fromDeg: Math.round((th.drift.dirDeg + 180) % 360) % 360,
      speedKmh: Math.round(th.drift.speedMs * 3.6),
      t: th.startT,
      lat: th.lat,
      lon: th.lon,
    }))
    .sort((a, b) => b.alt - a.alt);
}

function bestThermal(thermals: ThermalSegment[]): ThermalSegment | null {
  if (thermals.length === 0) return null;
  return thermals.reduce((a, b) => (b.best30s > a.best30s ? b : a));
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
    // NB: niente giudizio sul raggio (stretto/largo): il raggio "giusto"
    // dipende dalle condizioni — termiche più strette in primavera/estate con
    // forte gradiente, più larghe in autunno/inverno. Riportiamo solo il dato.
    const head = it
      ? `Hai sfruttato ${thermals.length} termiche${bestTxt}. Raggio medio di virata ${avgRadius} m.`
      : en
        ? `You used ${thermals.length} thermals${bestTxt}. Average turn radius ${avgRadius} m.`
        : `Du hast ${thermals.length} Bärte genutzt${bestTxt}. Mittlerer Kreisradius ${avgRadius} m.`;
    parts.push(head);
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
    // la deriva indica la direzione VERSO cui va il vento (sottovento):
    // la provenienza meteorologica ("vento da") è opposta, +180°.
    const dir = compass((wind.dirDeg + 180) % 360, lang);
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
      "In discendenza prolungata accelera per attraversarla prima e cambia linea (lato sopravento o verso il rilievo): non insistere lento e dritto nell'aria che scende.",
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
      'In sustained sink, speed up to cross it sooner and change your line (windward side or toward terrain): never push slow and straight through sinking air.',
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
      'Bei anhaltendem Sinken beschleunigen, um schneller durchzukommen, und die Linie wechseln (Luv-Seite oder Richtung Hang): nie langsam und stur durch absinkende Luft.',
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
