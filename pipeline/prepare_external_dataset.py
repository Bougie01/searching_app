import argparse
import json
import re
from pathlib import Path

from taxonomy_mapping import load_mapping_config, map_external_record


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_PATH = ROOT / "data" / "prepared_external_products.json"


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def clean_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


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
    if translations.get("is-IS"):
        return translations["is-IS"].strip()

    value = item.get("value") or {}
    if isinstance(value, dict):
        if isinstance(value.get("text"), str):
            return value["text"].strip()
        if value.get("decimal") is not None:
            return str(value["decimal"]).strip()

    if isinstance(item.get("value"), str):
        return str(item["value"]).strip()

    return ""


def get_attribute_list(record, code):
    item = get_attribute(record, code)
    if not item:
        return []

    values = []
    for value in item.get("values", []):
        translations = value.get("displayTranslations") or {}
        values.append(
            (
                translations.get("en-US")
                or translations.get("is-IS")
                or value.get("displayValue")
                or value.get("code")
                or ""
            ).strip()
        )

    return [value for value in values if value]


def normalize_record(record, mapping_config):
    product = record.get("product", {})
    category_path = get_attribute_list(record, "categoryPath")
    mapped_taxonomy = map_external_record(category_path[0] if category_path else "", mapping_config)

    brand = get_attribute_list(record, "brand")
    availability = get_attribute_list(record, "availability")
    condition = get_attribute_list(record, "condition")
    currency = get_attribute_list(record, "currency")
    title = clean_text(product.get("productName"))
    subtitle = clean_text(mapped_taxonomy["path_parts"][-1] if mapped_taxonomy.get("path_parts") else product.get("mainGroup"))
    description = clean_text(get_attribute_text(record, "description"))
    price = clean_text(get_attribute_text(record, "price"))

    tags = sorted(
        {
            clean_text(value)
            for value in [
                *brand,
                *availability,
                *condition,
                *currency,
                *mapped_taxonomy.get("path_parts", [])[1:],
                f"price:{price}" if price else "",
            ]
            if clean_text(value)
        }
    )
    searchable_text = clean_text(" ".join([title, subtitle, description, " ".join(tags)]))

    return {
        "id": record.get("id"),
        "source_system": product.get("sourceSystem"),
        "external_product_id": product.get("externalProductId"),
        "product_name": title,
        "subtitle": subtitle,
        "description": description,
        "current_status": product.get("status"),
        "current_main_group": product.get("mainGroup"),
        "current_category": clean_text(category_path[0] if category_path else "External"),
        "all_categories": mapped_taxonomy.get("path_parts", []),
        "taxonomy_paths": mapped_taxonomy["raw_paths"],
        "canonical_domain": mapped_taxonomy["domain"],
        "canonical_category": mapped_taxonomy["category"],
        "canonical_label": mapped_taxonomy["label"],
        "taxonomy_mapping_matched": mapped_taxonomy["matched"],
        "collection_tags": [],
        "materials": [],
        "tags": tags,
        "searchable_text": searchable_text,
        "attributes_present": sorted(
            item.get("attributeCode") for item in record.get("attributes", []) if item.get("attributeCode")
        ),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH)
    args = parser.parse_args()

    mapping_config = load_mapping_config()
    rows = load_json(args.input)
    prepared = [normalize_record(record, mapping_config) for record in rows]
    args.output.write_text(json.dumps(prepared, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(prepared)} prepared records to {args.output}")


if __name__ == "__main__":
    main()
