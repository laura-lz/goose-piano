# Goose Piano

A Three.js goose plays a tiny grand piano, note colors float above the keys, and the goose can wander around with the arrow keys before snapping back to perform.

## Running locally

```bash
npm install
npm run dev
```

## Syncing to a website

After changing the scene, build and copy it into a website folder:

```bash
npm run sync-site -- ../your-site/assets/goose-piano
```

The target folder should be the folder loaded by the website iframe.

You can also set `GOOSE_PIANO_SYNC_TARGET` as an environment variable instead of passing the path each time.

## Controls

- Click piano keys or use `A W S E D F T G Y H U J K O L P ;` to play notes. The lower row is white keys ranging from C4 to E5; the upper row is black keys ranging from C#4 to Eb5.
- Use arrow keys and space bar to walk the goose around.
- Playing a note returns the goose to the piano before the beak tap animation.
- Click and drag to orbit the scene and scroll to zoom.

## Project structure

- `src/main.js`: starts the app.
- `src/scene.js`: Three.js scene, geometry, animation, input handling, and color clouds.
- `src/audio.js`: note sound loading/playback.
- `src/style.css`: page/canvas styling.
- `public/sounds/`: piano note mp3 files.
- scripts/: handles sync updates to another repo (if applicable).

## Why this exists

This started as a neat homepage feature for my personal website: a small interactive scene combining a goose, piano notes, and colors corresponding to those notes. It is built from Three.js primitives instead of external 3D models, so the project stays lightweight and easy to embed later.

## Important Notes

- Works best on Google Chrome
- For Safari browser or browsers with fps below a certain threshold, goose piano adjusts so that shadows are not rendered and pixel ratio is decreased to 1.75:1; this is in order to optimize the actual piano-playing experience (sound- and animation-wise)
- Chrome and desktop Safari use web audio; mobile Safari uses pooled audio elements

## Future Improvements

- Skins for different types of geese (e.g. Canadian geese), thanks to my friend Yuqing for mentioning
- Make the math behind the goose movement (specifically the neck bending to tap keys) better
- Upload small JSON or MusicXML files for the goose to play
- Record clips/songs
- Make goose movement functional on mobile web

<img width="709" height="594" alt="Screenshot 2026-06-17 at 12 58 20 PM" src="https://github.com/user-attachments/assets/c89aab12-7abf-4acd-a254-6c15e3545c72" />
