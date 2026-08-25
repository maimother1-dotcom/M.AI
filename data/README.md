# Market data for goldbot

Put your XAUUSD history here. CSV files in this folder are gitignored — market
data is large, broker-specific, and usually licensed.

## Exporting from MetaTrader 5

1. **Tools → Options → Charts** → set "Max bars in chart" to `Unlimited`.
2. Open an XAUUSD chart, set the timeframe to **M15**, and press `Home` repeatedly
   until the chart stops loading older bars.
3. **Tools → History Center** (or right-click the chart → Save As).
4. Save as `data/XAUUSD_M15.csv`.

The exporter's tab-separated `<DATE> <TIME> <OPEN> <HIGH> <LOW> <CLOSE> <TICKVOL>`
format is read as-is — no editing needed.

Two years of M15 is about 50,000 bars and is the minimum worth drawing
conclusions from. Five years is better.

## Exporting from OANDA

```bash
python -m goldbot data --out data/XAUUSD_M15.csv --bars 50000 \
    --config your.yaml     # with data.source: oanda
```

## Using it

```bash
python -m goldbot backtest    --csv data/XAUUSD_M15.csv --out results/
python -m goldbot walkforward --csv data/XAUUSD_M15.csv --folds 4
python -m goldbot paper --replay --csv data/XAUUSD_M15.csv
```

## Which broker's data?

Use the broker you will actually trade with. Gold spreads range from $0.15 to
over $0.50 between brokers, and at 0.5% risk per trade that difference decides
whether an intraday edge survives. Backtesting on one broker's data and trading
on another's is how a profitable simulation becomes a losing account.
