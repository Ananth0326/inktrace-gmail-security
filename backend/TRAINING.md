# Training And Evaluation Loop

This project now includes a practical quality-improvement loop:

1. Scan emails.
2. Correct wrong labels with API override.
3. Export labeled data.
4. Evaluate classifier metrics.
5. Update rules/prompt and repeat.

## 1) Correct labels (human feedback)

Use this endpoint for any wrong prediction:

`PATCH /emails/{email_id}/label?label=safe|suspicious|phishing`

Example:

```powershell
curl -X PATCH "http://localhost:8000/emails/123/label?label=safe" ^
  -H "Authorization: Bearer <SESSION_TOKEN>"
```

## 2) Export dataset

From `backend/`:

```powershell
python tools/export_dataset.py --db email_scanner.db --out datasets/training_data.jsonl --limit 5000
```

JSONL schema per line:

```json
{
  "sender": "...",
  "subject": "...",
  "snippet": "...",
  "body_text": "...",
  "label": "safe|suspicious|phishing",
  "reason": "..."
}
```

## 3) Evaluate quality

```powershell
python tools/evaluate_classifier.py --dataset datasets/training_data.jsonl --limit 1000
```

## 3.5) Build cleaned dataset (remove noisy labels)

```powershell
python tools/build_clean_dataset.py ^
  --input datasets/training_data.jsonl ^
  --output datasets/training_data.clean.jsonl ^
  --noisy-output datasets/training_data.noisy.jsonl ^
  --report datasets/training_data.clean.report.json
```

This creates:
- `datasets/training_data.clean.jsonl`: deduped + cleaned data used for training/eval
- `datasets/training_data.noisy.jsonl`: suspected noisy rows to review
- `datasets/training_data.clean.report.json`: summary counts

## 3.6) Mine hard-negatives (newsletter vs phishing confusion)

```powershell
python tools/mine_hard_negatives.py ^
  --input datasets/training_data.clean.jsonl ^
  --output datasets/hard_negatives.newsletter_vs_phishing.jsonl ^
  --report datasets/hard_negatives.report.json
```

This extracts tricky newsletter-like records currently labeled risky, so you can relabel and retrain.

Outputs:
- global accuracy
- per-label precision/recall/f1
- confusion matrix

## 4) Production target

For phishing-focused reliability, target:
- phishing precision >= 0.95
- phishing recall >= 0.90
- low false positive rate on safe newsletters

## 5) Next stage (real model fine-tune)

When dataset quality is stable, use the exported JSONL as your supervised dataset for model fine-tuning/provider training workflow, and keep this evaluator as acceptance gate before deployment.
