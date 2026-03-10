/*
 * TTS Reader GUI (Manifest V3)
 *
 * Popup talks to the background service worker via chrome.runtime.sendMessage.
 */

var prevstate = 0;
var status = 'play';
var lastState = 'ready';

var button = document.getElementById('button');
var reload = document.getElementById('reload');
var canvas = document.getElementById('volume');
var error = document.getElementById('error');
var replaybtn = document.getElementById("replay");
var play = document.getElementById("play");
var readSelectionBtn = document.getElementById("read-selection-btn");
var readPageBtn = document.getElementById("read-page-btn");
var pauseBtn = document.getElementById("pause-btn");
var resumeBtn = document.getElementById("resume-btn");
var languageSelect = document.getElementById("language-select");

// Simple local options used only for drawing initial volume.
var options = { volume: 0.5 };

function sendCommand(type, extra) {
  chrome.runtime.sendMessage(Object.assign({ type: type }, extra || {}));
}

// Event listeners
canvas.addEventListener('click', function(e) {
  var volume = calculateVolume(e.clientX, e.clientY);
  drawVolume(volume);
}, false);

play.addEventListener('click', function() {
  sendCommand('resume');
}, false);

replaybtn.addEventListener('click', function() {
  sendCommand('replay');
}, false);

reload.addEventListener('click', function() {
  sendCommand('reload');
  window.close();
}, false);

readSelectionBtn.addEventListener('click', function () {
  sendCommand('readSelection');
}, false);

readPageBtn.addEventListener('click', function () {
  sendCommand('readPage');
}, false);

pauseBtn.addEventListener('click', function () {
  sendCommand('pause');
  onClick('paused');
}, false);

resumeBtn.addEventListener('click', function () {
  sendCommand('resume');
  onClick('playing');
}, false);

languageSelect.addEventListener('change', function () {
  var lang = languageSelect.value;
  sendCommand('setLanguage', { lang: lang });
}, false);

button.addEventListener('click', function() {
  if (lastState === 'playing') {
    sendCommand('pause');
    onClick('paused');
  } else if (lastState === 'paused') {
    sendCommand('resume');
    onClick('playing');
  } else {
    // When idle/ready, choose best default: selection if present, else page.
    sendCommand('defaultRead');
  }
}, false);

error.addEventListener('click', function() {
  chrome.tabs.create({ url: 'http://goo.gl/OOVgp' });
}, false);

/*
 * Manipulating onClick button event
 */
function onClick(state) {
  var zen = document.getElementById("zen");
  var circle = document.getElementById("circle");
  var playbtn = document.getElementById("play");

  if (state === 'replay') {
    replaybtn.style.display = "block";
    playbtn.style.display = "none";
    circle.className = "circle rotate";
    zen.className = "replay";
  } else {
    playbtn.style.display = "block";
    replaybtn.style.display = "none";

    if (state === "playing") {
      circle.className = "circle rotate";
      zen.className = "play";
    } else {
      circle.className = "circle";
      zen.className = "";
    }
  }

  status = state;
  lastState = state;
}

/*
 * Functions for controlling visual progress
 */
function displayProgress(seconds) {
  prevstate++;
  progress.style['-webkit-transition-duration'] = seconds + 's';
  var deg = 360 * prevstate;
  progress.style.webkitTransform = "rotate(" + deg + "deg)";
}

/*
 * Show error information
 */
function showError() {
  error.innerHTML = chrome.i18n.getMessage('lang_error');
  error.style.display = "block";
}

/*
 * Receive audio state from background
 */
function sendState(state) {
  onClick(state);
}

/*
 * Draw volume level in canvas element
 */
function drawVolume(volume) {
  var radius = 63;
  canvas.width = canvas.width; // clear canvas
  var context = canvas.getContext('2d');
  var canvas_size = [canvas.width, canvas.height];
  var center = [canvas_size[0] / 2, canvas_size[1] / 2];

  context.arc(
    center[0],
    center[1],
    radius,
    0, // start angle
    Math.PI * (2 * volume),
    false
  );

  var rad = context.createRadialGradient(
    center[0],
    center[1],
    radius - 5,
    center[0],
    center[1],
    radius + 5
  );
  rad.addColorStop(0, 'rgb(69, 131, 241)');
  rad.addColorStop(1, 'rgb(0, 81, 221)');

  context.lineWidth = 10;
  context.strokeStyle = rad;
  context.stroke();
}

/*
 * Calculating audio volume by point coordinates selected by user
 */
function calculateVolume(x, y) {
  x = x - (window.innerWidth / 2);
  y = (y - 75) * -1;

  var radius = Math.sqrt((x * x) + (y * y));
  var angle;

  if (x > 0 && y >= 0) {
    angle = Math.asin(Math.abs(y) / radius) * (180 / Math.PI);
  } else if (x < 0 && y >= 0) {
    angle = 180 - (Math.asin(Math.abs(y) / radius) * (180 / Math.PI));
  } else if (x <= 0 && y < 0) {
    angle = 180 + (Math.asin(Math.abs(y) / radius) * (180 / Math.PI));
  } else {
    angle = 360 - (Math.asin(Math.abs(y) / radius) * (180 / Math.PI));
  }
  var volume = 1 - (angle / 360);

  return volume;
}

/*
 * Initialization: report current state and selected language.
 */
chrome.runtime.sendMessage({ type: 'getState' }, function (response) {
  if (response && response.state) {
    sendState(response.state);
  }
});

chrome.runtime.sendMessage({ type: 'getLanguage' }, function (response) {
  if (response && response.lang && languageSelect) {
    languageSelect.value = response.lang;
  }
});

// Keep UI in sync when background state changes (e.g. when starting page read).
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message && message.type === 'stateChanged' && message.state) {
    sendState(message.state);
  }
});

drawVolume(options.volume);

