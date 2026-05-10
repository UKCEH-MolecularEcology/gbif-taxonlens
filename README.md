# GBIF TaxonLens

GBIF TaxonLens is a UKCEH-styled, static-first tool for checking user-supplied taxonomy and checklist files against the GBIF Backbone. It is designed for researchers who need a transparent review table rather than a black-box name lookup.

The web portal runs entirely in the browser. Uploaded files are parsed locally; only the name and classification fields needed for matching are sent to the GBIF Species Match API.

## Features

- Browser-based CSV/TSV upload.
- Autodetection of user-provided taxonomy columns.
- Support for simple name lists, classified checklists, Darwin Core-style checklists, and taxonomy-tree-like files.
- Checklist health checks for duplicate names, weak higher taxonomy, missing authorship, and orphaned parent IDs.
- GBIF `/species/match` lookup with `verbose=true`.
- Result filtering by `EXACT`, `FUZZY`, `HIGHERRANK`, and `NONE`.
- CSV export of matched names and GBIF identifiers.
- Python command-line workflow for reproducible batch use.
- GitHub Actions unit tests.

## Brand Palette

The interface uses the UKCEH core palette from the colour guidelines:

| Token | Hex |
| --- | --- |
| Black | `#000000` |
| White | `#FFFFFF` |
| Land | `#90A968` |
| Air | `#D6EAE6` |
| Earth | `#D7B7AA` |
| Water | `#477AE2` |
| Data | `#DBFE52` |

## Quick Start: Web Portal

Clone the repository:

```bash
git clone https://github.com/UKCEH-MolecularEcology/gbif-taxonlens.git
cd gbif-taxonlens
```

Open the static portal directly:

```bash
open index.html
```

Alternatively, serve it locally:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Quick Start: Command Line

Run the included demo file:

```bash
python3 cli/taxonlens.py examples/demo-checklist.csv --default-kingdom Plantae --out matched.csv
```

Run your own file:

```bash
python3 cli/taxonlens.py input.csv --out matched.csv
```

Specify a non-standard scientific-name column:

```bash
python3 cli/taxonlens.py input.csv --name-column species --out matched.csv
```

Limit rows for a test run:

```bash
python3 cli/taxonlens.py input.csv --limit 100 --out matched-preview.csv
```

Slow requests for gentle API use:

```bash
python3 cli/taxonlens.py input.csv --sleep 0.1 --out matched.csv
```

## Input File Format

CSV and TSV files are supported. The only required field is a scientific-name column, but matching is safer when higher taxonomy is supplied.

Recommended columns:

| Purpose | Common column names |
| --- | --- |
| Scientific name | `scientificName`, `scientific_name`, `species`, `taxon_name`, `name` |
| Taxon rank | `taxonRank`, `taxon_rank`, `rank` |
| Kingdom | `kingdom` |
| Family | `family`, `family_name` |
| Genus | `genus`, `genericName` |
| Authorship | `scientificNameAuthorship`, `authorship`, `author` |
| Taxon ID | `taxonID`, `taxon_id`, `gbifID`, `usageKey` |
| Parent ID | `parentNameUsageID`, `parent_taxon_id`, `parent_id` |
| Accepted name ID | `acceptedNameUsageID`, `accepted_taxon_id` |
| Taxonomic status | `taxonomicStatus`, `taxonomic_status`, `status` |

Example:

```csv
id,scientificName,kingdom,family,taxonRank
1,Ficus variegata,Plantae,Moraceae,SPECIES
2,Rosa inodora,Plantae,Rosaceae,SPECIES
3,Ammophila arenaria,Plantae,Poaceae,SPECIES
```

## Output Columns

The CLI and web export include:

```text
inputName
matchedName
canonicalName
matchType
confidence
status
rank
usageKey
acceptedUsageKey
acceptedScientificName
kingdom
family
note
```

`matchType` follows GBIF terminology, including `EXACT`, `FUZZY`, `HIGHERRANK`, `AGGREGATE`, and `NONE`.

## Running Tests

Run the Python unit tests:

```bash
python3 -m unittest discover -s tests -v
```

Check JavaScript syntax:

```bash
node --check app.js
```

These checks also run in GitHub Actions on pushes and pull requests.

## GitHub Pages Deployment

This repository is ready for GitHub Pages because the app is static.

1. Go to the repository settings.
2. Open **Pages**.
3. Set the source to the `main` branch.
4. Select the repository root as the publishing folder.
5. Save.

The `.nojekyll` file is included so GitHub Pages serves the static files directly.

## Project Structure

```text
.
├── index.html
├── styles.css
├── app.js
├── cli/
│   └── taxonlens.py
├── examples/
│   └── demo-checklist.csv
├── tests/
│   └── test_cli.py
├── assets/
│   └── ukceh/
└── .github/
    └── workflows/
        └── tests.yml
```

## Roadmap

- Manual column remapping UI.
- GBIF alternatives drawer.
- Wikidata cross-checking for GBIF and NCBI identifiers.
- Offline pinned-backbone mode for fully reproducible analyses.
- `gndiff`-style local checklist comparison mode.
