// Arranque del juego: renderer, lugares (mundos), elección de auto y bucle principal.
import * as THREE from 'three';
import { CARS, PHYSICS, LIGHT, WALL } from './config.js';
import { createSparks } from './world/sparks.js';
import { createPhysics } from './core/physics.js';
import { readDriving, justPressed, clearPressed } from './core/input.js';
import { createSky } from './world/sky.js';
import { buildTestTrack, SPAWN } from './world/testTrack.js';
import { loadMonacoData, buildMonaco } from './world/monaco.js';
import { Vehicle, yawOf } from './modes/driving/vehicle.js';
import { createCarModel } from './modes/driving/carModel.js';
import { ChaseCamera } from './modes/driving/camera.js';
import { createHud, createCarSelect } from './modes/driving/hud.js';
import { loadCarAssets, carAsset, physicsProfile } from './modes/driving/carAssets.js';
import { createShowroom } from './modes/driving/showroom.js';
import { createRace } from './modes/race/race.js';

// ---------- Render ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 20000);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Lugares ----------
// Cada lugar tiene su propia escena y su propio mundo de física.
const PLACES = {
  monaco: { name: 'Mónaco – circuito' },
  pista: { name: 'Pista de pruebas' },
};
const worlds = {};

async function getWorld(name) {
  if (worlds[name]) return worlds[name];
  const physics = await createPhysics();
  const scene = new THREE.Scene();
  let w;
  if (name === 'pista') {
    const sky = createSky(scene, renderer, lightOpts(LIGHT.pista));
    const builder = buildTestTrack(physics, scene);
    w = { physics, scene, sky, builder, spawn: SPAWN, update() {} };
  } else {
    // tarde sobre el Mediterráneo (el sol viene del suroeste, del lado del mar)
    const sky = createSky(scene, renderer, lightOpts(LIGHT.monaco));
    const data = await loadMonacoData();
    const m = await buildMonaco(physics, scene, data);
    w = { physics, scene, sky, builder: m.builder, spawn: m.spawn, spawnAt: m.spawnAt, track: m.track, update: m.update };
    w.race = createRace(m.track, 'monaco');
  }
  w.sparks = createSparks(scene);
  worlds[name] = w;
  return w;
}

function lightOpts(L) {
  return {
    elevation: L.ELEVATION, azimuth: L.AZIMUTH, sunColor: L.SUN_COLOR, sunIntensity: L.SUN,
    skyLight: L.SKY_LIGHT, exposure: L.EXPOSURE, fog: L.FOG,
  };
}

// ---------- Auto ----------
const LAST_CAR_KEY = 'sport-games:auto';
const LAST_PLACE_KEY = 'sport-games:lugar';
let carId = load(LAST_CAR_KEY, (v) => CARS[v], 'f1');
let placeId = load(LAST_PLACE_KEY, (v) => PLACES[v], 'monaco');
let world = null;
let vehicle = null;
let model = null;
const prev = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
const curr = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };

function removeCar() {
  if (!vehicle) return;
  world.scene.remove(model.group);
  model.dispose();
  vehicle.dispose();
  vehicle = null;
}

function spawnCar(id, at) {
  removeCar();
  carId = id;
  const profile = physicsProfile(id);
  vehicle = new Vehicle(world.physics, profile, at);
  model = createCarModel(id, profile, vehicle, carAsset(id));
  world.scene.add(model.group);
  syncTransforms();
  chase.snap();
}

function syncTransforms() {
  storeTransform(curr);
  prev.pos.copy(curr.pos);
  prev.quat.copy(curr.quat);
}

function storeTransform(target) {
  const t = vehicle.body.translation();
  const r = vehicle.body.rotation();
  target.pos.set(t.x, t.y, t.z);
  target.quat.set(r.x, r.y, r.z, r.w);
}

function load(key, ok, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (v && ok(v)) return v;
  } catch {}
  return fallback;
}
function save(key, v) {
  try {
    localStorage.setItem(key, v);
  } catch {}
}

// ---------- Cámara, HUD, menú ----------
const chase = new ChaseCamera(camera);
const hud = createHud();
const showroom = createShowroom();
const loadingEl = document.getElementById('loading');
let state = 'loading';

const select = createCarSelect({
  places: PLACES,
  onHighlight(id) {
    showroom.show(id);
  },
  async onChoose(id, place) {
    select.close();
    state = 'loading';
    const changedPlace = place !== placeId || !world;
    if (changedPlace) {
      loadingEl.textContent = `Cargando ${PLACES[place].name}…`;
      loadingEl.hidden = false;
      await new Promise((r) => setTimeout(r, 30)); // dejar que se vea el cartel
      removeCar();
      if (world?.race) world.race.show(false);
      world = await getWorld(place);
      placeId = place;
      loadingEl.hidden = true;
    }
    if (world.race) {
      // carrera: siempre se arranca desde la grilla
      spawnCar(id, world.spawn);
      world.race.show(true);
      world.race.start(id);
    } else if (!vehicle || changedPlace) {
      spawnCar(id, world.spawn);
    } else if (id !== carId) {
      spawnCar(id, currentSpot());
    }
    renderer.toneMappingExposure = world.sky.exposure;
    save(LAST_CAR_KEY, id);
    save(LAST_PLACE_KEY, place);
    hud.show(true);
    state = 'driving';
    chase.snap();
    clearPressed();
  },
});

function openMenu() {
  state = 'menu';
  hud.show(false);
  world?.race?.show(false);
  renderer.toneMappingExposure = 0.75;
  select.open(carId, placeId);
}

/** Lugar actual del auto (para cambiar de auto sin moverse). */
function currentSpot() {
  const t = vehicle.body.translation();
  return { x: t.x, y: t.y + 0.5, z: t.z, yaw: yawOf(vehicle.body.rotation()) };
}

loadingEl.textContent = 'Cargando autos…';
await loadCarAssets((f) => (loadingEl.textContent = `Cargando autos… ${Math.round(f * 100)}%`));
loadingEl.hidden = true;
openMenu();

// ---------- Bucle principal ----------
const STEP = 1 / PHYSICS.STEP_HZ;
let acc = 0;
let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  tick(dt);
  render();
  requestAnimationFrame(frame);
}

/** Avanza el juego dt segundos (sin dibujar). */
function tick(dt) {
  handleKeys();

  if (state === 'menu') {
    showroom.update(dt, renderer);
    return;
  }
  if (state !== 'driving') return;

  // __autopilot: solo para pruebas desde la consola
  let input = window.__autopilot ? window.__autopilot(vehicle, world) : readDriving();
  if (world.race) input = world.race.filterInput(input);
  acc += dt;
  let hit = 0;
  while (acc >= STEP) {
    prev.pos.copy(curr.pos);
    prev.quat.copy(curr.quat);
    vehicle.update(input, STEP);
    hit = Math.max(hit, vehicle.impact);
    world.physics.step();
    storeTransform(curr);
    acc -= STEP;
  }
  wallEffects(hit, dt);

  // Interpolar entre los dos últimos pasos de física: movimiento suave en pantallas de 120 Hz
  const alpha = acc / STEP;
  model.group.position.lerpVectors(prev.pos, curr.pos, alpha);
  model.group.quaternion.slerpQuaternions(prev.quat, curr.quat, alpha);
  model.group.updateMatrixWorld();
  model.update(dt);
  world.builder.sync();
  world.update(dt);
  world.race?.update(dt, vehicle);

  chase.update(model.group, vehicle, carId, dt);
  hud.update(vehicle, carId, chase.modeName, dt);
  world.sky.follow(model.group.position);
}

/** Chispas y sacudón de cámara al tocar una pared. */
function wallEffects(hit, dt) {
  const p = vehicle.contactPoint;
  if (p) {
    const v = vehicle.body.linvel();
    if (hit > 2.5) {
      if (WALL.SPARKS) world.sparks.emit(p, v, Math.min(70, Math.round(hit * 5)), 4);
      chase.shake(Math.min(1, hit / 18) * WALL.SHAKE);
    }
    if (WALL.SPARKS && vehicle.scrape > 6) world.sparks.emit(p, v, Math.round(vehicle.scrape / 7), 1.5);
    if (vehicle.scrape > 6) chase.shake(0.03);
  }
  world.sparks.update(dt);
}

function render() {
  if (state === 'menu') renderer.render(showroom.scene, showroom.camera);
  else if (state === 'driving') renderer.render(world.scene, camera);
}

function handleKeys() {
  if (state === 'menu') {
    if (justPressed('ArrowLeft', 'KeyA', 'Pad14')) select.move(-1);
    if (justPressed('ArrowRight', 'KeyD', 'Pad15')) select.move(1);
    if (justPressed('ArrowUp', 'ArrowDown', 'KeyW', 'KeyS', 'Tab', 'Pad12', 'Pad13')) select.nextPlace();
    if (justPressed('Enter', 'Space', 'Pad0')) select.choose();
    if (justPressed('Digit1')) select.pick(0);
    if (justPressed('Digit2')) select.pick(1);
    if (justPressed('Digit3')) select.pick(2);
    return;
  }
  if (state !== 'driving') return;
  if (justPressed('Escape', 'Pad9')) return openMenu();
  if (justPressed('KeyR', 'Pad3')) {
    if (world.race) {
      vehicle.teleport(world.spawnAt(world.race.resetPoint(), 0));
    } else {
      vehicle.reset();
    }
    syncTransforms();
  }
  if (justPressed('Enter') && world.race) {
    // reiniciar la carrera desde la grilla
    vehicle.teleport(world.spawn);
    syncTransforms();
    world.race.start(carId);
  }
  if (justPressed('KeyC', 'Pad2')) chase.nextMode();
  const ids = Object.keys(CARS);
  for (let i = 0; i < ids.length; i++) {
    if (justPressed(`Digit${i + 1}`) && ids[i] !== carId) {
      // cambiar de auto en el mismo lugar (para comparar)
      spawnCar(ids[i], world.race ? world.spawn : currentSpot());
      save(LAST_CAR_KEY, ids[i]);
      if (world.race) world.race.start(ids[i]);
    }
  }
}

requestAnimationFrame(frame);

// Para depurar desde la consola del navegador
window.__game = {
  get vehicle() { return vehicle; },
  get world() { return world; },
  camera, renderer,
  /** Debug: avanzar el juego N segundos de golpe (para probar sin esperar). */
  advance(seconds) {
    for (let t = 0; t < seconds; t += 1 / 60) tick(1 / 60);
    render();
  },
};
