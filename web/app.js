/* Denver Sports Wallpaper — zero JS dependencies, works in WebView2 or browser. */
(() => {
  'use strict';
  const TZ = 'America/Denver';
  const DENVER = { latitude: 39.7392, longitude: -104.9903 };
  const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
  const WEATHER = 'https://api.open-meteo.com/v1/forecast';
  const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
  const teams = [
    { key: 'broncos', name: 'Broncos', league: 'nfl', sport: 'football', team: 'den', abbr: 'DEN', indoors: false },
    { key: 'avalanche', name: 'Avalanche', league: 'nhl', sport: 'hockey', team: 'col', abbr: 'COL', indoors: true },
    { key: 'nuggets', name: 'Nuggets', league: 'nba', sport: 'basketball', team: 'den', abbr: 'DEN', indoors: true },
  ];
  const demo = new URLSearchParams(location.search).get('demo') === '1';
  const $ = id => document.getElementById(id);
  const timezoneDate = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const localHourKey = date => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).format(date).replace(' ', 'T') + ':00';
  const hourDate = date => localHourKey(date).slice(0, 10);
  const dateFormatter = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const esc = value => String(value ?? '').replace(/[&<>"']/g, x => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[x]));
  const round = v => typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v)}°` : '--';
  const safeNum = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
  const cache = new Map();
  const pending = new Map();
  let counter = 0;
  let state = { forecast: null, demo, successful: 0, errors: 0 };
  let refreshRunning = false;

  const descriptions = [
    [0, 'Clear sky', '☀'], [1, 'Mainly clear', '☀'], [2, 'Partly cloudy', '⛅'], [3, 'Overcast', '☁'],
    [45, 'Foggy', '☁'], [48, 'Freezing fog', '☁'], [51, 'Light drizzle', '☂'], [53, 'Drizzle', '☂'],
    [55, 'Heavy drizzle', '☂'], [56, 'Freezing drizzle', '☂'], [57, 'Freezing drizzle', '☂'],
    [61, 'Light rain', '☂'], [63, 'Rain', '☂'], [65, 'Heavy rain', '☂'], [66, 'Freezing rain', '☂'],
    [67, 'Freezing rain', '☂'], [71, 'Light snow', '❄'], [73, 'Snow', '❄'], [75, 'Heavy snow', '❄'],
    [77, 'Snow grains', '❄'], [80, 'Rain showers', '☂'], [81, 'Rain showers', '☂'],
    [82, 'Heavy showers', '☂'], [85, 'Snow showers', '❄'], [86, 'Heavy snow showers', '❄'],
    [95, 'Thunderstorm', 'ϟ'], [96, 'Thunderstorm / hail', 'ϟ'], [99, 'Thunderstorm / hail', 'ϟ']
  ];
  const weatherMeta = code => {
    const exact = descriptions.find(r => r[0] === Number(code));
    return exact ? { label: exact[1], icon: exact[2] } : { label: 'Conditions unavailable', icon: '◌' };
  };

  if (window.chrome?.webview) {
    window.chrome.webview.addEventListener('message', evt => {
      const m = evt.data;
      if (!m || m.type !== 'api-response') return;
      const request = pending.get(m.requestId);
      if (!request) return;
      clearTimeout(request.timeout);
      pending.delete(m.requestId);
      if (m.ok) request.resolve(m.data);
      else request.reject(new Error(m.error || 'Live feed unavailable'));
    });
  }

  function fetchApi(url, maxAgeMs = 120000) {
    const found = cache.get(url);
    if (found && Date.now() - found.at < maxAgeMs) return Promise.resolve(found.data);
    const work = window.chrome?.webview
      ? new Promise((resolve, reject) => {
          const requestId = 'w' + ++counter;
          const timeout = setTimeout(() => { pending.delete(requestId); reject(new Error('Request timed out')); }, 24000);
          pending.set(requestId, { resolve, reject, timeout });
          window.chrome.webview.postMessage({ type: 'api', requestId, url });
        })
      : fetch(url, { cache: 'no-store' }).then(async r => {
          if (!r.ok) throw new Error(`HTTP ${r.status} for ${new URL(url).hostname}`);
          return r.json();
        });
    return work.then(data => { cache.set(url, { at: Date.now(), data }); return data; });
  }

  function setFeedStatus() {
    const el = $('feedStatus');
    if (demo) { el.classList.remove('offline'); $('feedText').textContent = 'DESIGN PREVIEW'; return; }
    if (!state.successful) { el.classList.add('offline'); $('feedText').textContent = 'DATA UNAVAILABLE'; }
    else if (state.errors) { el.classList.add('offline'); $('feedText').textContent = 'PARTIAL DATA'; }
    else { el.classList.remove('offline'); $('feedText').textContent = 'LIVE DATA'; }
  }
  function updateClock() {
    $('clock').textContent = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date());
    $('date').textContent = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date()).toUpperCase() + ' · MT';
  }
  function showWeatherNow(current) {
    if (!current) { $('currentDesc').textContent = 'Weather feed unavailable'; return; }
    const condition = weatherMeta(current.weather_code);
    $('currentIcon').textContent = condition.icon;
    $('currentTemp').innerHTML = typeof current.temperature_2m === 'number' && Number.isFinite(current.temperature_2m) ? `${Math.round(current.temperature_2m)}<span>°</span>` : '--';
    $('currentDesc').textContent = condition.label;
    $('feelsLike').textContent = round(current.apparent_temperature);
    $('currentWind').textContent = typeof current.wind_speed_10m === 'number' ? Math.round(current.wind_speed_10m) + ' mph' : '--';
    $('humidity').textContent = typeof current.relative_humidity_2m === 'number' ? Math.round(current.relative_humidity_2m) + '%' : '--';
  }

  function params(obj) { return new URLSearchParams(obj).toString(); }
  const baseWeatherParams = { latitude: DENVER.latitude, longitude: DENVER.longitude, temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', timezone: TZ };
  async function loadForecast() {
    const url = WEATHER + '?' + params({ ...baseWeatherParams,
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code',
      hourly: 'temperature_2m,weather_code,precipitation_probability,wind_speed_10m',
      forecast_days: 16, past_days: 7 });
    const data = await fetchApi(url, 9 * 60 * 1000);
    if (!data || !data.current) throw new Error('Weather current data missing');
    state.forecast = data;
    showWeatherNow(data.current);
    return data;
  }

  function weatherAt(time, hourly) {
    if (!hourly || !Array.isArray(hourly.time)) return null;
    const key = localHourKey(time);
    // Open-Meteo uses local times. Select kickoff/tipoff/puck-drop hour, not the daily high.
    const ix = hourly.time.findIndex(t => t.slice(0, 13) === key.slice(0, 13));
    if (ix < 0) return null;
    const temp = safeNum(hourly.temperature_2m?.[ix]);
    if (temp === null) return null;
    return { temperature: temp, code: hourly.weather_code?.[ix], rain: hourly.precipitation_probability?.[ix] };
  }
  async function gameWeather(time, isPast) {
    const fromForecast = weatherAt(time, state.forecast?.hourly);
    if (fromForecast) return { ...fromForecast, source: isPast ? 'Approx. at game time' : 'Forecast at game time' };
    if (!isPast) return null; // Never invent a forecast outside the available horizon.
    const day = hourDate(time);
    const url = ARCHIVE + '?' + params({ ...baseWeatherParams, start_date: day, end_date: day,
      hourly: 'temperature_2m,weather_code,wind_speed_10m' });
    try {
      const historic = await fetchApi(url, 24 * 60 * 60 * 1000);
      const result = weatherAt(time, historic.hourly);
      return result ? { ...result, source: 'Historical estimate' } : null;
    } catch (e) { console.warn('Historical weather unavailable', e); return null; }
  }

  function seasonFor(team) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric' }).formatToParts(new Date());
    const year = +parts.find(p => p.type === 'year').value;
    const month = +parts.find(p => p.type === 'month').value;
    return team.league === 'nfl' ? (month <= 2 ? year - 1 : year) : (month >= 7 ? year + 1 : year);
  }
  const nameFor = team => team?.displayName || team?.shortDisplayName || team?.name || 'Opponent TBD';
  function seasonEvents(data, team) {
    const events = Array.isArray(data?.events) ? data.events : [];
    return events.flatMap(e => {
      const competition = e.competitions?.[0];
      if (!competition || !Array.isArray(competition.competitors)) return [];
      const ours = competition.competitors.find(c => c.homeAway === 'home' &&
        (String(c.team?.abbreviation || '').toUpperCase() === team.abbr ||
         String(c.team?.slug || '').toLowerCase().endsWith(team.team)));
      if (!ours) return [];
      const visitor = competition.competitors.find(c => c.homeAway === 'away');
      const date = new Date(e.date || competition.date);
      if (Number.isNaN(date.getTime())) return [];
      const completed = Boolean(e.status?.type?.completed || competition.status?.type?.completed);
      const stateValue = String(e.status?.type?.state || competition.status?.type?.state || '');
      const ourScore = scoreOf(ours.score);
      const visitorScore = scoreOf(visitor?.score);
      return [{ id: String(e.id), date, completed, stateValue, opponent: nameFor(visitor?.team),
        ourScore, visitorScore, source: 'ESPN' }];
    });
  }
  function scoreOf(score) {
    if (score === null || score === undefined) return null;
    if (typeof score === 'object') score = score.displayValue ?? score.value;
    const numeric = Number(score);
    return Number.isFinite(numeric) && score !== '' ? numeric : null;
  }
  async function loadSchedule(team) {
    const season = seasonFor(team);
    const endpoint = y => `${ESPN}/${team.sport}/${team.league}/teams/${team.team}/schedule?season=${y}`;
    let games = [];
    let succeeded = false;
    let failure;
    try {
      games = seasonEvents(await fetchApi(endpoint(season), 25 * 60 * 1000), team);
      succeeded = true;
    } catch (e) { failure = e; }
    const now = Date.now();
    const hasLast = games.some(g => g.completed && +g.date <= now);
    const hasNext = games.some(g => !g.completed && +g.date >= now);
    // Only request adjacent seasons when needed, e.g. across offseason or season transition.
    const extras = [];
    if (!hasLast) extras.push(season - 1);
    if (!hasNext) extras.push(season + 1);
    if (!succeeded && !extras.length) extras.push(season - 1, season + 1);
    const more = await Promise.allSettled([...new Set(extras)].map(y => fetchApi(endpoint(y), 25 * 60 * 1000)));
    for (const r of more) if (r.status === 'fulfilled') { succeeded = true; games.push(...seasonEvents(r.value, team)); }
    if (!succeeded) throw failure || new Error('ESPN schedule temporarily unavailable');
    games = [...new Map(games.map(g => [g.id, g])).values()].sort((a, b) => +a.date - +b.date);
    return {
      last: games.filter(g => g.completed && +g.date <= now).at(-1) || null,
      next: games.find(g => !g.completed && +g.date >= now) || null
    };
  }

  function renderGame(team, kind, game, weather, error = null) {
    const target = document.querySelector(`[data-team="${team.key}"] [data-field="${kind}"]`);
    if (!target) return;
    if (!game) {
      target.innerHTML = `<div class="skeleton">${error ? 'Schedule feed unavailable' : 'No confirmed home game found in available schedule'}</div>`;
      return;
    }
    const date = dateFormatter.format(game.date);
    let score = '';
    if (kind === 'last' && game.ourScore !== null && game.visitorScore !== null) {
      const result = game.ourScore > game.visitorScore ? 'W' : game.ourScore < game.visitorScore ? 'L' : 'T';
      const cls = result === 'W' ? 'win' : result === 'L' ? 'loss' : '';
      score = `<div class="game-result ${cls}">${result} <span class="score">${game.ourScore} – ${game.visitorScore}</span></div>`;
    }
    const weatherPart = weather
      ? `<div class="game-weather"><span class="game-weather-icon">${esc(weatherMeta(weather.code).icon)}</span><strong>${Math.round(weather.temperature)}°</strong><small>${esc(weatherMeta(weather.code).label)}</small></div><div class="game-weather-caption">${esc(weather.source)} · Denver outdoor weather</div>`
      : `<div class="game-weather-unavailable">${kind === 'next' ? 'Forecast not available yet for this game' : 'Historical weather unavailable for this game'}</div>`;
    target.innerHTML = `<div class="game-date">${esc(date)} MT</div><div class="opponent"><span class="against">vs </span>${esc(game.opponent)}</div>${score}${weatherPart}`;
  }

  async function updateTeam(team) {
    try {
      const games = await loadSchedule(team);
      state.successful++;
      renderGame(team, 'last', games.last, null);
      renderGame(team, 'next', games.next, null);
      await Promise.all(['last', 'next'].map(async kind => {
        const game = games[kind];
        if (!game) return;
        const weather = await gameWeather(game.date, kind === 'last');
        renderGame(team, kind, game, weather);
      }));
    } catch (err) {
      state.errors++;
      console.warn(`Schedule failed for ${team.name}:`, err);
      renderGame(team, 'last', null, null, err);
      renderGame(team, 'next', null, null, err);
    }
    setFeedStatus();
  }

  async function refresh(force = false) {
    if (refreshRunning) return;
    refreshRunning = true;
    if (force) cache.clear();
    state.successful = 0;
    state.errors = 0;
    if (demo) { paintDemo(); refreshRunning = false; return; }
    $('lastUpdated').textContent = 'UPDATING LIVE FEEDS…';
    try {
      await loadForecast();
      state.successful++;
    } catch (e) {
      state.errors++;
      console.warn('Weather fetch failed:', e);
      if (!state.forecast) showWeatherNow(null);
    }
    // Team updates proceed independently; unavailable sports feeds don't take down weather.
    await Promise.all(teams.map(updateTeam));
    $('lastUpdated').textContent = 'LAST CHECKED ' + new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date()) + ' MT';
    setFeedStatus();
    refreshRunning = false;
  }

  function paintDemo() {
    $('demoBanner').hidden = false;
    $('lastUpdated').textContent = 'DESIGN PREVIEW — EXAMPLE CONDITIONS';
    showWeatherNow({ temperature_2m: 52, apparent_temperature: 49, relative_humidity_2m: 37, wind_speed_10m: 8, weather_code: 2 });
    const today = new Date();
    teams.forEach((t, i) => {
      const last = { date: new Date(today.getTime() - (i + 2) * 86400000), opponent: 'Sample Visitors', ourScore: 3 + i, visitorScore: 2 + i };
      const next = { date: new Date(today.getTime() + (i + 3) * 86400000), opponent: 'Sample Opponent', ourScore: null, visitorScore: null };
      renderGame(t, 'last', last, { temperature: 46 + i, code: 1, source: 'Example weather' });
      renderGame(t, 'next', next, { temperature: 55 + i, code: 2, source: 'Example forecast' });
    });
    setFeedStatus();
  }

  $('refreshButton').addEventListener('click', () => refresh(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) updateClock(); });
  updateClock();
  setInterval(updateClock, 15000);
  setInterval(() => refresh(false), 10 * 60 * 1000);
  refresh();
})();
