import asyncio
import json
import os
import shutil
import sys
import time
from pathlib import Path
from fastapi import FastAPI, UploadFile, Form, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, str(Path(__file__).resolve().parent))
import scanner

app = FastAPI(title="AI ATS Server")

# CORS is fully enabled and ready for production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

tasks_db = {}
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent
UPLOAD_DIR = BACKEND_DIR / "temp_uploads"
SHORTLISTED_DIR = PROJECT_DIR / "shortlisted_cvs"
UPLOAD_DIR.mkdir(exist_ok=True)
SHORTLISTED_DIR.mkdir(exist_ok=True)


def load_env_file() -> None:
    for env_path in (BACKEND_DIR / ".env", PROJECT_DIR / ".env"):
        if not env_path.exists():
            continue

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
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is missing in backend .env.")
    return api_key


def unique_destination(path: Path) -> Path:
    if not path.exists():
        return path

    counter = 1
    while True:
        candidate = path.with_name(f"{path.stem}_{counter}{path.suffix}")
        if not candidate.exists():
            return candidate
        counter += 1

@app.api_route("/", methods=["GET", "HEAD"])
async def health_check():
    return {"status": "Nexus ATS Backend is awake!"}
@app.post("/api/start-screening")
async def start_screening(
        files: list[UploadFile],
        role: str = Form(...),
        skills: str = Form(...),
        min_score: int = Form(...)
):
    try:
        get_api_key()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    task_id = str(int(time.time() * 1000))
    task_dir = UPLOAD_DIR / task_id
    task_dir.mkdir(exist_ok=True)

    quota = scanner.get_model_quota()
    safe_daily_limit = quota["daily_limit"]
    safe_rpm = quota["rpm"]
    safe_workers = quota["max_workers"]

    saved_files = []
    process_files = files[:safe_daily_limit]

    for file in process_files:
        file_path = task_dir / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        saved_files.append(file_path)

    tasks_db[task_id] = {
        "status": "processing",
        "role": role,
        "skills": skills,
        "min_score": min_score,
        "rpm": safe_rpm,
        "max_workers": safe_workers,
        "files": saved_files,
        "results": [],
        "started_at": time.time(),
    }
    return {
        "task_id": task_id,
        "total_files": len(saved_files),
        "rpm": safe_rpm,
        "max_workers": safe_workers,
        "daily_limit": safe_daily_limit,
    }


async def screen_generator(task_id: str):
    task = tasks_db.get(task_id)
    if not task:
        yield f"data: {json.dumps({'type': 'error', 'msg': 'Task not found'})}\n\n"
        return

    files = task["files"]
    prompt = scanner.build_prompt(task["role"], task["skills"], task["min_score"])
    batches = scanner.chunks(files, task["rpm"])
    api_key = get_api_key()

    total_files = len(files)
    completed_files = 0
    started_at = time.time()

    yield f"data: {json.dumps({'type': 'start', 'total': total_files, 'started_at': started_at, 'rpm': task['rpm']})}\n\n"

    try:
        for batch_idx, batch in enumerate(batches):
            batch_start_time = time.time()
            yield f"data: {json.dumps({'type': 'info', 'msg': f'Processing batch {batch_idx + 1} of {len(batches)}...'})}\n\n"

            loop = asyncio.get_running_loop()
            with ThreadPoolExecutor(max_workers=task["max_workers"]) as executor:
                futures = [
                    loop.run_in_executor(executor, scanner.analyze_pdf, api_key, pdf, prompt)
                    for pdf in batch
                ]

                for coro in asyncio.as_completed(futures):
                    result = await coro

                    if result.get("decision") == "SHORTLIST":
                        source_path = Path(result["source_path"])
                        destination = unique_destination(SHORTLISTED_DIR / source_path.name)
                        shutil.move(str(source_path), str(destination))
                        result["shortlisted_path"] = str(destination)
                        result["moved_to_shortlisted"] = True
                    else:
                        result["shortlisted_path"] = ""
                        result["moved_to_shortlisted"] = False

                    result.pop("source_path", None)
                    task["results"].append(result)
                    completed_files += 1
                    elapsed = round(time.time() - started_at, 2)
                    yield f"data: {json.dumps({'type': 'progress', 'completed': completed_files, 'total': total_files, 'elapsed': elapsed, 'result': result})}\n\n"

            if batch_idx < len(batches) - 1:
                elapsed = time.time() - batch_start_time
                wait_seconds = max(0.0, 60.0 - elapsed)
                if wait_seconds > 0:
                    yield f"data: {json.dumps({'type': 'wait', 'seconds': round(wait_seconds)})}\n\n"
                    await asyncio.sleep(wait_seconds)

        total_elapsed = round(time.time() - started_at, 2)
        yield f"data: {json.dumps({'type': 'complete', 'results': task['results'], 'elapsed': total_elapsed})}\n\n"

        task_dir = UPLOAD_DIR / task_id
        if task_dir.exists():
            shutil.rmtree(task_dir)

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'msg': str(e)})}\n\n"


@app.get("/api/stream/{task_id}")
async def stream_progress(task_id: str):
    return StreamingResponse(screen_generator(task_id), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)