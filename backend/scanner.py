import base64
import json
import random
import re
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, List, Dict

try:
    import docx
except ImportError:
    docx = None

# Using gemini-1.5-flash as it is the fastest and most cost-effective for bulk text/vision tasks
MODEL_NAME = "gemini-1.5-flash"
MAX_OUTPUT_TOKENS = 1200
RETRY_LIMIT = 3

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
        "decision": {"type": "string", "enum": ["SHORTLIST", "REVIEW", "REJECT"]},
        "decision_reason": {"type": "string"},
    },
    "required": [
        "candidate_name", "highest_degree", "field_of_study",
        "ai_experience_years", "matched_skills", "missing_skills",
        "ats_score", "decision", "decision_reason",
    ],
}

def get_model_quota(model_name: str = MODEL_NAME) -> dict:
    quotas = {
        "gemini-1.5-pro": {"rpm": 2, "max_workers": 2, "daily_limit": 50},
        "gemini-1.5-flash": {"rpm": 15, "max_workers": 4, "daily_limit": 1500},
        "gemini-2.0-flash": {"rpm": 15, "max_workers": 5, "daily_limit": 1500},
    }
    for key, quota in quotas.items():
        if key in model_name:
            return quota
    return {"rpm": 15, "max_workers": 4, "daily_limit": 1500}

def build_prompt(role: str, job_description: str, skills: str, reject_threshold: int, shortlist_threshold: int) -> str:
    return (
        f"You are an expert ATS (Applicant Tracking System).\n"
        f"Role: {role}\n"
        f"Job Description: {job_description}\n"
        f"Target Skills: {skills}\n\n"
        "Instructions:\n"
        "1. Analyze the provided resume against the Role, Job Description, and Target Skills.\n"
        "2. Score the candidate from 0 to 100 based on overall match, experience, technical skills, education, and missing requirements.\n"
        "3. Categorize the candidate based on these EXACT rules. The score directly determines the decision:\n"
        f"   - REJECT: If the score is strictly less than {reject_threshold}.\n"
        f"   - REVIEW: If the score is between {reject_threshold} and {shortlist_threshold} inclusive.\n"
        f"   - SHORTLIST: If the score is strictly greater than {shortlist_threshold}.\n"
        "4. Provide a detailed 'decision_reason' explaining EXACTLY why they were assigned this category and justify the score.\n"
        "Return one final ATS decision and score in the specified JSON format."
    )

def build_payload(file_path: Path, prompt: str) -> dict:
    parts = []
    ext = file_path.suffix.lower()
    
    # 1. Handle PDF
    if ext == ".pdf":
        file_data = base64.b64encode(file_path.read_bytes()).decode("utf-8")
        parts.append({"inline_data": {"mime_type": "application/pdf", "data": file_data}})
    
    # 2. Handle Images natively via Gemini Multimodal capabilities
    elif ext in [".png", ".jpg", ".jpeg"]:
        mime_type = "image/png" if ext == ".png" else "image/jpeg"
        file_data = base64.b64encode(file_path.read_bytes()).decode("utf-8")
        parts.append({"inline_data": {"mime_type": mime_type, "data": file_data}})
    
    # 3. Handle Text Extraction for DOCX
    elif ext in [".docx", ".doc"]:
        if docx is None:
            raise RuntimeError("python-docx is required. Please install it via requirements.txt")
        try:
            doc = docx.Document(file_path)
            text_content = "\n".join([para.text for para in doc.paragraphs])
            parts.append({"text": f"--- RESUME CONTENT ---\n{text_content}\n--- END RESUME CONTENT ---"})
        except Exception as e:
            raise RuntimeError(f"Failed to read DOCX file {file_path.name}: {str(e)}")
    else:
        raise RuntimeError(f"Unsupported file format: {ext}")

    # Append the prompt to the payload
    parts.append({"text": prompt})
    
    return {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 0.1,
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

def call_gemini(api_key: str, file_path: Path, prompt: str) -> dict:
    import time
    last_error = ""
    for attempt in range(RETRY_LIMIT + 1):
        try:
            payload = build_payload(file_path, prompt)
            response = post_json(api_key, payload)
            text = response["candidates"][0]["content"]["parts"][0]["text"]
            return parse_response(text)
        except urllib.error.HTTPError as exc:
            error_body = exc.read().decode('utf-8', errors='replace')
            last_error = f"HTTP {exc.code}: {error_body}"
            # Handle rate limits (429) or server errors (500+) by backing off and retrying
            if exc.code in {429, 500, 502, 503, 504} and attempt < RETRY_LIMIT:
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
    # Ensure robust JSON parsing even if the LLM wraps it in markdown blocks
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match: 
            raise RuntimeError("Could not parse JSON from model response.")
        data = json.loads(match.group(0))

    score = float(data.get("ats_score", 0))
    decision = str(data.get("decision", "")).upper()
    
    if decision not in {"SHORTLIST", "REVIEW", "REJECT"}:
        decision = "REVIEW"

    return {
        "candidate_name": str(data.get("candidate_name", "Unknown")).strip(),
        "highest_degree": str(data.get("highest_degree", "Not Specified")).strip(),
        "field_of_study": str(data.get("field_of_study", "Not Specified")).strip(),
        "ai_experience_years": float(data.get("ai_experience_years", 0)),
        "matched_skills": data.get("matched_skills", []),
        "missing_skills": data.get("missing_skills", []),
        "ats_score": round(score, 2),
        "decision": decision,
        "decision_reason": str(data.get("decision_reason", "")).strip(),
    }

def analyze_document(api_key: str, file_path: Path, prompt: str) -> dict:
    try:
        data = call_gemini(api_key, file_path, prompt)
        return {"file": file_path.name, "source_path": str(file_path), "error": "", **data}
    except Exception as exc:
        raise RuntimeError(f"Error processing {file_path.name}: {str(exc)}") from exc

def chunks(lst: list, n: int):
    # Yield successive n-sized chunks from list
    return [lst[i:i + n] for i in range(0, len(lst), n)]