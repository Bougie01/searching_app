const state = {
  records: [],
  categories: ["All"],
  filter: "all",
  category: "All",
  query: "",
  visibleCount: 10
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
  const matchesCategory = state.category === "All" || record.allCategories.includes(state.category) || record.currentCategory === state.category || record.suggestedCategory === state.category;
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
      fragment.querySelector(".confidence-score").textContent = `${Math.round(record.confidence * 100)}% confidence`;
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

loadReviewData();
