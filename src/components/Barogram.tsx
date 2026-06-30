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

  // click ovunque nel grafico → sposta il replay a quell'istante (non solo
  // beccando la linea): converte il pixel cliccato in tempo dell'asse x.
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;
    const zr = chart.getZr();
    const handler = (e: { offsetX: number; offsetY: number }) => {
      const pt: [number, number] = [e.offsetX, e.offsetY];
      if (!chart.containPixel('grid', pt)) return;
      const coord = chart.convertFromPixel({ gridIndex: 0 }, pt) as number[];
      const tVal = Array.isArray(coord) ? coord[0] : coord;
      if (typeof tVal === 'number' && !Number.isNaN(tVal)) setTime(tVal);
    };
    zr.on('click', handler);
    return () => zr.off('click', handler);
  }, [series, setTime]);

  if (!series) return null;

  return (
    <div className="barogram">
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: '100%', width: '100%' }}
        notMerge={false}
      />
    </div>
  );
}
