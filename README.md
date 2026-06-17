# Goose Piano

An interactive Three.js toy: a goose plays a tiny grand piano, note colors float above the keys, and the goose can wander around with the arrow keys before snapping back to perform.

## Running locally

```bash
npm install
npm run dev
```

## Controls

- Click piano keys or use `A W S E D F T G Y H U J K O L P ;` to play notes. The lower row is white keys ranging from C4 to E5; the upper row is black keys ranging from C#4 to Eb5.
- Use arrow keys and space bar to walk the goose around.
- Playing a note returns the goose to the piano before the beak tap animation.
- Drag to orbit the scene and scroll to zoom.

## Project structure

- `src/main.js`: starts the app.
- `src/scene.js`: Three.js scene, geometry, animation, input handling, and color clouds.
- `src/audio.js`: note sound loading/playback.
- `src/style.css`: page/canvas styling.
- `public/sounds/`: piano note mp3 files.

## Why this exists

This started as a neat homepage feature for my personal website: a small interactive scene combining a goose, piano notes, and colors corresponding to those notes. It is built from Three.js primitives instead of external 3D models, so the project stays lightweight and easy to embed later.

## Future Improvements

- Skins for different types of geese (e.g. Canadian geese), thanks to my friend Yuqing for mentioning
- Make the math behind the goose movement (specifically the neck bending to tap keys) better
- Upload small JSON or MusicXML files for the goose to play
- Record clips/songs
