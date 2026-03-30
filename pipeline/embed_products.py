import argparse
import hashlib
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PREPARED_PATH = ROOT / "data" / "prepared_products.json"
OUTPUT_PATH = ROOT / "data" / "product_embeddings.json"


def load_rows():
    return json.loads(PREPARED_PATH.read_text(encoding="utf-8"))


def hashed_embedding(text: str, dimensions: int = 256):
    vector = [0.0] * dimensions
    tokens = [token for token in text.lower().split() if token]

    if not tokens:
        return vector

    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dimensions
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign

    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / norm for value in vector]


def transformer_embeddings(rows, model_name: str):
    from sentence_transformers import SentenceTransformer  # type: ignore

    model = SentenceTransformer(model_name)
    texts = [row["searchable_text"] for row in rows]
    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=True)
    return [list(map(float, embedding)) for embedding in embeddings]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
    parser.add_argument("--mode", choices=["auto", "transformer", "hashed"], default="auto")
    args = parser.parse_args()

    rows = load_rows()

    embedding_mode = args.mode
    if embedding_mode == "auto":
        try:
            embeddings = transformer_embeddings(rows, args.model)
            embedding_mode = "transformer"
        except Exception:
            embeddings = [hashed_embedding(row["searchable_text"]) for row in rows]
            embedding_mode = "hashed"
    elif embedding_mode == "transformer":
        embeddings = transformer_embeddings(rows, args.model)
    else:
        embeddings = [hashed_embedding(row["searchable_text"]) for row in rows]

    payload = {
        "embedding_mode": embedding_mode,
        "model_name": args.model if embedding_mode == "transformer" else "hashed-baseline",
        "dimensions": len(embeddings[0]) if embeddings else 0,
        "rows": [
            {
                "id": row["id"],
                "current_category": row["current_category"],
                "embedding": embedding,
            }
            for row, embedding in zip(rows, embeddings)
        ],
    }

    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(rows)} embeddings to {OUTPUT_PATH} using {embedding_mode} mode")


if __name__ == "__main__":
    main()
