module load cray-python/3.11.7
cd /users/prokopka/scratch/industry_project/searching_app/

python pipeline/prepare_dataset.py

python pipeline/prepare_external_dataset.py --input data/query-results_2.json --output data/prepared_external_products_2.json

python pipeline/combine_datasets.py --inputs data/prepared_products.json data/prepared_external_products_2.json --output data/prepared_mixed_products_2.json --summary-output data/prepared_mixed_summary_2.json

python pipeline/train_category_model.py --input data/prepared_mixed_products_2.json --label-field canonical_label

python pipeline/apply_category_model.py --input data/prepared_external_products_2.json