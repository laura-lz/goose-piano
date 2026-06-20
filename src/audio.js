const SOUND_FILES = {
  C: 'C4.mp3',
  Db: 'Db4.mp3',
  D: 'D4.mp3',
  Eb: 'Eb4.mp3',
  E: 'E4.mp3',
  F: 'F4.mp3',
  Gb: 'Gb4.mp3',
  G: 'G4.mp3',
  Ab: 'Ab4.mp3',
  A: 'A4.mp3',
  Bb: 'Bb4.mp3',
  B: 'B4.mp3'
};

const IS_IOS_DEVICE =
  /iP(ad|hone|od)/.test(window.navigator.userAgent) ||
  (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
const IS_SAFARI = /^((?!chrome|android).)*safari/i.test(window.navigator.userAgent);
const USE_HTML_AUDIO = IS_IOS_DEVICE && IS_SAFARI;
const HTML_AUDIO_POOL_SIZE = 4;

const filePromises = new Map();
const bufferPromises = new Map();
const htmlAudioPools = new Map();
const activeNodes = new Set();
let audioContext;
let masterGain;
let resumePromise;
let htmlAudioUnlocked = false;

function getAudioContext() {
  if (!audioContext || audioContext.state === 'closed') {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;

    audioContext = new Context();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.86;
    masterGain.connect(audioContext.destination);
  }

  return audioContext;
}

function stopActiveNodes() {
  activeNodes.forEach(({ source, gain }) => {
    try {
      source.onended = null;
      source.stop();
    } catch {
      // The source may already be stopped.
    }
    try {
      source.disconnect();
      gain.disconnect();
    } catch {
      // Safari may already have torn the nodes down while backgrounding the page.
    }
  });
  activeNodes.clear();
}

export function resetAudio() {
  stopActiveNodes();
  bufferPromises.clear();
  resumePromise = null;

  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(() => {});
  }

  audioContext = null;
  masterGain = null;
}

function resumeAudioContext(context) {
  if (context.state === 'running') return Promise.resolve();
  if (!resumePromise) {
    resumePromise = context.resume().catch(() => {}).finally(() => {
      resumePromise = null;
    });
  }
  return resumePromise;
}

function primeAudioContext(context) {
  try {
    const buffer = context.createBuffer(1, 1, 22050);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(masterGain);
    source.start(0);
    source.onended = () => {
      try {
        source.disconnect();
      } catch {
        // The unlock source is intentionally disposable.
      }
    };
  } catch {
    // Some browsers reject silent unlock nodes before the audio session is ready.
  }
}

function decodeAudioData(context, audioData) {
  return new Promise((resolve, reject) => {
    const promise = context.decodeAudioData(audioData, resolve, reject);
    if (promise) promise.then(resolve).catch(reject);
  });
}

function loadNoteBuffer(noteName) {
  const fileName = SOUND_FILES[noteName];
  if (!fileName) return null;
  if (bufferPromises.has(noteName)) return bufferPromises.get(noteName);

  const context = getAudioContext();
  if (!context) return null;

  const bufferPromise = loadNoteFile(noteName)
    .then((audioData) => decodeAudioData(context, audioData.slice(0)));

  bufferPromises.set(noteName, bufferPromise);
  return bufferPromise;
}

function loadNoteFile(noteName) {
  const fileName = SOUND_FILES[noteName];
  if (!fileName) return null;

  if (!filePromises.has(noteName)) {
    filePromises.set(
      noteName,
      fetch(new URL(`sounds/${fileName}`, window.location.href)).then((response) => response.arrayBuffer())
    );
  }

  return filePromises.get(noteName);
}

function preloadHtmlNote(noteName) {
  const fileName = SOUND_FILES[noteName];
  if (!fileName || htmlAudioPools.has(noteName)) return;

  const pool = Array.from({ length: HTML_AUDIO_POOL_SIZE }, () => {
    const audio = new Audio(new URL(`sounds/${fileName}`, window.location.href));
    audio.preload = 'auto';
    audio.playsInline = true;
    audio.volume = 0.72;
    audio.load();
    return audio;
  });

  htmlAudioPools.set(noteName, { pool, cursor: 0 });
}

function playHtmlNote(noteName, octaveOffset = 0) {
  preloadHtmlNote(noteName);

  const entry = htmlAudioPools.get(noteName);
  if (!entry) return;

  const audio = entry.pool[entry.cursor];
  entry.cursor = (entry.cursor + 1) % entry.pool.length;

  audio.pause();
  audio.currentTime = 0;
  audio.volume = octaveOffset > 0 ? 0.62 : 0.72;
  audio.playbackRate = octaveOffset > 0 ? 2 : 1;
  audio.preservesPitch = false;
  audio.mozPreservesPitch = false;
  audio.webkitPreservesPitch = false;
  audio.play().catch(() => {});
}

function unlockHtmlAudio() {
  Object.keys(SOUND_FILES).forEach(preloadHtmlNote);

  const unlocks = [];
  htmlAudioPools.forEach(({ pool }) => {
    pool.forEach((audio) => {
      const previousMuted = audio.muted;
      const previousVolume = audio.volume;

      audio.muted = true;
      audio.volume = 0;

      const unlock = audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
        })
        .catch(() => {})
        .finally(() => {
          audio.muted = previousMuted;
          audio.volume = previousVolume;
        });

      unlocks.push(unlock);
    });
  });

  return Promise.allSettled(unlocks).then(() => {
    htmlAudioUnlocked = true;
  });
}

export function preloadNotes() {
  Object.keys(SOUND_FILES).forEach((noteName) => {
    loadNoteFile(noteName);
    if (USE_HTML_AUDIO) preloadHtmlNote(noteName);
  });
}

export function needsExplicitAudioUnlock() {
  return USE_HTML_AUDIO && !htmlAudioUnlocked;
}

export function unlockAudio() {
  if (USE_HTML_AUDIO) {
    return htmlAudioUnlocked ? Promise.resolve() : unlockHtmlAudio();
  }

  const context = getAudioContext();
  if (!context) return Promise.resolve();
  primeAudioContext(context);
  Object.keys(SOUND_FILES).forEach(loadNoteBuffer);
  return resumeAudioContext(context);
}

export function playNote(noteName, octaveOffset = 0) {
  if (USE_HTML_AUDIO) {
    playHtmlNote(noteName, octaveOffset);
    return;
  }

  const context = getAudioContext();
  const bufferPromise = loadNoteBuffer(noteName);
  if (!context || !bufferPromise) return;

  Promise.all([resumeAudioContext(context), bufferPromise])
    .then(([, buffer]) => {
      if (context.state !== 'running') return;

      const source = context.createBufferSource();
      const gain = context.createGain();
      const now = context.currentTime;

      source.buffer = buffer;
      source.playbackRate.value = octaveOffset > 0 ? 2 : 1;
      gain.gain.setValueAtTime(octaveOffset > 0 ? 0.62 : 0.72, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + Math.min(1.6, buffer.duration + 0.08));

      source.connect(gain);
      gain.connect(masterGain);
      const activeNode = { source, gain };
      activeNodes.add(activeNode);
      source.start(now);
      source.stop(now + Math.min(1.7, buffer.duration + 0.12));
      source.onended = () => {
        try {
          source.disconnect();
          gain.disconnect();
        } catch {
          // Nodes can already be disconnected during page lifecycle cleanup.
        }
        activeNodes.delete(activeNode);
      };
    })
    .catch(() => {
      // Audio decoding can fail if a browser is still settling after the first gesture.
    });
}
