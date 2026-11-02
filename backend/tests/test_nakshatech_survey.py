"""Read-only checks against the 17 supplied NakshaTech shapefile sets."""

from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

import shapefile
from pyproj import CRS, Transformer

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.nakshatech_survey import BY_ID, DATASETS, SURVEY_ROOT, _converted, survey_catalogue, survey_geojson  # noqa: E402


def coordinates(value):
    if isinstance(value, (list, tuple)) and len(value) >= 2 and isinstance(value[0], (int, float)):
        yield value
    elif isinstance(value, (list, tuple)):
        for part in value:
            yield from coordinates(part)


class NakshaTechSurveyTests(unittest.TestCase):
    def test_catalogue_and_every_dataset_convert(self):
        catalogue = survey_catalogue()["datasets"]
        self.assertEqual(len(catalogue), 17)
        self.assertEqual({item["id"] for item in catalogue}, set(BY_ID))
        for item in catalogue:
            with self.subTest(dataset=item["id"]):
                self.assertTrue(item["available"])
                self.assertGreater(item["feature_count"], 0)
                geojson = survey_geojson(item["id"])
                self.assertEqual(geojson["type"], "FeatureCollection")
                self.assertEqual(geojson["metadata"]["target_crs"], "EPSG:4326")
                self.assertEqual(geojson["metadata"]["source_name"], item["source_name"])
                self.assertEqual(len(geojson["features"]), geojson["metadata"]["feature_count"])
                self.assertGreater(len(geojson["features"]), 0)
                for feature in geojson["features"]:
                    self.assertEqual(feature["type"], "Feature")
                    self.assertIsInstance(feature["properties"], dict)
                    self.assertIn(feature["geometry"]["type"], {"Point", "LineString", "MultiLineString", "Polygon", "MultiPolygon"})
                    points = list(coordinates(feature["geometry"]["coordinates"]))
                    self.assertGreater(len(points), 0)
                    self.assertTrue(all(math.isfinite(x) and math.isfinite(y) and -180 <= x <= 180 and -90 <= y <= 90 for x, y in points))

    def test_cauvery_projected_coordinates_and_dbf_attributes(self):
        folder = SURVEY_ROOT / "Cauvery"
        source_crs = CRS.from_wkt((folder / "Cauvery.prj").read_text())
        with shapefile.Reader(str(folder / "Cauvery")) as reader:
            source = next(reader.iterShapeRecords())
            source_point = next(coordinates(source.shape.__geo_interface__["coordinates"]))
            source_properties = source.record.as_dict()
        expected = Transformer.from_crs(source_crs, "EPSG:4326", always_xy=True).transform(*source_point[:2])
        converted = survey_geojson("cauvery")["features"][0]
        actual = next(coordinates(converted["geometry"]["coordinates"]))
        self.assertAlmostEqual(actual[0], expected[0], places=8)
        self.assertAlmostEqual(actual[1], expected[1], places=8)
        self.assertEqual(converted["properties"]["rivname"], source_properties["rivname"])
        self.assertEqual(converted["properties"]["length_km"], source_properties["length_km"])

    def test_whitelist_and_cache(self):
        for dataset_id in ("../Cauvery", "Cauvery", "C:/Windows", "cauvery/../../backend", "", "unknown"):
            with self.subTest(dataset_id=dataset_id), self.assertRaises(LookupError):
                survey_geojson(dataset_id)
        first = survey_geojson("forest")
        second = survey_geojson("forest")
        self.assertIs(first, second)
        self.assertGreater(_converted.cache_info().hits, 0)


if __name__ == "__main__":
    unittest.main()
