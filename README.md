# GBIF TaxonLens

GBIF TaxonLens helps you check taxonomy names against the GBIF Backbone Taxonomy.

It is designed for people working with biodiversity, metabarcoding, amplicon, checklist, or species-list data who want a quick way to ask:

- Which names match GBIF exactly?
- Which names only match fuzzily?
- Which names match only to a higher rank?
- Which names need manual review?
- Which GBIF taxon IDs should I carry into downstream analyses?

You can use it in two ways:

- **Web app:** upload a CSV/TSV file in your browser.
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

## Use It From The Terminal

Run the demo checklist:

```bash
python3 cli/taxonlens.py examples/demo-checklist.csv --default-kingdom Plantae --out matched.csv
```

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

The most useful fields are usually:

- `inputName`: the name TaxonLens sent to GBIF
- `matchedName`: the GBIF name returned
- `matchType`: how GBIF matched it
- `confidence`: GBIF confidence score
- `usageKey`: GBIF taxon identifier
- `acceptedUsageKey`: accepted GBIF taxon identifier, if the match is a synonym

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
│   └── dada2-taxonomy.csv
├── tests/
│   └── test_cli.py
└── .github/workflows/tests.yml
```

## Roadmap

- Manual column remapping in the web app.
- More ASV-table examples.
- Better handling of genus-only and family-only assignments.
- GBIF alternatives drawer for uncertain matches.
- Wikidata and NCBI identifier cross-checking.
- Offline matching against pinned taxonomy releases.
