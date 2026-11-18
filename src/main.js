// Arranque del juego: renderer, física, mundo, elección de auto y bucle principal.
import * as THREE from 'three';
import { CARS, PHYSICS } from './config.js';
import { createPhysics } from './core/physics.js';
import { readDriving, justPressed, clearPressed } from './core/input.js';
import { createSky } from './world/sky.js';
import { buildTestTrack, SPAWN } from './world/testTrack.js';
import { Vehicle, yawOf } from './modes/driving/vehicle.js';
import { createCarModel } from './modes/driving/carModel.js';
import { ChaseCamera } from './modes/driving/camera.js';
import { createHud, createCarSelect } from './modes/driving/hud.js';

// ---------- Render ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 6000);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const sky = createSky(scene, renderer);

// ---------- Física y mundo ----------
const physics = await createPhysics();
const world = buildTestTrack(physics, scene);

// ---------- Auto ----------
const LAST_CAR_KEY = 'sport-games:auto';
let carId = loadLastCar();
let vehicle = null;
let model = null;
const prev = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
const curr = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };

function spawnCar(id, at = SPAWN) {
  if (vehicle) {
    scene.remove(model.group);
    model.dispose();
    vehicle.dispose();
  }
  carId = id;
  vehicle = new Vehicle(physics, CARS[id], at);
  model = createCarModel(id, CARS[id], vehicle);
  scene.add(model.group);
  storeTransform(curr);
  prev.pos.copy(curr.pos);
  prev.quat.copy(curr.quat);
  chase.snap();
}

function storeTransform(target) {
  const t = vehicle.body.translation();
  const r = vehicle.body.rotation();
  target.pos.set(t.x, t.y, t.z);
  target.quat.set(r.x, r.y, r.z, r.w);
}

function loadLastCar() {
  try {
    const id = localStorage.getItem(LAST_CAR_KEY);
    if (id && CARS[id]) return id;
  } catch {}
  return 'f1';
}
function saveLastCar(id) {
  try {
    localStorage.setItem(LAST_CAR_KEY, id);
  } catch {}
}

// ---------- Cámara, HUD, menú ----------
const chase = new ChaseCamera(camera);
const hud = createHud();
let state = 'menu';

const select = createCarSelect({
  onHighlight(id) {
    if (id !== carId || !vehicle) spawnCar(id);
  },
  onChoose(id) {
    if (id !== carId) spawnCar(id);
    saveLastCar(id);
    select.close();
    hud.show(true);
    state = 'driving';
    chase.snap();
    clearPressed();
  },
});

function openMenu() {
  state = 'menu';
  hud.show(false);
  spawnCar(carId);
  select.open(carId);
}

document.getElementById('loading').hidden = true;
openMenu();

// ---------- Bucle principal ----------
const STEP = 1 / PHYSICS.STEP_HZ;
let acc = 0;
let last = performance.now();
let time = 0;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  time += dt;

  handleKeys();

  const input = state === 'driving' ? readDriving() : { throttle: 0, brake: 0, steer: 0, handbrake: true };
  acc += dt;
  while (acc >= STEP) {
    prev.pos.copy(curr.pos);
    prev.quat.copy(curr.quat);
    vehicle.update(input, STEP);
    physics.step();
    storeTransform(curr);
    acc -= STEP;
  }

  // Interpolar entre los dos últimos pasos de física: movimiento suave en pantallas de 120 Hz
  const alpha = acc / STEP;
  model.group.position.lerpVectors(prev.pos, curr.pos, alpha);
  model.group.quaternion.slerpQuaternions(prev.quat, curr.quat, alpha);
  model.group.updateMatrixWorld();
  model.update(dt);
  world.sync();

  if (state === 'driving') {
    chase.update(model.group, vehicle.kmh, dt);
    hud.update(vehicle, carId, chase.modeName, dt);
  } else {
    chase.orbit(model.group, time);
  }
  sky.follow(model.group.position);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function handleKeys() {
  if (state === 'menu') {
    if (justPressed('ArrowLeft', 'KeyA', 'Pad14')) select.move(-1);
    if (justPressed('ArrowRight', 'KeyD', 'Pad15')) select.move(1);
    if (justPressed('Enter', 'Space', 'Pad0')) select.choose();
    if (justPressed('Digit1')) select.pick(0);
    if (justPressed('Digit2')) select.pick(1);
    if (justPressed('Digit3')) select.pick(2);
    return;
  }
  if (justPressed('Escape', 'Pad9')) return openMenu();
  if (justPressed('KeyR', 'Pad3')) {
    vehicle.reset();
    storeTransform(curr);
    prev.pos.copy(curr.pos);
    prev.quat.copy(curr.quat);
  }
  if (justPressed('KeyC', 'Pad2')) chase.nextMode();
  const ids = Object.keys(CARS);
  for (let i = 0; i < ids.length; i++) {
    if (justPressed(`Digit${i + 1}`) && ids[i] !== carId) {
      // cambiar de auto en el mismo lugar (para comparar)
      const t = vehicle.body.translation();
      spawnCar(ids[i], { x: t.x, y: t.y + 0.5, z: t.z, yaw: yawOf(vehicle.body.rotation()) });
      saveLastCar(ids[i]);
    }
  }
}

requestAnimationFrame(frame);

// Para depurar desde la consola del navegador
window.__game = { get vehicle() { return vehicle; }, physics, scene, camera, renderer };
