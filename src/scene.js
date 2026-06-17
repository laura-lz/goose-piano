import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { playNote, preloadNotes } from './audio.js';

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

export function createGoosePianoScene(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050505');

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 3.3, 8.5);
  camera.lookAt(0, 1.2, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.2, -0.2);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4.5;
  controls.maxDistance = 12;
  controls.maxPolarAngle = Math.PI * 0.48;

  const label = document.createElement('div');
  label.className = 'scene-label';
  label.innerHTML = '<strong>goose piano sketch</strong>click the keys or use A through ;';
  container.appendChild(label);

  addLights(scene);
  addFloor(scene);

  const goose = createGoose();
  goose.position.set(-0.17, -0.02, 1.58);
  goose.rotation.y = Math.PI / 2;
  goose.userData.homePosition = goose.position.clone();
  goose.userData.homeRotationY = goose.rotation.y;
  goose.userData.walkKeys = new Set();
  scene.add(goose);

  const { piano, keyMeshes } = createPiano();
  piano.position.set(-0.2, 0, -0.9);
  scene.add(piano);

  preloadNotes();

  const particles = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function triggerNote(noteIndex) {
    const key = keyMeshes[noteIndex];
    const note = PIANO_NOTES[noteIndex];
    if (!key || !note) return;

    const octaveOffset = noteIndex >= 12 ? 1 : 0;
    const keyPosition = key.getWorldPosition(new THREE.Vector3());
    playNote(note, octaveOffset);
    animateKey(key);
    addColorCloud(scene, particles, note, keyPosition);
    resetGooseHome(goose);
    setGooseTapTarget(goose, keyPosition);
  }

  window.addEventListener('pointerdown', (event) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(keyMeshes, false)[0];
    if (hit) triggerNote(hit.object.userData.noteIndex);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      goose.userData.walkKeys.add(event.key);
      return;
    }

    const index = KEYBOARD.indexOf(event.key.toLowerCase());
    if (index !== -1) triggerNote(index);
  });

  window.addEventListener('keyup', (event) => {
    if (event.key.startsWith('Arrow')) {
      goose.userData.walkKeys.delete(event.key);
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const delta = clock.getDelta();
    const time = clock.elapsedTime;
    updateGooseWalk(goose, delta);
    animateGoose(goose, time);
    updateParticles(scene, particles);
    controls.update();
    renderer.render(scene, camera);
  });
}

function addLights(scene) {
  scene.add(new THREE.HemisphereLight('#f8fbff', '#dfe8de', 2.2));

  const key = new THREE.DirectionalLight('#ffffff', 2.7);
  key.position.set(3.5, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  scene.add(key);

  const fill = new THREE.DirectionalLight('#cde7ed', 0.9);
  fill.position.set(-4, 3, 2);
  scene.add(fill);
}

function addFloor(scene) {
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(4.4, 80),
    new THREE.MeshStandardMaterial({ color: '#080808', roughness: 0.75 })
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
  const tail = mesh(new THREE.ConeGeometry(0.32, 0.55, 6), white, [-1.2, 1.04, 0], [1, 1, 1], [0, 0, Math.PI / 2]);
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

  const bobParts = [body, belly, tail];
  const walkParts = [leftLeg, rightLeg, leftFoot, rightFoot];
  [...bobParts, headPivot, neck, ...walkParts].forEach((part) => {
    part.userData.basePosition = part.position.clone();
    part.userData.baseQuaternion = part.quaternion.clone();
  });
  group.userData.bobParts = bobParts;
  group.userData.walkParts = { leftLeg, rightLeg, leftFoot, rightFoot };
  group.userData.walkPhase = 0;
  group.userData.walkAmount = 0;
  group.userData.headPivot = headPivot;
  group.userData.beakOffset = beak.position.clone();
  group.userData.neck = neck;
  group.userData.neckRoot = new THREE.Vector3(0.55, 1.34, 0);
  group.userData.neckControl = new THREE.Vector3(0.76, 1.98, 0);
  group.userData.tapAmount = 0;
  group.userData.tapTarget = null;
  group.userData.tapYaw = 0;

  group.add(body, belly, tail, neck, headPivot, leftLeg, rightLeg, leftFoot, rightFoot);
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

  const grandBody = createClosedGrandBody(pianoWidth + 0.22, 1.7, wood, darkWood);
  grandBody.position.set(0, 1.22, -0.7);
  const keyBed = mesh(new THREE.BoxGeometry(pianoWidth + 0.16, 0.32, 1.06), darkWood, [0, 0.69, 0.215]);
  const sideWallHeight = 0.36;
  const sideWallY = 0.98;
  const sideWallX = keyRangeWidth / 2 + 0.09;
  const leftKeyWall = mesh(new THREE.BoxGeometry(0.12, sideWallHeight, 0.86), wood, [-sideWallX, sideWallY, 0.3]);
  const rightKeyWall = mesh(new THREE.BoxGeometry(0.12, sideWallHeight, 1.0), wood, [sideWallX, sideWallY, 0.23]);
  const legX = pianoWidth / 2 - 0.18;
  const frontZ = 0.62;
  const rearLegX = -pianoWidth * 0.28;
  const rearLegZ = -1.45;
  const legs = [
    mesh(new THREE.BoxGeometry(0.14, 0.88, 0.14), darkWood, [-legX, 0.385, frontZ]),
    mesh(new THREE.BoxGeometry(0.14, 0.88, 0.14), darkWood, [legX, 0.385, frontZ]),
    mesh(new THREE.BoxGeometry(0.14, 0.88, 0.14), darkWood, [rearLegX, 0.385, rearLegZ])
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
      const key = mesh(new THREE.BoxGeometry(whiteWidth * 0.92, 0.13, 0.78), white, [x, 0.92, 0.3]);
      key.userData = { note, noteIndex, baseY: 0.92 };
      piano.add(key);
      keyMeshes[noteIndex] = key;
    });

  notePositions
    .filter(({ isBlack }) => isBlack)
    .forEach(({ note, noteIndex, x }) => {
      const key = mesh(new THREE.BoxGeometry(whiteWidth * 0.58, 0.16, 0.48), black, [x, 1.04, 0.12]);
      key.userData = { note, noteIndex, baseY: 1.04 };
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
      new THREE.Vector3(0.55, 1.34, 0),
      new THREE.Vector3(0.76, 1.98, 0),
      new THREE.Vector3(0.77, 2.35, 0)
    ),
    material
  );
}

function createCurvedNeckGeometry(root, control, headAnchor) {
  const curve = new THREE.QuadraticBezierCurve3(root, getCurvedNeckControl(root, control, headAnchor), headAnchor);
  return new THREE.TubeGeometry(curve, 32, 0.2, 16, false);
}

function getCurvedNeckControl(root, control, headAnchor) {
  const restHeadAnchor = new THREE.Vector3(0.77, 2.35, 0);
  const bendStrength = clamp(headAnchor.distanceTo(restHeadAnchor) / 0.9, 0, 1);
  const controlPoint = root.clone().lerp(headAnchor, 0.88);

  controlPoint.lerp(control, 0.14 * (1 - bendStrength));
  controlPoint.x -= 0.42 * bendStrength;
  controlPoint.y -= 0.28 * bendStrength;
  controlPoint.z = THREE.MathUtils.lerp(controlPoint.z, headAnchor.z, 0.65 * bendStrength);

  return controlPoint;
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

function animateKey(key) {
  key.position.y = key.userData.baseY - 0.06;
  setTimeout(() => {
    key.position.y = key.userData.baseY;
  }, 95);
}

function setGooseTapTarget(goose, keyWorldPosition) {
  const target = goose.worldToLocal(keyWorldPosition.clone());
  const sideOffset = clamp(target.z, -0.9, 0.9);
  const beakOffset = goose.userData.beakOffset;
  const headTarget = target.sub(beakOffset);
  headTarget.x = clamp(headTarget.x, 1.05, 1.95);
  headTarget.y = clamp(headTarget.y + 0.18, 1.48, 2.1);
  headTarget.z = clamp(headTarget.z, -0.72, 0.72);

  goose.userData.tapTarget = headTarget;
  goose.userData.tapYaw = -sideOffset * 1.15;
  goose.userData.tapAmount = 1;
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
    goose.position.addScaledVector(move, delta * 1.25);
    goose.userData.walkPhase = (goose.userData.walkPhase || 0) + delta * 8.2;
  }
}

function resetGooseHome(goose) {
  goose.position.copy(goose.userData.homePosition);
  goose.rotation.y = goose.userData.homeRotationY;
  goose.userData.walkKeys.clear();
  goose.userData.walkAmount = 0;
}

function animateWalkingLegs(goose, walkAmount, walkPhase) {
  const { leftLeg, rightLeg, leftFoot, rightFoot } = goose.userData.walkParts;
  const leftStep = Math.max(0, Math.sin(walkPhase)) * walkAmount;
  const rightStep = Math.max(0, -Math.sin(walkPhase)) * walkAmount;

  poseWalkingSide(leftLeg, leftFoot, leftStep, -0.08);
  poseWalkingSide(rightLeg, rightFoot, rightStep, 0.08);
}

function poseWalkingSide(leg, foot, stepAmount, outwardTilt) {
  leg.position.copy(leg.userData.basePosition);
  foot.position.copy(foot.userData.basePosition);
  leg.quaternion.copy(leg.userData.baseQuaternion);
  foot.quaternion.copy(foot.userData.baseQuaternion);

  const stride = stepAmount * 0.28;
  const lift = Math.sin(stepAmount * Math.PI) * 0.045;
  foot.position.x += stride;
  foot.position.y += lift;
  leg.position.x = foot.position.x;
  leg.position.z = foot.position.z;
  leg.rotation.z += outwardTilt * stepAmount;
  foot.rotation.z += outwardTilt * 0.8 * stepAmount;
}

function animateGoose(goose, time) {
  const walkAmount = goose.userData.walkAmount || 0;
  const walkPhase = goose.userData.walkPhase || 0;
  const bob = Math.sin(time * 1.8) * 0.035 + Math.abs(Math.sin(walkPhase)) * 0.09 * walkAmount;
  const tapProgress = 1 - goose.userData.tapAmount;
  const tapStrength = goose.userData.tapTarget ? Math.sin(clamp(tapProgress, 0, 1) * Math.PI) : 0;
  const lookProgress = clamp(tapProgress + 0.34, 0, 1);
  const lookStrength = goose.userData.tapTarget ? Math.min(1, lookProgress / 0.18) * (1 - Math.pow(lookProgress, 3) * 0.28) : 0;
  const headBase = goose.userData.headPivot.userData.basePosition.clone();
  headBase.x += Math.sin(walkPhase + Math.PI) * 0.07 * walkAmount;
  headBase.y += bob * 0.5 + Math.max(0, -Math.sin(walkPhase)) * 0.05 * walkAmount;
  const headTarget = goose.userData.tapTarget || headBase;
  const headPosition = headBase.lerp(headTarget, tapStrength);
  const yawAngle = clamp(goose.userData.tapYaw || 0, -0.82, 0.82) * lookStrength;
  const neckPose = getNeckPose(goose, bob, headPosition);
  const headAxis = neckPose.tangent;
  const neckQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), headAxis);
  const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawAngle);
  const headQuaternion = neckQuaternion.multiply(yawQuaternion);

  goose.userData.bobParts.forEach((part) => {
    part.position.copy(part.userData.basePosition);
    part.position.y += bob;
  });

  goose.userData.headPivot.position.copy(headPosition);
  goose.userData.headPivot.quaternion.copy(headQuaternion).multiply(goose.userData.headPivot.userData.baseQuaternion);

  updateNeckPose(goose, neckPose);
  animateWalkingLegs(goose, walkAmount, walkPhase);

  goose.userData.tapAmount = Math.max(0, goose.userData.tapAmount - 0.045);
  if (goose.userData.tapAmount === 0) {
    goose.userData.tapTarget = null;
    goose.userData.tapYaw = 0;
  }
}

function getNeckPose(goose, bob, headPosition) {
  const root = goose.userData.neckRoot.clone();
  const control = goose.userData.neckControl.clone();
  const tapProgress = 1 - goose.userData.tapAmount;
  const bendAmount = goose.userData.tapTarget ? Math.sin(clamp(tapProgress, 0, 1) * Math.PI) : 0;
  root.y += bob * 0.75;
  control.y += bob * 0.6;

  const headAnchor = headPosition.clone().add(new THREE.Vector3(-0.16, -0.2, 0));
  control.x += (headAnchor.x - control.x) * 0.04 * bendAmount;
  control.y -= 0.03 * bendAmount;
  control.z += (headAnchor.z - control.z) * 0.06 * bendAmount;

  const neckControl = getCurvedNeckControl(root, control, headAnchor);
  const tangent = headAnchor.clone().sub(neckControl).normalize();
  return { root, control, headAnchor, tangent };
}

function updateNeckPose(goose, neckPose) {
  const neck = goose.userData.neck;
  const nextGeometry = createCurvedNeckGeometry(neckPose.root, neckPose.control, neckPose.headAnchor);
  neck.geometry.dispose();
  neck.geometry = nextGeometry;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function addColorCloud(scene, particles, note, origin) {
  const cloud = new THREE.Group();
  const color = NOTE_COLORS[note] || '#c8dce3';
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: note === 'D' ? 0.16 : 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  for (let i = 0; i < 5; i += 1) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.52 + Math.random() * 0.28, 24, 16), material.clone());
    puff.position.set(
      (Math.random() - 0.5) * 0.7,
      (Math.random() - 0.5) * 0.28,
      (Math.random() - 0.5) * 0.45
    );
    puff.scale.set(
      1.1 + Math.random() * 0.7,
      0.75 + Math.random() * 0.45,
      0.55 + Math.random() * 0.5
    );
    cloud.add(puff);
  }

  cloud.position.copy(origin);
  cloud.position.y += 1.35;
  cloud.position.z -= 0.9;
  cloud.userData.velocity = new THREE.Vector3(
    (Math.random() - 0.5) * 0.008,
    0.01 + Math.random() * 0.006,
    (Math.random() - 0.5) * 0.006
  );
  cloud.userData.spin = new THREE.Vector3(0, (Math.random() - 0.5) * 0.004, (Math.random() - 0.5) * 0.004);
  cloud.userData.life = 1;
  cloud.userData.lifeDecay = 0.016;
  cloud.userData.growth = 1.012;
  scene.add(cloud);
  particles.push(cloud);
}

function updateParticles(scene, particles) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.position.add(particle.userData.velocity);
    particle.rotation.x += particle.userData.spin.x;
    particle.rotation.y += particle.userData.spin.y;
    particle.rotation.z += particle.userData.spin.z;
    particle.userData.life -= particle.userData.lifeDecay ?? 0.014;
    particle.traverse((child) => {
      if (child.material) {
        const baseOpacity = child.userData.baseOpacity ?? child.material.opacity;
        child.userData.baseOpacity = baseOpacity;
        child.material.opacity = Math.max(0, particle.userData.life * baseOpacity);
      }
    });
    particle.scale.multiplyScalar(particle.userData.growth ?? 1.006);

    if (particle.userData.life <= 0) {
      scene.remove(particle);
      particle.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry.dispose();
        child.material.dispose();
      });
      particles.splice(i, 1);
    }
  }
}
