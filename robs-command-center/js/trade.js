// Page 1: Trading Desk — chart, consensus signal, trade plan, trader cards.
const Trade = (() => {
  const $ = (id) => document.getElementById(id);
  const LS = 'rcc.trade';
  const saved = (() => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } })();
  const state = {
    symbol: saved.symbol || 'PAXGUSDT',
    interval: saved.interval || '4h',
    overlays: new Set(saved.overlays || ['sma']),
    view: 'signals',
    active: saved.active || 'macd',
    custom: null, // { name, bars } when a CSV is loaded
    bars: [], result: null, timer: null,
  };
  const save = () => { try { localStorage.setItem(LS, JSON.stringify({ symbol: state.symbol, interval: state.interval, overlays: [...state.overlays], active: state.active })); } catch { /* ignore */ } };

  let chart, rsiChart, candle, series = {}, rsiSeries;

  const decimals = (p) => p >= 1000 ? 2 : p >= 10 ? 2 : p >= 1 ? 4 : 5;
  const money = (v, d) => v == null ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

  function initCharts() {
    const opts = {
      layout: { background: { color: 'transparent' }, textColor: '#8b95a7', fontFamily: 'Inter, system-ui, sans-serif' },
      grid: { vertLines: { color: 'rgba(35,44,61,.6)' }, horzLines: { color: 'rgba(35,44,61,.6)' } },
      rightPriceScale: { borderColor: '#232c3d' },
      timeScale: { borderColor: '#232c3d', timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
      autoSize: true,
    };
    chart = LightweightCharts.createChart($('chart'), opts);
    candle = chart.addCandlestickSeries({ upColor: '#26c281', downColor: '#f0556a', borderVisible: false, wickUpColor: '#26c281', wickDownColor: '#f0556a' });
    const line = (color, width = 2, style = 0) => chart.addLineSeries({ color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    series.sma50 = line('#e9b949');
    series.sma200 = line('#6c8cff');
    series.ema20 = line('#c77dff', 1);
    series.bbU = line('rgba(139,149,167,.7)', 1, 2);
    series.bbM = line('rgba(139,149,167,.45)', 1);
    series.bbL = line('rgba(139,149,167,.7)', 1, 2);

    rsiChart = LightweightCharts.createChart($('rsiChart'), { ...opts, timeScale: { ...opts.timeScale, visible: false }, handleScale: false });
    rsiSeries = rsiChart.addLineSeries({ color: '#e9b949', lineWidth: 2, priceLineVisible: false });
    rsiSeries.createPriceLine({ price: 70, color: '#f0556a', lineStyle: 2, lineWidth: 1, axisLabelVisible: true });
    rsiSeries.createPriceLine({ price: 30, color: '#26c281', lineStyle: 2, lineWidth: 1, axisLabelVisible: true });
    rsiChart.priceScale('right').applyOptions({ scaleMargins: { top: .1, bottom: .1 }, minimumWidth: 70 });
    chart.priceScale('right').applyOptions({ minimumWidth: 70 });

    let syncing = false;
    const sync = (from, to) => from.timeScale().subscribeVisibleLogicalRangeChange(r => {
      if (syncing || !r) return; syncing = true; to.timeScale().setVisibleLogicalRange(r); syncing = false;
    });
    sync(chart, rsiChart); sync(rsiChart, chart);
  }

  const toLine = (bars, arr) => bars.map((b, i) => arr[i] == null ? null : { time: b.time, value: arr[i] }).filter(Boolean);

  function render() {
    const bars = state.bars;
    if (!bars.length) return;
    const r = state.result = Strategies.evaluate(bars);
    const x = r.ctx;
    const last = bars[bars.length - 1], d = decimals(last.close);
    const pf = { type: 'price', precision: d, minMove: 1 / 10 ** d };
    candle.applyOptions({ priceFormat: pf });
    candle.setData(bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));

    const show = (key, s, data) => { s.setData(state.overlays.has(key) ? data : []); };
    show('sma', series.sma50, toLine(bars, x.sma50));
    show('sma', series.sma200, toLine(bars, x.sma200));
    show('ema', series.ema20, toLine(bars, x.ema20));
    show('bb', series.bbU, toLine(bars, x.bb.upper));
    show('bb', series.bbM, toLine(bars, x.bb.mid));
    show('bb', series.bbL, toLine(bars, x.bb.lower));
    rsiSeries.setData(toLine(bars, x.rsi));

    // Header price
    const ref = state.custom ? bars[bars.length - 2].close : (state.day0 ?? bars[bars.length - 2].close);
    const chg = (last.close - ref) / ref * 100;
    $('lastPrice').textContent = money(last.close, d);
    $('lastChange').textContent = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%${state.custom ? ' last bar' : ' 24h'}`;
    $('lastChange').className = 'chg ' + (chg >= 0 ? 'up' : 'down');

    renderVerdict(r);
    renderPlan(r, d);
    renderCards(r, d);
    renderMarkers();
  }

  function renderVerdict(r) {
    const v = $('verdictValue');
    v.textContent = r.label;
    v.className = 'verdict-value ' + r.side;
    $('meterFill').style.left = `${(r.score + 1) * 50}%`;
    $('tally').innerHTML = `
      <div style="color:var(--buy)"><b>${r.tally.buy}</b>Buy</div>
      <div style="color:var(--neutral)"><b>${r.tally.neutral}</b>Neutral</div>
      <div style="color:var(--sell)"><b>${r.tally.sell}</b>Sell</div>`;
  }

  function renderPlan(r, d) {
    const x = r.ctx, i = x.last, c = x.c[i], a = x.atr[i];
    const body = $('planBody');
    if (a == null) { body.textContent = 'Not enough data.'; return; }
    if (r.side === 'neutral') {
      body.innerHTML = `<p style="margin:0">No clear edge — the traders disagree. Most of them would wait.</p>
        <div class="plan-row"><span>Volatility (ATR 14)</span><span>${money(a, d)}</span></div>
        <div class="plan-row"><span>Watch for break above</span><span>${money(x.dHigh[i], d)}</span></div>
        <div class="plan-row"><span>Watch for break below</span><span>${money(x.dLow[i], d)}</span></div>`;
      return;
    }
    const dir = r.side === 'buy' ? 1 : -1, risk = 1.5 * a;
    const stop = c - dir * risk;
    body.innerHTML = `
      <div class="plan-row"><span>Bias</span><span style="color:var(--${r.side})">${r.side === 'buy' ? 'Long' : 'Short'}</span></div>
      <div class="plan-row"><span>Entry (last close)</span><span>${money(c, d)}</span></div>
      <div class="plan-row"><span>Stop loss (1.5× ATR)</span><span>${money(stop, d)}</span></div>
      <div class="plan-row"><span>Target 1 (1R)</span><span>${money(c + dir * risk, d)}</span></div>
      <div class="plan-row"><span>Target 2 (2R)</span><span>${money(c + dir * risk * 2, d)}</span></div>
      <div class="plan-row"><span>Target 3 (3R)</span><span>${money(c + dir * risk * 3, d)}</span></div>
      <div class="plan-note">Risk per unit: ${money(risk, d)}. Many pros risk 1% or less of their account per trade.</div>`;
  }

  function renderCards(r, d) {
    const x = r.ctx;
    $('strategies').innerHTML = r.results.map(s => {
      const lastSig = s.signals[s.signals.length - 1];
      let lastTxt = 'No signals in this window.';
      if (lastSig) {
        const ago = x.last - lastSig.i, at = x.c[lastSig.i], move = (x.c[x.last] - at) / at * 100 * (lastSig.side === 'buy' ? 1 : -1);
        lastTxt = `Last: <b style="color:var(--${lastSig.side})">${lastSig.side.toUpperCase()}</b> ${ago === 0 ? 'this bar' : ago + ' bars ago'} at ${money(at, d)} · ${move >= 0 ? '+' : ''}${move.toFixed(2)}% since`;
      }
      return `<div class="strat ${s.id === state.active ? 'active' : ''}" data-id="${s.id}" role="button" tabindex="0">
        <div class="strat-top"><span class="strat-name">${s.name}</span><span class="badge ${s.side}">${s.label}</span></div>
        <div class="strat-trader">${s.trader}</div>
        <div class="strat-reason">${s.reason}</div>
        <div class="strat-rule">Rule: ${s.rule}</div>
        <div class="strat-last">${lastTxt}</div>
      </div>`;
    }).join('');
  }

  function renderMarkers() {
    const r = state.result; if (!r) return;
    const s = r.results.find(z => z.id === state.active);
    if (!s) { candle.setMarkers([]); return; }
    const markers = s.signals.slice(-60).map(sig => ({
      time: state.bars[sig.i].time,
      position: sig.side === 'buy' ? 'belowBar' : 'aboveBar',
      color: sig.side === 'buy' ? '#26c281' : '#f0556a',
      shape: sig.side === 'buy' ? 'arrowUp' : 'arrowDown',
      text: sig.side === 'buy' ? 'B' : 'S',
    }));
    candle.setMarkers(markers);
    $('markerNote').innerHTML = `Arrows show <b>${s.name}</b> (${s.trader}) signals. Tap another card to switch.`;
  }

  async function load(fit = true) {
    if (state.custom) return;
    $('dataSource').textContent = 'Loading…';
    try {
      const [{ source, bars }, t] = await Promise.all([Data.candles(state.symbol, state.interval), Data.ticker24h(state.symbol)]);
      state.bars = bars;
      state.day0 = t ? +t.openPrice : null;
      render();
      if (fit) { chart.timeScale().setVisibleLogicalRange({ from: bars.length - 150, to: bars.length + 3 }); }
      $('dataSource').textContent = `Live · ${source} · updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch (e) {
      $('dataSource').textContent = 'Could not reach market data. Check your connection, or upload a CSV.';
    }
  }

  function setActive(group, val) {
    group.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === val));
  }

  function tvSymbol() {
    const opt = $('symbol').selectedOptions[0];
    return opt ? opt.dataset.tv : 'OANDA:XAUUSD';
  }

  function updateTitle() {
    $('symTitle').textContent = state.custom ? `Your chart · ${state.custom.name}` : $('symbol').selectedOptions[0].textContent;
  }

  function bind() {
    $('symbol').value = state.symbol;
    setActive($('interval'), state.interval);
    $('overlays').querySelectorAll('button').forEach(b => b.classList.toggle('on', state.overlays.has(b.dataset.v)));

    $('symbol').addEventListener('change', () => {
      state.symbol = $('symbol').value; state.custom = null; save(); updateTitle(); load();
      if (state.view === 'pro') Widgets.proChart($('tvPro'), tvSymbol(), state.interval);
    });
    $('interval').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      state.interval = b.dataset.v; state.custom = null; setActive($('interval'), state.interval); save(); updateTitle(); load();
      if (state.view === 'pro') Widgets.proChart($('tvPro'), tvSymbol(), state.interval);
    });
    $('overlays').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const v = b.dataset.v;
      state.overlays.has(v) ? state.overlays.delete(v) : state.overlays.add(v);
      b.classList.toggle('on'); save(); render();
    });
    $('viewMode').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      state.view = b.dataset.v; setActive($('viewMode'), state.view);
      $('signalView').hidden = state.view !== 'signals';
      $('proView').hidden = state.view !== 'pro';
      if (state.view === 'pro') Widgets.proChart($('tvPro'), tvSymbol(), state.interval);
    });
    const pick = e => {
      const card = e.target.closest('.strat'); if (!card) return;
      state.active = card.dataset.id; save();
      document.querySelectorAll('.strat').forEach(c => c.classList.toggle('active', c === card));
      renderMarkers();
      if (state.view !== 'signals') $('viewMode').querySelector('[data-v=signals]').click();
      $('chart').scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    $('strategies').addEventListener('click', pick);
    $('strategies').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e); } });

    $('csvFile').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const bars = Data.parseCSV(await f.text());
        state.custom = { name: f.name, bars }; state.bars = bars;
        updateTitle(); render();
        chart.timeScale().fitContent();
        $('dataSource').innerHTML = `${bars.length} bars from your file · <a href="#" id="backLive" style="color:var(--gold)">back to live</a>`;
        $('backLive').onclick = (ev) => { ev.preventDefault(); state.custom = null; updateTitle(); load(); };
      } catch (err) {
        alert('Could not read that file: ' + err.message + '\n\nExpected columns: Date (and optional Time), Open, High, Low, Close.');
      }
      e.target.value = '';
    });
  }

  function init() {
    initCharts();
    bind();
    updateTitle();
    load();
    state.timer = setInterval(() => { if (!document.hidden && !state.custom) load(false); }, 60000);
  }

  return { init };
})();
