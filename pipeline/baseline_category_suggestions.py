import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PREPARED_PATH = ROOT / "data" / "prepared_products.json"
OUTPUT_PATH = ROOT / "data" / "baseline_category_suggestions.json"


KEYWORDS = {
    "Outerlayers": ["jacket", "coat", "parka", "raincoat", "anorak"],
    "Shells": ["shell", "softshell", "gore-tex"],
    "Tops": ["hoodie", "sweater", "shirt", "tee", "fleece"],
    "Bottoms": ["pants", "trouser", "shorts", "legging"],
    "Accessories": ["cap", "bag", "beanie", "scarf", "glove"],
    "Dresses": ["dress"],
}


def suggest_category(name: str) -> str:
    haystack = (name or "").lower()
    for category, keywords in KEYWORDS.items():
        if any(keyword in haystack for keyword in keywords):
            return category
    return "Catalog"


def main():
    rows = json.loads(PREPARED_PATH.read_text(encoding="utf-8"))
    suggestions = []

    for row in rows:
        suggestions.append(
            {
                "id": row["id"],
                "product_name": row["product_name"],
                "suggested_category": suggest_category(row["product_name"]),
            }
        )

    OUTPUT_PATH.write_text(json.dumps(suggestions, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(suggestions)} baseline suggestions to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
