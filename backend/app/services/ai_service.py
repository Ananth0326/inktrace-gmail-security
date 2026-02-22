import json
import logging
import re
from dataclasses import dataclass
from email.utils import parseaddr
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
try:
    import numpy as np
except Exception:  # pragma: no cover - optional dependency guard
    np = None

try:
    from fastembed import TextEmbedding
except Exception:  # pragma: no cover - optional dependency guard
    TextEmbedding = None

_EMBEDDING_MODEL = None
logger = logging.getLogger(__name__)


def _get_embedding_model() -> TextEmbedding:
    if TextEmbedding is None:
        return None
    global _EMBEDDING_MODEL
    if _EMBEDDING_MODEL is None:
        # BAAI/bge-small-en-v1.5 is small (~130MB) and effective
        _EMBEDDING_MODEL = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
    return _EMBEDDING_MODEL

from app.config import get_settings

settings = get_settings()

SENSITIVE_TERMS = {
    "password",
    "otp",
    "2fa",
    "verify",
    "account",
    "payment",
    "refund",
    "invoice",
    "bank",
    "wire",
}

URGENCY_TERMS = {
    "urgent",
    "immediately",
    "now",
    "expires",
    "limited",
    "final warning",
    "suspended",
    "locked",
}

URL_SHORTENERS = {
    "bit.ly",
    "tinyurl.com",
    "t.co",
    "goo.gl",
    "rb.gy",
    "cutt.ly",
    "is.gd",
    "ow.ly",
}

KEYWORD_GROUPS = {
    "credential": {"password", "otp", "login", "verify", "account"},
    "payment": {"invoice", "payment", "refund", "wire", "bank"},
    "urgency": {"urgent", "immediately", "now", "expires", "warning"},
    "job": {"application", "interview", "recruiter", "hiring", "job"},
    "newsletter": {"newsletter", "digest", "unsubscribe", "edition", "update"},
}

LABEL_SCORE = {"safe": 10, "suspicious": 58, "phishing": 90}
VALID_LABELS = {"safe", "suspicious", "phishing"}


@dataclass(frozen=True)
class TrainingExample:
    label: str
    subject: str
    sender: str
    snippet: str
    body_text: str
    reason: str
    sender_domain: str
    tokens: frozenset[str]
    keyword_flags: frozenset[str]
    embedding: Any | None = None


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[:limit]


def _extract_domain(sender: str) -> str:
    _, email_addr = parseaddr(sender)
    if "@" not in email_addr:
        return ""
    return email_addr.split("@", 1)[1].lower().strip()


def _extract_urls(text: str) -> list[str]:
    return re.findall(r"https?://[^\s)>\"']+", text or "", flags=re.IGNORECASE)


def _tokenize(text: str) -> frozenset[str]:
    return frozenset(
        tok
        for tok in re.findall(r"[a-z0-9]{3,}", (text or "").lower())
        if len(tok) >= 3
    )


def _keyword_flags(text: str) -> frozenset[str]:
    lowered = (text or "").lower()
    flags = set()
    for key, words in KEYWORD_GROUPS.items():
        if any(w in lowered for w in words):
            flags.add(key)
    return frozenset(flags)


def _dedupe(items: list[str]) -> list[str]:
    seen = set()
    out = []
    for item in items:
        key = re.sub(r"\s+", " ", (item or "").strip().lower())
        if key and key not in seen:
            seen.add(key)
            out.append((item or "").strip())
    return out


def _label_from_score(score: int) -> str:
    if score >= 78:
        return "phishing"
    if score >= 44:
        return "suspicious"
    return "safe"


def _confidence_from_score(score: int, label: str) -> int:
    if label == "phishing":
        return max(78, min(98, 55 + score // 2))
    if label == "suspicious":
        return max(60, min(92, 42 + score // 2))
    return max(68, min(96, 90 - score // 3))


@lru_cache(maxsize=1)
def _load_training_examples(max_rows: int = 1800) -> tuple[TrainingExample, ...]:
    path = Path(__file__).resolve().parents[2] / "datasets" / "training_data.jsonl"
    if not path.exists():
        return tuple()

    raw_data = []
    texts_to_embed = []

    try:
        with path.open("r", encoding="utf-8") as f:
            for line in f:
                if len(raw_data) >= max_rows:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue

                label = (item.get("label") or "").strip().lower()
                if label not in VALID_LABELS:
                    continue
                
                raw_data.append(item)
                
                # Prepare text for embedding
                subject = str(item.get("subject") or "")
                sender = str(item.get("sender") or "")
                snippet = str(item.get("snippet") or "")
                body_text = str(item.get("body_text") or "")
                combined = f"{subject}\n{sender}\n{snippet}\n{_truncate(body_text, 900)}"
                texts_to_embed.append(combined)

    except Exception:
        return tuple()

    if not raw_data:
        return tuple()

    # Generate embeddings in batch
    try:
        model = _get_embedding_model()
        if model is None:
            return tuple()
        # list(generator) to force computation
        embeddings = list(model.embed(texts_to_embed))
    except Exception as e:
        logger.warning("Embedding generation failed: %s", str(e))
        return tuple()

    examples: list[TrainingExample] = []
    for item, text, emb in zip(raw_data, texts_to_embed, embeddings):
        subject = str(item.get("subject") or "")
        sender = str(item.get("sender") or "")
        snippet = str(item.get("snippet") or "")
        body_text = str(item.get("body_text") or "")
        reason = str(item.get("reason") or "")
        
        examples.append(
            TrainingExample(
                label=(item.get("label") or "").strip().lower(),
                subject=subject,
                sender=sender,
                snippet=snippet,
                body_text=body_text,
                reason=reason,
                sender_domain=_extract_domain(sender),
                tokens=_tokenize(text),
                keyword_flags=_keyword_flags(text),
                embedding=emb,
            )
        )

    return tuple(examples)



def _example_similarity(
    example: TrainingExample,
    query_embedding: Any,
    query_tokens: frozenset[str],
    query_domain: str,
    query_flags: frozenset[str],
) -> float:
    if example.embedding is None:
        return 0.0
    if np is None:
        return 0.0

    # Cosine similarity (embeddings are normalized)
    # Dot product needed
    semantic_score = float(np.dot(query_embedding, example.embedding))

    # Lexical overlap helps catch near-identical phishing templates even when embeddings drift.
    lexical_score = 0.0
    if query_tokens and example.tokens:
        inter = len(query_tokens.intersection(example.tokens))
        union = len(query_tokens.union(example.tokens))
        lexical_score = inter / union if union else 0.0
    
    # Boosters
    flag_overlap = len(query_flags.intersection(example.keyword_flags))
    flag_score = 0.12 * flag_overlap
    domain_score = 0.28 if query_domain and query_domain == example.sender_domain else 0.0
    
    return (0.72 * semantic_score) + (0.28 * lexical_score) + flag_score + domain_score


def _retrieve_similar_examples(
    subject: str,
    sender: str,
    snippet: str,
    body_text: str,
    top_k: int = 5,
) -> list[tuple[TrainingExample, float]]:
    try:
        examples = _load_training_examples()
    except Exception as exc:
        logger.warning("Loading training examples failed: %s", str(exc))
        return []
        
    if not examples:
        return []

    query_text = f"{subject}\n{sender}\n{snippet}\n{_truncate(body_text, 900)}"
    query_tokens = _tokenize(query_text)
    query_flags = _keyword_flags(query_text)
    query_domain = _extract_domain(sender)
    
    try:
        model = _get_embedding_model()
        if model is None:
            return []
        # embed return generator, get first item
        query_embedding = list(model.embed([query_text]))[0]
    except Exception as exc:
        logger.warning("Query embedding failed: %s", str(exc))
        return []

    scored: list[tuple[TrainingExample, float]] = []
    for ex in examples:
        score = _example_similarity(ex, query_embedding, query_tokens, query_domain, query_flags)
        # Slightly lower threshold to reduce misses; lexical + flag/domain boosts keep precision stable.
        if score > 0.28:
            scored.append((ex, score))

    scored.sort(key=lambda row: row[1], reverse=True)
    return scored[:top_k]



def _dataset_prior(similar: list[tuple[TrainingExample, float]]) -> tuple[int, str, list[str]]:
    if not similar:
        return 0, "safe", []

    weighted_total = 0.0
    weighted_score = 0.0
    label_votes = {"safe": 0.0, "suspicious": 0.0, "phishing": 0.0}

    for ex, sim in similar:
        w = max(0.01, sim)
        weighted_total += w
        weighted_score += w * LABEL_SCORE.get(ex.label, 10)
        label_votes[ex.label] += w

    prior_score = int(round(weighted_score / weighted_total)) if weighted_total else 0
    prior_label = max(label_votes.items(), key=lambda item: item[1])[0]

    findings = []
    summary = ", ".join(f"{k}:{int(round(v * 100))}" for k, v in sorted(label_votes.items(), key=lambda i: i[1], reverse=True))
    findings.append(f"Dataset-neighbor signal suggests '{prior_label}' (weighted votes: {summary}).")

    top = similar[0][0]
    if top.reason:
        findings.append(f"Closest labeled example reason: {top.reason[:180]}")

    return min(100, max(0, prior_score)), prior_label, findings


def _technical_signals(subject: str, sender: str, snippet: str, body_text: str) -> tuple[int, list[str], dict[str, bool]]:
    findings: list[str] = []
    flags = {
        "has_raw_ip_url": False,
        "has_malformed_url": False,
        "has_shortener": False,
        "has_obfuscated_url": False,
        "sensitive_and_urgent": False,
    }

    score = 0
    combined = f"{subject}\n{snippet}\n{body_text}".lower()
    urls = _extract_urls(body_text or snippet)

    for url in urls[:20]:
        try:
            host = (urlparse(url).hostname or "").lower()
        except ValueError:
            flags["has_malformed_url"] = True
            score += 12
            findings.append(f"Malformed URL detected: {url}")
            continue

        if re.fullmatch(r"(?:\d{1,3}\.){3}\d{1,3}", host or ""):
            flags["has_raw_ip_url"] = True
            score += 20
            findings.append("Link points to raw IP address instead of trusted domain.")

        if host in URL_SHORTENERS:
            flags["has_shortener"] = True
            score += 8
            findings.append(f"Link shortener used ({host}), destination is hidden.")

        if "@" in url or "xn--" in host:
            flags["has_obfuscated_url"] = True
            score += 16
            findings.append("Obfuscated URL pattern found (possible spoof/homograph).")

    has_sensitive = any(term in combined for term in SENSITIVE_TERMS)
    has_urgency = any(term in combined for term in URGENCY_TERMS)
    if has_sensitive and has_urgency:
        flags["sensitive_and_urgent"] = True
        score += 14
        findings.append("Urgency combined with credential/payment language detected.")

    return min(100, score), _dedupe(findings), flags


def _build_llm_prompt() -> str:
    return (
        "You classify emails for phishing risk. Focus on intent and evidence, not just brand mentions. "
        "Do NOT mark phishing only because words like Microsoft/Google appear in normal newsletters. "
        "Prioritize sender legitimacy, request type (credential/payment), link behavior, urgency pressure, "
        "and impersonation patterns. "
        "Return strict JSON keys: "
        "label (safe|suspicious|phishing), confidence (0-100 integer), reason (short), "
        "findings (array of concise evidence bullets), evidence (array), counter_evidence (array)."
    )


def _format_similar_examples(similar: list[tuple[TrainingExample, float]]) -> str:
    if not similar:
        return "No similar labeled examples available."

    lines = []
    for idx, (ex, sim) in enumerate(similar, start=1):
        lines.append(
            f"{idx}. label={ex.label}, similarity={sim:.3f}, sender={ex.sender}, subject={ex.subject}, "
            f"reason={_truncate(ex.reason, 180)}"
        )
    return "\n".join(lines)


def _parse_model_json(payload: str) -> dict[str, Any]:
    obj = json.loads(payload)
    label = str(obj.get("label") or "suspicious").strip().lower()
    if label not in VALID_LABELS:
        label = "suspicious"

    try:
        confidence = int(obj.get("confidence", 55))
    except Exception:
        confidence = 55
    confidence = max(0, min(100, confidence))

    reason = str(obj.get("reason") or "Model returned incomplete explanation.").strip()

    findings = [x for x in (obj.get("findings") or []) if isinstance(x, str)]
    evidence = [x for x in (obj.get("evidence") or []) if isinstance(x, str)]
    counter = [x for x in (obj.get("counter_evidence") or []) if isinstance(x, str)]

    return {
        "label": label,
        "confidence": confidence,
        "reason": reason,
        "findings": findings,
        "evidence": evidence,
        "counter_evidence": counter,
    }


def _fuse_decision(
    model_label: str,
    model_confidence: int,
    prior_score: int,
    prior_label: str,
    technical_score: int,
    technical_flags: dict[str, bool],
) -> tuple[str, int, int]:
    model_score = int(round((LABEL_SCORE.get(model_label, 58) * 0.6) + (model_confidence * 0.4)))
    blended = int(round((0.64 * model_score) + (0.24 * prior_score) + (0.12 * technical_score)))

    if technical_flags.get("has_raw_ip_url") and blended < 50:
        blended = 50
    if technical_flags.get("has_obfuscated_url") and blended < 55:
        blended = 55

    if prior_label == "safe" and model_label == "phishing" and model_confidence < 90 and technical_score < 18:
        blended = min(blended, 62)
    if prior_label == "phishing" and model_label == "safe" and technical_score >= 12:
        blended = max(blended, 52)

    label = _label_from_score(blended)
    confidence = _confidence_from_score(blended, label)

    if model_label == label and model_label == "phishing":
        confidence = max(confidence, min(98, model_confidence))

    return label, confidence, blended


def _fallback_vote_label(prior_label: str, prior_score: int, technical_score: int, blended: int) -> str:
    if prior_label == "phishing":
        if prior_score >= 68 or technical_score >= 12:
            return "phishing"
        return "suspicious"
    if prior_label == "suspicious":
        if technical_score >= 26:
            return "phishing"
        return "suspicious" if blended >= 34 else "safe"
    if technical_score >= 28:
        return "suspicious"
    return _label_from_score(blended)



TRUSTED_DOMAINS = {
    "google.com",
    "youtube.com",
    "linkedin.com",
    "github.com",
    "amazon.com",
    "microsoft.com",
    "apple.com",
}

def learn_from_feedback(
    subject: str,
    sender: str,
    snippet: str,
    body_text: str,
    label: str,
    reason: str = "",
) -> None:
    """
    Appends a new training example to the dataset and clears the cache
    so it is picked up immediately by the semantic search.
    """
    path = Path(__file__).resolve().parents[2] / "datasets" / "training_data.jsonl"
    
    new_example = {
        "label": label,
        "subject": subject,
        "sender": sender,
        "snippet": snippet,
        "body_text": body_text,
        "reason": reason or f"User feedback: {label}",
    }
    
    try:
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(new_example) + "\n")
        
        # Clear cache so next RAG lookup sees this example
        _load_training_examples.cache_clear()
        logger.info(f"Learned from feedback: {label} for {sender}")
    except Exception as e:
        logger.error(f"Failed to save feedback: {e}")

def classify_email(subject: str, sender: str, snippet: str, body_text: str) -> dict:
    # 0. Trusted Domain Bypass (Simulated SPF/DKIM trust)
    sender_domain = _extract_domain(sender)
    if sender_domain in TRUSTED_DOMAINS:
        # In prod, we would check Authentication-Results header here
        return {
            "label": "safe",
            "confidence": 99,
            "reason": f"Trusted Domain: {sender_domain}",
        }

    content = (
        f"Subject: {subject}\n"
        f"Sender: {sender}\n"
        f"Snippet: {snippet}\n"
        f"Body: {_truncate(body_text, 2800)}"
    )

    similar = _retrieve_similar_examples(subject=subject, sender=sender, snippet=snippet, body_text=body_text)
    prior_score, prior_label, prior_findings = _dataset_prior(similar)
    technical_score, technical_findings, technical_flags = _technical_signals(
        subject=subject,
        sender=sender,
        snippet=snippet,
        body_text=body_text,
    )

    if not settings.groq_api_key:
        blended = int(round((0.78 * prior_score) + (0.22 * technical_score)))
        label = _fallback_vote_label(prior_label, prior_score, technical_score, blended)
        confidence = _confidence_from_score(blended, label)
        findings = _dedupe(prior_findings + technical_findings)
        reason = " | ".join(findings[:6]) if findings else "Dataset-driven fallback classification."
        return {"label": label, "confidence": confidence, "reason": reason}

    try:
        user_payload = (
            f"Email:\n{content}\n\n"
            f"Technical signals:\n- score={technical_score}\n"
            + ("\n".join(f"- {f}" for f in technical_findings[:6]) or "- none")
            + "\n\n"
            + f"Dataset-neighbor prior:\n- prior_label={prior_label}\n- prior_score={prior_score}\n"
            + ("\n".join(f"- {f}" for f in prior_findings[:3]) or "- none")
            + "\n\n"
            + "Similar labeled examples:\n"
            + _format_similar_examples(similar)
        )

        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.groq_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.groq_model,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": _build_llm_prompt()},
                    {"role": "user", "content": user_payload},
                ],
            },
            timeout=35,
        )
        resp.raise_for_status()
        parsed = resp.json()
        payload = parsed["choices"][0]["message"]["content"]
        model = _parse_model_json(payload)

        label, confidence, _ = _fuse_decision(
            model_label=model["label"],
            model_confidence=model["confidence"],
            prior_score=prior_score,
            prior_label=prior_label,
            technical_score=technical_score,
            technical_flags=technical_flags,
        )

        merged_findings = _dedupe(
            technical_findings
            + prior_findings
            + model.get("findings", [])
            + model.get("evidence", [])
        )

        reason = " | ".join(merged_findings[:6]) if merged_findings else model["reason"]
        return {"label": label, "confidence": confidence, "reason": reason}
    except Exception as exc:
        logger.warning("LLM classification failed; using fallback: %s", str(exc))
        blended = int(round((0.72 * prior_score) + (0.28 * technical_score)))
        label = _fallback_vote_label(prior_label, prior_score, technical_score, blended)
        confidence = _confidence_from_score(blended, label)
        findings = _dedupe(prior_findings + technical_findings)
        reason = " | ".join(findings[:6]) if findings else "LLM error fallback classification."
        return {"label": label, "confidence": confidence, "reason": reason}
