# Goose Piano

An interactive Three.js toy: a goose plays a tiny grand piano, note colors bloom above the keys, and the goose can wander around with the arrow keys before snapping back to perform.

## Running locally

```bash
npm install
npm run dev
```

## Controls

- Click piano keys or use `A W S E D F T G Y H U J K O L P ;` to play notes.
- Use arrow keys to walk the goose around.
- Playing a note returns the goose to the piano before the beak tap animation.
- Drag to orbit the scene and scroll to zoom.

## Project shape

- `src/main.js`: starts the app.
- `src/scene.js`: Three.js scene, geometry, animation, input handling, and color clouds.
- `src/audio.js`: note sound loading/playback.
- `src/style.css`: page/canvas styling.
- `public/sounds/`: piano note mp3 files.

## Why this exists

This started as a playful homepage feature for `lauralz.com`: a small interactive scene combining a goose, piano notes, and chromesthesia-inspired color. It is intentionally hand-built from Three.js primitives instead of external 3D models, so the project stays lightweight and easy to embed later.
