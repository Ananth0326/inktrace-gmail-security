import argparse
import json
import sqlite3
from pathlib import Path


def export_dataset(db_path: Path, out_path: Path, limit: int) -> int:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(
        """
        SELECT sender, subject, snippet, body_text, label, reason
        FROM email_records
        ORDER BY id DESC
        LIMIT ?
        """,
        (limit,),
    )
    rows = cur.fetchall()
    conn.close()

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        for row in rows:
            record = {
                "sender": row["sender"] or "",
                "subject": row["subject"] or "",
                "snippet": row["snippet"] or "",
                "body_text": row["body_text"] or "",
                "label": row["label"] or "safe",
                "reason": row["reason"] or "",
            }
            f.write(json.dumps(record, ensure_ascii=True) + "\n")
    return len(rows)


def main():
    parser = argparse.ArgumentParser(description="Export scanned emails into JSONL dataset.")
    parser.add_argument("--db", default="email_scanner.db", help="Path to SQLite DB")
    parser.add_argument("--out", default="datasets/training_data.jsonl", help="Output JSONL path")
    parser.add_argument("--limit", type=int, default=5000, help="Max records to export")
    args = parser.parse_args()

    count = export_dataset(Path(args.db), Path(args.out), args.limit)
    print(f"Exported {count} records to {args.out}")


if __name__ == "__main__":
    main()
