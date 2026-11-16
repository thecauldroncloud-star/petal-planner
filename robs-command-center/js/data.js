// Market data: free public Binance candles (no API key) + CSV upload of your own chart.
const Data = (() => {
  const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com', 'https://api.binance.us'];

  async function candles(symbol, interval, limit = 500) {
    let lastErr;
    for (const host of HOSTS) {
      try {
        const res = await fetch(`${host}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json();
        if (!Array.isArray(rows) || !rows.length) throw new Error('No data');
        return {
          source: host.replace('https://', ''),
          bars: rows.map(r => ({ time: Math.floor(r[0] / 1000), open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] })),
        };
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('No data source reachable');
  }

  async function ticker24h(symbol) {
    for (const host of HOSTS) {
      try {
        const res = await fetch(`${host}/api/v3/ticker/24hr?symbol=${symbol}`, { cache: 'no-store' });
        if (res.ok) return await res.json();
      } catch (e) { /* try next */ }
    }
    return null;
  }

  // Accepts most exports: TradingView, MetaTrader (2024.01.02,00:00,...), Yahoo, generic.
  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    const sep = lines[0].includes(';') && !lines[0].includes(',') ? ';' : lines[0].includes('\t') ? '\t' : ',';
    const split = (l) => l.split(sep).map(s => s.trim().replace(/^"|"$/g, ''));
    let head = split(lines[0]).map(h => h.toLowerCase());
    const hasHeader = head.some(h => /open|close|high|low|date|time/.test(h));
    const rows = (hasHeader ? lines.slice(1) : lines).map(split);
    let idx;
    if (hasHeader) {
      const find = (re) => head.findIndex(h => re.test(h));
      const dateI = find(/date|timestamp/), timeI = find(/^time$/);
      idx = { date: dateI >= 0 ? dateI : timeI, time: dateI >= 0 && timeI >= 0 ? timeI : -1,
        open: find(/^open/), high: find(/^high/), low: find(/^low/), close: find(/^close/), vol: find(/vol/) };
    } else {
      // MetaTrader: date,time,o,h,l,c,v  or  generic: date,o,h,l,c,v
      const mt = /^\d{1,2}:\d{2}/.test(rows[0][1]);
      idx = mt ? { date: 0, time: 1, open: 2, high: 3, low: 4, close: 5, vol: 6 } : { date: 0, time: -1, open: 1, high: 2, low: 3, close: 4, vol: 5 };
    }
    if ([idx.date, idx.open, idx.high, idx.low, idx.close].some(v => v < 0)) throw new Error("Could not find Date/Open/High/Low/Close columns.");
    const toTime = (d, t) => {
      if (/^\d{10,13}$/.test(d)) return d.length === 13 ? Math.floor(+d / 1000) : +d;
      let s = (d.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3') + (t ? ' ' + t : '')).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00Z';
      else if (/^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}(:\d{2})?$/.test(s)) s = s.replace(' ', 'T') + (/:\d{2}:\d{2}$/.test(s) ? '' : ':00') + 'Z';
      return Math.floor(Date.parse(s) / 1000);
    };
    const bars = rows.map(r => ({
      time: toTime(r[idx.date], idx.time >= 0 ? r[idx.time] : ''),
      open: +r[idx.open], high: +r[idx.high], low: +r[idx.low], close: +r[idx.close],
      volume: idx.vol >= 0 ? +r[idx.vol] || 0 : 0,
    })).filter(b => Number.isFinite(b.time) && [b.open, b.high, b.low, b.close].every(Number.isFinite));
    bars.sort((a, b) => a.time - b.time);
    const dedup = bars.filter((b, i) => i === 0 || b.time !== bars[i - 1].time);
    if (dedup.length < 30) throw new Error('Need at least 30 valid rows of price data.');
    return dedup;
  }

  return { candles, ticker24h, parseCSV };
})();
