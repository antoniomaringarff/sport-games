// Etapa de rally en la Tête de Chien: camino de ripio real (OSM) que sube desde Cap d'Ail,
// relieve real, árboles y piedras, postes en los bordes, largada, parciales y llegada en el mirador.
// De fondo se ven Mónaco (edificios), el mar y las montañas.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WorldBuilder } from './builder.js';
import { ribbonMaterial, pbrMaps } from './pbr.js';
import { plantTrees } from './trees.js';
import { Q } from '../core/graphics.js';
import { makeTrack, ribbon, rangeIdx, buildTerrain, buildFar, buildSea, buildBuildings, gridGeometry, terrainMaterial } from './monaco.js';

const BASE = import.meta.env.BASE_URL;

/** id: 'rally' (Tête de Chien, con Mónaco de fondo) o 'condor' (El Cóndor, Córdoba). */
export async function loadRallyData(id = 'rally') {
  const get = async (u) => (await fetch(BASE + u)).json();
  const bin = async (u) => new Float32Array(await (await fetch(BASE + u)).arrayBuffer());
  if (id === 'condor') {
    const dir = 'assets/rally-condor/';
    const stage = await get(dir + 'stage.json');
    const [terrain, far] = await Promise.all([bin(dir + stage.terrain.file), bin(dir + stage.far.file)]);
    return { id, stage, terrain, far };
  }
  const [stage, monaco] = await Promise.all([get('assets/rally/stage.json'), get('assets/monaco/monaco.json')]);
  const [terrain, monacoNear, far] = await Promise.all([
    bin('assets/rally/terrain.bin'),
    bin(`assets/monaco/${monaco.terrain.file}`),
    bin(`assets/monaco/${monaco.far.file}`),
  ]);
  return { id, stage, monaco, terrain, monacoNear, far };
}

// Cómo se ve cada etapa
const LOOKS = {
  rally: {
    terrain: { forest: 0.7, dry: 0 },
    splat: {},
    gravel: new THREE.Color(0.98, 1.22, 1.5), // caliza: gris beige
    dirt: new THREE.Color(1.12, 1.02, 0.92),
    // probabilidades: árbol, arbusto (el resto, piedra)
    plants: { tree: 0.42, bush: 0.38, kinds: [['carrasco', 0.62], ['pinon', 0.23], ['olivo', 0.08], ['cipres', 0.07]], bushKind: 'arbusto', bigRocks: 0.1 },
  },
  condor: {
    // pastizal de altura de las Sierras Grandes: seco, mucho granito, casi sin árboles
    terrain: { forest: 0.05, dry: 0.5 },
    splat: { snow: 1e9, rock: [0.3, 0.65], sand: false },
    gravel: new THREE.Color(0.95, 1.25, 1.62), // granito: gris claro
    dirt: new THREE.Color(1.0, 0.95, 0.9),
    plants: { tree: 0.06, bush: 0.5, kinds: [['olivo', 1]], bushKind: 'paja', bigRocks: 0.35 },
  },
};

export function buildRally(physics, scene, data) {
  const { stage, monaco } = data;
  const look = LOOKS[data.id] ?? LOOKS.rally;
  const b = new WorldBuilder(physics, scene);
  const track = makeTrack({ ...stage }, false);
  const W = stage.width / 2;

  let sea = null;
  if (monaco) {
    // Relieve de la montaña (con física) + Mónaco y el fondo solo para mirar
    buildTerrain(b, stage.terrain, data.terrain, 'pasto', null, look.terrain);
    buildBackdropTerrain(scene, monaco.terrain, data.monacoNear, stage.terrain);
    buildBuildings(scene, monaco.buildings);
    buildFar(scene, monaco.far, data.far, [monaco.terrain, stage.terrain]);
    sea = buildSea(scene, { g: monaco.terrain, heights: data.monacoNear });
  } else {
    // etapa grande: relieve detallado solo cerca del camino + sierras de fondo
    buildCorridorTerrain(b, stage.terrain, data.terrain, track, look);
    buildOwnFar(scene, stage.far, data.far, track, look);
  }

  buildRoad(b, track, stage, look);
  buildPosts(scene, track);
  buildTreesAndRocks(b, track, stage.terrain, data.terrain, look);
  buildRoadRocks(b, track, stage);

  // Largada, parciales y llegada
  const finishIdx = track.n - 15;
  arch(scene, track, 6, 'LARGADA', '#d8262e');
  stage.splits.forEach((k, i) => arch(scene, track, k, `PARCIAL ${i + 1}`, '#1f6fb0', 0.75));
  arch(scene, track, finishIdx, 'LLEGADA', '#111111', 1, true);

  const spawnAt = (i, lateral = 0) => {
    const k = Math.max(0, Math.min(track.n - 1, i));
    const p = track.p[k], r = track.r[k], d = track.d[k];
    return { x: p.x + r.x * lateral, y: p.y + 1.2, z: p.z + r.z * lateral, yaw: Math.atan2(-d.z, d.x) };
  };

  return {
    builder: b,
    track,
    finishIdx,
    spawn: spawnAt(2),
    spawnAt,
    update(dt) {
      sea?.update(dt);
    },
  };
}

/** Camino por tramos: tierra (más lisa, marrón) y ripio (piedra suelta, gris, patina más). */
function buildRoad(b, track, stage, look) {
  const { physics, scene } = b;
  const W = stage.width / 2;
  const segs = stage.surfaces ?? [[0, track.n - 1, 'tierra']];
  const width = 2 * W + 1.6;
  const mats = {
    ripio: ribbonMaterial('gravel_road', 8, width, 3.5, look.gravel),
    tierra: ribbonMaterial('gravel_road', 8, width, 6, look.dirt),
  };
  mats.tierra.normalScale.set(0.45, 0.45);
  mats.ripio.normalScale.set(1.4, 1.4);
  for (const [a, bb, kind] of segs) {
    const idx = [];
    for (let k = a; k <= Math.min(bb, track.n - 1); k++) idx.push(k);
    if (idx.length < 2) continue;
    const road = ribbon(track, idx, () => [-W - 0.8, 0.03, W + 0.8, 0.03], { uScale: 8 });
    const mesh = new THREE.Mesh(road, mats[kind] ?? mats.tierra);
    mesh.receiveShadow = true;
    scene.add(mesh);
    const col = physics.world.createCollider(
      physics.RAPIER.ColliderDesc.trimesh(
        new Float32Array(road.attributes.position.array),
        new Uint32Array(road.index.array),
        physics.RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES_TWO_SIDED,
      ).setFriction(0.9),
    );
    physics.setSurface(col, kind === 'ripio' ? 'ripio' : 'tierra');
  }
  // banquinas
  const all = rangeIdx(track.n, 0, track.n - 1);
  const shoulderMat = ribbonMaterial('forest_ground_04', 10, 1.4, 3, 0xd8d0c4);
  for (const s of [-1, 1]) {
    // baja hasta el terreno (que queda medio metro por debajo del camino)
    const g = ribbon(track, all, () => [s * (W + 0.8), 0.025, s * (W + 2.6), -0.65]);
    const m = new THREE.Mesh(g, shoulderMat);
    m.receiveShadow = true;
    scene.add(m);
  }
}

/**
 * Piedras en el camino: chicas y sueltas en los tramos de ripio (te sacuden), y rocas que se
 * meten en la cuerda de las curvas cerradas (si cortás la curva, las pegás).
 */
function buildRoadRocks(b, track, stage) {
  const rnd = mulberry(99);
  const W = stage.width / 2;
  const small = [], apex = [];
  const segs = stage.surfaces ?? [];
  const isRipio = new Uint8Array(track.n);
  for (const [a, bb, kind] of segs) if (kind === 'ripio') for (let k = a; k <= bb && k < track.n; k++) isRipio[k] = 1;
  const at = (k, lat) => {
    const p = track.p[k], r = track.r[k];
    return [p.x + r.x * lat, p.y, p.z + r.z * lat];
  };
  for (let k = 10; k < track.n - 10; k += 1 + Math.floor(rnd() * 3)) {
    if (!isRipio[k] || rnd() < 0.35) continue;
    const s = 0.1 + rnd() * rnd() * 0.22;
    small.push([...at(k, (rnd() * 2 - 1) * (W - 0.2)), s]);
  }
  // curvas cerradas: rocas en la parte de adentro, un poco metidas en el camino
  const curv = stage.curvature ?? [];
  for (let k = 5; k < track.n - 5; k++) {
    const c = curv[k] ?? 0;
    if (Math.abs(c) < 1 / 28 || Math.abs(c) < Math.abs(curv[k - 1]) || Math.abs(c) < Math.abs(curv[k + 1])) continue;
    if (rnd() < 0.5) continue; // no en todas
    const n = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const kk = Math.min(track.n - 1, Math.max(0, k + Math.round((rnd() - 0.5) * 8)));
      const s = 0.3 + rnd() * 0.35;
      // al borde de adentro: se meten un poco en el camino (más cuanto más grandes)
      apex.push([...at(kk, Math.sign(c) * (W + 0.45 + rnd() * 0.5)), s]);
    }
  }
  const mat = new THREE.MeshStandardMaterial({ ...pbrMaps('rock_face_03'), color: 0xcfcac2, roughness: 1 });
  const geo = boulderGeometry(mulberry(5));
  const put = (list, sink) => {
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach(([x, y, z, s], i) => {
      q.setFromEuler(e.set(rnd() * 3, rnd() * 6, rnd() * 3));
      m.compose(new THREE.Vector3(x, y - s * sink, z), q, new THREE.Vector3(s * (0.9 + rnd() * 0.4), s * 0.75, s * (0.9 + rnd() * 0.4)));
      inst.setMatrixAt(i, m);
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    b.scene.add(inst);
  };
  put(small, 0.5);
  put(apex, 0.3);
  const R = b.R;
  // las chicas: bultos que hacen saltar las ruedas (no son "pared")
  for (const [x, y, z, s] of small) b.world.createCollider(R.ColliderDesc.ball(s * 0.8).setTranslation(x, y - s * 0.5, z).setFriction(0.8));
  // las de las curvas: se raspan como una pared
  for (const [x, y, z, s] of apex) {
    const col = b.world.createCollider(R.ColliderDesc.ball(s * 0.75).setTranslation(x, y - s * 0.3, z).setFriction(0.3));
    b.physics.markWall(col);
  }
}

/**
 * Relieve de una etapa grande: la física usa toda la grilla, pero se dibuja solo cerca del
 * camino, en pedazos (los que no se ven no se dibujan) con 3 niveles de detalle.
 */
function buildCorridorTerrain(b, g, heights, track, look) {
  const { n, cell, size, x0, z0 } = g;
  const hf = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) hf[i * n + j] = heights[j * n + i];
  const desc = b.R.ColliderDesc.heightfield(n - 1, n - 1, hf, { x: size, y: 1, z: size })
    .setTranslation(x0 + size / 2, 0, z0 + size / 2)
    .setFriction(0.8);
  b.physics.setSurface(b.world.createCollider(desc), 'pasto');

  const mat = terrainMaterial(9, look.terrain);
  const C = 64;
  const reach = (g.corridor ?? 450) + C * cell * 0.75;
  const pts = track.p.filter((_, i) => i % 10 === 0);
  const white = () => [1, 1, 1];
  for (let j0 = 0; j0 < n - 1; j0 += C) {
    for (let i0 = 0; i0 < n - 1; i0 += C) {
      const cx = x0 + (i0 + C / 2) * cell, cz = z0 + (j0 + C / 2) * cell;
      if (!pts.some((p) => Math.hypot(p.x - cx, p.z - cz) < reach)) continue;
      const cells = Math.min(C, n - 1 - i0, n - 1 - j0);
      const lod = new THREE.LOD();
      [1, 2, 4].forEach((step, level) => {
        const m = Math.floor(cells / step) + 1;
        const hs = new Float32Array(m * m);
        for (let jj = 0; jj < m; jj++) for (let ii = 0; ii < m; ii++) {
          hs[jj * m + ii] = heights[Math.min(n - 1, j0 + jj * step) * n + Math.min(n - 1, i0 + ii * step)];
        }
        const geo = gridGeometry(m, cell * step, x0 + i0 * cell, z0 + j0 * cell, hs, white, look.splat);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.receiveShadow = true;
        lod.addLevel(mesh, [0, 420, 1000][level]);
      });
      b.scene.add(lod);
    }
  }
}

/** Sierras de fondo: escondidas (más abajo) cerca del camino, donde está el relieve detallado. */
function buildOwnFar(scene, g, heights, track, look) {
  const { n, cell, x0, z0 } = g;
  const h = heights.slice();
  const r = Math.ceil(380 / cell);
  for (let k = 0; k < track.n; k += 5) {
    const p = track.p[k];
    const ci = Math.round((p.x - x0) / cell), cj = Math.round((p.z - z0) / cell);
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      if (Math.hypot(di, dj) * cell < 380) h[j * n + i] -= 60;
    }
  }
  const geo = gridGeometry(n, cell, x0, z0, h, () => [1, 1, 1], look.splat);
  const mesh = new THREE.Mesh(geo, terrainMaterial(14, look.terrain));
  mesh.position.y = -3;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

/** Terreno de Mónaco para mirar de lejos, escondido donde está la montaña del rally. */
function buildBackdropTerrain(scene, g, heights, hole) {
  const h = heights.slice();
  const { n, cell, x0, z0 } = g;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = x0 + i * cell, z = z0 + j * cell;
    if (x > hole.x0 + 8 && x < hole.x0 + hole.size - 8 && z > hole.z0 + 8 && z < hole.z0 + hole.size - 8) h[j * n + i] = -30;
  }
  const geo = gridGeometry(n, cell, x0, z0, h, (y, slope) => (y < 1.2 ? [0.82, 0.76, 0.6] : slope > 0.9 ? [0.55, 0.52, 0.48] : [0.42, 0.5, 0.3]));
  const mesh = new THREE.Mesh(geo, terrainMaterial());
  mesh.position.y = -0.2;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

/** Postes blancos con punta roja a los costados, cada 20 m. */
function buildPosts(scene, track) {
  const W = track.width / 2 + 1.6;
  const geo = mergeGeometries([
    new THREE.CylinderGeometry(0.08, 0.1, 1.0, 6).translate(0, 0.5, 0),
    new THREE.CylinderGeometry(0.085, 0.085, 0.18, 6).translate(0, 0.9, 0),
  ], true);
  const mats = [new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }), new THREE.MeshStandardMaterial({ color: 0xd8262e })];
  const step = Math.round(20 / track.step);
  const count = Math.ceil(track.n / step) * 2;
  const inst = new THREE.InstancedMesh(geo, mats, count);
  const m = new THREE.Matrix4();
  let c = 0;
  for (let k = 0; k < track.n; k += step) {
    const p = track.p[k], r = track.r[k];
    for (const s of [-1, 1]) {
      m.makeTranslation(p.x + r.x * W * s, p.y - 0.1, p.z + r.z * W * s);
      inst.setMatrixAt(c++, m);
    }
  }
  inst.count = c;
  inst.castShadow = true;
  scene.add(inst);
}

/** Pinos, arbustos y piedras al costado del camino; los cercanos se pueden chocar. */
function buildTreesAndRocks(b, track, g, heights, look) {
  const P = look.plants;
  const rnd = mulberry(7);
  const W = track.width / 2;
  const hash = new Map();
  track.p.forEach((p, i) => {
    const key = `${Math.floor(p.x / 20)},${Math.floor(p.z / 20)}`;
    if (!hash.has(key)) hash.set(key, []);
    hash.get(key).push(i);
  });
  const distToRoad = (x, z) => {
    let best = Infinity;
    const ci = Math.floor(x / 20), cj = Math.floor(z / 20);
    for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) {
      for (const i of hash.get(`${ci + a},${cj + c}`) ?? []) best = Math.min(best, Math.hypot(track.p[i].x - x, track.p[i].z - z));
    }
    return best;
  };
  const hAt = (x, z) => {
    const fx = (x - g.x0) / g.cell, fz = (z - g.z0) / g.cell;
    const i = Math.max(0, Math.min(g.n - 2, Math.floor(fx))), j = Math.max(0, Math.min(g.n - 2, Math.floor(fz)));
    return heights[j * g.n + i];
  };

  const trees = [], rocks = [];
  const plants = [];
  // a lo largo del camino, a los dos lados (más tupido cerca, ralo lejos)
  for (let k = 0; k < track.n; k += 2) {
    const p = track.p[k], r = track.r[k];
    for (let t = 0; t < 3; t++) {
      const side = rnd() < 0.5 ? -1 : 1;
      const off = W + 3.5 + rnd() * rnd() * 110;
      const x = p.x + r.x * off * side + (rnd() - 0.5) * 6, z = p.z + r.z * off * side + (rnd() - 0.5) * 6;
      if (distToRoad(x, z) < W + 3) continue;
      const y = hAt(x, z);
      if (y < 2) continue;
      const slope = Math.hypot(hAt(x + 3, z) - hAt(x - 3, z), hAt(x, z + 3) - hAt(x, z - 3)) / 6;
      const roll = rnd();
      if (slope > 0.75 || roll >= P.tree + P.bush) {
        // en las laderas empinadas, piedras; si no, alguna suelta (y algunas grandes, lejos del camino)
        const big = rnd() < P.bigRocks && distToRoad(x, z) > W + 10;
        rocks.push([x, y, z, big ? 1.8 + rnd() * 2.6 : 0.4 + rnd() * rnd() * 2.4, rnd() * 6]);
      } else if (roll < P.tree) {
        let kr = rnd(), kind = P.kinds[0][0];
        for (const [k, w] of P.kinds) { if (kr < w) { kind = k; break; } kr -= w; }
        const s = 0.7 + rnd() * 0.55;
        plants.push({ kind, x, y, z, s, rot: rnd() * 6.28 });
        trees.push([x, y, z, s]);
      } else {
        plants.push({ kind: P.bushKind, x, y, z, s: 0.6 + rnd() * 0.8, rot: rnd() * 6.28 });
      }
    }
  }
  // en calidad media/baja, menos plantas lejos del camino (las cercanas se chocan: quedan todas)
  plantTrees(b.scene, plants.filter((p) => distToRoad(p.x, p.z) < 30 || rnd() < (Q.trees ?? 1)), { thin: false });

  // piedras: varias formas, roca real, medio enterradas y giradas en todos los ejes
  const rockMaps = pbrMaps('rock_face_03');
  const rockMat = new THREE.MeshStandardMaterial({ ...rockMaps, color: 0xd6d2cc, roughness: 1 });
  const shapes = [0, 1, 2, 3].map((v) => boulderGeometry(mulberry(50 + v)));
  const perShape = shapes.map(() => []);
  rocks.forEach((rk, i) => perShape[i % shapes.length].push(rk));
  shapes.forEach((geo, v) => {
    const list = perShape[v];
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(geo, rockMat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const tint = new THREE.Color();
    list.forEach(([x, y, z, s, rot], i) => {
      q.setFromEuler(e.set(rnd() * 0.5, rot, rnd() * 0.5));
      m.compose(new THREE.Vector3(x, y - s * 0.35, z), q, new THREE.Vector3(s * (0.9 + rnd() * 0.5), s * (0.6 + rnd() * 0.4), s * (0.9 + rnd() * 0.5)));
      inst.setMatrixAt(i, m);
      const k = 0.8 + rnd() * 0.3;
      inst.setColorAt(i, tint.setRGB(k, k * 0.98, k * 0.95));
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    b.scene.add(inst);
  });

  // Los árboles y piedras cerca del camino se chocan (se raspan como una pared)
  const R = b.R;
  for (const [x, y, z, s] of trees) {
    if (distToRoad(x, z) > 30) continue;
    const col = b.world.createCollider(R.ColliderDesc.cylinder(2, 0.3 * s).setTranslation(x, y + 1.5, z).setFriction(0.2));
    b.physics.markWall(col);
  }
  for (const [x, y, z, s] of rocks) {
    if (distToRoad(x, z) > 30 || s < 0.8) continue;
    const col = b.world.createCollider(R.ColliderDesc.ball(s * 0.7).setTranslation(x, y - s * 0.35, z).setFriction(0.3));
    b.physics.markWall(col);
  }
}

/** Piedra: esfera deformada con ruido, con caras planas como roca partida. UV por proyección. */
function boulderGeometry(rnd) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const pos = g.attributes.position;
  const planes = Array.from({ length: 5 }, () => [new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), 0.55 + rnd() * 0.3]);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let r = 1 + 0.12 * Math.sin(v.x * 5 + rnd()) * Math.sin(v.y * 4) + (rnd() - 0.5) * 0.06;
    v.multiplyScalar(r);
    // cortar con planos (caras de roca)
    for (const [n, d] of planes) {
      const k = v.dot(n);
      if (k > d) v.addScaledVector(n, d - k);
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv, nrm = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i));
    const [a, b] = ax > 0.6 ? [pos.getZ(i), pos.getY(i)] : ay > 0.6 ? [pos.getX(i), pos.getZ(i)] : [pos.getX(i), pos.getY(i)];
    uv.setXY(i, a * 0.5, b * 0.5);
  }
  return g;
}

/** Arco con cartel (largada, parciales, llegada). */
function arch(scene, track, k, text, color, scale = 1, checkered = false) {
  const W = track.width / 2 + 2;
  const p = track.p[k], r = track.r[k], d = track.d[k];
  const g = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.5 * scale, 0.3), postMat);
    post.position.set(0, (5.5 * scale) / 2, s * W);
    post.castShadow = true;
    g.add(post);
  }
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d');
  if (checkered) {
    for (let x = 0; x < 32; x++) for (let y = 0; y < 6; y++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff';
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(110, 14, 292, 68);
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 96);
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 60px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const dark = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const face = new THREE.MeshStandardMaterial({ map: tex });
  // la caja es fina en X (el sentido del camino): las caras ±X llevan el cartel
  const banner = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1 * scale, W * 2 + 0.3), [face, face, dark, dark, dark, dark]);
  banner.position.y = 5.5 * scale - 0.5;
  banner.castShadow = true;
  g.add(banner);
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = Math.atan2(-d.z, d.x);
  scene.add(g);
}

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
