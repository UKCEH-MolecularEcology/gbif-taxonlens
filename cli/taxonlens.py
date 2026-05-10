#!/usr/bin/env python3
"""GBIF TaxonLens command-line matcher."""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
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
    "specificEpithet": ["specificepithet", "specific_epithet", "epithet"],
    "decimalLatitude": ["decimallatitude", "decimal_latitude", "latitude", "lat"],
    "decimalLongitude": ["decimallongitude", "decimal_longitude", "longitude", "lon", "lng", "long"],
    "country": ["country", "countrycode", "country_code"],
}

OUTPUT_FIELDS = [
    "inputRow",
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
    "source",
    "wikidataStatus",
    "wikidataNcbiIds",
    "locationStatus",
    "nearbyGbifOccurrenceCount",
    "recordsWithin1Km",
    "recordsWithin5Km",
    "recordsWithin10Km",
    "recordsWithin50Km",
    "nearestGbifRecordKm",
    "mostRecentNearbyGbifYear",
    "localReferenceMatch",
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


def clean_taxon_value(value: str | None) -> str:
    value = (value or "").strip().strip("\"'")
    value = re.sub(r"^[A-Za-z]__", "", value)
    value = re.sub(r"^(uncultured|unclassified|unknown)\s+", "", value, flags=re.I)
    return value.strip()


def is_binomial(value: str) -> bool:
    return bool(re.match(r"^[A-Z][A-Za-z-]+(\s+[a-z][A-Za-z-]+){1,2}$", value))


def mapped_value(row: dict[str, str], mapping: dict[str, str], field: str) -> str:
    column = mapping.get(field)
    return clean_taxon_value(row.get(column, "") if column else "")


def scientific_name_for_row(row: dict[str, str], mapping: dict[str, str]) -> str:
    supplied = mapped_value(row, mapping, "scientificName")
    genus = mapped_value(row, mapping, "genus")
    specific = mapped_value(row, mapping, "specificEpithet")

    if supplied and is_binomial(supplied):
        return supplied
    if genus and supplied and re.match(r"^[a-z][A-Za-z-]+$", supplied):
        return f"{genus} {supplied}"
    if genus and specific:
        return f"{genus} {specific}"
    return supplied or genus


def load_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    dialect = sniff_dialect(path)
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle, dialect=dialect)
        rows = [dict(row) for row in reader]
        return list(reader.fieldnames or []), rows


def build_params(row: dict[str, str], mapping: dict[str, str], default_kingdom: str) -> str:
    params = {
        "name": scientific_name_for_row(row, mapping),
        "verbose": "true",
        "strict": "false",
    }
    for field in ["kingdom", "phylum", "class", "order", "family", "genus"]:
        value = mapped_value(row, mapping, field)
        if field == "kingdom" and not value:
            value = default_kingdom
        if value:
            params[field] = value
    rank_column = mapping.get("taxonRank")
    if rank_column and row.get(rank_column):
        params["rank"] = row[rank_column].upper()
    return urllib.parse.urlencode(params)


def unmatched_row(row: dict[str, str], mapping: dict[str, str], row_number: int, note: str) -> dict[str, str]:
    return {
        "inputRow": row_number,
        "inputName": scientific_name_for_row(row, mapping),
        "matchedName": "",
        "canonicalName": "",
        "matchType": "NONE",
        "confidence": 0,
        "status": "UNMATCHED",
        "rank": "",
        "usageKey": "",
        "acceptedUsageKey": "",
        "acceptedScientificName": "",
        "kingdom": "",
        "family": "",
        "note": note,
        "source": "Unmatched",
        "wikidataStatus": "",
        "wikidataNcbiIds": "",
        "locationStatus": "",
        "nearbyGbifOccurrenceCount": "",
        "recordsWithin1Km": "",
        "recordsWithin5Km": "",
        "recordsWithin10Km": "",
        "recordsWithin50Km": "",
        "nearestGbifRecordKm": "",
        "mostRecentNearbyGbifYear": "",
        "localReferenceMatch": "",
    }


def match_row(row: dict[str, str], mapping: dict[str, str], default_kingdom: str, row_number: int) -> dict[str, str]:
    params = build_params(row, mapping, default_kingdom)
    url = f"https://api.gbif.org/v1/species/match?{params}"
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            match = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        return unmatched_row(row, mapping, row_number, f"GBIF request failed: {exc}")
    return {
        "inputRow": row_number,
        "inputName": scientific_name_for_row(row, mapping),
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
        "source": "GBIF",
        "wikidataStatus": "",
        "wikidataNcbiIds": "",
        "locationStatus": "",
        "nearbyGbifOccurrenceCount": "",
        "recordsWithin1Km": "",
        "recordsWithin5Km": "",
        "recordsWithin10Km": "",
        "recordsWithin50Km": "",
        "nearestGbifRecordKm": "",
        "mostRecentNearbyGbifYear": "",
        "localReferenceMatch": "",
    }


def parse_float(value: str) -> float | None:
    try:
        parsed = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def location_for_row(row: dict[str, str], mapping: dict[str, str]) -> dict[str, float] | None:
    lat = parse_float(mapped_value(row, mapping, "decimalLatitude"))
    lon = parse_float(mapped_value(row, mapping, "decimalLongitude"))
    if lat is None or lon is None or lat < -90 or lat > 90 or lon < -180 or lon > 180:
        return None
    return {"lat": lat, "lon": lon}


def location_polygon(location: dict[str, float], radius_km: float = 50) -> str:
    lat = location["lat"]
    lon = location["lon"]
    lat_delta = radius_km / 111.32
    lon_scale = 111.32 * math.cos(math.radians(lat))
    lon_delta = radius_km / lon_scale if abs(lon_scale) > 0.0001 else radius_km / 111.32
    west = lon - lon_delta
    east = lon + lon_delta
    south = lat - lat_delta
    north = lat + lat_delta
    return f"POLYGON(({west} {south}, {east} {south}, {east} {north}, {west} {north}, {west} {south}))"


def distance_km(a: dict[str, float], b: dict[str, float]) -> float:
    radius = 6371.0
    d_lat = math.radians(b["lat"] - a["lat"])
    d_lon = math.radians(b["lon"] - a["lon"])
    lat1 = math.radians(a["lat"])
    lat2 = math.radians(b["lat"])
    h = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(h))


def plausibility_from_counts(counts: dict[int, int], nearest_distance_km: float, total_records: int) -> str:
    if not total_records:
        return "Data deficient"
    if counts[10] >= 3 or counts[5] >= 1:
        return "High plausibility"
    if counts[50] >= 3 or nearest_distance_km <= 50:
        return "Moderate plausibility"
    if total_records > 0:
        return "Low plausibility"
    return "No GBIF support"


def fetch_location_check(
    result: dict[str, str],
    row: dict[str, str],
    mapping: dict[str, str],
) -> tuple[dict[str, str], list[dict[str, str]]]:
    location = location_for_row(row, mapping)
    if not location:
        return {
            "status": "No coordinates",
            "count": 0,
            "qualityFilteredCount": 0,
            "location": {},
            "counts": {1: 0, 5: 0, 10: 0, 50: 0},
            "nearestDistanceKm": "",
            "mostRecentYear": "",
        }, []

    usage_key = result.get("usageKey") or result.get("acceptedUsageKey")
    if not usage_key:
        return {
            "status": "No taxon key",
            "count": 0,
            "qualityFilteredCount": 0,
            "location": location,
            "counts": {1: 0, 5: 0, 10: 0, 50: 0},
            "nearestDistanceKm": "",
            "mostRecentYear": "",
        }, []

    params = urllib.parse.urlencode(
        {
            "taxon_key": usage_key,
            "geometry": location_polygon(location),
            "has_coordinate": "true",
            "has_geospatial_issue": "false",
            "occurrence_status": "PRESENT",
            "limit": "300",
        }
    )
    url = f"https://api.gbif.org/v1/occurrence/search?{params}"
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))
    except Exception:
        return {
            "status": "Unavailable",
            "count": 0,
            "qualityFilteredCount": 0,
            "location": location,
            "counts": {1: 0, 5: 0, 10: 0, 50: 0},
            "nearestDistanceKm": "",
            "mostRecentYear": "",
        }, []

    records = []
    for item in data.get("results", []):
        lat = parse_float(item.get("decimalLatitude"))
        lon = parse_float(item.get("decimalLongitude"))
        uncertainty = parse_float(item.get("coordinateUncertaintyInMeters"))
        if lat is None or lon is None:
            continue
        if uncertainty is not None and uncertainty > 10000:
            continue
        if item.get("basisOfRecord") in {"FOSSIL_SPECIMEN", "LIVING_SPECIMEN"}:
            continue
        distance = distance_km(location, {"lat": lat, "lon": lon})
        records.append(
            {
                "occurrenceKey": item.get("key", ""),
                "occurrenceName": item.get("scientificName", ""),
                "distanceKm": round(distance, 3),
                "decimalLatitude": lat,
                "decimalLongitude": lon,
                "country": item.get("country", ""),
                "year": item.get("year", ""),
                "basisOfRecord": item.get("basisOfRecord", ""),
                "coordinateUncertaintyMeters": item.get("coordinateUncertaintyInMeters", ""),
            }
        )

    records.sort(key=lambda item: item["distanceKm"])
    radii = [1, 5, 10, 50]
    counts = {radius: sum(1 for record in records if record["distanceKm"] <= radius) for radius in radii}
    years = [int(record["year"]) for record in records if str(record["year"]).isdigit()]
    nearest_distance = records[0]["distanceKm"] if records else math.inf
    status = plausibility_from_counts(counts, nearest_distance, int(data.get("count") or len(records)))
    check = {
        "status": status,
        "count": int(data.get("count") or 0),
        "qualityFilteredCount": len(records),
        "location": location,
        "counts": counts,
        "nearestDistanceKm": round(nearest_distance, 2) if records else "",
        "mostRecentYear": max(years) if years else "",
    }
    return check, records[:50]


def apply_location_check(result: dict[str, str], check: dict[str, str]) -> None:
    counts = check.get("counts", {})
    result["locationStatus"] = check.get("status", "")
    result["nearbyGbifOccurrenceCount"] = check.get("count", "")
    result["recordsWithin1Km"] = counts.get(1, "")
    result["recordsWithin5Km"] = counts.get(5, "")
    result["recordsWithin10Km"] = counts.get(10, "")
    result["recordsWithin50Km"] = counts.get(50, "")
    result["nearestGbifRecordKm"] = check.get("nearestDistanceKm", "")
    result["mostRecentNearbyGbifYear"] = check.get("mostRecentYear", "")


LOCATION_SUMMARY_FIELDS = [
    "inputRow",
    "inputName",
    "matchedName",
    "usageKey",
    "locationStatus",
    "inputLatitude",
    "inputLongitude",
    "nearbyGbifOccurrenceCount",
    "qualityFilteredOccurrenceCount",
    "recordsWithin1Km",
    "recordsWithin5Km",
    "recordsWithin10Km",
    "recordsWithin50Km",
    "nearestGbifRecordKm",
    "mostRecentNearbyGbifYear",
]

OCCURRENCE_FIELDS = [
    "inputRow",
    "inputName",
    "matchedName",
    "usageKey",
    "occurrenceKey",
    "occurrenceName",
    "distanceKm",
    "decimalLatitude",
    "decimalLongitude",
    "country",
    "year",
    "basisOfRecord",
    "coordinateUncertaintyMeters",
]


def main() -> int:
    parser = argparse.ArgumentParser(description="Match taxonomy files against the GBIF Backbone.")
    parser.add_argument("input", type=Path, help="Input CSV or TSV file")
    parser.add_argument("--out", type=Path, default=Path("gbif-taxonlens-results.csv"))
    parser.add_argument("--location-check", action="store_true", help="Check matched taxa against nearby GBIF occurrences.")
    parser.add_argument("--location-summary-out", type=Path, default=Path("gbif-taxonlens-location-summary.csv"))
    parser.add_argument("--occurrences-out", type=Path, default=Path("gbif-taxonlens-location-occurrences.csv"))
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
    location_summaries = []
    occurrence_rows = []
    for index, row in enumerate(rows_to_match, start=1):
        print(
            f"Matching {index}/{len(rows_to_match)}: {scientific_name_for_row(row, mapping)}",
            file=sys.stderr,
        )
        result = match_row(row, mapping, args.default_kingdom, index)
        if args.location_check:
            check, records = fetch_location_check(result, row, mapping)
            apply_location_check(result, check)
            location = check.get("location") or {}
            location_summaries.append(
                {
                    "inputRow": result["inputRow"],
                    "inputName": result["inputName"],
                    "matchedName": result["matchedName"],
                    "usageKey": result["usageKey"],
                    "locationStatus": check.get("status", ""),
                    "inputLatitude": location.get("lat", ""),
                    "inputLongitude": location.get("lon", ""),
                    "nearbyGbifOccurrenceCount": check.get("count", ""),
                    "qualityFilteredOccurrenceCount": check.get("qualityFilteredCount", ""),
                    "recordsWithin1Km": check.get("counts", {}).get(1, ""),
                    "recordsWithin5Km": check.get("counts", {}).get(5, ""),
                    "recordsWithin10Km": check.get("counts", {}).get(10, ""),
                    "recordsWithin50Km": check.get("counts", {}).get(50, ""),
                    "nearestGbifRecordKm": check.get("nearestDistanceKm", ""),
                    "mostRecentNearbyGbifYear": check.get("mostRecentYear", ""),
                }
            )
            occurrence_rows.extend(
                {
                    "inputRow": result["inputRow"],
                    "inputName": result["inputName"],
                    "matchedName": result["matchedName"],
                    "usageKey": result["usageKey"],
                    **record,
                }
                for record in records
            )
        results.append(result)
        time.sleep(args.sleep)

    with args.out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(results)

    print(f"Wrote {len(results)} rows to {args.out}")
    if args.location_check:
        with args.location_summary_out.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=LOCATION_SUMMARY_FIELDS)
            writer.writeheader()
            writer.writerows(location_summaries)
        with args.occurrences_out.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=OCCURRENCE_FIELDS)
            writer.writeheader()
            writer.writerows(occurrence_rows)
        print(f"Wrote {len(location_summaries)} rows to {args.location_summary_out}")
        print(f"Wrote {len(occurrence_rows)} rows to {args.occurrences_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
