# Forex sessions and currency strength

A forex market hours clock and a currency strength meter: a small JavaScript
library with no dependencies, two embeddable widgets, and two MetaTrader 5
indicators. No account, no key, no cookie.

- **Sessions**: Sydney, Tokyo, London and New York in their own time zones,
  with daylight saving handled per city (London and New York change on
  different dates, Sydney the other way round, Tokyo never). Open or closed
  now, when each opens next, and the overlaps.
- **Strength**: the eight majors (USD, EUR, GBP, JPY, CHF, CAD, AUD, NZD)
  ranked 0 to 10 from the closes of their 28 crosses. [The method](#the-method)
  is below and in the code.

## The widgets

Paste where the widget goes:

```html
<div class="fx-widget" data-widget="sessions"><a href="https://forexiapro.com/">Forexia</a></div>
<script async src="https://<where the widgets are served>/embed.js"></script>
```

`embed.js` loads `sessions.html` or `strength.html` from its own folder in a
frame and sets the frame's height as the widget grows. Each widget is one HTML
file with its styles and script inline; it loads nothing else from anyone
except its own data.

| Option (`data-…` on the div, or `?…` on the widget's address) | Widget | |
| --- | --- | --- |
| `theme=light\|dark\|auto` | both | `auto` follows the reader's system |
| `accent=3d5afe` | both | hex, no `#` |
| `flat=1` | both | transparent background |
| `decisions=0` | sessions | leave out central bank decisions |
| `window=24h` | strength | the window shown first: `1h`, `4h`, `24h`, `1w` |
| `tabs=0` | strength | no window buttons |
| `src=…` | strength | where `strength.json` is (same site only; default `../data/strength.json`) |
| `border="0"` (div only) | both | no frame border |

**Sessions** (`widgets/sessions.html`) is a live clock and needs no data: a
day's timeline in the reader's own time with each session and the overlaps,
then each session's local time, open or closed, and how long until it closes
or opens. When a central bank decision falls inside a session, the session
says so ("A central bank decides during this session: BoE, 7:00 AM") and links
to that decision's page on InterestRateDecision.com. The decisions come from
its open data, `https://interestratedecision.com/data/next.json`; if the
browser may not read it (see [Owner's steps](#owners-steps)), the clock works
the same without them.

**Strength** (`widgets/strength.html`) shows `data/strength.json`: the eight
currencies in order, each with its 0-10 strength and its average percent
change, with buttons for each window. A file written with `--demo` says
"Sample data" on the widget.

Each widget's credit link says "Forexia" and nothing more: the sessions
widget to [Forexia's sessions guide](https://forexiapro.com/forex-sessions/?via=strength-sessions),
the strength widget to [Forexia's trading tools](https://forexiapro.com/tradingtools?via=strength-sessions).

## The library

```js
import { status, overlaps, nextOpen, marketOpen, strength, strengthFromCandles } from 'forex-strength-sessions';

status();                       // each session now: { id, name, open, start, end, nextOpen, local, currencies }
overlaps(Date.now(), Date.now() + 864e5); // [{ ids: ['london', 'newyork'], start, end }, ...]
nextOpen('london');             // a Date
marketOpen();                   // false from Friday 17:00 to Sunday 17:00 New York

strength({ EURUSD: 0.31, USDJPY: -0.12, GBPUSD: 0.05 /* ... */ });
// { currencies: { EUR: { strength: 10, change: 0.31, pairs: 1 }, ... }, rank: ['EUR', ...] }
strengthFromCandles({ EURUSD: candles, USDJPY: candles /* ... */ }, { hours: 24 });
```

`src/sessions.js`

| | |
| --- | --- |
| `SESSIONS` | `{ id, name, zone, open, close, currencies }` per session (local hours, IANA zone) |
| `status(t?)` | each session at `t`: open or not, this session's or the next one's start and end, `nextOpen`, the city's wall clock |
| `openAt(t?)` | the ids of the sessions open at `t` |
| `nextOpen(id, t?)` | when a session next opens |
| `sessionIntervals(id, from, to)`, `intervals(from, to)` | every opening between two times |
| `overlaps(from, to)` | the spans when two or more sessions are open |
| `marketOpen(t?)`, `marketWeeks(from, to)` | the market week, Sunday 17:00 to Friday 17:00 New York |
| `offsetMinutes(t, zone)`, `zonedToUtc(y, m, d, h, mi, zone)`, `wallClock(t, zone)` | the time zone helpers underneath |

The hours are the usual ones, each in its city's own time:

| Session | Zone | Local hours | Currencies |
| --- | --- | --- | --- |
| Sydney | Australia/Sydney | 07:00-16:00 | AUD, NZD |
| Tokyo | Asia/Tokyo | 09:00-18:00 | JPY |
| London | Europe/London | 08:00-17:00 | GBP, EUR, CHF |
| New York | America/New_York | 08:00-17:00 | USD, CAD |

There is no session on a city's Saturday or Sunday, and a session is only open
inside the market week: Sydney's Monday morning begins before New York's
Sunday 17:00 for part of the year, so then it opens with the market. Daylight
saving comes from the runtime's time zone database (`Intl`), so the rules stay
right when a country changes them.

`src/strength.js`: `MAJORS`, `PAIRS` (the 28 crosses), `splitPair(symbol)`
(reads `EUR/USD`, `EURUSD.m`, `frxEURUSD`), `strength(changes)`,
`strengthFromCandles(byPair, { hours, at })`, `normaliseSeries(candles)`,
`closeAt(series, t)`.

## The method

The standard currency strength calculation, with nothing hidden:

1. For each pair BASE/QUOTE, the percent change of its close over the
   lookback: (close now / close then - 1) x 100.
2. The change counts for the base and against the quote: EUR/USD up 0.30%
   adds +0.30 to EUR and -0.30 to USD.
3. Each currency's score is the average over the pairs it is in. With all 28
   crosses of the eight majors, each currency is in 7.
4. The scores are rescaled to 0-10 across the currencies: the strongest is
   10, the weakest 0, the rest in proportion between. When every score is the
   same, every currency is 5.

The 0-10 figure ranks the currencies against each other within one window; a
7 today and a 7 yesterday are not the same move. The average percent change
(step 3) is published beside it for that. Every pair is measured to the same
moment (the earliest of the pairs' last candles), and a pair whose history does
not reach back to the start of the window is left out; each currency's `pairs`
says how many it was averaged over. A strength reading describes what has
happened over the window: it is not a forecast.

## strength.json: computing it, and what it holds

```
node scripts/strength.mjs <candles.json | folder> [--out data/strength.json] [--windows 1,4,24,120]
node scripts/strength.mjs --demo      # synthetic candles, marked "sample": true
```

**Input** (the candles you supply):

- a JSON file, `{ "EURUSD": [candles], "USDJPY": [candles], ... }` (or the
  same under `"candles"`), or
- a folder of files named by pair: `EURUSD.csv`, `USDJPY.json`, `EUR_USD.csv`...

A candle is `[time, open, high, low, close]`, `[time, close]`, or an object
with `time` (or `t`, `timestamp`, `date`) and `close` (or `c`). A CSV has a
header row with a time column and a close column, separated by commas,
semicolons or tabs. Times are epoch seconds or milliseconds or ISO 8601; an
ISO time with no zone is read as UTC. Any timeframe works; give at least the
longest window of history plus a weekend. Pairs other than the 28 are ignored,
and missing pairs are left out (with a warning).

**Output** (`data/strength.json`), derived values only:

```json
{
  "name": "Currency strength",
  "generated": "2026-11-02T22:00:05.000Z",
  "asOf": "2026-11-02T22:00:00.000Z",
  "sample": false,
  "method": "https://github.com/ForexiaPro/strength-sessions#the-method",
  "currencies": ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"],
  "windows": [
    {
      "id": "24h", "label": "24 hours", "hours": 24,
      "from": "2026-11-01T22:00:00.000Z", "at": "2026-11-02T22:00:00.000Z",
      "rank": ["EUR", "USD", "..."],
      "strength": { "EUR": 10, "USD": 8.2 },
      "change": { "EUR": 0.3114, "USD": 0.2032 },
      "pairs": { "EUR": 7, "USD": 7 }
    }
  ]
}
```

No price, open, high, low or close is written. Most price feeds (brokers,
Dukascopy, data vendors) do not allow their prices to be passed on; figures
derived from them, like these, can be published. Check your own feed's terms.

The `data/strength.json` in this repository is a `--demo` file from synthetic
candles, so the widget can be tried; it says "Sample data".

## MetaTrader 5

Both compile in MetaEditor with no warnings. Copy them to `MQL5/Indicators/`
and compile, or install from the MQL5 Code Base. Descriptions for the Code
Base are in [`mt5/DESCRIPTIONS.md`](mt5/DESCRIPTIONS.md).

- **`mt5/SessionBoxes.mq5`** draws each session as a box from its high to its
  low on the chart, for the last `DaysBack` days, on H1 and below. Session
  hours are the cities' own, with each city's daylight saving rules. Your
  broker's server clock is set by `ServerClock`: *New York close* (UTC+2, UTC+3
  in US summer: what most brokers use), *Auto* (the server's offset from UTC
  now, right for brokers whose clock does not change), or *Fixed*.
- **`mt5/CurrencyStrength.mq5`** draws the eight strengths as lines from 0 to
  10 in a window under the chart, by the method above, from the 28 crosses on
  your own terminal (it adds them to Market Watch). `Lookback` is in bars of
  the chart's timeframe. The broker's prefix and suffix (`EURUSD.m`) are read
  from the chart's symbol, or set by hand. A panel ranks the currencies and
  says how many pairs were used. The prices are your terminal's, so nothing
  is passed on.

## Developing

```
npm test           # node:test: sessions across daylight saving, the weekend, overlaps; strength; the widgets
npm run widgets    # copy src/sessions.js into widgets/sessions.html (the test fails if they differ)
npm run demo       # write a sample data/strength.json
```

The sessions widget carries its own copy of `src/sessions.js` between
`// <lib:sessions>` markers so it stays one file: edit the library, then run
`npm run widgets`.

## Owner's steps

1. **Host the widgets** (for example at `forexiapro.com/embed/`: `embed.js`,
   `sessions.html`, `strength.html`, side by side) and the data file. Widgets
   may be framed by any site; send them with no `X-Frame-Options` and with
   `noindex`.
2. **Refresh `strength.json`**: run `scripts/strength.mjs` on a schedule
   (hourly, say) with candles from Forexia's own feed, and serve the result
   at the widget's `src` (default `../data/strength.json`). Only the output is
   published, never the candles.
3. **Decisions in the sessions widget**: InterestRateDecision.com's
   `/data/next.json` is not sent with `Access-Control-Allow-Origin` today, so
   browsers on other sites cannot read it and the widget leaves the decisions
   out. Adding `Access-Control-Allow-Origin: *` to `/data/` on that site (it is
   open data) turns them on everywhere.
4. Publish the indicators on the MQL5 Code Base (MQL5 account), the library on
   npm as `forex-strength-sessions`, and the repository as
   `github.com/ForexiaPro/strength-sessions`.

## Licence

MIT, see [LICENSE](LICENSE). The decisions shown in the sessions widget are
InterestRateDecision.com's open data, free to reuse with a link.

---

Part of the Forexia network: [InterestRateDecision.com](https://interestratedecision.com/?via=strength-sessions) · [Forexia Academy](https://forexiapro.com/courses?via=strength-sessions) · [TradingSignalBot](https://tradingsignalbot.com/?via=strength-sessions) · [PropSim](https://github.com/PropSim-Enterprise) · [OpenCharts](https://github.com/dylanpersonguy/OpenCharts)
