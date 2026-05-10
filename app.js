const state = {
  rows: [],
  headers: [],
  mapping: {},
  health: [],
  results: [],
  filter: "ALL",
};

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
  const hasName = Boolean(state.mapping.scientificName);
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
    els.mappingList.innerHTML = fields
      .map(
        ([field, info]) => `
          <div class="mapping-row">
            <strong>${fieldLabel(field)}</strong>
            <code>${escapeHtml(info.column)}</code>
            <span class="confidence">${info.confidence}</span>
          </div>
        `,
      )
      .join("");
  }

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
  els.runButton.disabled = !state.mapping.scientificName;
  els.clearButton.disabled = false;
  els.downloadButton.disabled = true;
  els.previewStatus.textContent = state.mapping.scientificName ? "Detected" : "Needs mapping";
  renderMapping();
  renderResults();
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
  state.results = [];
  els.runButton.disabled = true;
  els.previewStatus.textContent = "Matching";

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const params = buildMatchParams(row);
    const response = await fetch(`https://api.gbif.org/v1/species/match?${params.toString()}`);
    const match = await response.json();
    state.results.push(formatResult(row, match));
    els.previewStatus.textContent = `${index + 1}/${rows.length}`;
    renderResults();
  }

  els.previewStatus.textContent = "Complete";
  els.runButton.disabled = false;
  els.downloadButton.disabled = state.results.length === 0;
}

function formatResult(row, match) {
  const inputName = scientificNameForRow(row);
  return {
    inputName,
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
  };
}

function renderResults() {
  const rows = state.results.filter(
    (result) => state.filter === "ALL" || result.matchType === state.filter,
  );

  if (!rows.length) {
    els.resultsBody.innerHTML = '<tr><td colspan="7" class="empty-cell">No matches yet.</td></tr>';
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
        </tr>
      `,
    )
    .join("");
}

function downloadCsv() {
  const headers = [
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
  ];
  const lines = [
    headers.join(","),
    ...state.results.map((row) =>
      headers.map((field) => JSON.stringify(String(row[field] ?? ""))).join(","),
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
els.clearButton.addEventListener("click", () => {
  state.rows = [];
  state.headers = [];
  state.mapping = {};
  state.health = [];
  state.results = [];
  els.fileInput.value = "";
  els.runButton.disabled = true;
  els.clearButton.disabled = true;
  els.downloadButton.disabled = true;
  els.previewStatus.textContent = "Ready";
  renderMapping();
  renderResults();
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((item) => item.classList.remove("active"));
    chip.classList.add("active");
    state.filter = chip.dataset.filter;
    renderResults();
  });
});
