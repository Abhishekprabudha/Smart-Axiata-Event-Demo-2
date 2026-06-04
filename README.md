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

## Main files

- `index.html` — UI shell
- `script.js` — scene engine, narration, chapter navigation and telemetry animation
- `styles.css` — visual styling
- `data/scenes.json` — full 18-minute storyboard
- `data/chapters.json` — chapter metadata
- `assets/videos/` — all incumbent and new MP4 assets
- `assets/audio/narration-full-event-demo.txt` — complete narration script
