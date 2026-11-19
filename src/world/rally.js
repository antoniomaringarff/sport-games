// Etapa de rally en la Tête de Chien: camino de ripio real (OSM) que sube desde Cap d'Ail,
// relieve real, árboles y piedras, postes en los bordes, largada, parciales y llegada en el mirador.
// De fondo se ven Mónaco (edificios), el mar y las montañas.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WorldBuilder } from './builder.js';
import { surfaceMaterial } from './textures.js';
import { makeTrack, ribbon, rangeIdx, buildTerrain, buildFar, buildSea, buildBuildings, gridGeometry } from './monaco.js';

const BASE = import.meta.env.BASE_URL;

export async function loadRallyData() {
  const get = async (u) => (await fetch(BASE + u)).json();
  const bin = async (u) => new Float32Array(await (await fetch(BASE + u)).arrayBuffer());
  const [stage, monaco] = await Promise.all([get('assets/rally/stage.json'), get('assets/monaco/monaco.json')]);
  const [terrain, monacoNear, far] = await Promise.all([
    bin('assets/rally/terrain.bin'),
    bin(`assets/monaco/${monaco.terrain.file}`),
    bin(`assets/monaco/${monaco.far.file}`),
  ]);
  return { stage, monaco, terrain, monacoNear, far };
}

export function buildRally(physics, scene, data) {
  const { stage, monaco } = data;
  const b = new WorldBuilder(physics, scene);
  const track = makeTrack({ ...stage }, false);
  const W = stage.width / 2;

  // Relieve de la montaña (con física) + Mónaco y el fondo solo para mirar
  buildTerrain(b, stage.terrain, data.terrain, 'pasto');
  buildBackdropTerrain(scene, monaco.terrain, data.monacoNear, stage.terrain);
  buildBuildings(scene, monaco.buildings);
  buildFar(scene, monaco.far, data.far, [monaco.terrain, stage.terrain]);
  const sea = buildSea(scene);

  // Camino de ripio
  const all = rangeIdx(track.n, 0, track.n - 1);
  const road = ribbon(track, all, () => [-W - 0.8, 0.03, W + 0.8, 0.03], { uScale: 8 });
  const roadMat = surfaceMaterial('ripio', 1, 1, 1);
  const roadMesh = new THREE.Mesh(road, roadMat);
  roadMesh.receiveShadow = true;
  scene.add(roadMesh);
  const col = physics.world.createCollider(
    physics.RAPIER.ColliderDesc.trimesh(
      new Float32Array(road.attributes.position.array),
      new Uint32Array(road.index.array),
      physics.RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES_TWO_SIDED,
    ).setFriction(0.9),
  );
  physics.setSurface(col, 'tierra');
  // banquinas un poco más oscuras
  const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5c, roughness: 1 });
  for (const s of [-1, 1]) {
    const g = ribbon(track, all, () => [s * (W + 0.8), 0.025, s * (W + 2.2), -0.1]);
    const m = new THREE.Mesh(g, shoulderMat);
    m.receiveShadow = true;
    scene.add(m);
  }

  buildPosts(scene, track);
  buildTreesAndRocks(b, track, stage.terrain, data.terrain);

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
      sea.update(dt);
    },
  };
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
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
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
function buildTreesAndRocks(b, track, g, heights) {
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

  const trunk = new THREE.CylinderGeometry(0.18, 0.25, 2.2, 6).translate(0, 1.1, 0);
  const crown = new THREE.ConeGeometry(1.6, 4.2, 7).translate(0, 4, 0);
  const treeGeo = mergeGeometries([trunk, crown], true);
  const treeMats = [new THREE.MeshStandardMaterial({ color: 0x6b4a2b }), new THREE.MeshStandardMaterial({ color: 0x3e6b34, roughness: 0.9 })];
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x9b958a, roughness: 1, flatShading: true });
  const bushGeo = new THREE.IcosahedronGeometry(1, 0);
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x5f7a3a, roughness: 1, flatShading: true });

  const trees = [], rocks = [], bushes = [];
  // a lo largo del camino, a los dos lados
  for (let k = 0; k < track.n; k += 3) {
    const p = track.p[k], r = track.r[k];
    for (let t = 0; t < 2; t++) {
      const side = rnd() < 0.5 ? -1 : 1;
      const off = W + 4 + rnd() * rnd() * 90;
      const x = p.x + r.x * off * side + (rnd() - 0.5) * 6, z = p.z + r.z * off * side + (rnd() - 0.5) * 6;
      if (distToRoad(x, z) < W + 3.5) continue;
      const y = hAt(x, z);
      if (y < 2) continue;
      const roll = rnd();
      if (roll < 0.45) trees.push([x, y, z, 0.7 + rnd() * 0.7, rnd() * 6]);
      else if (roll < 0.75) bushes.push([x, y, z, 0.6 + rnd() * 0.9, rnd() * 6]);
      else rocks.push([x, y, z, 0.4 + rnd() * 1.4, rnd() * 6]);
    }
  }
  const place = (geo, mat, list, shadow) => {
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach(([x, y, z, s, rot], i) => {
      q.setFromEuler(e.set(0, rot, 0));
      m.compose(new THREE.Vector3(x, y - 0.2, z), q, new THREE.Vector3(s, s, s));
      inst.setMatrixAt(i, m);
    });
    inst.castShadow = shadow;
    inst.receiveShadow = true;
    b.scene.add(inst);
  };
  place(treeGeo, treeMats, trees, true);
  place(rockGeo, rockMat, rocks, true);
  place(bushGeo, bushMat, bushes, false);

  // Los árboles y piedras cerca del camino se chocan (se raspan como una pared)
  const R = b.R;
  for (const [x, y, z, s] of trees) {
    if (distToRoad(x, z) > 30) continue;
    const col = b.world.createCollider(R.ColliderDesc.cylinder(2, 0.3 * s).setTranslation(x, y + 1.5, z).setFriction(0.2));
    b.physics.markWall(col);
  }
  for (const [x, y, z, s] of rocks) {
    if (distToRoad(x, z) > 30 || s < 0.8) continue;
    const col = b.world.createCollider(R.ColliderDesc.ball(s * 0.85).setTranslation(x, y, z).setFriction(0.3));
    b.physics.markWall(col);
  }
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
