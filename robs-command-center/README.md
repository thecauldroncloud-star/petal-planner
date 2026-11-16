# Rob's Command Center

A two-page trading dashboard that runs in the browser — no server, no API keys.

## 1. Trading Desk
- Live candlestick chart (Gold, BTC, ETH, SOL, XRP, EUR/USD) on 15m / 1H / 4H / 1D / 1W.
- **Upload your own chart** as a CSV (TradingView, MetaTrader or any Date/Open/High/Low/Close export) and get signals on it.
- **Trusted trader playbook** — eight published, time-tested methods each vote Buy / Sell / Neutral:

  | Method | Trader |
  |---|---|
  | Golden / Death Cross (50/200 MA) | Classic trend following |
  | RSI overbought / oversold | J. Welles Wilder Jr. |
  | MACD crossover | Gerald Appel |
  | Bollinger Band reversion | John Bollinger |
  | Turtle 20-bar breakout | Richard Dennis & Richard Donchian |
  | Ichimoku Cloud | Goichi Hosoda |
  | Stochastic turn | George Lane |
  | Holy Grail pullback (ADX + 20 EMA) | Linda Bradford Raschke |

- A **consensus meter**, an ATR-based **trade plan** (stop + 1R/2R/3R targets), and arrows on the chart showing each trader's past signals.
- **Pro chart** mode: full TradingView chart with drawing tools.

## 2. Updates
- Gold snapshot: price, 24h / 7-day / 52-week ranges, daily trader consensus.
- Gold & macro headlines (Fed, dollar, silver, geopolitics), refreshed every 30 minutes by a GitHub Action (`.github/workflows/news.yml`), with a bullish/bearish **headline mood** gauge.
- Live TradingView gold news feed and economic calendar.

## Run it
- **Locally:** `python3 -m http.server` in this folder, then open http://localhost:8000.
- **GitHub Pages:** Settings → Pages → Deploy from branch → `main` / root. The news Action needs Settings → Actions → General → Workflow permissions → *Read and write*.

## Data
Prices come from Binance's free public market-data API. Gold uses **PAX Gold (PAXG)**, a token backed 1:1 by physical gold, so it tracks spot XAU/USD closely.

> Signals are educational, not financial advice.
