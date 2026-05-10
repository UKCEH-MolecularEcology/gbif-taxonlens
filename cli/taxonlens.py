#!/usr/bin/env python3
"""GBIF TaxonLens command-line matcher."""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path


ALIASES = {
    "scientificName": [
        "scientificname",
        "scientific_name",
        "taxonname",
        "taxon_name",
        "species",
        "name",
        "verbatimscientificname",
    ],
    "taxonRank": ["taxonrank", "taxon_rank", "rank"],
    "kingdom": ["kingdom"],
    "phylum": ["phylum", "division"],
    "class": ["class", "classis"],
    "order": ["order", "ordo"],
    "family": ["family", "family_name"],
    "genus": ["genus", "genericname", "generic_name"],
}

OUTPUT_FIELDS = [
    "inputName",
    "matchedName",
    "canonicalName",
    "matchType",
    "confidence",
    "status",
    "rank",
    "usageKey",
    "acceptedUsageKey",
    "acceptedScientificName",
    "kingdom",
    "family",
    "note",
]


def normalized(value: str) -> str:
    return value.strip().lower().replace(" ", "_").replace("-", "_")


def sniff_dialect(path: Path) -> csv.Dialect:
    sample = path.read_text(encoding="utf-8-sig")[:4096]
    try:
        return csv.Sniffer().sniff(sample, delimiters=",\t")
    except csv.Error:
        return csv.excel


def detect_column(headers: list[str], field: str) -> str | None:
    normalized_headers = {normalized(header): header for header in headers}
    for alias in ALIASES[field]:
        if alias in normalized_headers:
            return normalized_headers[alias]
    return None


def load_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    dialect = sniff_dialect(path)
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle, dialect=dialect)
        rows = [dict(row) for row in reader]
        return list(reader.fieldnames or []), rows


def build_params(row: dict[str, str], mapping: dict[str, str], default_kingdom: str) -> str:
    params = {
        "name": row.get(mapping["scientificName"], ""),
        "verbose": "true",
        "strict": "false",
    }
    for field in ["kingdom", "phylum", "class", "order", "family", "genus"]:
        column = mapping.get(field)
        value = row.get(column, "") if column else ""
        if field == "kingdom" and not value:
            value = default_kingdom
        if value:
            params[field] = value
    rank_column = mapping.get("taxonRank")
    if rank_column and row.get(rank_column):
        params["rank"] = row[rank_column].upper()
    return urllib.parse.urlencode(params)


def match_row(row: dict[str, str], mapping: dict[str, str], default_kingdom: str) -> dict[str, str]:
    params = build_params(row, mapping, default_kingdom)
    url = f"https://api.gbif.org/v1/species/match?{params}"
    with urllib.request.urlopen(url, timeout=30) as response:
        match = json.loads(response.read().decode("utf-8"))
    return {
        "inputName": row.get(mapping["scientificName"], ""),
        "matchedName": match.get("scientificName", ""),
        "canonicalName": match.get("canonicalName", ""),
        "matchType": match.get("matchType", "NONE"),
        "confidence": match.get("confidence", ""),
        "status": match.get("status", ""),
        "rank": match.get("rank", ""),
        "usageKey": match.get("usageKey", ""),
        "acceptedUsageKey": match.get("acceptedUsageKey", ""),
        "acceptedScientificName": match.get("acceptedScientificName", ""),
        "kingdom": match.get("kingdom", ""),
        "family": match.get("family", ""),
        "note": match.get("note", ""),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Match taxonomy files against the GBIF Backbone.")
    parser.add_argument("input", type=Path, help="Input CSV or TSV file")
    parser.add_argument("--out", type=Path, default=Path("gbif-taxonlens-results.csv"))
    parser.add_argument("--name-column", help="Scientific name column. Autodetected by default.")
    parser.add_argument("--default-kingdom", default="", help="Fallback kingdom for all rows.")
    parser.add_argument("--limit", type=int, default=0, help="Limit rows for a test run.")
    parser.add_argument("--sleep", type=float, default=0.05, help="Delay between API calls.")
    args = parser.parse_args()

    headers, rows = load_rows(args.input)
    mapping = {
        field: column
        for field in ALIASES
        if (column := detect_column(headers, field))
    }
    if args.name_column:
        mapping["scientificName"] = args.name_column
    if "scientificName" not in mapping:
        print("No scientific-name column found. Use --name-column.", file=sys.stderr)
        return 2

    rows_to_match = rows[: args.limit] if args.limit else rows
    results = []
    for index, row in enumerate(rows_to_match, start=1):
        print(f"Matching {index}/{len(rows_to_match)}: {row.get(mapping['scientificName'], '')}", file=sys.stderr)
        results.append(match_row(row, mapping, args.default_kingdom))
        time.sleep(args.sleep)

    with args.out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(results)

    print(f"Wrote {len(results)} rows to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
