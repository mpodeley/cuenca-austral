import json
import subprocess
import sys
import unittest
from pathlib import Path

from pipeline.build_data import build_blocks, demo_dataset, normalize_coordinates, stable_id, validate

ROOT = Path(__file__).resolve().parents[1]


class PipelineTests(unittest.TestCase):
    def test_stable_ids(self):
        self.assertEqual(stable_id("well", "ABC-1"), stable_id("well", "ABC-1"))
        self.assertNotEqual(stable_id("well", "ABC-1"), stable_id("well", "ABC-2"))

    def test_coordinate_order_is_normalized(self):
        self.assertEqual(normalize_coordinates({"coordenadax": "-51.2", "coordenaday": "-68.3"}), (-68.3, -51.2))

    def test_demo_passes_quality_checks(self):
        wells, blocks, _ = demo_dataset()
        report, issues = validate(wells, blocks, "2026-09-30T00:00:00+00:00")
        self.assertEqual(issues, [])
        self.assertEqual(report["status"], "pass")
        self.assertEqual(len(blocks), 3)

    def test_demo_output_is_reproducible(self):
        subprocess.run([sys.executable, "pipeline/build_data.py", "--demo"], cwd=ROOT, check=True, capture_output=True)
        first = (ROOT / "public/data/dataset.json").read_bytes()
        subprocess.run([sys.executable, "pipeline/build_data.py", "--demo"], cwd=ROOT, check=True, capture_output=True)
        self.assertEqual(first, (ROOT / "public/data/dataset.json").read_bytes())
        self.assertEqual(json.loads(first)["metadata"]["mode"], "demo")


if __name__ == "__main__":
    unittest.main()

