// Prueba de frenado: desde 100 y 200 km/h hasta 0, y cuánto se desacelera soltando el acelerador.
// Uso: node tools/brake-test.mjs [auto]
import fs from 'node:fs';
import { createPhysics } from '../src/core/physics.js';
import { Vehicle } from '../src/modes/driving/vehicle.js';
import { CARS as BASE } from '../src/config.js';
import { profileFromModel } from '../src/modes/driving/vehicleProfile.js';

const manifestUrl = new URL('../public/assets/models/cars/cars.json', import.meta.url);
const manifest = fs.existsSync(manifestUrl) ? JSON.parse(fs.readFileSync(manifestUrl, 'utf8')) : {};
const ids = process.argv[2] ? [process.argv[2]] : Object.keys(BASE);

for (const id of ids) {
  const out = [];
  for (const from of [100, 200, 300]) {
    const phys = await createPhysics();
    const { RAPIER, world } = phys;
    phys.setSurface(world.createCollider(RAPIER.ColliderDesc.cuboid(8000, 1, 8000).setTranslation(0, -1, 0)), 'asfalto');
    const car = new Vehicle(phys, profileFromModel(BASE[id], manifest[id]), { x: -7000, y: 1.5, z: 0, yaw: 0 });
    const dt = phys.dt;
    for (let i = 0; i < 90; i++) { car.update({ throttle: 0, brake: 0, steer: 0 }, dt); phys.step(); }
    let t = 0;
    while (car.kmh < from && t < 40) { car.update({ throttle: 1, brake: 0, steer: 0 }, dt); phys.step(); t += dt; }
    if (car.kmh < from - 2) { out.push(`${from}→0: (no llega a ${from})`); continue; }
    const x0 = car.body.translation().x; t = 0;
    while (car.kmh > 1 && t < 30) { car.update({ throttle: 0, brake: 1, steer: 0 }, dt); phys.step(); t += dt; }
    const d = car.body.translation().x - x0;
    out.push(`${from}→0: ${d.toFixed(0)} m en ${t.toFixed(2)} s (${(from / 3.6 / t / 9.81).toFixed(2)} g)`);
  }
  console.log(`${BASE[id].name.padEnd(13)} ${out.join(' · ')}`);
}
