#!/usr/bin/env python3
"""Suma los tokens de cada etapa a partir de los registros locales de las sesiones.

Los registros (Codex y Claude Code) viven fuera del repositorio, en la máquina
donde se trabajó, así que este script se corre a mano y su resultado se
versiona en ``src/didactica/datos/tokens.json``. Sólo publica totales por
etapa: ningún contenido de las conversaciones.

    python3 scripts/tokens_sesiones.py --codex <rollout.jsonl> --claude <sesion.jsonl>

Cada etapa se delimita por la hora (UTC) de un mensaje de la persona o de un
commit. "Entrada nueva" son tokens leídos por primera vez; "caché" son los que
el modelo relee de la conversación en cada turno (mucho más baratos); "salida"
es lo que el modelo escribe.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "didactica" / "datos" / "tokens.json"

# (id de etapa, comienzo UTC). Cada etapa termina donde empieza la siguiente.
CODEX_STAGES = [
    ("codex-plan", "2026-09-30T16:16:00Z"),
    ("codex-construccion", "2026-09-30T16:34:00Z"),
    ("codex-publicacion", "2026-10-01T11:49:00Z"),
    ("codex-datos", "2026-10-01T12:03:00Z"),
    ("codex-mapa", "2026-10-01T12:50:00Z"),
]
CLAUDE_STAGES = [
    ("claude-diagnostico", "2026-10-01T12:54:00Z"),
    ("claude-datos", None),                      # empieza al aprobarse el primer plan
    ("claude-app", "2026-10-01T15:10:00Z"),      # commit 97a224a
    ("claude-publicar", "2026-10-01T15:29:29Z"),  # commit d88d67b
    ("claude-didactica", "2026-10-01T15:56:38Z"),
]


def ts(value: str) -> float:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def stage_at(stages: list[tuple[str, float]], moment: float) -> str | None:
    current = None
    for name, start in stages:
        if moment >= start:
            current = name
    return current


def codex(path: str) -> tuple[dict, str | None]:
    stages = [(name, ts(start)) for name, start in CODEX_STAGES]
    totals = {name: {"entrada": 0, "cache": 0, "salida": 0, "turnos": 0, "desde": None, "hasta": None} for name, _ in stages}
    model = None
    for line in open(path, encoding="utf-8"):
        event = json.loads(line)
        payload = event.get("payload") or {}
        model = model or payload.get("model")
        if payload.get("type") != "token_count" or not (payload.get("info") or {}).get("last_token_usage"):
            continue
        usage = payload["info"]["last_token_usage"]
        name = stage_at(stages, ts(event["timestamp"]))
        if not name:
            continue
        bucket = totals[name]
        cached = usage.get("cached_input_tokens", 0)
        bucket["entrada"] += usage.get("input_tokens", 0) - cached
        bucket["cache"] += cached
        bucket["salida"] += usage.get("output_tokens", 0)
        bucket["turnos"] += 1
        bucket["desde"] = bucket["desde"] or event["timestamp"]
        bucket["hasta"] = event["timestamp"]
    return totals, model


def claude(path: str) -> tuple[dict, str | None]:
    files = [path] + sorted(glob.glob(os.path.join(os.path.splitext(path)[0], "subagents", "*.jsonl")))
    plan_approved = None
    for line in open(path, encoding="utf-8"):
        if plan_approved or "ExitPlanMode" not in line:
            continue
        event = json.loads(line)
        content = (event.get("message") or {}).get("content")
        if event.get("type") == "assistant" and isinstance(content, list) and any(
            isinstance(item, dict) and item.get("type") == "tool_use" and item.get("name") == "ExitPlanMode" for item in content
        ):
            plan_approved = event["timestamp"]
    stages = [(name, ts(start or plan_approved)) for name, start in CLAUDE_STAGES]
    totals = {name: {"entrada": 0, "cache": 0, "salida": 0, "turnos": 0, "subagentes": 0, "desde": None, "hasta": None} for name, _ in stages}
    seen, model = set(), None
    for index, file in enumerate(files):
        agent_stages = set()
        for line in open(file, encoding="utf-8"):
            event = json.loads(line)
            message = event.get("message") or {}
            usage = message.get("usage")
            if event.get("type") != "assistant" or not usage or message.get("id") in seen:
                continue
            seen.add(message.get("id"))
            if index == 0:
                model = model or message.get("model")
            name = stage_at(stages, ts(event["timestamp"]))
            if not name:
                continue
            bucket = totals[name]
            bucket["entrada"] += (usage.get("input_tokens") or 0) + (usage.get("cache_creation_input_tokens") or 0)
            bucket["cache"] += usage.get("cache_read_input_tokens") or 0
            bucket["salida"] += usage.get("output_tokens") or 0
            bucket["turnos"] += 1
            bucket["desde"] = min(filter(None, [bucket["desde"], event["timestamp"]]))
            bucket["hasta"] = max(filter(None, [bucket["hasta"], event["timestamp"]]))
            agent_stages.add(name)
        if index:
            for name in agent_stages:
                totals[name]["subagentes"] += 1
    return totals, model


def main() -> None:
    home = Path.home()
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--codex", default=str(home / ".codex/sessions/2026/09/30/rollout-2026-09-30T13-10-02-01a0f314-7fd5-7eb0-9f66-e128a33f85eb.jsonl"))
    parser.add_argument("--claude", default=str(home / ".claude/projects/-var-home-mpodeley/8b951cb7-a95c-4b7f-9237-37816372de45.jsonl"))
    args = parser.parse_args()
    codex_totals, codex_model = codex(args.codex)
    claude_totals, claude_model = claude(args.claude)
    payload = {
        "generado": datetime.now().astimezone().strftime("%Y-%m-%dT%H:%M:%S%z"),
        "nota": "Totales por etapa leídos de los registros locales de cada sesión. La última etapa estaba en curso al generar el archivo.",
        "agentes": {"codex": {"modelo": codex_model}, "claude": {"modelo": claude_model}},
        "etapas": {**codex_totals, **claude_totals},
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for name, bucket in payload["etapas"].items():
        print(f"{name:22} entrada {bucket['entrada']:>10,} cache {bucket['cache']:>12,} salida {bucket['salida']:>9,} turnos {bucket['turnos']:>4}")
    print("modelos:", codex_model, claude_model)


if __name__ == "__main__":
    main()
