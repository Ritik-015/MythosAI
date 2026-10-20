"""Central logging with bounded local log files."""
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = PROJECT_ROOT / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

_log_path = (LOG_DIR / "mythos.log").resolve()
_file_handler = RotatingFileHandler(
    _log_path,
    maxBytes=2 * 1024 * 1024,
    backupCount=3,
    encoding="utf-8",
)
_formatter = logging.Formatter(
    "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
)
_file_handler.setFormatter(_formatter)
_stream_handler = logging.StreamHandler()
_stream_handler.setFormatter(_formatter)

_root = logging.getLogger()
if not any(getattr(handler, "baseFilename", None) == str(_log_path) for handler in _root.handlers):
    _root.addHandler(_file_handler)
if not any(type(handler) is logging.StreamHandler for handler in _root.handlers):
    _root.addHandler(_stream_handler)
_root.setLevel(logging.INFO)

for _name in ("httpx", "httpcore", "openai", "engineio", "socketio"):
    logging.getLogger(_name).setLevel(logging.WARNING)

logger = logging.getLogger("MythosAI")
