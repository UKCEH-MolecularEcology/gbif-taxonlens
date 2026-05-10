# GBIF TaxonLens

GBIF TaxonLens helps you check taxonomy names against the GBIF Backbone Taxonomy.

It is designed for people working with biodiversity, metabarcoding, amplicon, checklist, or species-list data who want a quick way to ask:

- Which names match GBIF exactly?
- Which names only match fuzzily?
- Which names match only to a higher rank?
- Which names need manual review?
- Which GBIF taxon IDs should I carry into downstream analyses?

You can use it in three ways:

- **Web app:** upload a CSV/TSV file in your browser.
- **Google Colab notebook:** upload a file and run the matcher without installing anything.
- **Command line:** run the same matching workflow from a terminal.

The web app is static. There is no database and no user account. Your uploaded file is parsed in your browser; only the relevant name and classification fields are sent to the public GBIF API for matching.

## What It Does

GBIF TaxonLens reads a taxonomy file, tries to detect useful columns, and sends each name to the GBIF Species Match API. It then returns a review table with:

- the input name
- the matched GBIF name
- the GBIF usage key
- match type, such as `EXACT`, `FUZZY`, `HIGHERRANK`, or `NONE`
- confidence score
- taxonomic status and rank
- accepted GBIF name where available
- alternative candidates for manual review
- optional Wikidata links to GBIF and NCBI identifiers
- optional location plausibility checks against nearby GBIF occurrence records

The goal is not to replace taxonomic judgement. The goal is to make the easy cases quick and the uncertain cases obvious.

## Try It In A Browser

Clone the repository:

```bash
git clone https://github.com/UKCEH-MolecularEcology/gbif-taxonlens.git
cd gbif-taxonlens
```

Open the app:

```bash
open index.html
```

If your browser blocks local file behaviour, run a tiny local server instead:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

You can also publish the repository with GitHub Pages because the app is just static HTML, CSS, and JavaScript.

## Use It In Google Colab

If you are new to the terminal, use the notebook:

[Open the GBIF TaxonLens quickstart notebook in Google Colab](https://colab.research.google.com/github/UKCEH-MolecularEcology/gbif-taxonlens/blob/main/notebooks/GBIF_TaxonLens_quickstart.ipynb)

The notebook lets you:

- use the included demo data
- upload your own CSV/TSV file
- run the matcher
- preview the output table
- download the matched CSV

## Matching Modes

The web app has three matching modes.

### GBIF live API

This is the default. Each row is sent to the public GBIF Species Match API.

Use this when you want current GBIF Backbone matches and GBIF usage keys.

### Local reference only

Upload a second CSV/TSV file as the **Local reference checklist** and select **Local reference only**.

TaxonLens will compare your input names against the uploaded reference file in the browser. It tries exact canonical matches first and then fuzzy local candidates. This is useful when you want a lightweight `gndiff`-style comparison against:

- a curated project checklist
- a pinned taxonomy export
- a downloaded GBIF Backbone subset
- a previous version of your own taxonomy table

This mode does not call GBIF.

### GBIF + local reference

This mode calls GBIF and also compares each input row against your uploaded local reference. It is useful when you want to see whether the current GBIF match agrees with a pinned or curated reference.

## Manual Column Mapping

After upload, TaxonLens guesses which columns contain names, ranks, and higher taxonomy. You can change these choices in the **Autodetected taxonomy** panel.

Use manual remapping when:

- your scientific-name column has an unusual heading
- your `Species` column contains only epithets, such as `robur`
- your genus and species are stored in separate columns
- your file has multiple possible ID columns

For DADA2-style files, TaxonLens can combine `Genus` and an epithet-style `Species` value into a binomial name.

## Review Drawer And Alternatives

Each result row has a **Details** button. It opens a review drawer showing:

- the matched name
- the GBIF or local identifier
- the accepted name, where available
- GBIF notes
- alternative GBIF or local candidates
- Wikidata identifier links, if cross-checking was enabled

Use this drawer to inspect fuzzy, higher-rank, aggregate, or unresolved matches before exporting.

## Wikidata Cross-Checking

Turn on **Cross-check matched GBIF IDs against Wikidata** before running a GBIF match.

For each matched GBIF ID, TaxonLens queries Wikidata for linked identifiers:

- GBIF taxon ID
- NCBI taxonomy ID, where available
- Wikidata item

This is a useful audit step when you want to link GBIF-based names to sequence databases or check whether community identifiers agree. Wikidata results should still be reviewed, especially for homonyms and synonyms.

When enabled, the results table shows a visible Wikidata status column and any linked NCBI taxonomy IDs. The same values are included in downloaded CSV exports.

## Location Plausibility Checking

Turn on **Location plausibility check** if your input file has latitude and longitude columns.

TaxonLens detects common coordinate columns such as:

- `decimalLatitude`
- `decimalLongitude`
- `latitude`
- `longitude`
- `lat`
- `lon`

After a GBIF taxon match is found, TaxonLens asks GBIF whether there are occurrence records for that taxon near the input coordinates. It applies simple quality filters:

- records must have coordinates
- records must not have GBIF geospatial issue flags
- occurrence status must be present
- records with very large coordinate uncertainty are filtered out
- fossil and living-specimen records are excluded from the nearby-record summary

The Details drawer shows an interactive map with:

- the input location
- 1, 5, 10 and 50 km radius rings
- nearby GBIF occurrence points returned by the API
- a small table of nearby records

TaxonLens also reports:

- nearest quality-filtered GBIF record
- records within 1, 5, 10 and 50 km
- most recent nearby record year
- a plausibility category: `High plausibility`, `Moderate plausibility`, `Low plausibility`, `No GBIF support`, or `Data deficient`

In the results table, use **Show location columns** to add the nearest-record distance, radius counts and most recent year to the main table.

When location checks have run, the app offers two extra downloads:

- **Download location CSV**: one row per input record, with plausibility score, nearest record, radius counts and most recent year.
- **Download occurrence CSV**: one row per nearby GBIF occurrence record used in the location check.

This is a plausibility check, not a definitive species distribution model. A “no nearby records” result may mean the species is genuinely unexpected, but it may also reflect gaps in GBIF occurrence data, sampling effort, taxonomic issues, or coordinate uncertainty.

## Use It From The Terminal

Run the demo checklist:

```bash
python3 cli/taxonlens.py examples/demo-checklist.csv --default-kingdom Plantae --out matched.csv
```

Run the location-check demo file:

```bash
python3 cli/taxonlens.py examples/location-check-demo.csv \
  --default-kingdom Plantae \
  --location-check \
  --out location-demo-matched.csv \
  --location-summary-out location-summary.csv \
  --occurrences-out nearby-occurrences.csv
```

This creates three files:

- `location-demo-matched.csv`: one row per input record, including taxonomy and location-summary columns
- `location-summary.csv`: one row per input record, focused on the location plausibility result
- `nearby-occurrences.csv`: one row per nearby GBIF occurrence record used by the location check

Run a DADA2-style taxonomy table:

```bash
python3 cli/taxonlens.py examples/dada2-taxonomy.csv --out dada2-matched.csv
```

Run your own file:

```bash
python3 cli/taxonlens.py my_taxonomy.csv --out matched.csv
```

If your scientific-name column has an unusual name, tell TaxonLens which column to use:

```bash
python3 cli/taxonlens.py my_taxonomy.csv --name-column taxon --out matched.csv
```

For a quick test on the first 100 rows:

```bash
python3 cli/taxonlens.py my_taxonomy.csv --limit 100 --out preview.csv
```

To slow down API calls:

```bash
python3 cli/taxonlens.py my_taxonomy.csv --sleep 0.1 --out matched.csv
```

## Input Files

TaxonLens accepts CSV and TSV files.

The simplest file has one name column:

```csv
scientificName
Quercus robur
Rosa canina
Saccharomyces cerevisiae
```

Matching is better if you also provide higher taxonomy:

```csv
id,scientificName,kingdom,family,taxonRank
1,Quercus robur,Plantae,Fagaceae,SPECIES
2,Rosa canina,Plantae,Rosaceae,SPECIES
3,Saccharomyces cerevisiae,Fungi,Saccharomycetaceae,SPECIES
```

TaxonLens recognises common column names including:

| Meaning | Example column names |
| --- | --- |
| Scientific name | `scientificName`, `scientific_name`, `taxon_name`, `name`, `species` |
| Rank | `taxonRank`, `rank` |
| Kingdom | `kingdom`, `Kingdom` |
| Phylum | `phylum`, `Phylum`, `division` |
| Class | `class`, `Class` |
| Order | `order`, `Order` |
| Family | `family`, `Family` |
| Genus | `genus`, `Genus` |
| Species epithet or species name | `species`, `Species` |
| Authorship | `scientificNameAuthorship`, `authorship`, `author` |
| Existing taxon ID | `taxonID`, `gbifID`, `usageKey` |

## DADA2 And ASV Taxonomy Tables

TaxonLens can read common DADA2 taxonomy outputs, including tables produced from `assignTaxonomy()` and similar ASV taxonomy workflows.

A typical DADA2 taxonomy table looks like this:

```csv
ASV,Kingdom,Phylum,Class,Order,Family,Genus,Species
ASV1,k__Plantae,p__Streptophyta,c__Magnoliopsida,o__Fagales,f__Fagaceae,g__Quercus,s__robur
ASV2,k__Fungi,p__Ascomycota,c__Saccharomycetes,o__Saccharomycetales,f__Saccharomycetaceae,g__Saccharomyces,s__cerevisiae
```

TaxonLens will:

- detect the rank columns
- remove prefixes such as `k__`, `p__`, `g__`, and `s__`
- combine `Genus` and an epithet-style `Species` value into a binomial name, for example `Quercus robur`
- pass higher taxonomy such as kingdom, family, and genus to GBIF to improve matching

If your DADA2 `Species` column already contains full names such as `Quercus robur`, TaxonLens will use the full name directly.

### Important Note For Amplicon Data

GBIF is a biodiversity taxonomy and occurrence-data infrastructure. It is not a sequence classifier. DADA2 outputs may contain:

- database-specific labels
- unresolved genus-only assignments
- environmental or uncultured labels
- species hypotheses that need manual checking

Treat TaxonLens results as a GBIF name-matching review table, not as proof that an ASV has been identified to species.

## Output Columns

Exports include:

```text
inputRow
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
source
wikidataStatus
wikidataNcbiIds
locationStatus
nearbyGbifOccurrenceCount
recordsWithin1Km
recordsWithin5Km
recordsWithin10Km
recordsWithin50Km
nearestGbifRecordKm
mostRecentNearbyGbifYear
localReferenceMatch
```

The most useful fields are usually:

- `inputRow`: the original row number in the processed input file
- `inputName`: the name TaxonLens sent to GBIF
- `matchedName`: the GBIF name returned
- `matchType`: how GBIF matched it
- `confidence`: GBIF confidence score
- `usageKey`: GBIF taxon identifier
- `acceptedUsageKey`: accepted GBIF taxon identifier, if the match is a synonym
- `source`: whether the result came from GBIF or a local reference file
- `wikidataStatus`: whether a Wikidata item was found for the matched GBIF ID
- `wikidataNcbiIds`: NCBI taxonomy IDs linked from Wikidata, if any
- `locationStatus`: whether nearby GBIF occurrence records were found
- `nearbyGbifOccurrenceCount`: number of GBIF records found within the location check radius
- `recordsWithin1Km`, `recordsWithin5Km`, `recordsWithin10Km`, `recordsWithin50Km`: quality-filtered nearby occurrence counts by radius
- `nearestGbifRecordKm`: distance to the nearest quality-filtered GBIF record
- `mostRecentNearbyGbifYear`: most recent year among nearby quality-filtered GBIF records
- `localReferenceMatch`: the local reference candidate, when local comparison was used

Every processed input row is included in the export. Unmatched rows are retained with `matchType` set to `NONE` and `status` set to `UNMATCHED` when no result can be returned.

## Match Types

GBIF may return:

| Match type | Meaning |
| --- | --- |
| `EXACT` | GBIF found a direct name match |
| `FUZZY` | GBIF found a likely match, but spelling or formatting differs |
| `HIGHERRANK` | GBIF could only match to a higher rank, such as genus or family |
| `AGGREGATE` | GBIF matched a broader species aggregate or complex |
| `NONE` | GBIF could not find a confident match |

Rows with `FUZZY`, `HIGHERRANK`, `AGGREGATE`, or `NONE` should usually be reviewed before downstream use.

## Tests

Run the Python tests:

```bash
python3 -m unittest discover -s tests -v
```

Check JavaScript syntax:

```bash
node --check app.js
```

The same checks run automatically in GitHub Actions.

## Deploying With GitHub Pages

1. Open the repository on GitHub.
2. Go to **Settings**.
3. Open **Pages**.
4. Choose the `main` branch.
5. Select the repository root as the source folder.
6. Save.

The `.nojekyll` file is included so GitHub Pages serves the static files directly.

## Project Layout

```text
.
├── index.html                  # Web app
├── styles.css                  # Styling
├── app.js                      # Browser parser and GBIF matching logic
├── cli/
│   └── taxonlens.py            # Command-line matcher
├── examples/
│   ├── demo-checklist.csv
│   ├── location-check-demo.csv
│   └── dada2-taxonomy.csv
├── tests/
│   └── test_cli.py
└── .github/workflows/tests.yml
```

## Roadmap

- More ASV-table examples.
- Better handling of genus-only and family-only assignments.
- CLI support for local reference comparison.
- Export of all alternative candidates, not only the selected match.
