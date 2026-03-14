import React, { useEffect, useState } from 'react';

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function emojiForWeather(code) {
  if (code === 0) return '☀️';
  if (code === 1) return '🌤️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if ([51, 53, 55].includes(code)) return '🌦️';
  if ([61, 63, 65, 80, 81, 82].includes(code)) return '🌧️';
  if ([66, 67].includes(code)) return '🌨️';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄️';
  if ([95, 96, 99].includes(code)) return '⛈️';
  return '🌡️';
}

function labelForWeather(code) {
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly Clear';
  if (code === 2) return 'Partly Cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if ([51, 53, 55].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 80, 81, 82].includes(code)) return 'Rain';
  if ([66, 67].includes(code)) return 'Freezing Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Thunderstorm';
  return 'Weather';
}

const PersonalZonePanel = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [zoneData, setZoneData] = useState({ region: 'Locating...', level: 'Unknown', militaryRank: '-', airTraffic: '-', weather: '-', tension: '-', emergency: { police: '-', ambulance: '-', fire: '-', disaster: '-' }, weatherDetails: null });
  const [weatherHover, setWeatherHover] = useState(false);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        const isLocal = window.location.hostname === 'localhost';
        const datasetUrl = isLocal ? 'http://localhost:4000/api/datasets/personal_zone_data' : '/api/datasets/personal_zone_data';
        const conflictUrl = isLocal ? 'http://localhost:4000/api/conflict-status' : '/api/conflict-status';
        const flightsUrl = isLocal ? 'http://localhost:4000/api/flights' : '/api/flights';

        // Check localStorage cache for Nominatim result (1-hour TTL)
        let countryName = 'Unknown';
        let iso2 = null;
        const cachedGeo = localStorage.getItem('georadar_nominatim_cache');
        if (cachedGeo) {
          try {
            const parsed = JSON.parse(cachedGeo);
            if (parsed.ts && Date.now() - parsed.ts < 3600000) {
              countryName = parsed.country || 'Unknown';
              iso2 = parsed.iso2 || null;
            }
          } catch { /* ignore bad cache */ }
        }
        if (countryName === 'Unknown') {
          const revRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=5&addressdetails=1`);
          const revJson = await revRes.json();
          countryName = (revJson.address && revJson.address.country) ? revJson.address.country : 'Unknown';
          iso2 = (revJson.address && revJson.address.country_code) ? revJson.address.country_code.toUpperCase() : null;
          localStorage.setItem('georadar_nominatim_cache', JSON.stringify({ country: countryName, iso2, ts: Date.now() }));
        }

        const [dsRes, cfRes, flRes, wxRes] = await Promise.all([
          fetch(datasetUrl),
          fetch(conflictUrl),
          fetch(flightsUrl),
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`)
        ]);

        const ds = dsRes.ok ? await dsRes.json() : { countries: [] };
        const cf = cfRes.ok ? await cfRes.json() : { conflictList: [] };
        const fl = flRes.ok ? await flRes.json() : { flights: [] };
        const wx = wxRes.ok ? await wxRes.json() : { current: null };

        const countries = ds.countries || [];
        const entry = countries.find(c => (c.iso && iso2 && c.iso.toUpperCase() === iso2) || (c.country && c.country.toLowerCase() === countryName.toLowerCase())) || null;

        const inConflict = Array.isArray(cf.conflictList) && cf.conflictList.some(c => c.country && c.country.toLowerCase() === countryName.toLowerCase());
        let level = 'Green';
        if (inConflict) level = 'Red';
        else if (entry && Array.isArray(entry.disputed_borders) && entry.disputed_borders.length > 0) level = 'Yellow';

        const tension = level === 'Red' ? 'Critical' : level === 'Yellow' ? 'Elevated' : 'Normal';

        let localFlights = 0;
        if (Array.isArray(fl.flights)) {
          for (const f of fl.flights) {
            if (typeof f.lat === 'number' && typeof f.lon === 'number') {
              const d = haversineDistance(latitude, longitude, f.lat, f.lon);
              if (d < 200) localFlights++;
            }
          }
        }
        const airTraffic = localFlights > 20 ? 'High' : localFlights > 5 ? 'Medium' : 'Low';

        const current = wx && wx.current ? wx.current : null;
        const wcode = current && typeof current.weather_code === 'number' ? current.weather_code : null;
        const weather = wcode !== null ? labelForWeather(wcode) : '-';
        const weatherDetails = current ? {
          temperature: current.temperature_2m,
          humidity: current.relative_humidity_2m,
          wind: current.wind_speed_10m,
          emoji: wcode !== null ? emojiForWeather(wcode) : '🌡️',
          description: weather
        } : null;

        const emergency = {
          police: entry && entry.emergency && entry.emergency.police ? entry.emergency.police : '-',
          ambulance: entry && entry.emergency && entry.emergency.ambulance ? entry.emergency.ambulance : '-',
          fire: entry && entry.emergency && entry.emergency.fire ? entry.emergency.fire : '-',
          disaster: entry && entry.emergency && entry.emergency.disaster ? entry.emergency.disaster : '-'
        };

        setZoneData({
          region: countryName,
          level,
          militaryRank: entry && entry.military_rank !== undefined ? String(entry.military_rank) : 'N/A',
          airTraffic,
          weather,
          tension,
          emergency,
          weatherDetails
        });
      } catch (e) {
        console.error(e);
      }
    }, (err) => console.error('Error getting location', err));
  }, []);

  return (
    <div className="hud-panel" style={{ width: '100%', position: 'relative' }}>
      <span className="hud-corner tl" />
      <span className="hud-corner tr" />
      <span className="hud-corner bl" />
      <span className="hud-corner br" />

      <div className="hud-header" style={{ justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setIsCollapsed(!isCollapsed)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="hud-dot" style={{ background: zoneData.level === 'Red' ? '#ff3232' : zoneData.level === 'Yellow' ? '#e67e22' : '#00ff88' }} />
          <span className="hud-title">PERSONAL ZONE</span>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px' }}>
          {isCollapsed ? '[ + ]' : '[ - ]'}
        </span>
      </div>

      {!isCollapsed && (
        <>
          <div className="hud-divider" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <div className="hud-row">
                <span className="hud-label">REGION</span>
                <span className="hud-val">{zoneData.region}</span>
              </div>
              <div className="hud-row">
                <span className="hud-label">ZONE LEVEL</span>
                <span className="hud-val" style={{ color: zoneData.level === 'Red' ? '#ff3232' : zoneData.level === 'Yellow' ? '#e67e22' : zoneData.level === 'Green' ? '#00ff88' : '#777' }}>{zoneData.level.toUpperCase()}</span>
              </div>
              <div className="hud-row">
                <span className="hud-label">MILITARY RANK</span>
                <span className="hud-val">{zoneData.militaryRank}</span>
              </div>
            </div>
            <div>
              <div className="hud-row">
                <span className="hud-label">AIR TRAFFIC</span>
                <span className="hud-val">{zoneData.airTraffic}</span>
              </div>
              <div className="hud-row weather-row" onMouseEnter={() => setWeatherHover(true)} onMouseLeave={() => setWeatherHover(false)} style={{ position: 'relative' }}>
                <span className="hud-label">WEATHER</span>
                <span className="hud-val" style={{ cursor: zoneData.weatherDetails ? 'pointer' : 'default' }}>
                  {zoneData.weatherDetails ? `${zoneData.weatherDetails.emoji} ${zoneData.weather}` : zoneData.weather}
                </span>
                {weatherHover && zoneData.weatherDetails && (
                  <div className="hud-tooltip" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', padding: '8px 10px', background: 'rgba(0,0,0,0.82)', border: '1px solid rgba(255,255,255,0.15)', zIndex: 30, pointerEvents: 'auto' }}>
                    <span className="hud-corner tl" />
                    <span className="hud-corner tr" />
                    <span className="hud-corner bl" />
                    <span className="hud-corner br" />
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '6px 12px', alignItems: 'center' }}>
                      <span className="hud-label" style={{ fontSize: '8px' }}>TEMP</span><span className="hud-val" style={{ fontSize: '10px' }}>{Math.round(zoneData.weatherDetails.temperature)}°C</span>
                      <span className="hud-label" style={{ fontSize: '8px' }}>HUMID</span><span className="hud-val" style={{ fontSize: '10px' }}>{Math.round(zoneData.weatherDetails.humidity)}%</span>
                      <span className="hud-label" style={{ fontSize: '8px' }}>WIND</span><span className="hud-val" style={{ fontSize: '10px' }}>{Math.round(zoneData.weatherDetails.wind)} km/h</span>
                      <span className="hud-label" style={{ fontSize: '8px' }}>STATUS</span><span className="hud-val" style={{ fontSize: '10px' }}>{zoneData.weatherDetails.emoji} {zoneData.weatherDetails.description}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="hud-row">
                <span className="hud-label">BORDER TENSION</span>
                <span className="hud-val">{zoneData.tension}</span>
              </div>
            </div>
          </div>

          <div className="hud-divider" />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="hud-label">EMERGENCY:</span>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div><span className="hud-label" style={{ fontSize: '8px' }}>POLICE </span><span className="hud-val" style={{ fontSize: '9px' }}>{zoneData.emergency.police}</span></div>
              <div><span className="hud-label" style={{ fontSize: '8px' }}>AMBULANCE </span><span className="hud-val" style={{ fontSize: '9px' }}>{zoneData.emergency.ambulance}</span></div>
              <div><span className="hud-label" style={{ fontSize: '8px' }}>FIRE </span><span className="hud-val" style={{ fontSize: '9px' }}>{zoneData.emergency.fire}</span></div>
              <div><span className="hud-label" style={{ fontSize: '8px' }}>DISASTER </span><span className="hud-val" style={{ fontSize: '9px' }}>{zoneData.emergency.disaster}</span></div>
            </div>
          </div>
        </>
      )}

    </div>
  );
};

export default PersonalZonePanel;
