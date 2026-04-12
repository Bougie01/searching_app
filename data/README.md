# Sample Data Artifacts

This folder contains enough sample data for a fresh clone to run the dashboard locally without access to the original files from `Downloads`.

## Runtime files

- `catalog.json` is the clothing catalog used by the main review queue.
- `category_review_artifacts.json` contains model-backed suggestions for the clothing catalog.
- `model_category_predictions.json` contains external-store predictions shown in the Model Playground.
- `taxonomy_mapping.json` maps raw store categories into shared labels like `pet > dog-food` and `apparel > jackets`.

## Pipeline files

- `prepared_products.json` is the normalized clothing dataset.
- `prepared_external_products.json` and `prepared_external_products_2.json` are normalized pet-store sample datasets.
- `prepared_mixed_products.json` is the mixed training dataset built from the clothing and pet-store samples.
- `prepared_mixed_summary.json` summarizes the mixed dataset label coverage.
- `category_model.json` is the trained local categorization model.
- `category_model_report.json` contains basic model evaluation metrics.

These files are intentionally committed as sample artifacts. To replace them with a new dataset, run the pipeline scripts from `pipeline/README.md`.
