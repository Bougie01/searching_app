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
  playgroundCategory: "All",
  categoryProfiles: []
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
const profileStatus = document.getElementById("profileStatus");
const profileGrid = document.getElementById("profileGrid");
const profileTemplate = document.getElementById("profileCardTemplate");
const discoverPetProfilesButton = document.getElementById("discoverPetProfilesButton");
const profileDiscoveryResults = document.getElementById("profileDiscoveryResults");

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

function formatEvidenceFeature(feature) {
  const text = String(feature || "");
  const [prefix, ...rest] = text.split(":");
  const value = rest.join(":") || prefix;
  return `${prefix}: ${value.replace(/-/g, " ")}`;
}

function normalizeForLanguageCheck(value) {
  return String(value || "")
    .toLocaleLowerCase("is-IS")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function looksIcelandicText(value) {
  const text = String(value || "").trim();
  if (!text) {
    return false;
  }

  if (/[ðþæöáíúéóý]/iu.test(text)) {
    return true;
  }

  const normalized = normalizeForLanguageCheck(` ${text} `);
  const signals = [
    " og ",
    " með ",
    " fyrir ",
    " innihald",
    " hunda",
    " hundur",
    " ketti",
    " kettir",
    " katta",
    " fugla",
    " fisk",
    " leidbeining",
    " raki",
    " naering",
    " samsetning",
    " vatni"
  ];

  return signals.some((signal) => normalized.includes(signal));
}

function extractIcelandicFields(record) {
  const translationIs = record.translations?.is || {};
  const icelandicName = [
    translationIs.name,
    record.productName,
    record.name
  ].find(looksIcelandicText) || "";
  const icelandicDescription = [
    translationIs.description,
    record.description
  ].find(looksIcelandicText) || "";

  return {
    name: icelandicName || record.productName || record.name || "",
    description: icelandicDescription
  };
}

function renderModelExplanation(container, explanation) {
  container.innerHTML = "";

  const title = document.createElement("span");
  title.className = "comparison-label";
  title.textContent = "Local model explanation";
  container.appendChild(title);

  if (!explanation) {
    const empty = document.createElement("p");
    empty.className = "model-explanation-text";
    empty.textContent = "Rerun apply_category_model.py to include detailed local model explanations for this artifact.";
    container.appendChild(empty);
    return;
  }

  const summary = document.createElement("p");
  summary.className = "model-explanation-text";
  summary.textContent = explanation.formula || "The local model blends feature matches, category similarity, and nearest-neighbor votes.";
  container.appendChild(summary);

  const components = document.createElement("div");
  components.className = "model-explanation-chips";
  (explanation.componentScores || []).slice(0, 3).forEach((item) => {
    components.appendChild(
      buildChip(
        `${formatCategoryLabel(item.category)}: ${Math.round((item.finalProbability || 0) * 100)}%`,
        "similar-chip"
      )
    );
  });
  container.appendChild(components);

  const evidence = document.createElement("div");
  evidence.className = "model-explanation-chips";
  (explanation.featureEvidence || []).slice(0, 4).forEach((item) => {
    evidence.appendChild(buildChip(formatEvidenceFeature(item.feature), "tag"));
  });

  if (evidence.children.length > 0) {
    container.appendChild(evidence);
  }
}

function renderProfileMatches(container, matches = []) {
  container.innerHTML = "";
  if (!matches.length) {
    return;
  }

  const label = document.createElement("span");
  label.className = "comparison-label";
  label.textContent = "Description profile matches";
  container.appendChild(label);

  const chips = document.createElement("div");
  chips.className = "model-explanation-chips";
  matches.slice(0, 3).forEach((match) => {
    chips.appendChild(buildChip(`${match.name} ${Math.round(match.score * 100)}%`, "similar-chip"));
  });
  container.appendChild(chips);
}

function productMatchesProfile(record, profile) {
  const profileLabel = String(profile.categoryLabel || "").toLowerCase();
  const profileName = String(profile.name || "").toLowerCase();
  const values = [
    record.currentCategory,
    record.suggestedCategory,
    record.canonicalLabel,
    record.externalCategoryPath,
    ...(record.allCategories || [])
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return values.some((value) => value === profileLabel || value.includes(profileName) || profileLabel.includes(value));
}

function collectProfileSample(profile) {
  const reviewRecords = state.records
    .filter((record) => productMatchesProfile(record, profile) || (record.profileMatches || []).some((match) => match.id === profile.id))
    .slice(0, 6)
    .map((record) => {
      const icelandic = extractIcelandicFields(record);
      return {
        name: icelandic.name || record.name,
        description: icelandic.description,
        currentCategory: record.currentCategory,
        suggestedCategory: record.suggestedCategory,
        tags: record.tags || []
      };
    })
    .filter((record) => record.description);
  const playgroundRecords = state.playgroundRecords
    .filter((record) => productMatchesProfile(record, profile) || (record.profileMatches || []).some((match) => match.id === profile.id))
    .slice(0, 6)
    .map((record) => {
      const icelandic = extractIcelandicFields(record);
      return {
        productName: icelandic.name || record.productName,
        description: icelandic.description,
        currentCategory: record.currentCategory,
        canonicalLabel: record.canonicalLabel,
        suggestedCategory: record.suggestedCategory,
        tags: record.tags || []
      };
    })
    .filter((record) => record.description);

  return [...reviewRecords, ...playgroundRecords].slice(0, 10);
}

function collectPetStoreDescriptionSample(limit = 12) {
  const seenCategories = new Set();
  const primary = [];
  const fallback = [];

  state.playgroundRecords.forEach((record) => {
    const text = [
      record.productName,
      record.description,
      record.currentCategory,
      record.canonicalLabel,
      record.suggestedCategory,
      ...(record.tags || [])
    ].filter(Boolean).join(" ");
    const isPetRecord =
      String(record.canonicalLabel || "").toLowerCase().startsWith("pet >") ||
      String(record.canonicalDomain || "").toLowerCase() === "pet" ||
      /hund|katt|fugl|fisk|pet|dog|cat|bird|aquarium|fodur|fóður/i.test(text);

    const icelandic = extractIcelandicFields(record);
    if (!isPetRecord || !icelandic.description) {
      return;
    }

    const sample = {
      productName: icelandic.name || record.productName,
      description: icelandic.description,
      currentCategory: record.currentCategory,
      canonicalLabel: record.canonicalLabel,
      suggestedCategory: record.suggestedCategory,
      tags: record.tags || []
    };

    const categoryKey = record.canonicalLabel || record.suggestedCategory || record.currentCategory || "unknown";
    if (!seenCategories.has(categoryKey)) {
      seenCategories.add(categoryKey);
      primary.push(sample);
    } else {
      fallback.push(sample);
    }
  });

  return [...primary, ...fallback].slice(0, limit);
}

function renderDiscoveredProfiles(profiles = []) {
  profileDiscoveryResults.innerHTML = "";
  profileDiscoveryResults.hidden = false;

  if (!profiles.length) {
    profileDiscoveryResults.innerHTML = `
      <article class="profile-card">
        <h3 class="profile-name">No profiles returned</h3>
        <p class="profile-description">Gemini did not find reusable profiles from this sample.</p>
      </article>
    `;
    return;
  }

  profiles.forEach((profile) => {
    const card = document.createElement("article");
    card.className = "profile-card discovered-profile-card";

    const label = document.createElement("span");
    label.className = "comparison-label";
    label.textContent = profile.categoryLabel || "Discovered profile";
    card.appendChild(label);

    const name = document.createElement("h3");
    name.className = "profile-name";
    name.textContent = profile.name || "Unnamed profile";
    card.appendChild(name);

    const description = document.createElement("p");
    description.className = "profile-description";
    description.textContent = profile.description || "No description returned.";
    card.appendChild(description);

    const terms = document.createElement("div");
    terms.className = "profile-terms";
    [...(profile.include || []), ...(profile.exampleTerms || [])].slice(0, 10).forEach((term) => {
      terms.appendChild(buildChip(term, "tag"));
    });
    card.appendChild(terms);

    profileDiscoveryResults.appendChild(card);
  });
}

async function requestPetProfileDiscovery() {
  const products = collectPetStoreDescriptionSample(12);
  discoverPetProfilesButton.disabled = true;
  discoverPetProfilesButton.textContent = "Analyzing Sample...";
  profileDiscoveryResults.hidden = false;
  profileDiscoveryResults.innerHTML = `
    <article class="profile-card">
      <h3 class="profile-name">Gemini is reading the pet-store sample</h3>
      <p class="profile-description">Using ${products.length} filtered Icelandic product descriptions to suggest reusable semantic categories.</p>
    </article>
  `;

  try {
    if (products.length < 3) {
      throw new Error("Not enough pet-store products with Icelandic descriptions are loaded in the playground sample yet.");
    }

    const response = await fetch("/api/gemini-category-profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        mode: "discover",
        categoryName: "Pet store semantic category discovery",
        products,
        outputLanguage: "is"
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Gemini profile discovery failed");
    }

    renderDiscoveredProfiles(payload.profiles || []);
    discoverPetProfilesButton.textContent = "Analyze Again";
  } catch (error) {
    profileDiscoveryResults.innerHTML = `
      <article class="profile-card">
        <h3 class="profile-name">Gemini discovery unavailable</h3>
        <p class="profile-description">${error.message || "Check GEMINI_API_KEY and GEMINI_MODEL in .env, then restart the server."}</p>
      </article>
    `;
    discoverPetProfilesButton.textContent = "Try Again";
  } finally {
    discoverPetProfilesButton.disabled = false;
  }
}

async function requestGeminiProfilePreview(profile, controls) {
  const products = collectProfileSample(profile);
  controls.button.disabled = true;
  controls.button.textContent = "Summarizing...";
  controls.panel.hidden = false;
  controls.name.textContent = "Gemini is summarizing this profile.";
  controls.description.textContent = products.length
    ? "Using a small sample of products that already match this profile."
    : "No product sample was found for this profile yet.";
  controls.terms.innerHTML = "";

  try {
    if (products.length === 0) {
      throw new Error("No matching products with Icelandic descriptions were found for this profile.");
    }

    const response = await fetch("/api/gemini-category-profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        categoryName: profile.name,
        categoryLabel: profile.categoryLabel,
        products,
        outputLanguage: "is"
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Gemini profile summary failed");
    }

    const preview = payload.profile || payload || {};
    controls.name.textContent = preview.name || profile.name;
    controls.description.textContent = preview.description || "Gemini did not return a description.";
    controls.terms.innerHTML = "";
    [...(preview.include || []), ...(preview.exampleTerms || [])].slice(0, 8).forEach((term) => {
      controls.terms.appendChild(buildChip(term, "tag"));
    });
    controls.button.textContent = "Preview again";
  } catch (error) {
    controls.name.textContent = "Gemini profile preview unavailable";
    controls.description.textContent = error.message || "Check GEMINI_API_KEY and GEMINI_MODEL in .env, then restart the server.";
    controls.button.textContent = "Try Preview Again";
  } finally {
    controls.button.disabled = false;
  }
}

function renderCategoryProfiles() {
  profileGrid.innerHTML = "";
  if (!state.categoryProfiles.length) {
    profileGrid.innerHTML = `
      <article class="profile-card">
        <h3 class="profile-name">No category profiles yet</h3>
        <p class="profile-description">Add profiles to data/category_profiles.json to connect products through reusable descriptions.</p>
      </article>
    `;
    return;
  }

  state.categoryProfiles.forEach((profile) => {
    const fragment = profileTemplate.content.cloneNode(true);
    fragment.querySelector(".profile-label").textContent = profile.categoryLabel || "Semantic profile";
    fragment.querySelector(".profile-name").textContent = profile.name;
    fragment.querySelector(".profile-description").textContent = profile.description;

    const terms = fragment.querySelector(".profile-terms");
    [...(profile.include || []), ...(profile.exampleTerms || [])].slice(0, 10).forEach((term) => {
      terms.appendChild(buildChip(term, "tag"));
    });

    const button = fragment.querySelector(".gemini-profile-button");
    const panel = fragment.querySelector(".profile-preview");
    const previewName = fragment.querySelector(".profile-preview-name");
    const previewDescription = fragment.querySelector(".profile-preview-description");
    const previewTerms = fragment.querySelector(".profile-preview-terms");
    button.addEventListener("click", () =>
      requestGeminiProfilePreview(profile, {
        button,
        panel,
        name: previewName,
        description: previewDescription,
        terms: previewTerms
      })
    );

    profileGrid.appendChild(fragment);
  });
}

async function requestGeminiReview(record, controls, options = {}) {
  const icelandicOnly = Boolean(options.icelandicOnly);
  const icelandic = extractIcelandicFields(record);
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
  controls.suggestion.textContent = icelandicOnly
    ? "Gemini is reviewing the Icelandic description."
    : "Gemini is reviewing this product.";
  controls.reasoning.textContent = icelandicOnly
    ? "Comparing the local model suggestion using only the Icelandic description and taxonomy candidates."
    : "Comparing the local model suggestion against the taxonomy candidates.";

  try {
    if (icelandicOnly && !icelandic.description) {
      throw new Error("This product does not have an Icelandic description, so it is skipped for Icelandic-only Gemini testing.");
    }

    const productName = icelandicOnly ? "" : (record.productName || record.name);
    const description = icelandicOnly ? icelandic.description : record.description;
    const currentCategory = icelandicOnly ? "" : record.currentCategory;
    const canonicalLabel = icelandicOnly ? "" : record.canonicalLabel;
    const externalCategoryPath = icelandicOnly ? "" : record.externalCategoryPath;
    const tags = icelandicOnly ? [] : [...(record.tags || []), ...(record.materials || [])];
    const localSuggestion = icelandicOnly ? "" : record.suggestedCategory;
    const topCategories = icelandicOnly ? [] : (record.topCategories || []);

    const response = await fetch("/api/gemini-categorize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        product: {
          productName,
          description,
          currentCategory,
          canonicalLabel,
          externalCategoryPath,
          tags
        },
        candidates: [...candidateSet],
        localSuggestion,
        topCategories,
        outputLanguage: icelandicOnly ? "is" : "en",
        inputMode: icelandicOnly ? "description_only" : "full_context"
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
    controls.button.textContent = icelandicOnly ? "Review IS Description Again" : "Review again with Gemini";
  } catch (error) {
    controls.suggestion.textContent = "Gemini review unavailable";
    controls.reasoning.textContent = error.message || "Check GEMINI_API_KEY and GEMINI_MODEL in .env, then restart the server.";
    controls.button.textContent = icelandicOnly ? "Try IS Review Again" : "Try Gemini again";
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

      renderProfileMatches(fragment.querySelector(".profile-matches"), record.profileMatches);
      renderModelExplanation(fragment.querySelector(".model-explanation"), record.explanation);

      const geminiButton = fragment.querySelector(".gemini-review-button");
      const geminiIcelandicButton = fragment.querySelector(".gemini-icelandic-button");
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
      geminiIcelandicButton.addEventListener("click", () =>
        requestGeminiReview(record, {
          button: geminiIcelandicButton,
          panel: geminiPanel,
          suggestion: geminiSuggestion,
          reasoning: geminiReasoning
        }, {
          icelandicOnly: true
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

      renderProfileMatches(fragment.querySelector(".profile-matches"), record.profileMatches);
      renderModelExplanation(fragment.querySelector(".model-explanation"), record.explanation);

      const geminiButton = fragment.querySelector(".gemini-review-button");
      const geminiIcelandicButton = fragment.querySelector(".gemini-icelandic-button");
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
      geminiIcelandicButton.addEventListener("click", () =>
        requestGeminiReview(record, {
          button: geminiIcelandicButton,
          panel: geminiPanel,
          suggestion: geminiSuggestion,
          reasoning: geminiReasoning
        }, {
          icelandicOnly: true
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

async function loadCategoryProfiles() {
  profileStatus.textContent = "Loading category profiles...";

  try {
    const response = await fetch("/api/category-profiles");
    if (!response.ok) {
      throw new Error(`Failed to load category profiles: ${response.status}`);
    }

    const payload = await response.json();
    state.categoryProfiles = payload.profiles || [];
    profileStatus.textContent = `${state.categoryProfiles.length} semantic profiles loaded. Gemini previews are optional and only summarize small samples.`;
    renderCategoryProfiles();
  } catch (error) {
    profileStatus.textContent = "Category profiles unavailable";
    profileGrid.innerHTML = `
      <article class="profile-card">
        <h3 class="profile-name">Could not load profiles</h3>
        <p class="profile-description">Check data/category_profiles.json and restart the local server.</p>
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

discoverPetProfilesButton.addEventListener("click", requestPetProfileDiscovery);

loadReviewData();
loadModelEvaluation();
loadCategoryProfiles();
