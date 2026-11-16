// Free TradingView embeds (live news, calendar, ticker tape, full drawing chart).
const Widgets = (() => {
  function embed(container, file, config) {
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'tradingview-widget-container';
    const inner = document.createElement('div');
    inner.className = 'tradingview-widget-container__widget';
    wrap.appendChild(inner);
    const s = document.createElement('script');
    s.src = `https://s3.tradingview.com/external-embedding/${file}`;
    s.async = true;
    s.textContent = JSON.stringify(config);
    wrap.appendChild(s);
    container.appendChild(wrap);
  }

  const tickerTape = (el) => embed(el, 'embed-widget-ticker-tape.js', {
    symbols: [
      { proName: 'OANDA:XAUUSD', title: 'Gold' },
      { proName: 'OANDA:XAGUSD', title: 'Silver' },
      { proName: 'TVC:DXY', title: 'US Dollar Index' },
      { proName: 'TVC:US10Y', title: 'US 10Y Yield' },
      { proName: 'FOREXCOM:SPXUSD', title: 'S&P 500' },
      { proName: 'BITSTAMP:BTCUSD', title: 'Bitcoin' },
      { proName: 'FX:EURUSD', title: 'EUR/USD' },
      { proName: 'TVC:USOIL', title: 'Crude Oil' },
    ],
    showSymbolLogo: true, isTransparent: true, displayMode: 'adaptive', colorTheme: 'dark', locale: 'en',
  });

  const timeline = (el, symbol = 'OANDA:XAUUSD') => embed(el, 'embed-widget-timeline.js', {
    feedMode: 'symbol', symbol, isTransparent: true, displayMode: 'regular', width: '100%', height: 560, colorTheme: 'dark', locale: 'en',
  });

  const calendar = (el) => embed(el, 'embed-widget-events.js', {
    colorTheme: 'dark', isTransparent: true, width: '100%', height: 520, locale: 'en', importanceFilter: '0,1', countryFilter: 'us,eu,gb,cn,jp',
  });

  let tvLoading;
  function proChart(el, symbol, interval) {
    const map = { '15m': '15', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W' };
    const make = () => new window.TradingView.widget({
      container_id: el.id, symbol, interval: map[interval] || '240', autosize: true, theme: 'dark', style: '1', locale: 'en',
      toolbar_bg: '#121722', enable_publishing: false, allow_symbol_change: true, hide_side_toolbar: false,
      studies: ['RSI@tv-basicstudies', 'MACD@tv-basicstudies'], backgroundColor: '#121722',
    });
    if (window.TradingView) return make();
    tvLoading = tvLoading || new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = 'https://s3.tradingview.com/tv.js';
      s.onload = ok; s.onerror = fail;
      document.head.appendChild(s);
    });
    tvLoading.then(make).catch(() => { el.innerHTML = '<p class="muted">Could not load the TradingView chart.</p>'; });
  }

  return { tickerTape, timeline, calendar, proChart };
})();
