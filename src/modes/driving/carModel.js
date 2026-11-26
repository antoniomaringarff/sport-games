// Autos "de cajitas" para la Fase 1. En la Fase 2 se reemplazan por modelos GLB.
// Ejes del auto: +X adelante, +Y arriba, +Z derecha (igual que la física).
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { CARS, COLORS } from '../../config.js';

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
 * Formas de los autos inventados de la tienda (cajitas, sin modelo 3D todavía).
 * Cada una usa el tamaño del auto (LENGTH, WIDTH, HEIGHT) de config.js.
 */
const SHAPES = {
  van(g, p) {
    const body = std(p.color, { roughness: 0.5 });
    const L = p.LENGTH, W = p.WIDTH, y0 = -p.HEIGHT / 2;
    box(g, body, L, 1.6, W, -0.1, y0 + 1.15, 0);                 // caja
    box(g, body, 0.9, 0.9, W * 0.98, L / 2 - 0.35, y0 + 0.75, 0); // trompa
    box(g, M.glass, 0.08, 0.6, W * 0.9, L / 2 - 0.82, y0 + 1.55, 0, -0.2); // parabrisas
    box(g, std(0xd8262e), L * 0.7, 0.25, W * 1.01, -0.4, y0 + 1.25, 0);    // franja
    box(g, M.dark, 0.1, 0.25, W, L / 2 + 0.1, y0 + 0.4, 0);       // paragolpes
    box(g, M.head, 0.05, 0.16, 0.3, L / 2 + 0.11, y0 + 0.7, -W / 2 + 0.3);
    box(g, M.head, 0.05, 0.16, 0.3, L / 2 + 0.11, y0 + 0.7, W / 2 - 0.3);
    box(g, M.tail, 0.05, 0.3, 0.15, -L / 2 - 0.12, y0 + 0.8, -W / 2 + 0.15);
    box(g, M.tail, 0.05, 0.3, 0.15, -L / 2 - 0.12, y0 + 0.8, W / 2 - 0.15);
    return { wheelWidth: [0.3, 0.3] };
  },

  kart(g, p) {
    const body = std(p.color, { roughness: 0.4 });
    const y0 = -p.HEIGHT / 2;
    box(g, M.dark, 2.2, 0.08, 1.1, 0, y0 + 0.1, 0);               // chasis
    box(g, body, 0.6, 0.25, 0.9, 0.95, y0 + 0.25, 0, -0.2);       // trompa
    box(g, body, 0.25, 0.3, 1.45, -1.05, y0 + 0.25, 0);           // paragolpes trasero
    box(g, M.dark, 0.6, 0.45, 0.6, -0.3, y0 + 0.4, 0);            // asiento
    box(g, M.dark, 0.08, 0.35, 0.08, 0.35, y0 + 0.4, 0, 0.5);     // columna del volante
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), M.helmet);
    helmet.position.set(-0.25, y0 + 0.95, 0);
    helmet.castShadow = true;
    g.add(helmet);
    return { wheelWidth: [0.2, 0.26] };
  },

  buggy(g, p) {
    const body = std(p.color, { roughness: 0.45 });
    const y0 = -p.HEIGHT / 2;
    box(g, body, 3.2, 0.35, 1.3, 0, y0 + 0.45, 0);                // piso
    box(g, body, 0.9, 0.3, 1.2, 1.4, y0 + 0.7, 0, -0.35);         // trompa
    // jaula antivuelco
    for (const z of [-0.6, 0.6]) {
      box(g, M.dark, 0.08, 0.9, 0.08, 0.5, y0 + 1.05, z, 0.35);
      box(g, M.dark, 0.08, 0.9, 0.08, -0.7, y0 + 1.05, z, -0.2);
      box(g, M.dark, 1.3, 0.08, 0.08, -0.1, y0 + 1.48, z);
    }
    box(g, M.dark, 0.08, 0.08, 1.28, -0.1, y0 + 1.48, 0);
    box(g, M.dark, 0.9, 0.4, 1.2, -1.25, y0 + 0.8, 0);            // motor atrás
    box(g, M.head, 0.3, 0.12, 0.9, 0.5, y0 + 1.6, 0);             // barra de luces
    return { wheelWidth: [0.36, 0.42] };
  },

  muscle(g, p) {
    const body = std(p.color, { roughness: 0.25, metalness: 0.5 });
    const L = p.LENGTH, W = p.WIDTH, y0 = -p.HEIGHT / 2;
    box(g, body, L, 0.55, W, 0, y0 + 0.42, 0);                     // carrocería
    box(g, body, 1.9, 0.08, W * 0.96, 1.25, y0 + 0.72, 0);         // capot largo
    box(g, M.dark, 0.7, 0.18, 0.6, 1.3, y0 + 0.82, 0);             // toma de aire
    box(g, M.glass, 1.9, 0.45, W * 0.86, -0.45, y0 + 0.92, 0);     // cabina
    box(g, body, 1.5, 0.06, W * 0.84, -0.55, y0 + 1.17, 0);        // techo
    box(g, M.dark, 0.08, 0.07, W * 0.95, L / 2 - 0.05, y0 + 0.35, 0);
    box(g, std(0x141414), L * 1.001, 0.56, 0.3, 0, y0 + 0.43, 0);  // franjas de carrera
    box(g, M.head, 0.06, 0.12, 0.35, L / 2, y0 + 0.5, -W / 2 + 0.35);
    box(g, M.head, 0.06, 0.12, 0.35, L / 2, y0 + 0.5, W / 2 - 0.35);
    box(g, M.tail, 0.06, 0.1, W * 0.9, -L / 2, y0 + 0.55, 0);
    box(g, M.dark, 0.3, 0.06, W * 0.9, -L / 2 + 0.2, y0 + 0.78, 0); // alerón chiquito
    return { wheelWidth: [0.32, 0.4] };
  },

  monster(g, p) {
    const body = std(p.color, { roughness: 0.35, metalness: 0.3 });
    const L = p.LENGTH, W = p.WIDTH, y0 = -p.HEIGHT / 2;
    box(g, M.dark, L * 0.8, 0.3, 1.4, 0, y0 + 0.2, 0);             // chasis a la vista
    box(g, body, L, 0.6, W * 0.85, 0, y0 + 0.85, 0);               // carrocería
    box(g, body, 1.8, 0.7, W * 0.8, -0.2, y0 + 1.5, 0);            // cabina
    box(g, M.glass, 0.08, 0.55, W * 0.75, 0.72, y0 + 1.5, 0, -0.3);
    box(g, M.glass, 1.5, 0.45, W * 0.81, -0.25, y0 + 1.55, 0);
    box(g, M.chrome, 0.15, 0.3, W * 0.9, L / 2 + 0.05, y0 + 0.7, 0);
    box(g, M.head, 0.3, 0.14, 1.4, 0.4, y0 + 1.9, 0);              // luces en el techo
    return { wheelWidth: [0.65, 0.65] };
  },

  rocket(g, p) {
    const body = std(p.color, { roughness: 0.2, metalness: 0.6 });
    const L = p.LENGTH, W = p.WIDTH, y0 = -p.HEIGHT / 2;
    box(g, body, L, 0.32, W, 0, y0 + 0.26, 0);                     // piso ancho
    box(g, body, 1.6, 0.16, W * 0.7, 1.4, y0 + 0.42, 0, -0.12);    // trompa en cuña
    box(g, M.glass, 1.5, 0.35, 1.1, -0.2, y0 + 0.6, 0);            // burbuja
    box(g, body, 1.4, 0.4, 0.4, -1.4, y0 + 0.58, -0.6);            // turbinas
    box(g, body, 1.4, 0.4, 0.4, -1.4, y0 + 0.58, 0.6);
    const fire = new THREE.MeshStandardMaterial({ color: 0x66ccff, emissive: 0x33aaff, emissiveIntensity: 2 });
    box(g, fire, 0.06, 0.28, 0.28, -L / 2 - 0.12, y0 + 0.58, -0.6);
    box(g, fire, 0.06, 0.28, 0.28, -L / 2 - 0.12, y0 + 0.58, 0.6);
    box(g, M.dark, 0.5, 0.06, W, -L / 2 + 0.3, y0 + 1.0, 0);       // alerón
    box(g, body, 0.4, 0.4, 0.06, -L / 2 + 0.3, y0 + 0.78, 0);
    return { wheelWidth: [0.34, 0.4] };
  },
};

/** Material invisible que igual proyecta sombra (el paso de sombras ignora colorWrite). */
const SHADOW_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

/**
 * Molde de sombra: la envoltura convexa de la carrocería (con pocos puntos) y un cilindro por
 * rueda. Proyecta casi la misma sombra que el modelo detallado y cuesta mucho menos.
 */
function addShadowProxy(group, body, wheels, asset, profile) {
  const bodyNode = body.getObjectByName('body');
  if (bodyNode) {
    body.updateMatrixWorld(true);
    const pts = [];
    const v = new THREE.Vector3();
    const toGroup = new THREE.Matrix4();
    bodyNode.traverse((o) => {
      if (!o.isMesh) return;
      toGroup.copy(body.matrix).multiply(o.matrixWorld.clone().premultiply(body.matrixWorld.clone().invert()));
      const pos = o.geometry.attributes.position;
      const stride = Math.max(1, Math.floor(pos.count / 1500));
      for (let i = 0; i < pos.count; i += stride) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(toGroup).clone());
    });
    if (pts.length > 8) {
      const hull = new THREE.Mesh(new ConvexGeometry(pts), SHADOW_ONLY);
      hull.castShadow = true;
      hull.receiveShadow = false;
      group.add(hull);
    }
  }
  const r = asset.info.wheelRadius;
  for (const w of wheels) {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 0.7, 12).rotateX(Math.PI / 2), SHADOW_ONLY);
    cyl.castShadow = true;
    w.spin.add(cyl);
  }
}

/**
 * Sombra de contacto: una mancha oscura y suave justo debajo del auto. La sombra del sol sola
 * no alcanza (con el sol bajo cae lejos, en la sombra no hay) y el auto parece flotar.
 */
let blobTexture = null;
function contactShadow(profile) {
  if (!blobTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,1)');
    grd.addColorStop(0.55, 'rgba(0,0,0,0.75)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    blobTexture = new THREE.CanvasTexture(c);
  }
  const mat = new THREE.MeshBasicMaterial({
    map: blobTexture, color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(profile.LENGTH * 1.15, profile.WIDTH * 1.3).rotateX(-Math.PI / 2), mat);
  // a la altura de la parte de abajo de las ruedas (en reposo)
  const bottom = profile.WHEELS
    ? Math.min(...profile.WHEELS.map((w) => w.y)) - profile.WHEEL_RADIUS
    : -profile.HEIGHT / 2 - profile.RIDE_HEIGHT;
  m.position.y = bottom + 0.02;
  m.renderOrder = 1;
  m.castShadow = m.receiveShadow = false;
  return m;
}

/**
 * Pinta la carrocería del modelo GLB. Los materiales del modelo se comparten entre todas las
 * copias, así que se clona el de la pintura para este auto. Devuelve los clonados (para liberarlos).
 */
function paintBody(root, id, hex) {
  const paint = CARS[id]?.paint;
  if (!paint || hex == null) return [];
  const copies = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = [o.material].flat().map((m) => {
      if (!m.name?.startsWith(paint.material)) return m;
      if (!copies.has(m)) {
        const c = m.clone();
        c.color.set(hex);
        if (!paint.keepTexture) c.map = null;
        copies.set(m, c);
      }
      return copies.get(m);
    });
    o.material = Array.isArray(o.material) ? mats : mats[0];
  });
  return [...copies.values()];
}

/**
 * Crea el auto que se ve. Si hay modelo GLB lo usa; si no, el de cajitas.
 * vehicle puede ser null (showroom): las ruedas quedan en su lugar de reposo.
 * color: clave de COLORS ('original' o null = la pintura del modelo).
 */
export function createCarModel(id, profile, vehicle, asset = null, color = null) {
  const group = new THREE.Group();
  const wheels = [];
  const hex = COLORS[color]?.hex ?? null;
  let painted = [];

  if (asset) {
    // ---- Modelo GLB ----
    const off = profile.MODEL_OFFSET;
    const body = asset.scene.clone(true);
    body.position.set(off.x, off.y, off.z);
    group.add(body);
    painted = paintBody(body, id, hex);
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
        // la sombra la hace un molde simple (abajo): el modelo detallado no se dibuja 3 veces más
        o.castShadow = false;
        o.receiveShadow = true;
        // de un solo lado: así desde adentro (vista conductor) no se ve la carrocería por dentro
        for (const m of [o.material].flat()) m.side = THREE.FrontSide;
      }
    });
    addShadowProxy(group, body, wheels, asset, profile);
  } else {
    // ---- Cajitas (por si no cargó el modelo) ----
    const chassis = new THREE.Group();
    group.add(chassis);
    const build = BUILDERS[id] ?? SHAPES[profile.shape] ?? BUILDERS.luxury;
    const { wheelWidth } = build(chassis, hex == null ? profile : { ...profile, color: hex });
    for (let i = 0; i < 4; i++) {
      const w = makeWheel(profile.WHEEL_RADIUS, i < 2 ? wheelWidth[0] : wheelWidth[1]);
      group.add(w.pivot);
      wheels.push({ ...w, angle: 0 });
    }
  }

  if (typeof document !== 'undefined') group.add(contactShadow(profile));

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
      for (const m of painted) m.dispose();
    },
  };
}
