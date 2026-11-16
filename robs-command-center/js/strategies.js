// "Trusted trader" playbook: classic, published methods from well-known traders.
// Each strategy returns a score from -1 (strong sell) to +1 (strong buy),
// a plain-English reason, and its historical buy/sell signals for chart markers.
const Strategies = (() => {
  const fmt = (v, d = 1) => v == null ? '—' : Number(v).toFixed(d);
  const crossUp = (a, b, i) => a[i - 1] != null && b[i - 1] != null && a[i] != null && b[i] != null && a[i - 1] <= b[i - 1] && a[i] > b[i];
  const crossDn = (a, b, i) => a[i - 1] != null && b[i - 1] != null && a[i] != null && b[i] != null && a[i - 1] >= b[i - 1] && a[i] < b[i];
  const lvl = (n, v) => new Array(n).fill(v);
  const clamp = (v) => Math.max(-1, Math.min(1, v));

  // Precompute everything once per dataset
  function context(bars) {
    const o = bars.map(b => b.open), h = bars.map(b => b.high), l = bars.map(b => b.low), c = bars.map(b => b.close);
    const n = c.length;
    return {
      bars, o, h, l, c, n, last: n - 1,
      sma50: Ind.sma(c, 50), sma200: Ind.sma(c, 200), ema20: Ind.ema(c, 20),
      rsi: Ind.rsi(c, 14), macd: Ind.macd(c), bb: Ind.bollinger(c), atr: Ind.atr(h, l, c),
      adx: Ind.adx(h, l, c), stoch: Ind.stochastic(h, l, c), ichi: Ind.ichimoku(h, l),
      dHigh: Ind.highest(h, 20), dLow: Ind.lowest(l, 20),
    };
  }

  const list = [
    {
      id: 'cross', name: 'Golden / Death Cross', trader: 'Classic trend following · Dow Theory school',
      rule: 'Buy when the 50 MA crosses above the 200 MA; sell on the opposite.',
      run(x) {
        const i = x.last, f = x.sma50[i], s = x.sma200[i], c = x.c[i];
        const signals = [];
        for (let k = 1; k < x.n; k++) {
          if (crossUp(x.sma50, x.sma200, k)) signals.push({ i: k, side: 'buy', text: 'Golden cross' });
          if (crossDn(x.sma50, x.sma200, k)) signals.push({ i: k, side: 'sell', text: 'Death cross' });
        }
        if (f == null || s == null) return { score: 0, reason: 'Needs 200 bars of history.', signals };
        let score = f > s ? 0.5 : -0.5;
        if (f > s && c > f) score = 1;
        if (f < s && c < f) score = -1;
        const reason = f > s
          ? `50 MA (${fmt(f, 2)}) is above the 200 MA (${fmt(s, 2)}) — long-term uptrend${c > f ? ', price above both' : ', but price has slipped under the 50 MA'}.`
          : `50 MA (${fmt(f, 2)}) is below the 200 MA (${fmt(s, 2)}) — long-term downtrend${c < f ? ', price below both' : ', but price is back above the 50 MA'}.`;
        return { score, reason, signals };
      },
    },
    {
      id: 'rsi', name: 'RSI Overbought / Oversold', trader: 'J. Welles Wilder Jr.',
      rule: 'RSI(14) under 30 is oversold (buy zone); over 70 is overbought (sell zone).',
      run(x) {
        const i = x.last, r = x.rsi[i];
        const signals = [], lo = lvl(x.n, 30), hi = lvl(x.n, 70);
        for (let k = 1; k < x.n; k++) {
          if (crossUp(x.rsi, lo, k)) signals.push({ i: k, side: 'buy', text: 'RSI leaves oversold' });
          if (crossDn(x.rsi, hi, k)) signals.push({ i: k, side: 'sell', text: 'RSI leaves overbought' });
        }
        if (r == null) return { score: 0, reason: 'Not enough data.', signals };
        let score, reason;
        if (r < 30) { score = 1; reason = `RSI is ${fmt(r)} — oversold. Wilder looked for bounces from here.`; }
        else if (r > 70) { score = -1; reason = `RSI is ${fmt(r)} — overbought. Risk of a pullback.`; }
        else { score = clamp((r - 50) / 40); reason = `RSI is ${fmt(r)} — ${r >= 50 ? 'bullish' : 'bearish'} momentum, not at an extreme.`; }
        return { score, reason, signals };
      },
    },
    {
      id: 'macd', name: 'MACD Crossover', trader: 'Gerald Appel',
      rule: 'Buy when MACD crosses above its signal line; sell when it crosses below.',
      run(x) {
        const i = x.last, m = x.macd.line[i], sg = x.macd.signal[i], hst = x.macd.hist;
        const signals = [];
        for (let k = 1; k < x.n; k++) {
          if (crossUp(x.macd.line, x.macd.signal, k)) signals.push({ i: k, side: 'buy', text: 'MACD bull cross' });
          if (crossDn(x.macd.line, x.macd.signal, k)) signals.push({ i: k, side: 'sell', text: 'MACD bear cross' });
        }
        if (m == null || sg == null) return { score: 0, reason: 'Not enough data.', signals };
        let score = (m > sg ? 0.5 : -0.5) + (m > 0 ? 0.25 : -0.25);
        const recent = signals.length && x.last - signals[signals.length - 1].i <= 3 ? signals[signals.length - 1] : null;
        if (recent) score = recent.side === 'buy' ? 1 : -1;
        const growing = hst[i] != null && hst[i - 1] != null && Math.abs(hst[i]) > Math.abs(hst[i - 1]);
        const reason = `MACD is ${m > sg ? 'above' : 'below'} its signal line${recent ? ` (fresh ${recent.side === 'buy' ? 'bullish' : 'bearish'} cross)` : ''}, ${m > 0 ? 'above' : 'below'} zero; momentum is ${growing ? 'strengthening' : 'fading'}.`;
        return { score: clamp(score), reason, signals };
      },
    },
    {
      id: 'bb', name: 'Bollinger Band Reversion', trader: 'John Bollinger',
      rule: 'Close back inside after piercing the lower band = buy; upper band = sell.',
      run(x) {
        const i = x.last, { upper, lower, pctB } = x.bb, p = pctB[i];
        const signals = [];
        for (let k = 1; k < x.n; k++) {
          if (lower[k - 1] != null && x.c[k - 1] < lower[k - 1] && x.c[k] > lower[k]) signals.push({ i: k, side: 'buy', text: 'Back inside lower band' });
          if (upper[k - 1] != null && x.c[k - 1] > upper[k - 1] && x.c[k] < upper[k]) signals.push({ i: k, side: 'sell', text: 'Back inside upper band' });
        }
        if (p == null) return { score: 0, reason: 'Not enough data.', signals };
        let score, reason;
        if (p < 0) { score = 1; reason = `Price is below the lower band (%B ${fmt(p, 2)}) — stretched to the downside.`; }
        else if (p > 1) { score = -1; reason = `Price is above the upper band (%B ${fmt(p, 2)}) — stretched to the upside.`; }
        else { score = clamp((0.5 - p) * 0.8); reason = `Price sits ${p > 0.5 ? 'in the upper' : 'in the lower'} half of the bands (%B ${fmt(p, 2)}).`; }
        const width = (upper[i] - lower[i]) / x.bb.mid[i];
        if (width < 0.02) reason += ' Bands are very tight — a "squeeze" often comes before a big move.';
        return { score, reason, signals };
      },
    },
    {
      id: 'turtle', name: 'Turtle 20-Bar Breakout', trader: 'Richard Dennis & Richard Donchian',
      rule: 'Buy a close above the prior 20-bar high; sell a close below the prior 20-bar low.',
      run(x) {
        const i = x.last, signals = [];
        let pos = 0;
        for (let k = 21; k < x.n; k++) {
          if (x.c[k] > x.dHigh[k - 1] && pos !== 1) { signals.push({ i: k, side: 'buy', text: '20-bar breakout' }); pos = 1; }
          else if (x.c[k] < x.dLow[k - 1] && pos !== -1) { signals.push({ i: k, side: 'sell', text: '20-bar breakdown' }); pos = -1; }
        }
        const hi = x.dHigh[i - 1], lo = x.dLow[i - 1], c = x.c[i];
        if (hi == null) return { score: 0, reason: 'Not enough data.', signals };
        let score, reason;
        if (c > hi) { score = 1; reason = `Closed above the 20-bar high (${fmt(hi, 2)}) — breakout.`; }
        else if (c < lo) { score = -1; reason = `Closed below the 20-bar low (${fmt(lo, 2)}) — breakdown.`; }
        else {
          const pct = (c - lo) / (hi - lo);
          score = clamp((pct - 0.5) * 0.8);
          reason = `Inside the 20-bar channel (${fmt(lo, 2)} – ${fmt(hi, 2)}), ${Math.round(pct * 100)}% of the way up. Turtles wait for a breakout.`;
        }
        return { score, reason, signals };
      },
    },
    {
      id: 'ichi', name: 'Ichimoku Cloud', trader: 'Goichi Hosoda',
      rule: 'Price above the cloud with Tenkan over Kijun = buy; below the cloud with Tenkan under Kijun = sell.',
      run(x) {
        const i = x.last, { tenkan, kijun, spanA, spanB } = x.ichi, signals = [];
        for (let k = 1; k < x.n; k++) {
          if (spanA[k] == null) continue;
          const top = Math.max(spanA[k], spanB[k]), bot = Math.min(spanA[k], spanB[k]);
          if (crossUp(tenkan, kijun, k) && x.c[k] > top) signals.push({ i: k, side: 'buy', text: 'TK cross above cloud' });
          if (crossDn(tenkan, kijun, k) && x.c[k] < bot) signals.push({ i: k, side: 'sell', text: 'TK cross below cloud' });
        }
        if (spanA[i] == null || tenkan[i] == null) return { score: 0, reason: 'Needs ~80 bars of history.', signals };
        const top = Math.max(spanA[i], spanB[i]), bot = Math.min(spanA[i], spanB[i]), c = x.c[i];
        const tk = tenkan[i] > kijun[i];
        let score = 0, where;
        if (c > top) { score += 0.6; where = 'above the cloud'; }
        else if (c < bot) { score -= 0.6; where = 'below the cloud'; }
        else where = 'inside the cloud (no clear trend)';
        score += tk ? 0.4 : -0.4;
        if (where.startsWith('inside')) score *= 0.4;
        return { score: clamp(score), reason: `Price is ${where}; Tenkan is ${tk ? 'above' : 'below'} Kijun.`, signals };
      },
    },
    {
      id: 'stoch', name: 'Stochastic Turn', trader: 'George Lane',
      rule: '%K crossing above %D under 20 = buy; crossing below %D over 80 = sell.',
      run(x) {
        const i = x.last, { k, d } = x.stoch, signals = [];
        for (let j = 1; j < x.n; j++) {
          if (crossUp(k, d, j) && k[j] < 25) signals.push({ i: j, side: 'buy', text: 'Stoch turn up (oversold)' });
          if (crossDn(k, d, j) && k[j] > 75) signals.push({ i: j, side: 'sell', text: 'Stoch turn down (overbought)' });
        }
        if (k[i] == null || d[i] == null) return { score: 0, reason: 'Not enough data.', signals };
        let score = 0, reason;
        if (k[i] < 20) { score = k[i] > d[i] ? 1 : 0.5; reason = `%K ${fmt(k[i])} is oversold${k[i] > d[i] ? ' and turning up' : ''}.`; }
        else if (k[i] > 80) { score = k[i] < d[i] ? -1 : -0.5; reason = `%K ${fmt(k[i])} is overbought${k[i] < d[i] ? ' and turning down' : ''}.`; }
        else { score = k[i] > d[i] ? 0.2 : -0.2; reason = `%K ${fmt(k[i])} is mid-range, ${k[i] > d[i] ? 'rising' : 'falling'}.`; }
        return { score, reason, signals };
      },
    },
    {
      id: 'grail', name: 'Holy Grail Pullback', trader: 'Linda Bradford Raschke',
      rule: 'When ADX > 30 (strong trend), buy the first pullback to the 20 EMA (or sell the rally in a downtrend).',
      run(x) {
        const i = x.last, { adx, pdi, ndi } = x.adx, e = x.ema20, signals = [];
        for (let k = 2; k < x.n; k++) {
          if (adx[k] == null || e[k] == null || adx[k] < 30) continue;
          if (pdi[k] > ndi[k] && x.l[k] <= e[k] && x.l[k - 1] > e[k - 1]) signals.push({ i: k, side: 'buy', text: 'Pullback to 20 EMA in uptrend' });
          if (ndi[k] > pdi[k] && x.h[k] >= e[k] && x.h[k - 1] < e[k - 1]) signals.push({ i: k, side: 'sell', text: 'Rally to 20 EMA in downtrend' });
        }
        if (adx[i] == null) return { score: 0, reason: 'Not enough data.', signals };
        if (adx[i] < 30) return { score: 0, reason: `ADX is ${fmt(adx[i])} — trend isn't strong enough for this setup. Stand aside.`, signals };
        const up = pdi[i] > ndi[i];
        const recent = signals.length && x.last - signals[signals.length - 1].i <= 3 ? signals[signals.length - 1] : null;
        const score = recent ? (recent.side === 'buy' ? 1 : -1) : (up ? 0.5 : -0.5);
        return { score, reason: `ADX ${fmt(adx[i])}: strong ${up ? 'uptrend' : 'downtrend'}. ${recent ? 'Setup just triggered at the 20 EMA.' : `Wait for a ${up ? 'dip' : 'rally'} to the 20 EMA (${fmt(e[i], 2)}).`}`, signals };
      },
    },
  ];

  function evaluate(bars) {
    const x = context(bars);
    const results = list.map(s => ({ ...s, ...s.run(x) }));
    const score = results.reduce((a, r) => a + r.score, 0) / results.length;
    const side = (v) => v > 0.15 ? 'buy' : v < -0.15 ? 'sell' : 'neutral';
    results.forEach(r => { r.side = side(r.score); r.label = labelFor(r.score); });
    const tally = { buy: 0, neutral: 0, sell: 0 };
    results.forEach(r => tally[r.side]++);
    return { ctx: x, results, score, side: side(score), label: labelFor(score), tally };
  }

  function labelFor(v) {
    if (v > 0.5) return 'Strong Buy';
    if (v > 0.15) return 'Buy';
    if (v < -0.5) return 'Strong Sell';
    if (v < -0.15) return 'Sell';
    return 'Neutral';
  }

  return { list, evaluate };
})();
