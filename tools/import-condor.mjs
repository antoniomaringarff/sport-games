// Etapa de rally "El Cóndor" (Rally Argentina, Altas Cumbres, Córdoba): el viejo Camino de las
// Altas Cumbres (Ruta Provincial 14, de ripio), de Copina hasta El Cóndor.
//
//   node tools/import-condor.mjs
//
// Entradas (assets-raw/, no se suben):
//   rally/osm/condor.json        caminos de OpenStreetMap (Overpass)
//   rally/dem-condor/{z}/{x}/{y}.png   relieve Terrarium (AWS elevation-tiles-prod), z15 cerca y z12 lejos
// Salidas (public/assets/rally-condor/):
//   stage.json   camino cada 2 m (con lomas, tramos de tierra/piedra), curvas, parciales
//   terrain.bin  relieve cercano con el camino tallado (cuadrado, se dibuja solo cerca del camino)
//   far.bin      sierras de fondo
// Coordenadas: metros, origen en la largada (Copina), X = este, Z = sur.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { roadFeatures } from './rally-features.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RAW = path.join(ROOT, 'assets-raw');
const OUT = path.join(ROOT, 'public/assets/rally-condor');
fs.mkdirSync(OUT, { recursive: true });

// ---------------- Parámetros ----------------
const START = [-31.5785, -64.7120];   // Copina, pasando los puentes colgantes
const FINISH = [-31.6113, -64.7682];  // El Cóndor (cruce con la Ruta 34, viejo acceso al hotel)
const ORIGIN = START;
const PREFER = /Ruta Provincial 14/;
const WIDTH = 6.5;
const STEP = 2;
const CELL = 6;
const MARGIN = 500;
const FAR = { size: 30000, cell: 60 };
const CAR_ROADS = /^(primary|secondary|tertiary|unclassified|residential|service|track)(_link)?$/;

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
    const f = path.join(RAW, 'rally/dem-condor', `${k}.png`);
    tiles.set(k, fs.existsSync(f) ? PNG.sync.read(fs.readFileSync(f)) : null);
  }
  const t = tiles.get(k);
  if (!t) return null;
  const i = ((y % 256) * 256 + (x % 256)) * 4;
  return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768;
}
function elevation(lat, lon, zooms = [15, 12]) {
  for (const z of zooms) {
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
const elevLocal = (x, z, zooms) => elevation(...toLatLon(x, z), zooms);

// ---------------- Grafo de caminos ----------------
const osm = JSON.parse(fs.readFileSync(path.join(RAW, 'rally/osm/condor.json'), 'utf8')).elements;
const nodes = new Map();
const key = (p) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
for (const e of osm) {
  if (e.type !== 'way' || !e.geometry || !CAR_ROADS.test(e.tags?.highway ?? '')) continue;
  const prefer = PREFER.test(e.tags.name ?? '') || /RP ?14/.test(e.tags.ref ?? '');
  const paved = /asphalt|paved|concrete/.test(e.tags.surface ?? '');
  for (let i = 0; i < e.geometry.length; i++) {
    const g = e.geometry[i];
    const k = key(g);
    if (!nodes.has(k)) nodes.set(k, { k, p: toLocal(g.lat, g.lon), ll: [g.lat, g.lon], edges: [], names: new Set() });
    nodes.get(k).names.add(e.tags.name ?? `(${e.tags.highway})`);
    if (i === 0) continue;
    const a = nodes.get(key(e.geometry[i - 1])), b = nodes.get(k);
    const d = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]);
    const w = d * (prefer ? 0.3 : 1) * (paved ? 4 : 1);
    a.edges.push({ to: b.k, w });
    b.edges.push({ to: a.k, w });
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
const startNode = nearestNode(START), finishNode = nearestNode(FINISH);
console.log(`Largada ${elevation(...startNode.ll).toFixed(0)} m · llegada ${elevation(...finishNode.ll).toFixed(0)} m`);

const dist = new Map([[startNode.k, 0]]), prev = new Map();
const open = new Set([startNode.k]);
while (open.size) {
  let u = null, ud = Infinity;
  for (const k of open) if (dist.get(k) < ud) { ud = dist.get(k); u = k; }
  open.delete(u);
  if (u === finishNode.k) break;
  for (const { to, w } of nodes.get(u).edges) {
    const nd = ud + w;
    if (nd < (dist.get(to) ?? Infinity)) { dist.set(to, nd); prev.set(to, u); open.add(to); }
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
const pts = resampleOpen(dedupe(route), STEP);
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
const feat = roadFeatures(ys, curv, STEP, 2024);
ys = feat.ys;
const len = N * STEP;
const climb = Math.max(...ys) - Math.min(...ys);
console.log(`Etapa: ${(len / 1000).toFixed(2)} km, desnivel ${climb.toFixed(0)} m, ${countCorners(curv, 1 / 15)} horquillas, ${feat.bumps.length} lomas/pozos, ${feat.surfaces.length} tramos`);

// ---------------- Relieve cercano (cuadrado) con el camino tallado ----------------
const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
const x0 = Math.floor((Math.min(...xs) - MARGIN) / CELL) * CELL;
const z0 = Math.floor((Math.min(...zs) - MARGIN) / CELL) * CELL;
const size = Math.ceil(Math.max(Math.max(...xs) - x0 + MARGIN, Math.max(...zs) - z0 + MARGIN) / CELL) * CELL;
const n = size / CELL + 1;
const h = new Float32Array(n * n);
for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = elevLocal(x0 + i * CELL, z0 + j * CELL);
const hash = new Map();
pts.forEach((p, i) => {
  const k = `${Math.floor(p[0] / 20)},${Math.floor(p[1] / 20)}`;
  if (!hash.has(k)) hash.set(k, []);
  hash.get(k).push(i);
});
const nearest = (x, z, R = 2) => {
  const ci = Math.floor(x / 20), cj = Math.floor(z / 20);
  let best = null;
  for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
    for (const k of hash.get(`${ci + a},${cj + b}`) ?? []) {
      if (k >= N - 1) continue;
      const r = segDist([x, z], pts[k], pts[k + 1]);
      if (!best || r.d < best.d) best = { ...r, k };
    }
  }
  return best;
};
// la celda es de 6 m: aplanar bien a lo ancho para que ningún triángulo del terreno tape el camino
const inner = WIDTH / 2 + CELL + 1.5, outer = WIDTH / 2 + CELL + 26;
for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
  const best = nearest(x0 + i * CELL, z0 + j * CELL);
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

// ---------------- Sierras de fondo ----------------
const fn = FAR.size / FAR.cell + 1;
const fx0 = -FAR.size / 2 + (Math.min(...xs) + Math.max(...xs)) / 2, fz0 = -FAR.size / 2 + (Math.min(...zs) + Math.max(...zs)) / 2;
const far = new Float32Array(fn * fn);
for (let j = 0; j < fn; j++) for (let i = 0; i < fn; i++) {
  const x = fx0 + i * FAR.cell, z = fz0 + j * FAR.cell;
  far[j * fn + i] = elevLocal(x, z, [12]);
}

// ---------------- Guardar ----------------
fs.writeFileSync(path.join(OUT, 'terrain.bin'), Buffer.from(h.buffer));
fs.writeFileSync(path.join(OUT, 'far.bin'), Buffer.from(far.buffer));
const stage = {
  source: { map: '© OpenStreetMap contributors (ODbL)', elevation: 'Terrarium elevation tiles (AWS Open Data)' },
  name: 'El Cóndor',
  width: WIDTH,
  step: STEP,
  length: len,
  climb: Math.round(climb),
  points: pts.map(([x, z], i) => [round(x), round(ys[i]), round(z)]),
  curvature: curv.map((c) => Math.round(c * 1e4) / 1e4),
  splits: [0.25, 0.5, 0.75].map((f) => Math.round(N * f)),
  surfaces: feat.surfaces,
  bumps: feat.bumps,
  terrain: { file: 'terrain.bin', n, cell: CELL, size, x0, z0, corridor: 480 },
  far: { file: 'far.bin', n: fn, cell: FAR.cell, size: FAR.size, x0: fx0, z0: fz0 },
};
fs.writeFileSync(path.join(OUT, 'stage.json'), JSON.stringify(stage));
console.log(`✓ stage.json (${(fs.statSync(path.join(OUT, 'stage.json')).size / 1024).toFixed(0)} KB)`);
console.log(`✓ terrain.bin (${n}×${n}, ${(h.byteLength / 1024 / 1024).toFixed(1)} MB) · far.bin (${fn}×${fn})`);

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
