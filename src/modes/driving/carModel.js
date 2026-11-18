// Autos "de cajitas" para la Fase 1. En la Fase 2 se reemplazan por modelos GLB.
// Ejes del auto: +X adelante, +Y arriba, +Z derecha (igual que la física).
import * as THREE from 'three';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, ...extra });
const M = {
  dark: std(0x16171a, { roughness: 0.7 }),
  glass: std(0x1b2430, { roughness: 0.1, metalness: 0.6 }),
  chrome: std(0xd8dde3, { roughness: 0.2, metalness: 0.9 }),
  tire: std(0x111111, { roughness: 0.9 }),
  rim: std(0xb9bec6, { roughness: 0.3, metalness: 0.8 }),
  head: new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 1.2 }),
  tail: new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff0000, emissiveIntensity: 0.8 }),
  white: std(0xf2f2f2),
  helmet: std(0xffd21f, { roughness: 0.3 }),
};

function box(group, mat, sx, sy, sz, x, y, z, rotZ = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.position.set(x, y, z);
  m.rotation.z = rotZ;
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

function makeWheel(radius, width, rimMat = M.rim) {
  const pivot = new THREE.Group(); // gira para doblar (eje Y)
  const spin = new THREE.Group();  // gira al rodar (eje Z)
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 20).rotateX(Math.PI / 2), M.tire);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width * 1.02, 10).rotateX(Math.PI / 2), rimMat);
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.1, radius * 0.18, width * 1.05), M.dark);
  tire.castShadow = true;
  spin.add(tire, rim, spoke);
  pivot.add(spin);
  return { pivot, spin };
}

const BUILDERS = {
  f1(g, p) {
    const body = std(p.color, { roughness: 0.35, metalness: 0.2 });
    const y0 = -p.HEIGHT / 2 + 0.12;
    box(g, body, 3.9, 0.36, 0.62, 0.3, y0 + 0.18, 0);           // monocasco
    box(g, body, 1.1, 0.22, 0.38, 2.6, y0 + 0.08, 0, -0.08);    // trompa
    box(g, body, 1.7, 0.34, 1.45, -0.4, y0 + 0.17, 0);          // pontones
    box(g, body, 1.2, 0.5, 0.5, -1.1, y0 + 0.45, 0, 0.12);      // cubierta motor
    box(g, M.dark, 0.6, 0.06, 1.9, 2.75, y0 - 0.02, 0);         // alerón delantero
    box(g, M.white, 0.25, 0.14, 0.05, 2.75, y0 + 0.04, -0.93);
    box(g, M.white, 0.25, 0.14, 0.05, 2.75, y0 + 0.04, 0.93);
    box(g, M.dark, 0.45, 0.08, 1.2, -2.25, y0 + 0.75, 0);       // alerón trasero
    box(g, body, 0.5, 0.45, 0.05, -2.25, y0 + 0.58, -0.6);
    box(g, body, 0.5, 0.45, 0.05, -2.25, y0 + 0.58, 0.6);
    box(g, M.dark, 0.12, 0.45, 0.12, -2.0, y0 + 0.45, 0);
    box(g, M.dark, 0.7, 0.08, 0.5, 0.35, y0 + 0.44, 0);         // cockpit
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), M.helmet);
    helmet.position.set(0.15, y0 + 0.55, 0);
    helmet.castShadow = true;
    g.add(helmet);
    box(g, M.dark, 0.06, 0.06, 0.6, 0.55, y0 + 0.62, 0);        // halo
    return { wheelWidth: [0.32, 0.42] };
  },

  pickup(g, p) {
    const body = std(p.color, { roughness: 0.45, metalness: 0.25 });
    const y0 = -p.HEIGHT / 2;
    box(g, body, 5.2, 0.62, 1.96, 0, y0 + 0.45, 0);             // carrocería baja
    box(g, body, 2.3, 0.72, 1.86, 0.55, y0 + 1.1, 0);           // cabina
    box(g, M.glass, 0.08, 0.5, 1.7, 1.72, y0 + 1.12, 0, -0.35); // parabrisas
    box(g, M.glass, 1.9, 0.42, 1.88, 0.5, y0 + 1.16, 0);        // ventanas laterales
    box(g, body, 2.2, 0.08, 1.9, 0.55, y0 + 1.48, 0);           // techo
    box(g, M.dark, 2.1, 0.08, 1.8, -1.55, y0 + 0.78, 0);        // caja (piso)
    box(g, body, 2.1, 0.32, 0.08, -1.55, y0 + 0.92, -0.94);     // caja (laterales)
    box(g, body, 2.1, 0.32, 0.08, -1.55, y0 + 0.92, 0.94);
    box(g, body, 0.08, 0.32, 1.9, -2.58, y0 + 0.92, 0);
    box(g, M.chrome, 0.12, 0.28, 2.0, 2.62, y0 + 0.3, 0);       // paragolpes
    box(g, M.chrome, 0.12, 0.28, 2.0, -2.62, y0 + 0.3, 0);
    box(g, M.dark, 0.06, 0.32, 1.2, 2.6, y0 + 0.6, 0);          // parrilla
    box(g, M.head, 0.06, 0.16, 0.34, 2.61, y0 + 0.62, -0.75);
    box(g, M.head, 0.06, 0.16, 0.34, 2.61, y0 + 0.62, 0.75);
    box(g, M.tail, 0.06, 0.25, 0.14, -2.62, y0 + 0.75, -0.9);
    box(g, M.tail, 0.06, 0.25, 0.14, -2.62, y0 + 0.75, 0.9);
    box(g, M.dark, 0.25, 0.1, 1.5, 0.8, y0 + 1.57, 0);          // barra de luces
    return { wheelWidth: [0.36, 0.36] };
  },

  luxury(g, p) {
    const body = std(p.color, { roughness: 0.18, metalness: 0.7 });
    const y0 = -p.HEIGHT / 2;
    box(g, body, 4.95, 0.5, 1.92, 0, y0 + 0.33, 0);             // carrocería
    box(g, body, 1.5, 0.12, 1.86, 1.55, y0 + 0.62, 0, -0.06);   // capot
    box(g, M.glass, 2.5, 0.46, 1.7, -0.25, y0 + 0.8, 0);        // cabina
    box(g, body, 2.1, 0.06, 1.62, -0.35, y0 + 1.04, 0);         // techo
    box(g, M.glass, 0.7, 0.06, 1.6, 0.95, y0 + 0.8, 0, -0.6);   // parabrisas
    box(g, M.glass, 0.6, 0.06, 1.6, -1.45, y0 + 0.8, 0, 0.5);   // luneta
    box(g, M.chrome, 0.08, 0.26, 0.9, 2.48, y0 + 0.36, 0);      // parrilla
    box(g, M.head, 0.06, 0.08, 0.5, 2.47, y0 + 0.5, -0.66);
    box(g, M.head, 0.06, 0.08, 0.5, 2.47, y0 + 0.5, 0.66);
    box(g, M.tail, 0.06, 0.08, 1.7, -2.48, y0 + 0.5, 0);
    box(g, M.chrome, 4.0, 0.04, 0.02, 0, y0 + 0.4, -0.965);     // línea cromada
    box(g, M.chrome, 4.0, 0.04, 0.02, 0, y0 + 0.4, 0.965);
    return { wheelWidth: [0.3, 0.32] };
  },
};

/**
 * Crea el auto que se ve. Si hay modelo GLB lo usa; si no, el de cajitas.
 * vehicle puede ser null (showroom): las ruedas quedan en su lugar de reposo.
 */
export function createCarModel(id, profile, vehicle, asset = null) {
  const group = new THREE.Group();
  const wheels = [];

  if (asset) {
    // ---- Modelo GLB ----
    const off = profile.MODEL_OFFSET;
    const body = asset.scene.clone(true);
    body.position.set(off.x, off.y, off.z);
    group.add(body);
    const names = ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'];
    const keys = ['FL', 'FR', 'RL', 'RR'];
    names.forEach((name, i) => {
      const node = body.getObjectByName(name);
      const c = asset.info.wheels[keys[i]].center;
      const pivot = new THREE.Group();
      const spin = new THREE.Group();
      pivot.add(spin);
      group.add(pivot);
      if (node) {
        // la rueda pasa a girar alrededor de su centro
        node.removeFromParent();
        node.position.set(node.position.x - c[0], node.position.y - c[1], node.position.z - c[2]);
        spin.add(node);
      }
      const rest = profile.WHEELS[i];
      pivot.position.set(rest.x, rest.y, rest.z);
      wheels.push({ pivot, spin, angle: 0 });
    });
    group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        // de un solo lado: así desde adentro (vista conductor) no se ve la carrocería por dentro
        for (const m of [o.material].flat()) m.side = THREE.FrontSide;
      }
    });
  } else {
    // ---- Cajitas (por si no cargó el modelo) ----
    const chassis = new THREE.Group();
    group.add(chassis);
    const { wheelWidth } = BUILDERS[id](chassis, profile);
    for (let i = 0; i < 4; i++) {
      const w = makeWheel(profile.WHEEL_RADIUS, i < 2 ? wheelWidth[0] : wheelWidth[1]);
      group.add(w.pivot);
      wheels.push({ ...w, angle: 0 });
    }
  }

  return {
    group,
    /** Ubica las ruedas según la suspensión y las hace girar. */
    update(dt) {
      if (!vehicle) return;
      for (let i = 0; i < 4; i++) {
        const s = vehicle.wheelState(i);
        const w = wheels[i];
        w.pivot.position.set(s.x, s.y, s.z);
        w.pivot.rotation.y = s.steering;
        w.angle -= (vehicle.speed / profile.WHEEL_RADIUS) * dt;
        w.spin.rotation.z = w.angle;
      }
    },
    dispose() {
      if (!asset) group.traverse((o) => o.geometry?.dispose());
    },
  };
}
