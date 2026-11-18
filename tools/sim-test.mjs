// Prueba de manejo sin navegador: mide aceleración, frenado y curvas de cada auto.
// Uso: node tools/sim-test.mjs [f1|pickup|luxury] [superficie]
import { createPhysics } from '../src/core/physics.js';
import { Vehicle, rotateVec } from '../src/modes/driving/vehicle.js';
import fs from 'node:fs';
import { CARS as BASE } from '../src/config.js';
import { profileFromModel } from '../src/modes/driving/vehicleProfile.js';

// Usa la geometría de los modelos 3D si existe cars.json
const manifestUrl = new URL('../public/assets/models/cars/cars.json', import.meta.url);
const manifest = fs.existsSync(manifestUrl) ? JSON.parse(fs.readFileSync(manifestUrl, 'utf8')) : {};
const CARS = Object.fromEntries(Object.entries(BASE).map(([id, c]) => [id, profileFromModel(c, manifest[id])]));

const ids = process.argv[2] ? [process.argv[2]] : Object.keys(CARS);
const surf = process.argv[3] ?? 'asfalto';

for (const id of ids) {
  const phys = await createPhysics();
  const { RAPIER, world } = phys;
  const g = world.createCollider(RAPIER.ColliderDesc.cuboid(5000, 1, 5000).setTranslation(0, -1, 0));
  phys.setSurface(g, surf);
  const car = new Vehicle(phys, CARS[id], { x: 0, y: 1.5, z: 0, yaw: 0 });
  const dt = phys.dt;
  let t = 0;
  const run = (secs, input, every = 0, label = '') => {
    for (let i = 0; i < secs * 60; i++) {
      car.update(input, dt); phys.step(); t += dt;
      if (every && i % (every * 60) === 0) log(label);
    }
  };
  const log = (label) => {
    const p = car.body.translation(); const r = car.body.rotation();
    const up = rotateVec(r, { x: 0, y: 1, z: 0 });
    console.log(`${label.padEnd(10)} t=${t.toFixed(1)} kmh=${car.kmh.toFixed(0).padStart(3)} spd=${car.speed.toFixed(1)} pos=(${p.x.toFixed(1)},${p.y.toFixed(2)},${p.z.toFixed(1)}) upY=${up.y.toFixed(2)} ground=${car.wheelsOnGround}`);
  };
  console.log(`\n===== ${CARS[id].name} (${surf}) =====`);
  run(1.5, { throttle: 0, brake: 0, steer: 0 }); log('reposo');
  // 0-100
  let t100 = null, t0 = t;
  for (let i = 0; i < 25 * 60; i++) {
    car.update({ throttle: 1, brake: 0, steer: 0 }, dt); phys.step(); t += dt;
    if (t100 === null && car.kmh >= 100) t100 = t - t0;
    if (i % 300 === 0) log('acelera');
  }
  log('final'); console.log(`0-100: ${t100?.toFixed(2)}s  vmax≈${car.kmh.toFixed(0)}`);
  // frenar desde vmax a 0
  const p0 = car.body.translation(); const tb = t;
  while (car.kmh > 2 && t - tb < 20) { car.update({ throttle: 0, brake: 1, steer: 0 }, dt); phys.step(); t += dt; }
  const p1 = car.body.translation();
  console.log(`frenado: ${(t - tb).toFixed(2)}s, ${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(0)} m`);
  // curva a 80 km/h: acelerar a 80 y girar a fondo
  for (let k = 0; car.kmh < 80 && k < 1200; k++) { car.update({ throttle: 1, brake: 0, steer: 0 }, dt); phys.step(); t += dt; }
  run(4, { throttle: 0.5, brake: 0, steer: 1 }, 1, 'curva80');
  // freno de mano
  run(2, { throttle: 1, brake: 0, steer: 0 });
  run(2, { throttle: 0, brake: 0, steer: 1, handbrake: true }, 0.5, 'manito');
  // marcha atrás
  run(3, { throttle: 0, brake: 1, steer: 0 });
  run(3, { throttle: 0, brake: 1, steer: 0 }); log('atras');
}
