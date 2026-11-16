// Router + shared bits.
(() => {
  const pages = ['trade', 'updates'];
  let tradeReady = false;

  function route() {
    const page = pages.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'trade';
    pages.forEach(p => { document.getElementById('page-' + p).hidden = p !== page; });
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.page === page));
    if (page === 'trade' && !tradeReady) { tradeReady = true; Trade.init(); }
    if (page === 'updates') Updates.show();
    window.scrollTo(0, 0);
  }

  function clock() {
    const now = new Date();
    const ny = now.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' });
    const ldn = now.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
    document.getElementById('clock').textContent = `New York ${ny} · London ${ldn}`;
  }

  Widgets.tickerTape(document.getElementById('tickerTape'));
  Updates.init();
  window.addEventListener('hashchange', route);
  route();
  clock(); setInterval(clock, 30000);
})();
