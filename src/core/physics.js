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

  return {
    RAPIER,
    world,
    dt: 1 / PHYSICS.STEP_HZ,
    setSurface(collider, surface) {
      surfaces.set(collider.handle, surface);
    },
    surfaceOf(collider) {
      if (!collider) return null;
      return surfaces.get(collider.handle) ?? 'asfalto';
    },
    step() {
      world.step();
    },
  };
}
