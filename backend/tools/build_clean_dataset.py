import argparse
import hashlib
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
}

SENSITIVE_TERMS = {
    "password",
    "otp",
    "2fa",
    "verify",
    "account",
    "bank",
    "wire",
    "payment",
    "invoice",
    "refund",
}

URGENCY_TERMS = {
    "urgent",
    "immediately",
    "now",
    "expires",
    "final warning",
    "suspended",
    "locked",
}


def _extract_domain(sender: str) -> str:
    _, addr = parseaddr(sender or "")
    if "@" not in addr:
        return ""
    return addr.split("@", 1)[1].lower().strip()

def _extract_urls(text: str) -> list[str]:
    return re.findall(r"https?://[^\s)>\"']+", text or "", flags=re.IGNORECASE)


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _newsletter_score(text: str) -> int:
    lowered = (text or "").lower()
    return sum(1 for t in NEWSLETTER_TERMS if t in lowered)


def _risk_score(text: str) -> int:
    lowered = (text or "").lower()
    urls = _extract_urls(text)
    has_sensitive = any(t in lowered for t in SENSITIVE_TERMS)
    has_urgency = any(t in lowered for t in URGENCY_TERMS)
    score = 0
    if urls:
        score += 1
    if any("@" in url for url in urls):
        score += 2
    if any("xn--" in url.lower() for url in urls):
        score += 2
    if has_sensitive:
        score += 1
    if has_urgency:
        score += 1
    if has_sensitive and has_urgency:
        score += 2
    return score


def _row_fingerprint(row: dict) -> str:
    sender_domain = _extract_domain(row.get("sender", ""))
    subject = _normalize_text(row.get("subject", ""))
    snippet = _normalize_text(row.get("snippet", ""))
    body = _normalize_text(row.get("body_text", ""))[:500]
    payload = f"{sender_domain}|{subject}|{snippet}|{body}"
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()


def _is_empty_row(row: dict) -> bool:
    return not any(
        [
            (row.get("sender") or "").strip(),
            (row.get("subject") or "").strip(),
            (row.get("snippet") or "").strip(),
            (row.get("body_text") or "").strip(),
        ]
    )


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


def build_clean_dataset(
    source: Path,
    output: Path,
    noisy_output: Path,
    report_output: Path,
    keep_noisy: bool,
) -> dict:
    rows = _load_rows(source)
    total_in = len(rows)

    deduped = []
    seen = set()
    duplicate_count = 0
    empty_count = 0
    for row in rows:
        if _is_empty_row(row):
            empty_count += 1
            continue
        fp = _row_fingerprint(row)
        if fp in seen:
            duplicate_count += 1
            continue
        seen.add(fp)
        deduped.append(row)

    domain_label_counts = defaultdict(Counter)
    for row in deduped:
        domain = _extract_domain(row["sender"])
        if domain:
            domain_label_counts[domain][row["label"]] += 1

    clean_rows = []
    noisy_rows = []
    noise_reasons = Counter()

    for row in deduped:
        combined = f"{row['subject']}\n{row['snippet']}\n{row['body_text']}"
        n_score = _newsletter_score(combined)
        r_score = _risk_score(combined)
        domain = _extract_domain(row["sender"])

        row_noise_reasons = []

        if row["label"] == "phishing" and n_score >= 2 and r_score <= 2:
            row_noise_reasons.append("newsletter_like_but_labeled_phishing")

        if row["label"] == "safe" and r_score >= 5:
            row_noise_reasons.append("high_risk_pattern_but_labeled_safe")

        if domain and domain in domain_label_counts and sum(domain_label_counts[domain].values()) >= 8:
            major_label, major_count = domain_label_counts[domain].most_common(1)[0]
            domain_total = sum(domain_label_counts[domain].values())
            if row["label"] != major_label and major_count / domain_total >= 0.85 and r_score <= 1:
                row_noise_reasons.append("domain_prior_label_conflict")

        if row_noise_reasons:
            annotated = dict(row)
            annotated["noise_reasons"] = row_noise_reasons
            noisy_rows.append(annotated)
            for nr in row_noise_reasons:
                noise_reasons[nr] += 1
            if keep_noisy:
                clean_rows.append(row)
        else:
            clean_rows.append(row)

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as f:
        for row in clean_rows:
            f.write(json.dumps(row, ensure_ascii=True) + "\n")

    noisy_output.parent.mkdir(parents=True, exist_ok=True)
    with noisy_output.open("w", encoding="utf-8") as f:
        for row in noisy_rows:
            f.write(json.dumps(row, ensure_ascii=True) + "\n")

    report = {
        "input_rows": total_in,
        "after_dedup_and_empty_filter": len(deduped),
        "removed_duplicates": duplicate_count,
        "removed_empty_rows": empty_count,
        "clean_rows": len(clean_rows),
        "noisy_rows": len(noisy_rows),
        "noise_breakdown": dict(noise_reasons),
    }

    report_output.parent.mkdir(parents=True, exist_ok=True)
    report_output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description="Build cleaned dataset by removing duplicates and noisy labels.")
    parser.add_argument("--input", default="datasets/training_data.jsonl", help="Source dataset JSONL")
    parser.add_argument("--output", default="datasets/training_data.clean.jsonl", help="Cleaned JSONL")
    parser.add_argument("--noisy-output", default="datasets/training_data.noisy.jsonl", help="Flagged noisy rows")
    parser.add_argument("--report", default="datasets/training_data.clean.report.json", help="Report JSON output")
    parser.add_argument("--keep-noisy", action="store_true", help="Keep noisy rows in clean output")
    args = parser.parse_args()

    report = build_clean_dataset(
        source=Path(args.input),
        output=Path(args.output),
        noisy_output=Path(args.noisy_output),
        report_output=Path(args.report),
        keep_noisy=args.keep_noisy,
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
