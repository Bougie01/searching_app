import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MAPPING_PATH = ROOT / "data" / "taxonomy_mapping.json"


def load_mapping_config(path=MAPPING_PATH):
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_label(value):
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def build_fallback_mapping(domain, category):
    normalized_domain = normalize_label(domain) or "unknown"
    normalized_category = normalize_label(category).replace(" ", "-") or "unknown"
    return {
        "domain": normalized_domain,
        "category": normalized_category,
        "label": f"{normalized_domain} > {normalized_category}",
        "matched": False,
    }


def map_apparel_category(raw_category, mapping_config):
    cleaned = str(raw_category or "").strip()
    match = mapping_config.get("apparel", {}).get("category_rules", {}).get(cleaned)
    if match:
        return {
            "domain": match["domain"],
            "category": match["category"],
            "label": match["label"],
            "matched": True,
        }

    return build_fallback_mapping("apparel", cleaned or "uncategorized")


def map_path_to_taxonomy(path_value, mapping_config):
    normalized_path = normalize_label(path_value)
    rules = mapping_config.get("pet", {}).get("path_contains_rules", [])

    for rule in rules:
        tokens = [normalize_label(token) for token in rule.get("tokens", []) if normalize_label(token)]
        if tokens and all(token in normalized_path for token in tokens):
            return {
                "domain": rule["domain"],
                "category": rule["category"],
                "label": rule["label"],
                "matched": True,
            }

    return build_fallback_mapping("external", path_value or "unknown")


def map_apparel_record(raw_categories, mapping_config):
    primary_category = next((category for category in raw_categories if category), "Catalog")
    mapping = map_apparel_category(primary_category, mapping_config)
    return {
        "raw_paths": [category for category in raw_categories if category],
        **mapping,
    }


def map_external_record(category_path, mapping_config):
    path_parts = [part.strip() for part in str(category_path or "").split(">") if part.strip()]
    mapping = map_path_to_taxonomy(category_path, mapping_config)
    return {
        "raw_paths": [category_path] if category_path else [],
        "path_parts": path_parts,
        **mapping,
    }

