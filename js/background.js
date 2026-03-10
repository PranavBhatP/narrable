// Manifest V3 background service worker for TTS Reader.
// This is a simplified port that focuses on using chrome.tts.

let state = 'ready';           // 'ready' | 'playing' | 'paused'
let lastText = '';             // Last text that was spoken.
let currentMode = 'selection'; // 'selection' | 'page' | 'other'
let currentTabId = null;       // Tab id where reading was started.

// Basic default options. The legacy options page stores its own values in
// localStorage inside the options page; to keep the port small we just use
// these defaults in the background for now, but allow language override from
// the popup (e.g. for Hindi).
let options = {
  voice: undefined,   // let Chrome pick default
  volume: 0.5,
  rate: 1.0,
  pitch: 1.0,
  lang: 'en-IN'
};

function broadcastState() {
  chrome.runtime.sendMessage({ type: 'stateChanged', state });
}

function sendProgress(remaining, total) {
  if (!total || total <= 0) return;
  const done = total - remaining;
  const percent = Math.round((done / total) * 100);
  const payload = {
    type: 'ttsProgress',
    state,
    total,
    remaining,
    percent,
    mode: currentMode
  };

  if (currentTabId != null) {
    chrome.tabs.sendMessage(currentTabId, payload, () => {
      // Ignore errors when tab has no listener (e.g., devtools).
      if (chrome.runtime.lastError) {
        // no-op
      }
    });
  }
}

function speakText(text, fromUserGesture) {
  if (!text || !text.trim()) {
    return;
  }

  lastText = text;
  state = 'playing';
  broadcastState();

  const sentences = splitIntoSentences(text);
  const total = sentences.length;

  let remaining = total;

  for (let i = 0; i < total; i++) {
    const sentence = sentences[i];
    if (!sentence) continue;

    const enqueue = i !== 0;
    const ttsOptions = {
      voiceName: options.voice,
      enqueue,
      rate: options.rate,
      pitch: options.pitch,
      volume: options.volume,
      lang: options.lang,
      onEvent: (event) => {
        if (event.type === 'end') {
          remaining -= 1;
          sendProgress(remaining, total);
          if (remaining === 0) {
            state = 'ready';
            broadcastState();
          }
        } else if (
          event.type === 'interrupted' ||
          event.type === 'cancelled' ||
          event.type === 'error'
        ) {
          state = 'ready';
          chrome.tts.stop();
          broadcastState();
        }
      }
    };

    chrome.tts.speak(sentence, ttsOptions, () => {
      if (chrome.runtime.lastError) {
        console.warn('TTS error:', chrome.runtime.lastError.message);
      }
    });
  }

  // Work around occasional Chrome TTS quirks.
  setTimeout(() => chrome.tts.resume(), 100);
}

function splitIntoSentences(text) {
  // Simple sentence splitter based on punctuation and max length.
  const maxLen = 300;
  const raw = text.split(/\. |\? |\! /);
  const chunks = [];

  for (const part of raw) {
    const sentence = part.trim();
    if (!sentence) continue;
    if (sentence.length <= maxLen) {
      chunks.push(sentence);
    } else {
      for (const piece of sentence.match(new RegExp(`.{1,${maxLen}}`, 'g')) || []) {
        const trimmed = piece.trim();
        if (trimmed) {
          chunks.push(trimmed);
        }
      }
    }
  }

  return chunks;
}

function pause() {
  chrome.tts.pause();
  state = 'paused';
  broadcastState();
}

function resume() {
  chrome.tts.resume();
  state = 'playing';
  broadcastState();
}

function stop() {
  chrome.tts.stop();
  state = 'ready';
  broadcastState();
}

function replay() {
  if (!lastText) return;
  speakText(lastText, true);
}

// Get the currently active tab in the current window.
function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs[0]);
    });
  });
}

// Read current selection on the active tab using chrome.scripting.
async function readActiveSelection() {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return;

  currentTabId = tab.id;
  currentMode = 'selection';

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString()
    });

    const selectedText = result && result.result;
    if (selectedText && selectedText.trim()) {
      speakText(selectedText, true);
    }
  } catch (e) {
    console.warn('Failed to read selection:', e);
  }
}

// Extract the main textual content of the page, trying to ignore navigation,
// sidebars, ads etc., and read it aloud.
async function readPageMainContent() {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return;

  currentTabId = tab.id;
  currentMode = 'page';

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Try common "main content" containers first.
        const candidates = [];
        candidates.push(...document.querySelectorAll('article, main, [role="main"]'));

        let bestNode = null;
        let bestLength = 0;

        function visibleTextLength(node) {
          if (!node) return 0;
          const style = window.getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden') return 0;
          const text = node.innerText || node.textContent || '';
          return text.replace(/\s+/g, ' ').trim().length;
        }

        for (const node of candidates) {
          const len = visibleTextLength(node);
          if (len > bestLength) {
            bestLength = len;
            bestNode = node;
          }
        }

        // Fallback: clone <body> and strip obvious non-content containers.
        if (!bestNode) {
          const clone = document.body.cloneNode(true);
          clone.querySelectorAll('script, style, nav, header, footer, aside, noscript, iframe, form')
            .forEach(el => el.remove());
          const text = clone.innerText || clone.textContent || '';
          return text.replace(/\s+/g, ' ').trim();
        }

        const text = bestNode.innerText || bestNode.textContent || '';
        return text.replace(/\s+/g, ' ').trim();
      }
    });

    const mainText = result && result.result;
    if (mainText && mainText.trim()) {
      speakText(mainText, true);
    }
  } catch (e) {
    console.warn('Failed to extract main content:', e);
  }
}

// Context menu: speak selected text.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ttsReaderSpeakSelection',
    title: 'Read selection with TTS Reader',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'ttsReaderSpeakSelection' && info.selectionText) {
    currentTabId = tab && tab.id != null ? tab.id : null;
    currentMode = 'selection';
    speakText(info.selectionText, true);
  }
});

// Message API used by popup / content scripts.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message?.type) {
    case 'readSelection':
      readActiveSelection();
      break;
    case 'readPage':
      readPageMainContent();
      break;
    case 'speakText':
      speakText(message.text || '', true);
      break;
    case 'defaultRead':
      // If there is a selection, read it; otherwise read main content.
      (async () => {
        const tab = await getActiveTab();
        if (!tab || !tab.id) return;
        currentTabId = tab.id;
        try {
          const [result] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => window.getSelection().toString()
          });
          const text = result && result.result;
          if (text && text.trim()) {
            currentMode = 'selection';
            speakText(text, true);
          } else {
            currentMode = 'page';
            readPageMainContent();
          }
        } catch (e) {
          console.warn('defaultRead failed, fallback to page:', e);
          currentMode = 'page';
          readPageMainContent();
        }
      })();
      break;
    case 'pause':
      pause();
      break;
    case 'resume':
      resume();
      break;
    case 'replay':
      replay();
      break;
    case 'stop':
    case 'reload':
      stop();
      break;
    case 'getState':
      sendResponse({ state });
      return true;
    case 'setLanguage':
      if (typeof message.lang === 'string' && message.lang.trim()) {
        options.lang = message.lang;
      }
      break;
    case 'getLanguage':
      sendResponse({ lang: options.lang });
      return true;
    default:
      break;
  }

  // For async messages we would return true, but everything here is sync.
  return false;
});

