import shlex
import shutil
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "dist"
OUT = OUT_DIR / "airport-agent-demo-narrated.mp4"
AUDIO = ROOT / "assets" / "audio" / "airport-agent-narration.mp3"
TMP = ROOT / ".render_tmp"
RAW = TMP / "raw-capture.mp4"

WIDTH = 1280
HEIGHT = 720
FPS = 24
DURATION = 180
DISPLAY = ":99"
URL = "http://127.0.0.1:8000/index.html"


def run(cmd):
    print("+", " ".join(shlex.quote(str(c)) for c in cmd))
    subprocess.run(cmd, check=True)


def ensure_cmd(name: str, hint: str):
    if shutil.which(name) is None:
        raise SystemExit(f"{name} not found. {hint}")


def ensure_narration_audio():
    if AUDIO.exists():
        print(f"Using existing narration audio at {AUDIO}")
        return
    run([sys.executable, str(ROOT / "scripts" / "generate_narration.py")])
    if not AUDIO.exists():
        raise SystemExit("Narration audio was not generated. Aborting MP4 render to avoid silent output.")


def play_demo_once():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=["--autoplay-policy=no-user-gesture-required"])
        page = browser.new_page(viewport={"width": WIDTH, "height": HEIGHT})
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(1000)
        page.click("#playBtn")
        page.wait_for_timeout(DURATION * 1000)
        browser.close()


def main():
    ensure_cmd("ffmpeg", "Install ffmpeg first.")
    ensure_cmd("xvfb-run", "Install xvfb to render HTML in a headless display.")
    ensure_narration_audio()

    OUT_DIR.mkdir(exist_ok=True)
    if TMP.exists():
        shutil.rmtree(TMP)
    TMP.mkdir(parents=True)

    http_proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", "8000"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    try:
        ffmpeg_cmd = [
            "xvfb-run", "-a", "-s", f"-screen 0 {WIDTH}x{HEIGHT}x24", "ffmpeg", "-y",
            "-video_size", f"{WIDTH}x{HEIGHT}", "-framerate", str(FPS), "-f", "x11grab", "-i", f"{DISPLAY}.0",
            "-t", str(DURATION), "-pix_fmt", "yuv420p", str(RAW)
        ]
        # Start ffmpeg capture first so it records from the first frame of UI playback.
        ffmpeg_proc = subprocess.Popen(ffmpeg_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
        run(["xvfb-run", "-a", "-s", f"-screen 0 {WIDTH}x{HEIGHT}x24", sys.executable, "-c", (
            "from scripts.render_mp4 import play_demo_once; play_demo_once()"
        )])
        ffmpeg_proc.wait(timeout=DURATION + 30)
        if ffmpeg_proc.returncode != 0:
            raise SystemExit("ffmpeg capture failed")
    finally:
        http_proc.kill()

    run(["ffmpeg", "-y", "-i", str(RAW), "-i", str(AUDIO), "-c:v", "copy", "-c:a", "aac", "-shortest", str(OUT)])
    print(f"Rendered {OUT}")


if __name__ == "__main__":
    main()
