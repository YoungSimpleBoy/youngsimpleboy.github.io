from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import threading
import time
import uuid
import webbrowser
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import uvicorn


ROOT_DIR = Path(__file__).resolve().parent
JOBS_DIR = ROOT_DIR / "jobs"
DEFAULT_OUTPUT_ROOT = ROOT_DIR / "output"
WEB_DIR = ROOT_DIR / "web"
MARKER_EXECUTABLE = shutil.which("marker_single")
PROCESSING_MODES = {"balanced", "text", "quality"}

JOBS_DIR.mkdir(parents=True, exist_ok=True)
DEFAULT_OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)


@dataclass
class JobState:
    job_id: str
    filename: str
    created_at: float
    status: str = "queued"
    output_root: str = ""
    output_folder: str | None = None
    output_format: str = "markdown"
    processing_mode: str = "balanced"
    page_range: str | None = None
    command: list[str] = field(default_factory=list)
    logs: list[str] = field(default_factory=list)
    error: str | None = None
    return_code: int | None = None
    result_files: list[str] = field(default_factory=list)
    archive_path: str | None = None
    process_id: int | None = None
    updated_at: float = field(default_factory=time.time)

    def add_log(self, message: str) -> None:
        clean = message.rstrip()
        if not clean:
            return
        self.logs.append(clean)
        if len(self.logs) > 400:
            self.logs = self.logs[-400:]
        self.updated_at = time.time()


jobs: dict[str, JobState] = {}
jobs_lock = threading.Lock()


app = FastAPI(title="Marker PDF Local UI")
app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def normalize_output_root(output_root: str | None) -> Path:
    if not output_root or not output_root.strip():
        return DEFAULT_OUTPUT_ROOT
    return Path(output_root).expanduser().resolve()


def job_to_dict(job: JobState) -> dict[str, Any]:
    return {
        "jobId": job.job_id,
        "filename": job.filename,
        "createdAt": job.created_at,
        "updatedAt": job.updated_at,
        "status": job.status,
        "outputRoot": job.output_root,
        "outputFolder": job.output_folder,
        "outputFormat": job.output_format,
        "processingMode": job.processing_mode,
        "pageRange": job.page_range,
        "command": job.command,
        "logs": job.logs[-120:],
        "error": job.error,
        "returnCode": job.return_code,
        "resultFiles": job.result_files,
        "archiveReady": bool(job.archive_path and Path(job.archive_path).exists()),
        "processId": job.process_id,
    }


def get_job(job_id: str) -> JobState:
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def build_command(
    input_path: Path,
    output_root: Path,
    output_format: str,
    processing_mode: str,
    page_range: str | None,
    force_ocr: bool,
    paginate_output: bool,
    disable_image_extraction: bool,
    disable_multiprocessing: bool,
    debug: bool,
) -> list[str]:
    if not MARKER_EXECUTABLE:
        raise RuntimeError("marker_single was not found in PATH")

    command = [
        MARKER_EXECUTABLE,
        str(input_path),
        "--output_dir",
        str(output_root),
        "--output_format",
        output_format,
    ]

    if processing_mode == "balanced":
        command.extend(
            [
                "--DocumentBuilder_lowres_image_dpi",
                "72",
                "--DocumentBuilder_highres_image_dpi",
                "144",
                "--OcrBuilder_ocr_task_name",
                "ocr_without_boxes",
            ]
        )
    elif processing_mode == "text":
        command.extend(
            [
                "--DocumentBuilder_lowres_image_dpi",
                "72",
            ]
        )
        if not force_ocr:
            command.append("--DocumentBuilder_disable_ocr")
    elif processing_mode != "quality":
        raise RuntimeError(f"Unsupported processing mode: {processing_mode}")

    if page_range:
        command.extend(["--page_range", page_range])
    if force_ocr:
        command.append("--force_ocr")
    if paginate_output:
        command.append("--paginate_output")
    if disable_image_extraction or processing_mode == "text":
        command.append("--disable_image_extraction")
    if disable_multiprocessing:
        command.append("--disable_multiprocessing")
    if debug:
        command.append("--debug")

    return command


def collect_result_files(output_folder: Path) -> list[str]:
    if not output_folder.exists():
        return []
    return [str(path.relative_to(output_folder)) for path in sorted(output_folder.rglob("*")) if path.is_file()]


def build_archive(job: JobState) -> str | None:
    if not job.output_folder:
        return None

    output_folder = Path(job.output_folder)
    if not output_folder.exists():
        return None

    archive_path = Path(job.output_root) / f"{output_folder.name}.zip"
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for item in output_folder.rglob("*"):
            if item.is_file():
                archive.write(item, arcname=str(item.relative_to(output_folder.parent)))

    job.archive_path = str(archive_path)
    job.updated_at = time.time()
    return str(archive_path)


def cleanup_job_dir(job_dir: Path, job: JobState) -> None:
    try:
        if job_dir.exists():
            shutil.rmtree(job_dir)
            job.add_log(f"[info] Removed temporary job folder: {job_dir}")
    except Exception as exc:
        job.add_log(f"[warn] Failed to remove temporary job folder: {exc}")


def run_job(
    job_id: str,
    job_dir: Path,
    input_path: Path,
    output_root: Path,
    output_format: str,
    processing_mode: str,
    page_range: str | None,
    force_ocr: bool,
    paginate_output: bool,
    disable_image_extraction: bool,
    disable_multiprocessing: bool,
    debug: bool,
) -> None:
    job = get_job(job_id)

    try:
        output_root.mkdir(parents=True, exist_ok=True)
        command = build_command(
            input_path=input_path,
            output_root=output_root,
            output_format=output_format,
            processing_mode=processing_mode,
            page_range=page_range,
            force_ocr=force_ocr,
            paginate_output=paginate_output,
            disable_image_extraction=disable_image_extraction,
            disable_multiprocessing=disable_multiprocessing,
            debug=debug,
        )
    except Exception as exc:
        job.status = "failed"
        job.error = str(exc)
        job.add_log(f"[error] {exc}")
        return

    try:
        job.status = "running"
        job.command = command
        job.output_root = str(output_root)
        job.output_format = output_format
        job.processing_mode = processing_mode
        job.page_range = page_range
        job.updated_at = time.time()
        job.add_log("[info] Starting marker conversion...")
        job.add_log(f"[info] Processing mode: {processing_mode}")
        job.add_log(f"[info] Output root: {output_root}")

        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        job.process_id = process.pid
        job.add_log(f"[info] PID: {process.pid}")

        assert process.stdout is not None
        for line in iter(process.stdout.readline, ""):
            if not line:
                break
            job.add_log(line)

        return_code = process.wait()
        job.return_code = return_code
        job.updated_at = time.time()

        expected_output_folder = output_root / input_path.stem
        job.output_folder = str(expected_output_folder)
        job.result_files = collect_result_files(expected_output_folder)

        if return_code == 0 and expected_output_folder.exists():
            build_archive(job)
            job.status = "completed"
            job.add_log("[info] Conversion finished.")
            return

        job.status = "failed"
        job.error = f"marker_single exited with code {return_code}"
        job.add_log(f"[error] marker_single exited with code {return_code}")
    except Exception as exc:
        job.status = "failed"
        job.error = str(exc)
        job.add_log(f"[error] {exc}")
    finally:
        cleanup_job_dir(job_dir, job)


@app.get("/")
def serve_index() -> FileResponse:
    index_path = WEB_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="Web UI was not found")
    return FileResponse(index_path)


@app.get("/styles.css")
def serve_styles() -> FileResponse:
    styles_path = WEB_DIR / "styles.css"
    if not styles_path.exists():
        raise HTTPException(status_code=404, detail="styles.css was not found")
    return FileResponse(styles_path, media_type="text/css")


@app.get("/app.js")
def serve_app_js() -> FileResponse:
    script_path = WEB_DIR / "app.js"
    if not script_path.exists():
        raise HTTPException(status_code=404, detail="app.js was not found")
    return FileResponse(script_path, media_type="application/javascript")


@app.get("/api/health")
def health() -> JSONResponse:
    return JSONResponse(
        {
            "ok": True,
            "markerExecutable": MARKER_EXECUTABLE,
            "defaultOutputRoot": str(DEFAULT_OUTPUT_ROOT),
            "python": sys.executable,
        }
    )


@app.post("/api/jobs")
async def create_job(
    file: UploadFile = File(...),
    output_dir: str = Form(default=""),
    output_format: str = Form(default="markdown"),
    processing_mode: str = Form(default="balanced"),
    page_range: str = Form(default=""),
    force_ocr: bool = Form(default=False),
    paginate_output: bool = Form(default=False),
    disable_image_extraction: bool = Form(default=False),
    disable_multiprocessing: bool = Form(default=True),
    debug: bool = Form(default=False),
) -> JSONResponse:
    if file.content_type not in {"application/pdf", "application/octet-stream"} and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    if output_format not in {"markdown", "html", "json"}:
        raise HTTPException(status_code=400, detail="Invalid output format")

    if processing_mode not in PROCESSING_MODES:
        raise HTTPException(status_code=400, detail="Invalid processing mode")

    job_id = uuid.uuid4().hex[:10]
    original_name = Path(file.filename).name
    job_dir = JOBS_DIR / job_id
    source_dir = job_dir / "source"
    source_dir.mkdir(parents=True, exist_ok=True)
    input_path = source_dir / original_name

    with input_path.open("wb") as handle:
        handle.write(await file.read())

    output_root = normalize_output_root(output_dir)

    job = JobState(
        job_id=job_id,
        filename=original_name,
        created_at=time.time(),
        output_root=str(output_root),
        output_format=output_format,
        processing_mode=processing_mode,
        page_range=page_range or None,
    )
    job.add_log(f"[info] Received file: {original_name}")

    with jobs_lock:
        jobs[job_id] = job

    worker = threading.Thread(
        target=run_job,
        kwargs={
            "job_id": job_id,
            "job_dir": job_dir,
            "input_path": input_path,
            "output_root": output_root,
            "output_format": output_format,
            "processing_mode": processing_mode,
            "page_range": page_range or None,
            "force_ocr": force_ocr,
            "paginate_output": paginate_output,
            "disable_image_extraction": disable_image_extraction,
            "disable_multiprocessing": disable_multiprocessing,
            "debug": debug,
        },
        daemon=True,
    )
    worker.start()

    return JSONResponse(job_to_dict(job))


@app.get("/api/jobs/{job_id}")
def get_job_status(job_id: str) -> JSONResponse:
    return JSONResponse(job_to_dict(get_job(job_id)))


@app.get("/api/jobs/{job_id}/download")
def download_result(job_id: str) -> FileResponse:
    job = get_job(job_id)
    archive_path = job.archive_path or build_archive(job)
    if not archive_path or not Path(archive_path).exists():
        raise HTTPException(status_code=404, detail="Archive is not available")
    return FileResponse(archive_path, filename=Path(archive_path).name)


@app.post("/api/jobs/{job_id}/open-output")
def open_output_folder(job_id: str) -> JSONResponse:
    job = get_job(job_id)
    if not job.output_folder or not Path(job.output_folder).exists():
        raise HTTPException(status_code=404, detail="Output folder is not available")

    if os.name == "nt":
        os.startfile(job.output_folder)
    else:
        raise HTTPException(status_code=400, detail="Open folder is only supported on Windows")

    return JSONResponse({"ok": True})


@app.get("/api/recent-jobs")
def list_recent_jobs() -> JSONResponse:
    with jobs_lock:
        ordered = sorted(jobs.values(), key=lambda item: item.created_at, reverse=True)
    return JSONResponse([job_to_dict(job) for job in ordered[:10]])


if __name__ == "__main__":
    if os.environ.get("MARKER_PDF_OPEN_BROWSER") == "1":
        threading.Timer(1.2, lambda: webbrowser.open("http://127.0.0.1:8765/")).start()
    uvicorn.run("server:app", host="127.0.0.1", port=8765, reload=False)