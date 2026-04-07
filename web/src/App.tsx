import { useEffect, useMemo, useRef, useState } from "react";
import mammoth from "mammoth";
import axios from "axios";
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

type Settings = {
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  highContrast: boolean;
};

const defaultSettings: Settings = {
  fontSize: 19,
  lineHeight: 1.8,
  fontFamily: "system-ui, sans-serif",
  highContrast: false,
};

const fontOptions = [
  { label: "System Sans", value: "system-ui, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Verdana", value: "Verdana, Arial, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
];

const aiModels = [
  { label: "GPT-OSS 20B (Free)", value: "openai/gpt-oss-20b:free" },
  { label: "DeepSeek (Free)", value: "deepseek/deepseek-r1:free" },
];

const narrationLanguages = [
  { label: "English (US)", value: "en-US" },
  { label: "English (UK)", value: "en-GB" },
  { label: "Hindi", value: "hi-IN" },
  { label: "Spanish", value: "es-ES" },
  { label: "French", value: "fr-FR" },
  { label: "German", value: "de-DE" },
  { label: "Japanese", value: "ja-JP" },
];

function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.?!])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function readFileText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "txt") return await file.text();
  if (ext === "docx") {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }
  if (ext === "pdf") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
    let text = "";
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: any) => item.str).join(" ");
      text += `${pageText}\n\n`;
    }
    return text;
  }
  throw new Error("Unsupported file type. Please use PDF, DOCX, or TXT.");
}

export default function App() {
  const [rawText, setRawText] = useState("");
  const [status, setStatus] = useState("Upload a PDF, DOCX, or TXT file to begin.");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState("");
  const [narrationLang, setNarrationLang] = useState("en-US");
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem("narrable-web-settings");
    return saved ? JSON.parse(saved) : defaultSettings;
  });
  const [aiPrompt, setAiPrompt] = useState("Explain this section simply.");
  const [aiResponse, setAiResponse] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiModel, setAiModel] = useState("openai/gpt-oss-20b:free");
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("narrable-web-theme");
    if (saved) return saved === "dark";
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const activeUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  const liveRegionRef = useRef<HTMLParagraphElement>(null);

  const sentences = useMemo(() => splitSentences(rawText), [rawText]);
  const activeSentence = sentences[currentIndex] ?? "";
  const languageVoices = useMemo(
    () => voices.filter((voice) => voice.lang?.toLowerCase().startsWith(narrationLang.split("-")[0].toLowerCase())),
    [voices, narrationLang],
  );

  useEffect(() => {
    localStorage.setItem("narrable-web-settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem("narrable-web-theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  useEffect(() => {
    document.body.classList.toggle("theme-dark", isDarkMode);
    document.body.classList.toggle("theme-contrast", settings.highContrast);
    return () => {
      document.body.classList.remove("theme-dark");
      document.body.classList.remove("theme-contrast");
    };
  }, [isDarkMode, settings.highContrast]);

  useEffect(() => {
    const loadVoices = () => {
      const list = speechSynthesis.getVoices();
      setVoices(list);
      if (!voiceName && list[0]) setVoiceName(list[0].name);
    };
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      speechSynthesis.cancel();
      speechSynthesis.onvoiceschanged = null;
    };
  }, [voiceName]);

  useEffect(() => {
    const bestVoice = languageVoices[0] || voices[0];
    if (bestVoice && bestVoice.name !== voiceName) {
      setVoiceName(bestVoice.name);
    }
  }, [languageVoices, voices, voiceName]);

  const announce = (message: string) => {
    setStatus(message);
    if (liveRegionRef.current) liveRegionRef.current.textContent = message;
  };

  const speakFrom = (index: number) => {
    if (!sentences.length || index >= sentences.length) return;
    const utterance = new SpeechSynthesisUtterance(sentences[index]);
    const selected = voices.find((v) => v.name === voiceName);
    if (selected) utterance.voice = selected;
    utterance.lang = narrationLang;
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsPaused(false);
      announce(`Reading sentence ${index + 1} of ${sentences.length}.`);
    };
    utterance.onend = () => {
      if (index < sentences.length - 1) {
        setCurrentIndex(index + 1);
        speakFrom(index + 1);
      } else {
        setIsSpeaking(false);
        announce("Narration completed.");
      }
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      announce("Narration error occurred.");
    };
    activeUtterance.current = utterance;
    speechSynthesis.speak(utterance);
  };

  const startNarration = () => {
    speechSynthesis.cancel();
    speakFrom(currentIndex);
  };

  const onUpload = async (file?: File) => {
    if (!file) return;
    setAiResponse("");
    setCurrentIndex(0);
    announce("Parsing file...");
    try {
      const text = await readFileText(file);
      setRawText(text);
      announce(`Loaded ${file.name}.`);
    } catch (error: any) {
      announce(error.message || "Failed to parse file.");
    }
  };

  const stop = () => {
    speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
    announce("Narration stopped.");
  };

  const pauseResume = () => {
    if (!isSpeaking) return;
    if (isPaused) {
      speechSynthesis.resume();
      setIsPaused(false);
      announce("Narration resumed.");
    } else {
      speechSynthesis.pause();
      setIsPaused(true);
      announce("Narration paused.");
    }
  };

  const askAI = async () => {
    if (!activeSentence) return;
    setAiBusy(true);
    try {
      const response = await axios.post("http://localhost:5050/api/ai/assist", {
        prompt: aiPrompt,
        text: activeSentence,
        model: aiModel,
      });
      setAiResponse(response.data?.output || "No response.");
    } catch (error: any) {
      const details = error?.response?.data?.details || error?.response?.data?.error;
      setAiResponse(details || "AI request failed. Verify server, API key, or selected model availability.");
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <main className={`app${isDarkMode ? " app-dark" : ""}${settings.highContrast ? " app-contrast" : ""}`}>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">Narrable</div>
          <nav aria-label="Primary">
            <a href="#features">Features</a>
            <a href="#workspace">Reader Workspace</a>
          </nav>
          <button className="btn theme-toggle" type="button" onClick={() => setIsDarkMode((prev) => !prev)} aria-label="Toggle dark mode">
            {isDarkMode ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </header>

      <section className="landing card">
        <div className="hero-copy">
          <p className="eyebrow">Accessibility-first narration</p>
          <h1>Narrable Web Reader</h1>
          <p className="hero-text">A modern reading platform for PDF, DOCX, and TXT files with natural narration, personalized readability controls, and AI assistance.</p>
        </div>
        <div className="feature-strip" id="features">
          <article className="feature-item">
            <h3>Smart File Parsing</h3>
            <p>Upload documents from multiple formats and convert them into a narration-ready reading flow.</p>
          </article>
          <article className="feature-item">
            <h3>Accessible Listening</h3>
            <p>Use keyboard-friendly controls, sentence progress, high contrast, and dyslexia-friendly typography.</p>
          </article>
          <article className="feature-item">
            <h3>AI Reading Support</h3>
            <p>Get simplified explanations, summaries, and guided understanding of the active text section.</p>
          </article>
        </div>
      </section>

      <section className="workspace" id="workspace">
        <header className="card workspace-header">
          <h2>Start Narrating</h2>
          <label className="upload" htmlFor="file-upload">
            <span className="upload-title">Choose PDF, DOCX, or TXT</span>
            <span className="upload-subtitle">Click to upload and start narration</span>
            <input
              id="file-upload"
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={(e) => onUpload(e.target.files?.[0])}
              aria-label="Upload a document file"
            />
          </label>
          <p ref={liveRegionRef} className="sr-only" aria-live="polite" />
          <p className="status">{status}</p>
        </header>

        <section className="grid">
        <article className="card">
          <h2>Playback Controls</h2>
          <div className="controls">
            <button className="btn btn-primary" onClick={startNarration} disabled={!sentences.length}>Play</button>
            <button className="btn" onClick={pauseResume} disabled={!isSpeaking}>{isPaused ? "Resume" : "Pause"}</button>
            <button className="btn btn-danger" onClick={stop}>Stop</button>
          </div>
          <label htmlFor="language-select">Language</label>
          <select id="language-select" value={narrationLang} onChange={(e) => setNarrationLang(e.target.value)}>
            {narrationLanguages.map((language) => (
              <option key={language.value} value={language.value}>{language.label}</option>
            ))}
          </select>
          <label htmlFor="voice-select">Voice
            <select id="voice-select" value={voiceName} onChange={(e) => setVoiceName(e.target.value)}>
              {(languageVoices.length ? languageVoices : voices).map((voice) => (
                <option key={voice.name} value={voice.name}>{voice.name} ({voice.lang})</option>
              ))}
            </select>
          </label>
          <label htmlFor="rate-range">Rate <span className="value">{rate.toFixed(1)}x</span>
            <input id="rate-range" type="range" min="0.6" max="2" step="0.1" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
          </label>
          <label htmlFor="pitch-range">Pitch <span className="value">{pitch.toFixed(1)}</span>
            <input id="pitch-range" type="range" min="0.5" max="2" step="0.1" value={pitch} onChange={(e) => setPitch(Number(e.target.value))} />
          </label>
          <label htmlFor="sentence-range">Sentence <span className="value">{sentences.length ? `${currentIndex + 1}/${sentences.length}` : "0/0"}</span>
            <input id="sentence-range" type="range" min="0" max={Math.max(sentences.length - 1, 0)} value={currentIndex} onChange={(e) => setCurrentIndex(Number(e.target.value))} />
          </label>
        </article>

        <article className="card">
          <h2>Reading Preferences</h2>
          <label htmlFor="font-size-range">Font size <span className="value">{settings.fontSize}px</span>
            <input id="font-size-range" type="range" min="14" max="30" value={settings.fontSize} onChange={(e) => setSettings((s) => ({ ...s, fontSize: Number(e.target.value) }))} />
          </label>
          <label htmlFor="line-height-range">Line height <span className="value">{settings.lineHeight.toFixed(1)}</span>
            <input id="line-height-range" type="range" min="1.2" max="2.3" step="0.1" value={settings.lineHeight} onChange={(e) => setSettings((s) => ({ ...s, lineHeight: Number(e.target.value) }))} />
          </label>
          <label htmlFor="font-family-select">Preview font</label>
          <select
            id="font-family-select"
            value={settings.fontFamily}
            onChange={(e) => setSettings((s) => ({ ...s, fontFamily: e.target.value }))}
          >
            {fontOptions.map((font) => (
              <option key={font.label} value={font.value}>{font.label}</option>
            ))}
          </select>
          <label className="toggle"><input type="checkbox" checked={settings.highContrast} onChange={(e) => setSettings((s) => ({ ...s, highContrast: e.target.checked }))} /> High contrast mode</label>
        </article>

        <article className="card ai-card">
          <h2>AI Assistant</h2>
          <label htmlFor="ai-model">Model</label>
          <select id="ai-model" value={aiModel} onChange={(e) => setAiModel(e.target.value)}>
            {aiModels.map((model) => (
              <option key={model.value} value={model.value}>{model.label}</option>
            ))}
          </select>
          <label htmlFor="ai-prompt">Prompt</label>
          <textarea id="ai-prompt" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={4} />
          <button className="btn btn-primary ai-ask-btn" onClick={askAI} disabled={aiBusy || !activeSentence}>{aiBusy ? "Thinking..." : "Ask AI about current sentence"}</button>
          <p className="ai-response">{aiResponse || "AI responses will appear here."}</p>
        </article>
        </section>

        <section className="card reading" style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight, fontFamily: settings.fontFamily }}>
          <h2>Document Preview</h2>
          {sentences.length ? (
            <p>{sentences.map((sentence, i) => (<span key={`${sentence}-${i}`} className={i === currentIndex ? "active-sentence" : ""}>{sentence} </span>))}</p>
          ) : (
            <p>No content yet.</p>
          )}
        </section>
      </section>
    </main>
  );
}
