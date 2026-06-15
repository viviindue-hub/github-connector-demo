import { useEffect, useRef, useState } from 'react';
import {
  ArcType,
  BoundingSphere,
  CallbackProperty,
  Cartesian3,
  Color,
  GeometryInstance,
  HeadingPitchRange,
  Math as CesiumMath,
  PolylineArrowMaterialProperty,
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
import { destination } from '../lib/geo';

/** Punto ~140 m davanti al pilota nella direzione di volo (per la freccia 3D). */
function aheadPosition(lat: number, lon: number, alt: number, headingDeg: number): Cartesian3 {
  const p = destination(lat, lon, headingDeg, 140);
  return Cartesian3.fromDegrees(p.lon, p.lat, alt);
}

export function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const pilotRef = useRef<Entity | null>(null);
  const headingRef = useRef<Entity | null>(null);
  const trackPrimitiveRef = useRef<Primitive | null>(null);
  // posizione corrente letta dalla CallbackProperty (evita re-render React)
  const currentPosRef = useRef<Cartesian3>(new Cartesian3());
  const aheadPosRef = useRef<Cartesian3>(new Cartesian3());
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
      if (headingRef.current) {
        viewer.entities.remove(headingRef.current);
        headingRef.current = null;
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
      const i0 = indexAtTime(series, t0);
      currentPosRef.current = positionAtTime(series, t0);
      currentVarioRef.current = series.vario[i0];
      aheadPosRef.current = aheadPosition(
        series.lat[i0],
        series.lon[i0],
        series.alt[i0],
        series.heading[i0],
      );
      // pilota: punto colorato per vario (la pallina), seguibile dalla camera
      pilotRef.current = viewer.entities.add({
        position: new CallbackProperty(() => currentPosRef.current, false) as never,
        // offset camera quando il pilota è "tracked": dietro e sopra
        viewFrom: new Cartesian3(0, -1800, 1100) as never,
        point: {
          pixelSize: 15,
          color: new CallbackProperty(() => varioColor(currentVarioRef.current, 1), false) as never,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      // direzione di volo: freccia in spazio-mondo (corretta da ogni angolazione)
      headingRef.current = viewer.entities.add({
        polyline: {
          positions: new CallbackProperty(
            () => [currentPosRef.current, aheadPosRef.current],
            false,
          ) as never,
          width: 12,
          arcType: ArcType.NONE,
          material: new PolylineArrowMaterialProperty(Color.WHITE),
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

  // aggiornamento posizione/freccia pilota a ogni tick del clock di replay
  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      if (!state.series) return;
      const i = indexAtTime(state.series, state.currentTime);
      currentPosRef.current = positionAtTime(state.series, state.currentTime);
      currentVarioRef.current = state.series.vario[i];
      aheadPosRef.current = aheadPosition(
        state.series.lat[i],
        state.series.lon[i],
        state.series.alt[i],
        state.series.heading[i],
      );
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

  return (
    <div className="cesium-wrap">
      <div ref={containerRef} className="cesium-container" />
      {series && <VarioLegend />}
    </div>
  );
}
