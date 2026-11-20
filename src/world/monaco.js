// Mónaco (Fase 3): relieve real, mar, el circuito con guardrails, túnel, pianos,
// edificios alrededor y tribunas. Datos generados por tools/import-monaco.mjs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { stripesTexture } from './textures.js';
import { WorldBuilder } from './builder.js';
import { terrainMaterial, splatOf, asphaltMaterial, facadeMaterial, roofMaterial, FACADE_TILE } from './pbr.js';

export { terrainMaterial };

const BASE = import.meta.env.BASE_URL;
const DATA = `${BASE}assets/monaco/`;

export async function loadMonacoData() {
  const meta = await (await fetch(`${DATA}monaco.json`)).json();
  const [near, far] = await Promise.all(
    [meta.terrain, meta.far].map(async (g) => new Float32Array(await (await fetch(DATA + g.file)).arrayBuffer())),
  );
  return { meta, near, far };
}

export async function buildMonaco(physics, scene, data) {
  const { meta } = data;
  const b = new WorldBuilder(physics, scene);
  const track = makeTrack(meta.circuit);

  buildTerrain(b, meta.terrain, data.near, 'pasto', { buildings: meta.buildings, track });
  buildFar(scene, meta.far, data.far, meta.terrain);
  const sea = buildSea(scene);
  buildRoad(b, track);
  buildKerbs(scene, track);
  buildBarriers(b, track);
  buildTunnel(b, track);
  buildStartLine(scene, track);
  buildBuildings(scene, meta.buildings);
  buildPiers(scene, meta.piers);
  buildPalms(scene, track);
  await buildProps(scene, track);

  // Lugar de largada: unos metros detrás de la línea, en el medio de la pista
  const spawnAt = (i, lateral = 0) => {
    const k = (i + track.n) % track.n;
    const p = track.p[k], r = track.r[k], d = track.d[k];
    return { x: p.x + r.x * lateral, y: p.y + 1.2, z: p.z + r.z * lateral, yaw: Math.atan2(-d.z, d.x) };
  };

  // Lugares de la grilla de largada (0 = adelante a la izquierda), 8 m entre filas
  function gridSpot(slot) {
    return spawnAt(-(10 + slot * 4), slot % 2 ? 2.6 : -2.6);
  }

  return {
    builder: b,
    track,
    spawn: gridSpot(0),
    spawnAt,
    gridSpot,
    sunsetSky: true,
    update(dt) {
      sea.update(dt);
    },
  };
}

// ---------------------------------------------------------------------------
// Pista: puntos, direcciones y laterales
/** closed = false para caminos con principio y fin (rally) */
export function makeTrack(c, closed = true) {
  const n = c.points.length;
  const p = c.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const d = [], r = [];
  for (let i = 0; i < n; i++) {
    const a = closed ? p[(i - 1 + n) % n] : p[Math.max(0, i - 1)];
    const bb = closed ? p[(i + 1) % n] : p[Math.min(n - 1, i + 1)];
    const dir = new THREE.Vector3(bb.x - a.x, 0, bb.z - a.z).normalize();
    d.push(dir);
    r.push(new THREE.Vector3(-dir.z, 0, dir.x)); // derecha
  }
  const inRun = (list) => {
    const f = new Array(n).fill(false);
    for (const [a, bb] of list) for (let k = a; ; k = (k + 1) % n) { f[k] = true; if (k === bb) break; }
    return f;
  };
  return { ...c, closed, n, p, d, r, tunnel: c.tunnel ?? [], kerbs: c.kerbs ?? [], isTunnel: inRun(c.tunnel ?? []), isKerb: inRun(c.kerbs ?? []) };
}

/** Indices de un tramo [a, b] de la vuelta (puede pasar por el 0). */
export function rangeIdx(n, a, b) {
  const out = [];
  for (let k = a; ; k = (k + 1) % n) { out.push(k); if (k === b) break; }
  return out;
}

/**
 * Cinta a lo largo de la pista.
 * idx: índices de puntos; side(i) => [lateralA, alturaA, lateralB, alturaB]
 */
export function ribbon(track, idx, side, { closed = false, uScale = 10 } = {}) {
  const pos = [], uv = [], index = [];
  let u = 0;
  const list = closed ? [...idx, idx[0]] : idx;
  list.forEach((k, j) => {
    const P = track.p[k], R = track.r[k];
    if (j > 0) u += P.distanceTo(track.p[list[j - 1]]);
    const [la, ha, lb, hb] = side(k);
    pos.push(P.x + R.x * la, P.y + ha, P.z + R.z * la, P.x + R.x * lb, P.y + hb, P.z + R.z * lb);
    uv.push(u / uScale, 0, u / uScale, 1);
    if (j < list.length - 1) {
      const q = j * 2;
      index.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
export function buildTerrain(b, g, heights, surface = 'pasto', urban = null) {
  const { n, cell, size, x0, z0 } = g;
  // Malla visible
  const geo = gridGeometry(n, cell, x0, z0, heights, (h, slope) => {
    if (h < 1.2) return [0.82, 0.76, 0.6];          // arena / costa
    if (slope > 0.9) return [0.55, 0.52, 0.48];      // roca
    return [0.34 + Math.random() * 0.05, 0.4 + Math.random() * 0.05, 0.24];
  });
  if (urban) paveCity(geo, g, urban);
  const mesh = new THREE.Mesh(geo, terrainMaterial());
  mesh.receiveShadow = true;
  b.scene.add(mesh);

  // Física: heightfield (Rapier ordena las alturas por X y después por Z)
  const hf = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) hf[i * n + j] = heights[j * n + i];
  const desc = b.R.ColliderDesc.heightfield(n - 1, n - 1, hf, { x: size, y: 1, z: size })
    .setTranslation(x0 + size / 2, 0, z0 + size / 2)
    .setFriction(0.8);
  const col = b.world.createCollider(desc);
  b.physics.setSurface(col, surface);
}

/**
 * En la ciudad no hay pasto: alrededor de los edificios y de la pista el piso es vereda / plaza.
 * Marca esas celdas en el 4.º canal del "splat" (y le saca pasto, roca y arena).
 */
function paveCity(geo, g, { buildings, track }) {
  const { n, cell, x0, z0 } = g;
  const mask = new Float32Array(n * n);
  const mark = (minX, minZ, maxX, maxZ) => {
    const i0 = Math.max(0, Math.floor((minX - x0) / cell)), i1 = Math.min(n - 1, Math.ceil((maxX - x0) / cell));
    const j0 = Math.max(0, Math.floor((minZ - z0) / cell)), j1 = Math.min(n - 1, Math.ceil((maxZ - z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) mask[j * n + i] = 1;
  };
  for (const bd of buildings) {
    let a = Infinity, bb = Infinity, c = -Infinity, d = -Infinity;
    for (let i = 0; i < bd.p.length; i += 2) {
      a = Math.min(a, bd.p[i]); c = Math.max(c, bd.p[i]);
      bb = Math.min(bb, bd.p[i + 1]); d = Math.max(d, bd.p[i + 1]);
    }
    const m = 9; // calle / vereda alrededor
    mark(a - m, bb - m, c + m, d + m);
  }
  const m = track.width / 2 + 7;
  for (const P of track.p) mark(P.x - m, P.z - m, P.x + m, P.z + m);
  // bordes suaves
  const soft = new Float32Array(n * n);
  for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
    let sum = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) sum += mask[(j + dj) * n + i + di];
    soft[j * n + i] = sum / 9;
  }
  const sp = geo.attributes.splat, pos = geo.attributes.position;
  for (let k = 0; k < n * n; k++) {
    const y = pos.getY(k);
    let v = soft[k] * (y > 0.8 ? 1 : 0) * (1 - sp.getX(k) * 0.7); // no en el agua ni en acantilados
    if (v <= 0) continue;
    sp.setXYZW(k, sp.getX(k) * (1 - v), sp.getY(k) * (1 - v), sp.getZ(k), v);
  }
}

/** holes: zonas (metas de terreno cercano) donde el fondo se esconde debajo */
export function buildFar(scene, g, heights, holes) {
  holes = [holes].flat();
  const { n, cell, x0, z0 } = g;
  const h = heights.slice();
  const m = 60;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * cell, z = z0 + j * cell;
      if (holes.some((nm) => x > nm.x0 + m && x < nm.x0 + nm.size - m && z > nm.z0 + m && z < nm.z0 + nm.size - m)) {
        h[j * n + i] = -40; // debajo del terreno cercano
      }
    }
  }
  const geo = gridGeometry(n, cell, x0, z0, h, (y, slope) => {
    if (y < 1) return [0.8, 0.74, 0.58];
    if (y > 820) return [0.95, 0.96, 0.98];               // nieve (Mont Agel, licencia del juego)
    if (y > 650) return [0.75, 0.74, 0.72];
    if (slope > 0.8) return [0.56, 0.53, 0.5];
    return [0.33, 0.39, 0.25];
  });
  const mesh = new THREE.Mesh(geo, terrainMaterial(14));
  mesh.position.y = -0.3;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

export function gridGeometry(n, cell, x0, z0, h, colorOf) {
  const pos = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const splat = new Float32Array(n * n * 4); // roca, arena, nieve, vereda (ver pbr.js)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const y = h[k];
      pos.set([x0 + i * cell, y, z0 + j * cell], k * 3);
      const dx = (h[j * n + Math.min(i + 1, n - 1)] - h[j * n + Math.max(i - 1, 0)]) / (2 * cell);
      const dz = (h[Math.min(j + 1, n - 1) * n + i] - h[Math.max(j - 1, 0) * n + i]) / (2 * cell);
      const slope = Math.hypot(dx, dz);
      col.set(colorOf(y, slope), k * 3);
      splat.set(splatOf(y, slope), k * 4);
    }
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let q = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.set([a, c, b, b, c, d], q);
      q += 6;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
  // UV en metros: la textura de detalle se repite cada 12 m
  const uv = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) uv.set([(i * cell) / 12, (j * cell) / 12], (j * n + i) * 2);
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
export function buildSea(scene) {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  // mapa de normales de olas (suma de senos, se repite sin cortes)
  const waves = [[3, 1, 0.9], [1, 4, 0.6], [5, -2, 0.4], [-3, 6, 0.25], [8, 3, 0.2]];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let nx = 0, ny = 0;
      for (const [a, bb, amp] of waves) {
        const ph = ((a * x + bb * y) / size) * Math.PI * 2;
        nx += Math.cos(ph) * a * amp;
        ny += Math.cos(ph) * bb * amp;
      }
      const k = (y * size + x) * 4;
      img.data[k] = 128 + nx * 6;
      img.data[k + 1] = 128 + ny * 6;
      img.data[k + 2] = 255;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const normal = new THREE.CanvasTexture(c);
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.repeat.set(400, 400);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x174f6e,
    roughness: 0.22,
    metalness: 0,
    envMapIntensity: 0.9,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.35, 0.35),
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), mat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0;
  sea.receiveShadow = true;
  scene.add(sea);
  return {
    update(dt) {
      normal.offset.x += dt * 0.004;
      normal.offset.y += dt * 0.0025;
    },
  };
}

// ---------------------------------------------------------------------------
function buildRoad(b, track) {
  const all = rangeIdx(track.n, 0, track.n - 1);
  const W = track.width / 2;
  const geo = ribbon(track, all, () => [-W - 0.8, 0.02, W + 0.8, 0.02], { closed: true, uScale: 10 });
  // asfalto real, una repetición cada 4 m (las UV vienen en metros/10 a lo largo y 0..1 de lado)
  const mat = asphaltMaterial(10, 2 * W + 1.6);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  b.scene.add(mesh);
  // Física: la misma malla como trimesh (sin escalones entre tramos)
  const pos = geo.attributes.position.array;
  const desc = b.R.ColliderDesc.trimesh(new Float32Array(pos), new Uint32Array(geo.index.array), b.R.TriMeshFlags.FIX_INTERNAL_EDGES_TWO_SIDED).setFriction(1);
  const col = b.world.createCollider(desc);
  b.physics.setSurface(col, 'asfalto');

  // líneas blancas del borde
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2f2ee });
  for (const s of [-1, 1]) {
    const lg = ribbon(track, all, () => [s * (W - 0.35), 0.035, s * (W - 0.2), 0.035], { closed: true });
    b.scene.add(new THREE.Mesh(lg, lineMat));
  }
}

function buildKerbs(scene, track) {
  const W = track.width / 2;
  const tex = stripesTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set(1, 1);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
  for (const [a, bb] of track.kerbs) {
    const idx = rangeIdx(track.n, a, bb);
    for (const s of [-1, 1]) {
      const g = ribbon(track, idx, () => [s * (W - 1.1), 0.045, s * (W + 0.3), 0.06], { uScale: 3 });
      // franjas a lo largo: intercambiar u/v
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i));
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      scene.add(m);
    }
  }
}

export function barrierTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#9da3a7'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#7d8388';
  g.fillRect(0, 18, 64, 6);
  g.fillRect(0, 40, 64, 6);
  g.fillStyle = '#b4babe';
  g.fillRect(0, 12, 64, 4);
  g.fillRect(0, 34, 64, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildBarriers(b, track) {
  const W = track.width / 2 + 0.9;
  const mat = new THREE.MeshStandardMaterial({ map: barrierTexture(), roughness: 0.7, metalness: 0.25, side: THREE.DoubleSide });
  // tramos fuera del túnel
  const open = [];
  let cur = [];
  for (let k = 0; k < track.n; k++) {
    if (!track.isTunnel[k]) cur.push(k);
    else if (cur.length) { open.push(cur); cur = []; }
  }
  if (cur.length) {
    if (open.length && !track.isTunnel[0]) open[0] = [...cur, ...open[0]];
    else open.push(cur);
  }
  for (const idx of open) {
    for (const s of [-1, 1]) {
      const g = ribbon(track, idx, () => [s * W, -0.2, s * W, 1.0], { uScale: 4 });
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      b.scene.add(m);
    }
  }
  // Física: una pared continua por lado (sin escalones entre tramos), que no rebota
  // y deja deslizar el auto. El "efecto" del golpe lo maneja vehicle.js (WALL en config.js).
  const all = rangeIdx(track.n, 0, track.n - 1);
  for (const s of [-1, 1]) {
    const g = ribbon(track, all, () => [s * W, -0.6, s * W, 3.5], { closed: true });
    const desc = b.R.ColliderDesc.trimesh(
      new Float32Array(g.attributes.position.array),
      new Uint32Array(g.index.array),
      b.R.TriMeshFlags.FIX_INTERNAL_EDGES_TWO_SIDED,
    )
      .setFriction(0.05)
      .setFrictionCombineRule(b.R.CoefficientCombineRule.Min)
      .setRestitution(0)
      .setRestitutionCombineRule(b.R.CoefficientCombineRule.Min);
    const col = b.world.createCollider(desc);
    b.physics.markWall(col);
    g.dispose();
  }
}

function buildTunnel(b, track) {
  const W = track.width / 2 + 0.9;
  const H = 6.5;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.85, side: THREE.DoubleSide });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8b8b88, roughness: 0.9, side: THREE.DoubleSide });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffe2a0 });
  const topMat = new THREE.MeshStandardMaterial({ color: 0xcfc4ae, roughness: 0.9 });
  for (const [a, bb] of track.tunnel) {
    // un poco más largo que el tramo para que la boca quede afuera
    const idx = rangeIdx(track.n, (a - 3 + track.n) % track.n, (bb + 3) % track.n);
    const add = (geo, mat, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadow;
      m.receiveShadow = true;
      b.scene.add(m);
    };
    add(ribbon(track, idx, () => [-W, -0.3, -W, H]), wallMat);
    add(ribbon(track, idx, () => [W, -0.3, W, H]), wallMat);
    add(ribbon(track, idx, () => [-W, H, W, H]), roofMat);
    add(ribbon(track, idx, () => [-W - 6, H + 3.5, W + 6, H + 3.5]), topMat);           // techo de arriba (el edificio)
    add(ribbon(track, idx, () => [-W - 6, -1, -W - 6, H + 3.5]), topMat);
    add(ribbon(track, idx, () => [W + 6, -1, W + 6, H + 3.5]), topMat);
    for (const s of [-1, 1]) add(ribbon(track, idx, () => [s * 2.2, H - 0.05, s * 2.6, H - 0.05]), lightMat, false);
  }
}

function buildStartLine(scene, track) {
  const W = track.width / 2;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 16;
  const g = c.getContext('2d');
  for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) {
    g.fillStyle = (x + y) % 2 ? '#111' : '#fafafa';
    g.fillRect(x * 8, y * 8, 8, 8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = ribbon(track, [0, 1], () => [-W, 0.05, W, 0.05], { uScale: 2 });
  // la textura cruza la pista: u = lateral
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), (i >> 1));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex })));
  // marcas de la grilla de largada
  const mark = new THREE.MeshBasicMaterial({ color: 0xf2f2ee });
  for (let s = 0; s < 10; s++) {
    const k = track.n - 8 - s * 4;
    const lat = s % 2 ? 2.6 : -2.6;
    const g2 = ribbon(track, [k, k + 1], () => [lat - 1.2, 0.05, lat + 1.2, 0.05]);
    scene.add(new THREE.Mesh(g2, mark));
  }
}

// ---------------------------------------------------------------------------
// tonos de fachadas reales de la Riviera: crema, ocre, salmón, piedra, blanco gastado
const PALETTE = [0xdcd0b8, 0xcfae84, 0xd8bfa0, 0xc79a78, 0xe2ddd2, 0xcdb88c, 0xb98a6c, 0xd6cdbb, 0xb2b0a8];
// tejas: terracota más o menos gastada
const ROOF_TILE = [0xffffff, 0xf0e2d6, 0xe6d8cc, 0xfff2e8];

export function buildBuildings(scene, list) {
  const walls = [], roofs = [];
  const color = new THREE.Color();
  const roofColor = new THREE.Color();
  list.forEach((bd, n) => {
    const pts = [];
    for (let i = 0; i < bd.p.length; i += 2) pts.push(new THREE.Vector2(bd.p[i], -bd.p[i + 1]));
    let geo;
    try {
      geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: bd.h, bevelEnabled: false });
    } catch {
      return;
    }
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, bd.y, 0);
    geo.clearGroups();
    geo = geo.index ? geo.toNonIndexed() : geo;
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal, uv = geo.attributes.uv, pos = geo.attributes.position;
    color.setHex(PALETTE[(n * 7) % PALETTE.length]);
    // techos: tejas de terracota en las casas bajas, gris gastado en las torres (azoteas)
    roofColor.setHex(bd.h < 16 ? ROOF_TILE[n % ROOF_TILE.length] : 0x9a948a);
    const w = [], r = [];
    for (let i = 0; i < pos.count; i += 3) {
      const isRoof = Math.abs(nrm.getY(i)) > 0.5;
      (isRoof ? r : w).push(i);
    }
    const pick = (ids, roof) => {
      const P = [], N = [], U = [], C = [];
      const c = roof ? roofColor : color;
      for (const t of ids) {
        for (let v = t; v < t + 3; v++) {
          P.push(pos.getX(v), pos.getY(v), pos.getZ(v));
          N.push(nrm.getX(v), nrm.getY(v), nrm.getZ(v));
          if (roof) U.push(pos.getX(v) / 3, pos.getZ(v) / 3);
          // paredes: el módulo de fachada (2 ventanas × 2 pisos), empezando en la vereda
          else U.push(uv.getX(v) / FACADE_TILE.w, (pos.getY(v) - bd.y) / FACADE_TILE.h);
          C.push(c.r, c.g, c.b);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      return g;
    };
    if (w.length) walls.push(pick(w, false));
    if (r.length) roofs.push(pick(r, true));
    geo.dispose();
  });
  for (const [geos, mat] of [[walls, facadeMaterial()], [roofs, roofMaterial()]]) {
    if (!geos.length) continue;
    const merged = mergeGeometries(geos, false);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

function buildPiers(scene, piers) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xc8c2b5, roughness: 0.9 });
  const geos = [];
  for (const pr of piers) {
    const pts = [];
    for (let i = 0; i < pr.p.length; i += 2) pts.push([pr.p[i], pr.p[i + 1]]);
    if (pr.closed && pts.length >= 4) {
      const shape = new THREE.Shape(pts.slice(0, -1).map(([x, z]) => new THREE.Vector2(x, -z)));
      try {
        const g = new THREE.ExtrudeGeometry(shape, { depth: 3.5, bevelEnabled: false });
        g.rotateX(-Math.PI / 2);
        g.translate(0, -2, 0);
        geos.push(g.index ? g.toNonIndexed() : g);
      } catch {}
    } else {
      // muelle angosto: una caja por tramo
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.5) continue;
        const g = new THREE.BoxGeometry(len + pr.w * 0.5, 3.5, pr.w);
        g.rotateY(Math.atan2(-(bz - az), bx - ax));
        g.translate((ax + bx) / 2, -0.25, (az + bz) / 2);
        geos.push(g.toNonIndexed());
      }
    }
  }
  if (!geos.length) return;
  for (const g of geos) g.clearGroups();
  const merged = mergeGeometries(geos.map((g) => { g.deleteAttribute('uv'); return g; }), false);
  const mesh = new THREE.Mesh(merged, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  scene.add(mesh);
}

// ---------------------------------------------------------------------------
/** Palmeras low-poly en la parte baja del circuito (puerto, costanera). */
function palmGeometry() {
  const parts = [];
  // tronco curvo: tramos de cilindro que se van inclinando
  let x = 0, y = 0, ang = 0;
  for (let i = 0; i < 6; i++) {
    const h = 1.3, r = 0.22 - i * 0.02;
    const seg = new THREE.CylinderGeometry(r * 0.9, r, h, 6);
    seg.translate(0, h / 2, 0);
    seg.rotateZ(-ang);
    seg.translate(x, y, 0);
    parts.push({ geo: seg, mat: 0 });
    x += Math.sin(ang) * h;
    y += Math.cos(ang) * h;
    ang += 0.06;
  }
  // hojas: conos aplastados que salen de la punta y caen
  for (let i = 0; i < 8; i++) {
    const leaf = new THREE.ConeGeometry(0.45, 3.4, 4, 1);
    leaf.scale(1, 1, 0.18);
    leaf.translate(0, 1.7, 0);
    leaf.rotateZ(-1.15 - (i % 2) * 0.25);
    leaf.rotateY((i / 8) * Math.PI * 2);
    leaf.translate(x, y, 0);
    parts.push({ geo: leaf, mat: 1 });
  }
  const trunk = mergeGeometries(parts.filter((p) => p.mat === 0).map((p) => p.geo.toNonIndexed()));
  const leaves = mergeGeometries(parts.filter((p) => p.mat === 1).map((p) => p.geo.toNonIndexed()));
  return mergeGeometries([trunk, leaves], true);
}

function buildPalms(scene, track) {
  const W = track.width / 2;
  const spots = [];
  let seed = 3;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < track.n; k += 9) {
    if (track.isTunnel[k] || track.p[k].y > 14) continue; // solo abajo, cerca del mar
    for (const s of [-1, 1]) {
      if (r() < 0.35) continue;
      const P = track.p[k], R = track.r[k];
      const off = s * (W + 3.5 + r() * 2.5);
      spots.push([P.x + R.x * off, P.y - 0.2, P.z + R.z * off, 0.85 + r() * 0.4, r() * Math.PI * 2]);
    }
  }
  const mats = [
    new THREE.MeshStandardMaterial({ color: 0x8a6b4a, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x4f8a3a, roughness: 0.8, side: THREE.DoubleSide }),
  ];
  const inst = new THREE.InstancedMesh(palmGeometry(), mats, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  spots.forEach(([x, y, z, s, rot], i) => {
    q.setFromEuler(e.set(0, rot, 0));
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
    inst.setMatrixAt(i, m);
  });
  inst.castShadow = true;
  inst.receiveShadow = true;
  scene.add(inst);
}

// ---------------------------------------------------------------------------
// Utilería del Racing Kit de Kenney: tribunas, pórtico de largada, banderas, carteles
async function buildProps(scene, track) {
  const loader = new GLTFLoader();
  const names = ['overheadLights', 'grandStandCovered', 'grandStandAwning', 'flagCheckers', 'bannerTowerRed', 'bannerTowerGreen', 'billboard', 'lightPostModern', 'treeLarge'];
  const models = {};
  await Promise.all(
    names.map(async (n) => {
      try {
        const g = await loader.loadAsync(`${BASE}assets/models/racing/${n}.glb`);
        models[n] = normalizeProp(g.scene);
      } catch (e) {
        console.warn('No se pudo cargar', n, e);
      }
    }),
  );
  const W = track.width / 2;
  const place = (name, k, lateral, scale, yawOffset = 0, dy = 0) => {
    const m = models[name];
    if (!m) return;
    k = (k + track.n) % track.n;
    const o = m.clone(true);
    const P = track.p[k], R = track.r[k], D = track.d[k];
    o.position.set(P.x + R.x * lateral, P.y + dy, P.z + R.z * lateral);
    o.scale.setScalar(scale);
    o.rotation.y = Math.atan2(-D.z, D.x) + yawOffset;
    o.traverse((c) => {
      if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
    });
    scene.add(o);
  };

  // Pórtico con semáforo sobre la largada
  place('overheadLights', 0, 0, 11, Math.PI / 2, -0.1);
  // Tribunas sobre la recta (lado del puerto = derecha)
  for (let k = -70; k <= 30; k += 6) place('grandStandCovered', k, W + 9, 11, -Math.PI / 2);
  // Tribunas en la Piscina y en Sainte Dévote
  for (let s = 0; s < 4; s++) place('grandStandAwning', Math.round(track.n * 0.86) + s * 6, -(W + 8), 10, Math.PI / 2);
  for (let s = 0; s < 3; s++) place('grandStandAwning', 70 + s * 6, -(W + 9), 10, Math.PI / 2);
  // Banderas, torres y carteles
  place('flagCheckers', 2, -(W + 1.6), 5, Math.PI / 2);
  for (let k = 40; k < track.n; k += 90) {
    place(k % 180 ? 'bannerTowerRed' : 'bannerTowerGreen', k, (k % 3 ? 1 : -1) * (W + 2.5), 6, Math.PI / 2);
  }
  for (let k = 120; k < track.n; k += 210) place('billboard', k, -(W + 3), 7, -Math.PI / 2);
  // Faroles en la recta
  for (let k = -80; k < 40; k += 10) place('lightPostModern', k, -(W + 1.6), 9, -Math.PI / 2);
}

/** Centra el modelo en x/z y lo apoya en y=0. */
export function normalizeProp(root) {
  const box = new THREE.Box3().setFromObject(root);
  const c = box.getCenter(new THREE.Vector3());
  const g = new THREE.Group();
  root.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
  g.add(root);
  return g;
}
