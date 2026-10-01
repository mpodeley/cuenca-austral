import json
import unittest

import numpy as np

from pipeline import arps
from pipeline.build_data import T0, convex_hull, last_complete_month, point_in_ring, quality, type_profile
from pipeline.common import PROCESSED_DIR, PUBLIC_DIR, days_in_month, month_at, month_index
from pipeline.fetch_capiv import merge_year, yearly_resources
from pipeline.fetch_geo import clip_ring, polygon_area_km2, simplify


class MonthTests(unittest.TestCase):
    def test_month_arithmetic_round_trips(self):
        self.assertEqual(month_index("2026-08", "2006-01"), 247)
        self.assertEqual(month_at("2006-01", 247), "2026-08")
        self.assertEqual(days_in_month("2024-02"), 29)
        self.assertEqual(days_in_month("2025-02"), 28)


class ResourceSelectionTests(unittest.TestCase):
    def test_prefers_plain_csv_and_the_larger_twin(self):
        package = {"resources": [
            {"id": "ddjj", "name": "Producción de Pozos de Gas y Petróleo - 2024 (DDJJ abiertas y cerradas)", "format": "CSV", "size": 999, "last_modified": "2026-10-01"},
            {"id": "old", "name": "Producción de Pozos de Gas y Petróleo - 2024", "format": "CSV", "size": 500, "last_modified": "2026-09-01"},
            {"id": "new", "name": "Producción de Pozos de Gas y Petróleo - 2024", "format": "CSV", "size": 500, "last_modified": "2026-10-01"},
            {"id": "dash", "name": "Producción de Pozos de Gas y Petróleo – 2025", "format": "CSV", "size": 1, "last_modified": "2026-10-01"},
            {"id": "nc", "name": "Producción de Pozos de Gas y Petróleo No Convencional", "format": "CSV", "size": 1},
        ]}
        chosen = yearly_resources(package)
        self.assertEqual(sorted(chosen), [2024, 2025])
        self.assertEqual(chosen[2024]["id"], "new")
        self.assertEqual(chosen[2025]["id"], "dash")

    def test_merging_a_year_replaces_only_that_year(self):
        store = {"meta": {"years": {}}, "wells": {"1": {"a": {"sigla": "viejo"}, "m": {"2023-12": [1, 0, 0, 31, 0], "2024-01": [9, 0, 0, 31, 0]}}}}
        merge_year(store, {"year": 2024, "wells": {"1": {"a": {"sigla": "nuevo"}, "m": {"2024-02": [5, 0, 0, 29, 0]}}}})
        self.assertEqual(sorted(store["wells"]["1"]["m"]), ["2023-12", "2024-02"])
        self.assertEqual(store["wells"]["1"]["a"]["sigla"], "nuevo")


class ArpsTests(unittest.TestCase):
    def test_fit_recovers_a_known_decline(self):
        t = np.arange(72, dtype=float)
        rates = arps.hyperbolic(t, 100.0, 0.06, 0.6)
        fitted = arps.fit(rates)
        self.assertTrue(fitted["ok"])
        self.assertAlmostEqual(fitted["qi"], 100.0, delta=1)
        self.assertAlmostEqual(fitted["di"], 0.06, delta=0.005)
        self.assertAlmostEqual(fitted["b"], 0.6, delta=0.05)

    def test_short_series_is_not_fitted(self):
        self.assertIsNone(arps.fit(np.array([10.0, 9.0, 8.0])))

    def test_projection_never_declines_slower_than_the_terminal_rate(self):
        rates = arps.project(50.0, 200, 24, di=0.002, b=1.0)
        self.assertTrue(np.all(np.diff(rates) < 0))
        self.assertAlmostEqual(rates[11] / 50.0, 1 - arps.DMIN_ANNUAL, places=6)

    def test_inactive_well_has_no_tail(self):
        result = arps.eur(np.array([5.0, 4.0, 0.0]), 270.0, False, "gas", None, seed=1)
        self.assertEqual((result["eur"], result["lo"], result["hi"]), (270.0, 270.0, 270.0))

    def test_band_brackets_the_base_case(self):
        rng = np.random.default_rng(7)
        rates = arps.hyperbolic(np.arange(60, dtype=float), 80.0, 0.05, 0.5) * rng.normal(1, 0.08, 60)
        result = arps.eur(rates, float(rates.sum() * arps.DAYS), True, "gas", arps.fit(rates), seed=1)
        self.assertLessEqual(result["lo"], result["eur"])
        self.assertGreaterEqual(result["hi"], result["eur"])


class GeometryTests(unittest.TestCase):
    def test_area_of_a_tenth_degree_square(self):
        ring = [[-69.0, -52.0], [-68.9, -52.0], [-68.9, -51.9], [-69.0, -51.9], [-69.0, -52.0]]
        self.assertAlmostEqual(polygon_area_km2([ring]), 75.9, delta=1.0)

    def test_closed_ring_survives_simplification(self):
        ring = [[0, 0], [1, 0.0001], [2, 0], [2, 2], [0, 2], [0, 0]]
        self.assertEqual(simplify(ring, 0.01), [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]])

    def test_clip_keeps_only_the_part_inside_the_box(self):
        clipped = clip_ring([[-1, -1], [3, -1], [3, 3], [-1, 3]], (0, 0, 2, 2))
        self.assertEqual({tuple(point) for point in clipped}, {(0, 0), (2, 0), (2, 2), (0, 2)})

    def test_point_in_ring_and_hull(self):
        square = [[0, 0], [2, 0], [2, 2], [0, 2]]
        self.assertTrue(point_in_ring(1, 1, square))
        self.assertFalse(point_in_ring(3, 1, square))
        self.assertEqual(len(convex_hull([(0, 0), (2, 0), (2, 2), (0, 2), (1, 1)])), 4)


def synthetic_well(first: int, months: int, qi: float, total: int = 120) -> dict:
    rate = np.zeros((3, total))
    rate[0, first:first + months] = arps.hyperbolic(np.arange(months, dtype=float), qi, 0.05, 0.5)
    return {"_rate": rate, "_first": first, "_last_report": first + months - 1, "fluido": "gas", "activo": True}


class TypeWellTests(unittest.TestCase):
    def test_needs_enough_wells(self):
        self.assertIsNone(type_profile([synthetic_well(5, 40, 50.0) for _ in range(3)], "gas", 0))

    def test_profile_follows_the_median_well(self):
        wells = [synthetic_well(3 + index, 60, 40.0 + 5 * index) for index in range(9)]
        profile = type_profile(wells, "gas", 0)
        self.assertEqual(profile["n"], 9)
        self.assertAlmostEqual(profile["p50"][0], 60.0, delta=1.5)
        self.assertLess(profile["k_bajo"], 1)
        self.assertGreater(profile["k_alto"], 1)

    def test_wells_already_producing_at_the_start_of_the_record_are_excluded(self):
        wells = [synthetic_well(0, 60, 50.0) for _ in range(12)]
        self.assertIsNone(type_profile(wells, "gas", 0))


class QualityTests(unittest.TestCase):
    def store(self, skip: set[str] = frozenset(), late_from: str | None = None):
        months = [month_at(T0, index) for index in range(36)]
        wells = {}
        for well_id, gas in (("1", 900.0), ("2", 100.0)):
            wells[well_id] = {"a": {}, "m": {m: [gas, 0, 0, 30, 0] for m in months if m not in skip and not (well_id == "1" and late_from and m >= late_from)}}
        return {"meta": {"years": {}}, "wells": wells}

    def test_trailing_month_is_dropped_when_a_big_producer_is_late(self):
        month, notes = last_complete_month(self.store(late_from="2008-12"))
        self.assertEqual(month, "2008-11")
        self.assertEqual(len(notes), 1)

    def test_missing_month_and_sudden_drop_fail_the_report(self):
        store = self.store(skip={"2007-06"})
        hist = [1000.0] * 36
        hist[17] = 0.0
        forecast = {"n": 36, "cuenca": {"hist_gas": hist, "hist_oil": [0.0] * 36}}
        report = quality([], [], forecast, "2008-12", [], store)
        self.assertEqual(report["status"], "fail")
        self.assertTrue(any("2007-06" in issue for issue in report["issues"]))
        self.assertEqual(len(report["issues"]), 2)


class PublishedDataTests(unittest.TestCase):
    """Controles sobre los archivos versionados: es lo que ve quien abre la app."""

    def test_basin_history_has_no_gaps(self):
        forecast = json.loads((PUBLIC_DIR / "forecast.json").read_text(encoding="utf-8"))["data"]
        gas = forecast["cuenca"]["hist_gas"]
        self.assertEqual(len(gas), forecast["n"])
        self.assertGreater(min(gas), 0.5 * max(gas))

    def test_quality_report_passes(self):
        report = json.loads((PROCESSED_DIR / "quality-report.json").read_text(encoding="utf-8"))
        self.assertEqual(report["status"], "pass")
        self.assertEqual(report["cobertura"]["desde"], T0)

    def test_every_producing_well_has_a_series(self):
        wells = json.loads((PUBLIC_DIR / "wells.json").read_text(encoding="utf-8"))["data"]
        series = json.loads((PUBLIC_DIR / "well_series.json").read_text(encoding="utf-8"))["data"]["wells"]
        self.assertEqual({well["id"] for well in wells if well["m0"]}, set(series))


if __name__ == "__main__":
    unittest.main()
