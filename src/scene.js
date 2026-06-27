import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { playNote, preloadNotes, unlockAudio } from './audio.js';

const KEYBOARD = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k', 'o', 'l', 'p', ';'];
const PIANO_NOTES = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E'
];
const NOTE_COLORS = {
  C: '#eaccb8',
  Db: '#e722a2',
  D: '#ffffff',
  Eb: '#9ed433',
  E: '#7ee07b',
  F: '#ff5900',
  Gb: '#c4260e',
  G: '#a0d4e6',
  Ab: '#910c7b',
  A: '#710271',
  Bb: '#222288',
  B: '#3737e2'
};
const TAP_DURATION = 0.32;
const TAP_HOLD_START = 0.38;
const TAP_HOLD_END = 0.6;
const HIGH_QUALITY_COLOR_CLOUDS = 18;
const LOW_QUALITY_COLOR_CLOUDS = 12;
const COLOR_CLOUD_TTL = 0.95;
const HIGH_QUALITY_CLOUD_PUFF_GEOMETRY = new THREE.SphereGeometry(1, 14, 10);
const LOW_QUALITY_CLOUD_PUFF_GEOMETRY = new THREE.SphereGeometry(1, 10, 8);
const NECK_CACHE_STEPS = 18;
const JUMP_NECK_CACHE_STEPS = 28;
const HEAD_NECK_ANCHOR_OFFSET = new THREE.Vector3(-0.16, -0.08, 0);
const HIGH_QUALITY_PIXEL_RATIO = 2;
const SAFARI_PIXEL_RATIO = 1.75;
const LOW_QUALITY_PIXEL_RATIO = 1.5;
const HIGH_QUALITY_LOW_FPS_THRESHOLD = 24;
const SAFARI_LOW_FPS_THRESHOLD = 30;
const LOW_FPS_SAMPLE_SECONDS = 2.5;
const GOOSE_DRAG_DEAD_ZONE = 14;
const GOOSE_JUMP_FLICK_DISTANCE = 52;
const GOOSE_JUMP_FLICK_MS = 420;
const JUMP_FOOT_FORWARD_STRIDE = 0.28;
const JUMP_FOOT_FORWARD_ANGLE = -0.18;
const JUMP_BODY_FORWARD_SHIFT = 0.14;
const JUMP_BODY_EXTRA_LIFT = 0.16;
const JUMP_NECK_CRANE_FORWARD = 0.3;
const JUMP_NECK_CRANE_DOWN = 0.12;
const JUMP_HEAD_LEVEL_STRENGTH = 0.86;
const FOOT_CONTACT_HEIGHT = 0.04;

export function createGoosePianoScene(container) {
  const isSafari = /^((?!chrome|android).)*safari/i.test(window.navigator.userAgent);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ffffff');

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(5.3, 4.3, 1.3);
  camera.lookAt(0, 1.2, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: !isSafari, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isSafari ? SAFARI_PIXEL_RATIO : HIGH_QUALITY_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !isSafari;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.2, -0.2);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4.5;
  controls.maxDistance = 12;
  controls.maxPolarAngle = Math.PI * 0.48;

  addLights(scene);
  addFloor(scene);

  const goose = createGoose();
  goose.position.set(-0.17, -0.02, 1.04);
  goose.rotation.y = Math.PI / 2;
  goose.userData.homePosition = goose.position.clone();
  goose.userData.homeRotationY = goose.rotation.y;
  goose.userData.walkKeys = new Set();
  goose.userData.keepOutBounds = { minX: -2.05, maxX: 1.75, minZ: -2.8, maxZ: 0.36 };
  scene.add(goose);
  const gooseMeshes = getTouchableMeshes(goose);

  const { piano, keyMeshes } = createPiano();
  piano.position.set(-0.2, 0, -0.9);
  scene.add(piano);
  scene.updateMatrixWorld(true);

  goose.userData.neckGeometryCache = createNeckGeometryCache(goose, keyMeshes);
  goose.userData.jumpNeckGeometryCache = createJumpNeckGeometryCache(goose);

  preloadNotes();

  const particles = [];
  const particleQuality = {
    geometry: isSafari ? LOW_QUALITY_CLOUD_PUFF_GEOMETRY : HIGH_QUALITY_CLOUD_PUFF_GEOMETRY,
    maxClouds: isSafari ? LOW_QUALITY_COLOR_CLOUDS : HIGH_QUALITY_COLOR_CLOUDS
  };
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const activeKeyboardKeys = new Set();
  const activeGooseDragKeys = new Set();
  const gooseDrag = {
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    startedAt: 0
  };

  function triggerNote(noteIndex) {
    const key = keyMeshes[noteIndex];
    const note = PIANO_NOTES[noteIndex];
    if (!key || !note) return;

    const octaveOffset = noteIndex >= 12 ? 1 : 0;
    const keyPosition = getKeyTapPoint(key);
    playNote(note, octaveOffset);
    animateKey(key);
    addColorCloud(scene, particles, particleQuality, note, keyPosition);
    resetGooseHome(goose);
    setGooseTapTarget(goose, keyPosition, noteIndex);
  }

  function startGooseDrag(event) {
    gooseDrag.pointerId = event.pointerId;
    gooseDrag.startX = event.clientX;
    gooseDrag.startY = event.clientY;
    gooseDrag.lastX = event.clientX;
    gooseDrag.lastY = event.clientY;
    gooseDrag.startedAt = performance.now();
    controls.enabled = false;

    if (renderer.domElement.setPointerCapture) {
      try {
        renderer.domElement.setPointerCapture(event.pointerId);
      } catch {
        // Some browsers can reject capture if the pointer lifecycle changed.
      }
    }
  }

  function updateGooseDragWalk() {
    const deltaX = gooseDrag.lastX - gooseDrag.startX;
    const deltaY = gooseDrag.lastY - gooseDrag.startY;
    const nextKeys = new Set();

    if (Math.abs(deltaX) > GOOSE_DRAG_DEAD_ZONE) {
      nextKeys.add(deltaX > 0 ? 'ArrowRight' : 'ArrowLeft');
    }

    if (Math.abs(deltaY) > GOOSE_DRAG_DEAD_ZONE) {
      nextKeys.add(deltaY > 0 ? 'ArrowDown' : 'ArrowUp');
    }

    setGooseDragKeys(nextKeys);
  }

  function setGooseDragKeys(nextKeys) {
    activeGooseDragKeys.forEach((key) => {
      if (!nextKeys.has(key)) goose.userData.walkKeys.delete(key);
    });

    nextKeys.forEach((key) => {
      activeGooseDragKeys.add(key);
      goose.userData.walkKeys.add(key);
    });

    activeGooseDragKeys.forEach((key) => {
      if (!nextKeys.has(key)) activeGooseDragKeys.delete(key);
    });
  }

  function finishGooseDrag(event) {
    gooseDrag.lastX = event.clientX;
    gooseDrag.lastY = event.clientY;

    const deltaX = gooseDrag.lastX - gooseDrag.startX;
    const deltaY = gooseDrag.lastY - gooseDrag.startY;
    const elapsed = performance.now() - gooseDrag.startedAt;
    const isUpwardFlick = deltaY < -GOOSE_JUMP_FLICK_DISTANCE
      && elapsed < GOOSE_JUMP_FLICK_MS
      && Math.abs(deltaY) > Math.abs(deltaX) * 1.2;

    if (isUpwardFlick) startGooseJump(goose);
    cancelGooseDrag();
  }

  function cancelGooseDrag() {
    if (gooseDrag.pointerId === null) return;

    if (renderer.domElement.releasePointerCapture) {
      try {
        renderer.domElement.releasePointerCapture(gooseDrag.pointerId);
      } catch {
        // Capture may already be released after browser gestures or blur.
      }
    }

    setGooseDragKeys(new Set());
    gooseDrag.pointerId = null;
    controls.enabled = true;
  }

  window.addEventListener('pointerdown', (event) => {
    unlockAudio({ prime: true });
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const canDragGoose = event.pointerType === 'touch' || event.pointerType === 'pen';
    const gooseHit = canDragGoose ? raycaster.intersectObjects(gooseMeshes, false)[0] : null;
    if (gooseHit) {
      event.preventDefault();
      startGooseDrag(event);
      return;
    }

    const hit = raycaster.intersectObjects(keyMeshes, false)[0];
    if (hit) triggerNote(hit.object.userData.noteIndex);
  });

  window.addEventListener('pointermove', (event) => {
    if (event.pointerId !== gooseDrag.pointerId) return;
    event.preventDefault();
    gooseDrag.lastX = event.clientX;
    gooseDrag.lastY = event.clientY;
    updateGooseDragWalk();
  });

  window.addEventListener('pointerup', (event) => {
    if (event.pointerId !== gooseDrag.pointerId) return;
    finishGooseDrag(event);
  });

  window.addEventListener('pointercancel', (event) => {
    if (event.pointerId !== gooseDrag.pointerId) return;
    cancelGooseDrag();
  });

  window.addEventListener('keydown', (event) => {
    unlockAudio({ prime: true });

    if (event.code === 'Space') {
      event.preventDefault();
      startGooseJump(goose);
      return;
    }

    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      goose.userData.walkKeys.add(event.key);
      return;
    }

    const keyName = event.key.toLowerCase();
    const index = KEYBOARD.indexOf(keyName);
    if (index !== -1 && !activeKeyboardKeys.has(keyName)) {
      activeKeyboardKeys.add(keyName);
      triggerNote(index);
    }
  });

  window.addEventListener('keyup', (event) => {
    activeKeyboardKeys.delete(event.key.toLowerCase());
    if (event.key.startsWith('Arrow')) {
      goose.userData.walkKeys.delete(event.key);
    }
  });

  window.addEventListener('blur', () => {
    activeKeyboardKeys.clear();
    goose.userData.walkKeys.clear();
    activeGooseDragKeys.clear();
    cancelGooseDrag();
  });

  window.addEventListener('touchstart', () => unlockAudio({ prime: true }), { passive: true });
  window.addEventListener('click', () => unlockAudio({ prime: true }));
  window.addEventListener('pageshow', preloadNotes);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) preloadNotes();
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  let qualitySampleTime = 0;
  let qualitySampleFrames = 0;
  let loweredPixelRatio = false;

  renderer.setAnimationLoop(() => {
    const delta = clock.getDelta();
    const time = clock.elapsedTime;
    qualitySampleTime += delta;
    qualitySampleFrames += 1;

    if (!loweredPixelRatio && qualitySampleTime >= LOW_FPS_SAMPLE_SECONDS) {
      const averageFps = qualitySampleFrames / qualitySampleTime;
      const lowFpsThreshold = isSafari ? SAFARI_LOW_FPS_THRESHOLD : HIGH_QUALITY_LOW_FPS_THRESHOLD;
      if (averageFps < lowFpsThreshold && window.devicePixelRatio > LOW_QUALITY_PIXEL_RATIO) {
        renderer.setPixelRatio(LOW_QUALITY_PIXEL_RATIO);
        renderer.setSize(window.innerWidth, window.innerHeight);
        loweredPixelRatio = true;
      }
    }

    updateGooseWalk(goose, delta);
    animateGoose(goose, time, delta);
    updateParticles(scene, particles, delta);
    controls.update();
    renderer.render(scene, camera);
  });
}

function addLights(scene) {
  scene.add(new THREE.HemisphereLight('#f8fbff', '#dfe8de', 2.2));

  const key = new THREE.DirectionalLight('#ffffff', 2.7);
  key.position.set(3.5, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -7;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 18;
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key);

  const fill = new THREE.DirectionalLight('#cde7ed', 0.9);
  fill.position.set(-4, 3, 2);
  scene.add(fill);
}

function addFloor(scene) {
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(4.4, 48),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
}

function createGoose() {
  const group = new THREE.Group();
  group.userData.baseY = -0.02;

  const white = new THREE.MeshStandardMaterial({ color: '#fffdf8', roughness: 0.58 });
  const shade = new THREE.MeshStandardMaterial({ color: '#e8ece8', roughness: 0.7 });
  const orange = new THREE.MeshStandardMaterial({ color: '#e88a37', roughness: 0.55 });
  const black = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.7 });

  const body = mesh(new THREE.SphereGeometry(1, 18, 14), white, [-0.15, 0.95, 0], [1.25, 0.82, 0.82]);
  const belly = mesh(new THREE.SphereGeometry(0.72, 18, 12), shade, [-0.36, 0.8, 0.05], [1, 0.58, 0.62]);
  const tail = mesh(new THREE.ConeGeometry(0.4, 0.72, 6), white, [-1.28, 1.06, 0], [1, 1, 1], [0, 0, Math.PI / 2]);
  const neck = createCurvedNeckMesh(white);
  const head = mesh(new THREE.SphereGeometry(0.43, 18, 14), white, [0.95, 2.55, 0], [1, 0.82, 0.82]);
  const beak = mesh(new THREE.SphereGeometry(0.28, 18, 12), orange, [1.34, 2.5, 0], [1.15, 0.46, 0.62]);
  const eye = mesh(new THREE.SphereGeometry(0.058, 10, 10), black, [1.08, 2.65, 0.3]);
  const farEye = mesh(new THREE.SphereGeometry(0.058, 10, 10), black, [1.08, 2.65, -0.3]);

  const leftLeg = mesh(new THREE.CylinderGeometry(0.065, 0.08, 1.08, 8), orange, [-0.24, 0.615, 0.55]);
  const rightLeg = mesh(new THREE.CylinderGeometry(0.065, 0.08, 1.08, 8), orange, [0.06, 0.615, -0.52]);
  const leftFoot = mesh(createTrapezoidFootGeometry(0.5, 0.08, 0.17, 0.3), orange, [-0.24, 0.08, 0.55], [1, 1, 1], [0, -0.32, 0]);
  const rightFoot = mesh(createTrapezoidFootGeometry(0.5, 0.08, 0.17, 0.3), orange, [0.06, 0.08, -0.52], [1, 1, 1], [0, -0.12, 0]);

  const headPivot = new THREE.Group();
  headPivot.position.copy(head.position);
  [head, beak, eye, farEye].forEach((part) => {
    part.position.sub(headPivot.position);
    headPivot.add(part);
  });

  const upperBody = new THREE.Group();
  upperBody.add(body, belly, tail, neck, headPivot);
  upperBody.userData.basePosition = upperBody.position.clone();

  const bobParts = [body, belly, tail];
  const walkParts = [leftLeg, rightLeg, leftFoot, rightFoot];
  [...bobParts, headPivot, neck, ...walkParts].forEach((part) => {
    part.userData.basePosition = part.position.clone();
    part.userData.baseQuaternion = part.quaternion.clone();
    part.userData.baseScale = part.scale.clone();
  });
  group.userData.bobParts = bobParts;
  group.userData.walkParts = { leftLeg, rightLeg, leftFoot, rightFoot };
  group.userData.walkPhase = 0;
  group.userData.walkAmount = 0;
  group.userData.jumpAmount = 0;
  group.userData.jumpTime = 0;
  group.userData.isJumping = false;
  group.userData.upperBody = upperBody;
  group.userData.headPivot = headPivot;
  group.userData.beakTipOffset = beak.position.clone().add(new THREE.Vector3(0.32, -0.01, 0));
  group.userData.neck = neck;
  group.userData.neckRoot = new THREE.Vector3(0.52, 1.3, 0);
  group.userData.tapTarget = null;
  group.userData.tapTime = 0;
  group.userData.tapDuration = TAP_DURATION;
  group.userData.tapYaw = 0;
  group.userData.tapBodyYaw = 0;
  group.userData.restNeckPose = getNeckPose(group, 0, headPivot.position.clone(), 0);
  group.userData.restNeckGeometry = createCurvedNeckGeometry(
    group.userData.restNeckPose.root,
    group.userData.restNeckPose.lowerControl,
    group.userData.restNeckPose.upperControl,
    group.userData.restNeckPose.headAnchor
  );

  group.add(upperBody, leftLeg, rightLeg, leftFoot, rightFoot);
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return group;
}

function createPiano() {
  const piano = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#9b642d', roughness: 0.72 });
  const darkWood = new THREE.MeshStandardMaterial({ color: '#593615', roughness: 0.8 });
  const white = new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.45 });
  const black = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.55 });

  const keyMeshes = [];
  const whiteWidth = 0.28;
  const whiteKeyCount = PIANO_NOTES.filter((note) => !note.includes('b')).length;
  const keyRangeWidth = whiteKeyCount * whiteWidth;
  const pianoWidth = keyRangeWidth + 0.28;
  const startX = -keyRangeWidth / 2 + whiteWidth / 2;
  const pianoLift = 0.17;

  const grandBody = createClosedGrandBody(pianoWidth + 0.22, 1.7, wood, darkWood);
  grandBody.position.set(0, 1.22 + pianoLift, -0.7);
  const keyBed = mesh(new THREE.BoxGeometry(pianoWidth + 0.16, 0.32, 1.06), darkWood, [0, 0.69 + pianoLift, 0.215]);
  const sideWallHeight = 0.36;
  const sideWallY = 0.98 + pianoLift;
  const sideWallX = keyRangeWidth / 2 + 0.09;
  const leftKeyWall = mesh(new THREE.BoxGeometry(0.12, sideWallHeight, 0.86), wood, [-sideWallX, sideWallY, 0.3]);
  const rightKeyWall = mesh(new THREE.BoxGeometry(0.12, sideWallHeight, 1.0), wood, [sideWallX, sideWallY, 0.23]);
  const legX = pianoWidth / 2 - 0.18;
  const frontZ = 0.62;
  const rearLegX = -pianoWidth * 0.28;
  const rearLegZ = -1.45;
  const legHeight = 0.88 + pianoLift;
  const legY = 0.385 + pianoLift / 2;
  const legs = [
    mesh(new THREE.BoxGeometry(0.14, legHeight, 0.14), darkWood, [-legX, legY, frontZ]),
    mesh(new THREE.BoxGeometry(0.14, legHeight, 0.14), darkWood, [legX, legY, frontZ]),
    mesh(new THREE.BoxGeometry(0.14, legHeight, 0.14), darkWood, [rearLegX, legY, rearLegZ])
  ];
  piano.add(grandBody, keyBed, leftKeyWall, rightKeyWall, ...legs);

  const notePositions = PIANO_NOTES.map((note, noteIndex) => {
    const whiteBefore = PIANO_NOTES.slice(0, noteIndex).filter((item) => !item.includes('b')).length;
    return {
      note,
      noteIndex,
      isBlack: note.includes('b'),
      x: startX + (note.includes('b') ? whiteBefore - 0.5 : whiteBefore) * whiteWidth
    };
  });

  notePositions
    .filter(({ isBlack }) => !isBlack)
    .forEach(({ note, noteIndex, x }) => {
      const key = mesh(new THREE.BoxGeometry(whiteWidth * 0.92, 0.13, 0.78), white, [x, 0.92 + pianoLift, 0.3]);
      key.userData = { note, noteIndex, baseY: 0.92 + pianoLift, height: 0.13, depth: 0.78 };
      piano.add(key);
      keyMeshes[noteIndex] = key;
    });

  notePositions
    .filter(({ isBlack }) => isBlack)
    .forEach(({ note, noteIndex, x }) => {
      const key = mesh(new THREE.BoxGeometry(whiteWidth * 0.58, 0.16, 0.48), black, [x, 1.04 + pianoLift, 0.12]);
      key.userData = { note, noteIndex, baseY: 1.04 + pianoLift, height: 0.16, depth: 0.48 };
      piano.add(key);
      keyMeshes[noteIndex] = key;
    });

  piano.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return { piano, keyMeshes };
}




function createCurvedNeckMesh(material) {
  return new THREE.Mesh(
    createCurvedNeckGeometry(
      new THREE.Vector3(0.52, 1.3, 0),
      new THREE.Vector3(0.6, 1.78, 0),
      new THREE.Vector3(0.74, 2.08, 0),
      new THREE.Vector3(0.77, 2.35, 0)
    ),
    material
  );
}

function createCurvedNeckGeometry(root, lowerControl, upperControl, headAnchor) {
  const curve = new THREE.CubicBezierCurve3(root, lowerControl, upperControl, headAnchor);
  return new THREE.TubeGeometry(curve, 20, 0.2, 10, false);
}

function createTrapezoidFootGeometry(length, height, heelWidth, toeWidth) {
  const heelX = -length / 2;
  const toeX = length / 2;
  const bottomY = -height / 2;
  const topY = height / 2;
  const heelZ = heelWidth / 2;
  const toeZ = toeWidth / 2;
  const vertices = new Float32Array([
    heelX, bottomY, -heelZ,
    heelX, bottomY, heelZ,
    toeX, bottomY, -toeZ,
    toeX, bottomY, toeZ,
    heelX, topY, -heelZ,
    heelX, topY, heelZ,
    toeX, topY, -toeZ,
    toeX, topY, toeZ
  ]);
  const indices = [
    0, 2, 1, 1, 2, 3,
    4, 5, 6, 5, 7, 6,
    0, 1, 4, 1, 5, 4,
    2, 6, 3, 3, 6, 7,
    0, 4, 2, 2, 4, 6,
    1, 3, 5, 3, 7, 5
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createClosedGrandBody(width, depth, woodMaterial, rimMaterial) {
  const group = new THREE.Group();
  const halfWidth = width / 2;
  const keyboardZ = depth * 0.34;
  const backZ = -depth * 0.66;
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, keyboardZ);
  shape.lineTo(halfWidth * 0.78, keyboardZ);
  shape.bezierCurveTo(halfWidth * 1.02, keyboardZ * 0.96, halfWidth * 1.02, keyboardZ * 0.46, halfWidth * 0.78, keyboardZ * 0.22);
  shape.bezierCurveTo(halfWidth * 0.48, -depth * 0.08, halfWidth * 0.18, -depth * 0.16, halfWidth * 0.08, -depth * 0.36);
  shape.bezierCurveTo(-halfWidth * 0.02, -depth * 0.72, -halfWidth * 0.48, backZ, -halfWidth * 0.78, backZ * 0.94);
  shape.bezierCurveTo(-halfWidth * 1.02, backZ * 0.88, -halfWidth, backZ * 0.52, -halfWidth, backZ * 0.28);
  shape.lineTo(-halfWidth, keyboardZ);

  const topCap = createGrandBodyLayer(shape, 0.05, rimMaterial, 0.28, 0.018, 0.018);
  const body = createGrandBodyLayer(shape, 0.12, woodMaterial, 0.23, 0.025, 0.025);
  const lowerBase = createGrandBodyLayer(shape, 0.8, rimMaterial, 0.11, 0.025, 0.025);

  group.add(lowerBase, body, topCap);
  return group;
}

function createGrandBodyLayer(shape, layerDepth, material, y, bevelThickness, bevelSize) {
  const layer = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: layerDepth,
      bevelEnabled: true,
      bevelThickness,
      bevelSize,
      bevelSegments: 3
    }),
    material
  );
  layer.rotation.x = Math.PI / 2;
  layer.position.y = y;
  return layer;
}

function mesh(geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(...position);
  item.scale.set(...scale);
  item.rotation.set(...rotation);
  return item;
}

function getTouchableMeshes(group) {
  const meshes = [];
  group.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });
  return meshes;
}

function animateKey(key) {
  key.position.y = key.userData.baseY - 0.06;
  setTimeout(() => {
    key.position.y = key.userData.baseY;
  }, 95);
}

function getKeyTapPoint(key) {
  const height = key.userData.height ?? 0.13;
  const depth = key.userData.depth ?? 0.78;
  const localTapPoint = new THREE.Vector3(0, height / 2 + 0.015, depth / 2 - 0.06);
  return key.localToWorld(localTapPoint);
}

function getTapTargetPose(goose, keyWorldPosition) {
  const gooseLocalTarget = goose.worldToLocal(keyWorldPosition.clone());
  const sideOffset = clamp(gooseLocalTarget.z, -0.9, 0.9);
  const tapYaw = -sideOffset * 1.1;
  const tapBodyYaw = -sideOffset * 0.2;
  const contactBodyYaw = tapBodyYaw * Math.sin(clamp(0.5 + 0.18, 0, 1) * Math.PI);
  const desiredTipPosition = gooseLocalTarget
    .clone()
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), -contactBodyYaw);
  const headTarget = solveTapHeadTarget(goose, desiredTipPosition, tapYaw);

  return { headTarget, tapYaw, tapBodyYaw };
}

function setGooseTapTarget(goose, keyWorldPosition, noteIndex) {
  const { headTarget, tapYaw, tapBodyYaw } = getTapTargetPose(goose, keyWorldPosition);

  goose.userData.tapTarget = headTarget;
  goose.userData.tapYaw = tapYaw;
  goose.userData.tapBodyYaw = tapBodyYaw;
  goose.userData.tapNoteIndex = noteIndex;
  goose.userData.tapTime = 0;
}


function updateGooseWalk(goose, delta) {
  const keys = goose.userData.walkKeys;
  if (!keys) return;

  const move = new THREE.Vector3(
    (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0),
    0,
    (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0)
  );
  const isWalking = move.lengthSq() > 0;

  goose.userData.walkAmount = THREE.MathUtils.lerp(goose.userData.walkAmount || 0, isWalking ? 1 : 0, isWalking ? 0.35 : 0.16);
  if (isWalking) {
    move.normalize();
    const nextPosition = goose.position.clone().addScaledVector(move, delta * 1.25);
    goose.position.copy(constrainGoosePosition(nextPosition, goose.userData.keepOutBounds));
    goose.userData.walkPhase = (goose.userData.walkPhase || 0) + delta * 8.2;
  }

  updateGooseJump(goose, delta);
}

function constrainGoosePosition(position, bounds) {
  if (!bounds) return position;
  const radius = 0.72;
  const insideX = position.x > bounds.minX - radius && position.x < bounds.maxX + radius;
  const insideZ = position.z > bounds.minZ - radius && position.z < bounds.maxZ + radius;
  if (!insideX || !insideZ) return position;

  const leftDistance = Math.abs(position.x - (bounds.minX - radius));
  const rightDistance = Math.abs(position.x - (bounds.maxX + radius));
  const frontDistance = Math.abs(position.z - (bounds.maxZ + radius));
  const backDistance = Math.abs(position.z - (bounds.minZ - radius));
  const nearest = Math.min(leftDistance, rightDistance, frontDistance, backDistance);

  if (nearest === leftDistance) position.x = bounds.minX - radius;
  else if (nearest === rightDistance) position.x = bounds.maxX + radius;
  else if (nearest === frontDistance) position.z = bounds.maxZ + radius;
  else position.z = bounds.minZ - radius;

  return position;
}

function startGooseJump(goose) {
  if (goose.userData.isJumping) return;
  goose.userData.isJumping = true;
  goose.userData.jumpTime = 0;
}

function updateGooseJump(goose, delta) {
  if (!goose.userData.isJumping) {
    goose.userData.jumpAmount = THREE.MathUtils.lerp(goose.userData.jumpAmount || 0, 0, 0.28);
    return;
  }

  const duration = 0.72;
  goose.userData.jumpTime += delta;
  const progress = clamp(goose.userData.jumpTime / duration, 0, 1);
  goose.userData.jumpAmount = Math.sin(progress * Math.PI);

  if (progress >= 1) {
    goose.userData.isJumping = false;
    goose.userData.jumpTime = 0;
  }
}

function resetGooseHome(goose) {
  goose.position.copy(goose.userData.homePosition);
  goose.rotation.y = goose.userData.homeRotationY;
  goose.userData.upperBody.position.copy(goose.userData.upperBody.userData.basePosition);
  goose.userData.upperBody.rotation.y = 0;
  goose.userData.upperBody.rotation.z = 0;
  goose.userData.tapTime = 0;
  goose.userData.tapBodyYaw = 0;
  goose.userData.walkKeys.clear();
  goose.userData.walkAmount = 0;
  goose.userData.jumpAmount = 0;
  goose.userData.jumpTime = 0;
  goose.userData.isJumping = false;
}

function animateWalkingLegs(goose, walkAmount, walkPhase, jumpAmount, jumpProgress, bodyBob, bodyExtraLift) {
  const { leftLeg, rightLeg, leftFoot, rightFoot } = goose.userData.walkParts;
  const leftStep = Math.max(0, Math.sin(walkPhase)) * walkAmount;
  const rightStep = Math.max(0, -Math.sin(walkPhase)) * walkAmount;

  poseWalkingSide(goose, leftLeg, leftFoot, leftStep, -0.08, jumpAmount, jumpProgress, bodyBob, bodyExtraLift);
  poseWalkingSide(goose, rightLeg, rightFoot, rightStep, 0.08, jumpAmount, jumpProgress, bodyBob, bodyExtraLift);
}

function poseWalkingSide(goose, leg, foot, stepAmount, outwardTilt, jumpAmount, jumpProgress, bodyBob, bodyExtraLift) {
  leg.position.copy(leg.userData.basePosition);
  foot.position.copy(foot.userData.basePosition);
  leg.quaternion.copy(leg.userData.baseQuaternion);
  foot.quaternion.copy(foot.userData.baseQuaternion);
  leg.scale.copy(leg.userData.baseScale);
  foot.scale.copy(foot.userData.baseScale);

  const stride = stepAmount * 0.28;
  const lift = Math.sin(stepAmount * Math.PI) * 0.045;
  const jumpStride = jumpAmount * JUMP_FOOT_FORWARD_STRIDE;
  const footForwardAngle = jumpAmount * JUMP_FOOT_FORWARD_ANGLE;
  const footX = foot.userData.basePosition.x + Math.max(stride, jumpStride);
  const jumpHeight = jumpAmount * 0.58;
  const legBaseHalfHeight = leg.userData.basePosition.y - foot.userData.basePosition.y;
  const baseLegTopY = leg.userData.basePosition.y + legBaseHalfHeight;
  const footY = foot.userData.basePosition.y + jumpHeight * 0.58 + lift + bodyExtraLift;

  foot.position.x = footX;
  foot.position.y = footY;
  foot.rotation.z += outwardTilt * 0.8 * stepAmount + footForwardAngle;

  const footContactOffset = new THREE.Vector3(0, FOOT_CONTACT_HEIGHT, 0).applyQuaternion(foot.quaternion);
  const footContact = foot.position.clone().add(footContactOffset);
  const hipContact = getBodyLegContactPoint(goose, leg, baseLegTopY, bodyBob);
  const legVector = hipContact.clone().sub(footContact);
  const legLength = legVector.length();
  const baseLegLength = legBaseHalfHeight * 2;

  leg.position.copy(footContact).addScaledVector(legVector, 0.5);
  leg.scale.y = leg.userData.baseScale.y * (legLength / baseLegLength);
  leg.quaternion
    .setFromUnitVectors(new THREE.Vector3(0, 1, 0), legVector.normalize())
    .multiply(leg.userData.baseQuaternion);
}

function getBodyLegContactPoint(goose, leg, baseLegTopY, bodyBob) {
  const upperBody = goose.userData.upperBody;
  const localContact = new THREE.Vector3(
    leg.userData.basePosition.x,
    baseLegTopY + bodyBob,
    leg.userData.basePosition.z
  );

  localContact.applyEuler(upperBody.rotation);
  return localContact.add(upperBody.position);
}

function animateGoose(goose, time, delta) {
  const walkAmount = goose.userData.walkAmount || 0;
  const walkPhase = goose.userData.walkPhase || 0;
  const jumpAmount = goose.userData.jumpAmount || 0;
  const hasTap = Boolean(goose.userData.tapTarget);
  const jumpProgress = goose.userData.isJumping ? clamp(goose.userData.jumpTime / 0.72, 0, 1) : 0;
  const jumpHeight = jumpAmount * 0.58;
  const neckTakeoff = smoothstep(clamp(jumpProgress / 0.3, 0, 1)) * jumpHeight * 0.18;
  const neckComebackDelay = Math.sin(clamp((jumpProgress - 0.42) / 0.58, 0, 1) * Math.PI) * 0.08;
  const headLag = goose.userData.isJumping ? neckTakeoff + neckComebackDelay : 0;
  const bob = Math.sin(time * 1.8) * 0.035 + Math.abs(Math.sin(walkPhase)) * 0.09 * walkAmount + jumpHeight;
  const bodyForwardShift = jumpAmount * JUMP_BODY_FORWARD_SHIFT;
  const bodyExtraLift = jumpAmount * JUMP_BODY_EXTRA_LIFT;
  const tapProgress = hasTap ? clamp(goose.userData.tapTime / goose.userData.tapDuration, 0, 1) : 0;
  const tapStrength = hasTap ? getTapStrength(tapProgress) : 0;
  const bodyTurnStrength = hasTap ? getTapStrength(clamp(tapProgress + 0.14, 0, 1)) : 0;
  goose.userData.upperBody.position.copy(goose.userData.upperBody.userData.basePosition);
  goose.userData.upperBody.position.x += bodyForwardShift;
  goose.userData.upperBody.position.y += bodyExtraLift;
  goose.userData.upperBody.rotation.y = clamp(goose.userData.tapBodyYaw || 0, -0.22, 0.22) * bodyTurnStrength;
  goose.userData.upperBody.rotation.z = 0;
  const lookStrength = hasTap ? smoothstep(clamp(tapProgress / 0.18, 0, 1)) : 0;
  const headBase = goose.userData.headPivot.userData.basePosition.clone();
  headBase.x += Math.sin(walkPhase + Math.PI) * 0.07 * walkAmount;
  headBase.y += bob * 0.62 + Math.max(0, -Math.sin(walkPhase)) * 0.05 * walkAmount + headLag;
  headBase.x += jumpAmount * JUMP_NECK_CRANE_FORWARD;
  headBase.y -= jumpAmount * JUMP_NECK_CRANE_DOWN;
  const headTarget = goose.userData.tapTarget || headBase;
  const headPosition = headBase.lerp(headTarget, tapStrength);
  const yawAngle = clamp(goose.userData.tapYaw || 0, -0.82, 0.82) * lookStrength;
  const neckPose = getNeckPose(goose, bob, headPosition, tapStrength);
  const jumpHeadLevelStrength = hasTap ? 0 : smoothstep(jumpAmount) * JUMP_HEAD_LEVEL_STRENGTH;
  const headAxis = getHeadAxis(neckPose.tangent, tapStrength, jumpHeadLevelStrength);
  const headQuaternion = getHeadQuaternion(headAxis, yawAngle);

  goose.userData.bobParts.forEach((part) => {
    part.position.copy(part.userData.basePosition);
    part.position.y += bob;
  });

  goose.userData.headPivot.position.copy(headPosition);
  goose.userData.headPivot.quaternion.copy(headQuaternion).multiply(goose.userData.headPivot.userData.baseQuaternion);

  if (hasTap) useCachedTapNeckGeometry(goose, tapProgress);
  else useCachedJumpNeckGeometry(goose, jumpProgress, jumpAmount);
  animateWalkingLegs(goose, walkAmount, walkPhase, jumpAmount, jumpProgress, bob, bodyExtraLift);

  if (hasTap) goose.userData.tapTime += delta;
  if (hasTap && goose.userData.tapTime >= goose.userData.tapDuration) {
    goose.userData.tapTarget = null;
    goose.userData.tapTime = 0;
    goose.userData.tapYaw = 0;
    goose.userData.tapBodyYaw = 0;
    goose.userData.tapNoteIndex = null;
    goose.userData.upperBody.rotation.y = 0;
  }
}

function solveTapHeadTarget(goose, desiredTipPosition, yawAngle) {
  let headPosition = desiredTipPosition.clone().sub(goose.userData.beakTipOffset);
  headPosition.x = clamp(headPosition.x, 0.82, 2.16);
  headPosition.y = clamp(headPosition.y + 0.02, 1.14, 2.18);
  headPosition.z = clamp(headPosition.z, -0.82, 0.82);

  for (let i = 0; i < 5; i += 1) {
    const neckPose = getNeckPose(goose, 0, headPosition, 1);
    const headAxis = getHeadAxis(neckPose.tangent, 1);
    const headQuaternion = getHeadQuaternion(headAxis, yawAngle).multiply(goose.userData.headPivot.userData.baseQuaternion);
    const actualTipPosition = headPosition.clone().add(
      goose.userData.beakTipOffset.clone().applyQuaternion(headQuaternion)
    );
    headPosition.add(desiredTipPosition.clone().sub(actualTipPosition));
    headPosition.x = clamp(headPosition.x, 0.82, 2.16);
    headPosition.y = clamp(headPosition.y, 1.14, 2.18);
    headPosition.z = clamp(headPosition.z, -0.82, 0.82);
  }

  return headPosition;
}

function getTapStrength(progress) {
  const amount = clamp(progress, 0, 1);
  if (amount < TAP_HOLD_START) return smoothstep(amount / TAP_HOLD_START);
  if (amount < TAP_HOLD_END) return 1;
  return 1 - smoothstep((amount - TAP_HOLD_END) / (1 - TAP_HOLD_END));
}

function getNeckPose(goose, bob, headPosition, bendOverride = null) {
  const root = goose.userData.neckRoot.clone();
  const bendAmount = bendOverride ?? 0;
  root.y += bob;

  const headAnchor = headPosition.clone().add(HEAD_NECK_ANCHOR_OFFSET);
  const lowerControl = root.clone().lerp(headAnchor, 0.12);
  lowerControl.x = THREE.MathUtils.lerp(lowerControl.x, root.x + 0.02, bendAmount * 0.65);
  lowerControl.y += 0.24 + 0.02 * bendAmount;
  lowerControl.z = THREE.MathUtils.lerp(lowerControl.z, headAnchor.z * 0.04, bendAmount * 0.75);

  const upperControl = root.clone().lerp(headAnchor, 0.82);
  upperControl.x -= 0.22 * bendAmount;
  upperControl.y += 0.34 * bendAmount;
  upperControl.z = THREE.MathUtils.lerp(upperControl.z, headAnchor.z * 0.9, bendAmount * 0.9);

  const curve = new THREE.CubicBezierCurve3(root, lowerControl, upperControl, headAnchor);
  const tangent = curve.getTangent(1).normalize();
  return { root, lowerControl, upperControl, headAnchor, tangent };
}

function getHeadAxis(neckTangent, tapStrength, jumpLevelStrength = 0) {
  return neckTangent
    .clone()
    .lerp(new THREE.Vector3(-0.18, 1, 0), 0.22 * tapStrength)
    .lerp(new THREE.Vector3(0, 1, 0), jumpLevelStrength)
    .normalize();
}

function getHeadQuaternion(headAxis, yawAngle) {
  const neckQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), headAxis);
  const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawAngle);
  return neckQuaternion.multiply(yawQuaternion);
}

function smoothstep(value) {
  const amount = clamp(value, 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function createNeckGeometryCache(goose, keyMeshes) {
  const baseHeadPosition = goose.userData.headPivot.userData.basePosition.clone();

  return keyMeshes.map((key) => {
    if (!key) return [];

    const keyPosition = getKeyTapPoint(key);
    const { headTarget } = getTapTargetPose(goose, keyPosition);

    return Array.from({ length: NECK_CACHE_STEPS }, (_, step) => {
      const progress = step / (NECK_CACHE_STEPS - 1);
      const tapStrength = getTapStrength(progress);
      const headPosition = baseHeadPosition.clone().lerp(headTarget, tapStrength);
      const neckPose = getNeckPose(goose, 0, headPosition, tapStrength);
      return createCurvedNeckGeometry(neckPose.root, neckPose.lowerControl, neckPose.upperControl, neckPose.headAnchor);
    });
  });
}

function createJumpNeckGeometryCache(goose) {
  return Array.from({ length: JUMP_NECK_CACHE_STEPS }, (_, step) => {
    const progress = step / (JUMP_NECK_CACHE_STEPS - 1);
    const jumpAmount = Math.sin(progress * Math.PI);
    const neckPose = getJumpNeckPose(goose, progress, jumpAmount);
    return createCurvedNeckGeometry(neckPose.root, neckPose.lowerControl, neckPose.upperControl, neckPose.headAnchor);
  });
}

function getJumpNeckPose(goose, jumpProgress, jumpAmount) {
  if (jumpAmount < 0.01) return goose.userData.restNeckPose;

  const jumpHeight = jumpAmount * 0.58;
  const neckTakeoff = smoothstep(clamp(jumpProgress / 0.3, 0, 1)) * jumpHeight * 0.18;
  const neckComebackDelay = Math.sin(clamp((jumpProgress - 0.42) / 0.58, 0, 1) * Math.PI) * 0.08;
  const headBase = goose.userData.headPivot.userData.basePosition.clone();
  const bob = jumpHeight;

  headBase.y += bob * 0.62 + neckTakeoff + neckComebackDelay;
  headBase.x += jumpAmount * JUMP_NECK_CRANE_FORWARD;
  headBase.y -= jumpAmount * JUMP_NECK_CRANE_DOWN;

  return getNeckPose(goose, bob, headBase, 0);
}

function useCachedTapNeckGeometry(goose, tapProgress) {
  const noteCache = goose.userData.neckGeometryCache?.[goose.userData.tapNoteIndex];
  if (!noteCache?.length) return;

  const frameIndex = Math.min(noteCache.length - 1, Math.round(clamp(tapProgress, 0, 1) * (noteCache.length - 1)));
  useNeckGeometry(goose, noteCache[frameIndex]);
}

function useCachedJumpNeckGeometry(goose, jumpProgress, jumpAmount) {
  if (jumpAmount < 0.01) {
    useNeckGeometry(goose, goose.userData.restNeckGeometry);
    return;
  }

  const cache = goose.userData.jumpNeckGeometryCache;
  if (!cache?.length) return;

  const frameIndex = Math.min(cache.length - 1, Math.round(clamp(jumpProgress, 0, 1) * (cache.length - 1)));
  useNeckGeometry(goose, cache[frameIndex]);
}

function useNeckGeometry(goose, geometry) {
  if (!geometry || goose.userData.neck.geometry === geometry) return;
  goose.userData.neck.geometry = geometry;
}

/*
function updateNeckPose(goose, neckPose) {
  const neck = goose.userData.neck;
  const nextGeometry = createCurvedNeckGeometry(neckPose.root, neckPose.lowerControl, neckPose.upperControl, neckPose.headAnchor);
  neck.geometry.dispose();
  neck.geometry = nextGeometry;
}
*/

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function addColorCloud(scene, particles, particleQuality, note, origin) {
  while (particles.length >= particleQuality.maxClouds) {
    disposeParticleCloud(scene, particles.shift());
  }

  const cloud = new THREE.Group();
  const color = note === 'D' ? '#d7e3e8' : NOTE_COLORS[note] || '#c8dce3';
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: note === 'D' ? 0.26 : 0.38,
    depthWrite: false
  });

  for (let i = 0; i < 5; i += 1) {
    const radius = 0.52 + Math.random() * 0.28;
    const puff = new THREE.Mesh(particleQuality.geometry, material.clone());
    puff.position.set(
      (Math.random() - 0.5) * 0.7,
      (Math.random() - 0.5) * 0.28,
      (Math.random() - 0.5) * 0.45
    );
    puff.scale.set(
      radius * (1.1 + Math.random() * 0.7),
      radius * (0.75 + Math.random() * 0.45),
      radius * (0.55 + Math.random() * 0.5)
    );
    cloud.add(puff);
  }

  cloud.position.copy(origin);
  cloud.position.y += 1.35;
  cloud.position.z -= 0.9;
  cloud.userData.velocity = new THREE.Vector3(
    (Math.random() - 0.5) * 0.48,
    0.6 + Math.random() * 0.36,
    (Math.random() - 0.5) * 0.36
  );
  cloud.userData.spin = new THREE.Vector3(0, (Math.random() - 0.5) * 0.24, (Math.random() - 0.5) * 0.24);
  cloud.userData.age = 0;
  cloud.userData.ttl = COLOR_CLOUD_TTL;
  cloud.userData.growth = 0.72;
  scene.add(cloud);
  particles.push(cloud);
}

function updateParticles(scene, particles, delta) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.userData.age += delta;
    const life = 1 - clamp(particle.userData.age / particle.userData.ttl, 0, 1);
    particle.position.addScaledVector(particle.userData.velocity, delta);
    particle.rotation.x += particle.userData.spin.x * delta;
    particle.rotation.y += particle.userData.spin.y * delta;
    particle.rotation.z += particle.userData.spin.z * delta;
    particle.traverse((child) => {
      if (child.material) {
        const baseOpacity = child.userData.baseOpacity ?? child.material.opacity;
        child.userData.baseOpacity = baseOpacity;
        child.material.opacity = Math.max(0, life * baseOpacity);
      }
    });
    particle.scale.addScalar((particle.userData.growth ?? 0.36) * delta);

    if (life <= 0) {
      disposeParticleCloud(scene, particle);
      particles.splice(i, 1);
    }
  }
}

function disposeParticleCloud(scene, particle) {
  if (!particle) return;
  scene.remove(particle);
  particle.traverse((child) => {
    if (!child.isMesh) return;
    child.material.dispose();
  });
}
