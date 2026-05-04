import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeDatabaseProduct } from "./catalog.js";
import { buildCategoryReview } from "./categorization.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnvFile(path.join(__dirname, ".env"));
const port = Number(process.env.PORT || 8000);
const geminiApiKey = process.env.GEMINI_API_KEY || "";
const geminiModel = normalizeGeminiModel(process.env.GEMINI_MODEL || "gemini-3-flash-preview");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

let normalizedCatalogPromise;
let categoryReviewPromise;
let baselineArtifactsPromise;
let modelEvaluationPromise;
let taxonomyMappingPromise;
let categoryProfilesPromise;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  try {
    const contents = requireEnvStyleFile(filePath);
    contents.forEach(([key, value]) => {
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    });
  } catch {
    // Ignore malformed env files and continue with process env.
  }
}

function requireEnvStyleFile(filePath) {
  const text = String(readFileSync(filePath, "utf8") || "").replace(/^\uFEFF/, "");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) {
        return null;
      }

      const key = line.slice(0, separatorIndex).trim();
      let value = line.slice(separatorIndex + 1).trim();
      value = value.replace(/^['"]|['"]$/g, "");
      return [key, value];
    })
    .filter(Boolean);
}

function normalizeGeminiModel(model) {
  const raw = String(model || "").trim();
  if (!raw) {
    return "gemini-3-flash-preview";
  }

  return raw.startsWith("models/") ? raw.slice("models/".length) : raw;
}

function isGeminiConfigured() {
  return Boolean(geminiApiKey && geminiModel);
}

function sanitizeJsonResponse(text) {
  return String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function collectTextParts(product = {}) {
  return [
    product.productName,
    product.description,
    product.currentCategory,
    product.canonicalLabel,
    Array.isArray(product.tags) ? product.tags.join(", ") : "",
    product.externalCategoryPath
  ].filter(Boolean);
}

function tokenizeSemanticText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 2);
}

function buildProfileText(profile) {
  return [
    profile.name,
    profile.categoryLabel,
    profile.description,
    ...(profile.include || []),
    ...(profile.exclude || []).map((item) => `not ${item}`),
    ...(profile.exampleTerms || [])
  ].join(" ");
}

function scoreProfileMatch(text, profile) {
  const productTokens = new Set(tokenizeSemanticText(text));
  const profileTokens = new Set(tokenizeSemanticText(buildProfileText(profile)));
  const termTokens = new Set((profile.exampleTerms || []).flatMap(tokenizeSemanticText));

  if (productTokens.size === 0 || profileTokens.size === 0) {
    return 0;
  }

  const overlap = [...productTokens].filter((token) => profileTokens.has(token)).length;
  const termOverlap = [...productTokens].filter((token) => termTokens.has(token)).length;
  const coverage = overlap / Math.max(1, profileTokens.size);
  const focus = termOverlap / Math.max(1, termTokens.size);
  return Math.min(1, coverage * 1.8 + focus * 0.65);
}

function findProfileMatches(text, profiles, limit = 3) {
  return profiles
    .map((profile) => ({
      id: profile.id,
      name: profile.name,
      categoryLabel: profile.categoryLabel,
      score: Number(scoreProfileMatch(text, profile).toFixed(3))
    }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const body = Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "");
  return JSON.parse(body);
}

async function loadCatalog() {
  if (!normalizedCatalogPromise) {
    normalizedCatalogPromise = readFile(path.join(__dirname, "data", "catalog.json"), "utf8")
      .then((contents) => contents.replace(/^\uFEFF/, ""))
      .then((contents) => JSON.parse(contents))
      .then((records) => records.map(normalizeDatabaseProduct));
  }

  return normalizedCatalogPromise;
}

async function loadBaselineArtifacts() {
  if (!baselineArtifactsPromise) {
    const artifactPath = path.join(__dirname, "data", "category_review_artifacts.json");
    baselineArtifactsPromise = (async () => {
      if (!existsSync(artifactPath)) {
        return {};
      }

      const contents = await readFile(artifactPath, "utf8");
      return JSON.parse(contents.replace(/^\uFEFF/, ""));
    })();
  }

  return baselineArtifactsPromise;
}

async function loadTaxonomyMapping() {
  if (!taxonomyMappingPromise) {
    taxonomyMappingPromise = readFile(path.join(__dirname, "data", "taxonomy_mapping.json"), "utf8")
      .then((contents) => contents.replace(/^\uFEFF/, ""))
      .then((contents) => JSON.parse(contents));
  }

  return taxonomyMappingPromise;
}

async function loadCategoryProfiles() {
  if (!categoryProfilesPromise) {
    const profilePath = path.join(__dirname, "data", "category_profiles.json");
    categoryProfilesPromise = (async () => {
      if (!existsSync(profilePath)) {
        return [];
      }

      const contents = await readFile(profilePath, "utf8");
      return JSON.parse(contents.replace(/^\uFEFF/, ""));
    })();
  }

  return categoryProfilesPromise;
}

async function loadCategoryReview() {
  if (!categoryReviewPromise) {
    categoryReviewPromise = Promise.all([loadCatalog(), loadBaselineArtifacts(), loadCategoryProfiles()]).then(
      ([products, artifacts, profiles]) => {
        const review = buildCategoryReview(products, artifacts);
        return {
          ...review,
          records: review.records.map((record) => ({
            ...record,
            profileMatches: findProfileMatches(
              `${record.name} ${record.description} ${record.currentCategory} ${record.suggestedCategory} ${(record.tags || []).join(" ")} ${(record.materials || []).join(" ")}`,
              profiles
            )
          }))
        };
      }
    );
  }

  return categoryReviewPromise;
}

async function loadJsonIfExists(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  const contents = await readFile(filePath, "utf8");
  return JSON.parse(contents.replace(/^\uFEFF/, ""));
}

async function loadPreparedEvaluationRows() {
  const candidateFiles = [
    "prepared_external_products.json",
    "prepared_external_products_2.json",
    "prepared_mixed_products.json",
    "prepared_products.json"
  ];
  const rowGroups = await Promise.all(
    candidateFiles.map((fileName) => loadJsonIfExists(path.join(__dirname, "data", fileName)))
  );

  const rowsById = new Map();
  rowGroups
    .filter(Array.isArray)
    .flat()
    .forEach((row) => {
      if (row?.id) {
        rowsById.set(row.id, row);
      }
    });

  return [...rowsById.values()];
}

function buildModelEvaluationFromPredictions(predictions, preparedRows = [], profiles = []) {
  const preparedById = Object.fromEntries(preparedRows.map((row) => [row.id, row]));
  const records = predictions.map((prediction) => {
    const prepared = preparedById[prediction.id] || {};
    return {
      id: prediction.id,
      productName: prediction.product_name || prepared.product_name || "Unknown product",
      currentCategory: prediction.current_category || prepared.current_category || "Unknown",
      canonicalLabel: prediction.canonical_label || prepared.canonical_label || "Unknown",
      suggestedCategory: prediction.suggested_category || "Unknown",
      confidence: prediction.confidence || 0,
      topCategories: prediction.top_categories || [],
      explanation: prediction.explanation || prepared.explanation || null,
      externalCategoryPath: prepared.taxonomy_paths?.[0] || "",
      canonicalDomain: prepared.canonical_domain || "",
      description: prepared.description || "",
      tags: prepared.tags || [],
      profileMatches: findProfileMatches(
        [
          prediction.product_name,
          prediction.current_category,
          prediction.canonical_label,
          prediction.suggested_category,
          prepared.searchable_text,
          prepared.description,
          ...(prepared.tags || [])
        ].filter(Boolean).join(" "),
        profiles
      ),
      searchText: [
        prediction.product_name,
        prediction.current_category,
        prediction.canonical_label,
        prediction.suggested_category,
        prepared.searchable_text
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
    };
  });

  const confidenceBands = {
    high: records.filter((record) => record.confidence >= 0.75).length,
    medium: records.filter((record) => record.confidence >= 0.45 && record.confidence < 0.75).length,
    low: records.filter((record) => record.confidence < 0.45).length
  };
  const predictedCategoryCounts = records.reduce((counts, record) => {
    counts[record.suggestedCategory] = (counts[record.suggestedCategory] || 0) + 1;
    return counts;
  }, {});

  return {
    available: records.length > 0,
    source: "model_category_predictions",
    summary: {
      rowCount: records.length,
      predictedCategoryCounts,
      confidenceBands
    },
    records
  };
}

async function loadModelEvaluation() {
  if (!modelEvaluationPromise) {
    modelEvaluationPromise = (async () => {
      const predictionPath = path.join(__dirname, "data", "model_category_predictions.json");

      const predictions = await loadJsonIfExists(predictionPath);
      if (predictions) {
        const [preparedRows, profiles] = await Promise.all([loadPreparedEvaluationRows(), loadCategoryProfiles()]);
        return buildModelEvaluationFromPredictions(predictions, preparedRows, profiles);
      }

      return {
        available: false,
        source: null,
        summary: {
          rowCount: 0,
          predictedCategoryCounts: {},
          confidenceBands: {
            high: 0,
            medium: 0,
            low: 0
          }
        },
        records: []
      };
    })();
  }

  return modelEvaluationPromise;
}

function extractCanonicalLabels(mapping) {
  const apparelLabels = Object.values(mapping.apparel?.category_rules || {}).map((item) => item.label);
  const petLabels = (mapping.pet?.path_contains_rules || []).map((item) => item.label);
  return [...new Set([...apparelLabels, ...petLabels])].sort();
}

async function requestGeminiCategorization(payload) {
  const product = payload.product || {};
  const taxonomy = await loadTaxonomyMapping();
  const candidateCategories = Array.isArray(payload.candidates) && payload.candidates.length > 0
    ? [...new Set(payload.candidates.map((value) => String(value).trim()).filter(Boolean))]
    : extractCanonicalLabels(taxonomy);
  const topCandidates = Array.isArray(payload.topCategories)
    ? payload.topCategories.map((item) => `${item.category}: ${item.probability}`).join(", ")
    : "";
  const prompt = [
    "You are helping categorize retail products into a canonical taxonomy.",
    "Choose the single best category from the provided candidate list.",
    "Return strict JSON with keys: suggestedCategory, confidence, reasoning.",
    "",
    `Candidates: ${candidateCategories.join(" | ")}`,
    `Product name: ${product.productName || ""}`,
    `Description: ${product.description || ""}`,
    `Current category: ${product.currentCategory || ""}`,
    `Mapped label: ${product.canonicalLabel || ""}`,
    `External category path: ${product.externalCategoryPath || ""}`,
    `Tags: ${Array.isArray(product.tags) ? product.tags.join(", ") : ""}`,
    `Local model suggestion: ${payload.localSuggestion || ""}`,
    `Local top categories: ${topCandidates}`
  ].join("\n");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${errorText}`);
  }

  const json = await response.json();
  const text = json.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  const parsed = JSON.parse(sanitizeJsonResponse(text));
  return {
    suggestedCategory: parsed.suggestedCategory || null,
    confidence: parsed.confidence ?? null,
    reasoning: parsed.reasoning || "",
    candidateCategories
  };
}

async function requestGeminiCategoryProfile(payload) {
  const mode = payload.mode === "discover" ? "discover" : "profile";
  const categoryName = String(payload.categoryName || payload.categoryLabel || "Pet store description sample").trim();
  const products = Array.isArray(payload.products) ? payload.products.slice(0, 12) : [];
  const examples = products.map((product, index) =>
    [
      `Example ${index + 1}:`,
      `Name: ${product.productName || product.name || ""}`,
      `Description: ${String(product.description || "").slice(0, 600)}`,
      `Current category: ${product.currentCategory || ""}`,
      `Suggested category: ${product.suggestedCategory || product.canonicalLabel || ""}`,
      `Tags: ${Array.isArray(product.tags) ? product.tags.join(", ") : ""}`
    ].join("\n")
  );

  const prompt = mode === "discover"
    ? [
        "You are reviewing a small, filtered sample from a pet store catalog.",
        "Use the product descriptions to propose a few reusable semantic category profiles.",
        "Do not categorize each product one-by-one. Find patterns that can connect future products through description meaning.",
        "Return strict JSON with key profiles. profiles must be an array of 3 to 6 objects.",
        "Each profile object must include: name, categoryLabel, description, include, exclude, exampleTerms.",
        "description should be one concise sentence. include, exclude, and exampleTerms should be arrays of short strings.",
        "",
        `Sample theme: ${categoryName}`,
        "",
        examples.join("\n\n")
      ].join("\n")
    : [
        "You are summarizing a small product group into a reusable semantic category profile.",
        "Do not categorize every product. Create one reusable profile that can later be matched locally against descriptions.",
        "Return strict JSON with keys: name, categoryLabel, description, include, exclude, exampleTerms.",
        "description should be one concise sentence. include, exclude, and exampleTerms should be arrays of short strings.",
        "",
        `Target category: ${categoryName}`,
        "",
        examples.join("\n\n")
      ].join("\n");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.25,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini profile request failed: ${response.status} ${errorText}`);
  }

  const json = await response.json();
  const text = json.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  const parsed = JSON.parse(sanitizeJsonResponse(text));
  if (mode === "discover") {
    const profiles = Array.isArray(parsed.profiles) ? parsed.profiles : [];
    return {
      profiles: profiles.map((profile) => ({
        id: String(profile.name || profile.categoryLabel || "profile").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        name: profile.name || "Discovered profile",
        categoryLabel: profile.categoryLabel || profile.name || "pet > discovered",
        description: profile.description || "",
        include: Array.isArray(profile.include) ? profile.include : [],
        exclude: Array.isArray(profile.exclude) ? profile.exclude : [],
        exampleTerms: Array.isArray(profile.exampleTerms) ? profile.exampleTerms : []
      }))
    };
  }

  return {
    id: String(parsed.name || categoryName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    name: parsed.name || categoryName,
    categoryLabel: parsed.categoryLabel || payload.categoryLabel || categoryName,
    description: parsed.description || "",
    include: Array.isArray(parsed.include) ? parsed.include : [],
    exclude: Array.isArray(parsed.exclude) ? parsed.exclude : [],
    exampleTerms: Array.isArray(parsed.exampleTerms) ? parsed.exampleTerms : []
  };
}

function serveFile(filePath, response) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = contentTypes[extension] || "application/octet-stream";

  response.writeHead(200, { "Content-Type": contentType });
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && requestUrl.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      mode: "product-category-suggestions",
      geminiConfigured: isGeminiConfigured(),
      geminiModel
    });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/category-suggestions") {
    try {
      const review = await loadCategoryReview();
      sendJson(response, 200, review);
    } catch (error) {
      sendJson(response, 500, {
        error: error.message || "Failed to build category review"
      });
    }
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/model-evaluation") {
    try {
      const evaluation = await loadModelEvaluation();
      sendJson(response, 200, evaluation);
    } catch (error) {
      sendJson(response, 500, {
        error: error.message || "Failed to load model evaluation"
      });
    }
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/category-profiles") {
    try {
      const profiles = await loadCategoryProfiles();
      sendJson(response, 200, {
        profiles,
        count: profiles.length,
        geminiConfigured: isGeminiConfigured()
      });
    } catch (error) {
      sendJson(response, 500, {
        error: error.message || "Failed to load category profiles"
      });
    }
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/gemini-categorize") {
    if (!isGeminiConfigured()) {
      sendJson(response, 503, {
        error: "Gemini is not configured",
        geminiConfigured: false
      });
      return;
    }

    try {
      const payload = await readJsonBody(request);
      if (!payload.product || collectTextParts(payload.product).length === 0) {
        sendJson(response, 400, {
          error: "Request must include a product with at least a name or description"
        });
        return;
      }

      const result = await requestGeminiCategorization(payload);
      sendJson(response, 200, {
        geminiConfigured: true,
        geminiModel,
        ...result
      });
    } catch (error) {
      sendJson(response, 500, {
        error: error.message || "Failed to categorize with Gemini"
      });
    }
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/gemini-category-profile") {
    if (!isGeminiConfigured()) {
      sendJson(response, 503, {
        error: "Gemini is not configured",
        geminiConfigured: false
      });
      return;
    }

    try {
      const payload = await readJsonBody(request);
      if (!Array.isArray(payload.products) || payload.products.length === 0) {
        sendJson(response, 400, {
          error: "Request must include a small products array to summarize"
        });
        return;
      }

      const profile = await requestGeminiCategoryProfile(payload);
      sendJson(response, 200, {
        geminiConfigured: true,
        geminiModel,
        ...profile,
        profile
      });
    } catch (error) {
      sendJson(response, 500, {
        error: error.message || "Failed to summarize category profile with Gemini"
      });
    }
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405);
    response.end("Method Not Allowed");
    return;
  }

  const safePath = path.normalize(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(__dirname) || !existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not Found");
    return;
  }

  serveFile(filePath, response);
});

server.listen(port, () => {
  console.log(`66 Northur categorization dashboard running at http://localhost:${port}`);
});
