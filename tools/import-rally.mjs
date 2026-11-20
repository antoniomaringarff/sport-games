// Etapa de rally: sube por la Route de la Turbie (Cap d'Ail) hasta la Tête de Chien.
//
//   node tools/import-rally.mjs
//
// Usa los caminos reales de OpenStreetMap (assets-raw/rally/osm/turbie.json) y el relieve
// Terrarium (assets-raw/monaco/dem). Busca la ruta más corta entre la largada y la llegada
// prefiriendo las rutas de montaña, y genera public/assets/rally/:
//   stage.json   camino cada 2 m (con altura), curvas, parciales
//   terrain.bin  relieve de la montaña con el camino tallado
// Coordenadas: las mismas que Mónaco (origen en la largada del circuito), así desde la
// montaña se ve la ciudad y el mar de fondo.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { roadFeatures } from './rally-features.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RAW = path.join(ROOT, 'assets-raw');
const OUT = path.join(ROOT, 'public/assets/rally');
fs.mkdirSync(OUT, { recursive: true });

// ---------------- Parámetros ----------------
const ORIGIN = [43.73485, 7.42115];        // mismo origen que Mónaco
const START = [43.7269348, 7.3969202];     // Route de la Turbie, abajo (Cap d'Ail)
const FINISH_ROAD = 'Route de la Tête de Chien';
const PREFER = /Route de la Turbie|Tête de Chien/; // caminos preferidos (más baratos)
const WIDTH = 7;                            // ancho del camino
const STEP = 2;
const CELL = 4;                             // resolución del relieve cercano
const MARGIN = 350;                         // relieve alrededor del camino
const CAR_ROADS = /^(primary|secondary|tertiary|unclassified|residential|service|track|living_street)(_link)?$/;

const M_LAT = 111132.9, M_LON = 111319.5 * Math.cos((ORIGIN[0] * Math.PI) / 180);
const toLocal = (lat, lon) => [(lon - ORIGIN[1]) * M_LON, -(lat - ORIGIN[0]) * M_LAT];
const toLatLon = (x, z) => [ORIGIN[0] - z / M_LAT, ORIGIN[1] + x / M_LON];

// ---------------- Relieve ----------------
const tiles = new Map();
function px(z, x, y) {
  const n = 2 ** z * 256;
  x = Math.max(0, Math.min(n - 1, x));
  y = Math.max(0, Math.min(n - 1, y));
  const k = `${z}/${Math.floor(x / 256)}/${Math.floor(y / 256)}`;
  if (!tiles.has(k)) {
    const f = path.join(RAW, 'monaco/dem', `${k}.png`);
    tiles.set(k, fs.existsSync(f) ? PNG.sync.read(fs.readFileSync(f)) : null);
  }
  const t = tiles.get(k);
  if (!t) return null;
  const i = ((y % 256) * 256 + (x % 256)) * 4;
  return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768;
}
function elevation(lat, lon) {
  for (const z of [15, 13]) {
    const n = 2 ** z * 256;
    const fx = ((lon + 180) / 360) * n - 0.5;
    const fy = ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const v = [px(z, x0, y0), px(z, x0 + 1, y0), px(z, x0, y0 + 1), px(z, x0 + 1, y0 + 1)];
    if (v.some((a) => a === null)) continue;
    return (v[0] * (1 - tx) + v[1] * tx) * (1 - ty) + (v[2] * (1 - tx) + v[3] * tx) * ty;
  }
  return 0;
}
const elevLocal = (x, z) => elevation(...toLatLon(x, z));

// ---------------- Grafo de caminos ----------------
const osm = JSON.parse(fs.readFileSync(path.join(RAW, 'rally/osm/turbie.json'), 'utf8')).elements;
const nodes = new Map(); // "lat,lon" -> { p: [x,z], ll, edges: [{ to, w }] }
const key = (p) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
let finishCandidates = [];
for (const e of osm) {
  if (e.type !== 'way' || !e.geometry || !CAR_ROADS.test(e.tags?.highway ?? '')) continue;
  const prefer = PREFER.test(e.tags.name ?? '');
  const oneway = e.tags.oneway === 'yes';
  for (let i = 0; i < e.geometry.length; i++) {
    const g = e.geometry[i];
    const k = key(g);
    if (!nodes.has(k)) nodes.set(k, { k, p: toLocal(g.lat, g.lon), ll: [g.lat, g.lon], edges: [], names: new Set() });
    nodes.get(k).names.add(e.tags.name ?? `(${e.tags.highway})`);
    if (e.tags.name === FINISH_ROAD) finishCandidates.push(k);
    if (i === 0) continue;
    const a = nodes.get(key(e.geometry[i - 1])), b = nodes.get(k);
    const d = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]);
    const w = d * (prefer ? 0.4 : 1) * (e.tags.highway === 'service' ? 3 : 1);
    a.edges.push({ to: b.k, w });
    if (!oneway) b.edges.push({ to: a.k, w });
  }
}
console.log(`Grafo: ${nodes.size} nodos`);

const nearestNode = (ll) => {
  const p = toLocal(...ll);
  let best = null, bd = Infinity;
  for (const n of nodes.values()) {
    const d = Math.hypot(n.p[0] - p[0], n.p[1] - p[1]);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
};
const startNode = nearestNode(START);
// llegada: el punto más alto de la Route de la Tête de Chien
let finishNode = null, top = -Infinity;
for (const k of new Set(finishCandidates)) {
  const n = nodes.get(k);
  const h = elevation(...n.ll);
  if (h > top) { top = h; finishNode = n; }
}
console.log(`Largada ${elevation(...startNode.ll).toFixed(0)} m · llegada ${top.toFixed(0)} m`);

// Dijkstra
const dist = new Map([[startNode.k, 0]]), prev = new Map();
const open = new Set([startNode.k]);
while (open.size) {
  let u = null, ud = Infinity;
  for (const k of open) if (dist.get(k) < ud) { ud = dist.get(k); u = k; }
  open.delete(u);
  if (u === finishNode.k) break;
  for (const { to, w } of nodes.get(u).edges) {
    const nd = ud + w;
    if (nd < (dist.get(to) ?? Infinity)) {
      dist.set(to, nd);
      prev.set(to, u);
      open.add(to);
    }
  }
}
if (!prev.has(finishNode.k)) throw new Error('No se encontró camino entre la largada y la llegada');
const route = [];
const names = [];
for (let k = finishNode.k; k; k = prev.get(k)) {
  route.unshift(nodes.get(k).p);
  const nm = [...nodes.get(k).names].join('/');
  if (names[0] !== nm) names.unshift(nm);
}
console.log('Recorrido:', names.filter((n, i) => n !== names[i - 1]).join(' → '));

// ---------------- Camino suave cada 2 m ----------------
let pts = resampleOpen(dedupe(route), STEP);
const N = pts.length;
let ys = pts.map(([x, z]) => elevLocal(x, z));
ys = smooth(ys, 12);
ys = smooth(ys, 6);
const heading = pts.map((p, i) => {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
});
let curv = heading.map((h, i) => {
  if (i < 2 || i > N - 3) return 0;
  let d = heading[i + 2] - heading[i - 2];
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return d / (4 * STEP);
});
curv = smooth(curv, 3);
// lomas, ondulaciones y tramos de tierra / piedra (antes de tallar el terreno)
const feat = roadFeatures(ys, curv, STEP, 7);
ys = feat.ys;
const len = N * STEP;
const climb = Math.max(...ys) - Math.min(...ys);
const hairpins = countCorners(curv, 1 / 15);
console.log(`Etapa: ${(len / 1000).toFixed(2)} km, desnivel ${climb.toFixed(0)} m, ${hairpins} horquillas`);

// ---------------- Relieve cercano con el camino tallado ----------------
const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
const x0 = Math.floor((Math.min(...xs) - MARGIN) / CELL) * CELL;
const z0 = Math.floor((Math.min(...zs) - MARGIN) / CELL) * CELL;
const size = Math.ceil(Math.max(Math.max(...xs) - x0 + MARGIN, Math.max(...zs) - z0 + MARGIN) / CELL) * CELL;
const n = size / CELL + 1;
const h = new Float32Array(n * n);
for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
  let e = elevLocal(x0 + i * CELL, z0 + j * CELL);
  if (e <= 0.3) e = -6;
  h[j * n + i] = e;
}
// tallar
const hash = new Map();
pts.forEach((p, i) => {
  const k = `${Math.floor(p[0] / 20)},${Math.floor(p[1] / 20)}`;
  if (!hash.has(k)) hash.set(k, []);
  hash.get(k).push(i);
});
const inner = WIDTH / 2 + 2, outer = WIDTH / 2 + 22;
for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
  const x = x0 + i * CELL, z = z0 + j * CELL;
  const ci = Math.floor(x / 20), cj = Math.floor(z / 20);
  let best = null;
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
    for (const k of hash.get(`${ci + a},${cj + b}`) ?? []) {
      if (k >= N - 1) continue;
      const r = segDist([x, z], pts[k], pts[k + 1]);
      if (!best || r.d < best.d) best = { ...r, k };
    }
  }
  if (!best || best.d > outer) continue;
  // bien por debajo del camino: las ondulaciones del camino no deben quedar tapadas
  const roadY = ys[best.k] * (1 - best.t) + ys[best.k + 1] * best.t - 0.5;
  const cur = h[j * n + i];
  if (best.d <= inner) h[j * n + i] = roadY;
  else {
    const t = smoothstep((best.d - inner) / (outer - inner));
    h[j * n + i] = roadY * (1 - t) + cur * t;
  }
}

// ---------------- Guardar ----------------
fs.writeFileSync(path.join(OUT, 'terrain.bin'), Buffer.from(h.buffer));
const stage = {
  source: { map: '© OpenStreetMap contributors (ODbL)', elevation: 'Terrarium elevation tiles (AWS Open Data)' },
  name: 'Tête de Chien',
  width: WIDTH,
  step: STEP,
  length: len,
  climb: Math.round(climb),
  points: pts.map(([x, z], i) => [round(x), round(ys[i]), round(z)]),
  curvature: curv.map((c) => Math.round(c * 1e4) / 1e4),
  splits: [0.25, 0.5, 0.75].map((f) => Math.round(N * f)),
  surfaces: feat.surfaces,
  bumps: feat.bumps,
  terrain: { file: 'terrain.bin', n, cell: CELL, size, x0, z0 },
};
fs.writeFileSync(path.join(OUT, 'stage.json'), JSON.stringify(stage));
console.log(`✓ public/assets/rally/stage.json (${(fs.statSync(path.join(OUT, 'stage.json')).size / 1024).toFixed(0)} KB)`);
console.log(`✓ public/assets/rally/terrain.bin (${n}×${n}, ${(h.byteLength / 1024).toFixed(0)} KB)`);

// =====================================================================
function dedupe(p) {
  return p.filter((q, i) => i === 0 || Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) > 0.5);
}
function resampleOpen(poly, step) {
  const dense = [];
  for (let i = 0; i < poly.length - 1; i++) {
    const p0 = poly[Math.max(0, i - 1)], p1 = poly[i], p2 = poly[i + 1], p3 = poly[Math.min(poly.length - 1, i + 2)];
    const segs = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.5));
    for (let s = 0; s < segs; s++) dense.push(catmull(p0, p1, p2, p3, s / segs));
  }
  dense.push(poly[poly.length - 1]);
  const out = [dense[0]];
  let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    let from = dense[i - 1];
    const b = dense[i];
    let d = Math.hypot(b[0] - from[0], b[1] - from[1]);
    while (acc + d >= step) {
      const t = (step - acc) / d;
      const q = [from[0] + (b[0] - from[0]) * t, from[1] + (b[1] - from[1]) * t];
      out.push(q);
      d -= step - acc;
      from = q;
      acc = 0;
    }
    acc += d;
  }
  return out;
}
function catmull(p0, p1, p2, p3, t) {
  const D = (a, b) => Math.pow(Math.hypot(a[0] - b[0], a[1] - b[1]) || 1e-6, 0.5);
  const t0 = 0, t1 = t0 + D(p0, p1), t2 = t1 + D(p1, p2), t3 = t2 + D(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const L = (a, b, ta, tb) => [0, 1].map((k) => ((tb - tt) / (tb - ta)) * a[k] + ((tt - ta) / (tb - ta)) * b[k]);
  const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  return L(L(A1, A2, t0, t2), L(A2, A3, t1, t3), t1, t2);
}
function smooth(arr, r) {
  const n = arr.length, out = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let k = -r; k <= r; k++) {
      const j = i + k;
      if (j < 0 || j >= n) continue;
      s += arr[j];
      c++;
    }
    out[i] = s / c;
  }
  return out;
}
function countCorners(c, th) {
  let count = 0, inC = false;
  for (const v of c) {
    if (Math.abs(v) > th && !inC) { count++; inC = true; } else if (Math.abs(v) < th * 0.5) inC = false;
  }
  return count;
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  return { d: Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t), t };
}
function smoothstep(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}
function round(v) {
  return Math.round(v * 100) / 100;
}
