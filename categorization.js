function buildKeywordMap() {
  return {
    Outerlayers: ["jacket", "coat", "raincoat", "anorak", "parka", "vest", "outerlayer", "waterproof", "windproof"],
    Shells: ["shell", "softshell", "hard shell", "gore-tex", "windstopper"],
    Tops: ["hoodie", "sweater", "shirt", "tee", "top", "fleece", "crewneck", "polo", "zip neck"],
    Bottoms: ["pants", "trouser", "legging", "shorts", "skirt"],
    Dresses: ["dress"],
    Accessories: ["bag", "cap", "hat", "beanie", "scarf", "glove", "socks", "mittens"],
    Gifts: ["gift"],
    Season: ["festival", "summer", "seasonal", "capsule"],
    Catalog: []
  };
}

const keywordMap = buildKeywordMap();

function normalizeTokenSet(product) {
  return new Set(
    `${product.name} ${product.subtitle} ${product.description} ${product.tags.join(" ")} ${product.materials.join(" ")} ${product.searchText}`
      .toLowerCase()
      .split(/[^a-z0-9\u00C0-\u017F]+/i)
      .filter((token) => token.length > 2)
  );
}

function scoreCategory(product, category) {
  const haystack = `${product.name} ${product.subtitle} ${product.description} ${product.tags.join(" ")} ${product.materials.join(" ")}`.toLowerCase();
  const keywords = keywordMap[category] || [];
  let score = 0;

  keywords.forEach((keyword) => {
    if (haystack.includes(keyword.toLowerCase())) {
      score += 3;
    }
  });

  if (product.categories.includes(category)) {
    score += 1;
  }

  if (category === "Catalog") {
    score -= 2;
  }

  return score;
}

export function suggestCategory(product, availableCategories) {
  const candidateCategories = availableCategories.filter((category) => category !== "All");
  const scored = candidateCategories
    .map((category) => ({
      category,
      score: scoreCategory(product, category)
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0] || { category: product.category, score: 0 };
  const second = scored[1] || { score: 0 };
  const confidence = Math.max(0.2, Math.min(0.98, 0.5 + (best.score - second.score) * 0.08 + best.score * 0.02));

  return {
    category: best.score > 0 ? best.category : product.category,
    confidence,
    scored
  };
}

export function findSimilarProducts(product, products, limit = 3) {
  const sourceTokens = normalizeTokenSet(product);

  return products
    .filter((candidate) => candidate.id !== product.id)
    .map((candidate) => {
      const targetTokens = normalizeTokenSet(candidate);
      const intersection = [...sourceTokens].filter((token) => targetTokens.has(token)).length;
      const union = new Set([...sourceTokens, ...targetTokens]).size || 1;
      const similarity = intersection / union;

      return {
        id: candidate.id,
        name: candidate.name,
        category: candidate.category,
        similarity
      };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export function buildReviewRecord(product, products, availableCategories) {
  return buildReviewRecordWithArtifact(product, products, availableCategories, null);
}

export function buildReviewRecordWithArtifact(product, products, availableCategories, artifact) {
  const suggestion = suggestCategory(product, availableCategories);
  const effectiveCategory = artifact?.suggestedCategory || suggestion.category;
  const effectiveConfidence = typeof artifact?.confidence === "number" ? artifact.confidence : suggestion.confidence;
  const flags = [];

  if (product.category === "Catalog") {
    flags.push("Generic category");
  }

  if (effectiveCategory !== product.category && effectiveConfidence >= 0.68) {
    flags.push("Possible misclassification");
  }

  if (!product.imageUrl) {
    flags.push("Missing hero image");
  }

  if (!product.materials.length || product.materials[0] === "Composition pending") {
    flags.push("Missing composition");
  }

  const similarProducts = artifact?.similarProducts?.length
    ? artifact.similarProducts
    : findSimilarProducts(product, products);

  return {
    id: product.id,
    name: product.name,
    source: product.source,
    imageUrl: product.imageUrl,
    currentCategory: product.category,
    allCategories: product.categories,
    suggestedCategory: effectiveCategory,
    confidence: Number(effectiveConfidence.toFixed(2)),
    description: product.description,
    tags: product.tags,
    materials: product.materials,
    flags,
    similarProducts,
    baselineSource: artifact?.baselineSource || "heuristic",
    translations: product.translations
  };
}

export function buildCategoryReview(products, artifactsById = {}) {
  const availableCategories = ["All", ...new Set(products.flatMap((product) => product.categories))];
  const records = products.map((product) =>
    buildReviewRecordWithArtifact(product, products, availableCategories, artifactsById[product.id] || null)
  );
  const mismatches = records.filter((record) => record.currentCategory !== record.suggestedCategory && record.confidence >= 0.68);
  const flagged = records.filter((record) => record.flags.length > 0);

  return {
    categories: availableCategories,
    summary: {
      productCount: products.length,
      mismatchCount: mismatches.length,
      flaggedCount: flagged.length,
      baselineSource: Object.keys(artifactsById).length > 0 ? "embedding-baseline" : "heuristic"
    },
    records
  };
}
