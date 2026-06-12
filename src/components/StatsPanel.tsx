import { useStore } from '../state/store';

export function StatsPanel() {
  const track = useStore((s) => s.track);
  const analysis = useStore((s) => s.analysis);
  const weather = useStore((s) => s.weather);

  if (!track || !analysis) return null;
  const t = analysis.totals;

  const stats: Array<[string, string]> = [
    ['Durata', `${Math.floor(t.durationMin / 60)}h ${t.durationMin % 60}m`],
    ['Distanza traccia', `${t.trackDistanceKm} km`],
    ['Quota max', `${t.maxAltM} m`],
    ['Salita media', `${t.avgClimb} m/s`],
    ['Termica mediana', `${t.medianThermalClimb} m/s`],
    ['In termica', `${t.pctClimb}%`],
    ['In planata', `${t.pctGlide}%`],
    ['Tempo sprecato', `${t.minutesWasted} min`],
  ];

  return (
    <div className="panel">
      <h2>
        {track.site ?? 'Volo'} · {track.date}
      </h2>
      {track.pilot && <p className="muted">{track.pilot}{track.gliderType ? ` — ${track.gliderType}` : ''}</p>}
      <div className="stats-grid">
        {stats.map(([label, value]) => (
          <div key={label} className="stat">
            <span className="stat-value">{value}</span>
            <span className="stat-label">{label}</span>
          </div>
        ))}
      </div>
      {weather && (
        <div className="weather-card">
          <h3>Meteo del giorno (Open-Meteo)</h3>
          <ul>
            {weather.tempMaxC !== undefined && <li>T max: {Math.round(weather.tempMaxC)} °C</li>}
            {weather.wind925 && (
              <li>
                Vento 925 hPa (~750 m): {Math.round(weather.wind925.speedKmh)} km/h da{' '}
                {Math.round(weather.wind925.dirDeg)}°
              </li>
            )}
            {weather.wind850 && (
              <li>
                Vento 850 hPa (~1500 m): {Math.round(weather.wind850.speedKmh)} km/h da{' '}
                {Math.round(weather.wind850.dirDeg)}°
              </li>
            )}
            {weather.boundaryLayerM !== undefined && (
              <li>Strato convettivo: ~{Math.round(weather.boundaryLayerM)} m</li>
            )}
            {weather.cape !== undefined && <li>CAPE: {Math.round(weather.cape)} J/kg</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
