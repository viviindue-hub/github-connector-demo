import { useEffect, useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import type EChartsReactCore from 'echarts-for-react/lib/core';
import { useStore } from '../state/store';
import { lttb } from '../lib/analysis/summary';

export function Barogram() {
  const series = useStore((s) => s.series);
  const analysis = useStore((s) => s.analysis);
  const setTime = useStore((s) => s.setTime);
  const setPlaying = useStore((s) => s.setPlaying);
  const chartRef = useRef<EChartsReactCore>(null);

  const option = useMemo(() => {
    if (!series) return {};
    const altData = lttb(series.t, series.alt, 2000);
    const markAreas =
      analysis?.thermals.map((th) => [
        { xAxis: th.startT, itemStyle: { color: 'rgba(80, 200, 120, 0.14)' } },
        { xAxis: th.endT },
      ]) ?? [];

    return {
      animation: false,
      grid: { left: 56, right: 16, top: 12, bottom: 28 },
      // niente tooltip/axisPointer: l'unico indicatore verticale è la markLine
      // rossa del replay; così trascinando sul grafico non si muove nulla.
      xAxis: {
        type: 'time',
        axisLabel: {
          color: '#9aa4b2',
          formatter: (v: number) => new Date(v).toISOString().slice(11, 16),
        },
        axisLine: { lineStyle: { color: '#39414e' } },
      },
      yAxis: {
        type: 'value',
        name: 'm',
        min: 'dataMin',
        axisLabel: { color: '#9aa4b2' },
        splitLine: { lineStyle: { color: '#262c36' } },
      },
      series: [
        {
          type: 'line',
          data: altData,
          showSymbol: false,
          lineStyle: { width: 1.6, color: '#e8b33c' },
          areaStyle: { color: 'rgba(232, 179, 60, 0.10)' },
          markArea: { silent: true, data: markAreas },
          markLine: {
            silent: true,
            symbol: 'none',
            label: { show: false },
            lineStyle: { color: '#ff5252', width: 1.4 },
            data: [{ xAxis: series.t[0] }],
          },
        },
      ],
    };
  }, [series, analysis]);

  // cursore di replay: aggiorna la markLine a ogni cambio di tempo, senza
  // re-render React. Niente throttle → scrubbing liscio e immediato.
  useEffect(() => {
    let lastT = -1;
    const unsub = useStore.subscribe((state) => {
      if (state.currentTime === lastT) return; // aggiorna solo se il tempo cambia
      lastT = state.currentTime;
      const chart = chartRef.current?.getEchartsInstance();
      if (!chart || !state.series) return;
      chart.setOption({
        series: [{ markLine: { data: [{ xAxis: state.currentTime }] } }],
      });
    });
    return unsub;
  }, []);

  if (!series) return null;

  // click ovunque nel grafico → sposta il replay (e quindi la freccia sulla
  // mappa) a quell'istante. Agganciato quando il grafico è pronto; converte il
  // pixel in tempo dell'asse x e lo limita all'intervallo del volo (così
  // funziona anche cliccando in basso, fuori dall'area dati).
  const onChartReady = (instance: unknown) => {
    const chart = instance as {
      getZr: () => {
        on: (ev: string, cb: (e: { offsetX: number; offsetY: number }) => void) => void;
      };
      convertFromPixel: (finder: unknown, value: number[]) => number | number[];
      setOption: (opt: unknown) => void;
    };
    const zr = chart.getZr();
    let dragging = false;

    // sposta il cursore (linea rossa) all'istante sotto il puntatore.
    // Aggiorna la markLine DIRETTAMENTE (feedback immediato e fluido) e poi lo
    // stato condiviso (mappa, ecc.).
    const seek = (e: { offsetX: number; offsetY: number }) => {
      const coord = chart.convertFromPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY]);
      const tVal = Array.isArray(coord) ? coord[0] : coord;
      const s = useStore.getState().series;
      if (!s || typeof tVal !== 'number' || Number.isNaN(tVal)) return;
      const t0 = s.t[0];
      const t1 = s.t[s.t.length - 1];
      const clamped = Math.max(t0, Math.min(t1, tVal));
      chart.setOption({ series: [{ markLine: { data: [{ xAxis: clamped }] } }] });
      setTime(clamped);
    };

    // scrubber: premi e trascina (mouse o dito; zrender normalizza il touch)
    zr.on('mousedown', (e) => {
      dragging = true;
      setPlaying(false);
      seek(e);
    });
    zr.on('mousemove', (e) => {
      if (dragging) seek(e);
    });
    zr.on('mouseup', () => {
      dragging = false;
    });
    zr.on('globalout', () => {
      dragging = false;
    });
  };

  return (
    <div className="barogram">
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: '100%', width: '100%' }}
        notMerge={false}
        onChartReady={onChartReady}
      />
    </div>
  );
}
