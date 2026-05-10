import csv
import tempfile
import unittest
from pathlib import Path
from urllib.parse import parse_qs

import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "cli"))

import taxonlens  # noqa: E402


class TaxonLensCliTests(unittest.TestCase):
    def test_detects_common_scientific_name_alias(self):
        headers = ["record_id", "species", "family_name"]

        self.assertEqual(taxonlens.detect_column(headers, "scientificName"), "species")
        self.assertEqual(taxonlens.detect_column(headers, "family"), "family_name")

    def test_loads_tsv_input(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "names.tsv"
            path.write_text(
                "id\tscientificName\tkingdom\n1\tQuercus robur\tPlantae\n",
                encoding="utf-8",
            )

            headers, rows = taxonlens.load_rows(path)

        self.assertEqual(headers, ["id", "scientificName", "kingdom"])
        self.assertEqual(rows[0]["scientificName"], "Quercus robur")

    def test_builds_gbif_match_params_with_default_kingdom(self):
        row = {
            "scientificName": "Ficus variegata",
            "family": "Moraceae",
            "taxonRank": "species",
        }
        mapping = {
            "scientificName": "scientificName",
            "family": "family",
            "taxonRank": "taxonRank",
        }

        params = parse_qs(taxonlens.build_params(row, mapping, "Plantae"))

        self.assertEqual(params["name"], ["Ficus variegata"])
        self.assertEqual(params["kingdom"], ["Plantae"])
        self.assertEqual(params["family"], ["Moraceae"])
        self.assertEqual(params["rank"], ["SPECIES"])
        self.assertEqual(params["verbose"], ["true"])

    def test_builds_name_from_dada2_genus_and_species_epithet(self):
        row = {
            "ASV": "ASV1",
            "Kingdom": "k__Plantae",
            "Phylum": "p__Streptophyta",
            "Class": "c__Magnoliopsida",
            "Order": "o__Fagales",
            "Family": "f__Fagaceae",
            "Genus": "g__Quercus",
            "Species": "s__robur",
        }
        mapping = {
            "scientificName": "Species",
            "kingdom": "Kingdom",
            "family": "Family",
            "genus": "Genus",
        }

        params = parse_qs(taxonlens.build_params(row, mapping, ""))

        self.assertEqual(params["name"], ["Quercus robur"])
        self.assertEqual(params["kingdom"], ["Plantae"])
        self.assertEqual(params["family"], ["Fagaceae"])
        self.assertEqual(params["genus"], ["Quercus"])

    def test_writes_expected_output_fields(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "out.csv"
            with path.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=taxonlens.OUTPUT_FIELDS)
                writer.writeheader()
                writer.writerow({field: "" for field in taxonlens.OUTPUT_FIELDS})

            with path.open(newline="", encoding="utf-8") as handle:
                reader = csv.reader(handle)
                headers = next(reader)

        self.assertEqual(headers, taxonlens.OUTPUT_FIELDS)


if __name__ == "__main__":
    unittest.main()
