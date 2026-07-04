import {
  BoundingSphere,
  CallbackProperty,
  Cartesian3,
  GeometryInstance,
  HeadingPitchRange,
  Math as CesiumMath,
  PolylineColorAppearance,
  PolylineGeometry,
  Primitive,
  VerticalOrigin,
  Viewer,
} from 'cesium';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { DerivedSeries, FlightAnalysis, FlightTrack } from './types';
import { buildTrackGeometry, indexAtTime, positionAtTime } from '../map/replay';
import { createImageryLayer, createTerrain } from '../map/providers';
import { buildStoryboard, type Scene, type SceneTag } from './cinema';
import { bearing } from './geo';
import { freeDistanceKm, xcSpeedKmh } from './analysis/xc';

/**
 * Genera il video social IN BACKGROUND: un secondo viewer Cesium nascosto
 * renderizza lo storyboard fotogramma per fotogramma a 1080×1920 nativo
 * (formato Reels) e WebCodecs codifica in H.264/mp4. Fasi: pre-caricamento
 * del terreno per ogni scena (niente tile sfocati) → rendering. IMPORTANTE:
 * si usa viewer.render() (non scene.render()) perché è quello che aggiorna
 * le entità — senza, il puntino del pilota non viene disegnato.
 */

const W = 1080;
const H = 1920;
const FPS = 30;
const FONT = "-apple-system, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif";
/** quota di progresso riservata al pre-caricamento del terreno */
const PREWARM_SHARE = 0.15;

// Silhouette parapendio (vela vista da dietro + fasci + pilota): il marker
// del video. Ancorata in basso (il pilota sta sul punto della traccia).
const PARAGLIDER_SVG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'>" +
      "<path d='M8 30 Q48 2 88 30 Q78 42 48 38 Q18 42 8 30 Z' fill='#e8b33c' stroke='rgba(0,0,0,0.7)' stroke-width='3' stroke-linejoin='round'/>" +
      "<path d='M14 33 L46 76 M30 38 L47 76 M66 38 L49 76 M82 33 L50 76' stroke='rgba(255,255,255,0.9)' stroke-width='2' fill='none'/>" +
      "<circle cx='48' cy='82' r='7' fill='white' stroke='rgba(0,0,0,0.7)' stroke-width='3'/>" +
      '</svg>',
  );

export interface VideoOptions {
  /** dati live in sovraimpressione (quota, vario, velocità) */
  hud: boolean;
  /** didascalia del momento ("Termica migliore · +3.4 m/s") */
  captions: boolean;
  /** riga statistiche nel finale */
  stats: boolean;
  /** etichette tradotte per i tag scena */
  sceneLabels: Record<SceneTag, string>;
}

export function isGenerateSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

async function pickCodec(): Promise<string | null> {
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.420028']) {
    try {
      const res = await VideoEncoder.isConfigSupported({
        codec,
        width: W,
        height: H,
        bitrate: 10_000_000,
        framerate: FPS,
      });
      if (res.supported) return codec;
    } catch {
      /* prova il prossimo */
    }
  }
  return null;
}

async function waitTiles(viewer: Viewer, maxMs: number): Promise<void> {
  const start = performance.now();
  while (performance.now() - start < maxMs) {
    viewer.render();
    if (viewer.scene.globe.tilesLoaded) return;
    await new Promise((r) => setTimeout(r, 60));
  }
}

interface FramePlan {
  flightT: number;
  scene: Scene;
  sceneIdx: number;
  camera: { target: Cartesian3; heading: number; pitch: number; range: number };
}

function planFrame(
  scenes: Scene[],
  videoT: number,
  series: DerivedSeries,
  sphere: BoundingSphere,
): FramePlan {
  const t0 = series.t[0];
  const t1 = series.t[series.t.length - 1];
  const baseRange = Math.max(4000, sphere.radius * 2.6);
  let acc = 0;
  for (let si = 0; si < scenes.length; si++) {
    const sc = scenes[si];
    if (videoT <= acc + sc.durS || si === scenes.length - 1) {
      const p = Math.min(1, Math.max(0, (videoT - acc) / sc.durS));
      if (sc.kind === 'overview') {
        const isIntro = si === 0;
        const range = isIntro ? baseRange * (1.18 - 0.18 * p) : baseRange * (0.94 + 0.3 * p);
        return {
          flightT: isIntro ? t0 : t1,
          scene: sc,
          sceneIdx: si,
          camera: { target: sphere.center, heading: 0, pitch: CesiumMath.toRadians(-42), range },
        };
      }
      const s = sc.startT ?? t0;
      const e = sc.endT ?? t1;
      const flightT = s + p * (e - s);
      const ia = Math.max(0, Math.round((s - t0) / 1000));
      const ib = Math.min(series.t.length - 1, Math.round((e - t0) / 1000));
      const legHeading = bearing(series.lat[ia], series.lon[ia], series.lat[ib], series.lon[ib]);
      return {
        flightT,
        scene: sc,
        sceneIdx: si,
        camera: {
          target: positionAtTime(series, flightT),
          heading: CesiumMath.toRadians(legHeading),
          pitch: CesiumMath.toRadians(-26),
          range: 2600,
        },
      };
    }
    acc += sc.durS;
  }
  const last = scenes[scenes.length - 1];
  return {
    flightT: t1,
    scene: last,
    sceneIdx: scenes.length - 1,
    camera: { target: sphere.center, heading: 0, pitch: CesiumMath.toRadians(-42), range: baseRange },
  };
}

/** pill di testo centrata con sfondo scuro semitrasparente */
function drawPill(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, font: string) {
  ctx.font = font;
  const w = ctx.measureText(text).width;
  const padX = 28;
  const h = 72;
  ctx.fillStyle = 'rgba(10,13,18,0.55)';
  ctx.beginPath();
  ctx.roundRect(cx - w / 2 - padX, y - h / 2, w + padX * 2, h, 20);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, y + 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

export async function generateFlightVideo(
  series: DerivedSeries,
  analysis: FlightAnalysis,
  track: FlightTrack,
  opts: VideoOptions,
  onProgress: (pct: number) => void,
): Promise<Blob> {
  if (!isGenerateSupported()) throw new Error('unsupported');
  const codec = await pickCodec();
  if (!codec) throw new Error('unsupported');

  const holder = document.createElement('div');
  holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${W}px;height:${H}px;`;
  document.body.appendChild(holder);

  const [terrainProvider, baseLayer] = await Promise.all([createTerrain(), createImageryLayer()]);
  const viewer = new Viewer(holder, {
    terrainProvider,
    baseLayer,
    contextOptions: { webgl: { preserveDrawingBuffer: true } },
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    selectionIndicator: false,
    infoBox: false,
    useDefaultRenderLoop: false,
  });

  try {
    viewer.resolutionScale = 1 / (window.devicePixelRatio || 1);
    viewer.scene.globe.depthTestAgainstTerrain = true;
    // tile più nitidi + antialiasing (dove supportato)
    viewer.scene.globe.maximumScreenSpaceError = 1.6;
    try {
      viewer.scene.msaaSamples = 4;
    } catch {
      /* webgl1: pazienza */
    }

    const { positions, colors } = buildTrackGeometry(series, 'vario');
    viewer.scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({
          geometry: new PolylineGeometry({ positions, colors, colorsPerVertex: true, width: 4 }),
        }),
        appearance: new PolylineColorAppearance(),
        asynchronous: false,
      }),
    );
    const pilotPos = { current: positionAtTime(series, series.t[0]) };
    viewer.entities.add({
      position: new CallbackProperty(() => pilotPos.current, false) as never,
      billboard: {
        image: PARAGLIDER_SVG,
        width: 72,
        height: 72,
        verticalOrigin: VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    const sphere = BoundingSphere.fromPoints(positions);
    const scenes = buildStoryboard(series, analysis);
    const totalS = scenes.reduce((a, s) => a + s.durS, 0);
    const frames = Math.round(totalS * FPS);
    const sceneStarts: number[] = [];
    {
      let acc = 0;
      for (const sc of scenes) {
        sceneStarts.push(acc);
        acc += sc.durS;
      }
    }

    // --- FASE 1: pre-caricamento del terreno per ogni inquadratura ---
    for (let si = 0; si < scenes.length; si++) {
      const sc = scenes[si];
      const probes = sc.kind === 'follow' ? [0, 0.5, 0.98] : [0, 0.98];
      for (const p of probes) {
        const plan = planFrame(scenes, sceneStarts[si] + p * sc.durS, series, sphere);
        pilotPos.current = positionAtTime(series, plan.flightT);
        viewer.camera.lookAt(
          plan.camera.target,
          new HeadingPitchRange(plan.camera.heading, plan.camera.pitch, plan.camera.range),
        );
        await waitTiles(viewer, si === 0 && p === 0 ? 9000 : 4500);
      }
      onProgress(PREWARM_SHARE * ((si + 1) / scenes.length));
    }

    // --- overlay statico ---
    const km = freeDistanceKm(series);
    const spd = xcSpeedKmh(km, analysis.totals.durationMin);
    const title = track.site ?? 'Flight';
    const sub = track.date;
    const stats = `${km.toFixed(0)} km · ${spd.toFixed(0)} km/h · ↑${analysis.totals.maxAltM} m`;

    const compose = document.createElement('canvas');
    compose.width = W;
    compose.height = H;
    const ctx = compose.getContext('2d');
    if (!ctx) throw new Error('no 2d context');

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width: W, height: H },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
    let encError: unknown = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        encError = e;
      },
    });
    encoder.configure({ codec, width: W, height: H, bitrate: 10_000_000, framerate: FPS });

    // --- FASE 2: rendering fotogramma per fotogramma ---
    let lastScene = -1;
    for (let f = 0; f < frames; f++) {
      if (encError) throw encError;
      const videoT = f / FPS;
      const plan = planFrame(scenes, videoT, series, sphere);
      pilotPos.current = positionAtTime(series, plan.flightT);
      viewer.camera.lookAt(
        plan.camera.target,
        new HeadingPitchRange(plan.camera.heading, plan.camera.pitch, plan.camera.range),
      );
      if (plan.sceneIdx !== lastScene) {
        lastScene = plan.sceneIdx;
        await waitTiles(viewer, 1800); // rifinitura: il grosso è pre-caricato
      }
      viewer.render();

      ctx.drawImage(viewer.scene.canvas, 0, 0, W, H);

      // HUD dati live (solo negli highlight)
      if (opts.hud && plan.scene.kind === 'follow') {
        const i = indexAtTime(series, plan.flightT);
        const alt = Math.round(series.alt[i]);
        const vario = series.vario[i];
        const kmh = Math.round(series.groundSpeed[i] * 3.6);
        ctx.fillStyle = 'rgba(10,13,18,0.55)';
        ctx.beginPath();
        ctx.roundRect(48, 140, 400, 250, 24);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 66px ${FONT}`;
        ctx.fillText(`${alt} m`, 80, 226);
        ctx.fillStyle = vario > 0.2 ? '#6fd152' : vario < -0.2 ? '#e8615a' : '#ffffff';
        ctx.font = `700 56px ${FONT}`;
        ctx.fillText(`${vario >= 0 ? '+' : ''}${vario.toFixed(1)} m/s`, 80, 300);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = `600 48px ${FONT}`;
        ctx.fillText(`${kmh} km/h`, 80, 364);
      }

      // didascalia del momento
      if (opts.captions && plan.scene.kind === 'follow' && plan.scene.tag) {
        const label = opts.sceneLabels[plan.scene.tag];
        const text = plan.scene.metric ? `${label} · ${plan.scene.metric}` : label;
        drawPill(ctx, text, W / 2, 88, `600 46px ${FONT}`);
      }

      // fascia bassa: brand + titolo (+ statistiche se richieste)
      const g = ctx.createLinearGradient(0, H - 560, 0, H);
      g.addColorStop(0, 'rgba(10,13,18,0)');
      g.addColorStop(1, 'rgba(10,13,18,0.9)');
      ctx.fillStyle = g;
      ctx.fillRect(0, H - 560, W, 560);
      ctx.fillStyle = '#e8b33c';
      ctx.font = `700 44px ${FONT}`;
      ctx.fillText('SkyCoach', 60, H - 392);
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 78px ${FONT}`;
      ctx.fillText(title, 60, H - 294);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `400 48px ${FONT}`;
      ctx.fillText(sub, 60, H - 212);
      if (opts.stats) {
        ctx.fillStyle = '#e8b33c';
        ctx.font = `600 60px ${FONT}`;
        ctx.fillText(stats, 60, H - 100);
      }

      const frame = new VideoFrame(compose, {
        timestamp: Math.round((f * 1_000_000) / FPS),
        duration: Math.round(1_000_000 / FPS),
      });
      encoder.encode(frame, { keyFrame: f % 150 === 0 });
      frame.close();

      onProgress(PREWARM_SHARE + (1 - PREWARM_SHARE) * (f / frames));
      if (f % 3 === 0) await new Promise((r) => setTimeout(r, 0));
      while (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 10));
    }

    await encoder.flush();
    muxer.finalize();
    onProgress(1);
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
  } finally {
    viewer.destroy();
    holder.remove();
  }
}
