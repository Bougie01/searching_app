# Northstar Atelier

A stylish clothing store landing page with a built-in client-side search engine and a clear upgrade path toward AI-powered discovery.

## What is included

- Responsive storefront UI for fashion products
- Search across product name, subtitle, category, description, colors, materials, and tags
- Category filters and sort controls
- Product metadata shaped for future semantic search and HPC-backed ranking

## Run locally

This project now loads product data from `data/catalog.json`, so it should be run from a local web server.

One simple option is:

```powershell
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Suggested next step for AI + HPC

1. Move product data into a backend or database.
2. Expose search through an API instead of only in the browser.
3. Generate embeddings for products and user queries.
4. Use HPC resources for batch embedding generation, model training, and re-ranking at scale.
