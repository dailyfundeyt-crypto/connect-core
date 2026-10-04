"""Paths and endpoints. Everything has a local default; nothing here is a secret."""
from __future__ import annotations

import os
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent
HOME = Path(os.environ.get("CSEO_HOME") or Path(os.environ.get("LOCALAPPDATA", Path.home())) / "ConnectSEO")
REPORT_ROOT = Path(os.environ.get("CSEO_REPORT_ROOT") or Path.home() / "Documents" / "jev-seo-reports")
HELIUM = os.environ.get("CSEO_HELIUM") or str(Path(os.environ.get("LOCALAPPDATA", "")) / "imput" / "Helium" / "Application" / "chrome.exe")
PROFILE_DIR = HOME / "helium-profile"
SHOTS_DIR = HOME / "shots"
JEVSEO_DIR = Path(os.environ.get("CSEO_JEVSEO_DIR") or APP_DIR / "vendor" / "jev-seo")

HOST = os.environ.get("CSEO_HOST") or "127.0.0.1"
PORT = int(os.environ.get("CSEO_PORT") or 4310)
PUBLIC_BASE = f"http://127.0.0.1:{PORT}"

OLLAMA_URL = (os.environ.get("CSEO_OLLAMA_URL") or "http://127.0.0.1:11434").rstrip("/")
MODEL = os.environ.get("CSEO_MODEL") or "qwen3:8b"
NUM_CTX = int(os.environ.get("CSEO_NUM_CTX") or 16384)

LAYA_URL = os.environ.get("CSEO_LAYA_URL") or "http://127.0.0.1:8000/v1/systemone"
DEFAULT_MAX_PAGES = int(os.environ.get("CSEO_MAX_PAGES") or 25)
# Laya runs on the CPU with one inference worker: judge a sample of pages, two requests at a time.
JEV_PAGES = int(os.environ.get("CSEO_JEV_PAGES") or 10)
JEV_WORKERS = int(os.environ.get("CSEO_JEV_WORKERS") or 2)
JEV_TIMEOUT = int(os.environ.get("CSEO_JEV_TIMEOUT") or 300)
AUDIT_TIMEOUT = int(os.environ.get("CSEO_AUDIT_TIMEOUT") or 1500)
BROWSER_IDLE_SECONDS = int(os.environ.get("CSEO_BROWSER_IDLE_SECONDS") or 600)


def secret(name: str) -> str | None:
    """Read a value from the environment or HOME/secrets.env (outside the repo, never logged)."""
    if os.environ.get(name):
        return os.environ[name]
    path = HOME / "secrets.env"
    if path.is_file():
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.startswith(f"{name}="):
                return line.split("=", 1)[1].strip() or None
    return None
