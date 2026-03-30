# Categorization Pipeline

This folder is the Sprint 2 starting point for the HPC-oriented product categorization workflow.

## Sprint 2 workflow

1. Prepare normalized rows

```powershell
py pipeline/prepare_dataset.py
```

2. Generate embeddings

Auto mode will try `sentence-transformers` first and fall back to a hashed baseline if the package is unavailable.

```powershell
py pipeline/embed_products.py --mode auto
```

3. Build nearest-neighbor baseline artifacts

```powershell
py pipeline/build_similarity_baseline.py
```

4. Review results in the dashboard

```powershell
node server.js
```

Then open `http://localhost:8000`.

## Files

- `prepare_dataset.py`
  Exports cleaned, embedding-ready product rows from the raw catalog.
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
