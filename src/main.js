// Arranque del juego: renderer, lugares (mundos), elección de auto y bucle principal.
import * as THREE from 'three';
import { CARS, CAR_IDS, PHYSICS, LIGHT, WALL, GRAPHICS } from './config.js';
import { createSparks } from './world/sparks.js';
import { createTireFx } from './world/tireFx.js';
import { createRenderPipeline, prepareMaterials, cycleQuality, QUALITY, createDynamicResolution } from './core/graphics.js';
import { unlockAudio, CarSound, toggleMute, setEcho, impactSound } from './core/audio.js';
import { createPhysics } from './core/physics.js';
import { readDriving, justPressed, clearPressed, press } from './core/input.js';
import { initTouch, touchUi } from './core/touch.js';
import { createSky } from './world/sky.js';
import { buildTestTrack, SPAWN } from './world/testTrack.js';
import { loadMonacoData, buildMonaco } from './world/monaco.js';
import { loadRallyData, buildRally } from './world/rally.js';
import { createRally } from './modes/race/rally.js';
import { toggleCodriverVoice } from './modes/race/codriver.js';
import { Vehicle, yawOf } from './modes/driving/vehicle.js';
import { createCarModel } from './modes/driving/carModel.js';
import { ChaseCamera } from './modes/driving/camera.js';
import { createHud, createCarSelect } from './modes/driving/hud.js';
import { loadCarAssets, carAsset, physicsProfile } from './modes/driving/carAssets.js';
import { createShowroom } from './modes/driving/showroom.js';
import { createRace } from './modes/race/race.js';
import { createMulti } from './modes/race/multi.js';
import { carColor, colorAvoiding } from './modes/driving/colors.js';
import { askName } from './modes/driving/playerForm.js';
import { createRanking } from './modes/driving/ranking.js';
import { createLiveRoom } from './modes/driving/liveRoom.js';
import { playerName, registerPlayer } from './net/player.js';
import { buildMapa } from './world/mapa.js';
import { createExplore } from './modes/mapa/explore.js';
import { createShop } from './modes/mapa/shop.js';
import { wallet, ownedIds } from './modes/mapa/wallet.js';

// ---------- Render ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const pipeline = createRenderPipeline(renderer);
renderer.setSize(window.innerWidth, window.innerHeight);
pipeline.setSize(window.innerWidth, window.innerHeight);
const dynRes = createDynamicResolution(renderer, pipeline);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 20000);
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  pipeline.setSize(window.innerWidth, window.innerHeight);
  for (const w of Object.values(worlds)) w.sky.resize();
}
window.addEventListener('resize', onResize);
// al girar el celular algunos navegadores avisan el tamaño nuevo un rato después
window.addEventListener('orientationchange', () => setTimeout(onResize, 300));

// ---------- Lugares ----------
// Cada lugar tiene su propia escena y su propio mundo de física.
const PLACES = {
  mapa: { name: 'Mapa grande', world: 'mapa' },
  monaco: { name: 'Mónaco – circuito', world: 'monaco' },
  multi: { name: 'Mónaco – multijugador', world: 'monaco', multi: true },
  rally: { name: 'Rally – Tête de Chien', world: 'rally' },
  condor: { name: 'Rally – El Cóndor', world: 'condor' },
  pista: { name: 'Pista de pruebas', world: 'pista' },
};
const worlds = {};

async function getWorld(name) {
  if (worlds[name]) return worlds[name];
  const physics = await createPhysics();
  const scene = new THREE.Scene();
  let w;
  if (name === 'mapa') {
    const sky = createSky(scene, renderer, lightOpts(LIGHT.mapa), camera);
    const m = buildMapa(physics, scene);
    w = { physics, scene, sky, builder: m.builder, spawn: m.spawn, gates: m.gates, heightAt: m.heightAt, map: m, update: m.update };
    w.explore = createExplore(m);
  } else if (name === 'rally' || name === 'condor') {
    const sky = createSky(scene, renderer, lightOpts(LIGHT[name]), camera);
    const data = await loadRallyData(name);
    const m = buildRally(physics, scene, data);
    w = { physics, scene, sky, builder: m.builder, spawn: m.spawn, spawnAt: m.spawnAt, track: m.track, update: m.update };
    w.race = createRally(m.track, m.finishIdx, name);
  } else if (name === 'pista') {
    const sky = createSky(scene, renderer, lightOpts(LIGHT.pista), camera);
    const builder = buildTestTrack(physics, scene);
    w = { physics, scene, sky, builder, spawn: SPAWN, update() {} };
  } else {
    // tarde sobre el Mediterráneo (el sol viene del suroeste, del lado del mar)
    const sky = createSky(scene, renderer, lightOpts(LIGHT.monaco), camera);
    const data = await loadMonacoData();
    const m = await buildMonaco(physics, scene, data);
    w = { physics, scene, sky, builder: m.builder, spawn: m.spawn, spawnAt: m.spawnAt, gridSpot: m.gridSpot, track: m.track, update: m.update };
    w.race = createRace(m.track, 'monaco');
  }
  w.sparks = createSparks(scene);
  w.tireFx = createTireFx(scene);
  prepareMaterials(scene, w.sky.csm);
  // compilar todos los gráficos ahora (y no la primera vez que aparecen, que da un tirón)
  renderer.compile(scene, camera);
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
let placeId = load(LAST_PLACE_KEY, (v) => PLACES[v], 'mapa');
let returnFrom = null; // al volver al mapa: de qué lugar venís (para aparecer en su entrada)
let world = null;
let vehicle = null;
let model = null;
let myColor = null; // color con el que salió el auto propio
const prev = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
const curr = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };

// El audio arranca con la primera tecla o clic (regla de los navegadores)
window.addEventListener('keydown', unlockAudio);
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('touchend', unlockAudio); // Safari del iPhone solo lo deja al soltar el dedo
let carSound = null;

// ---------- Auto fantasma (la mejor vuelta) ----------
let ghost = null;      // { id, group, mats }
let ghostOn = true;
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

function makeGhost(id) {
  if (ghost?.id === id && ghost.scene === world.scene) return;
  removeGhost();
  const profile = physicsProfile(id);
  const m = createCarModel(id, profile, null, carAsset(id));
  const mats = [];
  m.group.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    o.material = [o.material].flat().map((mt) => {
      const c = mt.clone();
      c.transparent = true;
      c.opacity = 0.35;
      c.depthWrite = false;
      c.color?.lerp(new THREE.Color(0x9fd8ff), 0.5);
      mats.push(c);
      return c;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
  m.group.visible = false;
  world.scene.add(m.group);
  prepareMaterials(world.scene, world.sky.csm);
  ghost = { id, group: m.group, mats, scene: world.scene };
}

function removeGhost() {
  if (!ghost) return;
  ghost.scene.remove(ghost.group);
  ghost.mats.forEach((m) => m.dispose());
  ghost = null;
}

function updateGhost() {
  if (!ghost) return;
  const gp = ghostOn ? world.race?.ghostPose() : null;
  ghost.group.visible = !!gp;
  if (!gp) return;
  const { a, b, f } = gp;
  ghost.group.position.set(a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f);
  _qa.set(a[4], a[5], a[6], a[7]);
  _qb.set(b[4], b[5], b[6], b[7]);
  ghost.group.quaternion.slerpQuaternions(_qa, _qb, f);
  // se desvanece cuando lo tenés encima, para que no tape
  const d = ghost.group.position.distanceTo(model.group.position);
  const op = 0.38 * Math.min(1, Math.max(0.15, (d - 3) / 10));
  for (const m of ghost.mats) m.opacity = op;
}

function removeCar() {
  carSound?.dispose();
  carSound = null;
  if (!vehicle) return;
  world.scene.remove(model.group);
  model.dispose();
  vehicle.dispose();
  vehicle = null;
}

function spawnCar(id, at, color = carColor(id)) {
  removeCar();
  carId = id;
  myColor = color;
  const profile = physicsProfile(id);
  vehicle = new Vehicle(world.physics, profile, at);
  model = createCarModel(id, profile, vehicle, carAsset(id), color);
  carSound?.dispose();
  carSound = new CarSound(profile);
  world.scene.add(model.group);
  prepareMaterials(world.scene, world.sky.csm);
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
const showroom = createShowroom(renderer);
const loadingEl = document.getElementById('loading');
let state = 'loading';

const ranking = createRanking();
// lugar del menú → récords de qué mundo (el multijugador es la vuelta de Mónaco)
const RANKING_OF = { monaco: 'monaco', multi: 'monaco', rally: 'rally', condor: 'condor' };

const select = createCarSelect({
  places: PLACES,
  onHighlight(id) {
    showroom.show(id, carColor(id));
  },
  onPlace(place) {
    ranking.show(RANKING_OF[place]);
  },
  onChoose(id, place) {
    play(id, place);
  },
});

/** Sumarse desde el aviso del menú: con el auto del primero que entró y un color que no esté repetido. */
const liveRoom = createLiveRoom({
  onJoin(status) {
    const car = status.players[0].car;
    const taken = status.players.filter((p) => p.car === car).map((p) => p.color);
    play(CARS[car] ? car : 'f1', 'multi', colorAvoiding(car, taken));
  },
});

/** Arrancar a jugar con un auto en un lugar. color: para forzar uno (si no, el del auto). */
async function play(id, place, color = carColor(id)) {
  if (!wallet.owns(id)) id = 'f1';
  touchUi.prepare();
  select.close();
  liveRoom.stop();
  state = 'loading';
  const P = PLACES[place];
  const changedPlace = P.world !== PLACES[placeId]?.world || !world;
  world?.multi?.leave();
  document.body.classList.toggle('multi', !!P.multi);
  if (changedPlace) {
    loadingEl.textContent = `Cargando ${PLACES[place].name}…`;
    loadingEl.hidden = false;
    await new Promise((r) => setTimeout(r, 30)); // dejar que se vea el cartel
    removeCar();
    removeGhost();
    if (world?.race) world.race.show(false);
    world?.explore?.show(false);
    world = await getWorld(P.world);
    placeId = place;
    loadingEl.hidden = true;
  }
  if (P.multi) {
    // multijugador: sala de espera y después la grilla con los demás y los bots
    removeGhost();
    spawnCar(id, world.gridSpot(0), color);
    world.race.show(true);
    world.multi ??= createMulti(world, {
      vehicle: () => vehicle,
      carId: () => carId,
      color: () => myColor,
      teleport(spot) {
        vehicle.teleport(spot);
        syncTransforms();
      },
    });
    world.multi.enter();
  } else if (world.race) {
    // carrera: siempre se arranca desde la grilla
    spawnCar(id, world.spawn, color);
    world.race.show(true);
    world.race.start(id);
    makeGhost(id);
  } else if (!vehicle || changedPlace) {
    // al mapa: si venís de otro lugar, aparecés en su entrada
    const gate = world.gates?.find((g) => g.place === returnFrom);
    spawnCar(id, gate?.back ?? world.spawn, color);
  } else if (id !== carId || color !== myColor) {
    spawnCar(id, currentSpot(), color);
  }
  returnFrom = null;
  save(LAST_CAR_KEY, id);
  save(LAST_PLACE_KEY, place);
  document.body.classList.toggle('race', !!world.race);
  dynRes.reset();
  resumeDriving();
}

/** Volver a manejar (después de cargar un lugar o de salir de la tienda). */
function resumeDriving() {
  renderer.toneMappingExposure = world.sky.exposure;
  hud.show(true);
  touchUi.show(true);
  world.explore?.show(true);
  carSound?.setActive(true);
  state = 'driving';
  chase.snap();
  clearPressed();
}

// ---------- Mapa grande: entradas y tienda ----------
/** Enter cerca de un arco: a la tienda o al lugar. */
function useGate(g) {
  if (g.place === 'tienda') return openShop();
  if (!wallet.owns(carId)) carId = 'f1';
  play(carId, g.place, myColor);
}

/** B: desde cualquier lugar, volver al mapa grande (a la entrada de donde venís). */
function backToMap() {
  if (PLACES[placeId].world === 'mapa') return;
  returnFrom = placeId;
  play(carId, 'mapa', myColor);
}

const shop = createShop({
  onHighlight: (id) => showroom.show(id, carColor(id)),
  onUse(id) {
    shop.close();
    spawnCar(id, world.gates[0].back);
    save(LAST_CAR_KEY, id);
    resumeDriving();
  },
  onExit: closeShop,
});

function openShop() {
  state = 'shop';
  carSound?.setActive(false);
  hud.show(false);
  touchUi.show(false);
  world.explore.show(false);
  renderer.toneMappingExposure = 0.75;
  shop.open();
}

function closeShop() {
  shop.close();
  // salís a la calle, delante de la tienda
  vehicle.teleport(world.gates[0].back);
  syncTransforms();
  resumeDriving();
}

function openMenu() {
  state = 'menu';
  world?.multi?.leave();
  document.body.classList.remove('multi');
  carSound?.setActive(false);
  hud.show(false);
  touchUi.show(false);
  world?.race?.show(false);
  world?.explore?.show(false);
  renderer.toneMappingExposure = 0.75;
  meName.textContent = playerName() ?? '';
  select.open(carId, placeId);
  liveRoom.start();
}

/** N en el menú: cambiar el nombre. */
async function changeName() {
  state = 'name';
  select.close();
  liveRoom.stop();
  await askName();
  clearPressed();
  openMenu();
}

/** Lugar actual del auto (para cambiar de auto sin moverse). */
function currentSpot() {
  const t = vehicle.body.translation();
  return { x: t.x, y: t.y + 0.5, z: t.z, yaw: yawOf(vehicle.body.rotation()) };
}

for (const el of document.querySelectorAll('#quality, [data-quality]')) el.textContent = QUALITY;
initTouch({ onAction: press });
const meName = document.getElementById('me-name');
document.getElementById('change-name').addEventListener('click', changeName);
// directo en el toque (no por el bucle): pantalla completa y permiso de inclinar solo se piden ahí
document.getElementById('go').addEventListener('click', () => select.choose());
loadingEl.textContent = 'Cargando autos…';
await loadCarAssets((f) => (loadingEl.textContent = `Cargando autos… ${Math.round(f * 100)}%`));
loadingEl.hidden = true;
// sin nombre no se juega; si ya hay, se anota la visita (IP y ciudad)
if (playerName()) registerPlayer();
else {
  state = 'name';
  await askName();
  clearPressed();
}
openMenu();

// ---------- Bucle principal ----------
const STEP = 1 / PHYSICS.STEP_HZ;
let acc = 0;
let prepT = 0;
let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (state === 'driving') dynRes.update(dt);
  tick(dt);
  render();
  requestAnimationFrame(frame);
}

/** Avanza el juego dt segundos (sin dibujar). */
function tick(dt) {
  handleKeys();

  if (state === 'menu' || state === 'shop') {
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
    world.multi?.beforeStep(STEP);
    world.physics.step();
    storeTransform(curr);
    acc -= STEP;
  }
  wallEffects(hit, dt);
  carSound?.update(dt, vehicle, input, { scrape: vehicle.contactPoint ? vehicle.scrape : 0 });
  world.tireFx.emitFor(vehicle, dt);
  world.tireFx.update(dt);
  const inTunnel = !!(world.track && world.track.isTunnel[world.race.resetPoint()]);
  setEcho(inTunnel ? 1 : 0);
  // en el túnel no llega la luz del cielo: se apaga de a poco
  const envTarget = inTunnel ? GRAPHICS.ENV_LIGHT * 0.2 : GRAPHICS.ENV_LIGHT;
  world.scene.environmentIntensity += (envTarget - world.scene.environmentIntensity) * Math.min(1, dt * 3);

  // Interpolar entre los dos últimos pasos de física: movimiento suave en pantallas de 120 Hz
  const alpha = acc / STEP;
  model.group.position.lerpVectors(prev.pos, curr.pos, alpha);
  model.group.quaternion.slerpQuaternions(prev.quat, curr.quat, alpha);
  model.group.updateMatrixWorld();
  model.update(dt);
  world.builder.sync();
  world.update(dt);
  world.race?.update(dt, vehicle);
  if (world.explore) {
    // si te metiste al mar, volvés a la orilla
    const back = world.explore.update(dt, vehicle, yawOf(vehicle.body.rotation()));
    if (back) {
      vehicle.teleport(back);
      syncTransforms();
    }
  }
  world.multi?.update(dt);
  updateGhost();

  chase.update(model.group, vehicle, carId, dt);
  hud.update(vehicle, carId, chase.modeName, dt, dynRes.pixelRatio);
  world.sky.follow(model.group.position, dt);
  // materiales nuevos (autos, fantasma, bots) también reciben las sombras en cascada
  if ((prepT += dt) > 2) {
    prepT = 0;
    prepareMaterials(world.scene, world.sky.csm);
  }
}

/** Chispas y sacudón de cámara al tocar una pared. */
function wallEffects(hit, dt) {
  const p = vehicle.contactPoint;
  if (p) {
    const v = vehicle.body.linvel();
    if (hit > 2.5) {
      impactSound(hit);
      if (WALL.SPARKS) world.sparks.emit(p, v, Math.min(70, Math.round(hit * 5)), 4);
      chase.shake(Math.min(1, hit / 18) * WALL.SHAKE);
    }
    if (WALL.SPARKS && vehicle.scrape > 6) world.sparks.emit(p, v, Math.round(vehicle.scrape / 7), 1.5);
    if (vehicle.scrape > 6) chase.shake(0.03);
  }
  world.sparks.update(dt);
}

function render() {
  if (state === 'menu' || state === 'shop') pipeline.render(showroom.scene, showroom.camera);
  else if (state === 'driving' || state === 'paused') pipeline.render(world.scene, camera);
}

function handleKeys() {
  if (state === 'menu') {
    if (justPressed('ArrowLeft', 'KeyA', 'Pad14')) select.move(-1);
    if (justPressed('ArrowRight', 'KeyD', 'Pad15')) select.move(1);
    if (justPressed('ArrowUp', 'ArrowDown', 'KeyW', 'KeyS', 'Tab', 'Pad12', 'Pad13')) select.nextPlace();
    if (justPressed('Enter', 'Space', 'Pad0')) select.choose();
    CAR_IDS.forEach((_, i) => justPressed(`Digit${i + 1}`) && select.pick(i));
    if (justPressed('KeyQ')) cycleQuality();
    if (justPressed('KeyC')) select.nextColor();
    if (justPressed('KeyJ')) liveRoom.join();
    if (justPressed('KeyN')) changeName();
    return;
  }
  if (state === 'shop') {
    if (justPressed('ArrowLeft', 'KeyA', 'Pad14')) shop.move(-1);
    if (justPressed('ArrowRight', 'KeyD', 'Pad15')) shop.move(1);
    if (justPressed('Enter', 'Space', 'Pad0')) shop.act();
    if (justPressed('Escape', 'Pad1', 'Pad9')) closeShop();
    return;
  }
  if (state === 'paused') {
    if (justPressed('Escape', 'Pad9')) return openMenu();
    if (!justPressed('Resume', 'Pause')) return toggleKeys();
    state = 'driving';
    carSound?.setActive(true);
  }
  if (state !== 'driving') return;
  if (justPressed('Escape', 'Pad9')) return openMenu();
  // pausa (botón de la pantalla táctil): en el multijugador la carrera sigue
  if (justPressed('Pause') && !world.multi?.active) {
    state = 'paused';
    carSound?.setActive(false);
    return;
  }
  justPressed('Resume');
  if (justPressed('KeyR', 'Pad3')) {
    if (world.race) {
      world.race.onReset();
      vehicle.teleport(world.spawnAt(world.race.resetPoint(), 0));
    } else {
      vehicle.reset();
    }
    syncTransforms();
  }
  if (justPressed('KeyB')) return backToMap();
  if (world.explore) {
    if (justPressed('Enter', 'Pad0') && world.explore.near) return useGate(world.explore.near);
  } else if (world.multi?.active) {
    if (justPressed('Enter')) world.multi.again();
  } else if (justPressed('Enter') && world.race) {
    // reiniciar la carrera desde la grilla
    vehicle.teleport(world.spawn);
    syncTransforms();
    world.race.start(carId);
    makeGhost(carId);
  }
  if (justPressed('KeyC', 'Pad2')) chase.nextMode();
  toggleKeys();
  const ids = ownedIds(CAR_IDS);
  for (let i = 0; i < ids.length; i++) {
    if (!world.multi?.active && justPressed(`Digit${i + 1}`) && ids[i] !== carId) {
      // cambiar de auto en el mismo lugar (para comparar)
      spawnCar(ids[i], world.race ? world.spawn : currentSpot());
      save(LAST_CAR_KEY, ids[i]);
      if (world.race) {
        world.race.start(ids[i]);
        makeGhost(ids[i]);
      }
    }
  }
}

/** Prender / apagar: sonido, fantasma y copiloto (también andan en pausa). */
function toggleKeys() {
  if (justPressed('KeyM')) toggleMute();
  if (justPressed('KeyG')) ghostOn = !ghostOn;
  if (justPressed('KeyV')) toggleCodriverVoice();
}

requestAnimationFrame(frame);

// Para depurar desde la consola del navegador
window.__game = {
  get vehicle() { return vehicle; },
  get world() { return world; },
  get carSound() { return carSound; },
  camera, renderer, pipeline,
  /** Debug: avanzar el juego N segundos de golpe (para probar sin esperar). */
  advance(seconds) {
    for (let t = 0; t < seconds; t += 1 / 60) tick(1 / 60);
    render();
  },
};
