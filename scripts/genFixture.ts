/**
 * Genera test/fixtures/synthetic-xc.igc: un volo XC realistico di ~2h30
 * (decollo, termiche con deriva da vento NE, planate, una riagganciata
 * bassa, una linea di discendenza, atterraggio).
 *
 * Uso: npx vite-node scripts/genFixture.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { glide, startFlight, thermal, toIgc } from '../test/synthIgc';

const s = startFlight(46.02, 11.05, 1450); // decollo stile Prealpi

// salita iniziale sopra il decollo
glide(s, 90, 9, -1.0, 140);
thermal(s, 360, 1.8, 55, 2.5, 225); // deriva da NE
thermal(s, 80, 0.3, 60, 2.5, 225); // decadimento in cima

// prima transizione
glide(s, 420, 11, -1.2, 100);
thermal(s, 300, 2.2, 60, 3, 225);
thermal(s, 70, 0.2, 60, 3, 225);

// linea di discendenza sbagliata
glide(s, 150, 12, -2.6, 95);
glide(s, 240, 10, -1.1, 90);

// termica debole su cui si insiste (errore classico)
thermal(s, 260, 0.35, 70, 2, 225);

// si scende bassi e si riaggancia (low save)
glide(s, 300, 10, -1.8, 85);
thermal(s, 420, 1.6, 55, 2.5, 225);
thermal(s, 60, 0.25, 60, 2.5, 225);

// altra transizione e termica lasciata presto
glide(s, 360, 11, -1.1, 110);
thermal(s, 150, 2.0, 60, 3, 225); // lasciata mentre tira ancora
glide(s, 200, 10, -1.0, 105);
thermal(s, 380, 2.0, 60, 3, 225);
thermal(s, 80, 0.2, 60, 3, 225);

// finale e atterraggio
glide(s, 600, 10, -1.3, 120);
glide(s, 120, 6, -2.0, 120);

mkdirSync('test/fixtures', { recursive: true });
writeFileSync('test/fixtures/synthetic-xc.igc', toIgc(s, '2026-05-17', '09:45:00'));
console.log(`Scritto test/fixtures/synthetic-xc.igc (${s.fixes.length} fix, ${Math.round(s.sec / 60)} min)`);
