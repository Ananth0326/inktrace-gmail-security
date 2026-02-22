import argparse
import json
import re
from collections import Counter, defaultdict
from email.utils import parseaddr
from pathlib import Path

VALID_LABELS = {"safe", "suspicious", "phishing"}

NEWSLETTER_TERMS = {
    "newsletter",
    "digest",
    "unsubscribe",
    "view in browser",
    "weekly",
    "edition",
    "updates",
    "careers",
    "job alert",
    "application update",
}

RISK_TERMS = {
    "password",
    "otp",
    "verify",
    "account locked",
    "wire transfer",
    "bank account",
    "urgent",
    "immediately",
}


def _extract_domain(sender: str) -> str:
    _, addr = parseaddr(sender or "")
    if "@" not in addr:
        return ""
    return addr.split("@", 1)[1].lower().strip()


def _extract_urls(text: str) -> list[str]:
    return re.findall(r"https?://[^\s)>\"']+", text or "", flags=re.IGNORECASE)


def _newsletter_score(text: str) -> int:
    lowered = (text or "").lower()
    return sum(1 for t in NEWSLETTER_TERMS if t in lowered)


def _risk_score(text: str) -> int:
    lowered = (text or "").lower()
    score = sum(1 for t in RISK_TERMS if t in lowered)
    urls = _extract_urls(text)
    if urls:
        score += 1
    if any("@" in url for url in urls):
        score += 2
    if any("xn--" in url.lower() for url in urls):
        score += 2
    return score


def _load_rows(path: Path) -> list[dict]:
    rows = []
    with path.open("r", encoding="utf-8") as f:
        for raw in f:
            raw = raw.strip()
            if not raw:
                continue
            try:
                item = json.loads(raw)
            except json.JSONDecodeError:
                continue

            label = (item.get("label") or "").strip().lower()
            if label not in VALID_LABELS:
                continue

            rows.append(
                {
                    "sender": str(item.get("sender") or "").strip(),
                    "subject": str(item.get("subject") or "").strip(),
                    "snippet": str(item.get("snippet") or "").strip(),
                    "body_text": str(item.get("body_text") or "").strip(),
                    "label": label,
                    "reason": str(item.get("reason") or "").strip(),
                }
            )
    return rows


def mine_hard_negatives(dataset_path: Path, output_path: Path, report_path: Path) -> dict:
    rows = _load_rows(dataset_path)

    domain_counts = Counter()
    domain_label_counts = defaultdict(Counter)
    for row in rows:
        domain = _extract_domain(row["sender"])
        if not domain:
            continue
        domain_counts[domain] += 1
        domain_label_counts[domain][row["label"]] += 1

    candidates = []
    for row in rows:
        if row["label"] not in {"suspicious", "phishing"}:
            continue

        combined = f"{row['subject']}\n{row['snippet']}\n{row['body_text']}"
        n_score = _newsletter_score(combined)
        r_score = _risk_score(combined)
        domain = _extract_domain(row["sender"])
        recurring_domain = domain_counts.get(domain, 0) >= 3

        likely_newsletter = n_score >= 2 and recurring_domain
        low_attack_signal = r_score <= 2

        if likely_newsletter and low_attack_signal:
            domain_mix = dict(domain_label_counts.get(domain, {}))
            suggested = "safe" if row["label"] == "phishing" else "suspicious"
            if domain_mix.get("safe", 0) >= max(domain_mix.get("phishing", 0), domain_mix.get("suspicious", 0)):
                suggested = "safe"

            candidates.append(
                {
                    "sender": row["sender"],
                    "subject": row["subject"],
                    "snippet": row["snippet"],
                    "body_text": row["body_text"],
                    "current_label": row["label"],
                    "suggested_label": suggested,
                    "reason": row["reason"],
                    "hard_negative_signals": [
                        f"newsletter_score={n_score}",
                        f"risk_score={r_score}",
                        f"recurring_domain_count={domain_counts.get(domain, 0)}",
                    ],
                    "domain_label_distribution": domain_mix,
                }
            )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        for row in candidates:
            f.write(json.dumps(row, ensure_ascii=True) + "\n")

    top_domains = Counter(_extract_domain(r["sender"]) for r in candidates if _extract_domain(r["sender"]))
    report = {
        "input_rows": len(rows),
        "hard_negative_candidates": len(candidates),
        "top_candidate_domains": dict(top_domains.most_common(15)),
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description="Mine hard-negative samples (newsletter-like emails mislabeled as risky).")
    parser.add_argument("--input", default="datasets/training_data.clean.jsonl", help="Source dataset JSONL")
    parser.add_argument("--output", default="datasets/hard_negatives.newsletter_vs_phishing.jsonl", help="Hard negatives JSONL")
    parser.add_argument("--report", default="datasets/hard_negatives.report.json", help="Summary report JSON")
    args = parser.parse_args()

    report = mine_hard_negatives(
        dataset_path=Path(args.input),
        output_path=Path(args.output),
        report_path=Path(args.report),
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
