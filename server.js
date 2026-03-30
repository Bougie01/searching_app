import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeDatabaseProduct } from "./catalog.js";
import { buildCategoryReview } from "./categorization.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.PORT || 8000);

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

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
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

async function loadCategoryReview() {
  if (!categoryReviewPromise) {
    categoryReviewPromise = Promise.all([loadCatalog(), loadBaselineArtifacts()]).then(([products, artifacts]) =>
      buildCategoryReview(products, artifacts)
    );
  }

  return categoryReviewPromise;
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
      mode: "product-category-suggestions"
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
