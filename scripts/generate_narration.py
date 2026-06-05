import asyncio
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parents[1]
TEXT_PATH = ROOT / "assets" / "audio" / "narration.txt"
OUT_PATH = ROOT / "assets" / "audio" / "airport-agent-narration.mp3"
VOICE = "en-HK-SamNeural"
RATE = "-2%"
MAX_ATTEMPTS = 3


async def synthesize(text: str) -> None:
    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            communicate = edge_tts.Communicate(text, VOICE, rate=RATE)
            await communicate.save(str(OUT_PATH))
            if not OUT_PATH.exists() or OUT_PATH.stat().st_size == 0:
                raise RuntimeError("edge_tts completed without producing a non-empty MP3 file")
            return
        except Exception as exc:  # noqa: BLE001 - network / provider failures should not fail render
            last_error = exc
            print(f"Attempt {attempt}/{MAX_ATTEMPTS} failed: {exc}")
            if attempt < MAX_ATTEMPTS:
                await asyncio.sleep(attempt)
    raise RuntimeError("Unable to generate narration with edge_tts") from last_error


async def main() -> None:
    text = TEXT_PATH.read_text(encoding="utf-8")
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    try:
        await synthesize(text)
        print(f"Narration written to {OUT_PATH} using voice {VOICE}")
    except Exception as exc:  # noqa: BLE001 - fail fast so CI reports generation problems clearly
        if OUT_PATH.exists():
            OUT_PATH.unlink()
        raise RuntimeError("Narration generation failed.") from exc


if __name__ == "__main__":
    asyncio.run(main())
