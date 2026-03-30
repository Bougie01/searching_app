const textDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { fatal: false }) : null;

export function repairTextEncoding(value) {
  const text = String(value || "");
  if (!text) {
    return "";
  }

  const looksMojibake = /[ÃÂâ€™€ž¢œ]/.test(text);
  if (!looksMojibake || !textDecoder) {
    return text.replace(/^\uFEFF/, "");
  }

  try {
    const bytes = Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
    const repaired = textDecoder.decode(bytes);
    return repaired.replace(/^\uFEFF/, "");
  } catch {
    return text.replace(/^\uFEFF/, "");
  }
}

export function titleCase(value) {
  return repairTextEncoding(value)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

export function getAttribute(record, code) {
  return record.attributes?.find((attribute) => attribute.attributeCode === code);
}

export function getAttributeText(record, code) {
  const attribute = getAttribute(record, code);
  if (!attribute) {
    return "";
  }

  if (attribute.valueTranslations?.["en-US"]) {
    return repairTextEncoding(attribute.valueTranslations["en-US"]);
  }

  if (attribute.value && typeof attribute.value.text === "string") {
    return repairTextEncoding(attribute.value.text);
  }

  return "";
}

export function getAttributeLocalizedText(record, code, locale) {
  const attribute = getAttribute(record, code);
  if (!attribute) {
    return "";
  }

  if (attribute.valueTranslations?.[locale]) {
    return repairTextEncoding(attribute.valueTranslations[locale]);
  }

  return "";
}

export function getAttributeList(record, code) {
  const attribute = getAttribute(record, code);
  if (!attribute || !Array.isArray(attribute.values)) {
    return [];
  }

  return attribute.values
    .map((item) => repairTextEncoding(item.displayTranslations?.["en-US"] || item.displayValue || item.code))
    .filter(Boolean);
}

export function normalizeCategory(rawCategory) {
  if (!rawCategory) {
    return "Catalog";
  }

  const parts = rawCategory.split("-");
  return titleCase(parts[parts.length - 1]);
}

const nonTaxonomyCategories = new Set(["Constantinou", "Capsule"]);

export function isTaxonomyCategory(category) {
  return Boolean(category) && !nonTaxonomyCategories.has(category);
}

export function pickHeroImage(record) {
  const primaryImage = record.images?.find((item) => item.isPrimary)?.image?.fileUrl;
  const firstImage = record.images?.[0]?.image?.fileUrl;
  const importedImage = getAttributeList(record, "imageUrl")[0];
  return primaryImage || firstImage || importedImage || "";
}

export function normalizeDatabaseProduct(record) {
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
  const allNormalizedCategories = [...new Set(categoryValues.map(normalizeCategory).filter(Boolean))];
  const normalizedCategories = allNormalizedCategories.filter(isTaxonomyCategory);
  const collectionTags = allNormalizedCategories.filter((category) => !isTaxonomyCategory(category));
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
    ...collectionTags,
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
  const translations = {
    en: {
      name: marketingName || titleCase(record.product?.productName),
      subtitle,
      description
    },
    is: {
      name:
        getAttributeLocalizedText(record, "MarketingName", "is-IS") ||
        getAttributeLocalizedText(record, "ListingDescription", "is-IS") ||
        "",
      subtitle:
        getAttributeLocalizedText(record, "MarketingShort", "is-IS") ||
        getAttributeLocalizedText(record, "ListingDescription", "is-IS") ||
        "",
      description:
        getAttributeLocalizedText(record, "ProductDescription", "is-IS") ||
        getAttributeLocalizedText(record, "MarketingLong", "is-IS") ||
        getAttributeLocalizedText(record, "DesignNotes", "is-IS") ||
        ""
    }
  };

  const searchText = [
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
    searchText,
    translations
  };
}

export function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function scoreProduct(product, queryTokens) {
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

export function rankProducts(products, query, category = "All", sort = "relevance") {
  const queryTokens = tokenize(query);

  const visibleProducts = products
    .map((product) => ({
      ...product,
      relevance: scoreProduct(product, queryTokens)
    }))
    .filter((product) => {
      const matchesCategory = category === "All" || product.categories.includes(category);
      const matchesQuery = queryTokens.length === 0 || product.relevance > 0;
      return matchesCategory && matchesQuery;
    });

  visibleProducts.sort((a, b) => {
    if (sort === "price-low") {
      return (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY);
    }

    if (sort === "price-high") {
      return (b.price ?? Number.NEGATIVE_INFINITY) - (a.price ?? Number.NEGATIVE_INFINITY);
    }

    if (sort === "newest") {
      return new Date(b.dropDate) - new Date(a.dropDate);
    }

    return b.relevance - a.relevance || new Date(b.dropDate) - new Date(a.dropDate);
  });

  return visibleProducts;
}
