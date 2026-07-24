import asyncio
import json
import os
import shutil
import sys
import time
import zipfile
from pathlib import Path
from fastapi import FastAPI, UploadFile, Form, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, str(Path(__file__).resolve().parent))
import scanner

app = FastAPI(title="Nexus AI ATS Server")

# Read the Netlify Frontend URL from Render's Environment Variables
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

tasks_db = {}
BACKEND_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BACKEND_DIR / "temp_uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


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
    return {"status": "Nexus ATS Backend is awake and secure!"}


@app.post("/api/start-screening")
async def start_screening(
        files: list[UploadFile],
        role: str = Form(...),
        job_description: str = Form(...),
        skills: str = Form(...),
        reject_threshold: int = Form(...),
        shortlist_threshold: int = Form(...),
        api_key: str = Form(...)
):
    if not api_key or not api_key.strip():
        raise HTTPException(status_code=400, detail="Gemini API Key is required.")

    task_id = str(int(time.time() * 1000))

    # Task Isolation: Every batch gets its own secure directory
    task_dir = UPLOAD_DIR / task_id
    raw_dir = task_dir / "raw_uploads"
    output_dir = task_dir / "categorized_cvs"

    shortlisted_dir = output_dir / "Shortlisted"
    review_dir = output_dir / "Manual_Review"
    rejected_dir = output_dir / "Rejected"

    for d in [raw_dir, shortlisted_dir, review_dir, rejected_dir]:
        d.mkdir(parents=True, exist_ok=True)

    quota = scanner.get_model_quota()
    safe_daily_limit = quota["daily_limit"]
    safe_rpm = quota["rpm"]
    safe_workers = quota["max_workers"]

    temp_extracted = []

    for file in files:
        filename = file.filename.lower()
        if filename.endswith(".zip"):
            zip_path = raw_dir / file.filename
            with open(zip_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            try:
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    for zip_info in zip_ref.infolist():
                        if zip_info.is_dir(): continue
                        ext = zip_info.filename.lower()
                        if ext.endswith(('.pdf', '.docx', '.doc')):
                            safe_name = Path(zip_info.filename).name
                            extracted_path = raw_dir / f"{int(time.time() * 100)}_{safe_name}"
                            with open(extracted_path, "wb") as f_out:
                                f_out.write(zip_ref.read(zip_info.filename))
                            temp_extracted.append(extracted_path)
            except zipfile.BadZipFile:
                pass
            zip_path.unlink(missing_ok=True)

        elif filename.endswith(('.pdf', '.docx', '.doc')):
            file_path = raw_dir / file.filename
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            temp_extracted.append(file_path)

    process_files = temp_extracted[:safe_daily_limit]

    tasks_db[task_id] = {
        "status": "processing",
        "role": role,
        "job_description": job_description,
        "skills": skills,
        "reject_threshold": reject_threshold,
        "shortlist_threshold": shortlist_threshold,
        "api_key": api_key.strip(),
        "rpm": safe_rpm,
        "max_workers": safe_workers,
        "files": process_files,
        "results": [],
        "dirs": {
            "root": task_dir,
            "output": output_dir,
            "shortlist": shortlisted_dir,
            "review": review_dir,
            "reject": rejected_dir
        },
        "started_at": time.time(),
    }

    return {
        "task_id": task_id,
        "total_files": len(process_files),
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
    api_key = task["api_key"]
    dirs = task["dirs"]

    prompt = scanner.build_prompt(
        task["role"], task["job_description"], task["skills"],
        task["reject_threshold"], task["shortlist_threshold"]
    )

    batches = scanner.chunks(files, task["rpm"])
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
                    loop.run_in_executor(executor, scanner.analyze_pdf, api_key, file_path, prompt)
                    for file_path in batch
                ]
                for coro in asyncio.as_completed(futures):
                    result = await coro
                    source_path = Path(result["source_path"])
                    decision = result.get("decision")

                    # Physically categorize into specific task folders
                    if decision == "SHORTLIST":
                        destination = unique_destination(dirs["shortlist"] / source_path.name)
                    elif decision == "REVIEW":
                        destination = unique_destination(dirs["review"] / source_path.name)
                    else:
                        destination = unique_destination(dirs["reject"] / source_path.name)

                    shutil.move(str(source_path), str(destination))

                    result["final_path"] = str(destination)
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

        # FINAL STEP: Create the ZIP archive for the frontend to download
        zip_base_path = dirs["root"] / f"Nexus_Categorized_CVs_{task_id}"
        shutil.make_archive(str(zip_base_path), 'zip', str(dirs["output"]))

        yield f"data: {json.dumps({'type': 'complete', 'results': task['results'], 'elapsed': total_elapsed, 'download_id': task_id})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'msg': str(e)})}\n\n"


@app.get("/api/stream/{task_id}")
async def stream_progress(task_id: str):
    return StreamingResponse(screen_generator(task_id), media_type="text/event-stream")


def cleanup_directory(directory: Path):
    """Wait 2 minutes to ensure download completes, then wipe the directory to save disk space."""
    time.sleep(120)
    if directory.exists():
        shutil.rmtree(directory, ignore_errors=True)


@app.get("/api/download/{task_id}")
async def download_results(task_id: str, background_tasks: BackgroundTasks):
    zip_path = UPLOAD_DIR / task_id / f"Nexus_Categorized_CVs_{task_id}.zip"
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="Archive not found or expired.")

    # SECURITY FIX: Schedule the folder for deletion immediately after the response is sent
    background_tasks.add_task(cleanup_directory, UPLOAD_DIR / task_id)

    return FileResponse(
        path=zip_path,
        filename=f"Nexus_Categorized_CVs.zip",
        media_type="application/zip"
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)