import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "data" / "catalog.json"
OUTPUT_PATH = ROOT / "data" / "prepared_products.json"

NON_TAXONOMY_CATEGORIES = {"Constantinou", "Capsule"}


def load_catalog():
    raw_text = CATALOG_PATH.read_text(encoding="utf-8-sig")
    return json.loads(raw_text)


def title_case(value: str) -> str:
    return str(value or "").replace("-", " ").replace("_", " ").title().strip()


def get_attribute(record, code):
    for item in record.get("attributes", []):
        if item.get("attributeCode") == code:
            return item
    return None


def get_attribute_text(record, code):
    item = get_attribute(record, code)
    if not item:
        return ""

    translations = item.get("valueTranslations") or {}
    if translations.get("en-US"):
        return translations["en-US"].strip()

    value = item.get("value") or {}
    if isinstance(value, dict) and isinstance(value.get("text"), str):
        return value["text"].strip()

    return ""


def get_attribute_list(record, code):
    item = get_attribute(record, code)
    if not item:
        return []

    results = []
    for value in item.get("values", []):
        translations = value.get("displayTranslations") or {}
        results.append((translations.get("en-US") or value.get("displayValue") or value.get("code") or "").strip())

    return [item for item in results if item]


def normalize_category(raw_category):
    if not raw_category:
        return "Catalog"

    parts = raw_category.split("-")
    normalized = title_case(parts[-1])
    return normalized


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize_record(record):
    product = record.get("product", {})
    category_values = get_attribute_list(record, "Categories")
    all_categories = sorted({normalize_category(value) for value in category_values if value})
    taxonomy_categories = [category for category in all_categories if category not in NON_TAXONOMY_CATEGORIES]
    collection_tags = [category for category in all_categories if category in NON_TAXONOMY_CATEGORIES]

    title = get_attribute_text(record, "MarketingName") or product.get("productName") or ""
    subtitle = get_attribute_text(record, "MarketingShort") or get_attribute_text(record, "ListingDescription")
    description = (
        get_attribute_text(record, "ProductDescription")
        or get_attribute_text(record, "MarketingLong")
        or get_attribute_text(record, "Marketing_long_EN")
        or get_attribute_text(record, "DesignNotes")
    )
    materials = [
        item
        for item in [
            get_attribute_text(record, "SummaryComposition"),
            get_attribute_text(record, "ShortComposition"),
            get_attribute_text(record, "Composition"),
        ]
        if item
    ]
    tags = []
    for attribute_code in [
        "Style",
        "Fit",
        "Functionality",
        "GarmentType",
        "GarmentSubtype",
        "SuitableFor",
        "Length",
        "FabricConstruction",
        "Compliance",
    ]:
        tags.extend(get_attribute_list(record, attribute_code))
    tags.extend(collection_tags)

    searchable_text = clean_text(" ".join([title, subtitle, description, " ".join(materials), " ".join(tags)]))

    return {
        "id": record.get("id"),
        "source_system": product.get("sourceSystem"),
        "external_product_id": product.get("externalProductId"),
        "product_name": clean_text(title),
        "subtitle": clean_text(subtitle),
        "description": clean_text(description),
        "current_status": product.get("status"),
        "current_main_group": product.get("mainGroup"),
        "current_category": taxonomy_categories[0] if taxonomy_categories else "Catalog",
        "all_categories": taxonomy_categories,
        "collection_tags": collection_tags,
        "materials": materials,
        "tags": sorted({clean_text(tag) for tag in tags if tag}),
        "searchable_text": searchable_text,
        "attributes_present": sorted(
            item.get("attributeCode") for item in record.get("attributes", []) if item.get("attributeCode")
        ),
    }


def main():
    catalog = load_catalog()
    prepared = [normalize_record(record) for record in catalog]
    OUTPUT_PATH.write_text(json.dumps(prepared, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(prepared)} prepared records to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
