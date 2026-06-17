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

const audioPools = new Map();
const poolSize = 4;

export function preloadNotes() {
  Object.entries(SOUND_FILES).forEach(([noteName, fileName]) => {
    if (audioPools.has(noteName)) return;

    const pool = Array.from({ length: poolSize }, () => {
      const audio = new Audio(`/sounds/${fileName}`);
      audio.preload = 'auto';
      audio.volume = 0.72;
      return audio;
    });

    audioPools.set(noteName, { pool, cursor: 0 });
  });
}

export function playNote(noteName, octaveOffset = 0) {
  preloadNotes();

  const entry = audioPools.get(noteName);
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

  audio.play().catch(() => {
    // Browsers may block audio before the first click/key press.
  });
}
