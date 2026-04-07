# Narrable: An accessibility platform for enhancing readability
Chrome text-to-speech extension focused on accessibility and improved readability.

## Features
- **Read selected text**: Highlight any text in Chrome and have Narrable read it aloud.
- **Read the whole page**: Trigger reading for the full page content when you do not have a selection.
- **Playback controls**: Play, pause, resume, replay, and adjust volume directly from the popup.
- **Sentence-based reading**: Text is split into sentences for smoother, more natural playback and progress tracking.
- **Language selection**: Choose from available voices/languages (using Chrome TTS) from the popup.
- **Context menu shortcut**: Optional context-menu entry to quickly send selected text to Narrable.
- **Options for tuning speech**: Configure rate, pitch, volume, keyboard shortcuts, and other playback options on the options page.

## Narrable Website (React + Tailwind)
This repository now also includes a web app for narrating uploaded files (`pdf`, `docx`, `txt`) with accessibility-first controls and AI assistance.

- Frontend: `web/` (Vite + React + Tailwind CSS)
- Backend: `server/` (Express + OpenAI API proxy endpoints)

### Web app features
- Upload and parse PDF, DOCX, and TXT documents.
- Play/pause/resume/stop narration using browser speech synthesis.
- Voice selection, rate and pitch controls, sentence progress slider.
- Accessibility settings: high-contrast mode, dyslexia-friendly font, font size and line-height adjustments.
- AI assistant panel for explain/summarize style prompts on the current sentence.

### Run locally
1. Start backend
   - `cd server`
   - Copy `.env.example` to `.env` and set `OPENAI_API_KEY`
   - `npm install`
   - `npm run dev`
2. Start frontend
   - `cd web`
   - `npm install`
   - `npm run dev`
3. Open the Vite URL shown in terminal (usually `http://localhost:5173`).
