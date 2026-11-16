// Pulls gold & macro headlines from public RSS feeds and writes data/news.json.
// Runs in GitHub Actions on a schedule (see .github/workflows/news.yml). Node 20+, no dependencies.
import { readFile, writeFile } from 'node:fs/promises';

const OUT = new URL('../data/news.json', import.meta.url);
const gn = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
const FEEDS = [
  gn('gold price when:2d'),
  gn('XAUUSD OR "spot gold" when:2d'),
  gn('gold futures Fed when:3d'),
  gn('central bank gold buying when:7d'),
  gn('silver price when:3d'),
  gn('Federal Reserve interest rates when:2d'),
  gn('US dollar index DXY when:2d'),
  'https://www.fxstreet.com/rss/news',
  'https://www.investing.com/rss/news_11.rss',
  'https://www.kitco.com/rss/KitcoNews.xml',
];

const TAGS = {
  gold: /\bgold\b|xau|bullion|precious metal/i,
  silver: /\bsilver\b|xag/i,
  fed: /\bfed\b|federal reserve|powell|rate (cut|hike)|interest rate|fomc|inflation|cpi|pce|treasury yield|bond yield/i,
  dollar: /dollar|\bdxy\b|greenback|\busd\b/i,
  geopolitics: /war|tariff|sanction|geopolit|conflict|middle east|ukraine|russia|china|iran|israel|safe.haven|election/i,
};
const BULL = /\b(rise|rises|rising|rose|gain|gains|gained|jump|jumps|jumped|surge|surges|surged|soar|soars|soared|rally|rallies|rallied|climb|climbs|climbed|record|all-time high|highs?|rebound|rebounds|advance|advances|up \d|firm|firms|boost|bullish|spike|spikes)\b/i;
const BEAR = /\b(fall|falls|falling|fell|drop|drops|dropped|slide|slides|slid|slip|slips|slipped|sink|sinks|sank|tumble|tumbles|tumbled|plunge|plunges|plunged|decline|declines|declined|lower|loses|lost|retreat|retreats|retreated|weak|weaker|down \d|bearish|selloff|sell-off|lows?|dip|dips|dipped|ease|eases|eased)\b/i;

const decode = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/\s+/g, ' ').trim();
const pick = (xml, tag) => { const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')); return m ? decode(m[1]) : ''; };

async function fetchFeed(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsReader/1.0)' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status}`);
  const xml = await res.text();
  const host = new URL(url).hostname.replace(/^www\./, '');
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map(([item]) => {
    let title = pick(item, 'title');
    let source = pick(item, 'source');
    // Google News titles end with " - Publisher"
    if (host === 'news.google.com') {
      const m = title.match(/^(.*) - ([^-]+)$/);
      if (m) { title = m[1].trim(); source = source || m[2].trim(); }
    }
    let link = pick(item, 'link') || (item.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || '';
    const published = new Date(pick(item, 'pubDate') || pick(item, 'dc:date') || Date.now()).toISOString();
    return { title, link, source: source || host, published };
  }).filter(n => n.title && n.link);
}

function classify(n) {
  const tags = Object.entries(TAGS).filter(([, re]) => re.test(n.title)).map(([k]) => k);
  // The first move-word usually describes the headline's subject ("Gold slips as yields climb" = bearish)
  const b = n.title.search(BULL), s = n.title.search(BEAR);
  const tone = b < 0 && s < 0 ? 'neutral' : s < 0 || (b >= 0 && b < s) ? 'bull' : 'bear';
  return { ...n, tags, tone };
}

const key = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').slice(0, 9).join(' ');

const results = await Promise.allSettled(FEEDS.map(fetchFeed));
results.forEach((r, i) => console.log(r.status === 'fulfilled' ? `ok   ${r.value.length.toString().padStart(3)}  ${FEEDS[i]}` : `fail      ${FEEDS[i]} (${r.reason.message})`));

let existing = [];
try { existing = JSON.parse(await readFile(OUT, 'utf8')).items || []; } catch { /* first run */ }

const cutoff = Date.now() - 7 * 864e5;
const seen = new Set();
const items = [...results.flatMap(r => r.status === 'fulfilled' ? r.value : []), ...existing]
  .map(classify)
  .filter(n => n.tags.length && new Date(n.published) > cutoff && new Date(n.published) <= Date.now() + 36e5)
  .sort((a, b) => new Date(b.published) - new Date(a.published))
  .filter(n => { const k = key(n.title); if (seen.has(k)) return false; seen.add(k); return true; })
  .slice(0, 250);

if (!items.length && existing.length) { console.log('No fresh items; keeping existing file.'); process.exit(0); }
await writeFile(OUT, JSON.stringify({ updated: new Date().toISOString(), count: items.length, items }, null, 1) + '\n');
console.log(`Wrote ${items.length} headlines.`);
