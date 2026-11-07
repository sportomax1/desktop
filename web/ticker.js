/* Continuous sports ticker shared by every dashboard.
   ESPN data is unofficial. Never fabricate scores when a feed fails. */
(function (root) {
  'use strict';

  var LEAGUES = [
    { id: 'nfl', label: 'NFL', path: 'football/nfl' },
    { id: 'nba', label: 'NBA', path: 'basketball/nba' },
    { id: 'nhl', label: 'NHL', path: 'hockey/nhl' },
    { id: 'mlb', label: 'MLB', path: 'baseball/mlb' },
    { id: 'cfb', label: 'NCAA FB', path: 'football/college-football' },
    { id: 'cbb', label: 'NCAA MBB', path: 'basketball/mens-college-basketball' }
  ];
  var ZONE = 'America/Denver';

  function dateKey(dayOffset, from) {
    var date = new Date((from || Date.now()) + dayOffset * 86400000);
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date).replace(/-/g, '');
  }

  function teamName(competitor) {
    var team = competitor && competitor.team || {};
    return String(team.abbreviation || team.shortDisplayName || team.displayName || 'TBD').slice(0, 18);
  }

  function teamLogo(competitor) {
    var team = competitor && competitor.team || {};
    var url = team.logo || (team.logos && team.logos[0] && team.logos[0].href) || '';
    return typeof url === 'string' && /^https:\/\/a\.espncdn\.com\//i.test(url) ? url : '';
  }

  function scoreValue(competitor) {
    var score = competitor && competitor.score;
    if (score && typeof score === 'object') score = score.displayValue != null ? score.displayValue : score.value;
    return score == null || score === '' ? '—' : String(score);
  }

  function normalizeEvents(payload, league) {
    var events = payload && Array.isArray(payload.events) ? payload.events : [];
    return events.map(function (event) {
      var competition = event && event.competitions && event.competitions[0] || {};
      var teams = competition.competitors || [];
      var home = teams.find(function (c) { return c.homeAway === 'home'; }) || teams[0] || {};
      var away = teams.find(function (c) { return c.homeAway === 'away'; }) || teams[1] || {};
      var status = competition.status && competition.status.type || event && event.status && event.status.type || {};
      var kind = ['in', 'post'].includes(status.state) ? status.state : 'pre';
      var date = event && event.date || competition.date || '';
      var label = '';
      if (kind === 'in') label = 'LIVE ' + String(status.shortDetail || status.detail || '').slice(0, 22);
      else if (kind === 'post') label = 'FINAL';
      else if (date && !Number.isNaN(new Date(date).getTime())) {
        label = new Intl.DateTimeFormat('en-US', {
          timeZone: ZONE, weekday: 'short', hour: 'numeric', minute: '2-digit'
        }).format(new Date(date)) + ' MT';
      } else label = 'SCHEDULED';
      var awayName = teamName(away), homeName = teamName(home);
      var names = String((away.team && away.team.displayName) || '') + ' ' +
        String((home.team && home.team.displayName) || '');
      return {
        id: String(event && event.id || ''),
        league: league.label,
        away: awayName,
        home: homeName,
        awayLogo: teamLogo(away),
        homeLogo: teamLogo(home),
        score: kind === 'pre' ? '@' : scoreValue(away) + ' – ' + scoreValue(home),
        label: label.trim(),
        kind: kind,
        date: date,
        favorite: /\b(denver|colorado|buffaloes)\b/i.test(names)
      };
    }).filter(function (game) { return game.home !== 'TBD' || game.away !== 'TBD'; })
      .sort(function (a, b) {
        return Number(b.favorite) - Number(a.favorite) ||
          Number(b.kind === 'in') - Number(a.kind === 'in') ||
          (new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
      });
  }

  // Allow data-free unit tests without a browser DOM.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LEAGUES: LEAGUES, dateKey: dateKey, normalizeEvents: normalizeEvents, scoreValue: scoreValue, teamLogo: teamLogo };
    return;
  }
  if (typeof document === 'undefined') return;
  var params = new URLSearchParams(root.location.search);
  if (params.get('ticker') === '0') return;

  var speedSetting = Number(params.get('tickerSpeed'));
  var speed = Number.isFinite(speedSetting) && speedSetting >= 40 && speedSetting <= 160 ? speedSetting : 80;
  var demo = params.get('demo') === '1';
  var pending = new Map();
  var counter = 0;
  var refreshing = false;

  var ticker = document.createElement('aside');
  ticker.className = 'bottomline';
  ticker.setAttribute('aria-label', 'Continuously scrolling sports scores');
  ticker.innerHTML =
    '<div class="bottomline-identity"><span class="bottomline-dot"></span>SCORES' +
    '<small id="bottomline-status">CONNECTING</small></div>' +
    '<div class="bottomline-window"><div class="bottomline-track" id="bottomline-track">' +
    '<span class="bottomline-placeholder">Loading current ESPN scoreboards…</span>' +
    '</div></div>';
  document.body.appendChild(ticker);
  document.body.classList.add('ticker-active');
  var track = document.getElementById('bottomline-track');
  var indicator = document.getElementById('bottomline-status');

  if (root.chrome && root.chrome.webview && root.chrome.webview.addEventListener) {
    root.chrome.webview.addEventListener('message', function (event) {
      var message = event.data;
      if (!message || message.type !== 'api-response') return;
      var item = pending.get(message.requestId);
      if (!item) return;
      clearTimeout(item.timeout);
      pending.delete(message.requestId);
      if (message.ok) item.resolve(message.data);
      else item.reject(new Error(message.error || 'ESPN unavailable'));
    });
  }

  function request(url) {
    if (root.chrome && root.chrome.webview && root.chrome.webview.postMessage) {
      return new Promise(function (resolve, reject) {
        var id = 'ticker-' + ++counter;
        var timeout = setTimeout(function () {
          pending.delete(id);
          reject(new Error('ESPN request timed out'));
        }, 19000);
        pending.set(id, { resolve: resolve, reject: reject, timeout: timeout });
        root.chrome.webview.postMessage({ type: 'api', requestId: id, url: url });
      });
    }
    return fetch(url, { cache: 'no-cache' }).then(function (response) {
      if (!response.ok) throw new Error('ESPN HTTP ' + response.status);
      return response.json();
    });
  }

  async function fetchLeague(league) {
    var url = 'https://site.api.espn.com/apis/site/v2/sports/' + league.path +
      '/scoreboard?dates=' + dateKey(0) + '&limit=80';
    var payload = await request(url);
    var games = normalizeEvents(payload, league);
    if (!games.length) {
      payload = await request('https://site.api.espn.com/apis/site/v2/sports/' + league.path +
        '/scoreboard?dates=' + dateKey(1) + '&limit=80');
      games = normalizeEvents(payload, league);
    }
    return games.slice(0, 4);
  }

  function word(text, className) {
    var span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  }

  function appendTeam(container, name, logo) {
    if (logo) {
      var img = document.createElement('img');
      img.className = 'bottomline-logo';
      img.alt = '';
      img.src = logo;
      img.addEventListener('error', function () { img.style.display = 'none'; });
      container.appendChild(img);
    }
    container.appendChild(word(name, 'bottomline-team'));
  }

  function makeRun(games, message) {
    var run = document.createElement('div');
    run.className = 'bottomline-run';
    if (!games.length) {
      run.appendChild(word(message, 'bottomline-empty'));
      return run;
    }
    games.forEach(function (game) {
      var tile = document.createElement('div');
      tile.className = 'bottomline-game' + (game.kind === 'in' ? ' bottomline-live' : '');
      if (game.favorite) tile.className += ' bottomline-favorite';
      tile.appendChild(word(game.league, 'bottomline-league'));
      appendTeam(tile, game.away, game.awayLogo);
      tile.appendChild(word(game.score, 'bottomline-score'));
      appendTeam(tile, game.home, game.homeLogo);
      tile.appendChild(word(game.label, 'bottomline-detail'));
      run.appendChild(tile);
    });
    return run;
  }

  function render(games, message) {
    track.style.animation = 'none';
    var first = makeRun(games, message);
    var second = first.cloneNode(true);
    second.setAttribute('aria-hidden', 'true');
    track.replaceChildren(first, second);
    root.requestAnimationFrame(function () {
      // Each repeated run has identical width, yielding a seamless infinite loop.
      var width = first.getBoundingClientRect().width;
      track.style.setProperty('--bottomline-duration', Math.max(20, width / speed).toFixed(2) + 's');
      track.style.animation = '';
    });
  }

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      if (demo) {
        indicator.textContent = 'DEMO';
        render([], 'DESIGN PREVIEW — NO LIVE SCORES');
        return;
      }
      var results = await Promise.allSettled(LEAGUES.map(fetchLeague));
      var games = [];
      var successes = 0;
      results.forEach(function (result) {
        if (result.status === 'fulfilled') {
          successes++;
          games.push.apply(games, result.value);
        }
      });
      indicator.textContent = !successes ? 'OFFLINE' :
        successes < LEAGUES.length ? 'PARTIAL' : 'UPDATED';
      render(games, successes ? 'NO GAMES SCHEDULED TODAY OR TOMORROW' :
        'ESPN SCOREBOARDS UNAVAILABLE — CHECK CONNECTION');
    } finally {
      refreshing = false;
    }
  }

  refresh();
  root.setInterval(refresh, 5 * 60 * 1000);
})(typeof window !== 'undefined' ? window : globalThis);
