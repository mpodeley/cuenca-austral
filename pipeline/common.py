"""Utilidades compartidas por los pasos del pipeline."""

from __future__ import annotations

import json
import shutil
import time
import unicodedata
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
STORE_DIR = ROOT / "data" / "store"
PROCESSED_DIR = ROOT / "data" / "processed"
PUBLIC_DIR = ROOT / "public" / "data"
USER_AGENT = "cuenca-austral/0.2 (+https://github.com/mpodeley/cuenca-austral)"
SOURCE = "Secretaría de Energía de la Nación — Capítulo IV (datos.energia.gob.ar)"


def canonical(value: Any) -> str:
    value = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(char for char in value if not unicodedata.combining(char)).lower().strip()


def open_url(url: str, timeout: int = 120, retries: int = 4):
    url = url.replace("http://", "https://")
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            return urllib.request.urlopen(request, timeout=timeout)
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(5 * (attempt + 1))


def download(url: str, target: Path) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    with open_url(url, timeout=300) as response, target.open("wb") as output:
        shutil.copyfileobj(response, output)
    return target


def package_resources(package_id: str) -> dict[str, dict[str, Any]]:
    url = f"https://datos.energia.gob.ar/api/3/action/package_show?id={package_id}"
    with open_url(url) as response:
        return {item["id"]: item for item in json.load(response)["result"]["resources"]}


def month_index(month: str, origin: str) -> int:
    return (int(month[:4]) - int(origin[:4])) * 12 + int(month[5:7]) - int(origin[5:7])


def month_at(origin: str, index: int) -> str:
    total = int(origin[:4]) * 12 + int(origin[5:7]) - 1 + index
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def days_in_month(month: str) -> int:
    year, number = int(month[:4]), int(month[5:7])
    if number == 2:
        return 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28
    return 30 if number in (4, 6, 9, 11) else 31


def wrap(data: Any, source_date: str, **extra: Any) -> dict[str, Any]:
    """Sobre común de los JSON publicados: de dónde salen y hasta cuándo llegan."""
    return {"generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"), "source": SOURCE, "source_date": source_date, **extra, "data": data}


def write_json(path: Path, payload: Any) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return path.stat().st_size
