# 66 Northur Categorization Lab

A category suggestion dashboard for reviewing product categorization, similarity, and data quality signals across a real product catalog.

## What is included

- Category review dashboard driven by imported product records
- Suggested category signals based on product text and structured attributes
- Flags for likely mismatches, generic categories, and incomplete records
- Similar-product suggestions to support human review
- Local API endpoint at `/api/category-suggestions`
- Python pipeline scaffolding in [pipeline/README.md](./pipeline/README.md)

## Run locally

Start the local server:

```powershell
node server.js
```

Then visit `http://localhost:8000`.

## Project direction

This repository now targets the "Product category suggestions" project:

1. Clean product titles, descriptions, and structured attributes
2. Suggest categories automatically
3. Flag unusual or misclassified products
4. Prepare for HPC-scale embedding, clustering, and classification runs

## Next implementation steps

1. Run the Sprint 2 pipeline in [pipeline/README.md](./pipeline/README.md)
2. Replace hashed fallback embeddings with a real open-source embedding model
3. Train category suggestion models using text plus structured fields
4. Benchmark clustering, nearest-neighbor retrieval, and anomaly detection at scale
