import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.ai_service import classify_email

LABELS = ["safe", "suspicious", "phishing"]


def safe_div(a: float, b: float) -> float:
    return a / b if b else 0.0


def evaluate(dataset_path: Path, limit: int):
    y_true = []
    y_pred = []
    rows = 0

    with dataset_path.open("r", encoding="utf-8") as f:
        for line in f:
            if rows >= limit:
                break
            line = line.strip()
            if not line:
                continue
            item = json.loads(line)
            true_label = (item.get("label") or "").strip().lower()
            if true_label not in LABELS:
                continue

            pred = classify_email(
                subject=item.get("subject", ""),
                sender=item.get("sender", ""),
                snippet=item.get("snippet", ""),
                body_text=item.get("body_text", ""),
            )
            pred_label = (pred.get("label") or "suspicious").strip().lower()
            if pred_label not in LABELS:
                pred_label = "suspicious"

            y_true.append(true_label)
            y_pred.append(pred_label)
            rows += 1

    cm = {t: {p: 0 for p in LABELS} for t in LABELS}
    for t, p in zip(y_true, y_pred):
        cm[t][p] += 1

    metrics = {}
    for label in LABELS:
        tp = cm[label][label]
        fp = sum(cm[t][label] for t in LABELS if t != label)
        fn = sum(cm[label][p] for p in LABELS if p != label)
        precision = safe_div(tp, tp + fp)
        recall = safe_div(tp, tp + fn)
        f1 = safe_div(2 * precision * recall, precision + recall)
        metrics[label] = {"precision": precision, "recall": recall, "f1": f1}

    accuracy = safe_div(sum(cm[l][l] for l in LABELS), len(y_true))
    return {"rows": rows, "accuracy": accuracy, "metrics": metrics, "confusion_matrix": cm}


def main():
    parser = argparse.ArgumentParser(description="Evaluate classifier against labeled JSONL data.")
    parser.add_argument("--dataset", default="datasets/training_data.jsonl", help="JSONL path")
    parser.add_argument("--limit", type=int, default=1000, help="Max records to evaluate")
    args = parser.parse_args()

    report = evaluate(Path(args.dataset), args.limit)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
