"""Logging: readable on the console, complete in the file."""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Optional

CONSOLE_FORMAT = "%(asctime)s %(levelname)-7s %(message)s"
FILE_FORMAT = "%(asctime)s %(levelname)-7s %(name)s:%(lineno)d %(message)s"


def configure(level: str = "INFO", log_file: Optional[str | Path] = None) -> logging.Logger:
    root = logging.getLogger("goldbot")
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    root.handlers.clear()
    root.propagate = False

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(logging.Formatter(CONSOLE_FORMAT, datefmt="%H:%M:%S"))
    root.addHandler(console)

    if log_file:
        path = Path(log_file).expanduser()
        path.parent.mkdir(parents=True, exist_ok=True)
        handler = logging.FileHandler(path)
        handler.setFormatter(logging.Formatter(FILE_FORMAT))
        handler.setLevel(logging.DEBUG)
        root.addHandler(handler)
    return root
