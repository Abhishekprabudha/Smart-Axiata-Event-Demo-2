#!/usr/bin/env python3
"""Diagnostics for live webpage MP4 recording (local + GitHub Actions)."""
from __future__ import annotations

import importlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RENDER_WF = ROOT / ".github" / "workflows" / "render-narrated-mp4.yml"


def check(label: str, ok: bool, detail: str = "") -> bool:
    mark = "PASS" if ok else "FAIL"
    suffix = f" - {detail}" if detail else ""
    print(f"[{mark}] {label}{suffix}")
    return ok


def main() -> int:
    local_ready = True
    github_ready = True

    req = ROOT / "requirements.txt"
    deploy_wf = ROOT / ".github" / "workflows" / "deploy-pages.yml"
    scenes_path = ROOT / "data" / "scenes.json"

    common_ok = True
    common_ok &= check("requirements.txt exists", req.exists())
    common_ok &= check(f"workflow exists: {RENDER_WF.relative_to(ROOT)}", RENDER_WF.exists())
    common_ok &= check(f"workflow exists: {deploy_wf.relative_to(ROOT)}", deploy_wf.exists())

    try:
        scenes = json.loads(scenes_path.read_text(encoding="utf-8"))
        common_ok &= check("scenes.json is valid JSON", True)
    except Exception as exc:  # noqa: BLE001
        check("scenes.json is valid JSON", False, str(exc))
        return 1

    videos_root = ROOT / "assets" / "videos"
    missing = []
    bad_timing = []
    for i, scene in enumerate(scenes):
        video = videos_root / scene.get("video", "")
        if not video.exists():
            missing.append(video)
        try:
            if float(scene["end"]) <= float(scene["start"]):
                bad_timing.append((i, scene.get("id")))
        except Exception:  # noqa: BLE001
            bad_timing.append((i, scene.get("id")))

    common_ok &= check("all scene video files exist", len(missing) == 0, f"missing={len(missing)}")
    common_ok &= check("all scene timings are increasing", len(bad_timing) == 0, f"invalid={len(bad_timing)}")

    # Local checks
    try:
        importlib.import_module("edge_tts")
        local_ready &= check("local python dependency edge_tts import", True)
    except Exception as exc:  # noqa: BLE001
        local_ready &= check("local python dependency edge_tts import", False, str(exc))

    ffmpeg = shutil.which("ffmpeg")
    local_ready &= check("local ffmpeg available on PATH", ffmpeg is not None, ffmpeg or "not found")

    xvfb = shutil.which("Xvfb")
    local_ready &= check("local Xvfb available on PATH", xvfb is not None, xvfb or "not found")

    try:
        importlib.import_module("playwright")
        local_ready &= check("local python dependency playwright import", True)
    except Exception as exc:  # noqa: BLE001
        local_ready &= check("local python dependency playwright import", False, str(exc))

    fonts_ok = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf").exists()
    local_ready &= check("local render font available", fonts_ok)

    # GitHub workflow checks
    if RENDER_WF.exists():
        wf_text = RENDER_WF.read_text(encoding="utf-8")
        github_ready &= check("workflow installs ffmpeg", "apt-get install -y ffmpeg" in wf_text)
        github_ready &= check("workflow installs DejaVu fonts", "fonts-dejavu-core" in wf_text)
        github_ready &= check("workflow installs xvfb", "xvfb" in wf_text)
        github_ready &= check("workflow installs Python requirements", "pip install -r requirements.txt" in wf_text)
        github_ready &= check("workflow installs Playwright Chromium", "playwright install chromium" in wf_text)
        github_ready &= check("workflow records live webpage", "python3 scripts/render_mp4.py" in wf_text)

    local_ready &= common_ok
    github_ready &= common_ok

    print("\nOverall:")
    print("- Local render readiness:", "READY" if local_ready else "NOT READY")
    print("- GitHub Actions render readiness:", "READY" if github_ready else "NOT READY")

    if not local_ready and github_ready:
        print("\nNote: Local blockers do not block GitHub Actions render.")

    if github_ready:
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
