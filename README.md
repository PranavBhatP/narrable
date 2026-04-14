# Narrable

Narrable is an accessibility-focused reading platform with:
- a **Chrome extension** for reading webpage selections or main page content aloud
- a **web reader** for uploaded documents with AI-assisted comprehension tools

## Repository structure
- `manifest.json`, `js/`, `popup.html`, `options.html`: Chrome extension
- `web/`: Vite + React + TypeScript + Tailwind web app
- `server/`: Express backend proxy for AI assistance

## Chrome extension features
- Read selected text or fallback to cleaned main-page content
- Play/pause/resume/replay/stop controls in popup
- Language switching from popup (`en-IN`, `hi-IN`)
- Inline on-page playback bar with live progress
- Context-menu shortcut: **Read selection with TTS Reader**
- Options page for voice, rate, pitch, volume, testing, and keyboard shortcuts

## Web reader features
- Upload and parse **PDF, DOCX, TXT**
- Sentence-based narration with play/pause/resume/stop
- Language + voice selection, rate/pitch tuning, sentence slider
- Active-sentence highlighting in document preview
- Accessibility controls:
  - dark/light mode
  - high contrast mode
  - font family, font size, and line-height adjustments
  - floating magnifier with zoom
- Optional voice commands (play, pause, resume, stop) using browser speech recognition
- AI assistant for the current sentence with selectable model and custom prompt

## Run locally

### 1) Start backend (`server/`)
```bash
cd server
cp .env.example .env
# set OPENROUTER_API_KEY in .env
npm install
npm run dev
```

The server runs on `http://localhost:5050` by default and exposes:
- `GET /health`
- `POST /api/ai/assist`

### 2) Start frontend (`web/`)
```bash
cd web
npm install
npm run dev
```

Open the Vite URL shown in terminal (usually `http://localhost:5173`).

## Load Chrome extension locally
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this repository root folder
