import hashlib
import math
import re
from collections import Counter, defaultdict


DEFAULT_EMBEDDING_DIMENSIONS = 384
TOKEN_PATTERN = re.compile(r"[0-9a-zA-Z\u00C0-\u024F]+")


def normalize_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def tokenize_words(value):
    return TOKEN_PATTERN.findall(normalize_text(value))


def tokenize_char_ngrams(value, n=4):
    compact = f" {normalize_text(value)} "
    if len(compact) <= n:
        return []

    return [compact[index : index + n] for index in range(len(compact) - n + 1)]


def build_text_blob(row):
    parts = [
        row.get("product_name", ""),
        row.get("subtitle", ""),
        row.get("description", ""),
        row.get("current_main_group", ""),
        " ".join(row.get("tags", [])),
        " ".join(row.get("materials", [])),
        " ".join(row.get("collection_tags", [])),
        " ".join(row.get("attributes_present", [])),
    ]
    return " ".join(part for part in parts if part)


def build_features(row):
    features = Counter()

    weighted_fields = [
        ("name", row.get("product_name", ""), 4),
        ("subtitle", row.get("subtitle", ""), 2),
        ("description", row.get("description", ""), 1),
    ]

    for prefix, value, weight in weighted_fields:
        for token in tokenize_words(value):
            features[f"{prefix}:{token}"] += weight

    for token in tokenize_char_ngrams(f"{row.get('product_name', '')} {row.get('subtitle', '')}", n=4):
        features[f"char4:{token}"] += 1

    for tag in row.get("tags", []):
        normalized = normalize_text(tag)
        if normalized:
            features[f"tag:{normalized}"] += 2

    for material in row.get("materials", []):
        normalized = normalize_text(material)
        if normalized:
            features[f"material:{normalized}"] += 1

    for collection_tag in row.get("collection_tags", []):
        normalized = normalize_text(collection_tag)
        if normalized:
            features[f"collection:{normalized}"] += 1

    for attribute_code in row.get("attributes_present", []):
        normalized = normalize_text(attribute_code)
        if normalized:
            features[f"attribute:{normalized}"] += 1

    source_system = normalize_text(row.get("source_system"))
    if source_system:
        features[f"source:{source_system}"] += 1

    main_group = normalize_text(row.get("current_main_group"))
    if main_group:
        features[f"group:{main_group}"] += 2

    status = normalize_text(row.get("current_status"))
    if status:
        features[f"status:{status}"] += 1

    return features


def hashed_embedding(text, dimensions=DEFAULT_EMBEDDING_DIMENSIONS):
    vector = [0.0] * dimensions
    tokens = tokenize_words(text)

    if not tokens:
        return vector

    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dimensions
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        weight = 1.0 + (digest[5] / 255.0) * 0.25
        vector[index] += sign * weight

    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / norm for value in vector]


def cosine_similarity(left, right):
    numerator = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(value * value for value in left)) or 1.0
    right_norm = math.sqrt(sum(value * value for value in right)) or 1.0
    return numerator / (left_norm * right_norm)


def softmax(values):
    if not values:
        return []

    peak = max(values)
    exponents = [math.exp(value - peak) for value in values]
    total = sum(exponents) or 1.0
    return [value / total for value in exponents]


def train_model(rows, alpha=0.8, embedding_dimensions=DEFAULT_EMBEDDING_DIMENSIONS):
    categories = sorted({row["current_category"] for row in rows if row.get("current_category")})
    class_doc_counts = Counter()
    class_feature_counts = defaultdict(Counter)
    class_feature_totals = Counter()
    class_centroid_sums = {category: [0.0] * embedding_dimensions for category in categories}
    class_centroid_counts = Counter()
    feature_vocabulary = set()
    training_examples = []

    for row in rows:
        category = row["current_category"]
        if category not in class_centroid_sums:
            continue

        features = build_features(row)
        embedding = hashed_embedding(build_text_blob(row), dimensions=embedding_dimensions)

        class_doc_counts[category] += 1
        class_centroid_counts[category] += 1

        for feature, count in features.items():
            class_feature_counts[category][feature] += count
            class_feature_totals[category] += count
            feature_vocabulary.add(feature)

        centroid_sum = class_centroid_sums[category]
        for index, value in enumerate(embedding):
            centroid_sum[index] += value

        training_examples.append(
            {
                "id": row["id"],
                "name": row.get("product_name", ""),
                "category": category,
                "embedding": embedding,
            }
        )

    centroids = {}
    for category, centroid_sum in class_centroid_sums.items():
        count = class_centroid_counts[category] or 1
        centroid = [value / count for value in centroid_sum]
        norm = math.sqrt(sum(value * value for value in centroid)) or 1.0
        centroids[category] = [value / norm for value in centroid]

    model = {
        "version": 1,
        "alpha": alpha,
        "embedding_dimensions": embedding_dimensions,
        "categories": categories,
        "document_count": sum(class_doc_counts.values()),
        "class_doc_counts": dict(class_doc_counts),
        "class_feature_totals": dict(class_feature_totals),
        "class_feature_counts": {category: dict(counter) for category, counter in class_feature_counts.items()},
        "feature_vocabulary_size": len(feature_vocabulary),
        "class_centroids": centroids,
        "training_examples": training_examples,
    }

    return model


def predict_row(model, row, neighbor_limit=3, exclude_training_id=None):
    categories = model["categories"]
    alpha = model["alpha"]
    vocabulary_size = max(1, int(model["feature_vocabulary_size"]))
    document_count = max(1, int(model["document_count"]))

    features = build_features(row)
    embedding = hashed_embedding(build_text_blob(row), dimensions=model["embedding_dimensions"])

    log_scores = []
    centroid_scores = []

    for category in categories:
        class_docs = max(1, int(model["class_doc_counts"].get(category, 0)))
        class_total = max(0, int(model["class_feature_totals"].get(category, 0)))
        feature_counts = model["class_feature_counts"].get(category, {})

        log_score = math.log(class_docs / document_count)
        denominator = class_total + alpha * vocabulary_size

        for feature, count in features.items():
            numerator = float(feature_counts.get(feature, 0)) + alpha
            log_score += count * math.log(numerator / denominator)

        centroid = model["class_centroids"].get(category, [])
        centroid_score = cosine_similarity(embedding, centroid) if centroid else 0.0

        log_scores.append(log_score)
        centroid_scores.append(centroid_score)

    naive_bayes_probs = softmax(log_scores)
    centroid_probs = softmax([score * 6.0 for score in centroid_scores])

    scored_neighbors = []
    for example in model["training_examples"]:
        if exclude_training_id and example["id"] == exclude_training_id:
            continue

        similarity = cosine_similarity(embedding, example["embedding"])
        scored_neighbors.append(
            {
                "id": example["id"],
                "name": example["name"],
                "category": example["category"],
                "similarity": similarity,
            }
        )

    scored_neighbors.sort(key=lambda item: item["similarity"], reverse=True)
    nearest_neighbors = scored_neighbors[:neighbor_limit]

    neighbor_votes = Counter()
    for neighbor in nearest_neighbors:
        neighbor_votes[neighbor["category"]] += max(0.0, neighbor["similarity"])

    total_neighbor_vote = sum(neighbor_votes.values()) or 1.0
    neighbor_probs = [neighbor_votes.get(category, 0.0) / total_neighbor_vote for category in categories]

    final_probabilities = {}
    for index, category in enumerate(categories):
        final_probabilities[category] = (
            naive_bayes_probs[index] * 0.55
            + centroid_probs[index] * 0.25
            + neighbor_probs[index] * 0.20
        )

    ranked = sorted(final_probabilities.items(), key=lambda item: item[1], reverse=True)
    predicted_category, confidence = ranked[0]

    return {
        "suggestedCategory": predicted_category,
        "confidence": round(float(confidence), 2),
        "similarProducts": [
            {
                "id": neighbor["id"],
                "name": neighbor["name"],
                "category": neighbor["category"],
                "similarity": round(float(max(0.0, neighbor["similarity"])), 4),
            }
            for neighbor in nearest_neighbors
        ],
        "rankedCategories": [
            {
                "category": category,
                "probability": round(float(probability), 4),
            }
            for category, probability in ranked[:5]
        ],
    }
