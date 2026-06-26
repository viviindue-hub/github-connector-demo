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
        ? `Hai lasciato la termica ${d.thermal} a ${dp.alt} m mentre saliva ancora a +${num(d.climbAtExit)} m/s ${m}; nei 30 minuti dopo la quota massima è stata ${num(d.laterMaxAlt)} m. Regola pratica: lascia una termica quando il rateo cala sotto la media del giorno, non mentre tira ancora — qui sei ripartito più in basso e hai dovuto rifare quota.`
        : en
          ? `You left thermal ${d.thermal} at ${dp.alt} m while it was still climbing +${num(d.climbAtExit)} m/s ${m}; over the next 30 minutes your max altitude was ${num(d.laterMaxAlt)} m. Rule of thumb: leave a thermal when the climb drops below the day's average, not while it's still working — here you set off lower and had to re-climb.`
          : `Du hast den Bart ${d.thermal} bei ${dp.alt} m verlassen, obwohl er noch mit +${num(d.climbAtExit)} m/s stieg ${m}; in den nächsten 30 Minuten lag deine Maximalhöhe bei ${num(d.laterMaxAlt)} m. Faustregel: verlasse einen Bart, wenn das Steigen unter den Tagesschnitt fällt, nicht solange er noch trägt — hier bist du tiefer losgeflogen und musstest wieder aufdrehen.`;
    case 'weak_thermal_persist':
      return it
        ? `Sei rimasto ${num(d.minutes)} minuti nella termica ${d.thermal} a soli ${num(d.avgClimb)} m/s ${m}, con la mediana del giorno a ${num(d.dayMedian)} m/s. Se avevi quota e alternative, conveniva scartarla e ripartire a cercarne una più forte: insistere su una termica debole in una buona giornata è il modo più comune di perdere tempo e chilometri.`
        : en
          ? `You stayed ${num(d.minutes)} minutes in thermal ${d.thermal} at just ${num(d.avgClimb)} m/s ${m}, with the day's median at ${num(d.dayMedian)} m/s. If you had height and options, it paid to drop it and look for a stronger core: grinding a weak thermal on a good day is the most common way to lose time and kilometres.`
          : `Du bist ${num(d.minutes)} Minuten im Bart ${d.thermal} bei nur ${num(d.avgClimb)} m/s geblieben ${m}, bei einem Tagesmedian von ${num(d.dayMedian)} m/s. Mit Höhe und Alternativen lohnt es sich, ihn fallen zu lassen und einen stärkeren Kern zu suchen: an einem guten Tag an einem schwachen Bart zu kleben kostet am meisten Zeit und Kilometer.`;
    case 'low_save':
      return it
        ? `Bel recupero ${m}: da ${num(d.aglAtLow)} m dal suolo hai rimontato ${num(d.regained)} m. Tienitelo come merito — ma il vero guadagno è capire cosa ti ha portato così in basso, per non rigiocartela alla cieca la prossima volta.`
        : en
          ? `Nice save ${m}: from ${num(d.aglAtLow)} m AGL you climbed back ${num(d.regained)} m. Take the credit — but the real lesson is understanding what got you that low, so you don't gamble on it next time.`
          : `Schöner Save ${m}: aus ${num(d.aglAtLow)} m über Grund bist du ${num(d.regained)} m zurückgestiegen. Nimm das Lob mit — der eigentliche Gewinn ist zu verstehen, was dich so tief gebracht hat, um es nicht erneut aufs Spiel zu setzen.`;
    case 'sink_line':
      return it
        ? `Hai attraversato una linea di discendenza ${m} (${num(d.sustainedSinkS)}s sotto −2 m/s). In aria che scende così conviene accelerare per uscirne prima e cambiare linea — spesso basta spostarsi sul lato sopravento o verso il rilievo — invece di insistere lento e dritto, che è il modo peggiore di perdere quota.`
        : en
          ? `You crossed a sink line ${m} (${num(d.sustainedSinkS)}s below −2 m/s). In air that's going down like this, speed up to get through it faster and change your line — often just shift to the windward side or toward the terrain — rather than pushing slow and straight, which is the worst way to bleed altitude.`
          : `Du bist durch eine Abwindlinie geflogen ${m} (${num(d.sustainedSinkS)}s unter −2 m/s). In so absinkender Luft beschleunigen, um schneller hindurchzukommen, und die Linie wechseln — oft reicht die Luv-Seite oder Richtung Hang — statt langsam und stur geradeaus, was am meisten Höhe kostet.`;
    case 'low_crossing':
      if (d.endedFlight === 'yes')
        return it
          ? `Attraversamento basso a ${num(d.minAgl)} m dal suolo ${m}: qui è finito il volo. Negli attraversamenti parti più alto e tieni sempre un atterrabile e una via di fuga: il margine di quota è ciò che ti dà altre chance per riagganciare.`
          : en
            ? `Low crossing at ${num(d.minAgl)} m AGL ${m}: the flight ended here. On crossings start higher and always keep a landing field and an escape line: height margin is what buys you more chances to climb again.`
            : `Tiefe Querung bei ${num(d.minAgl)} m über Grund ${m}: hier endete der Flug. Bei Querungen höher einsteigen und immer ein Landefeld plus Fluchtweg behalten: die Höhenreserve verschafft dir weitere Chancen zum Wiederaufdrehen.`;
      return it
        ? `Sei sceso a soli ${num(d.minAgl)} m dal suolo ${m}. Più margine in attraversamento significa più opzioni se non agganci: meglio deviare verso una linea più sicura che tirare dritto e basso.`
        : en
          ? `You got down to just ${num(d.minAgl)} m AGL ${m}. More margin on a crossing means more options if you don't connect: better to divert to a safer line than to push on straight and low.`
          : `Du bist auf nur ${num(d.minAgl)} m über Grund gesunken ${m}. Mehr Reserve bei einer Querung bedeutet mehr Optionen, falls du nicht ankoppelst: lieber auf eine sicherere Linie ausweichen als tief und stur geradeaus.`;
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
