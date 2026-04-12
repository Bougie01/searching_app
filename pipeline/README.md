# Categorization Pipeline

This folder is the Sprint 2 starting point for the HPC-oriented product categorization workflow.

## Sprint 2 workflow

1. Prepare normalized rows

```powershell
py pipeline/prepare_dataset.py
```

For another store feed with a `query-results.json`-style structure, prepare it with:

```powershell
py pipeline/prepare_external_dataset.py --input C:\path\to\query-results.json
```

2. Combine multiple prepared datasets into one mixed training file

```powershell
py pipeline/combine_datasets.py --inputs data/prepared_products.json data/prepared_external_products.json --output data/prepared_mixed_products.json --summary-output data/prepared_mixed_summary.json
```

3. Train the hybrid category model

This trains a reusable classifier from text plus structured attributes, writes a model artifact, and generates cross-validated review suggestions for the dashboard.

```powershell
py pipeline/train_category_model.py
```

To train on a shared taxonomy instead of raw store labels, use:

```powershell
py pipeline/train_category_model.py --input data/prepared_mixed_products.json --label-field canonical_label
```

4. Apply the trained model to another prepared dataset

```powershell
py pipeline/apply_category_model.py --input data/prepared_external_products.json
```

5. Review results in the dashboard

```powershell
node server.js
```

Then open `http://localhost:8000`.

## Files

- `prepare_dataset.py`
  Exports cleaned, embedding-ready product rows from the raw catalog.
- `prepare_external_dataset.py`
  Normalizes other store feeds into the same schema and applies the shared taxonomy mapping layer.
- `combine_datasets.py`
  Merges multiple prepared datasets into one mixed training set and optionally writes a summary of label coverage.
- `taxonomy_mapping.py`
  Maps raw store categories and category paths into a shared canonical taxonomy.
- `category_model.py`
  Shared hybrid classifier logic that blends sparse text features, structured attributes, and prototype similarity.
- `train_category_model.py`
  Trains the reusable category model, writes evaluation metrics, and creates dashboard review artifacts.
- `apply_category_model.py`
  Applies a saved model to a new prepared product set and emits predictions plus dashboard-compatible artifacts.

## HPC direction

- Replace the hashed prototype encoder in `category_model.py` with HPC-generated embeddings from open-source language models such as IceBERT
- Run large-scale training and inference on GPU/HPC infrastructure
- Scale mixed-store categorization to 100k to 1M+ products
- Benchmark text-plus-attributes grouping quality across multiple stores and taxonomies
