#!/usr/bin/env python3
"""Baja la producción mensual por pozo (Capítulo IV) de la Cuenca Austral.

Lee los CSV anuales completos por streaming y se queda con las filas de la
cuenca. No usa el DataStore de CKAN: esa API devuelve 404 para algunos años
(2014, 2015, 2017) y cargas parciales para otros (2024, 2025), aunque el CSV
descargable esté completo.

El resultado es un store compacto y versionado, ``data/store/capiv_austral.json.gz``::

    {"meta": {"years": {"2024": {resource_id, last_modified, rows, ...}}},
     "wells": {"<idpozo>": {"a": {atributos del último mes informado},
                            "m": {"AAAA-MM": [gas, pet, agua, tef, iny_agua]}}}}

Unidades de la fuente: gas en miles de m³ por mes, petróleo y agua en m³ por
mes, ``tef`` en días efectivos del mes.

Por defecto baja los años que faltan en el store más el año en curso y el
anterior. ``--all`` vuelve a bajar todo año cuyo recurso haya cambiado.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import re
import sys
import time
import unicodedata
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
STORE_PATH = ROOT / "data" / "store" / "capiv_austral.json.gz"
PACKAGE_ID = "c846e79c-026c-4040-897f-1ad3543b407c"
PACKAGE_URL = f"https://datos.energia.gob.ar/api/3/action/package_show?id={PACKAGE_ID}"
RESOURCE_NAME = "produccion de pozos de gas y petroleo"
TARGET_CUENCA = "AUSTRAL"
FIRST_YEAR = 2006
USER_AGENT = "cuenca-austral/0.2 (+https://github.com/mpodeley/cuenca-austral)"

ATTRS = {
    "sigla": "sigla", "empresa": "empresa", "area": "areapermisoconcesion",
    "cod_area": "idareapermisoconcesion", "yacimiento": "areayacimiento", "provincia": "provincia",
    "formacion": "formacion", "tipo_recurso": "tipo_de_recurso", "sub_tipo_recurso": "sub_tipo_recurso",
    "tipopozo": "tipopozo", "tipoestado": "tipoestado", "tipoextraccion": "tipoextraccion",
    "profundidad": "profundidad",
}


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


def yearly_resources(package: dict[str, Any]) -> dict[int, dict[str, Any]]:
    """Elige un CSV por año: sin sufijo DDJJ antes que DDJJ; entre gemelos, el más grande y luego el más nuevo."""
    by_year: dict[int, dict[str, Any]] = {}
    for item in package["resources"]:
        name = canonical(item.get("name")).replace("–", "-")
        if RESOURCE_NAME not in name or canonical(item.get("format")) != "csv":
            continue
        match = re.search(r"\b(20\d{2})\b", name)
        if not match:
            continue  # recurso "No Convencional", sin año
        year = int(match.group(1))
        score = ("ddjj" not in name, int(item.get("size") or 0), item.get("last_modified") or "")
        if year not in by_year or score > by_year[year]["_score"]:
            by_year[year] = {**item, "_score": score}
    return by_year


def number(value: str) -> float:
    try:
        return float(value) if value else 0.0
    except ValueError:
        return 0.0


def stream_year(year: int, resource: dict[str, Any]) -> dict[str, Any]:
    """Devuelve ``{idpozo: {"a": attrs, "m": {mes: [gas, pet, agua, tef, iny_agua]}}}`` del año."""
    wells: dict[str, dict[str, Any]] = {}
    latest: dict[str, str] = {}
    rows = 0
    for attempt in range(3):
        wells.clear(); latest.clear(); rows = 0
        try:
            with open_url(resource["url"], timeout=300) as response:
                reader = csv.reader(io.TextIOWrapper(response, encoding="utf-8-sig", newline=""))
                header = next(reader)
                col = {name: index for index, name in enumerate(header)}
                i_cuenca, i_id, i_anio, i_mes = col["cuenca"], col["idpozo"], col["anio"], col["mes"]
                values = [col["prod_gas"], col["prod_pet"], col["prod_agua"], col["tef"], col["iny_agua"]]
                attrs = {key: col[source] for key, source in ATTRS.items() if source in col}
                for row in reader:
                    if len(row) <= i_cuenca or row[i_cuenca].strip().upper() != TARGET_CUENCA:
                        continue
                    rows += 1
                    month = f"{int(row[i_anio]):04d}-{int(row[i_mes]):02d}"
                    well = wells.setdefault(row[i_id], {"a": {}, "m": {}})
                    gas, pet, agua, tef, iny = (number(row[index]) for index in values)
                    point = well["m"].get(month)
                    if point is None:
                        well["m"][month] = [gas, pet, agua, tef, iny]
                    else:  # una fila por formación: los volúmenes se suman, los días no
                        point[0] += gas; point[1] += pet; point[2] += agua
                        point[3] = max(point[3], tef); point[4] += iny
                    if month >= latest.get(row[i_id], ""):
                        latest[row[i_id]] = month
                        well["a"] = {key: row[index].strip() for key, index in attrs.items()}
            break
        except Exception as error:
            if attempt == 2:
                raise RuntimeError(f"{year}: no se pudo leer {resource['url']}: {error}") from error
            time.sleep(15)
    for well in wells.values():
        well["m"] = {month: [round(value, 3) for value in point] for month, point in well["m"].items()}
    print(f"  {year}: {rows:>7} filas, {len(wells)} pozos  ({resource['name']})", flush=True)
    return {"year": year, "rows": rows, "wells": wells}


def load_store() -> dict[str, Any]:
    if not STORE_PATH.exists():
        return {"meta": {"years": {}}, "wells": {}}
    with gzip.open(STORE_PATH, "rt", encoding="utf-8") as stream:
        return json.load(stream)


def save_store(store: dict[str, Any]) -> None:
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(store, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    # mtime fijo: el archivo sólo cambia si cambian los datos
    with open(STORE_PATH, "wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as stream:
        stream.write(payload.encode("utf-8"))


def merge_year(store: dict[str, Any], result: dict[str, Any]) -> None:
    prefix = f"{result['year']:04d}-"
    for well in store["wells"].values():
        for month in [month for month in well["m"] if month.startswith(prefix)]:
            del well["m"][month]
    for well_id, fresh in result["wells"].items():
        well = store["wells"].setdefault(well_id, {"a": {}, "m": {}})
        newest = max(well["m"], default="")
        well["m"].update(fresh["m"])
        if max(fresh["m"]) >= newest:
            well["a"] = fresh["a"]
    store["wells"] = {well_id: well for well_id, well in store["wells"].items() if well["m"]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--all", action="store_true", help="revisa todos los años, no sólo los dos últimos")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    with open_url(PACKAGE_URL) as response:
        package = json.load(response)["result"]
    resources = yearly_resources(package)
    store = load_store()
    known = store["meta"]["years"]
    this_year = datetime.now(UTC).year
    todo = []
    for year in sorted(resources):
        if year < FIRST_YEAR:
            continue
        resource = resources[year]
        previous = known.get(str(year))
        changed = not previous or (previous["resource_id"], previous["last_modified"]) != (resource["id"], resource.get("last_modified"))
        if not previous or (changed and (args.all or year >= this_year - 1)):
            todo.append(year)
    missing = [year for year in range(FIRST_YEAR, this_year + 1) if year not in resources]
    if missing:
        raise RuntimeError(f"El catálogo no publica CSV anual para: {missing}")
    print(f"Años a descargar: {todo or 'ninguno'}", flush=True)
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for result in pool.map(lambda year: stream_year(year, resources[year]), todo):
            resource = resources[result["year"]]
            merge_year(store, result)
            known[str(result["year"])] = {
                "resource_id": resource["id"], "name": resource["name"], "url": resource["url"],
                "last_modified": resource.get("last_modified"), "rows": result["rows"], "wells": len(result["wells"]),
            }
            save_store(store)
    months = sorted({month for well in store["wells"].values() for month in well["m"]})
    print(f"Store: {len(store['wells'])} pozos, {months[0]} a {months[-1]}, {STORE_PATH.stat().st_size / 1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
