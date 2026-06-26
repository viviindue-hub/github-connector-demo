import { useStore } from '../state/store';
import { t as tr } from '../i18n';
import { avgGroundSpeedKmh, estimateAvgAirspeedKmh } from '../lib/analysis/airspeed';

export function StatsPanel() {
  const track = useStore((s) => s.track);
  const analysis = useStore((s) => s.analysis);
  const series = useStore((s) => s.series);
  const weather = useStore((s) => s.weather);
  const lang = useStore((s) => s.lang);

  if (!track || !analysis || !series) return null;
  const tot = analysis.totals;

  const groundKmh = avgGroundSpeedKmh(series);
  const airKmh = estimateAvgAirspeedKmh(series, analysis.thermals);

  const stats: Array<[string, string]> = [
    [tr(lang, 'statDuration'), `${Math.floor(tot.durationMin / 60)}h ${tot.durationMin % 60}m`],
    [tr(lang, 'statTrackDist'), `${tot.trackDistanceKm} km`],
    [tr(lang, 'statMaxAlt'), `${tot.maxAltM} m`],
    [tr(lang, 'statAvgClimb'), `${tot.avgClimb} m/s`],
    [tr(lang, 'statMedianThermal'), `${tot.medianThermalClimb} m/s`],
    [tr(lang, 'statInThermal'), `${tot.pctClimb}%`],
    [tr(lang, 'statInGlide'), `${tot.pctGlide}%`],
    [tr(lang, 'statWasted'), `${tot.minutesWasted} min`],
    ...(groundKmh !== null
      ? ([[tr(lang, 'statGroundSpeed'), `${Math.round(groundKmh)} km/h`]] as Array<[string, string]>)
      : []),
    ...(airKmh !== null
      ? ([[tr(lang, 'statAirSpeed'), `${Math.round(airKmh)} km/h`]] as Array<[string, string]>)
      : []),
  ];

  return (
    <div className="panel">
      <h2>
        {track.site ?? tr(lang, 'flight')} · {track.date}
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
          <h3>{tr(lang, 'weatherTitle')}</h3>
          <ul>
            {weather.tempMaxC !== undefined && (
              <li>
                {tr(lang, 'tMax')}: {Math.round(weather.tempMaxC)} °C
              </li>
            )}
            {weather.wind925 && (
              <li>
                {tr(lang, 'wind925')}: {Math.round(weather.wind925.speedKmh)} km/h{' '}
                {tr(lang, 'from')} {Math.round(weather.wind925.dirDeg)}°
              </li>
            )}
            {weather.wind850 && (
              <li>
                {tr(lang, 'wind850')}: {Math.round(weather.wind850.speedKmh)} km/h{' '}
                {tr(lang, 'from')} {Math.round(weather.wind850.dirDeg)}°
              </li>
            )}
            {weather.boundaryLayerM !== undefined && (
              <li>
                {tr(lang, 'blThickness')}: ~{Math.round(weather.boundaryLayerM)} m
              </li>
            )}
            {weather.cape !== undefined && <li>CAPE: {Math.round(weather.cape)} J/kg</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
