# 66 Northur Categorization Lab

A category suggestion dashboard for reviewing product categorization, similarity, and data quality signals across a real product catalog.

## What is included

- Category review dashboard driven by imported product records
- Suggested category signals based on product text and structured attributes
- Flags for likely mismatches, generic categories, and incomplete records
- Similar-product suggestions to support human review
- Local API endpoint at `/api/category-suggestions`
- Python pipeline scaffolding in [pipeline/README.md](./pipeline/README.md)
- A reusable train/apply category model pipeline for running on future product sets

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

1. Run `py pipeline/prepare_dataset.py`
2. Train the hybrid classifier with `py pipeline/train_category_model.py`
3. Apply the saved model to another prepared dataset with `py pipeline/apply_category_model.py --input ...`
4. Replace the hashed prototype encoder with HPC-generated embeddings and benchmark on larger catalogs
