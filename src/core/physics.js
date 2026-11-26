// Mundo de física (Rapier). No sabe nada de gráficos: así se puede probar en Node.
import RAPIER from '@dimforge/rapier3d-compat';
import { PHYSICS } from '../config.js';

export { RAPIER };

export async function createPhysics() {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -PHYSICS.GRAVITY, z: 0 });
  world.timestep = 1 / PHYSICS.STEP_HZ;

  // collider.handle -> nombre de superficie ('asfalto', 'arena', ...)
  const surfaces = new Map();
  // paredes y guardrails: el auto las "raspa" en vez de rebotar (ver vehicle.js)
  const walls = new Set();
  // pisos grandes (el terreno del mapa) cuya superficie depende de dónde se pisa: handle -> fn(x, z)
  const zoned = new Map();

  return {
    RAPIER,
    world,
    dt: 1 / PHYSICS.STEP_HZ,
    setSurface(collider, surface) {
      surfaces.set(collider.handle, surface);
    },
    /** La superficie de este collider depende del lugar: fn(x, z) -> 'arena', 'pasto', ... */
    setSurfaceZones(collider, fn) {
      zoned.set(collider.handle, fn);
    },
    markWall(collider) {
      walls.add(collider.handle);
    },
    isWall(collider) {
      return walls.has(collider.handle);
    },
    surfaceOf(collider, point = null) {
      if (!collider) return null;
      const fn = point && zoned.get(collider.handle);
      if (fn) return fn(point.x, point.z);
      return surfaces.get(collider.handle) ?? 'asfalto';
    },
    step() {
      world.step();
    },
  };
}
