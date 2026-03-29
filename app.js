const state = {
  query: "",
  category: "All",
  sort: "relevance",
  products: [],
  categories: ["All"]
};

const productGrid = document.getElementById("productGrid");
const productTemplate = document.getElementById("productCardTemplate");
const searchInput = document.getElementById("searchInput");
const categoryFilters = document.getElementById("categoryFilters");
const sortSelect = document.getElementById("sortSelect");
const resultsCount = document.getElementById("resultsCount");
const activeQuery = document.getElementById("activeQuery");
const clearFilters = document.getElementById("clearFilters");
const heroSkuCount = document.getElementById("heroSkuCount");
const heroCategoryCount = document.getElementById("heroCategoryCount");

function titleCase(value) {
  return String(value || "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function getAttribute(record, code) {
  return record.attributes?.find((attribute) => attribute.attributeCode === code);
}

function getAttributeText(record, code) {
  const attribute = getAttribute(record, code);
  if (!attribute) {
    return "";
  }

  if (attribute.valueTranslations?.["en-US"]) {
    return attribute.valueTranslations["en-US"];
  }

  if (attribute.value && typeof attribute.value.text === "string") {
    return attribute.value.text;
  }

  return "";
}

function getAttributeList(record, code) {
  const attribute = getAttribute(record, code);
  if (!attribute || !Array.isArray(attribute.values)) {
    return [];
  }

  return attribute.values
    .map((item) => item.displayTranslations?.["en-US"] || item.displayValue || item.code)
    .filter(Boolean);
}

function normalizeCategory(rawCategory) {
  if (!rawCategory) {
    return "Catalog";
  }

  const parts = rawCategory.split("-");
  return titleCase(parts[parts.length - 1]);
}

function pickHeroImage(record) {
  const primaryImage = record.images?.find((item) => item.isPrimary)?.image?.fileUrl;
  const firstImage = record.images?.[0]?.image?.fileUrl;
  const importedImage = getAttributeList(record, "imageUrl")[0];
  return primaryImage || firstImage || importedImage || "";
}

function normalizeDatabaseProduct(record) {
  const marketingName = getAttributeText(record, "MarketingName");
  const marketingShort = getAttributeText(record, "MarketingShort") || getAttributeText(record, "Marketing_short_EN");
  const marketingLong = getAttributeText(record, "MarketingLong") || getAttributeText(record, "Marketing_long_EN");
  const listingDescription = getAttributeText(record, "ListingDescription");
  const productDescription = getAttributeText(record, "ProductDescription");
  const designNotes = getAttributeText(record, "DesignNotes");
  const summaryComposition = getAttributeText(record, "SummaryComposition");
  const shortComposition = getAttributeText(record, "ShortComposition");
  const fullComposition = getAttributeText(record, "Composition");
  const sizeFit = getAttributeText(record, "SizeFit");
  const productType = getAttributeText(record, "ProductType");

  const categoryValues = getAttributeList(record, "Categories");
  const normalizedCategories = [...new Set(categoryValues.map(normalizeCategory).filter(Boolean))];
  const styleValues = getAttributeList(record, "Style");
  const fitValues = getAttributeList(record, "Fit");
  const functionalityValues = getAttributeList(record, "Functionality");
  const garmentTypeValues = getAttributeList(record, "GarmentType");
  const garmentSubtypeValues = getAttributeList(record, "GarmentSubtype");
  const suitableForValues = getAttributeList(record, "SuitableFor");
  const lengthValues = getAttributeList(record, "Length");
  const fabricConstructionValues = getAttributeList(record, "FabricConstruction");
  const complianceValues = getAttributeList(record, "Compliance");

  const materials = [summaryComposition, shortComposition, fullComposition].filter(Boolean);
  const tags = [
    ...styleValues,
    ...fitValues,
    ...functionalityValues,
    ...garmentTypeValues,
    ...garmentSubtypeValues,
    ...suitableForValues,
    ...lengthValues,
    ...fabricConstructionValues,
    ...complianceValues
  ].filter(Boolean);

  const description = productDescription || marketingLong || designNotes || marketingShort || listingDescription || record.product?.productName || "Imported product";
  const subtitle = marketingShort || listingDescription || productType || "Imported from product database";
  const category = normalizedCategories[0] || styleValues[0] || titleCase(productType) || "Catalog";

  const searchFields = [
    record.id,
    record.product?.productName,
    record.product?.canonicalName,
    record.product?.mainGroup,
    record.product?.externalProductId,
    record.product?.sourceSystem,
    marketingName,
    marketingShort,
    marketingLong,
    listingDescription,
    productDescription,
    designNotes,
    summaryComposition,
    shortComposition,
    fullComposition,
    sizeFit,
    productType,
    ...normalizedCategories,
    ...styleValues,
    ...fitValues,
    ...functionalityValues,
    ...garmentTypeValues,
    ...garmentSubtypeValues,
    ...suitableForValues,
    ...lengthValues,
    ...fabricConstructionValues,
    ...complianceValues
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    id: record.id,
    name: marketingName || titleCase(record.product?.productName),
    subtitle,
    category,
    categories: normalizedCategories.length > 0 ? normalizedCategories : [category],
    price: null,
    materials: materials.length > 0 ? materials : ["Composition pending"],
    tags: [...new Set(tags)].slice(0, 8),
    description: description.replace(/\s+/g, " ").trim(),
    imageUrl: pickHeroImage(record),
    gradient: "linear-gradient(135deg, #95aab4, #204658)",
    badge: record.product?.status || "Imported",
    source: `${record.product?.sourceSystem || "DB"} ${record.product?.externalProductId || ""}`.trim(),
    dropDate: String(record.product?.updatedAt || record.product?.createdAt || "2026-01-01").slice(0, 10),
    searchText
  };
}

function formatPrice(price) {
  if (typeof price !== "number") {
    return "Price pending";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(price);
}

function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function scoreProduct(product, queryTokens) {
  if (queryTokens.length === 0) {
    return 1;
  }

  return queryTokens.reduce((score, token) => {
    let tokenScore = 0;

    if (product.name.toLowerCase().includes(token)) {
      tokenScore += 8;
    }

    if (product.subtitle.toLowerCase().includes(token)) {
      tokenScore += 5;
    }

    if (product.category.toLowerCase().includes(token)) {
      tokenScore += 6;
    }

    if (product.searchText.includes(token)) {
      tokenScore += 4;
    }

    if (product.name.toLowerCase().startsWith(token)) {
      tokenScore += 2;
    }

    return score + tokenScore;
  }, 0);
}

function buildTag(label) {
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = label;
  return tag;
}

function buildImage(product, container) {
  const image = container.querySelector(".product-image");

  if (product.imageUrl) {
    image.src = product.imageUrl;
    image.alt = product.name;
    image.hidden = false;
  } else {
    image.removeAttribute("src");
    image.alt = "";
    image.hidden = true;
  }
}

function renderHeroMetrics() {
  heroSkuCount.textContent = String(state.products.length);
  heroCategoryCount.textContent = String(Math.max(state.categories.length - 1, 0));
}

function renderCategoryFilters() {
  categoryFilters.innerHTML = "";

  state.categories.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-chip${state.category === category ? " active" : ""}`;
    button.textContent = category;
    button.addEventListener("click", () => {
      state.category = category;
      renderCategoryFilters();
      renderProducts();
    });
    categoryFilters.appendChild(button);
  });
}

function renderProducts() {
  const queryTokens = tokenize(state.query);

  let visibleProducts = state.products
    .map((product) => ({
      ...product,
      relevance: scoreProduct(product, queryTokens)
    }))
    .filter((product) => {
      const matchesCategory = state.category === "All" || product.categories.includes(state.category);
      const matchesQuery = queryTokens.length === 0 || product.relevance > 0;
      return matchesCategory && matchesQuery;
    });

  visibleProducts.sort((a, b) => {
    if (state.sort === "price-low") {
      return (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY);
    }

    if (state.sort === "price-high") {
      return (b.price ?? Number.NEGATIVE_INFINITY) - (a.price ?? Number.NEGATIVE_INFINITY);
    }

    if (state.sort === "newest") {
      return new Date(b.dropDate) - new Date(a.dropDate);
    }

    return b.relevance - a.relevance || new Date(b.dropDate) - new Date(a.dropDate);
  });

  productGrid.innerHTML = "";

  if (visibleProducts.length === 0) {
    productGrid.innerHTML = `
      <article class="product-card">
        <div class="product-body">
          <h3 class="product-name">No matches yet</h3>
          <p class="product-description">
            Try a broader phrase like "rain jacket", "commuting", "wool", or "waterproof".
          </p>
        </div>
      </article>
    `;
  } else {
    visibleProducts.forEach((product) => {
      const fragment = productTemplate.content.cloneNode(true);
      const art = fragment.querySelector(".product-art");

      fragment.querySelector(".product-category").textContent = product.category;
      fragment.querySelector(".product-gradient").style.background = product.gradient;
      fragment.querySelector(".product-name").textContent = product.name;
      fragment.querySelector(".product-subtitle").textContent = product.subtitle;
      fragment.querySelector(".product-price").textContent = formatPrice(product.price);
      fragment.querySelector(".product-description").textContent = product.description;
      fragment.querySelector(".product-badge").textContent = product.badge;
      fragment.querySelector(".product-source").textContent = product.source;
      buildImage(product, art);

      const meta = fragment.querySelector(".product-meta");
      [...product.materials, ...product.tags].slice(0, 5).forEach((item) => {
        meta.appendChild(buildTag(item));
      });

      productGrid.appendChild(fragment);
    });
  }

  resultsCount.textContent = `${visibleProducts.length} products found`;

  const queryParts = [];
  if (state.query.trim()) {
    queryParts.push(`Query: "${state.query.trim()}"`);
  }
  if (state.category !== "All") {
    queryParts.push(`Category: ${state.category}`);
  }

  activeQuery.hidden = queryParts.length === 0;
  activeQuery.textContent = queryParts.join(" | ");
}

function setLoadingState(message) {
  resultsCount.textContent = message;
  productGrid.innerHTML = "";
}

async function loadCatalog() {
  setLoadingState("Loading imported catalog...");

  try {
    const response = await fetch("./data/catalog.json");
    if (!response.ok) {
      throw new Error(`Failed to load catalog: ${response.status}`);
    }

    const rawItems = await response.json();
    state.products = rawItems.map(normalizeDatabaseProduct);
    state.categories = ["All", ...new Set(state.products.flatMap((product) => product.categories))];

    renderHeroMetrics();
    renderCategoryFilters();
    renderProducts();
  } catch (error) {
    resultsCount.textContent = "Could not load catalog";
    productGrid.innerHTML = `
      <article class="product-card">
        <div class="product-body">
          <h3 class="product-name">Catalog load failed</h3>
          <p class="product-description">
            Start the site from a local web server so the browser can fetch data/catalog.json.
          </p>
        </div>
      </article>
    `;
    console.error(error);
  }
}

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderProducts();
});

sortSelect.addEventListener("change", (event) => {
  state.sort = event.target.value;
  renderProducts();
});

clearFilters.addEventListener("click", () => {
  state.query = "";
  state.category = "All";
  state.sort = "relevance";
  searchInput.value = "";
  sortSelect.value = "relevance";
  renderCategoryFilters();
  renderProducts();
});

loadCatalog();
