/* Four Monitor Command Center — no framework, no API key, no synthetic live data.
   Demo mode is opt-in (?demo=1) and clearly labeled as illustrative. */
(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const view = ['weather','sports','stocks','clocks'].includes(params.get('view')) ? params.get('view') : 'weather';
  const embedded = params.get('embedded') === '1';
  const demo = params.get('demo') === '1';
  const app = document.getElementById('app');
  const leagues = [
    { id:'nfl', name:'NFL', title:'PRO FOOTBALL', icon:'🏈', path:'football/nfl', max:4 },
    { id:'nba', name:'NBA', title:'PRO BASKETBALL', icon:'🏀', path:'basketball/nba', max:4 },
    { id:'nhl', name:'NHL', title:'PRO HOCKEY', icon:'🏒', path:'hockey/nhl', max:4 },
    { id:'mlb', name:'MLB', title:'PRO BASEBALL', icon:'⚾', path:'baseball/mlb', max:4 },
    { id:'cfb', name:'NCAA FB', title:'COLLEGE FOOTBALL', icon:'🏟️', path:'football/college-football', max:4 },
    { id:'cbb', name:'NCAA MBB', title:'COLLEGE BASKETBALL', icon:'🏀', path:'basketball/mens-college-basketball', max:4 }
  ];
  const cities = [
    {name:'Seattle',abbr:'SEA',lat:47.6062,lon:-122.3321},
    {name:'San Francisco',abbr:'SF',lat:37.7749,lon:-122.4194},
    {name:'Los Angeles',abbr:'LA',lat:34.0522,lon:-118.2437},
    {name:'Phoenix',abbr:'PHX',lat:33.4484,lon:-112.0740},
    {name:'Denver',abbr:'DEN',lat:39.7392,lon:-104.9903},
    {name:'Dallas',abbr:'DAL',lat:32.7767,lon:-96.7970},
    {name:'Chicago',abbr:'CHI',lat:41.8781,lon:-87.6298},
    {name:'Minneapolis',abbr:'MSP',lat:44.9778,lon:-93.2650},
    {name:'Atlanta',abbr:'ATL',lat:33.7490,lon:-84.3880},
    {name:'Miami',abbr:'MIA',lat:25.7617,lon:-80.1918},
    {name:'New York',abbr:'NYC',lat:40.7128,lon:-74.0060},
    {name:'Boston',abbr:'BOS',lat:42.3601,lon:-71.0589},
    {name:'Washington',abbr:'DC',lat:38.9072,lon:-77.0369},
    {name:'Houston',abbr:'HOU',lat:29.7604,lon:-95.3698},
    {name:'New Orleans',abbr:'NOLA',lat:29.9511,lon:-90.0715}
  ];
  const symbols = [
    {ticker:'SPY',name:'S&P 500 ETF',large:true},
    {ticker:'QQQ',name:'Nasdaq 100 ETF',large:true},
    {ticker:'DIA',name:'Dow Jones ETF',large:true},
    {ticker:'IWM',name:'Russell 2000 ETF',large:true},
    {ticker:'AAPL',name:'Apple'}, {ticker:'MSFT',name:'Microsoft'}, {ticker:'NVDA',name:'Nvidia'},
    {ticker:'AMZN',name:'Amazon'}, {ticker:'GOOGL',name:'Alphabet'}, {ticker:'TSLA',name:'Tesla'},
    {ticker:'META',name:'Meta'}, {ticker:'AMD',name:'Advanced Micro Devices'},
    {ticker:'V',name:'Visa'}, {ticker:'COST',name:'Costco'}
  ];
  const pending = new Map(); let requestSerial=0;
  const numeric = v => Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null;
  const round = v => numeric(v) == null ? '—' : String(Math.round(Number(v)));
  const safe = str => String(str??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clockFmt = (d,zone='America/Denver')=>new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'numeric',minute:'2-digit',hour12:true}).format(d);
  const dateFmt = (d,zone='America/Denver')=>new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',month:'short',day:'numeric'}).format(d);
  const todayKey = offset => {const d = new Date(Date.now()+offset*86400000);return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(d).replace(/\D/g,'');};
  const fmtMoney = v=>numeric(v)==null?'—':Number(v).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
  const nowTime = ()=>clockFmt(new Date())+' MT';
  const formatChange = v => numeric(v)==null?'—':(v>=0?'+':'')+Number(v).toFixed(2)+'%';
  const classChange = v => numeric(v)==null?'neutral':v>=0?'positive':'negative';
  const foot = (text)=>`<footer class="footer"><span>FOUR MONITOR COMMAND CENTER <span class="separator">/</span> ${text}</span><span>NO SCROLLING <span class="separator">·</span> LIVE FEEDS WHEN AVAILABLE</span></footer>`;
  const titles = {
    weather:['◎','USA WEATHER','LIVE CONDITIONS · COAST TO COAST'],
    sports:['◇','SCOREBOARD','NFL · NBA · NHL · MLB · NCAA'],
    stocks:['▤','MARKET WATCH','EOD QUOTES · NOT REAL-TIME'],
    clocks:['◷','TIME & PLAY','WORLD CLOCKS · CALENDAR · MINI GAMES']
  };
  const header = () => {
    const [icon,title,kicker]=titles[view];
    return `<header class="header"><div class="brand"><div class="brand-icon">${icon}</div><div><div class="eyebrow">${kicker}</div><div class="heading">${title}</div></div></div><div class="header-meta"><div><div class="stamp"><span class="live-dot"></span><span id="syncLabel">${demo?'DEMO / SAMPLE DATA':'INITIALIZING'}</span></div><div class="subtle" id="syncDetail">${demo?'Not current data':'Fetching sources'}</div></div><div class="time-header" id="headerClock">${nowTime()}</div></div></header>`;
  };
  const setSync=(label,detail)=>{const a=document.getElementById('syncLabel'),b=document.getElementById('syncDetail');if(a)a.textContent=label;if(b)b.textContent=detail||'';};
  function bridge(url){
    if(window.chrome?.webview?.postMessage){
      return new Promise((resolve,reject)=>{
        const requestId='f'+(++requestSerial);
        const timeout=setTimeout(()=>{pending.delete(requestId);reject(new Error('Request timed out'));},19000);
        pending.set(requestId,{resolve,reject,timeout});
        window.chrome.webview.postMessage({type:'api',requestId,url});
      });
    }
    return fetch(url,{cache:'no-cache'}).then(async response=>{
      if(!response.ok)throw new Error('HTTP '+response.status);
      return url.includes('stooq.com')?response.text():response.json();
    });
  }
  if(window.chrome?.webview?.addEventListener){
    window.chrome.webview.addEventListener('message',ev=>{
      const message=ev.data;
      if(message?.type!=='api-response')return;
      const entry=pending.get(message.requestId);
      if(!entry)return;
      clearTimeout(entry.timeout);pending.delete(message.requestId);
      message.ok?entry.resolve(message.data):entry.reject(new Error(message.error||'Data unavailable'));
    });
  }
  const weatherCode=code=>{
    if(code==null)return ['—','Unknown'];
    if(code===0)return ['☀','Clear sky'];
    if([1,2].includes(code))return ['⛅','Mostly clear'];
    if(code===3)return ['☁','Cloudy'];
    if([45,48].includes(code))return ['≋','Fog'];
    if(code>=51&&code<=67)return ['☂','Rain'];
    if(code>=71&&code<=86)return ['❄','Snow'];
    if(code>=95)return ['⚡','Thunderstorms'];
    return ['☁','Mixed clouds'];
  };
  function shell(main,source){app.innerHTML=header()+`<main class="main">${main}</main>`+foot(source);updateHeaderClock();}
  function updateHeaderClock(){const el=document.getElementById('headerClock');if(el)el.textContent=nowTime();}
  setInterval(updateHeaderClock,20000);

  // --- Weather. Coordinates: same ordered array as Open-Meteo multi-location API. ---
  const mapX = lon => 35+(lon+125)*(890/59);
  const mapY = lat => 45+(50-lat)*(422/26);
  const usPolygon = [
    [-124.7,48.5],[-123.7,46.9],[-124.3,43],[-123,41.7],[-122,40],[-121.6,38.5],[-120.2,36],
    [-119.3,34.6],[-117.1,32.5],[-111.1,31.3],[-108.3,31.3],[-106.6,31.8],[-104.3,29.6],
    [-103,28.9],[-101,29.1],[-99.8,26.3],[-97.4,25.8],[-96,28],[-93,29],[-90.3,29],
    [-88.1,30.3],[-85.1,29.9],[-82.6,27.4],[-81,25.1],[-80.2,25.2],[-80.1,28.5],
    [-81.1,30.6],[-80.4,32],[-78.1,34.8],[-77,36],[-75.4,36.2],[-75.1,38],
    [-74.3,39.5],[-72,41.3],[-70.5,42.8],[-70.6,44.1],[-69.2,44.4],[-69.1,47.1],
    [-71.6,45],[-73.5,45],[-75.3,44],[-77.5,43],[-79.1,43.1],[-79,42],[-80.5,41.5],
    [-82.6,41.7],[-83.2,42.3],[-84.7,42.6],[-85.4,43.5],[-87.8,45.4],[-89.4,46],
    [-90.1,47.6],[-92.5,48.4],[-95,49],[-101,49],[-108,49],[-115,49],[-119,49],[-124.7,48.5]
  ].map(([lon,lat])=>`${mapX(lon).toFixed(1)},${mapY(lat).toFixed(1)}`).join(' ');
  function weatherMarkup(){
    return `<div class="weather-main">
      <section class="panel us-map"><div class="panel-head"><span class="panel-title">Conditions across the United States</span><span class="panel-tag">${cities.length} CITIES</span></div>
        <div class="map-frame"><svg viewBox="0 0 1000 520" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map of US cities with current temperatures">
          <defs><pattern id="dots" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#7094b2" opacity=".23"/></pattern></defs>
          <polygon class="us-outline" points="${usPolygon}"/><polygon points="${usPolygon}" fill="url(#dots)" opacity=".36"/>
          ${cities.map((c,i)=>`<g class="map-node ${c.abbr==='DEN'?'denver':''}" id="map-${i}" transform="translate(${mapX(c.lon).toFixed(1)},${mapY(c.lat).toFixed(1)})"><circle r="21"/><text class="map-temp map-placeholder" y="6">—</text><text class="map-city" y="40">${c.abbr}</text></g>`).join('')}
          </svg><span class="map-legend">CURRENT TEMPERATURES · °F · SELECTED METRO AREAS</span></div></section>
      <section class="panel feature"><div><div class="feature-city">FEATURED CITY <span class="separator">/</span> DENVER, CO</div><div class="feature-icon" id="denIcon">☀</div><div class="feature-temp" id="denTemp">—°</div><div class="feature-desc" id="denDesc">Loading local conditions</div></div>
         <div><div class="feature-facts"><div class="fact"><small>FEELS LIKE</small><strong id="denFeel">—</strong></div><div class="fact"><small>WIND</small><strong id="denWind">—</strong></div><div class="fact"><small>HIGH / LOW</small><strong id="denHigh">—</strong></div><div class="fact"><small>PRECIP CHANCE</small><strong id="denRain">—</strong></div></div></div></section></div>
      <div class="city-grid" id="cityGrid">${cities.slice(0,12).map((c,i)=>`<div class="panel city-card ${c.abbr==='DEN'?'denver':''}" id="city-${i}"><div><div class="city-title">${c.name}</div><div class="city-sub">Loading…</div></div><div class="city-num">—°</div></div>`).join('')}</div>`;
  }
  function demoWeather(){return cities.map((c,i)=>({current:{temperature_2m:[56,63,71,80,52,76,49,46,70,83,58,52,61,78,77][i],apparent_temperature:49+i,relative_humidity_2m:46,wind_speed_10m:7,weather_code:[2,0,1,0,3,0,2,3,2,1,3,2,0,0,1][i]},daily:{temperature_2m_max:[66,71,75,85,59,79,54,53,74,86,63,58,68,82,80].slice(i,i+1),temperature_2m_min:[37,44,51,59,34,56,36,29,47,68,45,39,42,62,59].slice(i,i+1),precipitation_probability_max:[20].slice()}}));}
  function renderWeather(data){
    if(!Array.isArray(data)||data.length<cities.length)throw new Error('Incomplete multi-city weather response');
    data.forEach((w,i)=>{
      const c=w?.current||{}; const t=numeric(c.temperature_2m),m=document.getElementById(`map-${i}`);
      if(m){m.querySelector('.map-temp').textContent=t===null?'—':round(t)+'°';m.querySelector('.map-temp').classList.remove('map-placeholder');}
      const city=document.getElementById(`city-${i}`);
      if(city){city.querySelector('.city-sub').textContent=weatherCode(c.weather_code)[1];city.querySelector('.city-num').textContent=t===null?'—':round(t)+'°';}
    });
    const den=data[4],c=den.current,d=den.daily||{},[icon,condition]=weatherCode(c.weather_code);
    document.getElementById('denIcon').textContent=icon;
    document.getElementById('denTemp').textContent=round(c.temperature_2m)+'°';
    document.getElementById('denDesc').textContent=condition;
    document.getElementById('denFeel').textContent=round(c.apparent_temperature)+'°F';
    document.getElementById('denWind').textContent=round(c.wind_speed_10m)+' mph';
    document.getElementById('denHigh').textContent=round(d.temperature_2m_max?.[0])+'° / '+round(d.temperature_2m_min?.[0])+'°';
    document.getElementById('denRain').textContent=d.precipitation_probability_max?.[0]!=null?round(d.precipitation_probability_max[0])+'%':'—';
  }
  async function loadWeather(){
    try{
      const query=new URLSearchParams({latitude:cities.map(c=>c.lat).join(','),longitude:cities.map(c=>c.lon).join(','),current:'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code',daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max',timezone:'auto',temperature_unit:'fahrenheit',wind_speed_unit:'mph',forecast_days:'2'});
      const result=demo?demoWeather():await bridge('https://api.open-meteo.com/v1/forecast?'+query);
      renderWeather(result);
      setSync(demo?'DEMO / SAMPLE DATA':'WEATHER UPDATED',demo?'Illustration only':`15-city snapshot · ${nowTime()}`);
    }catch(err){setSync('WEATHER FEED UNAVAILABLE',err.message);document.getElementById('denDesc').textContent='Could not refresh Open-Meteo';}
  }
  // --- Scores from ESPN's unofficial scoreboard endpoints. ---
  const sportGroups = {};
  let scoresHidden=false;
  function sportsMarkup(){return `<div class="sports-summary"><div class="summary-pill">6 <span>LEAGUES</span></div><div class="summary-pill" id="scoreDate">TODAY / NEXT GAMES</div><div class="summary-pill">DENVER TEAMS PRIORITIZED</div><button id="scoresToggle" class="show-scores" type="button">Hide scores</button></div><div class="sports-grid">${leagues.map(l=>`<section class="panel league-card" id="league-${l.id}"><div class="league-head"><div class="league-icon">${l.icon}</div><div><div class="league-name">${l.name}</div><div class="league-caption">${l.title}</div></div><div class="league-count" id="count-${l.id}">…</div></div><div class="score-list" id="scores-${l.id}"><div class="empty">Fetching scoreboard…</div></div></section>`).join('')}</div>`;}
  const logos=(c)=>c?.team?.logo||c?.team?.logos?.[0]?.href||'';
  const isDenver=(c)=>/Denver|Colorado|Buffaloes|Air Force|Rockies|Avalanche|Nuggets|Broncos/i.test(`${c?.team?.displayName||''}`);
  function gameShape(event){
    const comp=event?.competitions?.[0]||{};
    const competitors=comp.competitors||[];
    const home=competitors.find(c=>c.homeAway==='home')||competitors[0]||{};
    const away=competitors.find(c=>c.homeAway==='away')||competitors[1]||{};
    const status=comp.status?.type||event.status?.type||{};
    return {id:event.id||'',name:event.name||'',date:event.date||comp.date,home,away,
      kind:status.state||'pre',detail:status.shortDetail||status.detail||'',
      denver:isDenver(home)||isDenver(away)};
  }
  function abbreviate(c){return (c?.team?.abbreviation||c?.team?.shortDisplayName||'—').slice(0,13);}
  function displayGames(id){
    const zone=document.getElementById('scores-'+id);if(!zone)return;
    const games=sportGroups[id]||[];
    if(!games.length){zone.innerHTML='<div class="empty"><strong>No scheduled games</strong><span>Nothing returned for today or tomorrow.</span></div>';return;}
    const count=Number(zone.dataset.page||0); const limit=4;
    const page=Math.floor(count % Math.max(1,Math.ceil(games.length/limit)));
    const slice=games.slice(page*limit,page*limit+limit);
    zone.innerHTML=slice.map(g=>{
      const logoA=logos(g.away),logoH=logos(g.home);
      const live=g.kind==='in';const final=g.kind==='post';
      const val= c=>typeof c?.score==='object'?(c.score.displayValue??c.score.value??'—'):(c?.score??'—');
      const score=live||final?(scoresHidden?'•• – ••':`${safe(val(g.away))} – ${safe(val(g.home))}`):'VS';
      let detail=live?'LIVE · '+g.detail:final?'FINAL':dateFmt(new Date(g.date))+' · '+clockFmt(new Date(g.date));
      return `<div class="score-row"><div class="teams-inline">${logoA?`<img class="team-logo" src="${safe(logoA)}" onerror="this.style.visibility='hidden'" alt="">`:''}<span class="team-name">${safe(abbreviate(g.away))}</span><span class="vs">@</span>${logoH?`<img class="team-logo" src="${safe(logoH)}" onerror="this.style.visibility='hidden'" alt="">`:''}<span class="team-name">${safe(abbreviate(g.home))}</span></div><div class="score-detail"><div class="score-value">${score}</div><div class="score-status ${live?'live':''}">${safe(detail)}</div></div></div>`;
    }).join('');
    zone.dataset.page=String(page+1);
  }
  function demoSports(leagueIndex){
    const seeds=[['DEN','KC'],['LAL','DEN'],['COL','DAL'],['COL','LAD'],['CU','UTAH'],['DUKE','UNC']];
    return Array.from({length:5},(_,i)=>{
      const away=seeds[leagueIndex][i%2], home=seeds[leagueIndex][(i+1)%2];
      return {id:String(i),date:new Date(Date.now()+i*3600e3).toISOString(),kind:i===0?'in':'pre',detail:i===0?'Q3 6:41':'',denver:i===0,away:{team:{abbreviation:away},score:21},home:{team:{abbreviation:home},score:24}};
    });
  }
  async function loadOneLeague(l,index){
    const zone=document.getElementById('scores-'+l.id);
    try{
      if(demo){sportGroups[l.id]=demoSports(index);}
      else{
        const url=(date)=>`https://site.api.espn.com/apis/site/v2/sports/${l.path}/scoreboard?dates=${date}&limit=80`;
        let result=await bridge(url(todayKey(0)));
        let events=Array.isArray(result?.events)?result.events:[];
        if(!events.length){result=await bridge(url(todayKey(1)));events=Array.isArray(result?.events)?result.events:[];}
        sportGroups[l.id]=events.map(gameShape).sort((a,b)=>
          Number(b.denver)-Number(a.denver)||new Date(a.date)-new Date(b.date));
      }
      document.getElementById('count-'+l.id).textContent=(sportGroups[l.id]||[]).length+' games';
      if(zone)zone.dataset.page='0';displayGames(l.id);
    }catch(err){
      if(zone)zone.innerHTML=`<div class="empty"><strong>Scoreboard unavailable</strong><span>${safe(err.message)}</span></div>`;
      document.getElementById('count-'+l.id).textContent='offline';
    }
  }
  async function loadSports(){
    await Promise.all(leagues.map(loadOneLeague));
    setSync(demo?'DEMO / SAMPLE DATA':'SCOREBOARDS REFRESHED',demo?'Illustration only':`ESPN unofficial API · ${nowTime()}`);
  }
  // --- Market: Stooq end-of-day CSV, not exchange real-time. ---
  function stocksMarkup(){
    return `<div class="market-note">END-OF-DAY / DELAYED MARKET DATA · SPY, QQQ, DIA AND IWM ARE ETFs (INDEX PROXIES), NOT THE INDICES THEMSELVES · NO TRADING FEATURES</div><div class="market-hero" id="marketHero">${symbols.filter(s=>s.large).map(s=>`<section class="panel market-lead" id="stock-${s.ticker}"><div><div class="market-ticker">${s.ticker}</div><div class="market-full">${s.name}</div></div><div class="market-price">—</div><div class="market-change neutral">Loading…</div></section>`).join('')}</div><div class="market-minis" id="marketMinis">${symbols.filter(s=>!s.large).map(s=>`<section class="panel market-mini" id="stock-${s.ticker}"><div class="market-mini-head"><span class="mini-symbol">${s.ticker}</span><span class="mini-name">${s.name}</span></div><div class="mini-price">—</div><svg class="sparkline" viewBox="0 0 140 50" preserveAspectRatio="none"></svg><div class="market-mini-foot"><span class="stock-date">EOD</span><b class="neutral">—</b></div></section>`).join('')}</div>`;
  }
  const stooqSymbol = ticker => ticker.toLowerCase().replace('-','.')+'.us';
  function parseStooqCsv(csv){
    if(typeof csv!=='string'||!csv.trim().startsWith('Date,'))throw new Error('CSV unavailable');
    const values=csv.trim().split(/\r?\n/).slice(1).map(s=>s.split(','));
    const rows=values.filter(row=>row.length>=5 && /^\d{4}-\d\d-\d\d$/.test(row[0]) && numeric(row[4])!==null).sort((a,b)=>a[0].localeCompare(b[0]));
    if(rows.length<2)throw new Error('Insufficient quote history');
    const last=rows.at(-1),prev=rows.at(-2);
    const price=Number(last[4]),baseline=Number(prev[4]);
    return {price,change:baseline?(price-baseline)/baseline*100:null,date:last[0],points:rows.slice(-24).map(v=>Number(v[4]))};
  }
  function parseYahooChart(data){
    const result=data?.chart?.result?.[0];
    const times=result?.timestamp||[];
    const closes=result?.indicators?.quote?.[0]?.close||[];
    const rows=times.map((t,i)=>({time:t,close:numeric(closes[i])})).filter(r=>r.close!==null);
    if(rows.length<2)throw new Error('Yahoo daily price history unavailable');
    const latest=rows.at(-1),previous=rows.at(-2);
    return {price:latest.close,change:previous.close?100*(latest.close-previous.close)/previous.close:null,
      date:new Date(latest.time*1000).toISOString().slice(0,10),points:rows.slice(-24).map(r=>r.close),source:'Yahoo daily'};
  }
  const sparkSvg=(points,rising)=>{
    if(!Array.isArray(points)||points.length<2)return '';
    const min=Math.min(...points),max=Math.max(...points),span=Math.max(max-min,.001);
    const poly=points.map((p,i)=>`${(2+i*136/(points.length-1)).toFixed(1)},${(45-(p-min)/span*39).toFixed(1)}`).join(' ');
    return `<polyline points="${poly}" stroke="${rising?'#83c5ad':'#e68d8c'}"/>`;
  };
  function renderStock(s,q){
    const el=document.getElementById('stock-'+s.ticker); if(!el)return;
    const change=classChange(q?.change),txt=formatChange(q?.change);
    el.querySelector(s.large?'.market-price':'.mini-price').textContent=q?fmtMoney(q.price):'Unavailable';
    if(s.large){const d=el.querySelector('.market-change');d.textContent=q?txt+' · '+q.date:'Quote unavailable';d.className='market-change '+change;}
    else{
      el.querySelector('.sparkline').innerHTML=q?sparkSvg(q.points,q.change>=0):'';
      const d=el.querySelector('.market-mini-foot b');d.textContent=q?txt:'—';d.className=change;
      el.querySelector('.stock-date').textContent=q?q.date:'No quote';
    }
  }
  function demoStock(s,i){const base=[693,622,468,250,298,530,192,238,310,410,672,502,325,980][i];const points=Array.from({length:22},(_,j)=>base*(1+.004*Math.sin(j/2+i)+.001*j*(i%2?1:-1)));return{price:points.at(-1),change:(points.at(-1)-points.at(-2))/points.at(-2)*100,date:'SAMPLE',points};}
  async function loadStocks(){
    let okay=0;
    const start=new Date(Date.now()-58*864e5), dateKey=start.toISOString().slice(0,10).replace(/-/g,'');
    const tasks=symbols.map((s,i)=>async()=>{
      try{
        let quote;
        if(demo) quote=demoStock(s,i);
        else {
          try {quote=parseStooqCsv(await bridge(`https://stooq.com/q/d/l/?s=${stooqSymbol(s.ticker)}&i=d&d1=${dateKey}`));}
          catch {quote=parseYahooChart(await bridge(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.ticker)}?range=1mo&interval=1d`));}
        }
        renderStock(s,quote);okay++;
      }catch(err){renderStock(s,null);}
    });
    // Small sequential batches prevent hammering a public endpoint and triggering its rate limit.
    for(let i=0;i<tasks.length;i+=2){await Promise.all(tasks.slice(i,i+2).map(fn=>fn()));if(i+2<tasks.length&&!demo)await new Promise(r=>setTimeout(r,650));}
    setSync(demo?'DEMO / SAMPLE DATA':okay?'MARKETS UPDATED':'PRICE FEED UNAVAILABLE',demo?'Illustration only':`${okay}/${symbols.length} daily quotes · Stooq / Yahoo · ${nowTime()}`);
  }
  // --- World clocks, preview games and monthly calendar. ---
  const zones=[{name:'DENVER',zone:'America/Denver'},{name:'NEW YORK',zone:'America/New_York'},
    {name:'LOS ANGELES',zone:'America/Los_Angeles'},{name:'LONDON',zone:'Europe/London'},
    {name:'TOKYO',zone:'Asia/Tokyo'}];
  let monthOffset=0;
  function analogMarkup(){return `<div class="analog" id="analog">${[12,3,6,9].map((n,i)=>{
    const points=[[50,11],[89,50],[50,89],[11,50]];return `<span class="number" style="left:${points[i][0]}%;top:${points[i][1]}%">${n}</span>`;
  }).join('')}<span id="hourHand" class="hand hour"></span><span id="minuteHand" class="hand minute"></span><span id="secondHand" class="hand second"></span><span class="center-pin"></span></div>`;}
  function clocksMarkup(){
    return `<div class="clock-layout"><section class="panel clock-left"><div class="section-label">MOUNTAIN TIME · DENVER</div><div class="denver-clock-big">${analogMarkup()}<div class="big-digital" id="bigDigital">--:--:--</div><div class="date-full" id="fullDate">Loading date</div></div><div class="world-clock-row">${zones.slice(1).map(z=>`<div class="world-clock"><span class="mini-analog" data-analog-zone="${z.zone}"><i class="micro-hour"></i><i class="micro-minute"></i><i class="micro-pin"></i></span><div class="world-clock-info"><span>${z.name}</span><b data-zone="${z.zone}">—</b></div></div>`).join('')}</div></section>
      <section class="panel games-center"><div class="games-caption"><span class="panel-title">DESKTOP MINI GAMES</span><span class="panel-tag">TIC TAC TOE + 2048</span></div><div class="games-zone" id="gameZone">${embedded?`<div class="native-placeholder"><div class="big">TWO GAMES · READY</div><div>Native clickable desktop panels launch here.<br>Use the tray icon to hide or restore games.</div></div>`:previewGamesMarkup()}</div></section>
      <section class="panel calendar"><div class="calendar-head"><div><div class="section-label">MONTHLY CALENDAR</div><div class="cal-month" id="calMonth">Loading…</div></div><div class="calendar-nav"><button id="prevMonth" title="Previous month">‹</button><button id="todayMonth" title="Current month">●</button><button id="nextMonth" title="Next month">›</button></div></div><div class="calendar-grid" id="calendarGrid"></div><div class="calendar-bottom"><span>Local calendar · Denver time</span><span>No account integration</span></div></section></div>`;
  }
  function drawClocks(){
    const date=new Date(), dt=new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true}).format(date);
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',hour:'numeric',minute:'numeric',second:'numeric',hourCycle:'h23'}).formatToParts(date);
    const obj=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
    const h=(obj.hour%12)*30+obj.minute/2,m=obj.minute*6+obj.second*.1,s=obj.second*6;
    for(const [id,angle] of [['hourHand',h],['minuteHand',m],['secondHand',s]]){const el=document.getElementById(id);if(el)el.style.transform=`rotate(${angle}deg)`;}
    const digital=document.getElementById('bigDigital');if(digital)digital.textContent=dt;
    const long=document.getElementById('fullDate');if(long)long.textContent=new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(date);
    document.querySelectorAll('[data-zone]').forEach(el=>el.textContent=clockFmt(date,el.dataset.zone));
    document.querySelectorAll('[data-analog-zone]').forEach(el=>{
      const z=el.dataset.analogZone;
      const parts=new Intl.DateTimeFormat('en-US',{timeZone:z,hour:'numeric',minute:'numeric',hourCycle:'h23'}).formatToParts(date);
      const values=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
      el.querySelector('.micro-hour').style.transform=`rotate(${(values.hour%12)*30+values.minute/2}deg)`;
      el.querySelector('.micro-minute').style.transform=`rotate(${values.minute*6}deg)`;
    });
  }
  function denverDate(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const o=Object.fromEntries(parts.filter(v=>v.type!=='literal').map(v=>[v.type,Number(v.value)]));return new Date(o.year,o.month-1,o.day);}
  function drawCalendar(){
    const now=denverDate(),date=new Date(now.getFullYear(),now.getMonth()+monthOffset,1);
    document.getElementById('calMonth').textContent=date.toLocaleString('en-US',{month:'long',year:'numeric'});
    const first=date.getDay(),days=new Date(date.getFullYear(),date.getMonth()+1,0).getDate();
    const previous=new Date(date.getFullYear(),date.getMonth(),0).getDate();
    const labels=['SUN','MON','TUE','WED','THU','FRI','SAT'].map(x=>`<div class="cal-day-name">${x}</div>`).join('');
    const daysHtml=Array.from({length:42},(_,i)=>{
      const day=i-first+1; const dayNum=day<1?previous+day:day>days?day-days:day;
      const muted=day<1||day>days;
      const today=!muted&&date.getMonth()===now.getMonth()&&date.getFullYear()===now.getFullYear()&&day===now.getDate();
      return `<div class="cal-day ${muted?'muted':''} ${today?'today':''}">${dayNum}</div>`;
    }).join('');
    document.getElementById('calendarGrid').innerHTML=labels+daysHtml;
  }
  // In the interactive preview only. The on-desktop versions are native WinForms.
  function previewGamesMarkup(){return `<div class="game-preview"><h3>TIC TAC TOE</h3><div class="ttt-grid" id="previewTTT">${Array.from({length:9},(_,i)=>`<button class="ttt-cell" data-cell="${i}"></button>`).join('')}</div><div class="game-message" id="tttMessage">Your turn · X</div><div class="game-controls"><button id="tttReset">NEW GAME</button></div></div><div class="game-preview"><h3>2048 <span id="score2048" style="float:right;font-size:10px;color:#bbc9d6">0 pts</span></h3><div class="puzzle-grid" id="preview2048">${Array.from({length:16},(_,i)=>`<div class="puzzle-tile" data-pos="${i}"></div>`).join('')}</div><div class="game-controls"><button data-move="left">◀</button><button data-move="up">▲</button><button data-move="down">▼</button><button data-move="right">▶</button><button id="reset2048">NEW</button></div></div>`;}
  let tttBoard=Array(9).fill(''),tttDone=false;
  const wins=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const tttResult=()=>{for(const w of wins){if(tttBoard[w[0]]&&w.every(i=>tttBoard[i]===tttBoard[w[0]]))return tttBoard[w[0]];}return tttBoard.every(Boolean)?'D':'';};
  function tttPaint(){document.querySelectorAll('#previewTTT [data-cell]').forEach(el=>el.textContent=tttBoard[Number(el.dataset.cell)]);const result=tttResult();const el=document.getElementById('tttMessage');if(el)el.textContent=result?(result==='D'?'Draw!':result==='X'?'You win!':'Computer wins'):'Your turn · X';tttDone=!!result;}
  function tttPlay(i){if(tttDone||tttBoard[i])return;tttBoard[i]='X';if(!tttResult()){
    const move=tttBoard.findIndex((v,k)=>!v&&wins.some(line=>line.includes(k)&&line.filter(j=>tttBoard[j]==='O').length===2));
    const block=tttBoard.findIndex((v,k)=>!v&&wins.some(line=>line.includes(k)&&line.filter(j=>tttBoard[j]==='X').length===2));
    const choices=[move,block,4,0,2,6,8,1,3,5,7];const position=choices.find(k=>k>=0&&!tttBoard[k]);if(position!==undefined)tttBoard[position]='O';
  }tttPaint();}
  let puzzle=Array(16).fill(0),puzzleScore=0;
  function addTile(){const open=puzzle.map((n,i)=>n===0?i:-1).filter(i=>i>=0);if(open.length)puzzle[open[Math.floor(Math.random()*open.length)]]=Math.random()<.9?2:4;}
  function paintPuzzle(){document.querySelectorAll('#preview2048 [data-pos]').forEach(el=>{const v=puzzle[Number(el.dataset.pos)];el.textContent=v||'';});const el=document.getElementById('score2048');if(el)el.textContent=puzzleScore+' pts';}
  function slidePuzzle(direction){const old=puzzle.slice();for(let lane=0;lane<4;lane++){
    const indices=Array.from({length:4},(_,i)=>direction==='left'?lane*4+i:direction==='right'?lane*4+3-i:direction==='up'?i*4+lane:(3-i)*4+lane);
    const line=indices.map(i=>puzzle[i]).filter(Boolean);const result=[];
    for(let j=0;j<line.length;j++){if(line[j]===line[j+1]){result.push(line[j]*2);puzzleScore+=line[j]*2;j++;}else result.push(line[j]);}
    indices.forEach((n,j)=>puzzle[n]=result[j]||0);
  }if(puzzle.some((n,i)=>n!==old[i]))addTile();paintPuzzle();}
  function bindClocks(){
    for(const [id,offset] of [['prevMonth',-1],['nextMonth',1],['todayMonth',0]]){
      document.getElementById(id)?.addEventListener('click',()=>{monthOffset=offset===0?0:monthOffset+offset;drawCalendar();});
    }
    document.getElementById('previewTTT')?.addEventListener('click',ev=>{const cell=ev.target.closest('[data-cell]');if(cell)tttPlay(Number(cell.dataset.cell));});
    document.getElementById('tttReset')?.addEventListener('click',()=>{tttBoard=Array(9).fill('');tttDone=false;tttPaint();});
    document.querySelectorAll('[data-move]').forEach(button=>button.addEventListener('click',()=>slidePuzzle(button.dataset.move)));
    document.getElementById('reset2048')?.addEventListener('click',()=>{puzzle=Array(16).fill(0);puzzleScore=0;addTile();addTile();paintPuzzle();});
    document.addEventListener('keydown',ev=>{if(ev.key.startsWith('Arrow')){slidePuzzle(ev.key.slice(5).toLowerCase());ev.preventDefault();}});
    addTile();addTile();paintPuzzle();tttPaint();drawCalendar();drawClocks();
    setInterval(drawClocks,1000);setInterval(()=>{if(monthOffset===0)drawCalendar();},60000);
    setSync('LOCAL CLOCKS ACTIVE','System clock · America/Denver');
  }
  function boot(){
    if(view==='weather'){shell(weatherMarkup(),'OPEN-METEO · CURRENT CONDITIONS & FORECASTS');loadWeather();setInterval(loadWeather,10*60*1000);}
    else if(view==='sports'){shell(sportsMarkup(),'ESPN SCOREBOARDS · UNOFFICIAL DATA');document.getElementById('scoresToggle').addEventListener('click',()=>{scoresHidden=!scoresHidden;document.getElementById('scoresToggle').textContent=scoresHidden?'Show scores':'Hide scores';leagues.forEach(l=>{const z=document.getElementById('scores-'+l.id);if(z)z.dataset.page=String(Math.max(0,Number(z.dataset.page||1)-1));displayGames(l.id);});});loadSports();setInterval(loadSports,2*60*1000);setInterval(()=>leagues.forEach(l=>displayGames(l.id)),18000);}
    else if(view==='stocks'){shell(stocksMarkup(),'STOOQ · DAILY CLOSES · FEED MAY BE DELAYED');loadStocks();setInterval(loadStocks,20*60*1000);}
    else {shell(clocksMarkup(),'SYSTEM TIME · NO EXTERNAL LOGIN REQUIRED');bindClocks();}
  }
  boot();
  // Minimal pure helpers exported for automated no-network tests.
  window.__commandCenter={view,parseStooqCsv,parseYahooChart,gameShape,weatherCode,stooqSymbol,todayKey,sparkSvg};
})();
