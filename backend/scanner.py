import base64
import json
import random
import re
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, List, Dict

MODEL_NAME = "gemini-3.1-flash-lite"
MAX_OUTPUT_TOKENS = 1200
RETRY_LIMIT = 2

ATS_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "candidate_name": {"type": "string"},
        "highest_degree": {"type": "string"},
        "field_of_study": {"type": "string"},
        "ai_experience_years": {"type": "number"},
        "matched_skills": {"type": "array", "items": {"type": "string"}},
        "missing_skills": {"type": "array", "items": {"type": "string"}},
        "ats_score": {"type": "number"},
        "decision": {"type": "string", "enum": ["SHORTLIST", "REJECT"]},
        "decision_reason": {"type": "string"},
    },
    "required": [
        "candidate_name", "highest_degree", "field_of_study",
        "ai_experience_years", "matched_skills", "missing_skills",
        "ats_score", "decision", "decision_reason",
    ],
}


def get_model_quota(model_name: str = MODEL_NAME) -> dict:
    """
    Optimized Quotas: max_workers is set to 4 or 5 to prevent API Burst 429 errors.
    Smoothly processing 4 at a time is mathematically faster than 15 failing and retrying.
    """
    quotas = {
        "gemini-1.5-pro": {"rpm": 2, "max_workers": 2, "daily_limit": 50},
        "gemini-1.5-flash": {"rpm": 15, "max_workers": 4, "daily_limit": 1500},
        "gemini-3.1-flash-lite": {"rpm": 15, "max_workers": 4, "daily_limit": 500},
        "gemini-2.0-flash": {"rpm": 15, "max_workers": 5, "daily_limit": 1500},
    }
    for key, quota in quotas.items():
        if key in model_name:
            return quota
    return {"rpm": 15, "max_workers": 4, "daily_limit": 500}


def build_prompt(role: str, skills: str, min_score: int) -> str:
    return (
        f"Screen this PDF resume for the role: {role}. "
        f"Target skills: {skills}. "
        f"Shortlist threshold: {min_score}. "
        "Use only evidence visible in the PDF. "
        "Score from 0 to 100 based on role match, experience, "
        "technical skills, education, field of study, and missing requirements. "
        "Return one final ATS decision only."
    )


def build_payload(pdf_path: Path, prompt: str) -> dict:
    # Removed the schema guessing loop for direct, accurate REST JSON configuration.
    pdf_data = base64.b64encode(pdf_path.read_bytes()).decode("utf-8")

    return {
        "contents": [
            {"parts": [{"inline_data": {"mime_type": "application/pdf", "data": pdf_data}}, {"text": prompt}]}
        ],
        "generationConfig": {
            "temperature": 0,
            "maxOutputTokens": MAX_OUTPUT_TOKENS,
            "responseMimeType": "application/json",
            "responseSchema": ATS_RESPONSE_SCHEMA
        },
    }


def post_json(api_key: str, payload: dict) -> dict:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_NAME}:generateContent"
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def call_gemini(api_key: str, pdf_path: Path, prompt: str) -> dict:
    import time
    last_error = ""

    for attempt in range(RETRY_LIMIT + 1):
        try:
            payload = build_payload(pdf_path, prompt)
            response = post_json(api_key, payload)
            text = response["candidates"][0]["content"]["parts"][0]["text"]
            return parse_response(text)
        except urllib.error.HTTPError as exc:
            error_body = exc.read().decode('utf-8', errors='replace')
            last_error = f"HTTP {exc.code}: {error_body}"

            # Smart Retry only on Rate Limits (429) or Server Errors (50x)
            if exc.code in {429, 500, 502, 503, 504} and attempt < RETRY_LIMIT:
                # Add jitter (randomness) so multiple threads don't retry at the exact same millisecond
                jitter = random.uniform(0.5, 1.5)
                time.sleep((2 * (attempt + 1)) + jitter)
                continue
            raise RuntimeError(last_error) from exc
        except Exception as exc:
            last_error = str(exc)
            if attempt < RETRY_LIMIT:
                time.sleep((2 * (attempt + 1)) + random.uniform(0.5, 1.5))
                continue
            raise RuntimeError(last_error) from exc

    raise RuntimeError(last_error)


def parse_response(text: str) -> dict:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match: raise
        data = json.loads(match.group(0))

    score = float(data.get("ats_score", 0))
    decision = str(data.get("decision", "")).upper()
    if decision not in {"SHORTLIST", "REJECT"}:
        decision = "SHORTLIST" if score >= 60 else "REJECT"

    return {
        "candidate_name": str(data.get("candidate_name", "")).strip(),
        "highest_degree": str(data.get("highest_degree", "")).strip(),
        "field_of_study": str(data.get("field_of_study", "")).strip(),
        "ai_experience_years": float(data.get("ai_experience_years", 0)),
        "matched_skills": data.get("matched_skills", []),
        "missing_skills": data.get("missing_skills", []),
        "ats_score": round(score, 2),
        "decision": decision,
        "decision_reason": str(data.get("decision_reason", "")).strip(),
    }


def analyze_pdf(api_key: str, pdf_path: Path, prompt: str) -> dict:
    try:
        data = call_gemini(api_key, pdf_path, prompt)
        return {"file": pdf_path.name, "source_path": str(pdf_path), "error": "", **data}
    except Exception as exc:
        raise RuntimeError(f"Error processing {pdf_path.name}: {str(exc)}") from exc


def chunks(lst: list, n: int):
    return [lst[i:i + n] for i in range(0, len(lst), n)]