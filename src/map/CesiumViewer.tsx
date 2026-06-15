import { useEffect, useRef, useState } from 'react';
import {
  CallbackProperty,
  Cartesian3,
  Color,
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
import { buildTrackGeometry, positionAtTime } from './replay';
import { createImageryLayer, createTerrain } from './providers';

export function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const pilotRef = useRef<Entity | null>(null);
  const trackPrimitiveRef = useRef<Primitive | null>(null);
  // posizione corrente letta dalla CallbackProperty (evita re-render React)
  const currentPosRef = useRef<Cartesian3>(new Cartesian3());
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

      currentPosRef.current = positionAtTime(series, useStore.getState().currentTime);
      pilotRef.current = viewer.entities.add({
        position: new CallbackProperty(() => currentPosRef.current, false) as never,
        point: {
          pixelSize: 13,
          color: Color.YELLOW,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
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

  return <div ref={containerRef} className="cesium-container" />;
}
