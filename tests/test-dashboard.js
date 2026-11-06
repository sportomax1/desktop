// Optional regression check: requires Node.js 18+ (not required for wallpaper runtime).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const elements = new Map();
function element(key) {
  if (!elements.has(key)) elements.set(key, { innerHTML: '', textContent: '', classList: { add(){}, remove(){} }, hidden: false, addEventListener() {} });
  return elements.get(key);
}
function localKey(date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).format(date).replace(' ', 'T') + ':00';
}
const now = Date.now();
const last = new Date(now - 2 * 86400000);
const nextSoon = new Date(now + 2 * 86400000);
const nextFar = new Date(now + 25 * 86400000);
const times = [last, nextSoon].map(localKey);
const forecast = {
  current: { temperature_2m: 44, apparent_temperature: 41, relative_humidity_2m: 44, wind_speed_10m: 10, weather_code: 1 },
  hourly: { time: times, temperature_2m: [38, 49], weather_code: [2, 0], precipitation_probability: [10, 0], wind_speed_10m: [4, 5] }
};
function game(id, date, isCompleted, ourScore, visitorScore, abbr) {
  return { id: String(id), date: date.toISOString(), status: { type: { completed: isCompleted, state: isCompleted ? 'post' : 'pre' } },
    competitions: [{ competitors: [
      { homeAway: 'home', team: { abbreviation: abbr }, score: ourScore },
      { homeAway: 'away', team: { displayName: 'Mock Road Team', abbreviation: 'AWY' }, score: visitorScore }
    ] }] };
}
const calls = [];
async function fakeFetch(url) {
  calls.push(url);
  let payload;
  if (url.includes('open-meteo.com/v1/forecast')) payload = forecast;
  else if (url.includes('/schedule')) {
    const abbr = url.includes('/hockey/') ? 'COL' : 'DEN';
    payload = { events: [game(101, last, true, 4, 2, abbr), game(102, abbr === 'COL' ? nextFar : nextSoon, false, null, null, abbr)] };
  } else if (url.includes('archive-api.open-meteo.com')) payload = { hourly: forecast.hourly };
  else throw new Error('Unexpected URL ' + url);
  return { ok: true, json: async () => payload };
}
const context = { window: {}, document: {
  getElementById: element,
  querySelector: selector => element(selector),
  addEventListener() {},
}, location: { search: '' }, fetch: fakeFetch, URL, URLSearchParams, Intl, Date, Number, String, Math, Object, Array, Promise, Map, Set, console, setTimeout, clearTimeout, setInterval() {} };
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../web/app.js'), 'utf8'), context);
setTimeout(() => {
  try {
    assert.equal(element('currentTemp').innerHTML, '44<span>°</span>');
    for (const team of ['broncos', 'avalanche', 'nuggets']) {
      const lastHtml = element(`[data-team="${team}"] [data-field="last"]`).innerHTML;
      const nextHtml = element(`[data-team="${team}"] [data-field="next"]`).innerHTML;
      assert.match(lastHtml, /Mock Road Team/);
      assert.match(lastHtml, /W <span class="score">4 – 2<\/span>/);
      assert.match(nextHtml, /Mock Road Team/);
      if (team === 'avalanche') assert.match(nextHtml, /Forecast not available yet/);
      else assert.match(nextHtml, /49°/);
    }
    assert.match(element('feedText').textContent, /LIVE DATA/);
    assert.ok(calls.filter(x => x.includes('/schedule')).length >= 3);
    console.log('PASS: Denver current weather, three teams, home game selection, scores, hourly game weather, distant-forecast guard.');
  } catch (e) { console.error(e); process.exitCode = 1; }
}, 200);
