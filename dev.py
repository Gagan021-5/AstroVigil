#!/usr/bin/env python3
"""
AstroVigil — Dev launcher
Starts the FastAPI backend and (optionally) the Vite frontend in parallel.
Usage:
    python dev.py          # backend only (port 8000)
    python dev.py --full   # backend + frontend (ports 8000 + 5173)
"""
import subprocess
import sys
import os
import signal
import threading

ROOT = os.path.dirname(os.path.abspath(__file__))
FRONTEND = os.path.join(ROOT, "frontend")


def free_port(port: int):
    """Kill any process currently listening on *port* (Windows + Unix)."""
    if sys.platform == "win32":
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True, text=True
        )
        for line in result.stdout.splitlines():
            if f":{port} " in line and "LISTENING" in line:
                parts = line.strip().split()
                pid = parts[-1]
                if pid.isdigit() and int(pid) > 0:
                    subprocess.run(
                        ["taskkill", "/F", "/PID", pid],
                        capture_output=True
                    )
                    print(f"[dev] Freed port {port} (killed PID {pid})")
    else:
        # Unix: use lsof
        result = subprocess.run(
            ["lsof", "-ti", f":{port}"],
            capture_output=True, text=True
        )
        for pid in result.stdout.strip().splitlines():
            if pid.isdigit():
                os.kill(int(pid), signal.SIGKILL)
                print(f"[dev] Freed port {port} (killed PID {pid})")


def stream_output(proc, prefix):
    for line in iter(proc.stdout.readline, b""):
        print(f"[{prefix}] {line.decode(errors='replace').rstrip()}", flush=True)


def main():
    full = "--full" in sys.argv

    procs = []

    # ── Ensure port 8000 is free ─────────────────────────────────────────
    free_port(8000)
    import time; time.sleep(0.5)  # brief pause for OS to release the socket

    # ── Backend ──────────────────────────────────────────────────────────
    print("[dev] Starting FastAPI backend on http://localhost:8000 …")
    backend = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.main:app",
         "--host", "0.0.0.0", "--port", "8000"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    procs.append(backend)
    threading.Thread(target=stream_output, args=(backend, "API"), daemon=True).start()

    # ── Frontend (optional) ───────────────────────────────────────────────
    if full:
        print("[dev] Starting Vite dev server on http://localhost:5173 …")
        npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
        frontend = subprocess.Popen(
            [npm_cmd, "run", "dev"],
            cwd=FRONTEND,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        procs.append(frontend)
        threading.Thread(target=stream_output, args=(frontend, "UI"), daemon=True).start()

    print("[dev] Press Ctrl+C to stop all processes.\n")

    try:
        for p in procs:
            p.wait()
    except KeyboardInterrupt:
        print("\n[dev] Shutting down …")
        for p in procs:
            p.terminate()
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
        print("[dev] Done.")


if __name__ == "__main__":
    main()
