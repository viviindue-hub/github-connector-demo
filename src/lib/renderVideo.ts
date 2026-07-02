import {
  BoundingSphere,
  CallbackProperty,
  Cartesian3,
  Color,
  GeometryInstance,
  HeadingPitchRange,
  Math as CesiumMath,
  PolylineColorAppearance,
  PolylineGeometry,
  Primitive,
  Viewer,
} from 'cesium';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { DerivedSeries, FlightAnalysis, FlightTrack } from './types';
import { buildTrackGeometry, positionAtTime } from '../map/replay';
import { createImageryLayer, createTerrain } from '../map/providers';
import { buildStoryboard, type Scene } from './cinema';
import { bearing } from './geo';
import { freeDistanceKm, xcSpeedKmh } from './analysis/xc';

/**
 * Genera il video social IN BACKGROUND: un secondo viewer Cesium nascosto
 * renderizza lo storyboard fotogramma per fotogramma a 1080×1920 nativo
 * (formato Reels), e WebCodecs codifica in H.264/mp4. L'utente non guarda
 * nessuna registrazione: preme "genera", vede la percentuale, riceve il file.
 */

const W = 1080;
const H = 1920;
const FPS = 30;
const FONT = "-apple-system, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif";

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

/** aspetta che il terreno/imagery della vista corrente sia caricato (con timeout) */
async function waitTiles(viewer: Viewer, maxMs: number): Promise<void> {
  const start = performance.now();
  while (performance.now() - start < maxMs) {
    viewer.scene.render();
    if (viewer.scene.globe.tilesLoaded) return;
    await new Promise((r) => setTimeout(r, 60));
  }
}

interface FramePlan {
  flightT: number;
  camera: { target: Cartesian3; heading: number; pitch: number; range: number };
}

/** costruisce il piano di camera per un fotogramma dello storyboard */
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
  for (const sc of scenes) {
    if (videoT <= acc + sc.durS || sc === scenes[scenes.length - 1]) {
      const p = Math.min(1, Math.max(0, (videoT - acc) / sc.durS));
      if (sc.kind === 'overview') {
        const isIntro = acc === 0;
        // intro: lenta spinta in avanti; finale: lento allontanamento
        const range = isIntro ? baseRange * (1.18 - 0.18 * p) : baseRange * (0.94 + 0.3 * p);
        return {
          flightT: isIntro ? t0 : t1,
          camera: {
            target: sphere.center,
            heading: 0,
            pitch: CesiumMath.toRadians(-42),
            range,
          },
        };
      }
      const s = sc.startT ?? t0;
      const e = sc.endT ?? t1;
      const flightT = s + p * (e - s);
      // camera stabile lungo la direzione della tratta: il pilota attraversa
      // l'inquadratura invece di farla ruotare (meno nausea, più cinema)
      const ia = Math.round((s - t0) / 1000);
      const ib = Math.min(series.t.length - 1, Math.round((e - t0) / 1000));
      const legHeading = bearing(series.lat[ia], series.lon[ia], series.lat[ib], series.lon[ib]);
      return {
        flightT,
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
  return {
    flightT: t1,
    camera: { target: sphere.center, heading: 0, pitch: CesiumMath.toRadians(-42), range: baseRange },
  };
}

export async function generateFlightVideo(
  series: DerivedSeries,
  analysis: FlightAnalysis,
  track: FlightTrack,
  onProgress: (pct: number) => void,
): Promise<Blob> {
  if (!isGenerateSupported()) throw new Error('unsupported');
  const codec = await pickCodec();
  if (!codec) throw new Error('unsupported');

  // --- viewer nascosto a risoluzione nativa Reels ---
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
    // canvas esattamente 1080×1920, indipendente dal devicePixelRatio
    viewer.resolutionScale = 1 / (window.devicePixelRatio || 1);
    viewer.scene.globe.depthTestAgainstTerrain = true;

    // traccia colorata per vario (la firma visiva) + pilota
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
      point: {
        pixelSize: 16,
        color: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    const sphere = BoundingSphere.fromPoints(positions);
    const scenes = buildStoryboard(series, analysis);
    const totalS = scenes.reduce((a, s) => a + s.durS, 0);
    const frames = Math.round(totalS * FPS);

    // overlay (statico: lo disegniamo su ogni frame composto)
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

    // --- encoder ---
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

    let sceneIdx = -1;
    let acc = 0;
    const sceneStarts: number[] = [];
    for (const sc of scenes) {
      sceneStarts.push(acc);
      acc += sc.durS;
    }

    for (let f = 0; f < frames; f++) {
      if (encError) throw encError;
      const videoT = f / FPS;
      const plan = planFrame(scenes, videoT, series, sphere);
      pilotPos.current = plan.flightT
        ? positionAtTime(series, plan.flightT)
        : pilotPos.current;
      viewer.camera.lookAt(
        plan.camera.target,
        new HeadingPitchRange(plan.camera.heading, plan.camera.pitch, plan.camera.range),
      );

      // a inizio scena aspetta i tile (inquadratura nuova = terreno da caricare)
      const ns = sceneStarts.findIndex((s) => Math.abs(s - videoT) < 1 / FPS / 2);
      if (ns !== -1 && ns !== sceneIdx) {
        sceneIdx = ns;
        await waitTiles(viewer, ns === 0 ? 5000 : 2600);
      }
      viewer.scene.render();

      // componi: frame cesium + overlay
      ctx.drawImage(viewer.scene.canvas, 0, 0, W, H);
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
      ctx.fillStyle = '#e8b33c';
      ctx.font = `600 60px ${FONT}`;
      ctx.fillText(stats, 60, H - 100);

      const frame = new VideoFrame(compose, {
        timestamp: Math.round((f * 1_000_000) / FPS),
        duration: Math.round(1_000_000 / FPS),
      });
      encoder.encode(frame, { keyFrame: f % 150 === 0 });
      frame.close();

      onProgress(f / frames);
      // respiro al main thread (UI viva, rete tile in progresso)
      if (f % 3 === 0) await new Promise((r) => setTimeout(r, 0));
      // non far crescere la coda dell'encoder senza limiti
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
