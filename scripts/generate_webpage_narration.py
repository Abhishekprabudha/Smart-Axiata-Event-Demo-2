import asyncio
import json
import shutil
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parents[1]
SCENES_PATH = ROOT / "data" / "scenes.json"
OUT_TEXT_PATH = ROOT / "assets" / "audio" / "narration-webpage.txt"
OUT_MP3_PATH = ROOT / "assets" / "audio" / "airport-agent-narration.mp3"
VOICE = "en-HK-SamNeural"
RATE = "-2%"
MAX_ATTEMPTS = 3


def build_webpage_narration() -> str:
    scenes = json.loads(SCENES_PATH.read_text(encoding="utf-8"))
    lines: list[str] = []
    for scene in scenes:
        headline = scene.get("headline", "").strip()
        caption = scene.get("caption", "").strip()
        combined = ". ".join(part for part in (headline, caption) if part)
        if combined:
            lines.append(combined)
    return "\n\n".join(lines)


async def synthesize(text: str) -> None:
    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            communicate = edge_tts.Communicate(text, VOICE, rate=RATE)
            await communicate.save(str(OUT_MP3_PATH))
            if not OUT_MP3_PATH.exists() or OUT_MP3_PATH.stat().st_size == 0:
                raise RuntimeError("edge_tts completed without producing a non-empty MP3 file")
            return
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            print(f"Attempt {attempt}/{MAX_ATTEMPTS} failed: {exc}")
            if attempt < MAX_ATTEMPTS:
                await asyncio.sleep(attempt)
    raise RuntimeError("Unable to generate webpage narration with edge_tts") from last_error


async def main() -> None:
    narration_text = build_webpage_narration()
    OUT_TEXT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_TEXT_PATH.write_text(narration_text + "\n", encoding="utf-8")

    backup_path = OUT_MP3_PATH.with_suffix(OUT_MP3_PATH.suffix + '.bak')
    had_existing_mp3 = OUT_MP3_PATH.exists() and OUT_MP3_PATH.stat().st_size > 0
    if had_existing_mp3:
        shutil.copy2(OUT_MP3_PATH, backup_path)

    try:
        await synthesize(narration_text)
        if backup_path.exists():
            backup_path.unlink()
        print(f"Webpage narration text written to {OUT_TEXT_PATH}")
        print(f"Webpage narration MP3 written to {OUT_MP3_PATH} using voice {VOICE}")
    except Exception as exc:  # noqa: BLE001
        # Restore the previously generated MP3 on transient network/TTS failures.
        if backup_path.exists():
            shutil.move(str(backup_path), str(OUT_MP3_PATH))
        elif OUT_MP3_PATH.exists():
            OUT_MP3_PATH.unlink()
        raise RuntimeError("Webpage narration generation failed.") from exc


if __name__ == "__main__":
    asyncio.run(main())
