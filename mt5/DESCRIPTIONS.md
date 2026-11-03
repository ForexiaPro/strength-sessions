# MQL5 Code Base descriptions

Text for the two free publications. MQL5's rules limit outside links in a
description: if a link is refused, keep the text and leave the link to the
profile and the source repository.

## Session Boxes (Sydney, Tokyo, London, New York)

**Category**: Indicators. **Platform**: MetaTrader 5. **Licence**: MIT.

Draws the four forex sessions as boxes from each session's high to its low,
so you can see at a glance where Asia ranged, where London took it and what
New York did with it.

- Each session is set in its own city's hours: Sydney 07:00-16:00, Tokyo
  09:00-18:00, London 08:00-17:00, New York 08:00-17:00 local time (all can be
  changed).
- Daylight saving is handled per city: the US and Europe change on different
  dates in March and October/November, Sydney changes the other way, Tokyo
  never. The boxes stay on the right hours all year, including the weeks
  when the clocks disagree.
- Broker server time: choose *New York close* (UTC+2, UTC+3 in US summer, the
  clock most brokers use), *Auto* (the server's current offset from UTC) or
  *Fixed* (your own offset in hours).
- No session on a local Saturday or Sunday; a session box only covers bars
  that exist, so Sydney's Monday starts with the market.
- Inputs: days to draw, the highest timeframe to show on (H1 by default),
  labels, filled or outline boxes, each session on or off, its hours and colour.

Source and the matching web widget: github.com/ForexiaPro/strength-sessions.
Sessions guide: https://forexiapro.com/forex-sessions/?via=strength-sessions

Part of the Forexia network: InterestRateDecision.com · Forexia Academy · TradingSignalBot · PropSim · OpenCharts

## Currency Strength Meter (8 majors, 28 crosses)

**Category**: Indicators. **Platform**: MetaTrader 5. **Licence**: MIT.

Ranks USD, EUR, GBP, JPY, CHF, CAD, AUD and NZD from 0 (weakest) to 10
(strongest), as eight lines under the chart and a ranked panel, from the 28
crosses on your own terminal.

How it is calculated, bar by bar, with nothing hidden:

1. For each of the 28 crosses, the percent change of its close over
   `Lookback` bars of the chart's timeframe.
2. The change counts for the base currency and against the quote currency.
3. Each currency's score is the average over its 7 pairs.
4. The eight scores are rescaled to 0-10: the strongest is 10, the weakest 0.

- Every pair is read at the chart bar's time, so all 28 are measured to the
  same moment.
- Broker prefixes and suffixes (EURUSD.m, EURUSDpro) are read from the
  chart's symbol, or set in the inputs. A pair your broker does not list is
  left out, and the panel says how many of the 28 were used.
- The 0-10 scale ranks the currencies against each other over the lookback;
  it describes what has happened, it is not a forecast.
- Inputs: lookback in bars, bars to draw, prefix, suffix, panel on or off.

Source, the method in full and the matching web widget:
github.com/ForexiaPro/strength-sessions.
Forexia's trading tools: https://forexiapro.com/tradingtools?via=strength-sessions

Part of the Forexia network: InterestRateDecision.com · Forexia Academy · TradingSignalBot · PropSim · OpenCharts
