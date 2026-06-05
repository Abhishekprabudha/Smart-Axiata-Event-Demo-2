#!/usr/bin/env python3
"""Record the running webpage demo to a downloadable MP4 file.

This script serves the static app, opens it in Chromium on an Xvfb display,
records that display with ffmpeg/x11grab, and muxes in the generated narration
MP3. It intentionally captures the real browser UI instead of rendering frames
from HTML directly.
"""
from __future__ import annotations

import argparse
import contextlib
import json
import os
import shlex
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Iterable

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "dist"
DEFAULT_OUT = OUT_DIR / "airport-agent-demo-webpage-recording.mp4"
LEGACY_OUT = OUT_DIR / "airport-agent-demo-narrated.mp4"
AUDIO = ROOT / "assets" / "audio" / "airport-agent-narration.mp3"
NARRATION_TEXT = ROOT / "assets" / "audio" / "narration-webpage.txt"
NARRATION_GENERATOR = ROOT / "scripts" / "generate_webpage_narration.py"
SCENES = ROOT / "data" / "scenes.json"
TMP = ROOT / ".render_tmp"
RAW = TMP / "raw-webpage-capture.mp4"

WIDTH = 1280
HEIGHT = 720
FPS = 24
DISPLAY = ":99"
DEFAULT_PORT = 8000


def log_cmd(cmd: Iterable[object]) -> None:
    print("+", " ".join(shlex.quote(str(c)) for c in cmd), flush=True)


def run(cmd: list[object], **kwargs) -> subprocess.CompletedProcess:
    log_cmd(cmd)
    return subprocess.run([str(c) for c in cmd], check=True, **kwargs)


def ensure_cmd(name: str, hint: str) -> None:
    if shutil.which(name) is None:
        raise SystemExit(f"{name} not found. {hint}")


def find_free_port(preferred: int) -> int:
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("127.0.0.1", preferred))
            return preferred
        except OSError:
            sock.bind(("127.0.0.1", 0))
            return int(sock.getsockname()[1])


def scene_duration() -> int:
    scenes = json.loads(SCENES.read_text(encoding="utf-8"))
    return int(max(float(scene["end"]) for scene in scenes))


def ensure_narration_audio(skip_generate: bool = False) -> None:
    if skip_generate:
        if not AUDIO.exists():
            raise SystemExit(f"Narration audio not found at {AUDIO}")
        print(f"Using existing narration audio at {AUDIO}")
        return

    sources = [SCENES, NARRATION_GENERATOR]
    if NARRATION_TEXT.exists():
        sources.append(NARRATION_TEXT)
    audio_is_current = AUDIO.exists() and all(AUDIO.stat().st_mtime >= source.stat().st_mtime for source in sources)
    if audio_is_current:
        print(f"Using existing narration audio at {AUDIO}")
        return

    run([sys.executable, str(NARRATION_GENERATOR)])
    if not AUDIO.exists() or AUDIO.stat().st_size == 0:
        raise SystemExit("Narration audio was not generated. Aborting MP4 recording to avoid silent output.")


def start_process(cmd: list[object], **kwargs) -> subprocess.Popen:
    log_cmd(cmd)
    return subprocess.Popen([str(c) for c in cmd], **kwargs)


def stop_process(proc: subprocess.Popen | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)


def wait_for_server(port: int, timeout: float = 10.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
            sock.settimeout(0.3)
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                return
        time.sleep(0.2)
    raise SystemExit(f"Local web server did not start on port {port}")


def play_demo_once(url: str, duration: int, width: int, height: int) -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,
            args=[
                "--autoplay-policy=no-user-gesture-required",
                "--disable-dev-shm-usage",
                "--no-sandbox",
                f"--window-size={width},{height}",
            ],
        )
        page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
        page.goto(url, wait_until="networkidle")
        page.wait_for_timeout(1000)
        # The MP3 is muxed in after capture, so disable in-browser speech synthesis
        # to keep the recorded output synchronized and free from duplicate speech.
        page.click("#muteBtn")
        page.click("#playBtn")
        page.wait_for_timeout(duration * 1000)
        browser.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Record the live webpage demo to MP4")
    parser.add_argument("--duration", type=int, default=None, help="Seconds to record; defaults to the full scene duration")
    parser.add_argument("--width", type=int, default=WIDTH)
    parser.add_argument("--height", type=int, default=HEIGHT)
    parser.add_argument("--fps", type=int, default=FPS)
    parser.add_argument("--display", default=DISPLAY)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--skip-narration-generate", action="store_true", help="Use the existing MP3 without regenerating it")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    duration = args.duration or scene_duration()
    output = args.output if args.output.is_absolute() else ROOT / args.output

    ensure_cmd("ffmpeg", "Install ffmpeg first.")
    ensure_cmd("Xvfb", "Install xvfb first.")
    ensure_narration_audio(skip_generate=args.skip_narration_generate)

    output.parent.mkdir(parents=True, exist_ok=True)
    if TMP.exists():
        shutil.rmtree(TMP)
    TMP.mkdir(parents=True)

    port = find_free_port(args.port)
    url = f"http://127.0.0.1:{port}/index.html"
    env = os.environ.copy()
    env["DISPLAY"] = args.display

    xvfb_proc = http_proc = ffmpeg_proc = None
    try:
        xvfb_proc = start_process(
            ["Xvfb", args.display, "-screen", "0", f"{args.width}x{args.height}x24", "-ac"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        time.sleep(1)
        if xvfb_proc.poll() is not None:
            raise SystemExit("Xvfb failed to start")

        http_proc = start_process(
            [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        wait_for_server(port)

        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-video_size", f"{args.width}x{args.height}",
            "-framerate", str(args.fps),
            "-f", "x11grab", "-i", f"{args.display}.0",
            "-t", str(duration),
            "-an", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
            str(RAW),
        ]
        ffmpeg_proc = start_process(ffmpeg_cmd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
        play_demo_once(url, duration, args.width, args.height)
        ffmpeg_proc.wait(timeout=duration + 60)
        if ffmpeg_proc.returncode != 0:
            raise SystemExit("ffmpeg capture failed")
    finally:
        stop_process(ffmpeg_proc)
        stop_process(http_proc)
        stop_process(xvfb_proc)

    mux_cmd = [
        "ffmpeg", "-y", "-i", str(RAW), "-i", str(AUDIO),
        "-c:v", "copy", "-c:a", "aac", "-shortest", str(output),
    ]
    run(mux_cmd)

    # Keep the previous filename available for existing workflows/bookmarks while
    # making the new webpage-recording filename the primary output.
    if output != LEGACY_OUT:
        shutil.copy2(output, LEGACY_OUT)
        print(f"Copied compatibility MP4 to {LEGACY_OUT}")
    print(f"Recorded live webpage MP4 at {output}")


if __name__ == "__main__":
    main()
