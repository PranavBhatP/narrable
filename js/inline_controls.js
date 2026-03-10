// Inline playback controls and progress bar injected into each page.

(function () {
  if (window.__ttsReaderInlineControlsInitialized) return;
  window.__ttsReaderInlineControlsInitialized = true;

  const bar = document.createElement('div');
  bar.id = 'tts-reader-inline-bar';
  bar.style.position = 'fixed';
  bar.style.left = '50%';
  bar.style.bottom = '20px';
  bar.style.transform = 'translateX(-50%)';
  bar.style.zIndex = '2147483647';
  bar.style.display = 'none';
  bar.style.background = 'rgba(15, 23, 42, 0.96)';
  bar.style.color = '#e5e7eb';
  bar.style.borderRadius = '999px';
  bar.style.boxShadow = '0 6px 20px rgba(0,0,0,0.35)';
  bar.style.fontFamily = 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
  bar.style.fontSize = '12px';
  bar.style.padding = '8px 16px';
  bar.style.backdropFilter = 'blur(8px)';

  const statusSpan = document.createElement('span');
  statusSpan.textContent = 'Reading…';
  statusSpan.style.marginRight = '8px';

  const progressContainer = document.createElement('div');
  progressContainer.style.position = 'relative';
  progressContainer.style.width = '140px';
  progressContainer.style.height = '6px';
  progressContainer.style.borderRadius = '999px';
  progressContainer.style.overflow = 'hidden';
  progressContainer.style.background = '#1f2937';
  progressContainer.style.marginRight = '8px';
  progressContainer.setAttribute('aria-hidden', 'true');

  const progressFill = document.createElement('div');
  progressFill.style.height = '100%';
  progressFill.style.width = '0%';
  progressFill.style.borderRadius = '999px';
  progressFill.style.background = '#3b82f6';
  progressFill.style.transition = 'width 0.15s ease-out';

  progressContainer.appendChild(progressFill);

  function makeButton(label, title) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.title = title;
    btn.style.border = 'none';
    btn.style.borderRadius = '999px';
    btn.style.padding = '2px 10px';
    btn.style.marginLeft = '4px';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '11px';
    btn.style.color = '#e5e7eb';
    btn.style.background = '#374151';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.height = '22px';
    return btn;
  }

  const pauseBtn = makeButton('⏸', 'Pause');
  const playBtn = makeButton('▶', 'Resume');
  const stopBtn = makeButton('⏹', 'Stop');

  bar.appendChild(statusSpan);
  bar.appendChild(progressContainer);
  bar.appendChild(pauseBtn);
  bar.appendChild(playBtn);
  bar.appendChild(stopBtn);

  document.documentElement.appendChild(bar);

  pauseBtn.addEventListener('click', function () {
    chrome.runtime.sendMessage({ type: 'pause' });
  });

  playBtn.addEventListener('click', function () {
    chrome.runtime.sendMessage({ type: 'resume' });
  });

  stopBtn.addEventListener('click', function () {
    chrome.runtime.sendMessage({ type: 'reload' });
  });

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message) return;

    // State updates from background (start/stop/pause/resume).
    if (message.type === 'stateChanged') {
      const s = message.state;
      if (s === 'playing') {
        bar.style.display = 'flex';
        bar.style.alignItems = 'center';
        if (!progressFill.style.width) {
          progressFill.style.width = '0%';
        }
      } else if (s === 'ready') {
        bar.style.display = 'none';
        progressFill.style.width = '0%';
      }
      return;
    }

    // Detailed TTS progress.
    if (message.type === 'ttsProgress') {
      const state = message.state;
      const percent = typeof message.percent === 'number' ? message.percent : 0;
      const mode = message.mode || 'selection';

      if (state === 'ready') {
        bar.style.display = 'none';
        progressFill.style.width = '0%';
        return;
      }

      bar.style.display = 'flex';
      bar.style.alignItems = 'center';

      const label = mode === 'page' ? 'Reading page' : 'Reading selection';
      statusSpan.textContent = `${label} · ${percent}%`;
      progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    }
  });
})();

