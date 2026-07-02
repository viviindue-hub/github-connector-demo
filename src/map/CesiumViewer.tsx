import { useEffect, useRef, useState } from 'react';
import {
  BoundingSphere,
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Color,
  GeometryInstance,
  HeadingPitchRange,
  LabelStyle,
  Math as CesiumMath,
  PolylineColorAppearance,
  PolylineDashMaterialProperty,
  PolylineGeometry,
  Primitive,
  Rectangle,
  Viewer,
  type Entity,
} from 'cesium';
import { useStore } from '../state/store';
import { buildTrackGeometry, indexAtTime, positionAtTime } from './replay';
import { varioColor } from './varioScale';
import { windLayers } from '../lib/analysis/explain';
import { freeRoute } from '../lib/analysis/xc';
import { createImageryLayer, createTerrain } from './providers';
import { VarioLegend } from '../components/VarioLegend';

/** sopra questa velocità di replay la freccia non ha senso: si mostra il punto */
const ARROW_MAX_SPEED = 50;

// Marker a freccia (stile aereo di carta): bianco, così la tinta del billboard
// lo colora per vario; la punta indica la direzione di volo.
const ARROW_SVG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'>" +
      "<path d='M32 4 L55 57 Q32 45 9 57 Z' fill='white' stroke='rgba(0,0,0,0.65)' stroke-width='3.5' stroke-linejoin='round'/>" +
      '</svg>',
  );

// Freccia vento: sottile, soffusa. Tinta cyan tenue dal billboard.color.
const WIND_ARROW_SVG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'>" +
      "<path d='M32 6 L45 32 L35 32 L35 58 L29 58 L29 32 L19 32 Z' fill='white' stroke='rgba(0,40,60,0.5)' stroke-width='2' stroke-linejoin='round'/>" +
      '</svg>',
  );
const WIND_COLOR = new Color(0.62, 0.9, 1.0, 0.72);

export function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const pilotRef = useRef<Entity | null>(null);
  const windArrowsRef = useRef<Entity[]>([]);
  const routeEntitiesRef = useRef<Entity[]>([]);
  const trackPrimitiveRef = useRef<Primitive | null>(null);
  const trackRectRef = useRef<Rectangle | null>(null);
  // valori correnti letti dalle CallbackProperty (evitano re-render React)
  const currentPosRef = useRef<Cartesian3>(new Cartesian3());
  const currentHeadingRef = useRef<number>(0);
  // heading VISUALIZZATO: insegue quello reale con velocità limitata, così la
  // freccia non "sfarfalla" alle alte velocità di replay
  const displayedHeadingRef = useRef<number>(0);
  const currentVarioRef = useRef<number>(0);
  // true quando il viewer Cesium (creazione asincrona) è pronto: serve a
  // rieseguire il setup della traccia anche se il volo era già presente al mount
  const [viewerReady, setViewerReady] = useState(false);

  const series = useStore((s) => s.series);
  const analysis = useStore((s) => s.analysis);
  const flyTo = useStore((s) => s.flyTo);
  const followPilot = useStore((s) => s.followPilot);
  const showWind = useStore((s) => s.showWind);
  const showRoute = useStore((s) => s.showRoute);
  const colorMode = useStore((s) => s.colorMode);

  // creazione viewer (una volta)
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;
    let disposed = false;

    (async () => {
      const [terrainProvider, baseLayer] = await Promise.all([
        createTerrain(),
        createImageryLayer(),
      ]);
      if (disposed || !containerRef.current) return;
      const viewer = new Viewer(containerRef.current, {
        terrainProvider,
        baseLayer,
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
      });
      viewer.scene.globe.depthTestAgainstTerrain = true;
      viewerRef.current = viewer;
      setViewerReady(true);
    })();

    return () => {
      disposed = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
      setViewerReady(false);
    };
  }, []);

  // quando arriva (o cambia) il volo: traccia colorata + marker pilota + inquadratura
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !series) return;
    let cancelled = false;

    const setup = () => {
      if (cancelled || viewer.isDestroyed()) return;
      if (trackPrimitiveRef.current) {
        viewer.scene.primitives.remove(trackPrimitiveRef.current);
        trackPrimitiveRef.current = null;
      }
      if (pilotRef.current) {
        viewer.entities.remove(pilotRef.current);
        pilotRef.current = null;
      }

      const { positions, colors } = buildTrackGeometry(series, colorMode);
      const primitive = new Primitive({
        geometryInstances: new GeometryInstance({
          geometry: new PolylineGeometry({
            positions,
            colors,
            colorsPerVertex: true,
            width: 3.5,
          }),
        }),
        appearance: new PolylineColorAppearance(),
        asynchronous: false,
      });
      viewer.scene.primitives.add(primitive);
      trackPrimitiveRef.current = primitive;

      const t0 = useStore.getState().currentTime;
      const i0 = indexAtTime(series, t0);
      currentPosRef.current = positionAtTime(series, t0);
      currentHeadingRef.current = series.heading[i0];
      displayedHeadingRef.current = series.heading[i0];
      currentVarioRef.current = series.vario[i0];

      // marker pilota: freccia colorata per vario, orientata alla rotta con
      // rotazione SMORZATA (max ~360°/s visivi); alle alte velocità di replay
      // la freccia lascia il posto a un punto pulito (la direzione non ha
      // più senso visivo quando una termica passa in due secondi).
      pilotRef.current = viewer.entities.add({
        position: new CallbackProperty(() => currentPosRef.current, false) as never,
        viewFrom: new Cartesian3(0, -1600, 1000) as never,
        billboard: {
          image: ARROW_SVG,
          width: 34,
          height: 34,
          show: new CallbackProperty(
            () => useStore.getState().speed < ARROW_MAX_SPEED,
            false,
          ) as never,
          color: new CallbackProperty(() => varioColor(currentVarioRef.current, 1), false) as never,
          rotation: new CallbackProperty(() => {
            const v = viewerRef.current;
            const camHeading = v && !v.isDestroyed() ? v.camera.heading : 0;
            // insegue l'heading reale con passo limitato (smorzamento)
            const target = currentHeadingRef.current;
            let cur = displayedHeadingRef.current;
            let dd = ((target - cur + 540) % 360) - 180;
            const step = 6; // gradi/frame ≈ 360°/s a 60 fps
            if (Math.abs(dd) > step) dd = Math.sign(dd) * step;
            cur = (cur + dd + 360) % 360;
            displayedHeadingRef.current = cur;
            return camHeading - CesiumMath.toRadians(cur);
          }, false) as never,
          alignedAxis: Cartesian3.ZERO,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        point: {
          pixelSize: 13,
          color: new CallbackProperty(() => varioColor(currentVarioRef.current, 1), false) as never,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          show: new CallbackProperty(
            () => useStore.getState().speed >= ARROW_MAX_SPEED,
            false,
          ) as never,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });

      // inquadra la traccia
      let west = Infinity;
      let east = -Infinity;
      let south = Infinity;
      let north = -Infinity;
      for (let i = 0; i < series.t.length; i += 10) {
        west = Math.min(west, series.lon[i]);
        east = Math.max(east, series.lon[i]);
        south = Math.min(south, series.lat[i]);
        north = Math.max(north, series.lat[i]);
      }
      const pad = 0.02;
      trackRectRef.current = Rectangle.fromDegrees(west - pad, south - pad, east + pad, north + pad);
      viewer.camera.flyTo({
        destination: trackRectRef.current,
        duration: 1.8,
      });
    };

    setup();
    return () => {
      cancelled = true;
    };
  }, [series, viewerReady, colorMode]);

  // aggiornamento posizione/heading/vario del pilota a ogni tick del clock
  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      if (!state.series) return;
      const i = indexAtTime(state.series, state.currentTime);
      currentPosRef.current = positionAtTime(state.series, state.currentTime);
      currentHeadingRef.current = state.series.heading[i];
      currentVarioRef.current = state.series.vario[i];
    });
    return unsub;
  }, []);

  // "segui": usa il tracked entity di Cesium → la camera segue il pilota ma
  // l'utente può ruotare/zoomare liberamente attorno. Niente lookAt forzato.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    viewer.trackedEntity = followPilot ? pilotRef.current ?? undefined : undefined;
  }, [followPilot, viewerReady, series]);

  // fly-to richiesto da un anchor del coach o dalla lista termiche
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !flyTo) return;
    // con "segui" attivo il pilota è già portato sul punto (currentTime) e la
    // camera lo segue: un fly-to qui verrebbe comunque sovrascritto dal tracking.
    if (useStore.getState().followPilot) return;
    // inquadra il punto CENTRANDOLO (bounding sphere) invece di metterci la camera sopra
    const target = Cartesian3.fromDegrees(flyTo.lon, flyTo.lat, flyTo.alt);
    viewer.camera.flyToBoundingSphere(new BoundingSphere(target, 1200), {
      offset: new HeadingPitchRange(0, CesiumMath.toRadians(-45), 2600),
      duration: 1.5,
    });
  }, [flyTo]);

  // frecce del vento, una per termica (dove il vento è davvero MISURATO dalla
  // deriva): delicate, scalate per intensità, orientate in 3D. Attivabili.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    for (const e of windArrowsRef.current) viewer.entities.remove(e);
    windArrowsRef.current = [];
    if (!analysis || !showWind) return;

    for (const w of windLayers(analysis.thermals)) {
      const downwind = (w.fromDeg + 180) % 360; // dove spinge il vento
      const scale = Math.min(1.5, 0.55 + w.speedKmh / 35);
      const ent = viewer.entities.add({
        position: Cartesian3.fromDegrees(w.lon, w.lat, w.alt),
        billboard: {
          image: WIND_ARROW_SVG,
          width: 30,
          height: 30,
          scale,
          color: WIND_COLOR,
          rotation: new CallbackProperty(() => {
            const v = viewerRef.current;
            const camHeading = v && !v.isDestroyed() ? v.camera.heading : 0;
            return camHeading - CesiumMath.toRadians(downwind);
          }, false) as never,
          alignedAxis: Cartesian3.ZERO,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      windArrowsRef.current.push(ent);
    }
  }, [analysis, viewerReady, showWind]);

  // layer "Settori XC": rotta libera tratteggiata coi punti di virata S1/S2/S3
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    for (const e of routeEntitiesRef.current) viewer.entities.remove(e);
    routeEntitiesRef.current = [];
    if (!series || !showRoute) return;

    const route = freeRoute(series);
    if (route.idxs.length < 2) return;
    const positions = route.idxs.map((i) =>
      Cartesian3.fromDegrees(series.lon[i], series.lat[i], series.alt[i]),
    );
    routeEntitiesRef.current.push(
      viewer.entities.add({
        polyline: {
          positions,
          width: 2.5,
          material: new PolylineDashMaterialProperty({
            color: Color.WHITE.withAlpha(0.7),
            dashLength: 16,
          }),
        },
      }),
    );
    route.idxs.forEach((idx, k) => {
      if (k === 0 || k === route.idxs.length - 1) return; // start/fine ovvi
      routeEntitiesRef.current.push(
        viewer.entities.add({
          position: Cartesian3.fromDegrees(series.lon[idx], series.lat[idx], series.alt[idx]),
          point: {
            pixelSize: 7,
            color: Color.WHITE.withAlpha(0.95),
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: `S${k}`,
            font: `600 13px -apple-system, sans-serif`,
            fillColor: Color.WHITE,
            outlineColor: Color.BLACK,
            outlineWidth: 3,
            style: LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cartesian2(0, -16),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
      );
    });
  }, [series, viewerReady, showRoute]);

  return (
    <div className="cesium-wrap">
      <div ref={containerRef} className="cesium-container" />
      {series && <VarioLegend />}
    </div>
  );
}
