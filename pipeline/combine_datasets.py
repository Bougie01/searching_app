import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_PATH = ROOT / "data" / "prepared_mixed_products.json"


def load_rows(path):
    return json.loads(path.read_text(encoding="utf-8"))


def dataset_name_from_path(path):
    return path.stem.replace("_", "-")


def normalize_row(row, dataset_name):
    normalized = dict(row)
    normalized["dataset_name"] = normalized.get("dataset_name") or dataset_name
    normalized["source_dataset"] = dataset_name
    normalized["has_canonical_label"] = bool(normalized.get("canonical_label"))
    normalized["has_taxonomy_match"] = bool(normalized.get("taxonomy_mapping_matched"))
    return normalized


def combine_rows(paths):
    combined = []
    seen_ids = set()
    duplicates = []

    for path in paths:
        dataset_name = dataset_name_from_path(path)
        rows = load_rows(path)

        for index, row in enumerate(rows):
            normalized = normalize_row(row, dataset_name)
            record_id = str(normalized.get("id") or f"{dataset_name}:{index}")

            if record_id in seen_ids:
                duplicate_id = f"{dataset_name}:{record_id}"
                duplicates.append(record_id)
                normalized["original_id"] = record_id
                normalized["id"] = duplicate_id
            else:
                normalized["id"] = record_id

            seen_ids.add(normalized["id"])
            combined.append(normalized)

    return combined, duplicates


def build_summary(rows, duplicates):
    datasets = {}
    canonical_labels = {}

    for row in rows:
        dataset = row.get("source_dataset") or "unknown"
        datasets[dataset] = datasets.get(dataset, 0) + 1

        label = row.get("canonical_label") or "missing"
        canonical_labels[label] = canonical_labels.get(label, 0) + 1

    return {
        "rowCount": len(rows),
        "datasetCounts": datasets,
        "canonicalLabelCounts": canonical_labels,
        "duplicateIdsRenamed": sorted(set(duplicates))
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--inputs", nargs="+", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH)
    parser.add_argument("--summary-output", type=Path)
    args = parser.parse_args()

    rows, duplicates = combine_rows(args.inputs)
    args.output.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(rows)} combined rows to {args.output}")

    if args.summary_output:
        summary = build_summary(rows, duplicates)
        args.summary_output.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Wrote dataset summary to {args.summary_output}")


if __name__ == "__main__":
    main()
