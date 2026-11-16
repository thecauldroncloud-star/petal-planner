// Page 2: Updates — gold snapshot, headline mood, news list (refreshed by a GitHub Action), live widgets.
const Updates = (() => {
  const $ = (id) => document.getElementById(id);
  let news = [], tag = 'all', query = '', widgetsLoaded = false;

  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function ago(ts) {
    const s = (Date.now() - new Date(ts)) / 1000;
    if (!Number.isFinite(s)) return '';
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
  }

  async function snapshot() {
    try {
      const [{ bars }, t] = await Promise.all([Data.candles('PAXGUSDT', '1d', 260), Data.ticker24h('PAXGUSDT')]);
      const last = bars[bars.length - 1].close;
      const chg = t ? +t.priceChangePercent : (last / bars[bars.length - 2].close - 1) * 100;
      $('snapPrice').textContent = '$' + money(last);
      $('snapChg').textContent = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% 24h`;
      $('snapChg').className = 'chg ' + (chg >= 0 ? 'up' : 'down');
      const wk = bars.slice(-7), yr = bars.slice(-252);
      const hi = (a) => Math.max(...a.map(b => b.high)), lo = (a) => Math.min(...a.map(b => b.low));
      const perf = (n) => { const b = bars[bars.length - 1 - n]; return b ? ((last / b.close - 1) * 100).toFixed(1) + '%' : '—'; };
      $('snapStats').innerHTML = `
        <div><small>24h range</small><span>${t ? money(t.lowPrice) + ' – ' + money(t.highPrice) : '—'}</span></div>
        <div><small>7-day range</small><span>${money(lo(wk))} – ${money(hi(wk))}</span></div>
        <div><small>1 month</small><span>${perf(30)}</span></div>
        <div><small>52-week high</small><span>${money(hi(yr))}</span></div>`;
      const r = Strategies.evaluate(bars);
      $('snapSignal').innerHTML = `Daily trader consensus: <b style="color:var(--${r.side === 'neutral' ? 'neutral' : r.side})">${r.label}</b>
        <span class="muted">(${r.tally.buy} buy · ${r.tally.neutral} neutral · ${r.tally.sell} sell)</span> ·
        <a href="#trade" style="color:var(--gold)">open in Trading Desk</a>`;
      $('snapTime').textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      $('snapPrice').textContent = 'Price unavailable';
    }
  }

  async function loadNews() {
    try {
      const res = await fetch('data/news.json?v=' + Date.now(), { cache: 'no-store' });
      const data = await res.json();
      news = data.items || [];
      $('newsUpdated').textContent = data.updated ? 'Refreshed ' + ago(data.updated) : '';
    } catch { news = []; }
    renderNews();
    renderMood();
  }

  function renderNews() {
    const q = query.toLowerCase();
    const items = news.filter(n => (tag === 'all' || (n.tags || []).includes(tag)) && (!q || n.title.toLowerCase().includes(q)));
    $('newsList').innerHTML = items.length ? items.slice(0, 120).map(n => `
      <li>
        <a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>
        <div class="meta">
          ${n.tone && n.tone !== 'neutral' ? `<span class="tone ${n.tone}">${n.tone === 'bull' ? '▲ Bullish' : '▼ Bearish'}</span>` : ''}
          <span>${esc(n.source || '')}</span><span>${ago(n.published)}</span>
          ${(n.tags || []).filter(t => t !== 'gold').map(t => `<span class="tag">${esc(t)}</span>`).join('')}
        </div>
      </li>`).join('') : `<li class="muted">${news.length ? 'No headlines match.' : 'Headlines appear here once the news updater has run. The live feed on the right works right away.'}</li>`;
  }

  function renderMood() {
    const gold = news.filter(n => (n.tags || []).includes('gold')).slice(0, 50);
    const c = { bull: 0, neutral: 0, bear: 0 };
    gold.forEach(n => c[n.tone || 'neutral']++);
    const total = gold.length || 1;
    $('moodBull').style.width = c.bull / total * 100 + '%';
    $('moodNeutral').style.width = (gold.length ? c.neutral / total * 100 : 100) + '%';
    $('moodBear').style.width = c.bear / total * 100 + '%';
    const lean = c.bull > c.bear * 1.3 ? 'Leaning bullish' : c.bear > c.bull * 1.3 ? 'Leaning bearish' : 'Mixed';
    $('moodLegend').innerHTML = gold.length ? `
      <span><i style="background:var(--buy)"></i>Bullish ${c.bull}</span>
      <span><i style="background:#3a4255"></i>Neutral ${c.neutral}</span>
      <span><i style="background:var(--sell)"></i>Bearish ${c.bear}</span>
      <span><b>${lean}</b> · last ${gold.length} gold headlines</span>` : '<span class="muted">Waiting for headlines…</span>';
  }

  function bind() {
    $('newsFilters').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      tag = b.dataset.tag;
      $('newsFilters').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      renderNews();
    });
    $('newsSearch').addEventListener('input', e => { query = e.target.value; renderNews(); });
  }

  function show() {
    if (!widgetsLoaded) {
      widgetsLoaded = true;
      Widgets.timeline($('tvTimeline'));
      Widgets.calendar($('tvCalendar'));
    }
    snapshot();
    loadNews();
  }

  function init() {
    bind();
    setInterval(() => { if (!document.hidden && !$('page-updates').hidden) { snapshot(); loadNews(); } }, 5 * 60000);
  }

  return { init, show };
})();
