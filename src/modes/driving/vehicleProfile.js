// Junta los números de config.js con la geometría del modelo 3D (cars.json).
// Sin Three.js, así también lo usa tools/sim-test.mjs.
const ORDER = ['FL', 'FR', 'RL', 'RR'];

/** Coordenadas del cuerpo físico: el origen es el centro de la carrocería. */
export function profileFromModel(base, info) {
  if (!info) return base;
  const { body, wheels, wheelRadius } = info;
  const center = [0, 1, 2].map((i) => (body.min[i] + body.max[i]) / 2);
  return {
    ...base,
    LENGTH: body.size[0],
    HEIGHT: body.size[1],
    WIDTH: body.size[2],
    WHEEL_RADIUS: wheelRadius,
    WHEELS: ORDER.map((k) => ({
      x: wheels[k].center[0] - center[0],
      y: wheels[k].center[1] - center[1],
      z: wheels[k].center[2] - center[2],
    })),
    MODEL_OFFSET: { x: -center[0], y: -center[1], z: -center[2] },
  };
}
