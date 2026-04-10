# Categorization Pipeline

This folder is the Sprint 2 starting point for the HPC-oriented product categorization workflow.

## Sprint 2 workflow

1. Prepare normalized rows

```powershell
py pipeline/prepare_dataset.py
```

2. Train the hybrid category model

This trains a reusable classifier from text plus structured attributes, writes a model artifact, and generates cross-validated review suggestions for the dashboard.

```powershell
py pipeline/train_category_model.py
```

3. Apply the trained model to another prepared dataset

```powershell
py pipeline/apply_category_model.py --input data/prepared_products.json
```

4. Review results in the dashboard

```powershell
node server.js
```

Then open `http://localhost:8000`.

## Files

- `prepare_dataset.py`
  Exports cleaned, embedding-ready product rows from the raw catalog.
- `category_model.py`
  Shared hybrid classifier logic that blends sparse text features, structured attributes, and prototype similarity.
- `train_category_model.py`
  Trains the reusable category model, writes evaluation metrics, and creates dashboard review artifacts.
- `apply_category_model.py`
  Applies a saved model to a new prepared product set and emits predictions plus dashboard-compatible artifacts.
- `embed_products.py`
  Produces text embeddings for titles and descriptions.
- `build_similarity_baseline.py`
  Uses embeddings to compute nearest neighbors and category suggestions.
- `baseline_category_suggestions.py`
  Earlier heuristic baseline kept for comparison.

## HPC direction

- Replace hashed fallback embeddings with open-source language models such as IceBERT
- Run embedding generation on GPU/HPC infrastructure
- Scale nearest-neighbor search to 100k to 1M+ products
- Benchmark text-only versus text-plus-attributes grouping quality
- Swap the hashed prototype encoder in `category_model.py` for HPC-generated embeddings while keeping the same train/apply flow
