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

const filePromises = new Map();
const bufferPromises = new Map();
let audioContext;
let masterGain;
let resumePromise;
let hasPrimedAudio = false;

function getAudioContext() {
  if (!audioContext || audioContext.state === 'closed') {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;

    audioContext = new Context();
    if ('audioSession' in window.navigator) {
      window.navigator.audioSession.type = 'playback';
    }
    masterGain = audioContext.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(audioContext.destination);
  }

  return audioContext;
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

function decodeAudioData(context, audioData) {
  return new Promise((resolve, reject) => {
    const promise = context.decodeAudioData(audioData, resolve, reject);
    if (promise) promise.then(resolve).catch(reject);
  });
}

function loadNoteBuffer(noteName) {
  if (bufferPromises.has(noteName)) return bufferPromises.get(noteName);

  const context = getAudioContext();
  const filePromise = loadNoteFile(noteName);
  if (!context || !filePromise) return null;

  const bufferPromise = filePromise.then((audioData) => decodeAudioData(context, audioData.slice(0)));
  bufferPromises.set(noteName, bufferPromise);
  return bufferPromise;
}

function resumeAudioContext(context) {
  if (context.state === 'running') return Promise.resolve();

  if (!resumePromise) {
    resumePromise = context.resume().finally(() => {
      resumePromise = null;
    });
  }

  return resumePromise;
}

function primeAudioGraph(context) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(523.25, now);
  gain.gain.setValueAtTime(0.0001, now);

  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(now);
  oscillator.stop(now + 0.04);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}

export function preloadNotes() {
  Object.keys(SOUND_FILES).forEach(loadNoteFile);
}

export function unlockAudio({ prime = false } = {}) {
  const context = getAudioContext();
  if (!context) return Promise.reject(new Error('Web Audio is unavailable.'));

  if (prime && !hasPrimedAudio) {
    primeAudioGraph(context);
  }

  return resumeAudioContext(context).then(() => {
    if (context.state !== 'running') {
      throw new Error(`AudioContext is ${context.state}.`);
    }

    if (prime && !hasPrimedAudio) {
      primeAudioGraph(context);
      hasPrimedAudio = true;
    }
    Object.keys(SOUND_FILES).forEach(loadNoteBuffer);
  });
}

export function playNote(noteName, octaveOffset = 0) {
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

      source.start(now);
      source.stop(now + Math.min(1.7, buffer.duration + 0.12));
      source.onended = () => {
        try {
          source.disconnect();
          gain.disconnect();
        } catch {
          // Nodes can already be disconnected during page lifecycle cleanup.
        }
      };
    })
    .catch(() => {
      // Browsers can still reject audio if the frame lacks permission or user activation.
    });
}
