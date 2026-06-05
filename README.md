# AIonOS x Smart Axiata — Multi-Sector Event Demo

This package extends the incumbent Airport Agent Demo into one narrated static web demo for:

1. Airport Ecosystem — incumbent 3-minute segment retained
2. Commercial Airlines — using Comm airline 1, 2 and 3
3. Cargo Airlines — using Cargo airline 4 and 5; Cargo airline 3 was not present in the uploaded files
4. Supply Chain — using Supply Chain 6 and 7
5. Manufacturing — using Mfg 8 and 9
6. BFSI — using BFSI 10, 11 and 12

## Deploy on GitHub Pages

Upload the contents of this folder to your GitHub repository root, commit, and enable GitHub Pages from the repository settings.

The demo is static. It uses local MP4 assets and browser speech synthesis for narration. Click **Start narrated demo** once the page loads.

## Local preview

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.


## Record a downloadable MP4 of the running webpage

The project includes a recorder that launches the static GitHub Pages-style webpage in Chromium, captures the live browser display with `ffmpeg`/`x11grab`, and muxes in the generated narration MP3. This is a screen recording of the webpage running, not a direct HTML-to-video render.

### Local recording

Install the Python dependencies and Playwright browser once:

```bash
pip install -r requirements.txt
python -m playwright install chromium
```

Then record the full demo:

```bash
npm run record
```

The downloadable MP4 is written to:

```text
dist/airport-agent-demo-webpage-recording.mp4
```

For a short pipeline check, run:

```bash
python3 scripts/render_mp4.py --duration 5 --output dist/smoke-webpage-recording.mp4 --skip-narration-generate
```

### GitHub Actions recording

Run the **Render recorded webpage MP4** workflow manually from the Actions tab. The workflow records the live page in Chromium and uploads `airport-agent-demo-webpage-recording-mp4` as a downloadable artifact. Use the optional `duration_seconds` input for a short test recording, or leave it blank for the full storyboard duration.

## Main files

- `index.html` — UI shell
- `script.js` — scene engine, narration, chapter navigation and telemetry animation
- `styles.css` — visual styling
- `data/scenes.json` — full 18-minute storyboard
- `data/chapters.json` — chapter metadata
- `assets/videos/` — all incumbent and new MP4 assets
- `assets/audio/narration-full-event-demo.txt` — complete narration script
