// Technical indicators. Every function returns an array aligned with the input,
// with null where there is not enough history yet.
const Ind = (() => {
  const sma = (src, n) => {
    const out = new Array(src.length).fill(null);
    let sum = 0;
    for (let i = 0; i < src.length; i++) {
      sum += src[i];
      if (i >= n) sum -= src[i - n];
      if (i >= n - 1) out[i] = sum / n;
    }
    return out;
  };

  const ema = (src, n) => {
    const out = new Array(src.length).fill(null);
    const k = 2 / (n + 1);
    let prev = null, start = src.findIndex(v => v != null);
    if (start < 0) return out;
    for (let i = start; i < src.length; i++) {
      if (i < start + n - 1) continue;
      if (prev == null) {
        let s = 0;
        for (let j = i - n + 1; j <= i; j++) s += src[j];
        prev = s / n;
      } else prev = src[i] * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  };

  // Wilder's smoothing (RMA)
  const rma = (src, n) => {
    const out = new Array(src.length).fill(null);
    let prev = null;
    for (let i = 0; i < src.length; i++) {
      if (src[i] == null) continue;
      if (prev == null) {
        if (i < n - 1) continue;
        let s = 0, ok = true;
        for (let j = i - n + 1; j <= i; j++) { if (src[j] == null) { ok = false; break; } s += src[j]; }
        if (!ok) continue;
        prev = s / n;
      } else prev = (prev * (n - 1) + src[i]) / n;
      out[i] = prev;
    }
    return out;
  };

  const rsi = (close, n = 14) => {
    const gain = [null], loss = [null];
    for (let i = 1; i < close.length; i++) {
      const d = close[i] - close[i - 1];
      gain.push(Math.max(d, 0)); loss.push(Math.max(-d, 0));
    }
    const ag = rma(gain, n), al = rma(loss, n);
    return close.map((_, i) => ag[i] == null ? null : al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i]));
  };

  const macd = (close, f = 12, s = 26, sig = 9) => {
    const ef = ema(close, f), es = ema(close, s);
    const line = close.map((_, i) => ef[i] != null && es[i] != null ? ef[i] - es[i] : null);
    const signal = ema(line, sig);
    const hist = line.map((v, i) => v != null && signal[i] != null ? v - signal[i] : null);
    return { line, signal, hist };
  };

  const stdev = (src, n) => {
    const m = sma(src, n);
    return src.map((_, i) => {
      if (m[i] == null) return null;
      let s = 0;
      for (let j = i - n + 1; j <= i; j++) s += (src[j] - m[i]) ** 2;
      return Math.sqrt(s / n);
    });
  };

  const bollinger = (close, n = 20, k = 2) => {
    const mid = sma(close, n), sd = stdev(close, n);
    const upper = mid.map((m, i) => m == null ? null : m + k * sd[i]);
    const lower = mid.map((m, i) => m == null ? null : m - k * sd[i]);
    const pctB = close.map((c, i) => upper[i] == null || upper[i] === lower[i] ? null : (c - lower[i]) / (upper[i] - lower[i]));
    return { mid, upper, lower, pctB };
  };

  const trueRange = (h, l, c) => h.map((_, i) => i === 0 ? h[i] - l[i] :
    Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));

  const atr = (h, l, c, n = 14) => rma(trueRange(h, l, c), n);

  const adx = (h, l, c, n = 14) => {
    const pdm = [0], ndm = [0];
    for (let i = 1; i < h.length; i++) {
      const up = h[i] - h[i - 1], dn = l[i - 1] - l[i];
      pdm.push(up > dn && up > 0 ? up : 0);
      ndm.push(dn > up && dn > 0 ? dn : 0);
    }
    const tr = rma(trueRange(h, l, c), n), sp = rma(pdm, n), sn = rma(ndm, n);
    const pdi = tr.map((t, i) => t ? 100 * sp[i] / t : null);
    const ndi = tr.map((t, i) => t ? 100 * sn[i] / t : null);
    const dx = pdi.map((p, i) => p == null ? null : (p + ndi[i]) === 0 ? 0 : 100 * Math.abs(p - ndi[i]) / (p + ndi[i]));
    return { adx: rma(dx, n), pdi, ndi };
  };

  const highest = (src, n) => src.map((_, i) => i < n - 1 ? null : Math.max(...src.slice(i - n + 1, i + 1)));
  const lowest = (src, n) => src.map((_, i) => i < n - 1 ? null : Math.min(...src.slice(i - n + 1, i + 1)));

  const stochastic = (h, l, c, n = 14, smoothK = 3, d = 3) => {
    const hh = highest(h, n), ll = lowest(l, n);
    const raw = c.map((v, i) => hh[i] == null ? null : hh[i] === ll[i] ? 50 : 100 * (v - ll[i]) / (hh[i] - ll[i]));
    const k = sma(raw.map(v => v ?? 0), smoothK).map((v, i) => raw[i - smoothK + 1] == null ? null : v);
    const dd = sma(k.map(v => v ?? 0), d).map((v, i) => k[i - d + 1] == null ? null : v);
    return { k, d: dd };
  };

  const ichimoku = (h, l) => {
    const mid = (n) => { const hh = highest(h, n), ll = lowest(l, n); return hh.map((v, i) => v == null ? null : (v + ll[i]) / 2); };
    const tenkan = mid(9), kijun = mid(26), b52 = mid(52);
    // Cloud value that applies at bar i (projected 26 bars forward from i-26)
    const spanA = h.map((_, i) => i >= 26 && tenkan[i - 26] != null && kijun[i - 26] != null ? (tenkan[i - 26] + kijun[i - 26]) / 2 : null);
    const spanB = h.map((_, i) => i >= 26 && b52[i - 26] != null ? b52[i - 26] : null);
    return { tenkan, kijun, spanA, spanB };
  };

  return { sma, ema, rma, rsi, macd, bollinger, atr, adx, stochastic, ichimoku, highest, lowest };
})();
