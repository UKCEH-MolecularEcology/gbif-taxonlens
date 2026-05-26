// GBIF TaxonLens - Core Application Logic (Interactive Dashboard Edition)

const state = {
  rows: [],
  headers: [],
  mapping: {},
  health: [],
  results: [],
  filter: "ALL",
  searchQuery: "",
  reference: {
    rows: [],
    headers: [],
    mapping: {},
    source: "",
  },
};

const CACHE_PREFIX = "gbifTaxonLens";
const CACHE_LIMIT = 2500;
const GBIF_CONCURRENCY = 8;
const ENRICHMENT_CONCURRENCY = 4;

const caches = {
  gbifMatch: loadCache("gbifMatch.v1"),
  gbifAlternatives: loadCache("gbifAlternatives.v1"),
  wikidata: loadCache("wikidata.v1"),
  location: loadCache("location.v1"),
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
  "decimalLatitude",
  "decimalLongitude",
  "country",
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
  decimalLatitude: ["decimallatitude", "decimal_latitude", "latitude", "lat"],
  decimalLongitude: ["decimallongitude", "decimal_longitude", "longitude", "lon", "lng", "long"],
  country: ["country", "countrycode", "country_code"],
};

const demoCsv = `id,scientificName,kingdom,family,taxonRank,decimalLatitude,decimalLongitude
1,Ficus variegata,Plantae,Moraceae,SPECIES,51.5074,-0.1278
2,Rosa inodora,Plantae,Rosaceae,SPECIES,52.2053,0.1218
3,Ammophila arenaria,Plantae,Poaceae,SPECIES,50.7192,-1.8808
4,Carex binervis,Plantae,Cyperaceae,SPECIES,54.5973,-5.9301
5,Quercus robur,Plantae,Fagaceae,SPECIES,51.7520,-1.2577`;

// Element DOM References
const els = {
  fileInput: document.querySelector("#fileInput"),
  dropZone: document.querySelector("#dropZone"),
  runButton: document.querySelector("#runButton"),
  demoButton: document.querySelector("#demoButton"),
  clearButton: document.querySelector("#clearButton"),
  downloadButton: document.querySelector("#downloadButton"),
  downloadLocationButton: document.querySelector("#downloadLocationButton"),
  downloadOccurrencesButton: document.querySelector("#downloadOccurrencesButton"),
  showLocationColumns: document.querySelector("#showLocationColumns"),
  referenceInput: document.querySelector("#referenceInput"),
  referenceStatus: document.querySelector("#referenceStatus"),
  matchMode: document.querySelector("#matchMode"),
  wikidataCheck: document.querySelector("#wikidataCheck"),
  locationCheck: document.querySelector("#locationCheck"),
  progressWrap: document.querySelector("#progressWrap"),
  progressBar: document.querySelector("#progressBar"),
  progressLabel: document.querySelector("#progressLabel"),
  progressCount: document.querySelector("#progressCount"),
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
  
  // New Dashboard Element References
  dashKpiTotal: document.querySelector("#dashKpiTotal"),
  dashKpiMatchRate: document.querySelector("#dashKpiMatchRate"),
  dashKpiSpatial: document.querySelector("#dashKpiSpatial"),
  dashKpiWikidata: document.querySelector("#dashKpiWikidata"),
  dashboardHealthLog: document.querySelector("#dashboardHealthLog"),
  tableSearchQuery: document.querySelector("#tableSearchQuery"),
  mapPlotCounter: document.querySelector("#mapPlotCounter"),
  mapLayerSelect: document.querySelector("#mapLayerSelect"),
  mapResetViewBtn: document.querySelector("#mapResetViewBtn"),

  // Advanced Schema Mapper Elements
  openMapperBtn: document.querySelector("#openMapperBtn"),
  mappingModal: document.querySelector("#mappingModal"),
  modalClose: document.querySelector("#modalClose"),
  modalApplyBtn: document.querySelector("#modalApplyBtn"),
  autoMapBtn: document.querySelector("#autoMapBtn"),
  clearMapBtn: document.querySelector("#clearMapBtn"),
  mapperSearch: document.querySelector("#mapperSearch"),
  mapperAccordion: document.querySelector("#mapperAccordion"),
  modalPreviewTable: document.querySelector("#modalPreviewTable"),
  modalStatusMsg: document.querySelector("#modalStatusMsg"),
  modalHealthList: document.querySelector("#modalHealthList")
};

// Global Map instances and Chart references
let globalMap = null;
let globalMarkerGroup = null;
let activeMapThemeLayer = null;
let matchTypeChartInstance = null;
let confidenceChartInstance = null;

const mapTileProviders = {
  light: L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }),
  dark: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }),
  satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
  })
};

// Functions

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
  updateDashboardHealthLog();

  // Sync to Advanced Mapper Modal if open
  if (els.mappingModal && !els.mappingModal.hidden) {
    updateModalFieldPreviewText(field, column);
    renderModalPreviewTable();
    updateModalStatusAndChecklist();
  }
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
  if (mapping.decimalLatitude && !mapping.decimalLongitude) {
    health.push("Latitude detected without longitude; location checks need both coordinates.");
  }
  if (mapping.decimalLongitude && !mapping.decimalLatitude) {
    health.push("Longitude detected without latitude; location checks need both coordinates.");
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

function locationForRow(row) {
  const lat = Number.parseFloat(getMappedValue(row, "decimalLatitude"));
  const lon = Number.parseFloat(getMappedValue(row, "decimalLongitude"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
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
      <div class="detect-text">
        <strong>Pending Upload</strong>
        <small>Upload a file to detect column structure.</small>
      </div>
    `;
  } else {
    els.detectSummary.innerHTML = `
      <div class="detect-text">
        <strong>${escapeHtml(schema)} detected</strong>
        <small>${state.rows.length} rows ready for matching.</small>
      </div>
    `;
  }

  if (!fields.length) {
    els.mappingList.innerHTML = '<p class="empty-mapping">Upload a file to detect columns and taxonomy structure.</p>';
  } else {
    els.mappingList.innerHTML = editableFields
      .map(
        (field) => {
          const info = state.mapping[field] || {};
          const isSelected = info.column ? "Manual" : "Unset";
          const confClass = info.confidence ? info.confidence.toLowerCase() : "unset";
          return `
          <div class="mapping-row">
            <div class="mapping-row-meta">
              <strong>${fieldLabel(field)}</strong>
              <span class="confidence-tag ${confClass}">${info.confidence || "Unset"}</span>
            </div>
            <select class="mapping-select" data-field="${field}">
              <option value="">Not used</option>
              ${state.headers
                .map(
                  (header) =>
                    `<option value="${escapeHtml(header)}" ${header === info.column ? "selected" : ""}>${escapeHtml(header)}</option>`,
                )
                .join("")}
            </select>
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
    .map((item) => `<div class="health-item"><i data-lucide="alert-triangle"></i> ${escapeHtml(item)}</div>`)
    .join("");
    
  lucide.createIcons();
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
    decimalLatitude: "Latitude",
    decimalLongitude: "Longitude",
    country: "Country",
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

function loadCache(name) {
  try {
    return JSON.parse(localStorage.getItem(`${CACHE_PREFIX}.${name}`) || "{}");
  } catch {
    return {};
  }
}

function saveCache(name, cache) {
  const entries = Object.entries(cache);
  const trimmed = Object.fromEntries(entries.slice(Math.max(0, entries.length - CACHE_LIMIT)));
  Object.keys(cache).forEach((key) => {
    delete cache[key];
  });
  Object.assign(cache, trimmed);
  try {
    localStorage.setItem(`${CACHE_PREFIX}.${name}`, JSON.stringify(cache));
  } catch {
    // Fallback for full localstorage
  }
}

function cacheGet(cache, key) {
  return cache[key] ? JSON.parse(JSON.stringify(cache[key])) : null;
}

function cacheSet(name, cache, key, value) {
  cache[key] = JSON.parse(JSON.stringify(value));
  saveCache(name, cache);
}

async function runQueue(items, concurrency, worker, onDone) {
  let cursor = 0;
  let done = 0;
  const workerCount = Math.min(concurrency, items.length || 1);
  async function next() {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await worker(item);
      done += 1;
      onDone?.(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: workerCount }, next));
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
  els.openMapperBtn.disabled = false;
  els.downloadButton.disabled = true;
  els.downloadLocationButton.disabled = true;
  els.downloadOccurrencesButton.disabled = true;
  els.previewStatus.textContent = state.mapping.scientificName ? "Detected" : "Needs mapping";
  els.progressWrap.hidden = true;
  els.progressBar.style.width = "0";
  
  renderMapping();
  renderResults();
  updateDashboardKPIs();
  updateDashboardHealthLog();
  renderDashboardCharts();
  renderGlobalMap();
}

function updateRunButtonLabel() {
  const labels = {
    gbif: "Match with GBIF",
    local: "Compare locally",
    both: "Match GBIF + local",
  };
  els.runButton.innerHTML = `<i data-lucide="play"></i> ` + (labels[els.matchMode.value] || labels.gbif);
  lucide.createIcons();
}

function updateProgress(done, total, label = "Matching") {
  const percent = total ? Math.round((done / total) * 100) : 0;
  els.progressWrap.hidden = false;
  els.progressLabel.textContent = label;
  els.progressCount.textContent = `${done}/${total} · ${percent}%`;
  els.progressBar.style.width = `${percent}%`;
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

function matchCacheKey(row) {
  return buildMatchParams(row).toString();
}

async function fetchGbifMatchCached(row) {
  const key = matchCacheKey(row);
  const cached = cacheGet(caches.gbifMatch, key);
  if (cached) return { match: cached, cached: true };
  const params = buildMatchParams(row);
  const response = await fetch(`https://api.gbif.org/v1/species/match?${params.toString()}`);
  if (!response.ok) throw new Error(`GBIF request failed: ${response.status}`);
  const match = await response.json();
  cacheSet("gbifMatch.v1", caches.gbifMatch, key, match);
  return { match, cached: false };
}

async function fetchGbifAlternativesCached(result) {
  if (!result.inputName || result.matchType === "EXACT") return [];
  const key = result.inputName.toLowerCase();
  const cached = cacheGet(caches.gbifAlternatives, key);
  if (cached) return cached;
  const alternatives = await fetchGbifAlternatives(result);
  cacheSet("gbifAlternatives.v1", caches.gbifAlternatives, key, alternatives);
  return alternatives;
}

async function fetchWikidataLinksCached(gbifId) {
  const key = String(gbifId);
  const cached = cacheGet(caches.wikidata, key);
  if (cached) return cached;
  const links = await fetchWikidataLinks(gbifId);
  cacheSet("wikidata.v1", caches.wikidata, key, links);
  return links;
}

function locationCacheKey(result, location) {
  if (!location) return `${result.usageKey || result.acceptedUsageKey || "none"}:no-coordinates`;
  return `${result.usageKey || result.acceptedUsageKey}:${location.lat.toFixed(5)},${location.lon.toFixed(5)}`;
}

async function fetchLocationCheckCached(result, location) {
  const key = locationCacheKey(result, location);
  const cached = cacheGet(caches.location, key);
  if (cached) return cached;
  const check = await fetchLocationCheck(result, location);
  cacheSet("location.v1", caches.location, key, check);
  return check;
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

  if (mode === "local") {
    updateProgress(0, rows.length, "Comparing local reference");
    state.results = rows.map((row, index) => formatLocalResult(row, matchLocalReference(row), index + 1));
    updateProgress(rows.length, rows.length, "Comparing local reference");
    
    // UI refreshes
    renderResults();
    updateDashboardKPIs();
    updateDashboardHealthLog();
    renderDashboardCharts();
    renderGlobalMap();
  } else {
    const uniqueMatches = Array.from(
      rows
        .reduce((map, row) => {
          const key = matchCacheKey(row);
          if (!map.has(key)) map.set(key, row);
          return map;
        }, new Map())
        .entries(),
    ).map(([key, row]) => ({ key, row }));
    const matchLookup = new Map();
    let cachedMatches = 0;
    updateProgress(
      0,
      uniqueMatches.length,
      `Checking ${uniqueMatches.length} unique taxonomy queries`,
    );

    await runQueue(
      uniqueMatches,
      GBIF_CONCURRENCY,
      async (item) => {
        try {
          const { match, cached } = await fetchGbifMatchCached(item.row);
          if (cached) cachedMatches += 1;
          matchLookup.set(item.key, { match });
        } catch (error) {
          matchLookup.set(item.key, { error });
        }
      },
      (done, total) => {
        els.previewStatus.textContent = `${done}/${total} unique`;
        const cacheText = cachedMatches ? `, ${cachedMatches} cached` : "";
        updateProgress(done, total, `Checking unique taxonomy queries${cacheText}`);
      },
    );

    state.results = rows.map((row, index) => {
      const outcome = matchLookup.get(matchCacheKey(row));
      if (!outcome || outcome.error) {
        return formatUnmatchedResult(row, index + 1, outcome?.error?.message || "GBIF request failed");
      }
      const result = formatResult(row, outcome.match, index + 1);
      if (mode === "both") result.localMatch = matchLocalReference(row);
      return result;
    });

    renderResults();
    updateDashboardKPIs();
    updateDashboardHealthLog();
    renderDashboardCharts();
    renderGlobalMap();

    await enrichResults(rows);
  }

  els.previewStatus.textContent = "Complete";
  els.runButton.disabled = false;
  els.downloadButton.disabled = state.results.length === 0;
  const hasLocationResults = state.results.some((result) => result.locationCheck);
  const hasOccurrenceResults = state.results.some((result) => (result.locationCheck?.records || []).length);
  els.downloadLocationButton.disabled = !hasLocationResults;
  els.downloadOccurrencesButton.disabled = !hasOccurrenceResults;
}

async function enrichResults(rows) {
  const enrichmentTasks = [];
  const alternativesByName = new Map();
  const wikidataByUsageKey = new Map();
  const locationByKey = new Map();

  state.results.forEach((result, index) => {
    if (result.matchType !== "EXACT" && result.inputName && !alternativesByName.has(result.inputName)) {
      alternativesByName.set(result.inputName, result);
      enrichmentTasks.push({ type: "alternatives", key: result.inputName, result });
    }
    if (els.wikidataCheck.checked && result.usageKey && !wikidataByUsageKey.has(result.usageKey)) {
      wikidataByUsageKey.set(result.usageKey, result);
      enrichmentTasks.push({ type: "wikidata", key: result.usageKey, result });
    }
    if (els.locationCheck.checked && result.usageKey) {
      const location = locationForRow(rows[index]);
      const key = locationCacheKey(result, location);
      if (!locationByKey.has(key)) {
        locationByKey.set(key, { result, location });
        enrichmentTasks.push({ type: "location", key, result, location });
      }
    }
  });

  if (!enrichmentTasks.length) return;
  const enrichmentResults = new Map();
  updateProgress(0, enrichmentTasks.length, "Adding details");

  await runQueue(
    enrichmentTasks,
    ENRICHMENT_CONCURRENCY,
    async (task) => {
      try {
        if (task.type === "alternatives") {
          enrichmentResults.set(`alternatives:${task.key}`, await fetchGbifAlternativesCached(task.result));
        }
        if (task.type === "wikidata") {
          enrichmentResults.set(`wikidata:${task.key}`, await fetchWikidataLinksCached(task.key));
        }
        if (task.type === "location") {
          enrichmentResults.set(`location:${task.key}`, await fetchLocationCheckCached(task.result, task.location));
        }
      } catch {
        if (task.type === "alternatives") enrichmentResults.set(`alternatives:${task.key}`, []);
        if (task.type === "wikidata") enrichmentResults.set(`wikidata:${task.key}`, { status: "Unavailable", links: [] });
        if (task.type === "location") enrichmentResults.set(`location:${task.key}`, { status: "Unavailable", count: 0, records: [], location: task.location });
      }
    },
    (done, total) => {
      els.previewStatus.textContent = `${done}/${total} details`;
      updateProgress(done, total, "Adding details");
    },
  );

  state.results = state.results.map((result, index) => {
    const location = locationForRow(rows[index]);
    const locationKey = locationCacheKey(result, location);
    return {
      ...result,
      alternatives: enrichmentResults.get(`alternatives:${result.inputName}`) || result.alternatives || [],
      wikidata: result.usageKey ? enrichmentResults.get(`wikidata:${result.usageKey}`) || result.wikidata : result.wikidata,
      locationCheck: result.usageKey ? enrichmentResults.get(`location:${locationKey}`) || result.locationCheck : result.locationCheck,
    };
  });

  renderResults();
  updateDashboardKPIs();
  updateDashboardHealthLog();
  renderDashboardCharts();
  renderGlobalMap();
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
    locationCheck: null,
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
    locationCheck: null,
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
    locationCheck: null,
  };
}

function locationPolygon({ lat, lon }, radiusKm = 50) {
  const latDelta = radiusKm / 111.32;
  const lonDelta = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180) || 1);
  const west = lon - lonDelta;
  const east = lon + lonDelta;
  const south = lat - latDelta;
  const north = lat + latDelta;
  return `POLYGON((${west} ${south}, ${east} ${south}, ${east} ${north}, ${west} ${north}, ${west} ${south}))`;
}

function distanceKm(a, b) {
  const radius = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function plausibilityFromCounts(counts, nearestDistanceKm, totalRecords) {
  if (!totalRecords) return "Data deficient";
  if (counts[10] >= 3 || counts[5] >= 1) return "High plausibility";
  if (counts[50] >= 3 || nearestDistanceKm <= 50) return "Moderate plausibility";
  if (totalRecords > 0) return "Low plausibility";
  return "No GBIF support";
}

async function fetchLocationCheck(result, location) {
  if (!location) return { status: "No coordinates", count: 0, records: [], location: null };
  const params = new URLSearchParams({
    taxon_key: result.usageKey,
    geometry: locationPolygon(location),
    has_coordinate: "true",
    has_geospatial_issue: "false",
    occurrence_status: "PRESENT",
    limit: "300",
  });
  const response = await fetch(`https://api.gbif.org/v1/occurrence/search?${params.toString()}`);
  if (!response.ok) return { status: "Unavailable", count: 0, records: [], location };
  const data = await response.json();
  const records = (data.results || [])
    .filter((item) => Number.isFinite(item.decimalLatitude) && Number.isFinite(item.decimalLongitude))
    .filter((item) => !item.coordinateUncertaintyInMeters || item.coordinateUncertaintyInMeters <= 10000)
    .filter((item) => !["FOSSIL_SPECIMEN", "LIVING_SPECIMEN"].includes(item.basisOfRecord))
    .map((item) => ({
      lat: item.decimalLatitude,
      lon: item.decimalLongitude,
      name: item.scientificName || "",
      country: item.country || "",
      year: item.year || "",
      key: item.key || "",
      basisOfRecord: item.basisOfRecord || "",
      uncertaintyMeters: item.coordinateUncertaintyInMeters || "",
      distanceKm: distanceKm(location, { lat: item.decimalLatitude, lon: item.decimalLongitude }),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const radii = [1, 5, 10, 50];
  const counts = Object.fromEntries(
    radii.map((radius) => [radius, records.filter((record) => record.distanceKm <= radius).length]),
  );
  const nearest = records[0] || null;
  const years = records.map((record) => Number(record.year)).filter(Number.isFinite);
  const mostRecentYear = years.length ? Math.max(...years) : "";
  const plausibility = plausibilityFromCounts(counts, nearest?.distanceKm ?? Infinity, data.count || records.length);
  return {
    status: plausibility,
    count: data.count || 0,
    qualityFilteredCount: records.length,
    records: records.slice(0, 50),
    location,
    radiusKm: 50,
    radii,
    counts,
    nearestDistanceKm: nearest ? Number(nearest.distanceKm.toFixed(2)) : "",
    mostRecentYear,
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
  syncLocationColumnHeaders();
  let rows = state.results;
  
  // Apply category filters
  if (state.filter !== "ALL") {
    rows = rows.filter((result) => result.matchType === state.filter);
  }

  // Apply search query filter
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    rows = rows.filter(
      (result) => 
        result.inputName.toLowerCase().includes(q) || 
        result.matchedName.toLowerCase().includes(q) ||
        result.family.toLowerCase().includes(q) ||
        result.kingdom.toLowerCase().includes(q)
    );
  }

  if (!rows.length) {
    const colspan = els.showLocationColumns.checked ? 17 : 11;
    els.resultsBody.innerHTML = `
      <tr>
        <td colspan="${colspan}" class="empty-cell">
          <div class="table-placeholder">
            <i data-lucide="table-2"></i>
            <strong>No matching taxonomic results found.</strong>
            <span>Try clearing your search query or uploading a checklist.</span>
          </div>
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  els.resultsBody.innerHTML = rows
    .map(
      (row) => `
        <tr title="${escapeHtml(row.note)}">
          <td>${escapeHtml(row.inputName)}</td>
          <td>${escapeHtml(row.matchedName || row.acceptedScientificName || "—")}</td>
          <td><span class="tag ${row.matchType}">${escapeHtml(row.matchType)}</span></td>
          <td>${escapeHtml(row.confidence || "0")}%</td>
          <td>${escapeHtml(row.status || "—")}</td>
          <td>${escapeHtml(row.rank || "—")}</td>
          <td>${escapeHtml(row.usageKey || "—")}</td>
          <td>${wikidataBadge(row)}</td>
          <td>${escapeHtml(ncbiIds(row) || "—")}</td>
          <td>${locationBadge(row)}</td>
          ${locationExtraCells(row)}
          <td class="actions-col">
            <button class="btn btn-outline btn-text review-button" data-name="${escapeHtml(row.inputName)}">
              <i data-lucide="eye"></i> Details
            </button>
          </td>
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
  
  lucide.createIcons();
}

function syncLocationColumnHeaders() {
  document.querySelectorAll("th.location-extra").forEach((header) => {
    header.hidden = !els.showLocationColumns.checked;
  });
}

function locationExtraCells(row) {
  const hidden = els.showLocationColumns.checked ? "" : "hidden";
  const check = row.locationCheck || {};
  return `
    <td class="location-extra" ${hidden}>${escapeHtml(check.nearestDistanceKm ?? "—")}</td>
    <td class="location-extra" ${hidden}>${escapeHtml(check.counts?.[1] ?? "—")}</td>
    <td class="location-extra" ${hidden}>${escapeHtml(check.counts?.[5] ?? "—")}</td>
    <td class="location-extra" ${hidden}>${escapeHtml(check.counts?.[10] ?? "—")}</td>
    <td class="location-extra" ${hidden}>${escapeHtml(check.counts?.[50] ?? "—")}</td>
    <td class="location-extra" ${hidden}>${escapeHtml(check.mostRecentYear || "—")}</td>
  `;
}

function locationBadge(row) {
  if (!els.locationCheck.checked && !row.locationCheck) return '<span class="status-pill muted">Not checked</span>';
  const status = row.locationCheck?.status || "Not checked";
  let badgeClass = "plausible-none";
  if (status === "High plausibility") badgeClass = "plausible-high";
  if (status === "Moderate plausibility") badgeClass = "plausible-mod";
  if (status === "Low plausibility") badgeClass = "plausible-low";
  return `<span class="status-pill ${badgeClass}">${escapeHtml(status)}</span>`;
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
  
  // Set Drawer Title
  document.querySelector("#drawerTaxonName").textContent = result.inputName;
  
  els.drawerContent.innerHTML = `
    <p class="drawer-muted">${escapeHtml(result.source || "GBIF")} Match Result: <strong>${escapeHtml(result.matchType)}</strong> (${escapeHtml(result.confidence)}% Confidence)</p>
    <dl class="detail-list">
      <dt>Matched Name</dt><dd>${escapeHtml(result.matchedName || "No Match")}</dd>
      <dt>GBIF/Local ID</dt><dd>${escapeHtml(result.usageKey || "None")}</dd>
      <dt>Accepted Name</dt><dd>${escapeHtml(result.acceptedScientificName || "Same / accepted")}</dd>
      <dt>Note</dt><dd>${escapeHtml(result.note || "None")}</dd>
      <dt>Kingdom / Family</dt><dd>${escapeHtml(result.kingdom || "—")} / ${escapeHtml(result.family || "—")}</dd>
      <dt>Local Reference</dt><dd>${result.localMatch ? `${escapeHtml(result.localMatch.name)} (${result.localMatch.confidence}%)` : "Not checked or no match"}</dd>
      <dt>Wikidata Link</dt><dd>${escapeHtml(result.wikidata?.status || "Not checked")}</dd>
      <dt>Location QA</dt><dd>${locationSummary(result)}</dd>
    </dl>
    
    <h4>Alternative Matches Suggestions</h4>
    ${alternatives.length ? `<ul class="candidate-list">${alternatives
      .map((item) => `<li><strong>${escapeHtml(item.scientificName || item.name || "")}</strong> ${item.key || item.usageKey ? `<span>GBIF ${escapeHtml(item.key || item.usageKey)}</span>` : ""}</li>`)
      .join("")}</ul>` : '<p class="drawer-muted">No alternative suggestions available.</p>'}
    
    <h4>Wikidata External Links</h4>
    ${wikidataLinks.length ? `<ul class="candidate-list">${wikidataLinks
      .map((item) => `<li><a href="${escapeHtml(item.item)}" target="_blank" rel="noreferrer"><i data-lucide="external-link"></i> ${escapeHtml(item.label || item.item)}</a><span>GBIF ${escapeHtml(item.gbif || "—")} / NCBI ${escapeHtml(item.ncbi || "—")}</span></li>`)
      .join("")}</ul>` : '<p class="drawer-muted">No Wikidata cross-reference matches.</p>'}
    
    <h4>Radius Coordinates Verification</h4>
    ${locationSection(result)}
  `;
  
  els.reviewDrawer.classList.add("open");
  els.reviewDrawer.setAttribute("aria-hidden", "false");
  
  // Render submap
  renderLocationMap(result);
  lucide.createIcons();
}

function closeReviewDrawer() {
  els.reviewDrawer.classList.remove("open");
  els.reviewDrawer.setAttribute("aria-hidden", "true");
}

function locationSummary(result) {
  if (!result.locationCheck) return "Not checked";
  if (!result.locationCheck.location) return escapeHtml(result.locationCheck.status);
  const check = result.locationCheck;
  return `${escapeHtml(check.status)}; nearest record ${escapeHtml(check.nearestDistanceKm || "not found")} km; ${escapeHtml(check.counts?.[10] ?? 0)} records within 10 km, ${escapeHtml(check.counts?.[50] ?? 0)} within 50 km; most recent ${escapeHtml(check.mostRecentYear || "unknown")}`;
}

function locationSection(result) {
  const check = result.locationCheck;
  if (!check) return '<p class="drawer-muted">Geographic checking is currently disabled.</p>';
  if (!check.location) return `<p class="drawer-muted">${escapeHtml(check.status)}</p>`;
  return `
    <p class="drawer-muted">${locationSummary(result)}</p>
    <div class="location-score-grid">
      <div><strong>${escapeHtml(check.counts?.[1] ?? 0)}</strong><span>1 km</span></div>
      <div><strong>${escapeHtml(check.counts?.[5] ?? 0)}</strong><span>5 km</span></div>
      <div><strong>${escapeHtml(check.counts?.[10] ?? 0)}</strong><span>10 km</span></div>
      <div><strong>${escapeHtml(check.counts?.[50] ?? 0)}</strong><span>50 km</span></div>
    </div>
    <div id="locationMap" class="location-map"></div>
    <p class="drawer-muted" style="margin-top: 8px; font-size: 11px;">Absence of local coordinates doesn't prove absence. Occurrence checks evaluate public GBIF grids, sampling density, and data flags.</p>
    ${occurrenceTable(check)}
  `;
}

function occurrenceTable(check) {
  const records = (check.records || []).slice(0, 10);
  if (!records.length) return '<p class="drawer-muted">No GBIF occurrence grids found nearby.</p>';
  return `
    <div class="occurrence-table">
      <table>
        <thead><tr><th>Distance</th><th>Year</th><th>Country</th><th>Basis</th></tr></thead>
        <tbody>
          ${records
            .map(
              (record) => `
                <tr>
                  <td><strong>${escapeHtml(record.distanceKm.toFixed(1))} km</strong></td>
                  <td>${escapeHtml(record.year || "—")}</td>
                  <td>${escapeHtml(record.country || "—")}</td>
                  <td>${escapeHtml(record.basisOfRecord || "—")}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderLocationMap(result) {
  const check = result.locationCheck;
  const mapEl = document.querySelector("#locationMap");
  if (!mapEl || !check?.location || !window.L) return;
  setTimeout(() => {
    const map = L.map(mapEl, {
      zoomControl: false,
      scrollWheelZoom: true,
    }).setView([check.location.lat, check.location.lon], 8);
    L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const layers = [];
    const inputMarker = L.circleMarker([check.location.lat, check.location.lon], {
      radius: 8,
      color: "#000000",
      weight: 2,
      fillColor: "#ff8c00",
      fillOpacity: 0.95,
    }).bindPopup("Input coordinate location");
    inputMarker.addTo(map);
    layers.push(inputMarker);

    (check.radii || [1, 5, 10, 50]).forEach((radiusKm) => {
      const radius = L.circle([check.location.lat, check.location.lon], {
        radius: radiusKm * 1000,
        color: radiusKm === 50 ? "#000000" : "#556b2f",
        weight: radiusKm === 50 ? 2 : 1,
        fillColor: "#556b2f",
        fillOpacity: radiusKm === 50 ? 0.06 : 0.02,
      }).addTo(map);
      layers.push(radius);
    });

    (check.records || []).forEach((record) => {
      const marker = L.circleMarker([record.lat, record.lon], {
        radius: 5,
        color: "#477ae2",
        fillColor: "#477ae2",
        fillOpacity: 0.75,
      })
        .addTo(map)
        .bindPopup(`<strong>${escapeHtml(record.name)}</strong><br>${escapeHtml(record.country)} ${escapeHtml(record.year)}`);
      layers.push(marker);
    });

    map.invalidateSize(true);
    const bounds = L.featureGroup(layers).getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [22, 22], maxZoom: 11 });
    }
    setTimeout(() => map.invalidateSize(true), 120);
  }, 120);
}

// Global Map view tab implementation
function initGlobalMap() {
  const mapEl = document.querySelector("#globalOccurrencesMap");
  if (!mapEl || globalMap || !window.L) return;
  
  globalMap = L.map(mapEl, {
    zoomControl: false,
    scrollWheelZoom: true
  }).setView([20, 0], 2);
  
  L.control.zoom({ position: "topright" }).addTo(globalMap);
  
  activeMapThemeLayer = mapTileProviders.light;
  activeMapThemeLayer.addTo(globalMap);
  
  globalMarkerGroup = L.featureGroup().addTo(globalMap);
  
  // Wire theme changer
  els.mapLayerSelect.addEventListener("change", (e) => {
    const val = e.target.value;
    if (globalMap && mapTileProviders[val]) {
      globalMap.removeLayer(activeMapThemeLayer);
      activeMapThemeLayer = mapTileProviders[val];
      activeMapThemeLayer.addTo(globalMap);
    }
  });
  
  els.mapResetViewBtn.addEventListener("click", () => {
    if (globalMap && globalMarkerGroup) {
      const bounds = globalMarkerGroup.getBounds();
      if (bounds.isValid()) {
        globalMap.fitBounds(bounds, { padding: [40, 40] });
      } else {
        globalMap.setView([20, 0], 2);
      }
    }
  });
}

function renderGlobalMap() {
  if (!globalMap || !globalMarkerGroup) return;
  
  globalMarkerGroup.clearLayers();
  
  if (!state.results.length) {
    els.mapPlotCounter.textContent = "0 occurrences mapped";
    return;
  }
  
  const coordinateRows = state.results.filter(
    (row) => locationForRow(row.originalValues) !== null
  );
  
  els.mapPlotCounter.textContent = `${coordinateRows.length} ${coordinateRows.length === 1 ? "occurrence" : "occurrences"} mapped`;
  
  const colors = {
    EXACT: "#2e7d32",
    FUZZY: "#f57c00",
    HIGHERRANK: "#1565c0",
    AGGREGATE: "#1565c0",
    NONE: "#d32f2f"
  };
  
  const layers = [];
  
  coordinateRows.forEach((row) => {
    const coords = locationForRow(row.originalValues);
    if (!coords) return;
    
    const color = colors[row.matchType] || "#9e9e9e";
    
    // 1. Plot Input Coordinate Marker
    const marker = L.circleMarker([coords.lat, coords.lon], {
      radius: 7,
      color: "#000",
      weight: 1.5,
      fillColor: color,
      fillOpacity: 0.9
    });
    
    const popupContent = `
      <div style="font-family: sans-serif; line-height: 1.4;">
        <span style="font-size:10px; color:#666; text-transform:uppercase; font-weight:800;">Input Row ${row.inputRow}</span>
        <h4 style="margin: 4px 0; font-size:14px; font-weight:800;">${escapeHtml(row.inputName)}</h4>
        <dl style="margin: 6px 0; display:grid; grid-template-columns: 80px 1fr; gap:2px; font-size:12px;">
          <dt style="color:#666;">Match:</dt><dd><strong>${escapeHtml(row.matchedName || "Unmatched")}</strong></dd>
          <dt style="color:#666;">Type:</dt><dd><span style="padding: 1px 6px; border-radius:10px; background:#eee; font-size:10px; font-weight:bold;">${row.matchType}</span></dd>
          <dt style="color:#666;">Confidence:</dt><dd>${row.confidence}%</dd>
          <dt style="color:#666;">Plausibility:</dt><dd>${row.locationCheck?.status || "Not checked"}</dd>
        </dl>
        <button class="btn btn-primary btn-outline" style="min-height: 24px; padding: 2px 8px; font-size: 11px; width: 100%; margin-top: 6px;" onclick="openReviewDrawerByName('${escapeHtml(row.inputName)}')">
          Inspect Details Drawer
        </button>
      </div>
    `;
    
    marker.bindPopup(popupContent);
    marker.addTo(globalMarkerGroup);
    layers.push(marker);
    
    // 2. Draw Connection to nearest occurrence if available
    const nearestRecord = row.locationCheck?.records?.[0];
    if (nearestRecord) {
      const nearestMarker = L.circleMarker([nearestRecord.lat, nearestRecord.lon], {
        radius: 4,
        color: "#477ae2",
        weight: 1,
        fillColor: "#477ae2",
        fillOpacity: 0.7
      }).bindPopup(`<strong>Nearest occurrence</strong><br>${escapeHtml(nearestRecord.name)}<br>${nearestRecord.country} (${nearestRecord.year})`);
      
      nearestMarker.addTo(globalMarkerGroup);
      layers.push(nearestMarker);
      
      const line = L.polyline([[coords.lat, coords.lon], [nearestRecord.lat, nearestRecord.lon]], {
        color: "#777",
        weight: 1.5,
        dashArray: "4, 6"
      }).bindPopup(`Taxonomic Distance: ${nearestRecord.distanceKm.toFixed(2)} km`);
      
      line.addTo(globalMarkerGroup);
    }
  });
  
  if (layers.length > 0) {
    const bounds = globalMarkerGroup.getBounds();
    if (bounds.isValid()) {
      globalMap.fitBounds(bounds, { padding: [40, 40] });
    }
  }
}

// Window scope function for popup triggers
window.openReviewDrawerByName = function(name) {
  const result = state.results.find((item) => item.inputName === name);
  if (result) openReviewDrawer(result);
};

// Dashboard KPI metrics updates
function updateDashboardKPIs() {
  if (!state.results.length) {
    els.dashKpiTotal.textContent = "0";
    els.dashKpiMatchRate.textContent = "0%";
    els.dashKpiSpatial.textContent = "0";
    els.dashKpiWikidata.textContent = "0";
    return;
  }
  
  const total = state.results.length;
  const matches = state.results.filter((r) => r.matchType !== "NONE").length;
  const matchRate = total ? Math.round((matches / total) * 100) : 0;
  
  const spatial = state.results.filter(
    (row) => locationForRow(row.originalValues) !== null
  ).length;
  
  const wikidata = state.results.filter((r) => r.wikidata?.status === "Linked").length;
  
  els.dashKpiTotal.textContent = total;
  els.dashKpiMatchRate.textContent = `${matchRate}%`;
  els.dashKpiSpatial.textContent = spatial;
  els.dashKpiWikidata.textContent = wikidata;
}

// Diagnostic Health Log
function updateDashboardHealthLog() {
  const logEl = els.dashboardHealthLog;
  if (!state.rows.length) {
    logEl.innerHTML = `
      <div class="health-placeholder">
        <i data-lucide="check-circle-2" class="text-success"></i>
        <span>No checklist uploaded yet. Load a spreadsheet to trigger diagnostic checks.</span>
      </div>
    `;
    lucide.createIcons();
    return;
  }
  
  if (!state.health.length) {
    logEl.innerHTML = `
      <div class="health-log-item success">
        <i data-lucide="check-circle-2" style="color:#2e7d32; flex-shrink:0;"></i>
        <div><strong>All systems operational</strong> — 0 taxonomic quality flags raised against column structure. Ready to match.</div>
      </div>
    `;
    lucide.createIcons();
    return;
  }
  
  logEl.innerHTML = state.health
    .map(
      (err) => `
        <div class="health-log-item warning">
          <i data-lucide="alert-triangle" style="color:#f57c00; flex-shrink:0;"></i>
          <div><strong>Verification Alert</strong> — ${escapeHtml(err)}</div>
        </div>
      `
    )
    .join("");
  
  lucide.createIcons();
}

// ChartJS dashboard visualizer
function renderDashboardCharts() {
  const ctxType = document.getElementById("matchTypeChart");
  const ctxConf = document.getElementById("confidenceChart");
  
  if (!ctxType || !ctxConf) return;
  
  // Reset previous instances
  if (matchTypeChartInstance) matchTypeChartInstance.destroy();
  if (confidenceChartInstance) confidenceChartInstance.destroy();
  
  if (!state.results.length) {
    return;
  }
  
  // 1. Match type distribution doughnut
  const types = { EXACT: 0, FUZZY: 0, HIGHERRANK: 0, NONE: 0 };
  state.results.forEach((row) => {
    let t = row.matchType;
    if (t === "AGGREGATE") t = "HIGHERRANK";
    if (types[t] !== undefined) types[t]++;
  });
  
  matchTypeChartInstance = new Chart(ctxType, {
    type: "doughnut",
    data: {
      labels: ["Exact Match", "Fuzzy Match", "Higher Rank", "No Match"],
      datasets: [{
        data: [types.EXACT, types.FUZZY, types.HIGHERRANK, types.NONE],
        backgroundColor: ["#2e7d32", "#f57c00", "#1565c0", "#d32f2f"],
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { boxWidth: 12, font: { family: "Inter", weight: 600 } }
        }
      }
    }
  });
  
  // 2. Confidence groups bar chart
  const confs = { "90-100%": 0, "70-89%": 0, "50-69%": 0, "<50%": 0, "No Match": 0 };
  state.results.forEach((row) => {
    if (row.matchType === "NONE") {
      confs["No Match"]++;
      return;
    }
    const c = Number(row.confidence);
    if (c >= 90) confs["90-100%"]++;
    else if (c >= 70) confs["70-89%"]++;
    else if (c >= 50) confs["50-69%"]++;
    else confs["<50%"]++;
  });
  
  confidenceChartInstance = new Chart(ctxConf, {
    type: "bar",
    data: {
      labels: Object.keys(confs),
      datasets: [{
        label: "Taxa Checked",
        data: Object.values(confs),
        backgroundColor: ["#2e7d32", "#a5d6a7", "#ffe082", "#ffb74d", "#ef9a9a"],
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 }
        }
      }
    }
  });
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
    "locationStatus",
    "nearbyGbifOccurrenceCount",
    "recordsWithin1Km",
    "recordsWithin5Km",
    "recordsWithin10Km",
    "recordsWithin50Km",
    "nearestGbifRecordKm",
    "mostRecentNearbyGbifYear",
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
                : field === "locationStatus"
                  ? row.locationCheck?.status || ""
                  : field === "nearbyGbifOccurrenceCount"
                    ? row.locationCheck?.count ?? ""
                    : field === "recordsWithin1Km"
                      ? row.locationCheck?.counts?.[1] ?? ""
                      : field === "recordsWithin5Km"
                        ? row.locationCheck?.counts?.[5] ?? ""
                        : field === "recordsWithin10Km"
                          ? row.locationCheck?.counts?.[10] ?? ""
                          : field === "recordsWithin50Km"
                            ? row.locationCheck?.counts?.[50] ?? ""
                            : field === "nearestGbifRecordKm"
                              ? row.locationCheck?.nearestDistanceKm ?? ""
                              : field === "mostRecentNearbyGbifYear"
                                ? row.locationCheck?.mostRecentYear ?? ""
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

function downloadRows(filename, headers, rows) {
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((field) => JSON.stringify(String(row[field] ?? ""))).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function locationSummaryRows() {
  return state.results.map((row) => ({
    inputRow: row.inputRow,
    inputName: row.inputName,
    matchedName: row.matchedName,
    usageKey: row.usageKey,
    locationStatus: row.locationCheck?.status || "",
    inputLatitude: row.locationCheck?.location?.lat ?? "",
    inputLongitude: row.locationCheck?.location?.lon ?? "",
    nearbyGbifOccurrenceCount: row.locationCheck?.count ?? "",
    qualityFilteredOccurrenceCount: row.locationCheck?.qualityFilteredCount ?? "",
    recordsWithin1Km: row.locationCheck?.counts?.[1] ?? "",
    recordsWithin5Km: row.locationCheck?.counts?.[5] ?? "",
    recordsWithin10Km: row.locationCheck?.counts?.[10] ?? "",
    recordsWithin50Km: row.locationCheck?.counts?.[50] ?? "",
    nearestGbifRecordKm: row.locationCheck?.nearestDistanceKm ?? "",
    mostRecentNearbyGbifYear: row.locationCheck?.mostRecentYear ?? "",
  }));
}

function occurrenceRows() {
  return state.results.flatMap((row) =>
    (row.locationCheck?.records || []).map((record) => ({
      inputRow: row.inputRow,
      inputName: row.inputName,
      matchedName: row.matchedName,
      usageKey: row.usageKey,
      occurrenceKey: record.key,
      occurrenceName: record.name,
      distanceKm: record.distanceKm?.toFixed ? record.distanceKm.toFixed(3) : record.distanceKm,
      decimalLatitude: record.lat,
      decimalLongitude: record.lon,
      country: record.country,
      year: record.year,
      basisOfRecord: record.basisOfRecord,
      coordinateUncertaintyMeters: record.uncertaintyMeters,
    })),
  );
}

function downloadLocationCsv() {
  const rows = locationSummaryRows();
  const headers = [
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
  ];
  downloadRows("gbif-taxonlens-location-summary.csv", headers, rows);
}

function downloadOccurrenceCsv() {
  const rows = occurrenceRows();
  const headers = [
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
  ];
  downloadRows("gbif-taxonlens-location-occurrences.csv", headers, rows);
}

// ==========================================
// ADVANCED SCHEMA MAPPER MODAL COMPONENTS
// ==========================================

const fieldCategories = [
  {
    id: "core",
    name: "Core Taxonomy",
    icon: "sparkles",
    fields: ["scientificName", "genus", "specificEpithet", "taxonRank", "authorship"],
    expanded: true
  },
  {
    id: "higher",
    name: "Higher Classification",
    icon: "git-fork",
    fields: ["kingdom", "phylum", "class", "order", "family"],
    expanded: false
  },
  {
    id: "spatial",
    name: "Location / Coordinates",
    icon: "map-pin",
    fields: ["decimalLatitude", "decimalLongitude", "country"],
    expanded: false
  },
  {
    id: "metadata",
    name: "System Identifiers",
    icon: "key",
    fields: ["taxonID"],
    expanded: false
  }
];

function renderModalMapper(searchQuery = "") {
  const q = searchQuery.toLowerCase().trim();
  
  // Render Left Pane (Accordion)
  let html = "";
  
  fieldCategories.forEach((cat) => {
    // Filter fields based on search query
    const filteredFields = cat.fields.filter(field => {
      const label = fieldLabel(field).toLowerCase();
      const name = field.toLowerCase();
      return label.includes(q) || name.includes(q);
    });
    
    if (q && filteredFields.length === 0) {
      return;
    }
    
    const isExpanded = cat.expanded || q.length > 0;
    const isCollapsedClass = isExpanded ? "" : "collapsed";
    const isActiveClass = isExpanded ? "active-group" : "";
    
    html += `
      <div class="mapper-group-card ${isCollapsedClass} ${isActiveClass}" id="group-card-${cat.id}">
        <header class="mapper-group-header" data-cat-id="${cat.id}">
          <div class="mapper-group-header-title">
            <i data-lucide="${cat.icon}"></i>
            <span>${cat.name}</span>
          </div>
          <i data-lucide="chevron-down" class="chevron-icon"></i>
        </header>
        <div class="mapper-group-content">
          ${filteredFields.map(field => {
            const info = state.mapping[field] || {};
            const isMapped = !!info.column;
            const confClass = info.confidence ? info.confidence.toLowerCase() : "unset";
            
            // Get live column preview of first 3 non-empty values
            let previewText = "<em>Unmapped</em>";
            if (isMapped) {
              const vals = [];
              for (const r of state.rows) {
                const val = r[info.column];
                if (val !== undefined && val !== null && String(val).trim()) {
                  vals.push(String(val).trim());
                  if (vals.length >= 3) break;
                }
              }
              previewText = vals.length > 0 
                ? `Preview: <strong>${vals.map(v => `"${escapeHtml(v)}"`).join(", ")}</strong>`
                : "Preview: <em>(All empty)</em>";
            }
            
            return `
              <div class="modal-mapping-row" data-field-row="${field}">
                <div class="modal-mapping-row-meta">
                  <strong>${fieldLabel(field)}</strong>
                  <span class="confidence-tag ${confClass}">${info.confidence || "Unset"}</span>
                </div>
                <select class="mapping-select modal-mapping-select" data-field="${field}">
                  <option value="">(Not mapped)</option>
                  ${state.headers.map(header => `
                    <option value="${escapeHtml(header)}" ${header === info.column ? "selected" : ""}>
                      ${escapeHtml(header)}
                    </option>
                  `).join("")}
                </select>
                <span class="modal-column-preview-text" id="preview-text-${field}">
                  ${previewText}
                </span>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  });
  
  if (!html) {
    html = `<p class="empty-mapping">No fields match your search "${escapeHtml(searchQuery)}"</p>`;
  }
  
  els.mapperAccordion.innerHTML = html;
  
  // Attach event listeners for accordion headers
  document.querySelectorAll(".mapper-group-header").forEach(header => {
    header.addEventListener("click", () => {
      const catId = header.dataset.catId;
      const card = document.querySelector(`#group-card-${catId}`);
      if (card) {
        const isCollapsed = card.classList.contains("collapsed");
        card.classList.toggle("collapsed");
        card.classList.toggle("active-group", isCollapsed);
        
        // Save expansion state
        const cat = fieldCategories.find(c => c.id === catId);
        if (cat) cat.expanded = isCollapsed;
      }
    });
  });
  
  // Attach change event listeners to select elements in modal
  document.querySelectorAll(".modal-mapping-select").forEach(select => {
    select.addEventListener("change", () => {
      const field = select.dataset.field;
      const col = select.value;
      
      applyManualMapping(field, col);
    });
  });
  
  // Create lucide icons
  lucide.createIcons();
}

function updateModalFieldPreviewText(field, col) {
  const pSpan = document.querySelector(`#preview-text-${field}`);
  if (!pSpan) return;
  
  if (!col) {
    pSpan.innerHTML = "<em>Unmapped</em>";
    return;
  }
  
  const vals = [];
  for (const r of state.rows) {
    const val = r[col];
    if (val !== undefined && val !== null && String(val).trim()) {
      vals.push(String(val).trim());
      if (vals.length >= 3) break;
    }
  }
  
  pSpan.innerHTML = vals.length > 0 
    ? `Preview: <strong>${vals.map(v => `"${escapeHtml(v)}"`).join(", ")}</strong>`
    : "Preview: <em>(All empty)</em>";
}

function renderModalPreviewTable() {
  if (!state.rows.length) {
    els.modalPreviewTable.innerHTML = "<tr><td>No data available.</td></tr>";
    return;
  }
  
  // Get currently mapped columns
  const mappedCols = new Set(
    Object.values(state.mapping)
      .map(info => info.column)
      .filter(Boolean)
  );
  
  // Render Headers
  let headerHtml = "<tr>";
  state.headers.forEach(header => {
    const isMapped = mappedCols.has(header);
    const mappedClass = isMapped ? "mapped-col" : "";
    
    // Find what field(s) this column maps to
    const mappedFields = Object.entries(state.mapping)
      .filter(([field, info]) => info.column === header)
      .map(([field, info]) => fieldLabel(field));
    
    const tooltipText = mappedFields.length > 0 
      ? `Maps to: ${mappedFields.join(", ")}`
      : "Unmapped column";
      
    headerHtml += `
      <th class="${mappedClass}" title="${escapeHtml(tooltipText)}">
        ${escapeHtml(header)}
      </th>
    `;
  });
  headerHtml += "</tr>";
  
  // Render Rows (first 5)
  let rowsHtml = "";
  const previewRows = state.rows.slice(0, 5);
  
  previewRows.forEach(row => {
    rowsHtml += "<tr>";
    state.headers.forEach(header => {
      const isMapped = mappedCols.has(header);
      const mappedClass = isMapped ? "mapped-col-cell" : "";
      const val = row[header] !== undefined ? row[header] : "";
      rowsHtml += `<td class="${mappedClass}">${escapeHtml(String(val))}</td>`;
    });
    rowsHtml += "</tr>";
  });
  
  els.modalPreviewTable.innerHTML = headerHtml + rowsHtml;
}

function updateModalStatusAndChecklist() {
  // Count total mapped columns
  const fields = Object.entries(state.mapping);
  const mappedCount = fields.filter(([f, info]) => !!info.column).length;
  
  const schema = detectSchema(state.mapping);
  els.modalStatusMsg.innerHTML = `
    <i data-lucide="info"></i> <strong>${mappedCount} / ${editableFields.length} fields mapped</strong> &middot; Schema: <strong>${escapeHtml(schema)}</strong>
  `;
  
  // Render health checks in modal
  const hasSciName = !!state.mapping.scientificName?.column;
  const hasGenus = !!state.mapping.genus?.column;
  const hasCoords = !!state.mapping.decimalLatitude?.column && !!state.mapping.decimalLongitude?.column;
  const hasHigher = !!state.mapping.family?.column || !!state.mapping.kingdom?.column;
  
  els.modalHealthList.innerHTML = `
    <div class="health-item-modal ${(hasSciName || hasGenus) ? 'valid' : 'invalid'}">
      <i data-lucide="${(hasSciName || hasGenus) ? 'check-circle' : 'alert-circle'}"></i>
      <span>Taxon Field Mapped</span>
    </div>
    <div class="health-item-modal ${hasCoords ? 'valid' : 'invalid'}">
      <i data-lucide="${hasCoords ? 'check-circle' : 'alert-circle'}"></i>
      <span>Coordinates Mapped</span>
    </div>
    <div class="health-item-modal ${hasHigher ? 'valid' : 'invalid'}">
      <i data-lucide="${hasHigher ? 'check-circle' : 'alert-circle'}"></i>
      <span>Higher Taxonomy Mapped</span>
    </div>
  `;
  
  lucide.createIcons();
}

function runSmartAutoMap() {
  const newMapping = detectMapping(state.headers, state.rows);
  state.mapping = newMapping;
  state.health = healthCheck(state.rows, state.mapping);
  
  renderModalMapper(els.mapperSearch.value);
  renderModalPreviewTable();
  updateModalStatusAndChecklist();
  renderMapping();
  
  // Visual pulse on table wrapper
  const wrap = document.querySelector(".preview-table-wrapper");
  if (wrap) {
    wrap.style.animation = "none";
    setTimeout(() => {
      wrap.style.border = "1px solid var(--primary)";
      wrap.style.boxShadow = "0 0 0 4px rgba(38, 166, 91, 0.15)";
      setTimeout(() => {
        wrap.style.border = "";
        wrap.style.boxShadow = "";
      }, 500);
    }, 10);
  }
}

function clearModalMappings() {
  state.mapping = {};
  state.health = healthCheck(state.rows, state.mapping);
  
  renderModalMapper(els.mapperSearch.value);
  renderModalPreviewTable();
  updateModalStatusAndChecklist();
  renderMapping();
}

function openMappingModal() {
  if (!state.rows.length) return;
  
  renderModalMapper();
  renderModalPreviewTable();
  updateModalStatusAndChecklist();
  
  els.mapperSearch.value = "";
  els.mappingModal.hidden = false;
  els.mappingModal.setAttribute("aria-hidden", "false");
}

function closeMappingModal() {
  els.mappingModal.hidden = true;
  els.mappingModal.setAttribute("aria-hidden", "true");
  
  els.runButton.disabled = !state.mapping.scientificName && !state.mapping.genus;
  els.previewStatus.textContent = state.mapping.scientificName ? "Detected" : "Needs mapping";
}

// Bind UI event listeners

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
els.downloadLocationButton.addEventListener("click", downloadLocationCsv);
els.downloadOccurrencesButton.addEventListener("click", downloadOccurrenceCsv);
els.showLocationColumns.addEventListener("change", renderResults);
els.matchMode.addEventListener("change", updateRunButtonLabel);
els.drawerClose.addEventListener("click", closeReviewDrawer);

els.reviewDrawer.addEventListener("click", (event) => {
  if (event.target === els.reviewDrawer) closeReviewDrawer();
});

// Advanced Schema Mapper Modal Bindings
els.openMapperBtn.addEventListener("click", openMappingModal);
els.modalClose.addEventListener("click", closeMappingModal);
els.modalApplyBtn.addEventListener("click", closeMappingModal);
els.autoMapBtn.addEventListener("click", runSmartAutoMap);
els.clearMapBtn.addEventListener("click", clearModalMappings);

els.mapperSearch.addEventListener("input", (e) => {
  renderModalMapper(e.target.value);
});

els.mappingModal.addEventListener("click", (event) => {
  if (event.target === els.mappingModal) {
    closeMappingModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && els.mappingModal && !els.mappingModal.hidden) {
    closeMappingModal();
  }
});


// Search input keyup query listener
els.tableSearchQuery.addEventListener("input", (e) => {
  state.searchQuery = e.target.value;
  renderResults();
});

els.clearButton.addEventListener("click", () => {
  state.rows = [];
  state.headers = [];
  state.mapping = {};
  state.health = [];
  state.results = [];
  state.reference = { rows: [], headers: [], mapping: {}, source: "" };
  state.searchQuery = "";
  els.tableSearchQuery.value = "";
  els.fileInput.value = "";
  els.referenceInput.value = "";
  els.runButton.disabled = true;
  els.clearButton.disabled = true;
  els.openMapperBtn.disabled = true;
  els.downloadButton.disabled = true;
  els.downloadLocationButton.disabled = true;
  els.downloadOccurrencesButton.disabled = true;
  els.previewStatus.textContent = "Ready";
  els.progressWrap.hidden = true;
  els.progressBar.style.width = "0";
  els.referenceStatus.textContent =
    "Optional: upload a pinned GBIF Backbone extract, curated checklist, or second taxonomy table.";
  
  renderMapping();
  renderResults();
  updateDashboardKPIs();
  updateDashboardHealthLog();
  renderDashboardCharts();
  renderGlobalMap();
});

updateRunButtonLabel();

// Table filters
document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((item) => item.classList.remove("active"));
    chip.classList.add("active");
    state.filter = chip.dataset.filter;
    renderResults();
  });
});

// Tab Switches Event listener
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    document.querySelectorAll(".tab-pane").forEach((pane) => {
      pane.classList.remove("active");
    });
    
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    
    const targetPaneId = "pane" + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1);
    const targetPane = document.getElementById(targetPaneId);
    if (targetPane) {
      targetPane.classList.add("active");
    }
    
    // Actions upon tab activation
    if (btn.dataset.tab === "map") {
      initGlobalMap();
      setTimeout(() => {
        if (globalMap) {
          globalMap.invalidateSize(true);
          // Auto fit bounds
          if (globalMarkerGroup) {
            const bounds = globalMarkerGroup.getBounds();
            if (bounds.isValid()) {
              globalMap.fitBounds(bounds, { padding: [40, 40] });
            }
          }
        }
      }, 100);
    }
  });
});

// Run Init
lucide.createIcons();
