import { useEffect, useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import type EChartsReactCore from 'echarts-for-react/lib/core';
import { useStore } from '../state/store';
import { lttb } from '../lib/analysis/summary';

export function Barogram() {
  const series = useStore((s) => s.series);
  const analysis = useStore((s) => s.analysis);
  const setTime = useStore((s) => s.setTime);
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
      tooltip: {
        trigger: 'axis',
        formatter: (params: Array<{ value: [number, number] }>) => {
          const [t, alt] = params[0].value;
          return `${new Date(t).toISOString().slice(11, 19)} UTC — ${Math.round(alt)} m`;
        },
      },
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

  // cursore di replay: aggiorna solo la markLine, throttled, senza re-render React
  useEffect(() => {
    let lastUpdate = 0;
    const unsub = useStore.subscribe((state) => {
      const now = performance.now();
      if (now - lastUpdate < 200) return;
      lastUpdate = now;
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
      getZr: () => { on: (ev: string, cb: (e: { offsetX: number; offsetY: number }) => void) => void };
      convertFromPixel: (finder: unknown, value: number[]) => number | number[];
    };
    chart.getZr().on('click', (e) => {
      const coord = chart.convertFromPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY]);
      const tVal = Array.isArray(coord) ? coord[0] : coord;
      const s = useStore.getState().series;
      if (!s || typeof tVal !== 'number' || Number.isNaN(tVal)) return;
      const t0 = s.t[0];
      const t1 = s.t[s.t.length - 1];
      setTime(Math.max(t0, Math.min(t1, tVal)));
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
