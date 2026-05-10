# GBIF TaxonLens

GBIF TaxonLens is a static-first taxonomy matching portal for checking user-supplied checklists against the GBIF Backbone.

It includes:

- CSV/TSV upload in the browser.
- Autodetection of user-provided taxonomy columns.
- Checklist health checks for duplicates, missing authorship, weak higher taxonomy, and orphaned parent IDs.
- GBIF `/species/match` lookup with `verbose=true`.
- Result filters for `EXACT`, `FUZZY`, `HIGHERRANK`, and `NONE`.
- CSV export.
- A Python command-line script for advanced users.

The interface uses the UKCEH core palette from the colour guidelines: Black
`#000000`, White `#FFFFFF`, Land `#90A968`, Air `#D6EAE6`, Earth `#D7B7AA`,
Water `#477AE2`, and Data `#DBFE52`.

## Web Portal

Open `index.html` in a browser, or publish the folder through GitHub Pages.

The portal is intentionally static: files remain in the browser and only the relevant name/classification fields are sent to GBIF for matching.

## Terminal

```bash
python3 cli/taxonlens.py examples/demo-checklist.csv --default-kingdom Plantae --out matched.csv
```

Optional flags:

```bash
python3 cli/taxonlens.py input.csv --name-column species --limit 100 --sleep 0.1
```

## Suggested GitHub Pages Setup

1. Create a GitHub repository named `gbif-taxonlens`.
2. Add these files to the repository.
3. Enable GitHub Pages from the repository settings.
4. Use the repository root as the Pages source.

## Roadmap

- Manual column remapping UI.
- GBIF alternatives drawer.
- Wikidata cross-checking for GBIF and NCBI identifiers.
- Offline pinned-backbone mode for fully reproducible analyses.
- `gndiff`-style local checklist comparison mode.
