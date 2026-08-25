# goldbot — autonomous XAU/USD trading system

A complete, self-contained gold trading bot. Seventeen strategies vote on every
closed bar, an ensemble weighs them by market regime and by their own realised
performance, a risk manager decides whether the winning idea is worth a position
and how large, and an execution engine places the order, manages it, and closes
it. No manual entries, no manual stops, no manual exits.

Gold only. Everything — the session windows, the volatility model, the cost
assumptions, the contract maths — is specific to XAUUSD.

```
python -m goldbot doctor          # check the setup
python -m goldbot backtest        # simulate on history
python -m goldbot paper --replay  # run the LIVE engine against history
python -m goldbot walkforward     # out-of-sample validation
python -m goldbot live            # trade a real account
```

---

## 1. Install

```bash
pip install numpy pandas pyyaml          # required
pip install MetaTrader5                  # only for MT5 (Windows)
pip install pytest                       # only to run the tests
```

No other dependencies. OANDA support uses the standard library.

---

## 2. How a trade happens

```
   bars (M15)
        │
        ▼
 ┌──────────────┐   56 features: ATR, ADX, EMA ribbon, RSI, MACD, Bollinger,
 │   features   │   Keltner, Donchian, Supertrend, VWAP, swings, pivots,
 └──────┬───────┘   prior-day levels, plus 4H and D1 context
        │
        ▼
 ┌──────────────┐   STRONG_TREND · WEAK_TREND · RANGE · VOLATILE_CHOP
 │    regime    │   (ADX + Kaufman efficiency ratio + volatility percentile)
 └──────┬───────┘
        │
        ▼
 ┌──────────────────────────────────────────────┐
 │  17 strategies, each returning a direction   │
 │  and a confidence 0..1                       │
 └──────┬───────────────────────────────────────┘
        │  weight × regime affinity × adaptive multiplier
        ▼
 ┌──────────────┐   agreement ≥ 0.60, ≥ 2 aligned voters,
 │   ensemble   │   confidence ≥ 0.34 after the regime scaling
 └──────┬───────┘
        │
        ▼
 ┌──────────────┐   size = risk% × equity ÷ stop distance,
 │ risk manager │   then every hard limit below
 └──────┬───────┘
        │
        ▼
 ┌──────────────┐   fills at the NEXT bar's open, stop attached at the broker,
 │   execution  │   partial at 1R, break-even, chandelier trail, time stop
 └──────────────┘
```

A decision made on the close of bar *i* is executed at the open of bar *i+1* —
in the backtester and in the live engine alike. The bot never acts on a bar that
is still forming.

---

## 3. The committee

Seventeen strategies, drawn from the traditions that have actually produced
documented results, each reduced to mechanical rules and each with a regime
affinity that determines how much say it gets.

### Trend and momentum

| Strategy | Origin | Rule |
|---|---|---|
| `ema_stack` | Guppy ribbon | 21/50/200 stacked, ADX ≥ 20, entered on a pullback to the fast EMA rather than on the cross |
| `supertrend` | ATR channel following | Supertrend direction, ≥ 3 bars old, RSI reset out of the extreme, not more than 3 ATR from the line |
| `macd_momentum` | Appel | Histogram turning back in the direction of the 4H bias |
| `turtle` | Dennis & Eckhardt, 1983 | 20-bar Donchian breakout, 2N stop, with the volatility-blowout filter the original lacked |
| `htf_alignment` | Multi-timeframe desk practice | D1 bias + 4H bias + entry-timeframe bias all pointing the same way |

### Mean reversion

| Strategy | Origin | Rule |
|---|---|---|
| `connors_rsi2` | Larry Connors | RSI(2) ≤ 8 above the 200-EMA (or ≥ 92 below it), with a stretch cap |
| `bollinger_fade` | Bollinger | Band tag that *fails*: traded outside, closed back inside, ADX < 25 |
| `vwap_reversion` | Institutional benchmarking | 1.8–5 ATR from session VWAP with momentum already stalling |
| `pivot_fade` | Floor-trader pivots | First touch of R1/S1 computed from the previous UTC day |

### Session and volatility breakout

| Strategy | Origin | Rule |
|---|---|---|
| `asian_breakout` | Tokyo range / London expansion | Break of the compressed Asian box in the first three hours of London |
| `ny_orb` | Opening-range breakout | Break of the first 30 minutes of New York, taken during the overlap |
| `squeeze` | TTM squeeze (Carter) | Bollinger inside Keltner for ≥ 6 bars, then the expansion bar |
| `prior_day_break` | Classic level trading | Decisive close beyond yesterday's high/low, in the direction of the bias |

### Price structure

| Strategy | Origin | Rule |
|---|---|---|
| `liquidity_sweep` | Stop-run / SMC | Wick takes out a 20-bar extreme, close returns inside — liquidity collected, not a breakout |
| `fvg_retest` | Fair-value gap / imbalance | Three-bar imbalance ≥ 0.35 ATR, first retest only, in the trend direction |
| `fib_pullback` | Fibonacci continuation | 61.8% retrace of the last impulse leg plus a confirmation bar |
| `engulfing_level` | Candlestick reversal | Engulfing bar, but only at a prior-day extreme, pivot or confirmed swing |

**Why an ensemble.** Every one of these has losing years. What they do not share
is *when* they lose: the trend followers bleed in ranges, the fade strategies
bleed in trends, the breakout strategies bleed in chop. Requiring agreement
across families, and weighting each family by the regime it suits, converts
seventeen mediocre edges into one that trades less often and with more reason.

### Adaptive weighting

Each closed trade credits its contributors in proportion to how hard they pushed
the decision, into an exponentially-weighted expectancy per strategy (40-trade
half-life). A strategy backing winners earns up to 1.75× its base weight; one
backing losers falls to 0.35×. The state lives in `adaptive_weights.json` and
survives restarts, so the bot keeps learning which of its strategies work *on
your broker, on your spread, in this market* rather than in a backtest.

---

## 4. Risk

The strategies produce ideas. This layer decides whether an idea becomes money
at risk, and it can always say no.

**Position sizing.** `lots = (equity × risk% × confidence factor) ÷ (stop distance × 100)`,
floored to the lot step so rounding can never enlarge the risk. One standard
XAUUSD lot is 100 ounces, so $1 of gold movement is $100 per lot; that constant
lives in exactly one place.

| Control | Default | What it does |
|---|---|---|
| `risk_per_trade` | 0.5% | Risked per trade at full conviction |
| confidence scaling | 0.5×–1.25× | Smaller when the committee is lukewarm |
| `max_daily_loss` | 3% | Trading stops for the day |
| `max_daily_profit_lock` | 6% | Stops trading after a very good day |
| `max_drawdown` | 15% | **Kill switch**: flat, halted, phone alert |
| `consecutive_loss_pause` | 3 | Cooldown of 12 bars after three losses |
| `streak_derisk` | on | 40% smaller after two losses in a row |
| `max_open_positions` | 2 | Never hedged, never pyramided blindly |
| `max_trades_per_day` | 6 | Caps a bad day at ~3% before the daily stop |
| `max_spread` | $0.60 | Skips entries when the book is thin |
| `max_margin_utilisation` | 25% | Margin cap independent of stop distance |
| `min_reward_risk` | 1.2 | No trade whose target is not worth the stop |

**Stops.** Initial stop = max(1.0 ATR, min(3.5 ATR, blend of 1.8 ATR and the
structural level the strategies nominated)). The *widest* stop among the aligned
voters wins: the trade must survive every idea that justified it.

**Management.** Half off at +1R → stop to break-even + 0.08R → chandelier trail
at 2.2 ATR from the running extreme past +1.4R → full target at 2.6R → time stop
after 48 bars below +0.35R → immediate exit if the committee flips against the
position with confidence ≥ 0.45.

**When it will not trade at all.** Outside London/New York; the 21:00 UTC
rollover; Friday after 19:00 UTC; before Monday 01:00 UTC; the whole weekend;
15 minutes before to 30 minutes after Non-Farm Payrolls and any event listed in
`news_events`.

---

## 5. Brokers

| Broker | Platform | Notes |
|---|---|---|
| `paper` | anywhere | Simulated account with spread, commission, slippage and swap. Default. |
| `mt5` | Windows | MetaTrader 5. Resolves your broker's gold symbol (`XAUUSD`, `GOLD`, `XAUUSD.m`, …), picks a filling mode the symbol accepts, respects the broker's minimum stop distance, retries requotes, and tags every order with a magic number so your manual trades are never touched. |
| `oanda` | any | v20 REST. Stops and targets are attached *on fill*, so a dropped connection cannot leave a naked position. |

`dry_run: true` routes every order to the paper broker no matter what `broker`
says. Going live needs two separate switches: `dry_run: false` **and**
`confirm_live: true`, plus typing `TRADE` at the prompt.

---

## 6. Validating it

The backtester is deliberately pessimistic:

- Signals on the close of bar *i*, fills at the open of bar *i+1*.
- When the stop and the target both sit inside a bar, **the stop fills first**.
- A gap through the stop fills at the open, not at the level.
- Spread widens by session (1.35× overnight, 1.9× at rollover) and by 1.6× when
  volatility is in the top decile.
- Commission, slippage and overnight swap are all charged.
- An entry that gaps more than 0.5R past the planned price is cancelled, not
  chased; one that still fills is re-sized so the risk stays constant.

```bash
python -m goldbot backtest --csv data/XAUUSD_M15.csv --montecarlo 2000 --out results/
python -m goldbot walkforward --csv data/XAUUSD_M15.csv --folds 4
```

`walkforward` optimises on a training window, trades the next window with those
settings, and reports **walk-forward efficiency** — out-of-sample return divided
by in-sample return. Below 0.4 means the tuning is fitting noise, and the
command says so.

`monte_carlo` reshuffles the trade order two thousand times to show the drawdown
you were lucky to avoid. Size for the 95th percentile, not for what happened.

**The look-ahead test is the one that matters.** `tests/test_no_lookahead.py`
recomputes every feature and every strategy signal on a truncated history and
asserts the values for the final bar are identical. If any indicator peeked at a
future bar, that test fails. Run it before trusting any result:

```bash
python -m pytest tests/test_no_lookahead.py -v
```

---

## 7. Going live

1. **Get real data.** The synthetic generator is for testing the machinery, not
   for evaluating an edge. Export at least two years of XAUUSD M15 from your own
   broker — its spread and its gaps are what you will actually trade.
2. `python -m goldbot backtest --csv your_data.csv` — read the whole report, not
   the return line.
3. `python -m goldbot walkforward --csv your_data.csv` — if efficiency is under
   0.4, stop. Do not proceed to step 4.
4. `python -m goldbot paper --replay --csv your_data.csv` — the live engine over
   history; confirms the engine and the backtester agree.
5. **Paper trade a demo account for at least a month.** `broker: oanda` (or
   `mt5`) with `dry_run: true` — real prices, real spreads, simulated money.
6. Live with the smallest size your broker permits, `risk_per_trade: 0.0025`,
   for another month.
7. Only then raise the risk, and never above 1%.

Set `ntfy_topic` to get every entry, exit and halt pushed to your phone. Note
that ntfy topics are public to anyone who knows the name, so the bot sends
prices and sizes but never account numbers.

---

## 8. Configuration

Everything lives in `goldbot/default_config.yaml`, which is commented in full.
Secrets never go in it: write `${MT5_PASSWORD}` and the value is read from the
environment or from `~/.claude/credentials/goldbot.env`.

```bash
python -m goldbot init --out my.yaml        # a starter file
python -m goldbot doctor --config my.yaml   # validate it, test the connection
```

`doctor` prints the risk budget in currency terms — including what the worst
allowed day costs — before you ever place an order.

---

## 9. Commands

| Command | What it does |
|---|---|
| `backtest` | Historical simulation with the full report; `--out` writes trades, equity and metrics |
| `paper` | Runs the live engine on a simulated account; `--replay` drives it from history |
| `live` | Trades a real account (requires both safety switches and a typed confirmation) |
| `optimize` | Random search over weights and thresholds; `--apply` writes the winner to YAML |
| `walkforward` | Out-of-sample validation with an efficiency score |
| `status` | Reads the journal: P&L, win rate, expectancy, and per-strategy attribution |
| `data` | Exports bars to CSV |
| `doctor` | Validates config, risk budget, feed and broker connectivity |
| `init` | Writes a starter config |

---

## 10. What this is not

- **Not a guarantee.** It is a disciplined framework for executing a set of
  well-known edges with strict risk control. Gold can gap through a stop on a
  headline; a 15% drawdown is designed for, not hypothetical.
- **Not validated on real data here.** The results produced in this repository
  come from the synthetic generator, which is smoother than real gold. They
  prove the system runs end to end. They are not evidence of profitability.
- **Not a substitute for a demo period.** Spreads, execution quality and swap
  rates vary enormously between gold brokers, and they decide whether an
  intraday edge survives.
- **Not set-and-forget.** Check `python -m goldbot status` weekly. If the
  adaptive weights have collapsed across the board, the market has changed and
  the configuration needs revisiting.

## 11. Layout

```
goldbot/
  core/          types, indicator library, feature and regime engine
  data/          synthetic, CSV, MT5, OANDA and replay feeds
  strategies/    17 strategies + the ensemble and adaptive weighting
  risk/          sizing, limits, stop rules, sessions and the news calendar
  execution/     broker abstraction, paper/MT5/OANDA, the live engine
  backtest/      simulator, metrics, walk-forward, Monte Carlo
  default_config.yaml   the whole control surface, commented in full
tests/           ~90 tests, including the no-look-ahead proof
```
