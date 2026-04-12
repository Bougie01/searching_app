# 66 Northur Categorization Lab

A category suggestion dashboard for reviewing product categorization, similarity, and data quality signals across a real product catalog.

## What is included

- Category review dashboard driven by imported product records
- Suggested category signals based on product text and structured attributes
- Flags for likely mismatches, generic categories, and incomplete records
- Similar-product suggestions to support human review
- Local API endpoint at `/api/category-suggestions`
- Optional Gemini reviewer endpoint at `/api/gemini-categorize`
- Python pipeline scaffolding in [pipeline/README.md](./pipeline/README.md)
- A reusable train/apply category model pipeline for running on future product sets
- A taxonomy mapping layer for normalizing different store taxonomies into shared labels

## Run locally

Start the local server:

```powershell
node server.js
```

Then visit `http://localhost:8000`.

The repository includes sample data artifacts in [data/README.md](./data/README.md), so a fresh clone can load the clothing review queue and the external-store Model Playground without access to the original local import files.

If you want Gemini-backed category review, create a local `.env` file from the example:

```powershell
Copy-Item .env.example .env
```

Then edit `.env` and add your own Gemini key:

```powershell
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3-flash-preview
PORT=8000
```

The backend endpoint accepts a product payload plus optional candidate categories at `POST /api/gemini-categorize`. The local model and dashboard still work without `.env`; only Gemini review needs a key.

## Project direction

This repository now targets the "Product category suggestions" project:

1. Clean product titles, descriptions, and structured attributes
2. Suggest categories automatically
3. Flag unusual or misclassified products
4. Prepare for HPC-scale embedding, clustering, and classification runs

## Next implementation steps

1. Run `py pipeline/prepare_dataset.py`
2. Normalize another store feed with `py pipeline/prepare_external_dataset.py --input ...`
3. Build a mixed dataset with `py pipeline/combine_datasets.py --inputs data/prepared_products.json data/prepared_external_products.json --output data/prepared_mixed_products.json`
4. Train the hybrid classifier on shared labels with `py pipeline/train_category_model.py --input data/prepared_mixed_products.json --label-field canonical_label`
5. Apply the saved model to another prepared dataset with `py pipeline/apply_category_model.py --input ...`
6. Replace the hashed prototype encoder with HPC-generated embeddings and benchmark on larger catalogs
