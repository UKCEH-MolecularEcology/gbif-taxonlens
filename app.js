const state = {
  rows: [],
  headers: [],
  mapping: {},
  health: [],
  results: [],
  filter: "ALL",
  reference: {
    rows: [],
    headers: [],
    mapping: {},
    source: "",
  },
};

const editableFields = [
  "scientificName",
  "kingdom",
  "phylum",
  "class",
  "order",
  "family",
  "genus",
  "specificEpithet",
  "taxonRank",
  "authorship",
  "taxonID",
];

const aliases = {
  scientificName: [
    "scientificname",
    "scientific_name",
    "taxonname",
    "taxon_name",
    "species",
    "name",
    "verbatimscientificname",
  ],
  canonicalName: ["canonicalname", "canonical_name", "canonical"],
  authorship: [
    "scientificnameauthorship",
    "scientific_name_authorship",
    "authorship",
    "author",
    "authors",
  ],
  taxonID: ["taxonid", "taxon_id", "gbifid", "gbif_id", "gbifkey", "usagekey"],
  acceptedNameUsageID: ["acceptednameusageid", "accepted_taxon_id", "acceptedusagekey"],
  parentNameUsageID: ["parentnameusageid", "parent_taxon_id", "parentid", "parent_id"],
  taxonRank: ["taxonrank", "taxon_rank", "rank"],
  taxonomicStatus: ["taxonomicstatus", "taxonomic_status", "status"],
  kingdom: ["kingdom"],
  phylum: ["phylum", "division"],
  class: ["class", "classis"],
  order: ["order", "ordo"],
  family: ["family", "family_name"],
  genus: ["genus", "genericname", "generic_name"],
  specificEpithet: ["specificepithet", "specific_epithet", "epithet"],
  infraspecificEpithet: ["infraspecificepithet", "infra_epithet"],
};

const demoCsv = `id,scientificName,kingdom,family,taxonRank
1,Ficus variegata,Plantae,Moraceae,SPECIES
2,Rosa inodora,Plantae,Rosaceae,SPECIES
3,Ammophila arenaria,Plantae,Poaceae,SPECIES
4,Carex binervis,Plantae,Cyperaceae,SPECIES
5,Quercus robur,Plantae,Fagaceae,SPECIES`;

const els = {
  fileInput: document.querySelector("#fileInput"),
  dropZone: document.querySelector("#dropZone"),
  runButton: document.querySelector("#runButton"),
  demoButton: document.querySelector("#demoButton"),
  clearButton: document.querySelector("#clearButton"),
  downloadButton: document.querySelector("#downloadButton"),
  referenceInput: document.querySelector("#referenceInput"),
  referenceStatus: document.querySelector("#referenceStatus"),
  matchMode: document.querySelector("#matchMode"),
  wikidataCheck: document.querySelector("#wikidataCheck"),
  reviewDrawer: document.querySelector("#reviewDrawer"),
  drawerClose: document.querySelector("#drawerClose"),
  drawerContent: document.querySelector("#drawerContent"),
  mappingList: document.querySelector("#mappingList"),
  mappingHead: document.querySelector("#mappingHead"),
  detectSummary: document.querySelector("#detectSummary"),
  healthList: document.querySelector("#healthList"),
  schemaBadge: document.querySelector("#schemaBadge"),
  resultsBody: document.querySelector("#resultsBody"),
  defaultKingdom: document.querySelector("#defaultKingdom"),
  maxRows: document.querySelector("#maxRows"),
  previewStatus: document.querySelector("#previewStatus"),
  metricRows: document.querySelector("#metricRows"),
  metricMapped: document.querySelector("#metricMapped"),
  metricIssues: document.querySelector("#metricIssues"),
};

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
}

function splitDelimited(text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  return text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => parseLine(line, delimiter));
}

function parseLine(line, delimiter) {
  const cells = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }

  cells.push(value.trim());
  return cells;
}

function parseTable(text) {
  const matrix = splitDelimited(text);
  const headers = matrix[0] || [];
  const rows = matrix.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])),
  );

  return { headers, rows };
}

function detectMapping(headers, rows) {
  const normalized = headers.map((header) => ({
    raw: header,
    key: normalizeHeader(header),
  }));

  const mapping = {};
  Object.entries(aliases).forEach(([field, names]) => {
    const hit = normalized.find(({ key }) => names.includes(key));
    if (hit) mapping[field] = { column: hit.raw, confidence: "High" };
  });

  if (!mapping.scientificName) {
    const likely = headers.find((header) =>
      rows.slice(0, 12).some((row) => /^([A-Z][a-z-]+)\s+[a-z-]+/.test(row[header] || "")),
    );
    if (likely) mapping.scientificName = { column: likely, confidence: "Medium" };
  }

  return mapping;
}

function applyManualMapping(field, column) {
  if (!column) {
    delete state.mapping[field];
  } else {
    state.mapping[field] = { column, confidence: "Manual" };
  }
  state.health = healthCheck(state.rows, state.mapping);
  els.runButton.disabled = !state.mapping.scientificName && !state.mapping.genus;
  renderMapping();
}

function detectSchema(mapping) {
  if (
    mapping.kingdom &&
    mapping.phylum &&
    mapping.class &&
    mapping.order &&
    mapping.family &&
    mapping.genus
  ) {
    return "DADA2-style taxonomy table";
  }
  if (mapping.parentNameUsageID && mapping.taxonID) return "Taxonomy tree";
  if (mapping.acceptedNameUsageID || mapping.taxonomicStatus) return "Darwin Core checklist";
  if (mapping.taxonID && mapping.scientificName) return "Identifier-linked checklist";
  if (mapping.scientificName && Object.keys(mapping).length > 3) return "Classified name list";
  if (mapping.scientificName) return "Simple name list";
  return "Unknown";
}

function healthCheck(rows, mapping) {
  const health = [];
  const nameColumn = mapping.scientificName?.column;
  const idColumn = mapping.taxonID?.column;
  const parentColumn = mapping.parentNameUsageID?.column;

  if (!nameColumn) health.push("No scientific-name column was confidently detected.");
  if (nameColumn) {
    const names = rows.map((row) => row[nameColumn]).filter(Boolean);
    const duplicates = names.length - new Set(names.map((name) => name.toLowerCase())).size;
    if (duplicates > 0) health.push(`${duplicates} duplicate scientific-name values detected.`);
  }
  if (!mapping.family && !mapping.kingdom) {
    health.push("No higher taxonomy detected; homonym resolution may be weaker.");
  }
  if (!mapping.authorship) {
    health.push("No authorship column detected; author mismatches cannot be audited locally.");
  }
  if (idColumn && parentColumn) {
    const ids = new Set(rows.map((row) => row[idColumn]).filter(Boolean));
    const missingParents = rows.filter(
      (row) => row[parentColumn] && !ids.has(row[parentColumn]),
    ).length;
    if (missingParents > 0) health.push(`${missingParents} parent IDs are not present in the file.`);
  }

  return health;
}

function cleanTaxonValue(value) {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^[a-zA-Z]__/, "")
    .replace(/^uncultured\s+/i, "")
    .replace(/^unclassified\s+/i, "")
    .replace(/^unknown\s*/i, "")
    .trim();
}

function isBinomial(value) {
  return /^[A-Z][A-Za-z-]+(\s+[a-z][A-Za-z-]+){1,2}$/.test(value);
}

function getMappedValue(row, field) {
  return cleanTaxonValue(row[state.mapping[field]?.column]);
}

function scientificNameForRow(row) {
  const supplied = getMappedValue(row, "scientificName");
  const genus = getMappedValue(row, "genus");
  const specific = getMappedValue(row, "specificEpithet");

  if (supplied && isBinomial(supplied)) return supplied;
  if (genus && supplied && /^[a-z][A-Za-z-]+$/.test(supplied)) return `${genus} ${supplied}`;
  if (genus && specific) return `${genus} ${specific}`;
  return supplied || genus;
}

function renderMapping() {
  const fields = Object.entries(state.mapping);
  const schema = detectSchema(state.mapping);
  const hasName = Boolean(state.mapping.scientificName || state.mapping.genus);
  els.schemaBadge.textContent = schema;
  els.metricRows.textContent = state.rows.length;
  els.metricMapped.textContent = fields.length;
  els.metricIssues.textContent = state.health.length;
  els.mappingHead.hidden = fields.length === 0;

  if (!fields.length) {
    els.detectSummary.innerHTML = `
      <div>
        <span class="summary-kicker">Waiting for file</span>
        <strong>Upload or load the demo to inspect columns.</strong>
      </div>
      <span class="summary-status">Idle</span>
    `;
  } else {
    els.detectSummary.innerHTML = `
      <div>
        <span class="summary-kicker">${escapeHtml(schema)} detected</span>
        <strong>${state.rows.length} rows ready for GBIF matching.</strong>
      </div>
      <span class="summary-status ${hasName ? "ready" : "warning"}">
        ${hasName ? "Ready to match" : "Needs name column"}
      </span>
    `;
  }

  if (!fields.length) {
    els.mappingList.innerHTML = '<p class="empty">Upload a file to detect columns and taxonomy structure.</p>';
  } else {
    els.mappingList.innerHTML = editableFields
      .map(
        (field) => {
          const info = state.mapping[field] || {};
          return `
          <div class="mapping-row">
            <strong>${fieldLabel(field)}</strong>
            <select class="mapping-select" data-field="${field}">
              <option value="">Not used</option>
              ${state.headers
                .map(
                  (header) =>
                    `<option value="${escapeHtml(header)}" ${header === info.column ? "selected" : ""}>${escapeHtml(header)}</option>`,
                )
                .join("")}
            </select>
            <span class="confidence">${info.confidence || "Unset"}</span>
          </div>
        `;
        },
      )
      .join("");
  }

  document.querySelectorAll(".mapping-select").forEach((select) => {
    select.addEventListener("change", () => applyManualMapping(select.dataset.field, select.value));
  });

  els.healthList.innerHTML = state.health
    .map((item) => `<div class="health-item">${escapeHtml(item)}</div>`)
    .join("");
}

function fieldLabel(field) {
  const labels = {
    scientificName: "Scientific name",
    canonicalName: "Canonical name",
    authorship: "Authorship",
    taxonID: "Taxon ID",
    acceptedNameUsageID: "Accepted taxon ID",
    parentNameUsageID: "Parent taxon ID",
    taxonRank: "Taxon rank",
    taxonomicStatus: "Taxonomic status",
    kingdom: "Kingdom",
    phylum: "Phylum",
    class: "Class",
    order: "Order",
    family: "Family",
    genus: "Genus",
    specificEpithet: "Specific epithet",
    infraspecificEpithet: "Infraspecific epithet",
  };
  return labels[field] || field;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function handleFile(file) {
  const text = await file.text();
  loadText(text);
}

function loadText(text) {
  const parsed = parseTable(text);
  state.headers = parsed.headers;
  state.rows = parsed.rows;
  state.mapping = detectMapping(parsed.headers, parsed.rows);
  state.health = healthCheck(parsed.rows, state.mapping);
  state.results = [];
  els.runButton.disabled = !state.mapping.scientificName && !state.mapping.genus;
  els.clearButton.disabled = false;
  els.downloadButton.disabled = true;
  els.previewStatus.textContent = state.mapping.scientificName ? "Detected" : "Needs mapping";
  renderMapping();
  renderResults();
}

function updateRunButtonLabel() {
  const labels = {
    gbif: "Match with GBIF",
    local: "Compare locally",
    both: "Match GBIF + local",
  };
  els.runButton.textContent = labels[els.matchMode.value] || labels.gbif;
}

async function handleReferenceFile(file) {
  const text = await file.text();
  const parsed = parseTable(text);
  state.reference = {
    rows: parsed.rows,
    headers: parsed.headers,
    mapping: detectMapping(parsed.headers, parsed.rows),
    source: file.name,
  };
  els.referenceStatus.textContent = `${file.name}: ${parsed.rows.length} reference rows loaded.`;
}

function buildMatchParams(row) {
  const get = (field) => getMappedValue(row, field);
  const params = new URLSearchParams({
    name: scientificNameForRow(row),
    verbose: "true",
    strict: "false",
  });

  const rank = get("taxonRank");
  const kingdom = get("kingdom") || els.defaultKingdom.value;
  ["kingdom", "phylum", "class", "order", "family", "genus"].forEach((field) => {
    const value = field === "kingdom" ? kingdom : get(field);
    if (value) params.set(field, value);
  });
  if (rank) params.set("rank", rank.toUpperCase());

  return params;
}

async function runMatching() {
  const maxRows = Number(els.maxRows.value || 250);
  const rows = state.rows.slice(0, maxRows);
  const mode = els.matchMode.value;
  if ((mode === "local" || mode === "both") && !state.reference.rows.length) {
    els.previewStatus.textContent = "Need reference";
    els.referenceStatus.textContent = "Upload a local reference checklist before using this mode.";
    return;
  }
  state.results = [];
  els.runButton.disabled = true;
  els.previewStatus.textContent = mode === "local" ? "Comparing" : "Matching";

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    let result;
    try {
      if (mode === "local") {
        result = formatLocalResult(row, matchLocalReference(row), index + 1);
      } else {
        const params = buildMatchParams(row);
        const response = await fetch(`https://api.gbif.org/v1/species/match?${params.toString()}`);
        if (!response.ok) throw new Error(`GBIF request failed: ${response.status}`);
        const match = await response.json();
        result = formatResult(row, match, index + 1);
        result.alternatives = await fetchGbifAlternatives(result);
        if (mode === "both") result.localMatch = matchLocalReference(row);
        if (els.wikidataCheck.checked && result.usageKey) {
          result.wikidata = await fetchWikidataLinks(result.usageKey);
        }
      }
    } catch (error) {
      result = formatUnmatchedResult(row, index + 1, error.message);
    }
    state.results.push(result);
    els.previewStatus.textContent = `${index + 1}/${rows.length}`;
    renderResults();
  }

  els.previewStatus.textContent = "Complete";
  els.runButton.disabled = false;
  els.downloadButton.disabled = state.results.length === 0;
}

function baseResult(row, rowNumber) {
  const inputName = scientificNameForRow(row);
  return {
    inputRow: rowNumber,
    inputName,
    originalValues: row,
  };
}

function formatResult(row, match, rowNumber) {
  return {
    ...baseResult(row, rowNumber),
    matchedName: match.scientificName || "",
    canonicalName: match.canonicalName || "",
    matchType: match.matchType || "NONE",
    confidence: match.confidence ?? "",
    status: match.status || "",
    rank: match.rank || "",
    usageKey: match.usageKey || "",
    acceptedUsageKey: match.acceptedUsageKey || "",
    acceptedScientificName: match.acceptedScientificName || "",
    kingdom: match.kingdom || "",
    family: match.family || "",
    note: match.note || "",
    source: "GBIF",
    alternatives: match.alternatives || match.alternativeMatches || [],
    wikidata: null,
    localMatch: null,
  };
}

function formatLocalResult(row, localMatch, rowNumber) {
  return {
    ...baseResult(row, rowNumber),
    matchedName: localMatch?.name || "",
    canonicalName: localMatch?.canonical || "",
    matchType: localMatch?.matchType || "NONE",
    confidence: localMatch?.confidence ?? 0,
    status: localMatch?.status || "",
    rank: localMatch?.rank || "",
    usageKey: localMatch?.taxonID || "",
    acceptedUsageKey: "",
    acceptedScientificName: "",
    kingdom: localMatch?.kingdom || "",
    family: localMatch?.family || "",
    note: localMatch ? `Local reference: ${state.reference.source}` : "No local reference match",
    source: "Local reference",
    alternatives: localMatch?.alternatives || [],
    wikidata: null,
    localMatch,
  };
}

function formatUnmatchedResult(row, rowNumber, note = "No match returned") {
  return {
    ...baseResult(row, rowNumber),
    matchedName: "",
    canonicalName: "",
    matchType: "NONE",
    confidence: 0,
    status: "UNMATCHED",
    rank: "",
    usageKey: "",
    acceptedUsageKey: "",
    acceptedScientificName: "",
    kingdom: "",
    family: "",
    note,
    source: "Unmatched",
    alternatives: [],
    wikidata: null,
    localMatch: null,
  };
}

function canonicalizeName(value) {
  return cleanTaxonValue(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      matrix[i][j] =
        b[i - 1] === a[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

function referenceNameForRow(row, mapping) {
  const previous = state.mapping;
  state.mapping = mapping;
  const name = scientificNameForRow(row);
  state.mapping = previous;
  return name;
}

function matchLocalReference(row) {
  if (!state.reference.rows.length) return null;
  const query = canonicalizeName(scientificNameForRow(row));
  if (!query) return null;
  const candidates = state.reference.rows
    .map((refRow) => {
      const name = referenceNameForRow(refRow, state.reference.mapping);
      const canonical = canonicalizeName(name);
      const distance = levenshtein(query, canonical);
      const maxLength = Math.max(query.length, canonical.length, 1);
      const confidence = Math.max(0, Math.round((1 - distance / maxLength) * 100));
      return { row: refRow, name, canonical, distance, confidence };
    })
    .filter((candidate) => candidate.name)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
  const best = candidates[0];
  if (!best || best.confidence < 72) return null;
  const mapping = state.reference.mapping;
  return {
    name: best.name,
    canonical: best.canonical,
    confidence: best.confidence,
    matchType: best.confidence === 100 ? "EXACT" : "FUZZY",
    taxonID: cleanTaxonValue(best.row[mapping.taxonID?.column]),
    status: cleanTaxonValue(best.row[mapping.taxonomicStatus?.column]),
    rank: cleanTaxonValue(best.row[mapping.taxonRank?.column]),
    kingdom: cleanTaxonValue(best.row[mapping.kingdom?.column]),
    family: cleanTaxonValue(best.row[mapping.family?.column]),
    alternatives: candidates.slice(1),
  };
}

async function fetchGbifAlternatives(result) {
  if (!result.inputName || result.matchType === "EXACT") return [];
  const params = new URLSearchParams({ q: result.inputName, limit: "5" });
  const response = await fetch(`https://api.gbif.org/v1/species/suggest?${params.toString()}`);
  if (!response.ok) return [];
  return response.json();
}

async function fetchWikidataLinks(gbifId) {
  const query = `
    SELECT ?item ?itemLabel ?gbif ?ncbi WHERE {
      ?item wdt:P846 "${gbifId}".
      OPTIONAL { ?item wdt:P846 ?gbif. }
      OPTIONAL { ?item wdt:P685 ?ncbi. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } LIMIT 5
  `;
  const params = new URLSearchParams({ query, format: "json" });
  const response = await fetch(`https://query.wikidata.org/sparql?${params.toString()}`, {
    headers: { Accept: "application/sparql-results+json" },
  });
  if (!response.ok) return { status: "Unavailable", links: [] };
  const data = await response.json();
  return {
    status: data.results.bindings.length ? "Linked" : "No Wikidata GBIF link",
    links: data.results.bindings.map((binding) => ({
      item: binding.item?.value || "",
      label: binding.itemLabel?.value || "",
      gbif: binding.gbif?.value || "",
      ncbi: binding.ncbi?.value || "",
    })),
  };
}

function renderResults() {
  const rows = state.results.filter(
    (result) => state.filter === "ALL" || result.matchType === state.filter,
  );

  if (!rows.length) {
    els.resultsBody.innerHTML = '<tr><td colspan="10" class="empty-cell">No matches yet.</td></tr>';
    return;
  }

  els.resultsBody.innerHTML = rows
    .map(
      (row) => `
        <tr title="${escapeHtml(row.note)}">
          <td>${escapeHtml(row.inputName)}</td>
          <td>${escapeHtml(row.matchedName || row.acceptedScientificName)}</td>
          <td><span class="tag ${row.matchType}">${escapeHtml(row.matchType)}</span></td>
          <td>${escapeHtml(row.confidence)}</td>
          <td>${escapeHtml(row.status)}</td>
          <td>${escapeHtml(row.rank)}</td>
          <td>${escapeHtml(row.usageKey)}</td>
          <td>${wikidataBadge(row)}</td>
          <td>${escapeHtml(ncbiIds(row) || "-")}</td>
          <td><button class="button secondary mini review-button" data-name="${escapeHtml(row.inputName)}">Details</button></td>
        </tr>
      `,
    )
    .join("");

  document.querySelectorAll(".review-button").forEach((button) => {
    button.addEventListener("click", () => {
      const result = state.results.find((item) => item.inputName === button.dataset.name);
      if (result) openReviewDrawer(result);
    });
  });
}

function ncbiIds(row) {
  return (row.wikidata?.links || []).map((item) => item.ncbi).filter(Boolean).join(", ");
}

function wikidataBadge(row) {
  if (!els.wikidataCheck.checked && !row.wikidata) return '<span class="status-pill muted">Not checked</span>';
  const status = row.wikidata?.status || "Not checked";
  const linked = status === "Linked";
  return `<span class="status-pill ${linked ? "linked" : "muted"}">${escapeHtml(status)}</span>`;
}

function openReviewDrawer(result) {
  const alternatives = result.alternatives || [];
  const wikidataLinks = result.wikidata?.links || [];
  els.drawerContent.innerHTML = `
    <h3>${escapeHtml(result.inputName)}</h3>
    <p class="drawer-muted">${escapeHtml(result.source || "GBIF")} result: ${escapeHtml(result.matchType)} (${escapeHtml(result.confidence)})</p>
    <dl class="detail-list">
      <dt>Matched name</dt><dd>${escapeHtml(result.matchedName || "No match")}</dd>
      <dt>GBIF/local ID</dt><dd>${escapeHtml(result.usageKey || "None")}</dd>
      <dt>Accepted name</dt><dd>${escapeHtml(result.acceptedScientificName || "Not supplied")}</dd>
      <dt>Note</dt><dd>${escapeHtml(result.note || "None")}</dd>
      <dt>Local reference</dt><dd>${result.localMatch ? `${escapeHtml(result.localMatch.name)} (${result.localMatch.confidence})` : "Not used or no match"}</dd>
      <dt>Wikidata</dt><dd>${escapeHtml(result.wikidata?.status || "Not checked")}</dd>
    </dl>
    <h4>Alternative candidates</h4>
    ${alternatives.length ? `<ul class="candidate-list">${alternatives
      .map((item) => `<li>${escapeHtml(item.scientificName || item.name || "")} ${item.key || item.usageKey ? `<span>${escapeHtml(item.key || item.usageKey)}</span>` : ""}</li>`)
      .join("")}</ul>` : '<p class="drawer-muted">No alternatives returned.</p>'}
    <h4>Wikidata identifiers</h4>
    ${wikidataLinks.length ? `<ul class="candidate-list">${wikidataLinks
      .map((item) => `<li><a href="${escapeHtml(item.item)}" target="_blank" rel="noreferrer">${escapeHtml(item.label || item.item)}</a><span>GBIF ${escapeHtml(item.gbif || "-")} / NCBI ${escapeHtml(item.ncbi || "-")}</span></li>`)
      .join("")}</ul>` : '<p class="drawer-muted">No Wikidata links available.</p>'}
  `;
  els.reviewDrawer.classList.add("open");
  els.reviewDrawer.setAttribute("aria-hidden", "false");
}

function downloadCsv() {
  const headers = [
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
    "localReferenceMatch",
  ];
  const lines = [
    headers.join(","),
    ...state.results.map((row) =>
      headers
        .map((field) => {
          const value =
            field === "wikidataStatus"
              ? row.wikidata?.status || ""
              : field === "wikidataNcbiIds"
                ? (row.wikidata?.links || []).map((item) => item.ncbi).filter(Boolean).join("|")
                : field === "localReferenceMatch"
                  ? row.localMatch?.name || ""
                  : row[field];
          return JSON.stringify(String(value ?? ""));
        })
        .join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "gbif-taxonlens-results.csv";
  link.click();
  URL.revokeObjectURL(url);
}

els.fileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) handleFile(file);
});

els.referenceInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) handleReferenceFile(file);
});

["dragenter", "dragover"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("dragging");
  });
});

els.dropZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files?.[0];
  if (file) handleFile(file);
});

els.demoButton.addEventListener("click", () => loadText(demoCsv));
els.runButton.addEventListener("click", runMatching);
els.downloadButton.addEventListener("click", downloadCsv);
els.matchMode.addEventListener("change", updateRunButtonLabel);
els.drawerClose.addEventListener("click", () => {
  els.reviewDrawer.classList.remove("open");
  els.reviewDrawer.setAttribute("aria-hidden", "true");
});
els.clearButton.addEventListener("click", () => {
  state.rows = [];
  state.headers = [];
  state.mapping = {};
  state.health = [];
  state.results = [];
  state.reference = { rows: [], headers: [], mapping: {}, source: "" };
  els.fileInput.value = "";
  els.referenceInput.value = "";
  els.runButton.disabled = true;
  els.clearButton.disabled = true;
  els.downloadButton.disabled = true;
  els.previewStatus.textContent = "Ready";
  els.referenceStatus.textContent =
    "Optional: upload a pinned GBIF Backbone extract, curated checklist, or second taxonomy table.";
  renderMapping();
  renderResults();
});

updateRunButtonLabel();

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((item) => item.classList.remove("active"));
    chip.classList.add("active");
    state.filter = chip.dataset.filter;
    renderResults();
  });
});
