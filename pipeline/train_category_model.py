import argparse
import json
import random
from collections import Counter, defaultdict
from pathlib import Path

from category_model import get_label_value, predict_row, train_model


ROOT = Path(__file__).resolve().parents[1]
PREPARED_PATH = ROOT / "data" / "prepared_products.json"
MODEL_OUTPUT_PATH = ROOT / "data" / "category_model.json"
REPORT_OUTPUT_PATH = ROOT / "data" / "category_model_report.json"
ARTIFACT_OUTPUT_PATH = ROOT / "data" / "category_review_artifacts.json"


def load_rows(path):
    return json.loads(path.read_text(encoding="utf-8"))


def assign_folds(rows, fold_count, seed, label_field):
    grouped = defaultdict(list)
    for row in rows:
        grouped[get_label_value(row, label_field)].append(row)

    randomizer = random.Random(seed)
    folds = [[] for _ in range(fold_count)]

    for category in sorted(grouped):
        bucket = grouped[category]
        randomizer.shuffle(bucket)
        for index, row in enumerate(bucket):
            folds[index % fold_count].append(row)

    return folds


def evaluate_with_folds(rows, fold_count, alpha, embedding_dimensions, seed, label_field):
    folds = assign_folds(rows, fold_count=fold_count, seed=seed, label_field=label_field)
    predictions = {}
    top1_correct = 0
    top3_correct = 0
    label_totals = Counter()
    label_correct = Counter()

    for fold_index in range(fold_count):
        validation_rows = folds[fold_index]
        training_rows = [row for index, fold in enumerate(folds) if index != fold_index for row in fold]
        model = train_model(training_rows, alpha=alpha, embedding_dimensions=embedding_dimensions, label_field=label_field)

        for row in validation_rows:
            prediction = predict_row(model, row)
            predictions[row["id"]] = {
                "suggestedCategory": prediction["suggestedCategory"],
                "confidence": prediction["confidence"],
                "similarProducts": prediction["similarProducts"],
                "baselineSource": "hybrid-model-crossval",
            }

            label = get_label_value(row, label_field)
            label_totals[label] += 1

            if prediction["suggestedCategory"] == label:
                top1_correct += 1
                label_correct[label] += 1

            top_categories = [item["category"] for item in prediction["rankedCategories"][:3]]
            if label in top_categories:
                top3_correct += 1

    macro_recall = 0.0
    observed_categories = sorted(label_totals)
    if observed_categories:
        macro_recall = sum(label_correct[category] / label_totals[category] for category in observed_categories) / len(observed_categories)

    report = {
        "foldCount": fold_count,
        "rowCount": len(rows),
        "top1Accuracy": round(top1_correct / max(1, len(rows)), 4),
        "top3Accuracy": round(top3_correct / max(1, len(rows)), 4),
        "macroRecall": round(macro_recall, 4),
        "perCategoryRecall": {
            category: round(label_correct[category] / total, 4)
            for category, total in sorted(label_totals.items())
        },
        "labelField": label_field,
    }

    return report, predictions


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=PREPARED_PATH)
    parser.add_argument("--model-output", type=Path, default=MODEL_OUTPUT_PATH)
    parser.add_argument("--report-output", type=Path, default=REPORT_OUTPUT_PATH)
    parser.add_argument("--artifact-output", type=Path, default=ARTIFACT_OUTPUT_PATH)
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--alpha", type=float, default=0.8)
    parser.add_argument("--embedding-dimensions", type=int, default=384)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--label-field", default="current_category")
    args = parser.parse_args()

    rows = load_rows(args.input)
    report, review_artifacts = evaluate_with_folds(
        rows,
        fold_count=max(2, args.folds),
        alpha=args.alpha,
        embedding_dimensions=args.embedding_dimensions,
        seed=args.seed,
        label_field=args.label_field,
    )

    model = train_model(rows, alpha=args.alpha, embedding_dimensions=args.embedding_dimensions, label_field=args.label_field)
    model["trainingSummary"] = report

    args.model_output.write_text(json.dumps(model, ensure_ascii=False), encoding="utf-8")
    args.report_output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    args.artifact_output.write_text(json.dumps(review_artifacts, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote trained category model to {args.model_output}")
    print(f"Wrote evaluation report to {args.report_output}")
    print(f"Wrote dashboard artifacts to {args.artifact_output}")
    print(
        "Cross-validation metrics:",
        json.dumps(
            {
                "top1Accuracy": report["top1Accuracy"],
                "top3Accuracy": report["top3Accuracy"],
                "macroRecall": report["macroRecall"],
            }
        ),
    )


if __name__ == "__main__":
    main()
