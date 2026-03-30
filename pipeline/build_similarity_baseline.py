import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PREPARED_PATH = ROOT / "data" / "prepared_products.json"
EMBEDDINGS_PATH = ROOT / "data" / "product_embeddings.json"
OUTPUT_PATH = ROOT / "data" / "category_review_artifacts.json"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def cosine_similarity(left, right):
    numerator = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(value * value for value in left)) or 1.0
    right_norm = math.sqrt(sum(value * value for value in right)) or 1.0
    return numerator / (left_norm * right_norm)


def main():
    rows = load_json(PREPARED_PATH)
    embeddings_payload = load_json(EMBEDDINGS_PATH)
    rows_by_id = {row["id"]: row for row in rows}
    vectors = embeddings_payload["rows"]

    artifacts = {}

    for row in vectors:
        source_id = row["id"]
        source_embedding = row["embedding"]

        scored_neighbors = []
        for candidate in vectors:
            if candidate["id"] == source_id:
                continue

            similarity = cosine_similarity(source_embedding, candidate["embedding"])
            candidate_row = rows_by_id[candidate["id"]]
            scored_neighbors.append(
                {
                    "id": candidate["id"],
                    "name": candidate_row["product_name"],
                    "category": candidate_row["current_category"],
                    "similarity": round(float(similarity), 4),
                }
            )

        scored_neighbors.sort(key=lambda item: item["similarity"], reverse=True)
        nearest = scored_neighbors[:5]

        category_votes = {}
        for neighbor in nearest[:3]:
            category_votes.setdefault(neighbor["category"], 0.0)
            category_votes[neighbor["category"]] += neighbor["similarity"]

        suggested_category = max(category_votes.items(), key=lambda item: item[1])[0] if category_votes else rows_by_id[source_id]["current_category"]
        total_vote = sum(category_votes.values()) or 1.0
        confidence = category_votes.get(suggested_category, 0.0) / total_vote

        artifacts[source_id] = {
            "suggestedCategory": suggested_category,
            "confidence": round(float(confidence), 2),
            "similarProducts": nearest[:3],
            "baselineSource": f"embedding-{embeddings_payload['embedding_mode']}",
        }

    OUTPUT_PATH.write_text(json.dumps(artifacts, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote similarity baseline artifacts for {len(artifacts)} products to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
