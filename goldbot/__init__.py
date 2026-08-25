"""goldbot — an autonomous XAU/USD trading system.

Seventeen classical and modern strategies vote; an ensemble weighs them by
market regime and by their own realised performance; a risk manager decides
whether the winning idea is worth a position and how large; and an execution
engine places, manages and closes the trade without further input.

    python -m goldbot backtest
    python -m goldbot paper --replay
    python -m goldbot live
"""

__version__ = "1.0.0"

from .config import BotConfig, load
from .core.types import Direction, ExitReason, Position, Side, Trade, TradePlan

__all__ = [
    "__version__",
    "BotConfig",
    "load",
    "Direction",
    "ExitReason",
    "Position",
    "Side",
    "Trade",
    "TradePlan",
]
