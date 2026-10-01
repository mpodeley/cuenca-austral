#!/usr/bin/env python3
"""Baja la geografía de la cuenca y la deja compacta en ``data/store/geo/``.

- ``pozos.json``: padrón de pozos de la Cuenca Austral con coordenadas, cota,
  profundidad y mes de primera producción según el padrón oficial.
- ``concesiones.json``: concesiones de explotación al sur de 48°S, con superficie
  calculada (el shapefile oficial no trae superficie ni cuenca).
- ``cuenca.json``: contorno oficial de la cuenca sedimentaria.
- ``contexto.json``: tierra firme y límite internacional (Natural Earth, dominio
  público) para dar referencia al mapa sin depender de teselas.
"""

from __future__ import annotations

import csv
import io
import json
import math
import sys
import zipfile
from typing import Any

from pipeline.common import RAW_DIR, STORE_DIR, download, open_url, package_resources, write_json

PRODUCTION_PACKAGE = "c846e79c-026c-4040-897f-1ad3543b407c"
WELLS_RESOURCE = "cb5c0f04-7835-45cd-b982-3e25ca7d7751"  # Capítulo IV - Pozos
FIRST_PRODUCTION_RESOURCE = "5578dd48"  # Padrón de pozos con fecha de primera producción
CONCESSIONS_PACKAGE = "81cfad0a-4162-4f85-ad71-837f5a5fae57"
BASIN_PACKAGE = "0d4a18ee-9371-439a-8a94-4f53a9822664"
NATURAL_EARTH = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/{name}.geojson"
SOUTH_OF = -48.0  # el shapefile de concesiones no informa cuenca: se filtra por latitud
CONTEXT_BBOX = (-77.0, -57.0, -61.0, -45.5)
GEO_DIR = STORE_DIR / "geo"
csv.field_size_limit(sys.maxsize)  # los polígonos vienen como GeoJSON dentro de una celda


def polygon_area_km2(rings: list[list[list[float]]]) -> float:
    """Área por fórmula del agrimensor en proyección equirectangular local (anillo exterior menos huecos)."""
    total = 0.0
    for index, ring in enumerate(rings):
        lat0 = math.radians(sum(point[1] for point in ring) / len(ring))
        kx, ky = 111.320 * math.cos(lat0), 110.574
        area = 0.0
        for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
            area += x1 * kx * y2 * ky - x2 * kx * y1 * ky
        total += abs(area) / 2 * (1 if index == 0 else -1)
    return total


def polygons_of(geometry: dict[str, Any]) -> list[list[list[list[float]]]]:
    if geometry["type"] == "Polygon":
        return [[[list(point[:2]) for point in ring] for ring in geometry["coordinates"]]]
    return [[[list(point[:2]) for point in ring] for ring in polygon] for polygon in geometry["coordinates"]]


def rounded(polygons: list, digits: int = 5) -> list:
    return [[[[round(x, digits), round(y, digits)] for x, y in ring] for ring in polygon] for polygon in polygons]


def simplify(points: list[list[float]], tolerance: float) -> list[list[float]]:
    """Douglas-Peucker iterativo."""
    if len(points) < 3:
        return points
    if points[0] == points[-1]:  # anillo cerrado: se parte en el punto más lejano al inicio
        far = max(range(len(points)), key=lambda i: math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]))
        if far in (0, len(points) - 1):
            return points
        return simplify(points[: far + 1], tolerance)[:-1] + simplify(points[far:], tolerance)
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        (x1, y1), (x2, y2) = points[start], points[end]
        length = math.hypot(x2 - x1, y2 - y1) or 1e-12
        worst, index = 0.0, -1
        for i in range(start + 1, end):
            distance = abs((x2 - x1) * (y1 - points[i][1]) - (x1 - points[i][0]) * (y2 - y1)) / length
            if distance > worst:
                worst, index = distance, i
        if worst > tolerance:
            keep[index] = True
            stack += [(start, index), (index, end)]
    return [point for point, flag in zip(points, keep) if flag]


def clip_ring(ring: list[list[float]], bbox: tuple[float, float, float, float]) -> list[list[float]]:
    """Sutherland-Hodgman contra un rectángulo."""
    west, south, east, north = bbox
    edges = [
        (lambda p: p[0] >= west, lambda a, b: [west, a[1] + (b[1] - a[1]) * (west - a[0]) / (b[0] - a[0])]),
        (lambda p: p[0] <= east, lambda a, b: [east, a[1] + (b[1] - a[1]) * (east - a[0]) / (b[0] - a[0])]),
        (lambda p: p[1] >= south, lambda a, b: [a[0] + (b[0] - a[0]) * (south - a[1]) / (b[1] - a[1]), south]),
        (lambda p: p[1] <= north, lambda a, b: [a[0] + (b[0] - a[0]) * (north - a[1]) / (b[1] - a[1]), north]),
    ]
    output = ring
    for inside, intersect in edges:
        source, output = output, []
        for current, previous in zip(source, [source[-1]] + source[:-1]) if source else []:
            if inside(current):
                if not inside(previous):
                    output.append(intersect(previous, current))
                output.append(current)
            elif inside(previous):
                output.append(intersect(previous, current))
    return output


def fetch_wells() -> dict[str, Any]:
    resources = package_resources(PRODUCTION_PACKAGE)
    first: dict[str, str] = {}
    padron = next(item for key, item in resources.items() if key.startswith(FIRST_PRODUCTION_RESOURCE))
    with open_url(padron["url"]) as response:
        for row in csv.DictReader(io.TextIOWrapper(response, encoding="utf-8-sig", newline="")):
            first[row["idpozo"]] = f"{int(row['anio']):04d}-{int(row['mes']):02d}"
    wells: dict[str, Any] = {}
    with open_url(resources[WELLS_RESOURCE]["url"], timeout=300) as response:
        for row in csv.DictReader(io.TextIOWrapper(response, encoding="utf-8-sig", newline="")):
            if row["cuenca"].strip().upper() != "AUSTRAL" or not row.get("geojson"):
                continue
            lon, lat = json.loads(row["geojson"])["coordinates"][:2]
            wells[row["idpozo"]] = {
                "lon": round(lon, 5), "lat": round(lat, 5),
                "cota": float(row["cota"]) if row["cota"] else None,
                "profundidad": float(row["profundidad"]) if row["profundidad"] else None,
                "yacimiento": row["yacimiento"].strip(), "clasificacion": row["clasificacion"].strip(),
                "primera_produccion": first.get(row["idpozo"]),
                "fin_perforacion": (row.get("adjiv_fecha_fin_perf") or "")[:10] or None,
            }
    return wells


def fetch_concessions() -> list[dict[str, Any]]:
    import shapefile  # pyshp

    resource = next(item for item in package_resources(CONCESSIONS_PACKAGE).values() if (item.get("format") or "").upper() == "SHP")
    archive = download(resource["url"], RAW_DIR / "concesiones.zip")
    with zipfile.ZipFile(archive) as bundle:
        parts = {name.rsplit(".", 1)[-1].lower(): io.BytesIO(bundle.read(name)) for name in bundle.namelist()}
    reader = shapefile.Reader(shp=parts["shp"], dbf=parts["dbf"], shx=parts["shx"], encoding="utf-8")
    fields = [field[0] for field in reader.fields[1:]]
    output = []
    for shape, record in zip(reader.shapes(), reader.records()):
        if (shape.bbox[1] + shape.bbox[3]) / 2 > SOUTH_OF:
            continue
        properties = dict(zip(fields, record))
        polygons = polygons_of(shape.__geo_interface__)
        output.append({
            "nombre": str(properties["NOMBRE_DE_"]).strip(), "codigo": str(properties["CODIGO_DE_"]).strip(),
            "operador": str(properties["EMPRESA_OP"]).strip(),
            "area_km2": round(sum(polygon_area_km2(polygon) for polygon in polygons), 1),
            "poligonos": rounded(polygons),
        })
    return sorted(output, key=lambda item: item["nombre"])


def fetch_basin() -> list:
    resource = next(item for item in package_resources(BASIN_PACKAGE).values() if (item.get("format") or "").upper() == "CSV")
    with open_url(resource["url"]) as response:
        for row in csv.DictReader(io.TextIOWrapper(response, encoding="utf-8-sig", newline="")):
            if "AUSTRAL" in row["cuenca"].upper():
                polygons = polygons_of(json.loads(row["geojson"]))
                return rounded([[simplify(ring, 0.002) for ring in polygon] for polygon in polygons], 4)
    raise RuntimeError("El recurso de cuencas sedimentarias no trae la Cuenca Austral")


def fetch_context() -> dict[str, Any]:
    west, south, east, north = CONTEXT_BBOX

    def touches(ring: list[list[float]]) -> bool:
        xs, ys = [p[0] for p in ring], [p[1] for p in ring]
        return max(xs) >= west and min(xs) <= east and max(ys) >= south and min(ys) <= north

    land = []
    with open_url(NATURAL_EARTH.format(name="ne_10m_land"), timeout=300) as response:
        for feature in json.load(response)["features"]:
            for polygon in polygons_of(feature["geometry"]):
                if not touches(polygon[0]):
                    continue
                ring = simplify(clip_ring(polygon[0], CONTEXT_BBOX), 0.003)
                if len(ring) >= 4:
                    land.append([[round(x, 4), round(y, 4)] for x, y in ring])
    borders = []
    with open_url(NATURAL_EARTH.format(name="ne_10m_admin_0_boundary_lines_land"), timeout=300) as response:
        for feature in json.load(response)["features"]:
            geometry = feature["geometry"]
            lines = [geometry["coordinates"]] if geometry["type"] == "LineString" else geometry["coordinates"]
            for line in lines:
                inside = [[round(x, 4), round(y, 4)] for x, y in (point[:2] for point in line) if west <= x <= east and south <= y <= north]
                if len(inside) >= 2:
                    borders.append(simplify(inside, 0.003))
    return {"bbox": list(CONTEXT_BBOX), "tierra": land, "limites": borders}


def main() -> int:
    wells = fetch_wells()
    concessions = fetch_concessions()
    basin = fetch_basin()
    context = fetch_context()
    sizes = {
        "pozos.json": write_json(GEO_DIR / "pozos.json", wells),
        "concesiones.json": write_json(GEO_DIR / "concesiones.json", concessions),
        "cuenca.json": write_json(GEO_DIR / "cuenca.json", basin),
        "contexto.json": write_json(GEO_DIR / "contexto.json", context),
    }
    print(f"Geografía: {len(wells)} pozos, {len(concessions)} concesiones, {len(context['tierra'])} polígonos de tierra")
    print("  " + ", ".join(f"{name} {size / 1e3:.0f} kB" for name, size in sizes.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
