import base64
import csv
import json
import os
import re
import shutil
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any


# Option 1: paste your API key here.
# Example: GEMINI_API_KEY = "AIza..."
# Option 2: leave this empty and set an environment variable named GEMINI_API_KEY.
GEMINI_API_KEY = "Your_Own_API_KEY"

INPUT_FOLDER = Path("input_cvs")
SHORTLISTED_FOLDER = Path("shortlisted_cvs")
REPORT_FILE = Path("screening_results.csv")

MODEL_NAME = "gemini-3.1-flash-lite"
REQUESTS_PER_MINUTE = 1000
DEFAULT_MAX_WORKERS = 100
DAILY_REQUEST_LIMIT = 50000
MINIMUM_SCORE = 60
REQUEST_TIMEOUT_SECONDS = 90
MAX_OUTPUT_TOKENS = 2000
RETRY_LIMIT = 3

TARGET_ROLE = "AI / Machine Learning Engineer"
TARGET_SKILLS = [
    "python",
    "machine learning",
    "deep learning",
    "tensorflow",
    "pytorch",
    "langchain",
    "llm",
    "nlp",
    "computer vision",
    "opencv",
    "data science",
    "scikit-learn",
    "agents",
    "agentic ai",
]

CSV_COLUMNS = [
    "file",
    "candidate_name",
    "highest_degree",
    "field_of_study",
    "ai_experience_years",
    "matched_skills",
    "missing_skills",
    "ats_score",
    "decision",
    "decision_reason",
    "moved_to_shortlisted",
    "error",
]


def load_env_file() -> None:
    env_path = Path(".env")
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")

        if key and key not in os.environ:
            os.environ[key] = value


def get_api_key() -> str:
    load_env_file()
    api_key = os.getenv("GEMINI_API_KEY") or GEMINI_API_KEY
    api_key = api_key.strip()

    if not api_key:
        raise RuntimeError(
            "Gemini API key is missing. Put it in GEMINI_API_KEY at the top of "
            "main.py, or create a .env file containing GEMINI_API_KEY=your_key_here."
        )

    return api_key


def get_max_workers() -> int:
    value = os.getenv("MAX_WORKERS", str(DEFAULT_MAX_WORKERS)).strip()
    try:
        workers = int(value)
    except ValueError:
        workers = DEFAULT_MAX_WORKERS

    return max(1, min(workers, REQUESTS_PER_MINUTE))


def get_requests_per_minute() -> int:
    value = os.getenv("REQUESTS_PER_MINUTE", str(REQUESTS_PER_MINUTE)).strip()
    try:
        rpm = int(value)
    except ValueError:
        rpm = REQUESTS_PER_MINUTE

    return max(1, min(rpm, REQUESTS_PER_MINUTE))


def build_prompt() -> str:
    skills = ", ".join(TARGET_SKILLS)
    return (
        "ATS screen this PDF resume for role: "
        f"{TARGET_ROLE}. Target skills: {skills}. "
        f"Minimum shortlist score: {MINIMUM_SCORE}. "
        "Use only evidence in the PDF. Return one decision only. "
        "decision must be SHORTLIST or REJECT. Keep decision_reason under 18 words."
    )


def call_gemini_with_pdf(api_key: str, pdf_path: Path) -> dict[str, Any]:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{MODEL_NAME}:generateContent"
    )

    pdf_data = base64.b64encode(pdf_path.read_bytes()).decode("utf-8")
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "inline_data": {
                            "mime_type": "application/pdf",
                            "data": pdf_data,
                        }
                    },
                    {"text": build_prompt()},
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0,
            "response_mime_type": "application/json",
            "maxOutputTokens": MAX_OUTPUT_TOKENS,
            "responseSchema": {
                "type": "OBJECT",
                "properties": {
                    "candidate_name": {"type": "STRING"},
                    "highest_degree": {"type": "STRING"},
                    "field_of_study": {"type": "STRING"},
                    "ai_experience_years": {"type": "NUMBER"},
                    "matched_skills": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"}
                    },
                    "missing_skills": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"}
                    },
                    "ats_score": {"type": "NUMBER"},
                    "decision": {"type": "STRING"},
                    "decision_reason": {"type": "STRING"}
                },
                "required": [
                    "candidate_name",
                    "highest_degree",
                    "field_of_study",
                    "ai_experience_years",
                    "matched_skills",
                    "missing_skills",
                    "ats_score",
                    "decision",
                    "decision_reason"
                ]
            }
        },
    }

    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
    )

    for attempt in range(RETRY_LIMIT + 1):
        try:
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                response_body = response.read().decode("utf-8")
            break
        except urllib.error.HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            if exc.code in {429, 500, 502, 503, 504} and attempt < RETRY_LIMIT:
                retry_after = exc.headers.get("Retry-After")
                wait_seconds = int(retry_after) if retry_after and retry_after.isdigit() else 2
                time.sleep(wait_seconds)
                continue
            raise RuntimeError(f"Gemini API HTTP {exc.code}: {error_body}") from exc
        except urllib.error.URLError as exc:
            if attempt < RETRY_LIMIT:
                time.sleep(2)
                continue
            raise RuntimeError(f"Gemini API connection error: {exc.reason}") from exc

    response_json = json.loads(response_body)
    try:
        text = response_json["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as exc:
        raise RuntimeError(f"Unexpected Gemini response: {response_body}") from exc

    return extract_json(text)


def extract_json(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(0))


def normalize_decision(value: Any, score: float) -> str:
    decision = str(value or "").strip().upper()

    if decision in {"SHORTLIST", "SHORTLISTED", "YES", "ACCEPT"}:
        return "SHORTLIST"

    if decision in {"REJECT", "REJECTED", "NO"}:
        return "REJECT"

    return "SHORTLIST" if score >= MINIMUM_SCORE else "REJECT"


def as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def as_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]

    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]

    return []


def unique_destination(path: Path) -> Path:
    if not path.exists():
        return path

    counter = 1
    while True:
        candidate = path.with_name(f"{path.stem}_{counter}{path.suffix}")
        if not candidate.exists():
            return candidate
        counter += 1


def analyze_pdf(api_key: str, pdf_path: Path) -> dict[str, Any]:
    try:
        data = call_gemini_with_pdf(api_key, pdf_path)
        score = max(0.0, min(100.0, as_float(data.get("ats_score"))))
        decision = normalize_decision(data.get("decision"), score)
        moved = False

        if decision == "SHORTLIST":
            destination = unique_destination(SHORTLISTED_FOLDER / pdf_path.name)
            shutil.move(str(pdf_path), str(destination))
            moved = True

        return {
            "file": pdf_path.name,
            "candidate_name": str(data.get("candidate_name", "")).strip(),
            "highest_degree": str(data.get("highest_degree", "")).strip(),
            "field_of_study": str(data.get("field_of_study", "")).strip(),
            "ai_experience_years": as_float(data.get("ai_experience_years")),
            "matched_skills": ", ".join(as_list(data.get("matched_skills"))),
            "missing_skills": ", ".join(as_list(data.get("missing_skills"))),
            "ats_score": round(score, 2),
            "decision": decision,
            "decision_reason": str(data.get("decision_reason", "")).strip(),
            "moved_to_shortlisted": moved,
            "error": "",
        }

    except Exception as exc:
        return {
            "file": pdf_path.name,
            "candidate_name": "",
            "highest_degree": "",
            "field_of_study": "",
            "ai_experience_years": 0,
            "matched_skills": "",
            "missing_skills": "",
            "ats_score": 0,
            "decision": "ERROR",
            "decision_reason": "",
            "moved_to_shortlisted": False,
            "error": str(exc),
        }


def write_report(rows: list[dict[str, Any]]) -> None:
    global REPORT_FILE

    rows = sorted(
        rows,
        key=lambda row: (row["decision"] != "SHORTLIST", -float(row["ats_score"])),
    )

    while True:
        try:
            with REPORT_FILE.open("w", newline="", encoding="utf-8") as report:
                writer = csv.DictWriter(report, fieldnames=CSV_COLUMNS)
                writer.writeheader()
                writer.writerows(rows)
            return
        except PermissionError:
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            REPORT_FILE = Path(f"screening_results_{timestamp}.csv")
            print(f"CSV file is locked. Saving report as {REPORT_FILE} instead.")


def chunks(items: list[Path], size: int) -> list[list[Path]]:
    return [items[index:index + size] for index in range(0, len(items), size)]


def process_batch(
    api_key: str,
    batch: list[Path],
    workers: int,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=workers) as executor:
        future_to_pdf = {
            executor.submit(analyze_pdf, api_key, pdf_path): pdf_path
            for pdf_path in batch
        }

        for future in as_completed(future_to_pdf):
            pdf_path = future_to_pdf[future]
            row = future.result()
            rows.append(row)

            print(
                f"{pdf_path.name}: {row['decision']} "
                f"(score: {row['ats_score']})"
            )

            if row["error"]:
                print(f"  Error: {row['error']}")

    return rows


def run() -> None:
    start_time = time.time()
    INPUT_FOLDER.mkdir(exist_ok=True)
    SHORTLISTED_FOLDER.mkdir(exist_ok=True)

    try:
        api_key = get_api_key()
    except RuntimeError as exc:
        print(exc)
        return

    pdfs = sorted(INPUT_FOLDER.glob("*.pdf"))
    if not pdfs:
        print(f"No PDFs found in {INPUT_FOLDER}.")
        return

    if len(pdfs) > DAILY_REQUEST_LIMIT:
        pdfs = pdfs[:DAILY_REQUEST_LIMIT]
        print(f"Daily model limit is {DAILY_REQUEST_LIMIT}. Processing first {DAILY_REQUEST_LIMIT} PDFs only.")

    requests_per_minute = min(get_requests_per_minute(), len(pdfs))
    workers = min(get_max_workers(), requests_per_minute)
    results: list[dict[str, Any]] = []

    print(f"Found {len(pdfs)} PDF(s).")
    print(f"Model: {MODEL_NAME}")
    print(f"Quota-safe speed: {requests_per_minute} request(s) per minute.")
    print(f"Parallel workers per batch: {workers}")

    pdf_batches = chunks(pdfs, requests_per_minute)
    for batch_number, batch in enumerate(pdf_batches, start=1):
        batch_start = time.time()
        print(f"\nBatch {batch_number}/{len(pdf_batches)}: {len(batch)} PDF(s)")
        results.extend(process_batch(api_key, batch, workers))
        write_report(results)

        is_last_batch = batch_number == len(pdf_batches)
        elapsed = time.time() - batch_start
        wait_seconds = max(0, 60 - elapsed)

        if not is_last_batch and wait_seconds > 0:
            print(f"Waiting {round(wait_seconds)} seconds for quota reset...")
            time.sleep(wait_seconds)

    write_report(results)
    elapsed = round(time.time() - start_time, 2)
    print(f"CSV report saved: {REPORT_FILE}")
    print(f"Shortlisted PDFs moved to: {SHORTLISTED_FOLDER}")
    print(f"Done in {elapsed} seconds.")


if __name__ == "__main__":
    run()
