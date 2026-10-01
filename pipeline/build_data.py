#!/usr/bin/env python3
"""Convierte el store de producción y la geografía en los JSON que usa la app.

Entradas (versionadas): ``data/store/capiv_austral.json.gz`` y ``data/store/geo/``.
Salidas: ``public/data/*.json``, ``public/data/wells.csv`` y el reporte de
calidad y manifiesto en ``data/processed/``.

Unidades publicadas: tasas de gas en Mm³/d (miles de m³ por día calendario),
petróleo y agua en m³/d; acumuladas y EUR de gas en MMm³, de petróleo en Mm³.
"""

from __future__ import annotations

import csv
import gzip
import hashlib
import json
import statistics
import sys
import zlib
from collections import Counter, defaultdict
from typing import Any

import numpy as np

from pipeline import arps
from pipeline.common import PROCESSED_DIR, PUBLIC_DIR, ROOT, STORE_DIR, canonical, days_in_month, month_at, month_index, wrap, write_json

T0 = "2006-01"            # primer mes publicado por la fuente
FORECAST_MONTHS = 240
ACTIVE_WINDOW = 12        # un pozo está activo si produjo en los últimos 12 meses
CARRY_MONTHS = 6          # declaración atrasada: se sostiene la última tasa hasta 6 meses
LATE_SHARE = 0.10         # un mes final se descarta si falta más del 10 % de la producción
TYPE_MIN_WELLS = 8        # pozos mínimos para un pozo tipo propio del bloque
TYPE_MIN_AT_T = 4         # pozos mínimos vivos en un mes para calcular percentiles
TYPE_MIN_MONTHS = 12      # historia mínima de un pozo para entrar al pozo tipo
FLUIDS = ("gas", "oil")


# ---------------------------------------------------------------- geometría

def point_in_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def convex_hull(points: list[tuple[float, float]]) -> list[list[float]]:
    points = sorted(set(points))
    if len(points) < 3:
        return [list(point) for point in points]

    def half(sequence):
        hull: list[tuple[float, float]] = []
        for point in sequence:
            while len(hull) >= 2 and (hull[-1][0] - hull[-2][0]) * (point[1] - hull[-2][1]) - (hull[-1][1] - hull[-2][1]) * (point[0] - hull[-2][0]) <= 0:
                hull.pop()
            hull.append(point)
        return hull[:-1]

    return [list(point) for point in half(points) + half(reversed(points))]


def derived_polygon(points: list[tuple[float, float]], pad: float = 0.03) -> list:
    """Envolvente de los pozos de un bloque sin polígono oficial, con un margen."""
    corners = [(x + dx, y + dy) for x, y in points for dx in (-pad * 1.6, pad * 1.6) for dy in (-pad, pad)]
    ring = convex_hull(corners)
    return [[[[round(x, 5), round(y, 5)] for x, y in ring + ring[:1]]]]


# ------------------------------------------------------------------- series

def load_inputs() -> tuple[dict[str, Any], dict[str, Any]]:
    with gzip.open(STORE_DIR / "capiv_austral.json.gz", "rt", encoding="utf-8") as stream:
        store = json.load(stream)
    geo = {name: json.loads((STORE_DIR / "geo" / f"{name}.json").read_text(encoding="utf-8")) for name in ("pozos", "concesiones", "cuenca", "contexto")}
    return store, geo


def last_complete_month(store: dict[str, Any]) -> tuple[str, list[str]]:
    """Último mes utilizable. Un mes final se descarta si los pozos que dejaron de declarar pesan demasiado."""
    months = sorted({month for well in store["wells"].values() for month in well["m"]})
    notes: list[str] = []
    while len(months) > 12:
        last, window = months[-1], months[-1 - CARRY_MONTHS:-1]
        total = missing = 0.0
        for well in store["wells"].values():
            recent = [month for month in window if month in well["m"]]
            if last in well["m"]:
                total += well["m"][last][0] + well["m"][last][1]
            elif recent:
                missing += well["m"][recent[-1]][0] + well["m"][recent[-1]][1]
        share = missing / (total + missing) if total + missing else 1.0
        if share <= LATE_SHARE:
            break
        notes.append(f"{last} descartado: falta declarar {share:.0%} de la producción")
        months.pop()
    return months[-1], notes


def build_wells(store: dict[str, Any], geo: dict[str, Any], t_now: str) -> list[dict[str, Any]]:
    n = month_index(t_now, T0) + 1
    days = np.array([days_in_month(month_at(T0, index)) for index in range(n)], dtype=float)
    land = geo["contexto"]["tierra"]
    wells = []
    for well_id, raw in sorted(store["wells"].items(), key=lambda item: int(item[0])):
        volume = np.zeros((3, n))
        reported = np.zeros(n, dtype=bool)
        for month, point in raw["m"].items():
            index = month_index(month, T0)
            if 0 <= index < n:
                volume[:, index] = point[:3]
                reported[index] = True
        if not reported.any():
            continue
        last_report = int(np.nonzero(reported)[0][-1])
        rate = volume / days
        producing = np.nonzero((volume[0] > 0) | (volume[1] > 0))[0]
        attrs, position = raw["a"], geo["pozos"].get(well_id)
        offshore = None
        if position:
            offshore = not any(point_in_ring(position["lon"], position["lat"], ring) for ring in land)
        well: dict[str, Any] = {
            "id": well_id, "sigla": attrs.get("sigla", ""), "empresa": attrs.get("empresa", ""),
            "area": attrs.get("area", "").strip() or "SIN ÁREA", "cod_area": attrs.get("cod_area", ""),
            "yacimiento": attrs.get("yacimiento", ""), "provincia": attrs.get("provincia", ""),
            "formacion": (attrs.get("formacion") or "sin informar").lower(), "estado": attrs.get("tipoestado", ""),
            "tipo": attrs.get("tipopozo", ""), "extraccion": attrs.get("tipoextraccion", ""),
            "recurso": " ".join(filter(None, [attrs.get("tipo_recurso", ""), attrs.get("sub_tipo_recurso", "")])).strip().lower(),
            "profundidad": float(attrs["profundidad"]) if attrs.get("profundidad") else (position or {}).get("profundidad"),
            "lon": position["lon"] if position else None, "lat": position["lat"] if position else None,
            "offshore": offshore, "ult_declaracion": month_at(T0, last_report),
            "_rate": rate, "_volume": volume, "_last_report": last_report, "_first": None,
        }
        if len(producing) == 0:
            well.update({"m0": None, "campana": None, "pre2006": False, "ult_produccion": None, "activo": False, "fluido": None})
        else:
            first, last = int(producing[0]), int(producing[-1])
            cum_gas, cum_oil = float(volume[0].sum()), float(volume[1].sum())
            well.update({
                "_first": first, "m0": month_at(T0, first), "campana": int(month_at(T0, first)[:4]),
                "pre2006": first == 0, "ult_produccion": month_at(T0, last),
                "activo": bool(last > last_report - ACTIVE_WINDOW and last_report >= n - 1 - CARRY_MONTHS),
                "fluido": "gas" if cum_gas >= cum_oil else "oil",  # 1 Mm³ de gas ≈ 1 m³ de petróleo en energía
                "cum_gas": round(cum_gas / 1000, 3), "cum_oil": round(cum_oil / 1000, 3), "cum_agua": round(float(volume[2].sum()) / 1000, 3),
            })
            for fluid, row in zip(FLUIDS, (0, 1)):
                series = rate[row, first:last_report + 1]
                fitted = arps.fit(series)
                active = well["activo"] and series[-ACTIVE_WINDOW:].max() > 0
                result = arps.eur(series, float(volume[row].sum()), bool(active), fluid, fitted, seed=zlib.crc32(f"{well_id}{fluid}".encode()))
                recent = series[-3:]
                well[f"_fit_{fluid}"] = fitted if fitted and fitted["ok"] else None
                well[f"_active_{fluid}"] = bool(active)
                well[fluid] = {
                    "pico": round(float(series.max()), 2), "q": round(float(recent.mean()), 2) if active else 0.0,
                    "eur": round(result["eur"] / 1000, 3), "eur_lo": round(result["lo"] / 1000, 3), "eur_hi": round(result["hi"] / 1000, 3),
                    "metodo": result["metodo"], "conf": result["conf"],
                    "qi": round(fitted["qi"], 2) if fitted else None, "di": round(fitted["di"], 4) if fitted else None,
                    "b": round(fitted["b"], 2) if fitted else None, "r2": round(fitted["r2"], 2) if fitted else None,
                    "t0": fitted["t0"] if fitted else None, "ajuste_ok": bool(fitted and fitted["ok"]),
                }
        wells.append(well)
    return wells


def well_projection(well: dict[str, Any], fluid: str, row: int, n: int) -> np.ndarray:
    """Tasa proyectada de un pozo activo para los FORECAST_MONTHS meses posteriores al corte."""
    if not well.get(f"_active_{fluid}"):
        return np.zeros(FORECAST_MONTHS)
    series = well["_rate"][row, well["_first"]:well["_last_report"] + 1]
    positive = series[series > 0]
    q_last = float(np.median(positive[-3:]))
    lag = n - 1 - well["_last_report"]
    fitted = well[f"_fit_{fluid}"]
    if fitted:
        rates = arps.project(q_last, len(series) - 1 - fitted["t0"], lag + FORECAST_MONTHS, fitted["di"], fitted["b"])
    else:
        rates = arps.project(q_last, 0, lag + FORECAST_MONTHS)
    rates = rates[lag:]
    rates[rates < arps.Q_ECON[fluid]] = 0.0
    return rates


def history(wells: list[dict[str, Any]], n: int) -> dict[str, np.ndarray]:
    """Historia agregada. Los pozos con declaración atrasada sostienen su última tasa."""
    total = np.zeros((3, n))
    active = np.zeros(n)
    for well in wells:
        if well["_first"] is None:
            continue
        rate, last = well["_rate"], well["_last_report"]
        total += rate
        active += ((rate[0] > 0) | (rate[1] > 0)).astype(float)
        if well["activo"] and last < n - 1:
            total[:, last + 1:] += rate[:, last:last + 1]
            active[last + 1:] += 1
    return {"gas": total[0], "oil": total[1], "agua": total[2], "activos": active}


def type_profile(wells: list[dict[str, Any]], fluid: str, row: int) -> dict[str, Any] | None:
    """Pozo tipo: percentiles por mes en producción de los pozos con arranque observado."""
    cohort = [
        well["_rate"][row, well["_first"]:well["_last_report"] + 1] for well in wells
        if well["_first"] and well["fluido"] == fluid and well["_last_report"] - well["_first"] + 1 >= TYPE_MIN_MONTHS
    ]
    if len(cohort) < TYPE_MIN_WELLS:
        return None
    length = max(len(series) for series in cohort)
    p10, p50, p90 = [], [], []
    for k in range(length):
        alive = [series[k] for series in cohort if len(series) > k]
        if len(alive) < TYPE_MIN_AT_T:
            break
        low, mid, high = np.percentile(alive, [10, 50, 90])
        p90.append(low); p50.append(mid); p10.append(high)  # convención petrolera: P10 es el caso alto
    median = np.array(p50)
    fitted = arps.fit(median)
    if not fitted or len(median) < TYPE_MIN_MONTHS or median.max() <= 0:
        return None
    t0 = fitted["t0"]
    curve = np.concatenate([median[:t0], arps.hyperbolic(np.arange(len(median) - t0, dtype=float), fitted["qi"], fitted["di"], fitted["b"])])
    if len(curve) < FORECAST_MONTHS:
        extra = arps.project(float(curve[-1]), len(curve) - 1 - t0, FORECAST_MONTHS - len(curve), fitted["di"], fitted["b"])
        curve = np.concatenate([curve, extra])
    curve = curve[:FORECAST_MONTHS]
    curve[curve < arps.Q_ECON[fluid]] = 0.0
    # dispersión entre pozos: percentiles de la acumulada temprana de cada pozo, relativos a la mediana
    span = 24 if sum(1 for series in cohort if len(series) >= 24) >= TYPE_MIN_WELLS else TYPE_MIN_MONTHS
    early = [float(series[:span].sum()) for series in cohort if len(series) >= span]
    low_cum, mid_cum, high_cum = np.percentile(early, [10, 50, 90])
    mid_cum = mid_cum or 1.0
    return {
        "n": len(cohort), "meses_obs": len(median), "p50": [round(float(v), 2) for v in curve],
        "obs_p10": [round(float(v), 2) for v in p10], "obs_p50": [round(float(v), 2) for v in p50], "obs_p90": [round(float(v), 2) for v in p90],
        "k_bajo": round(float(np.clip(low_cum / mid_cum, 0.05, 1)), 3), "k_alto": round(float(np.clip(high_cum / mid_cum, 1, 5)), 3),
        "eur": round(float(curve.sum() * arps.DAYS / 1000), 3),
        "qi": round(fitted["qi"], 2), "di": round(fitted["di"], 4), "b": round(fitted["b"], 2), "r2": round(fitted["r2"], 2),
    }


# ------------------------------------------------------------------ bloques

def majority(values: list[str]) -> str:
    values = [value for value in values if value]
    return Counter(values).most_common(1)[0][0] if values else ""


def build_blocks(wells: list[dict[str, Any]], geo: dict[str, Any], t_now: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    n = month_index(t_now, T0) + 1
    year_now = int(t_now[:4])
    by_code = {item["codigo"]: item for item in geo["concesiones"]}
    by_name = {canonical(item["nombre"]): item for item in geo["concesiones"]}
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for well in wells:
        grouped[well["area"]].append(well)

    basin_types = {
        fluid: {env: type_profile([w for w in wells if env is None or w["offshore"] == env], fluid, row) for env in (None, False, True)}
        for fluid, row in zip(FLUIDS, (0, 1))
    }
    blocks, features, forecast_fields, used = [], [], {}, set()
    for name, members in sorted(grouped.items()):
        producers = [well for well in members if well["_first"] is not None]
        current = [well for well in members if well["ult_declaracion"] >= month_at(T0, n - 1 - CARRY_MONTHS)] or members
        concession = by_code.get(majority([well["cod_area"] for well in members])) or by_name.get(canonical(name))
        located = [(well["lon"], well["lat"]) for well in members if well["lon"] is not None]
        if concession:
            used.add(concession["codigo"])
            polygons, area, source = concession["poligonos"], concession["area_km2"], "oficial"
        elif located:
            polygons, area, source = derived_polygon(located), None, "derivada"
        else:
            polygons, area, source = None, None, None
        offshore = sum(1 for well in members if well["offshore"]) > len(members) / 2
        hist = history(members, n)
        cum = {fluid: sum(well.get(f"cum_{fluid}", 0) for well in producers) for fluid in FLUIDS}
        fluid_main = "gas" if cum["gas"] >= cum["oil"] else "oil"
        by_year = Counter(well["campana"] for well in producers if not well["pre2006"])
        recent_years = [year_now - offset for offset in range(1, 6)]  # cinco años calendario completos
        pace = sum(by_year.get(year, 0) for year in recent_years) / 5
        block: dict[str, Any] = {
            "nombre": name, "codigo": majority([well["cod_area"] for well in members]),
            "operador": majority([well["empresa"] for well in current]), "provincia": majority([well["provincia"] for well in members]),
            "offshore": offshore, "n_offshore": sum(1 for well in members if well["offshore"]), "area_km2": area, "geometria": source,
            "n_pozos": len(members), "n_productores": len(producers), "n_activos": sum(1 for well in members if well["activo"]),
            "campana_min": min((well["campana"] for well in producers), default=None),
            "campana_max": max((well["campana"] for well in producers), default=None),
            "pozos_5a": sum(by_year.get(year, 0) for year in recent_years), "ritmo": round(pace, 2),
            "fluido": fluid_main if producers else None,
            "formacion": majority([well["formacion"] for well in producers or members]),
            "datos_hasta": max(well["ult_declaracion"] for well in members),
        }
        types = {}
        for fluid, row in zip(FLUIDS, (0, 1)):
            series = hist[fluid]
            eurs = [well[fluid] for well in producers]
            total_eur = sum(item["eur"] for item in eurs)
            peak = int(np.argmax(series)) if series.max() > 0 else None
            block[fluid] = {
                "q": round(float(series[-3:].mean()), 2), "cum": round(cum[fluid], 2),
                "eur": round(total_eur, 2), "eur_lo": round(sum(item["eur_lo"] for item in eurs), 2), "eur_hi": round(sum(item["eur_hi"] for item in eurs), 2),
                "agotado": round(cum[fluid] / total_eur, 3) if total_eur > 0 else None,
                "pico": round(float(series.max()), 2), "pico_mes": month_at(T0, peak) if peak is not None else None,
            }
            own = type_profile(members, fluid, row)
            profile = own or basin_types[fluid][offshore] or basin_types[fluid][None]
            origin = "bloque" if own else ("cuenca " + ("offshore" if offshore else "onshore") if basin_types[fluid][offshore] else "cuenca")
            types[fluid] = {**profile, "origen": origin} if profile else None
        new_recent = sum(by_year.get(year, 0) for year in range(year_now - 2, year_now + 1))
        depletion = block[fluid_main]["agotado"] if producers else None
        block["etapa"] = (
            "Sin producción" if block["n_activos"] == 0 else
            "Desarrollo activo" if new_recent >= 3 else
            "Maduro" if depletion is not None and depletion >= 0.8 else "En producción"
        )
        blocks.append(block)
        if polygons:
            features.append({"nombre": name, "operador": block["operador"], "geometria": source, "con_datos": True, "p": polygons})
        base = {fluid: sum(well_projection(well, fluid, row, n) for well in producers) if producers else np.zeros(FORECAST_MONTHS) for fluid, row in zip(FLUIDS, (0, 1))}
        forecast_fields[name] = {
            "hist_gas": [round(float(v), 1) for v in hist["gas"]], "hist_oil": [round(float(v), 1) for v in hist["oil"]],
            "hist_agua": [round(float(v), 1) for v in hist["agua"]], "activos": [int(v) for v in hist["activos"]],
            "base_gas": [round(float(v), 1) for v in base["gas"]], "base_oil": [round(float(v), 1) for v in base["oil"]],
            "tipo": {fluid: ({key: types[fluid][key] for key in ("p50", "k_bajo", "k_alto", "n", "origen", "eur")} if types[fluid] else None) for fluid in FLUIDS},
            "pozos_anio": {str(year): count for year, count in sorted(by_year.items())},
            "ritmo": round(pace, 2), "fluido": block["fluido"], "offshore": offshore, "operador": block["operador"],
        }
    for concession in geo["concesiones"]:
        if concession["codigo"] not in used:
            features.append({"nombre": concession["nombre"], "operador": concession["operador"], "geometria": "oficial", "con_datos": False,
                             "area_km2": concession["area_km2"], "p": concession["poligonos"]})
    basin_hist = history(wells, n)
    basin = {
        "hist_gas": [round(float(v), 1) for v in basin_hist["gas"]], "hist_oil": [round(float(v), 1) for v in basin_hist["oil"]],
        "hist_agua": [round(float(v), 1) for v in basin_hist["agua"]], "activos": [int(v) for v in basin_hist["activos"]],
        "pozos_anio": {str(year): count for year, count in sorted(Counter(w["campana"] for w in wells if w["_first"]).items())},
    }
    forecast = {"t0": T0, "n": n, "meses": FORECAST_MONTHS, "cuenca": basin, "campos": forecast_fields}
    return blocks, features, forecast


# ------------------------------------------------------------------ control

def quality(wells: list[dict[str, Any]], blocks: list[dict[str, Any]], forecast: dict[str, Any], t_now: str, notes: list[str], store: dict[str, Any]) -> dict[str, Any]:
    n = forecast["n"]
    issues: list[str] = []
    reported = Counter(month for well in store["wells"].values() for month in well["m"])
    missing = [month_at(T0, index) for index in range(n) if not reported.get(month_at(T0, index))]
    if missing:
        issues.append(f"Meses sin ninguna declaración: {', '.join(missing)}")
    energy = np.array(forecast["cuenca"]["hist_gas"]) + np.array(forecast["cuenca"]["hist_oil"])
    drops = []
    for index in range(n):
        window = np.concatenate([energy[max(0, index - 6):index], energy[index + 1:index + 7]])
        if len(window) and energy[index] < 0.6 * statistics.median(window):
            drops.append(month_at(T0, index))
    if drops:
        issues.append(f"Caídas abruptas del total de cuenca (menos del 60 % de la mediana vecina): {', '.join(drops)}")
    ids = [well["id"] for well in wells]
    if len(ids) != len(set(ids)):
        issues.append("Hay identificadores de pozo duplicados")
    without_position = sum(1 for well in wells if well["lon"] is None)
    late = Counter(well["empresa"] for well in wells if well["activo"] and well["_last_report"] < n - 1)
    return {
        "status": "fail" if issues else "pass", "issues": issues, "notas": notes,
        "cobertura": {"desde": T0, "hasta": t_now, "meses": n},
        "conteos": {
            "pozos": len(wells), "pozos_que_produjeron": sum(1 for well in wells if well["_first"] is not None),
            "pozos_activos": sum(1 for well in wells if well["activo"]), "pozos_sin_coordenadas": without_position,
            "bloques": len(blocks), "bloques_con_poligono_oficial": sum(1 for block in blocks if block["geometria"] == "oficial"),
            "bloques_con_poligono_derivado": sum(1 for block in blocks if block["geometria"] == "derivada"),
            "registros_mensuales": sum(reported.values()),
        },
        "declaracion_atrasada": [{"empresa": company, "pozos_activos": count} for company, count in late.most_common()],
        "gas_MMm3d_por_anio": {str(year): round(float(np.mean(forecast["cuenca"]["hist_gas"][(year - 2006) * 12:(year - 2006) * 12 + 12])) / 1000, 2) for year in range(2006, int(t_now[:4]) + 1)},
        "petroleo_m3d_por_anio": {str(year): round(float(np.mean(forecast["cuenca"]["hist_oil"][(year - 2006) * 12:(year - 2006) * 12 + 12]))) for year in range(2006, int(t_now[:4]) + 1)},
    }


# ------------------------------------------------------------------ salidas

def public_well(well: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in well.items() if not key.startswith("_")}


def write_outputs(wells, blocks, features, forecast, geo, report, t_now: str, store) -> None:
    n = forecast["n"]
    series = {}
    for well in wells:
        if well["_first"] is None:
            continue
        first, last = well["_first"], well["_last_report"]
        series[well["id"]] = {
            "m0": first,
            "gas": [round(float(v), 2) for v in well["_rate"][0, first:last + 1]],
            "oil": [round(float(v), 2) for v in well["_rate"][1, first:last + 1]],
            "agua": [round(float(v), 1) for v in well["_rate"][2, first:last + 1]],
        }
    assumptions = {
        "activo_meses": ACTIVE_WINDOW, "declaracion_atrasada_meses": CARRY_MONTHS, "dmin_anual": arps.DMIN_ANNUAL,
        "declinacion_por_defecto_anual": arps.DEFAULT_ANNUAL, "b_max": arps.B_MAX, "r2_min": arps.R2_MIN,
        "limite_economico": arps.Q_ECON, "meses_minimos_ajuste": arps.MIN_POINTS, "horizonte_eur_meses": arps.HORIZON,
        "pozo_tipo_min_pozos": TYPE_MIN_WELLS, "pronostico_meses": FORECAST_MONTHS,
    }
    files = {
        "blocks.json": wrap(blocks, t_now, supuestos=assumptions),
        "concesiones_austral.json": wrap(features, t_now),
        "contexto.json": wrap({**geo["contexto"], "cuenca": geo["cuenca"]}, t_now, source="Natural Earth (tierra y límites) y Secretaría de Energía (cuenca sedimentaria)"),
        "wells.json": wrap([public_well(well) for well in wells], t_now),
        "well_series.json": wrap({"t0": T0, "n": n, "wells": series}, t_now),
        "forecast.json": wrap(forecast, t_now),
    }
    for stale in PUBLIC_DIR.glob("*"):
        stale.unlink()
    outputs = []
    for name, payload in files.items():
        size = write_json(PUBLIC_DIR / name, payload)
        outputs.append({"path": f"public/data/{name}", "bytes": size, "sha256": hashlib.sha256((PUBLIC_DIR / name).read_bytes()).hexdigest()})
    flat_keys = [key for key in public_well(wells[0]) if key not in FLUIDS] + ["cum_gas", "cum_oil", "cum_agua"]
    flat_keys = list(dict.fromkeys(flat_keys))
    fluid_keys = ["pico", "q", "eur", "eur_lo", "eur_hi", "conf", "metodo", "qi", "di", "b", "r2", "ajuste_ok"]
    with (PUBLIC_DIR / "wells.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(flat_keys + [f"{fluid}_{key}" for fluid in FLUIDS for key in fluid_keys])
        for well in wells:
            writer.writerow([well.get(key, "") for key in flat_keys] + [(well.get(fluid) or {}).get(key, "") for fluid in FLUIDS for key in fluid_keys])
    outputs.append({"path": "public/data/wells.csv", "bytes": (PUBLIC_DIR / "wells.csv").stat().st_size})

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    for stale in PROCESSED_DIR.glob("*"):
        stale.unlink()
    (PROCESSED_DIR / "quality-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    counts = report["conteos"]
    lines = [
        "# Reporte de calidad", "",
        f"- Estado: **{report['status']}**",
        f"- Cobertura: {report['cobertura']['desde']} a {report['cobertura']['hasta']} ({report['cobertura']['meses']} meses, sin huecos)" if not report["issues"] else f"- Problemas: {'; '.join(report['issues'])}",
        f"- Pozos: {counts['pozos']} ({counts['pozos_que_produjeron']} produjeron alguna vez, {counts['pozos_activos']} activos)",
        f"- Bloques: {counts['bloques']} ({counts['bloques_con_poligono_oficial']} con polígono oficial, {counts['bloques_con_poligono_derivado']} con envolvente derivada de pozos)",
        f"- Registros mensuales pozo-mes: {counts['registros_mensuales']}",
        "", "## Gas de la cuenca por año (MMm³/d promedio)", "",
        "| Año | Gas MMm³/d | Petróleo m³/d |", "|---|---|---|",
        *[f"| {year} | {value} | {report['petroleo_m3d_por_anio'][year]} |" for year, value in report["gas_MMm3d_por_anio"].items()],
    ]
    if report["declaracion_atrasada"]:
        lines += ["", "## Operadoras con declaración atrasada", "", *[f"- {item['empresa']}: {item['pozos_activos']} pozos activos sin el último mes; se sostiene su última tasa" for item in report["declaracion_atrasada"]]]
    if report["notas"]:
        lines += ["", "## Notas", "", *[f"- {note}" for note in report["notas"]]]
    (PROCESSED_DIR / "quality-report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    manifest = {
        "schemaVersion": 2, "pipelineVersion": "0.2.0", "source_date": t_now,
        "sources": [{"anio": int(year), **{key: meta[key] for key in ("name", "url", "resource_id", "last_modified", "rows")}} for year, meta in sorted(store["meta"]["years"].items())],
        "outputs": outputs,
    }
    (PROCESSED_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    store, geo = load_inputs()
    t_now, notes = last_complete_month(store)
    wells = build_wells(store, geo, t_now)
    blocks, features, forecast = build_blocks(wells, geo, t_now)
    report = quality(wells, blocks, forecast, t_now, notes, store)
    if report["issues"]:
        raise RuntimeError("Fallaron controles de calidad: " + "; ".join(report["issues"]))
    write_outputs(wells, blocks, features, forecast, geo, report, t_now, store)
    print(f"OK: {len(blocks)} bloques, {len(wells)} pozos, datos a {t_now} -> {PUBLIC_DIR.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
