const state = {
  records: [],
  categories: ["All"],
  filter: "all",
  category: "All",
  query: "",
  visibleCount: 10,
  playgroundRecords: [],
  playgroundCategories: ["All"],
  playgroundQuery: "",
  playgroundFilter: "all",
  playgroundCategory: "All"
};

const heroSkuCount = document.getElementById("heroSkuCount");
const heroCategoryCount = document.getElementById("heroCategoryCount");
const mismatchCount = document.getElementById("mismatchCount");
const flaggedCount = document.getElementById("flaggedCount");
const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const categoryFilters = document.getElementById("categoryFilters");
const reviewFilters = document.getElementById("reviewFilters");
const resultsCount = document.getElementById("resultsCount");
const activeQuery = document.getElementById("activeQuery");
const clearFilters = document.getElementById("clearFilters");
const reviewGrid = document.getElementById("reviewGrid");
const reviewTemplate = document.getElementById("reviewCardTemplate");
const loadMoreButton = document.getElementById("loadMoreButton");

const playgroundRowCount = document.getElementById("playgroundRowCount");
const playgroundHighCount = document.getElementById("playgroundHighCount");
const playgroundMediumCount = document.getElementById("playgroundMediumCount");
const playgroundLowCount = document.getElementById("playgroundLowCount");
const playgroundSearchForm = document.getElementById("playgroundSearchForm");
const playgroundSearchInput = document.getElementById("playgroundSearchInput");
const playgroundConfidenceFilters = document.getElementById("playgroundConfidenceFilters");
const playgroundCategoryFilters = document.getElementById("playgroundCategoryFilters");
const playgroundResultsCount = document.getElementById("playgroundResultsCount");
const playgroundClearFilters = document.getElementById("playgroundClearFilters");
const playgroundSource = document.getElementById("playgroundSource");
const playgroundGrid = document.getElementById("playgroundGrid");
const playgroundTemplate = document.getElementById("playgroundCardTemplate");

function buildChip(label, className = "tag") {
  const chip = document.createElement("span");
  chip.className = className;
  chip.textContent = label;
  return chip;
}

function buildButton(label, active, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `filter-chip${active ? " active" : ""}`;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function formatCategoryLabel(label) {
  const text = String(label || "").trim();
  if (!text) {
    return "Unknown";
  }

  const parts = text.split(">").map((part) => part.trim()).filter(Boolean);
  const leaf = parts[parts.length - 1] || text;
  return leaf
    .replace(/-/g, " ")
    .toLocaleLowerCase("is-IS")
    .replace(/(^|\s)(\p{L})/gu, (match, prefix, char) => `${prefix}${char.toLocaleUpperCase("is-IS")}`);
}

async function requestGeminiReview(record, controls) {
  const candidateSet = new Set([
    record.canonicalLabel,
    record.currentCategory,
    record.suggestedCategory,
    ...(record.allCategories || []),
    ...(record.topCategories || []).map((item) => item.category)
  ].filter(Boolean));

  controls.button.disabled = true;
  controls.button.textContent = "Reviewing...";
  controls.panel.hidden = false;
  controls.suggestion.textContent = "Gemini is reviewing this product.";
  controls.reasoning.textContent = "Comparing the local model suggestion against the taxonomy candidates.";

  try {
    const response = await fetch("/api/gemini-categorize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        product: {
          productName: record.productName || record.name,
          description: record.description,
          currentCategory: record.currentCategory,
          canonicalLabel: record.canonicalLabel,
          externalCategoryPath: record.externalCategoryPath,
          tags: [...(record.tags || []), ...(record.materials || [])]
        },
        candidates: [...candidateSet],
        localSuggestion: record.suggestedCategory,
        topCategories: record.topCategories || []
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Gemini review failed");
    }

    const rawConfidence = Number(payload.confidence);
    const normalizedConfidence = Number.isFinite(rawConfidence) && rawConfidence > 1 ? rawConfidence / 100 : rawConfidence;
    const confidenceText = payload.confidence === null || payload.confidence === undefined || !Number.isFinite(normalizedConfidence)
      ? ""
      : ` (${Math.round(normalizedConfidence * 100)}% confidence)`;
    controls.suggestion.textContent = `${formatCategoryLabel(payload.suggestedCategory)}${confidenceText}`;
    controls.reasoning.textContent = payload.reasoning || "Gemini did not provide reasoning.";
    controls.button.textContent = "Review again with Gemini";
  } catch (error) {
    controls.suggestion.textContent = "Gemini review unavailable";
    controls.reasoning.textContent = error.message || "Check GEMINI_API_KEY and GEMINI_MODEL in .env, then restart the server.";
    controls.button.textContent = "Try Gemini again";
  } finally {
    controls.button.disabled = false;
  }
}

function updateSummary(summary) {
  heroSkuCount.textContent = String(summary.productCount);
  heroCategoryCount.textContent = String(Math.max(state.categories.length - 1, 0));
  mismatchCount.textContent = String(summary.mismatchCount);
  flaggedCount.textContent = String(summary.flaggedCount);
}

function renderCategoryFilters() {
  categoryFilters.innerHTML = "";

  state.categories.forEach((category) => {
    categoryFilters.appendChild(
      buildButton(category, state.category === category, () => {
        state.category = category;
        state.visibleCount = 10;
        renderCategoryFilters();
        renderReviewCards();
      })
    );
  });
}

function renderReviewFilters() {
  const filterOptions = [
    { id: "all", label: "All products" },
    { id: "mismatches", label: "Likely mismatches" },
    { id: "flagged", label: "Flagged records" },
    { id: "high-confidence", label: "High confidence" }
  ];

  reviewFilters.innerHTML = "";
  filterOptions.forEach((option) => {
    reviewFilters.appendChild(
      buildButton(option.label, state.filter === option.id, () => {
        state.filter = option.id;
        state.visibleCount = 10;
        renderReviewFilters();
        renderReviewCards();
      })
    );
  });
}

function matchesFilters(record) {
  const matchesCategory =
    state.category === "All" ||
    record.allCategories.includes(state.category) ||
    record.currentCategory === state.category ||
    record.suggestedCategory === state.category;
  const translationSearchText = [
    record.translations?.en?.name,
    record.translations?.en?.subtitle,
    record.translations?.en?.description,
    record.translations?.is?.name,
    record.translations?.is?.subtitle,
    record.translations?.is?.description
  ]
    .filter(Boolean)
    .join(" ");
  const matchesQuery =
    !state.query ||
    `${record.name} ${record.description} ${record.currentCategory} ${record.suggestedCategory} ${record.tags.join(" ")} ${record.flags.join(" ")} ${translationSearchText}`
      .toLowerCase()
      .includes(state.query);

  let matchesReviewFilter = true;
  if (state.filter === "mismatches") {
    matchesReviewFilter = record.currentCategory !== record.suggestedCategory && record.confidence >= 0.68;
  } else if (state.filter === "flagged") {
    matchesReviewFilter = record.flags.length > 0;
  } else if (state.filter === "high-confidence") {
    matchesReviewFilter = record.confidence >= 0.8;
  }

  return matchesCategory && matchesQuery && matchesReviewFilter;
}

function renderReviewCards() {
  const filteredRecords = state.records.filter(matchesFilters);
  const visibleRecords = filteredRecords.slice(0, state.visibleCount);
  reviewGrid.innerHTML = "";

  if (visibleRecords.length === 0) {
    reviewGrid.innerHTML = `
      <article class="review-card">
        <div class="review-body">
          <h3 class="review-name">No matching products</h3>
          <p class="review-description">Try a broader filter or search term.</p>
        </div>
      </article>
    `;
  } else {
    visibleRecords.forEach((record) => {
      const fragment = reviewTemplate.content.cloneNode(true);
      const image = fragment.querySelector(".review-image");

      fragment.querySelector(".review-name").textContent = record.name;
      fragment.querySelector(".review-source").textContent = record.source;
      fragment.querySelector(".current-category").textContent = record.currentCategory;
      fragment.querySelector(".suggested-category").textContent = record.suggestedCategory;
      fragment.querySelector(".confidence-score").textContent = `${Math.round(record.confidence * 100)}% confidence in ${record.suggestedCategory}`;
      fragment.querySelector(".review-description").textContent = record.description;

      const translationPanel = fragment.querySelector(".translation-panel");
      const translationToggle = fragment.querySelector(".translation-toggle");
      const translationEn = record.translations?.en || {};
      const translationIs = record.translations?.is || {};

      fragment.querySelector(".translation-name-en").textContent = translationEn.name || "No English title available";
      fragment.querySelector(".translation-subtitle-en").textContent = translationEn.subtitle || "No English subtitle available";
      fragment.querySelector(".translation-description-en").textContent = translationEn.description || "No English description available";
      fragment.querySelector(".translation-name-is").textContent = translationIs.name || "No Icelandic title available";
      fragment.querySelector(".translation-subtitle-is").textContent = translationIs.subtitle || "No Icelandic subtitle available";
      fragment.querySelector(".translation-description-is").textContent = translationIs.description || "No Icelandic description available";
      translationToggle.setAttribute("aria-expanded", "false");

      translationToggle.addEventListener("click", () => {
        const isHidden = translationPanel.hidden;
        translationPanel.hidden = !isHidden;
        translationToggle.textContent = isHidden ? "Hide EN + IS" : "Show EN + IS";
        translationToggle.setAttribute("aria-expanded", String(isHidden));
      });

      if (record.imageUrl) {
        image.src = record.imageUrl;
        image.alt = record.name;
        image.hidden = false;
      } else {
        image.hidden = true;
      }

      const flags = fragment.querySelector(".review-flags");
      if (record.flags.length === 0) {
        flags.appendChild(buildChip("No issues detected", "status-chip"));
      } else {
        record.flags.forEach((flag) => flags.appendChild(buildChip(flag, "status-chip warning")));
      }

      const tags = fragment.querySelector(".review-tags");
      [...record.tags, ...record.materials].slice(0, 5).forEach((item) => tags.appendChild(buildChip(item)));

      const similar = fragment.querySelector(".review-similar");
      record.similarProducts.forEach((item) => {
        similar.appendChild(buildChip(`${item.name} (${Math.round(item.similarity * 100)}%)`, "similar-chip"));
      });

      const geminiButton = fragment.querySelector(".gemini-review-button");
      const geminiPanel = fragment.querySelector(".gemini-review-panel");
      const geminiSuggestion = fragment.querySelector(".gemini-suggestion");
      const geminiReasoning = fragment.querySelector(".gemini-reasoning");
      geminiButton.addEventListener("click", () =>
        requestGeminiReview(record, {
          button: geminiButton,
          panel: geminiPanel,
          suggestion: geminiSuggestion,
          reasoning: geminiReasoning
        })
      );

      reviewGrid.appendChild(fragment);
    });
  }

  resultsCount.textContent = `${visibleRecords.length} of ${filteredRecords.length} products in review`;

  const remainingCount = filteredRecords.length - visibleRecords.length;
  loadMoreButton.hidden = remainingCount <= 0;
  loadMoreButton.textContent = remainingCount > 10 ? "Load 10 more" : `Load remaining ${remainingCount}`;

  const activeParts = [];
  if (state.query) {
    activeParts.push(`Search: "${state.query}"`);
  }
  if (state.category !== "All") {
    activeParts.push(`Category: ${state.category}`);
  }
  if (state.filter !== "all") {
    activeParts.push(`Review filter: ${state.filter}`);
  }

  activeQuery.hidden = activeParts.length === 0;
  activeQuery.textContent = activeParts.join(" | ");
}

function renderPlaygroundCategoryFilters() {
  playgroundCategoryFilters.innerHTML = "";
  state.playgroundCategories.forEach((category) => {
    playgroundCategoryFilters.appendChild(
      buildButton(formatCategoryLabel(category), state.playgroundCategory === category, () => {
        state.playgroundCategory = category;
        renderPlaygroundCategoryFilters();
        renderPlaygroundCards();
      })
    );
  });
}

function renderPlaygroundConfidenceFilters() {
  const options = [
    { id: "all", label: "All confidence" },
    { id: "high", label: "High confidence" },
    { id: "medium", label: "Medium confidence" },
    { id: "low", label: "Low confidence" }
  ];

  playgroundConfidenceFilters.innerHTML = "";
  options.forEach((option) => {
    playgroundConfidenceFilters.appendChild(
      buildButton(option.label, state.playgroundFilter === option.id, () => {
        state.playgroundFilter = option.id;
        renderPlaygroundConfidenceFilters();
        renderPlaygroundCards();
      })
    );
  });
}

function matchesPlaygroundFilters(record) {
  const matchesCategory = state.playgroundCategory === "All" || record.suggestedCategory === state.playgroundCategory;
  const matchesQuery = !state.playgroundQuery || record.searchText.includes(state.playgroundQuery);

  if (state.playgroundFilter === "high") {
    return matchesCategory && matchesQuery && record.confidence >= 0.75;
  }
  if (state.playgroundFilter === "medium") {
    return matchesCategory && matchesQuery && record.confidence >= 0.45 && record.confidence < 0.75;
  }
  if (state.playgroundFilter === "low") {
    return matchesCategory && matchesQuery && record.confidence < 0.45;
  }

  return matchesCategory && matchesQuery;
}

function renderPlaygroundCards() {
  const filteredRecords = state.playgroundRecords.filter(matchesPlaygroundFilters);
  playgroundGrid.innerHTML = "";

  if (filteredRecords.length === 0) {
    playgroundGrid.innerHTML = `
      <article class="playground-card">
        <div class="review-body">
          <h3 class="review-name">No evaluation rows match</h3>
          <p class="review-description">Run a model prediction file or broaden the filters.</p>
        </div>
      </article>
    `;
  } else {
    filteredRecords.slice(0, 16).forEach((record) => {
      const fragment = playgroundTemplate.content.cloneNode(true);
      const formattedSuggestion = formatCategoryLabel(record.suggestedCategory);
      const formattedCanonical = formatCategoryLabel(record.canonicalLabel);
      const statusWrap = fragment.querySelector(".playground-status");
      const matchesMappedLabel = record.canonicalLabel === record.suggestedCategory;

      fragment.querySelector(".playground-name").textContent = record.productName;
      fragment.querySelector(".playground-raw-category").textContent = record.externalCategoryPath || record.currentCategory;
      fragment.querySelector(".playground-confidence").textContent = `${Math.round(record.confidence * 100)}% confidence in ${formattedSuggestion}`;
      fragment.querySelector(".playground-canonical").textContent = formattedCanonical;
      fragment.querySelector(".playground-suggested").textContent = formattedSuggestion;

      statusWrap.appendChild(
        buildChip(
          matchesMappedLabel ? "Matches mapped label" : "Differs from mapped label",
          matchesMappedLabel ? "status-chip" : "status-chip warning"
        )
      );

      const topCandidates = fragment.querySelector(".playground-top-candidates");
      (record.topCategories || []).forEach((item) => {
        topCandidates.appendChild(buildChip(`${formatCategoryLabel(item.category)} ${Math.round(item.probability * 100)}%`, "similar-chip"));
      });

      const similarWrap = fragment.querySelector(".playground-similar");
      (record.similarProducts || []).forEach((item) => {
        similarWrap.appendChild(buildChip(`${item.name} (${Math.round(item.similarity * 100)}%)`, "tag"));
      });

      const geminiButton = fragment.querySelector(".gemini-review-button");
      const geminiPanel = fragment.querySelector(".gemini-review-panel");
      const geminiSuggestion = fragment.querySelector(".gemini-suggestion");
      const geminiReasoning = fragment.querySelector(".gemini-reasoning");
      geminiButton.addEventListener("click", () =>
        requestGeminiReview(record, {
          button: geminiButton,
          panel: geminiPanel,
          suggestion: geminiSuggestion,
          reasoning: geminiReasoning
        })
      );

      playgroundGrid.appendChild(fragment);
    });
  }

  playgroundResultsCount.textContent = `${Math.min(filteredRecords.length, 16)} of ${filteredRecords.length} evaluation rows shown`;
}

function updatePlaygroundSummary(payload) {
  playgroundRowCount.textContent = String(payload.summary.rowCount || 0);
  playgroundHighCount.textContent = String(payload.summary.confidenceBands?.high || 0);
  playgroundMediumCount.textContent = String(payload.summary.confidenceBands?.medium || 0);
  playgroundLowCount.textContent = String(payload.summary.confidenceBands?.low || 0);
  playgroundSource.textContent = payload.available
    ? `Loaded evaluation source: ${payload.source}`
    : "No external evaluation artifact loaded yet. Run apply_category_model.py to generate one.";
}

async function loadReviewData() {
  resultsCount.textContent = "Loading category review...";

  try {
    const response = await fetch("/api/category-suggestions");
    if (!response.ok) {
      throw new Error(`Failed to load review data: ${response.status}`);
    }

    const payload = await response.json();
    state.records = payload.records;
    state.categories = payload.categories;

    updateSummary(payload.summary);
    renderCategoryFilters();
    renderReviewFilters();
    state.visibleCount = 10;
    renderReviewCards();
  } catch (error) {
    resultsCount.textContent = "Review data unavailable";
    reviewGrid.innerHTML = `
      <article class="review-card">
        <div class="review-body">
          <h3 class="review-name">Category review unavailable</h3>
          <p class="review-description">Start the local server with node server.js and open http://localhost:8000.</p>
        </div>
      </article>
    `;
    console.error(error);
  }
}

async function loadModelEvaluation() {
  playgroundResultsCount.textContent = "Loading model evaluation...";

  try {
    const response = await fetch("/api/model-evaluation");
    if (!response.ok) {
      throw new Error(`Failed to load model evaluation: ${response.status}`);
    }

    const payload = await response.json();
    state.playgroundRecords = payload.records || [];
    state.playgroundCategories = ["All", ...new Set(state.playgroundRecords.map((record) => record.suggestedCategory).filter(Boolean))];

    updatePlaygroundSummary(payload);
    renderPlaygroundConfidenceFilters();
    renderPlaygroundCategoryFilters();
    renderPlaygroundCards();
  } catch (error) {
    playgroundResultsCount.textContent = "Model evaluation unavailable";
    playgroundGrid.innerHTML = `
      <article class="playground-card">
        <div class="review-body">
          <h3 class="review-name">No model evaluation found</h3>
          <p class="review-description">Generate prediction artifacts with apply_category_model.py and reload this page.</p>
        </div>
      </article>
    `;
    console.error(error);
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.query = searchInput.value.trim().toLowerCase();
  state.visibleCount = 10;
  renderReviewCards();
});

clearFilters.addEventListener("click", () => {
  state.query = "";
  state.category = "All";
  state.filter = "all";
  state.visibleCount = 10;
  searchInput.value = "";
  renderCategoryFilters();
  renderReviewFilters();
  renderReviewCards();
});

loadMoreButton.addEventListener("click", () => {
  state.visibleCount += 10;
  renderReviewCards();
});

playgroundSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.playgroundQuery = playgroundSearchInput.value.trim().toLowerCase();
  renderPlaygroundCards();
});

playgroundClearFilters.addEventListener("click", () => {
  state.playgroundQuery = "";
  state.playgroundFilter = "all";
  state.playgroundCategory = "All";
  playgroundSearchInput.value = "";
  renderPlaygroundConfidenceFilters();
  renderPlaygroundCategoryFilters();
  renderPlaygroundCards();
});

loadReviewData();
loadModelEvaluation();
