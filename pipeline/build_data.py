#!/usr/bin/env python3
"""Descarga, valida y publica un recorte reproducible de la Cuenca Austral.

Sin argumentos resuelve recursos desde el catálogo nacional y procesa datos
oficiales. ``--demo`` crea un conjunto sintético determinístico, claramente
marcado, para desarrollar la interfaz sin confundirlo con datos oficiales.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import io
import json
import math
import random
import re
import shutil
import sys
import unicodedata
import urllib.request
import urllib.parse
import zipfile
from collections import defaultdict
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config" / "sources.json"
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
PUBLIC_DIR = ROOT / "public" / "data"


def canonical(value: Any) -> str:
    value = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(char for char in value if not unicodedata.combining(char)).lower().strip()


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", canonical(value)).strip("-") or "sin-id"


def stable_id(prefix: str, value: str) -> str:
    digest = hashlib.sha256(canonical(value).encode()).hexdigest()[:10]
    return f"{prefix}-{slug(value)[:36]}-{digest}"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fetch(url: str, target: Path) -> dict[str, Any]:
    target.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "cuenca-austral/0.1 (+https://github.com/mpodeley/cuenca-austral)"})
    with urllib.request.urlopen(request, timeout=120) as response, target.open("wb") as output:
        shutil.copyfileobj(response, output)
    return {"url": url, "path": str(target.relative_to(ROOT)), "bytes": target.stat().st_size, "sha256": sha256(target)}


def iter_dicts(value: Any) -> Iterable[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from iter_dicts(child)
    elif isinstance(value, list):
        for child in value:
            yield from iter_dicts(child)


def first_text(item: dict[str, Any], *names: str) -> str:
    for name in names:
        value = item.get(name)
        if isinstance(value, str):
            return value
        if isinstance(value, dict):
            for candidate in value.values():
                if isinstance(candidate, str):
                    return candidate
    return ""


def resolve_catalog(config: dict[str, Any]) -> dict[str, list[dict[str, str]]]:
    found: dict[str, list[dict[str, str]]] = defaultdict(list)

    payloads: dict[str, dict[str, Any]] = {}
    for kind, spec in config["datasets"].items():
        dataset_id = spec["dataset_id"]
        if dataset_id not in payloads:
            catalog_path = RAW_DIR / f"catalog-{slug(dataset_id)}.json"
            try:
                fetch(config["ckan_api"].format(dataset_id=dataset_id), catalog_path)
                payloads[dataset_id] = json.loads(catalog_path.read_text(encoding="utf-8"))
            except Exception:
                payloads[dataset_id] = {}
        result = payloads[dataset_id].get("result") or payloads[dataset_id]
        for item in result.get("resources", []):
            title = first_text(item, "name", "title", "description")
            url = first_text(item, "url", "download_url")
            if title and url and any(canonical(pattern) in canonical(title) for pattern in spec["resource_patterns"]):
                found[kind].append({"title": title, "url": url, "format": first_text(item, "format")})
        if not found[kind]:
            found[kind].extend(resolve_landing_page(kind, spec))

    for kind in config["datasets"]:
        unique = {item["url"]: item for item in found[kind]}
        found[kind] = sorted(unique.values(), key=lambda item: item["title"])
        if not found[kind]:
            raise RuntimeError(f"El catálogo no devolvió recursos para {kind}; revise config/sources.json")
    return found


def resolve_landing_page(kind: str, spec: dict[str, Any]) -> list[dict[str, str]]:
    """Fallback for periods where the documented CKAN endpoint is unavailable."""
    target = RAW_DIR / f"landing-{kind}.html"
    fetch(spec["landing_page"], target)
    content = html.unescape(target.read_text(encoding="utf-8", errors="replace"))
    urls = [urllib.parse.urljoin(spec["landing_page"], value) for value in re.findall(r'href=["\']([^"\']+)["\']', content, re.IGNORECASE)]
    candidates = []
    for url in urls:
        normalized = canonical(urllib.parse.unquote(url))
        if "/download/" not in normalized:
            continue
        if kind == "production" and not ("produccion" in normalized and re.search(r"20\d{2}", normalized)):
            continue
        if kind == "wells" and not ("pozos" in normalized or "shapefile" in normalized):
            continue
        if kind == "concessions" and "concesion" not in normalized:
            continue
        if kind == "basin" and "cuenca" not in normalized:
            continue
        candidates.append({"title": Path(urllib.parse.urlparse(url).path).name, "url": url, "format": Path(url).suffix.lstrip(".")})
    return list({item["url"]: item for item in candidates}.values())


def detect_encoding(raw: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            raw.decode(encoding)
            return encoding
        except UnicodeDecodeError:
            pass
    return "latin-1"


def read_csv(path: Path) -> list[dict[str, str]]:
    raw = path.read_bytes()
    text = raw.decode(detect_encoding(raw))
    sample = text[:8192]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    return list(csv.DictReader(io.StringIO(text), dialect=dialect))


def pick(row: dict[str, Any], *candidates: str) -> Any:
    lookup = {canonical(key).replace("_", "").replace(" ", ""): value for key, value in row.items()}
    for candidate in candidates:
        key = canonical(candidate).replace("_", "").replace(" ", "")
        if key in lookup and lookup[key] not in (None, ""):
            return lookup[key]
    return None


def number(value: Any, default: float = 0.0) -> float:
    if value in (None, ""):
        return default
    cleaned = str(value).strip().replace(" ", "")
    if cleaned.count(",") == 1 and cleaned.count(".") == 0:
        cleaned = cleaned.replace(",", ".")
    try:
        result = float(cleaned)
        return result if math.isfinite(result) else default
    except ValueError:
        return default


def is_austral(row: dict[str, Any]) -> bool:
    basin = canonical(pick(row, "cuenca", "nombre_cuenca", "nom_cuenca"))
    province = canonical(pick(row, "provincia", "province"))
    return "austral" in basin or province in {"santa cruz", "tierra del fuego"}


def normalize_coordinates(row: dict[str, Any]) -> tuple[float, float] | None:
    x = number(pick(row, "coordenadax", "coord_x", "x", "latitud", "latitude"), 999)
    y = number(pick(row, "coordenaday", "coord_y", "y", "longitud", "longitude"), 999)
    pairs = [(y, x), (x, y)]
    for longitude, latitude in pairs:
        if -76 <= longitude <= -52 and -58.5 <= latitude <= -20:
            return round(longitude, 6), round(latitude, 6)
    return None


def month_string(row: dict[str, Any]) -> str | None:
    year = int(number(pick(row, "anio", "año", "year")))
    month = int(number(pick(row, "mes", "month")))
    if 1900 <= year <= 2200 and 1 <= month <= 12:
        return f"{year:04d}-{month:02d}-01"
    raw = pick(row, "fecha", "periodo", "date")
    match = re.search(r"(20\d{2})[-/]?(0?[1-9]|1[0-2])", str(raw or ""))
    return f"{match.group(1)}-{int(match.group(2)):02d}-01" if match else None


def normalize_production(rows: Iterable[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    wells: dict[str, dict[str, Any]] = {}
    production: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        if not is_austral(row):
            continue
        coordinates = normalize_coordinates(row)
        if not coordinates:
            continue
        name = str(pick(row, "sigla", "pozo", "well", "nombrepozo") or "Pozo sin sigla").strip()
        raw_well_id = str(pick(row, "idpozo", "id_pozo") or name)
        well_id = stable_id("well", raw_well_id)
        block = str(pick(row, "areapermisoconcesion", "concesion", "area", "bloque") or "Área sin identificar").strip()
        block_id = stable_id("block", block)
        month = month_string(row)
        wells[well_id] = {
            "id": well_id, "name": name, "blockId": block_id, "block": block,
            "operator": str(pick(row, "empresa", "operador", "company") or "Sin informar").strip(),
            "province": str(pick(row, "provincia") or "Sin informar").strip(),
            "status": str(pick(row, "tipoestado", "estado") or "Sin informar").strip(),
            "environment": "offshore" if "offshore" in canonical(row) or "costa afuera" in canonical(row) else "onshore",
            "longitude": coordinates[0], "latitude": coordinates[1],
            "firstProduction": None, "lastProduction": None,
            "formation": pick(row, "formacion", "formprod", "formacionproductiva"),
            "production": [],
        }
        if not month:
            continue
        key = (well_id, month)
        point = production.setdefault(key, {"month": month, "gasMm3": 0.0, "oilM3": 0.0, "waterM3": 0.0, "producingDays": 0})
        point["gasMm3"] += number(pick(row, "prod_gas", "prodgas", "gas"))
        point["oilM3"] += number(pick(row, "prod_pet", "prodpet", "petroleo", "oil"))
        point["waterM3"] += number(pick(row, "prod_agua", "prodagua", "agua", "water"))
        point["producingDays"] = max(point["producingDays"], int(number(pick(row, "tef", "diasproduccion", "dias"), 30)))

    for (well_id, _), point in production.items():
        point.update({key: round(value, 4) if isinstance(value, float) else value for key, value in point.items()})
        wells[well_id]["production"].append(point)
    for well in wells.values():
        well["production"].sort(key=lambda point: point["month"])
        if well["production"]:
            well["firstProduction"] = well["production"][0]["month"]
            well["lastProduction"] = well["production"][-1]["month"]
    return list(wells.values()), list(production.values())


def bbox_polygon(wells: list[dict[str, Any]], pad: float = 0.13) -> dict[str, Any]:
    longitudes = [well["longitude"] for well in wells]
    latitudes = [well["latitude"] for well in wells]
    west, east = min(longitudes) - pad, max(longitudes) + pad
    south, north = min(latitudes) - pad, max(latitudes) + pad
    return {"type": "Polygon", "coordinates": [[[west, south], [east, south], [east, north], [west, north], [west, south]]]}


def build_blocks(wells: list[dict[str, Any]], supplied_geometries: dict[str, dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for well in wells:
        grouped[well["blockId"]].append(well)
    blocks = []
    for block_id, members in grouped.items():
        points = [point for well in members for point in well["production"]]
        dates = sorted(point["month"] for point in points)
        latest = dates[-1] if dates else None
        blocks.append({
            "id": block_id, "name": members[0]["block"], "operator": members[0]["operator"],
            "province": members[0]["province"], "environment": members[0]["environment"], "areaKm2": None,
            "wellCount": len(members),
            "activeWellCount": sum(1 for well in members if canonical(well["status"]) in {"en produccion", "produccion", "activo"}),
            "firstProduction": dates[0] if dates else None, "lastProduction": latest,
            "cumulativeGasMm3": round(sum(point["gasMm3"] for point in points), 2),
            "latestGasMm3": round(sum(point["gasMm3"] for point in points if point["month"] == latest), 2) if latest else 0,
            "geometry": (supplied_geometries or {}).get(canonical(members[0]["block"])) or bbox_polygon(members),
        })
    return sorted(blocks, key=lambda block: block["name"])


def load_geographic_resource(path: Path) -> list[dict[str, Any]]:
    """Read GeoJSON or a zipped shapefile without coupling the app to a GIS server."""
    if path.suffix.lower() in {".json", ".geojson"}:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return list(payload.get("features", []))
    shape_path = path
    if zipfile.is_zipfile(path):
        extract_dir = RAW_DIR / f"{path.stem}-extracted"
        extract_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(path) as archive:
            archive.extractall(extract_dir)
        matches = list(extract_dir.rglob("*.shp"))
        if not matches:
            raise RuntimeError(f"{path.name} no contiene un shapefile")
        shape_path = matches[0]
    try:
        import shapefile  # type: ignore[import-not-found]
    except ImportError as error:
        raise RuntimeError("Instale requirements.txt para procesar shapefiles oficiales") from error
    reader = shapefile.Reader(str(shape_path), encoding="latin-1")
    fields = [field[0] for field in reader.fields[1:]]
    return [
        {"type": "Feature", "properties": dict(zip(fields, record)), "geometry": shape.__geo_interface__}
        for shape, record in zip(reader.shapes(), reader.records())
    ]


def download_geography(items: list[dict[str, str]], kind: str, manifest: list[dict[str, Any]]) -> list[dict[str, Any]]:
    errors = []
    for index, item in enumerate(items):
        url = item["url"].replace("http://", "https://")
        suffix = Path(url.split("?")[0]).suffix.lower()
        target = RAW_DIR / f"{kind}-{index:02d}{suffix if suffix in {'.zip', '.shp', '.json', '.geojson'} else '.bin'}"
        try:
            source = fetch(url, target)
            source["title"] = item["title"]
            manifest.append(source)
            return load_geographic_resource(target)
        except Exception as error:  # try the next distribution and report all failures if none work
            errors.append(f"{item['title']}: {error}")
    raise RuntimeError(f"No se pudo leer geografía {kind}: {'; '.join(errors)}")


def official_geometries(
    resources: dict[str, list[dict[str, str]]], manifest: list[dict[str, Any]]
) -> tuple[dict[str, dict[str, Any]], dict[str, Any] | None]:
    block_geometries: dict[str, dict[str, Any]] = {}
    basin_feature: dict[str, Any] | None = None
    try:
        for feature in download_geography(resources["concessions"], "concessions", manifest):
            properties = feature.get("properties") or {}
            name = pick(properties, "areapermisoconcesion", "concesion", "area", "nombre", "nom_area")
            basin = canonical(pick(properties, "cuenca", "nom_cuenca"))
            if name and ("austral" in basin or not basin):
                block_geometries[canonical(name)] = feature["geometry"]
    except RuntimeError:
        pass
    try:
        for feature in download_geography(resources["basin"], "basin", manifest):
            properties = feature.get("properties") or {}
            name = canonical(pick(properties, "cuenca", "nombre", "name", "nom_cuenca"))
            if "austral" in name:
                basin_feature = feature
                break
    except RuntimeError:
        pass
    return block_geometries, basin_feature


def demo_dataset() -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    random.seed(20260930)
    specs = [
        ("Área Escuela Norte", "Operadora Didáctica", "Santa Cruz", "onshore", -68.9, -50.2, 16, 12.5, 0.72),
        ("Área Escuela Sur", "Energía Abierta", "Tierra del Fuego", "onshore", -68.4, -53.5, 13, 9.2, 0.55),
        ("Área Escuela Marina", "Consorcio Austral", "Tierra del Fuego", "offshore", -66.2, -52.5, 11, 21.0, 0.83),
    ]
    wells: list[dict[str, Any]] = []
    for block, operator, province, environment, longitude, latitude, count, qi, decline in specs:
        for index in range(count):
            well_id = stable_id("well", f"{block}-{index + 1}")
            block_id = stable_id("block", block)
            start_year = 2018 + index % 5
            start_month = 1 + index % 10
            production = []
            for month_index in range(48):
                year = start_year + (start_month - 1 + month_index) // 12
                month = (start_month - 1 + month_index) % 12 + 1
                rate = qi * (0.8 + random.random() * 0.4) / ((1 + 0.8 * decline / 12 * month_index) ** (1 / 0.8))
                production.append({"month": f"{year:04d}-{month:02d}-01", "gasMm3": round(rate * 30, 3), "oilM3": round(rate * 0.8, 3), "waterM3": round(rate * 0.4, 3), "producingDays": 30})
            wells.append({
                "id": well_id, "name": f"ESC-{slug(block)[-3:].upper()}-{index + 1:03d}", "blockId": block_id, "block": block,
                "operator": operator, "province": province, "status": "En producción" if index < count - 2 else "Inactivo",
                "environment": environment, "longitude": round(longitude + random.uniform(-0.28, 0.28), 6),
                "latitude": round(latitude + random.uniform(-0.18, 0.18), 6), "firstProduction": production[0]["month"],
                "lastProduction": production[-1]["month"], "formation": "Formación demostrativa", "production": production,
            })
    basin = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"name": "Cuenca Austral (contorno esquemático demostrativo)"}, "geometry": {"type": "Polygon", "coordinates": [[[-72.8, -49.0], [-66.8, -48.5], [-63.5, -51.0], [-64.0, -55.5], [-69.2, -55.4], [-72.8, -52.2], [-72.8, -49.0]]]}}]}
    return wells, build_blocks(wells), basin


def download_official(config: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any], list[dict[str, Any]]]:
    resources = resolve_catalog(config)
    manifest_sources: list[dict[str, Any]] = []
    all_rows: list[dict[str, Any]] = []
    production_resources = [item for item in resources["production"] if re.search(r"20\d{2}", item["title"])]
    if not production_resources:
        production_resources = resources["production"]
    for index, item in enumerate(production_resources):
        suffix = Path(item["url"].split("?")[0]).suffix or ".csv"
        target = RAW_DIR / f"production-{index:03d}{suffix}"
        source = fetch(item["url"].replace("http://", "https://"), target)
        source["title"] = item["title"]
        manifest_sources.append(source)
        if target.suffix.lower() == ".csv":
            all_rows.extend(read_csv(target))
    wells, _ = normalize_production(all_rows)
    if not wells:
        raise RuntimeError("Los recursos se descargaron, pero ningún registro válido coincidió con la Cuenca Austral")
    geometries, basin_feature = official_geometries(resources, manifest_sources)
    blocks = build_blocks(wells, geometries)
    basin = {"type": "FeatureCollection", "features": [basin_feature or {"type": "Feature", "properties": {"name": "Extensión operativa derivada de pozos oficiales", "geometrySource": "derived"}, "geometry": bbox_polygon(wells, 0.7)}]}
    return wells, blocks, basin, manifest_sources


def validate(wells: list[dict[str, Any]], blocks: list[dict[str, Any]], generated_at: str) -> tuple[dict[str, Any], list[str]]:
    issues: list[str] = []
    ids = [well["id"] for well in wells]
    if len(ids) != len(set(ids)):
        issues.append("Hay identificadores de pozo duplicados")
    invalid_coordinates = [well["id"] for well in wells if not (-76 <= well["longitude"] <= -52 and -58.5 <= well["latitude"] <= -20)]
    if invalid_coordinates:
        issues.append(f"Hay {len(invalid_coordinates)} pozos fuera de los límites argentinos configurados")
    missing_blocks = [well["id"] for well in wells if not any(block["id"] == well["blockId"] for block in blocks)]
    if missing_blocks:
        issues.append(f"Hay {len(missing_blocks)} pozos sin bloque")
    months = [point["month"] for well in wells for point in well["production"]]
    report = {
        "status": "fail" if issues else "pass", "generatedAt": generated_at,
        "counts": {"blocks": len(blocks), "wells": len(wells), "productionRows": len(months)},
        "coverage": {"firstMonth": min(months) if months else None, "lastMonth": max(months) if months else None},
        "checks": {"uniqueWellIds": len(ids) == len(set(ids)), "validCoordinates": not invalid_coordinates, "allWellsJoinedToBlock": not missing_blocks},
        "issues": issues,
    }
    return report, issues


def write_outputs(mode: str, wells: list[dict[str, Any]], blocks: list[dict[str, Any]], basin: dict[str, Any], sources: list[dict[str, Any]]) -> None:
    generated_at = "2026-09-30T00:00:00+00:00" if mode == "demo" else datetime.now(UTC).isoformat()
    report, issues = validate(wells, blocks, generated_at)
    if issues:
        raise RuntimeError("Fallaron controles de calidad: " + "; ".join(issues))
    data_through = report["coverage"]["lastMonth"] or "sin producción"
    disclaimer = ("Datos procesados desde publicaciones oficiales; pueden ser provisorios y declarados por operadores."
                  if mode == "official" else
                  "Datos sintéticos determinísticos para desarrollo. No representan áreas, pozos ni producción reales.")
    dataset = {"metadata": {"generatedAt": generated_at, "dataThrough": data_through, "mode": mode, "disclaimer": disclaimer}, "basin": basin, "blocks": blocks, "wells": wells}
    for directory in (PROCESSED_DIR, PUBLIC_DIR):
        directory.mkdir(parents=True, exist_ok=True)
    (PUBLIC_DIR / "dataset.json").write_text(json.dumps(dataset, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (PROCESSED_DIR / "quality-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with (PROCESSED_DIR / "wells.csv").open("w", encoding="utf-8", newline="") as stream:
        fields = ["id", "name", "blockId", "block", "operator", "province", "status", "environment", "longitude", "latitude", "firstProduction", "lastProduction", "formation"]
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows({key: well.get(key) for key in fields} for well in wells)
    manifest = {
        "schemaVersion": 1, "pipelineVersion": "0.1.0", "generatedAt": generated_at, "mode": mode,
        "sources": sources, "outputs": [
            {"path": "public/data/dataset.json", "bytes": (PUBLIC_DIR / "dataset.json").stat().st_size, "sha256": sha256(PUBLIC_DIR / "dataset.json")},
            {"path": "data/processed/wells.csv", "bytes": (PROCESSED_DIR / "wells.csv").stat().st_size, "sha256": sha256(PROCESSED_DIR / "wells.csv")},
        ],
        "assumptions": [
            "Cuenca Austral se identifica por el campo cuenca; Santa Cruz y Tierra del Fuego son fallback explícito.",
            "coordenadax/coordenaday se prueban en ambos órdenes contra límites geográficos argentinos.",
            "gas está expresado en miles de m3 mensuales; la tasa usa días productivos cuando se informan.",
            "geometrías operativas sin polígono oficial se marcan como envolventes derivadas de pozos.",
        ],
    }
    (PROCESSED_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = f"# Reporte de calidad\n\n- Estado: **{report['status']}**\n- Bloques: {len(blocks)}\n- Pozos: {len(wells)}\n- Registros mensuales: {report['counts']['productionRows']}\n- Cobertura: {report['coverage']['firstMonth']} a {report['coverage']['lastMonth']}\n- Modo: `{mode}`\n"
    (PROCESSED_DIR / "quality-report.md").write_text(summary, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--demo", action="store_true", help="genera datos sintéticos determinísticos")
    args = parser.parse_args()
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    if args.demo:
        wells, blocks, basin = demo_dataset()
        sources = [{"title": "Dataset sintético del repositorio", "url": None, "generatedBy": "pipeline/build_data.py --demo", "seed": 20260930}]
        write_outputs("demo", wells, blocks, basin, sources)
    else:
        wells, blocks, basin, sources = download_official(config)
        write_outputs("official", wells, blocks, basin, sources)
    print(f"OK: {len(blocks)} bloques, {len(wells)} pozos -> public/data/dataset.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
