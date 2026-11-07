// Run with: node tests/test-ticker.js
const assert = require('node:assert/strict');
const { LEAGUES, dateKey, normalizeEvents, scoreValue, teamLogo } = require('../web/ticker.js');

const league = LEAGUES[0];
assert.equal(LEAGUES.length, 6);
assert.match(dateKey(0, Date.UTC(2026, 10, 8, 1)), /^\d{8}$/);
assert.equal(dateKey(0, Date.UTC(2026, 10, 8, 1)), '20261107'); // Denver is still Nov 7
assert.equal(scoreValue({ score: 0 }), '0');
assert.equal(scoreValue({ score: { displayValue: '14' } }), '14');
assert.equal(scoreValue({ score: null }), '—');
assert.equal(teamLogo({ team: { logo: 'javascript:alert(1)' } }), '');
assert.equal(teamLogo({ team: { logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/den.png' } }).startsWith('https:'), true);
const event = (id, favorite, state, awayScore, homeScore) => ({
  id: String(id), date: '2026-11-08T21:00:00Z',
  status: { type: { state, shortDetail: state === 'in' ? 'Q2 1:30' : '' } },
  competitions: [{ competitors: [
    { homeAway: 'away', team: { abbreviation: 'KC', displayName: 'Kansas City Chiefs' }, score: awayScore },
    { homeAway: 'home', team: { abbreviation: favorite ? 'DEN' : 'BUF', displayName: favorite ? 'Denver Broncos' : 'Buffalo Bills' }, score: homeScore }
  ] }]
});
let results = normalizeEvents({ events: [event('1', false, 'post', 7, 14), event('2', true, 'in', 0, 0), event('3', false, 'pre', null, null)] }, league);
assert.equal(results.length, 3);
assert.equal(results[0].id, '2', 'Denver game should appear first');
assert.equal(results[0].score, '0 – 0');
assert.match(results[0].label, /LIVE Q2/);
assert.equal(results[1].label, 'FINAL');
assert.equal(results[2].score, '@');
assert.match(results[2].label, /MT$/);
assert.deepEqual(normalizeEvents({ events: [] }, league), []);
assert.deepEqual(normalizeEvents(null, league), []);
console.log('PASS: ticker date, safe logos, score parsing, Denver priority, live/final/pregame, empty feeds.');
