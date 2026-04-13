import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import mammoth from "mammoth";
import axios from "axios";
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

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
  { label: "Gemma 4", value: "google/gemma-4-26b-a4b-it:free" },
  { label: "DeepSeek", value: "deepseek/deepseek-r1:free" },
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

function includesAnyCommand(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
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
  const magnifierSize = 180;
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
  const [magnifierEnabled, setMagnifierEnabled] = useState(true);
  const [magnifierZoom, setMagnifierZoom] = useState(2);
  const [voiceCommandsEnabled, setVoiceCommandsEnabled] = useState(false);
  const [voiceCommandStatus, setVoiceCommandStatus] = useState("Voice commands are off.");
  const [magnifierState, setMagnifierState] = useState({
    visible: false,
    x: 0,
    y: 0,
    contentX: 0,
    contentY: 0,
    width: 0,
    contentWidth: 0,
  });
  const activeUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const isPausedRef = useRef(false);
  const sentencesCountRef = useRef(0);
  const startNarrationRef = useRef<() => void>(() => {});
  const pauseNarrationRef = useRef<() => void>(() => {});
  const resumeNarrationRef = useRef<() => void>(() => {});
  const stopRef = useRef<() => void>(() => {});
  const liveRegionRef = useRef<HTMLParagraphElement>(null);
  const readingRef = useRef<HTMLElement | null>(null);
  const previewTextRef = useRef<HTMLParagraphElement | null>(null);
  const isVoiceRecognitionSupported = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const sentences = useMemo(() => splitSentences(rawText), [rawText]);
  const activeSentence = sentences[currentIndex] ?? "";
  const languageVoices = useMemo(
    () => voices.filter((voice) => voice.lang?.toLowerCase().startsWith(narrationLang.split("-")[0].toLowerCase())),
    [voices, narrationLang],
  );

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
    isPausedRef.current = isPaused;
    sentencesCountRef.current = sentences.length;
  }, [isSpeaking, isPaused, sentences.length]);

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

  const pauseNarration = () => {
    if (!isSpeakingRef.current || isPausedRef.current) return;
    speechSynthesis.pause();
    setIsPaused(true);
    announce("Narration paused.");
  };

  const resumeNarration = () => {
    if (!isSpeakingRef.current || !isPausedRef.current) return;
    speechSynthesis.resume();
    setIsPaused(false);
    announce("Narration resumed.");
  };

  useEffect(() => {
    startNarrationRef.current = startNarration;
    pauseNarrationRef.current = pauseNarration;
    resumeNarrationRef.current = resumeNarration;
    stopRef.current = stop;
  }, [startNarration, pauseNarration, resumeNarration, stop]);

  const runVoiceCommand = (transcript: string) => {
    const command = transcript.toLowerCase().trim().replace(/[^\w\s]/g, " ");
    if (!command) return;
    setVoiceCommandStatus(`Heard: "${transcript}"`);
    const playWords = ["play", "start", "read", "begin", "go", "continue", "continue reading"];
    const pauseWords = ["pause", "hold", "wait", "stop reading", "take a break", "freeze", "pose", "paws"];
    const resumeWords = ["resume", "continue", "go on", "carry on", "unpause"];
    const stopWords = ["stop", "end", "finish", "quit", "terminate", "cancel", "shut down"];

    if (includesAnyCommand(command, playWords)) {
      if (!sentencesCountRef.current) {
        announce("No document loaded yet.");
        setVoiceCommandStatus(`Heard "${transcript}", but no document is loaded.`);
        return;
      }
      startNarrationRef.current();
      setVoiceCommandStatus(`Heard "${transcript}". Starting narration.`);
      return;
    }
    if (includesAnyCommand(command, resumeWords)) {
      if (isSpeakingRef.current && isPausedRef.current) {
        resumeNarrationRef.current();
        setVoiceCommandStatus(`Heard "${transcript}". Resuming.`);
      } else {
        setVoiceCommandStatus(`Heard "${transcript}", but narration is not paused.`);
      }
      return;
    }
    if (includesAnyCommand(command, pauseWords)) {
      if (isSpeakingRef.current && !isPausedRef.current) {
        pauseNarrationRef.current();
        setVoiceCommandStatus(`Heard "${transcript}". Pausing.`);
      } else {
        setVoiceCommandStatus(`Heard "${transcript}", but narration is not currently playing.`);
      }
      return;
    }
    if (includesAnyCommand(command, stopWords)) {
      stopRef.current();
      setVoiceCommandStatus(`Heard "${transcript}". Stopping narration.`);
      return;
    }
    setVoiceCommandStatus(`Heard "${transcript}", but command was not recognized.`);
  };

  useEffect(() => {
    if (!isVoiceRecognitionSupported) {
      setVoiceCommandStatus("Voice commands are not supported in this browser.");
      return;
    }
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition: SpeechRecognitionLike = new SpeechRecognitionCtor();
    recognition.lang = narrationLang;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const result = event.results?.[event.results.length - 1];
      const transcript = result?.[0]?.transcript?.trim() || "";
      runVoiceCommand(transcript);
    };
    recognition.onerror = (event: any) => {
      if (!shouldListenRef.current) return;
      setVoiceCommandStatus(`Voice command error: ${event.error || "unknown error"}.`);
    };
    recognition.onend = () => {
      if (!shouldListenRef.current) return;
      try {
        recognition.start();
      } catch {
        setVoiceCommandStatus("Voice commands paused. Please enable again.");
        shouldListenRef.current = false;
        setVoiceCommandsEnabled(false);
      }
    };
    recognitionRef.current = recognition;
    return () => {
      shouldListenRef.current = false;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      recognition.stop();
    };
  }, [isVoiceRecognitionSupported, narrationLang]);

  useEffect(() => {
    if (!isVoiceRecognitionSupported) return;
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (voiceCommandsEnabled) {
      shouldListenRef.current = true;
      recognition.lang = narrationLang;
      try {
        recognition.start();
        setVoiceCommandStatus(`Listening for commands in ${narrationLang}. Say play, pause, resume, or stop.`);
      } catch {
        setVoiceCommandStatus("Microphone access failed. Check browser permissions.");
        shouldListenRef.current = false;
        setVoiceCommandsEnabled(false);
      }
    } else {
      shouldListenRef.current = false;
      recognition.stop();
      setVoiceCommandStatus("Voice commands are off.");
    }
  }, [voiceCommandsEnabled, narrationLang, isVoiceRecognitionSupported]);

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
      const responseData = error?.response?.data;
      const statusText = error?.response?.status ? ` (HTTP ${error.response.status})` : "";
      const responseMessage =
        responseData?.details ||
        responseData?.error?.message ||
        responseData?.error ||
        responseData?.message ||
        (typeof responseData === "string" ? responseData : "");
      const networkMessage = error?.message || "Unknown request error.";
      setAiResponse(
        responseMessage
          ? `AI request failed${statusText}: ${responseMessage}`
          : `AI request failed${statusText}: ${networkMessage}`,
      );
    } finally {
      setAiBusy(false);
    }
  };

  const handleReadingPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!magnifierEnabled || !sentences.length) return;
    const container = readingRef.current;
    const previewText = previewTextRef.current;
    if (!container || !previewText) return;
    const bounds = container.getBoundingClientRect();
    const previewBounds = previewText.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const isWithinText =
      event.clientX >= previewBounds.left &&
      event.clientX <= previewBounds.right &&
      event.clientY >= previewBounds.top &&
      event.clientY <= previewBounds.bottom;
    if (!isWithinText) {
      setMagnifierState((current) => ({ ...current, visible: false }));
      return;
    }
    const contentX = event.clientX - previewBounds.left;
    const contentY = event.clientY - previewBounds.top;
    setMagnifierState({ visible: true, x, y, contentX, contentY, width: bounds.width, contentWidth: previewBounds.width });
  };

  const hideMagnifier = () => {
    setMagnifierState((current) => ({ ...current, visible: false }));
  };

  const maxLensLeft = Math.max(8, magnifierState.width - magnifierSize - 8);
  const lensLeft = Math.max(8, Math.min(magnifierState.x - magnifierSize / 2, maxLensLeft));
  const lensTop = Math.max(8, magnifierState.y - magnifierSize - 16);

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
          <div className="voice-command-panel" role="group" aria-label="Voice commands">
            <label className="toggle">
              <input
                type="checkbox"
                checked={voiceCommandsEnabled}
                disabled={!isVoiceRecognitionSupported}
                onChange={(e) => setVoiceCommandsEnabled(e.target.checked)}
              />
              Voice commands (play, pause, resume, stop)
            </label>
            <p className="voice-command-status">{voiceCommandStatus}</p>
          </div>
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
          <label className="toggle">
            <input
              type="checkbox"
              checked={magnifierEnabled}
              onChange={(e) => {
                setMagnifierEnabled(e.target.checked);
                if (!e.target.checked) hideMagnifier();
              }}
            />{" "}
            Floating magnifier
          </label>
          <label htmlFor="magnifier-zoom">
            Magnifier zoom <span className="value">{magnifierZoom.toFixed(1)}x</span>
            <input
              id="magnifier-zoom"
              type="range"
              min="1.5"
              max="3"
              step="0.1"
              value={magnifierZoom}
              onChange={(e) => setMagnifierZoom(Number(e.target.value))}
              disabled={!magnifierEnabled}
            />
          </label>
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

        <section
          ref={readingRef}
          className="card reading"
          onPointerEnter={handleReadingPointerMove}
          onPointerMove={handleReadingPointerMove}
          onPointerLeave={hideMagnifier}
          style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight, fontFamily: settings.fontFamily }}
        >
          <h2>Document Preview</h2>
          {sentences.length ? (
            <p ref={previewTextRef} className="preview-text">{sentences.map((sentence, i) => (<span key={`${sentence}-${i}`} className={i === currentIndex ? "active-sentence" : ""}>{sentence} </span>))}</p>
          ) : (
            <p>No content yet.</p>
          )}
          {magnifierEnabled && magnifierState.visible && sentences.length > 0 ? (
            <div
              className="magnifier-lens"
              style={{ width: `${magnifierSize}px`, height: `${magnifierSize}px`, left: `${lensLeft}px`, top: `${lensTop}px` }}
              aria-hidden="true"
            >
              <div
                className="magnifier-content"
                style={{
                  width: `${magnifierSize}px`,
                  height: `${magnifierSize}px`,
                  fontSize: `${settings.fontSize}px`,
                  lineHeight: settings.lineHeight,
                  fontFamily: settings.fontFamily,
                }}
              >
                <p
                  className="preview-text"
                  style={{
                    width: `${magnifierState.contentWidth}px`,
                    transform: `translate(${magnifierSize / 2 - magnifierState.contentX * magnifierZoom}px, ${magnifierSize / 2 - magnifierState.contentY * magnifierZoom}px) scale(${magnifierZoom})`,
                  }}
                >
                  {sentences.map((sentence, i) => (
                    <span key={`magnified-${sentence}-${i}`} className={i === currentIndex ? "active-sentence" : ""}>
                      {sentence}{" "}
                    </span>
                  ))}
                </p>
              </div>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
