import argparse
import json
from pathlib import Path

from category_model import predict_row


ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "data" / "category_model.json"
INPUT_PATH = ROOT / "data" / "prepared_products.json"
PREDICTIONS_OUTPUT_PATH = ROOT / "data" / "model_category_predictions.json"
ARTIFACT_OUTPUT_PATH = ROOT / "data" / "category_review_artifacts.json"


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=MODEL_PATH)
    parser.add_argument("--input", type=Path, default=INPUT_PATH)
    parser.add_argument("--predictions-output", type=Path, default=PREDICTIONS_OUTPUT_PATH)
    parser.add_argument("--artifact-output", type=Path, default=ARTIFACT_OUTPUT_PATH)
    parser.add_argument("--exclude-self", action="store_true")
    args = parser.parse_args()

    model = load_json(args.model)
    rows = load_json(args.input)

    predictions = []
    artifacts = {}

    for row in rows:
        prediction = predict_row(model, row, exclude_training_id=row["id"] if args.exclude_self else None)
        predictions.append(
            {
                "id": row["id"],
                "product_name": row.get("product_name", ""),
                "current_category": row.get("current_category"),
                "suggested_category": prediction["suggestedCategory"],
                "confidence": prediction["confidence"],
                "top_categories": prediction["rankedCategories"],
            }
        )
        artifacts[row["id"]] = {
            "suggestedCategory": prediction["suggestedCategory"],
            "confidence": prediction["confidence"],
            "similarProducts": prediction["similarProducts"],
            "baselineSource": "hybrid-model",
        }

    args.predictions_output.write_text(json.dumps(predictions, ensure_ascii=False, indent=2), encoding="utf-8")
    args.artifact_output.write_text(json.dumps(artifacts, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(predictions)} predictions to {args.predictions_output}")
    print(f"Wrote review artifacts to {args.artifact_output}")


if __name__ == "__main__":
    main()

