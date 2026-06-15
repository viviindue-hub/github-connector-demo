import { useEffect, useRef, useState } from 'react';
import {
  CallbackProperty,
  Cartesian3,
  GeometryInstance,
  HeadingPitchRange,
  Math as CesiumMath,
  Matrix4,
  PolylineColorAppearance,
  PolylineGeometry,
  Primitive,
  Rectangle,
  Viewer,
  type Entity,
} from 'cesium';
import { useStore } from '../state/store';
import { buildTrackGeometry, indexAtTime, positionAtTime } from './replay';
import { varioColor } from './varioScale';
import { createImageryLayer, createTerrain } from './providers';
import { VarioLegend } from '../components/VarioLegend';

// Silhouette glider (freccia di navigazione) bianca: la tinta del billboard
// la colora per vario, la forma indica la rotta.
const GLIDER_SVG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'>" +
      "<path d='M32 5 L53 54 L32 43 L11 54 Z' fill='white' stroke='rgba(0,0,0,0.6)' stroke-width='3.5' stroke-linejoin='round'/>" +
      '</svg>',
  );

export function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const pilotRef = useRef<Entity | null>(null);
  const trackPrimitiveRef = useRef<Primitive | null>(null);
  // posizione corrente letta dalla CallbackProperty (evita re-render React)
  const currentPosRef = useRef<Cartesian3>(new Cartesian3());
  const currentHeadingRef = useRef<number>(0);
  const currentVarioRef = useRef<number>(0);
  // true quando il viewer Cesium (creazione asincrona) è pronto: serve a
  // rieseguire il setup della traccia anche se il volo era già presente al mount
  const [viewerReady, setViewerReady] = useState(false);

  const series = useStore((s) => s.series);
  const flyTo = useStore((s) => s.flyTo);
  const followPilot = useStore((s) => s.followPilot);

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

  // quando arriva (o cambia) il volo: traccia colorata + entità pilota + inquadratura
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

      const { positions, colors } = buildTrackGeometry(series);
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
      currentPosRef.current = positionAtTime(series, t0);
      const i0 = indexAtTime(series, t0);
      currentHeadingRef.current = series.heading[i0];
      currentVarioRef.current = series.vario[i0];
      pilotRef.current = viewer.entities.add({
        position: new CallbackProperty(() => currentPosRef.current, false) as never,
        billboard: {
          image: GLIDER_SVG,
          width: 32,
          height: 32,
          rotation: new CallbackProperty(
            () => CesiumMath.toRadians(-currentHeadingRef.current),
            false,
          ) as never,
          alignedAxis: Cartesian3.ZERO,
          color: new CallbackProperty(() => varioColor(currentVarioRef.current, 1), false) as never,
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
      viewer.camera.flyTo({
        destination: Rectangle.fromDegrees(west - pad, south - pad, east + pad, north + pad),
        duration: 1.8,
      });
    };

    setup();
    return () => {
      cancelled = true;
    };
  }, [series, viewerReady]);

  // aggiornamento posizione pilota a ogni tick del clock di replay
  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      if (!state.series) return;
      currentPosRef.current = positionAtTime(state.series, state.currentTime);
      const i = indexAtTime(state.series, state.currentTime);
      currentHeadingRef.current = state.series.heading[i];
      currentVarioRef.current = state.series.vario[i];
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed() && state.followPilot && pilotRef.current) {
        viewer.camera.lookAt(
          currentPosRef.current,
          new HeadingPitchRange(viewer.camera.heading, CesiumMath.toRadians(-25), 2500),
        );
      }
    });
    return unsub;
  }, []);

  // fly-to richiesto da un anchor del coach o dalla lista termiche
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !flyTo) return;
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(flyTo.lon, flyTo.lat, flyTo.alt + 1800),
      orientation: { heading: 0, pitch: CesiumMath.toRadians(-45), roll: 0 },
      duration: 1.5,
    });
  }, [flyTo]);

  // sgancia la camera quando follow viene disattivato
  useEffect(() => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed() && !followPilot) {
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    }
  }, [followPilot]);

  return (
    <div className="cesium-wrap">
      <div ref={containerRef} className="cesium-container" />
      {series && <VarioLegend />}
    </div>
  );
}
