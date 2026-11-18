// Importa Mónaco a datos del juego: circuito, relieve y edificios.
//
//   node tools/import-monaco.mjs
//
// Entradas (assets-raw/monaco/, no se suben):
//   circuit/mc-1929.geojson   trazado del circuito (bacinger/f1-circuits, MIT)
//   osm/monaco.json           OpenStreetMap vía Overpass (ODbL)
//   dem/{z}/{x}/{y}.png       relieve Terrarium (AWS elevation-tiles-prod)
// Salidas (public/assets/monaco/):
//   monaco.json   circuito (puntos cada 2 m con altura, túnel, pianos, sectores) + edificios + muelles
//   terrain.bin   alturas Float32 de la zona cercana (con la pista "tallada")
//   far.bin       alturas Float32 de la zona lejana (montañas de fondo)
//
// Coordenadas del juego: metros, X = este, Z = sur, Y = arriba. Origen = línea de largada.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RAW = path.join(ROOT, 'assets-raw/monaco');
const OUT = path.join(ROOT, 'public/assets/monaco');
fs.mkdirSync(OUT, { recursive: true });

// ---------------- Parámetros ----------------
const START_LATLON = [43.73485, 7.42115]; // línea de largada (bulevar Alberto I)
const TRACK_WIDTH = 11;                   // ancho de la pista (m)
const STEP = 2;                           // un punto cada 2 m
const NEAR = { size: 2048, cell: 4 };     // zona cercana: 2 km de lado, una altura cada 4 m
const FAR = { size: 14000, cell: 50 };    // fondo: 14 km de lado, cada 50 m
const BUILDING_RADIUS = 450;              // edificios a menos de esto de la pista
const SEA_LEVEL = 0;

// ---------------- Proyección ----------------
const [LAT0, LON0] = START_LATLON;
const M_LAT = 111132.9;
const M_LON = 111319.5 * Math.cos((LAT0 * Math.PI) / 180);
const toLocal = (lat, lon) => [(lon - LON0) * M_LON, -(lat - LAT0) * M_LAT];
const toLatLon = (x, z) => [LAT0 - z / M_LAT, LON0 + x / M_LON];

// ---------------- Relieve (Terrarium) ----------------
const tileCache = new Map();
function tile(z, x, y) {
  const k = `${z}/${x}/${y}`;
  if (!tileCache.has(k)) {
    const f = path.join(RAW, `dem/${z}/${x}/${y}.png`);
    tileCache.set(k, fs.existsSync(f) ? PNG.sync.read(fs.readFileSync(f)) : null);
  }
  return tileCache.get(k);
}
function demPixel(z, px, py) {
  const n = 2 ** z * 256;
  px = Math.max(0, Math.min(n - 1, px));
  py = Math.max(0, Math.min(n - 1, py));
  const t = tile(z, Math.floor(px / 256), Math.floor(py / 256));
  if (!t) return null;
  const i = ((py % 256) * 256 + (px % 256)) * 4;
  return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768;
}
/** Altura (m) con interpolación bilineal. Prueba zoom 15 y si no hay, 13. */
function elevation(lat, lon) {
  for (const z of [15, 13]) {
    const n = 2 ** z * 256;
    const fx = ((lon + 180) / 360) * n - 0.5;
    const fy = ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const a = demPixel(z, x0, y0), b = demPixel(z, x0 + 1, y0), c = demPixel(z, x0, y0 + 1), d = demPixel(z, x0 + 1, y0 + 1);
    if ([a, b, c, d].some((v) => v === null)) continue;
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  return 0;
}
const elevLocal = (x, z) => elevation(...toLatLon(x, z));

// ---------------- Circuito ----------------
const geo = JSON.parse(fs.readFileSync(path.join(RAW, 'circuit/mc-1929.geojson'), 'utf8'));
let raw = geo.features[0].geometry.coordinates.map(([lon, lat]) => toLocal(lat, lon));
if (dist(raw[0], raw[raw.length - 1]) < 0.5) raw.pop();

// Empezar en el punto más cercano a la línea de largada
let si = 0;
raw.forEach((p, i) => {
  if (Math.hypot(p[0], p[1]) < Math.hypot(raw[si][0], raw[si][1])) si = i;
});
raw = [...raw.slice(si), ...raw.slice(0, si)];
let pts = resampleClosed(raw, STEP);
const N = pts.length;
// Sentido de la vuelta: la subida al Casino (lo más alto) tiene que estar en la primera mitad
{
  const y = smoothClosed(pts.map(([x, z]) => elevLocal(x, z)), 40);
  const peak = y.indexOf(Math.max(...y));
  if (peak > N / 2) {
    pts = [pts[0], ...pts.slice(1).reverse()];
    console.log('  (se invirtió el sentido del trazado)');
  }
}
console.log(`Circuito: ${N} puntos, ${(N * STEP).toFixed(0)} m`);

// Túnel: tramos cerca de calles OSM con tunnel=yes
const osm = JSON.parse(fs.readFileSync(path.join(RAW, 'osm/monaco.json'), 'utf8')).elements;
const tunnelSegs = [];
for (const e of osm) {
  if (e.type !== 'way' || !e.tags?.highway || !e.tags.tunnel || e.tags.tunnel === 'no' || !e.geometry) continue;
  const g = e.geometry.map((p) => toLocal(p.lat, p.lon));
  for (let i = 0; i < g.length - 1; i++) tunnelSegs.push([g[i], g[i + 1]]);
}
let tunnel = pts.map((p) => tunnelSegs.some(([a, b]) => distToSeg(p, a, b) < 6));
tunnel = keepRuns(tunnel, 60 / STEP); // solo túneles de más de 60 m
const tunnelRuns = runs(tunnel);
console.log(`Túneles: ${tunnelRuns.map(([a, b]) => `${((b - a + 1) * STEP).toFixed(0)} m`).join(', ') || 'ninguno'}`);

// Alturas de la pista: relieve suavizado (y nunca debajo del mar)
let ys = pts.map(([x, z]) => Math.max(elevLocal(x, z), 2));
ys = smoothClosed(ys, 45 / STEP); // promedio de ±45 m
ys = smoothClosed(ys, 20 / STEP);
const yMin = Math.min(...ys), yMax = Math.max(...ys);
console.log(`Altura de la pista: ${yMin.toFixed(1)} a ${yMax.toFixed(1)} m`);

// Curvatura → pianos en las curvas
const heading = pts.map((p, i) => {
  const q = pts[(i + 1) % N], o = pts[(i - 1 + N) % N];
  return Math.atan2(q[1] - o[1], q[0] - o[0]);
});
const curv = heading.map((h, i) => {
  let d = heading[(i + 2) % N] - heading[(i - 2 + N) % N];
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return d / (4 * STEP); // radianes por metro
});
const curvS = smoothClosed(curv, 3);
const kerb = curvS.map((c, i) => Math.abs(c) > 1 / 90 && !tunnel[i]);

// Sectores (tercios de vuelta)
const sectors = [0, Math.round(N / 3), Math.round((2 * N) / 3)];

// Nombres de curvas: las de mayor curvatura, en orden de vuelta (para carteles)
const circuit = {
  width: TRACK_WIDTH,
  step: STEP,
  length: N * STEP,
  points: pts.map(([x, z], i) => [round(x, 2), round(ys[i], 2), round(z, 2)]),
  tunnel: runs(tunnel),
  kerbs: runs(kerb),
  curvature: curvS.map((c) => round(c, 4)),
  sectors,
};

// ---------------- Terreno cercano ----------------
const cx = round((Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2, 0);
const cz = round((Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2, 0);
const near = buildGrid(NEAR, cx, cz, 'cerca');
carve(near);
const far = buildGrid(FAR, cx, cz, 'lejos');

// ---------------- Edificios ----------------
const hash = spatialHash(pts, 20);
const buildings = [];
for (const e of osm) {
  if (!e.tags?.building || e.type !== 'way' || !e.geometry || e.geometry.length < 4) continue;
  const poly = e.geometry.map((p) => toLocal(p.lat, p.lon));
  poly.pop(); // el último repite el primero
  const c = centroid(poly);
  const dc = nearestTrack(c, hash, BUILDING_RADIUS);
  if (!dc || dc.d > BUILDING_RADIUS) continue;
  // no tapar la pista
  if (poly.some((p) => (nearestTrack(p, hash, 30)?.d ?? 99) < TRACK_WIDTH / 2 + 2)) continue;
  const levels = parseFloat(e.tags['building:levels']);
  const tagH = parseFloat(e.tags.height);
  let height = Number.isFinite(tagH) ? tagH : Number.isFinite(levels) ? levels * 3.2 + 1 : 9 + (hashStr(String(e.id)) % 20);
  height = Math.min(Math.max(height, 4), 120);
  const base = Math.min(...poly.map((p) => sampleGrid(near, p[0], p[1])));
  buildings.push({
    p: simplify(poly, 0.8).flat().map((v) => round(v, 1)),
    y: round(base - 0.5, 1),
    h: round(height + 0.5, 1),
    k: buildingKind(e.tags),
  });
}
console.log(`Edificios cerca de la pista: ${buildings.length}`);

// ---------------- Muelles y escolleras ----------------
const piers = [];
for (const e of osm) {
  if (e.type !== 'way' || !e.geometry || !/pier|breakwater|groyne/.test(e.tags?.man_made ?? '')) continue;
  const line = e.geometry.map((p) => toLocal(p.lat, p.lon));
  if (!line.some((p) => Math.abs(p[0] - cx) < NEAR.size / 2 && Math.abs(p[1] - cz) < NEAR.size / 2)) continue;
  const closed = dist(line[0], line[line.length - 1]) < 0.5;
  piers.push({ closed, p: line.flat().map((v) => round(v, 1)), w: parseFloat(e.tags.width) || 5 });
}
console.log(`Muelles: ${piers.length}`);

// ---------------- Guardar ----------------
writeGrid(near, 'terrain.bin');
writeGrid(far, 'far.bin');
const meta = {
  source: {
    circuit: 'bacinger/f1-circuits (MIT)',
    map: '© OpenStreetMap contributors (ODbL)',
    elevation: 'Terrarium elevation tiles (AWS Open Data, Mapzen; SRTM y otras)',
  },
  origin: { lat: LAT0, lon: LON0 },
  seaLevel: SEA_LEVEL,
  terrain: gridMeta(near, 'terrain.bin'),
  far: gridMeta(far, 'far.bin'),
  circuit,
  buildings,
  piers,
};
fs.writeFileSync(path.join(OUT, 'monaco.json'), JSON.stringify(meta));
console.log(`✓ public/assets/monaco/monaco.json (${(fs.statSync(path.join(OUT, 'monaco.json')).size / 1024).toFixed(0)} KB)`);

// =====================================================================

function buildGrid({ size, cell }, cx, cz, label) {
  const n = Math.round(size / cell) + 1;
  const h = new Float32Array(n * n);
  const x0 = cx - size / 2, z0 = cz - size / 2;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let e = elevLocal(x0 + i * cell, z0 + j * cell);
      if (e <= 0.3) e = -6; // mar: fondo
      h[j * n + i] = e;
    }
  }
  console.log(`Terreno ${label}: ${n}×${n}, ${size} m`);
  return { n, cell, size, x0, z0, h };
}

function sampleGrid(g, x, z) {
  const fx = (x - g.x0) / g.cell, fz = (z - g.z0) / g.cell;
  const i = Math.max(0, Math.min(g.n - 2, Math.floor(fx))), j = Math.max(0, Math.min(g.n - 2, Math.floor(fz)));
  const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j));
  const a = g.h[j * g.n + i], b = g.h[j * g.n + i + 1], c = g.h[(j + 1) * g.n + i], d = g.h[(j + 1) * g.n + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

/** Aplana el terreno debajo de la pista y lo empalma suave con lo de alrededor. */
function carve(g) {
  const hsh = spatialHash(pts, 20);
  const inner = TRACK_WIDTH / 2 + 3, outer = TRACK_WIDTH / 2 + 30;
  for (let j = 0; j < g.n; j++) {
    for (let i = 0; i < g.n; i++) {
      const x = g.x0 + i * g.cell, z = g.z0 + j * g.cell;
      const nt = nearestTrack([x, z], hsh, outer);
      if (!nt) continue;
      const roadY = ys[nt.i] * (1 - nt.t) + ys[(nt.i + 1) % N] * nt.t - 0.15;
      const k = g.h[j * g.n + i];
      if (nt.d <= inner) g.h[j * g.n + i] = roadY;
      else {
        const t = smoothstep((nt.d - inner) / (outer - inner));
        // del lado del mar no levantar tanto: que quede como muelle
        g.h[j * g.n + i] = roadY * (1 - t) + k * t;
      }
    }
  }
}

function writeGrid(g, file) {
  fs.writeFileSync(path.join(OUT, file), Buffer.from(g.h.buffer));
  console.log(`✓ public/assets/monaco/${file} (${(g.h.byteLength / 1024).toFixed(0)} KB)`);
}
function gridMeta(g, file) {
  return { file, n: g.n, cell: g.cell, size: g.size, x0: g.x0, z0: g.z0 };
}

function spatialHash(points, cellSize) {
  const m = new Map();
  points.forEach((p, i) => {
    const k = `${Math.floor(p[0] / cellSize)},${Math.floor(p[1] / cellSize)}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(i);
  });
  return { m, cellSize };
}
/** Punto de la pista más cercano: { d, i, t } (segmento i→i+1, fracción t). */
function nearestTrack(p, { m, cellSize }, maxD) {
  const r = Math.ceil(maxD / cellSize);
  const ci = Math.floor(p[0] / cellSize), cj = Math.floor(p[1] / cellSize);
  let best = null;
  for (let a = -r; a <= r; a++) {
    for (let b = -r; b <= r; b++) {
      const list = m.get(`${ci + a},${cj + b}`);
      if (!list) continue;
      for (const i of list) {
        const A = pts[i], B = pts[(i + 1) % N];
        const { d, t } = segDist(p, A, B);
        if (!best || d < best.d) best = { d, i, t };
      }
    }
  }
  return best && best.d <= maxD ? best : null;
}

function resampleClosed(poly, step) {
  // Catmull-Rom centrípeta cerrada, muestreada densamente y después cada `step` metros
  const dense = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n], p3 = poly[(i + 2) % n];
    const segs = Math.max(2, Math.ceil(dist(p1, p2) / 0.5));
    for (let s = 0; s < segs; s++) dense.push(catmull(p0, p1, p2, p3, s / segs));
  }
  const out = [dense[0]];
  let acc = 0;
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length];
    let d = dist(a, b), from = a;
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
  if (dist(out[0], out[out.length - 1]) < step * 0.5) out.pop();
  return out;
}
function catmull(p0, p1, p2, p3, t) {
  const alpha = 0.5;
  const tj = (ti, a, b) => ti + Math.pow(dist(a, b) || 1e-6, alpha);
  const t0 = 0, t1 = tj(t0, p0, p1), t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const lerp2 = (a, b, ta, tb) => [0, 1].map((k) => ((tb - tt) / (tb - ta)) * a[k] + ((tt - ta) / (tb - ta)) * b[k]);
  const A1 = lerp2(p0, p1, t0, t1), A2 = lerp2(p1, p2, t1, t2), A3 = lerp2(p2, p3, t2, t3);
  const B1 = lerp2(A1, A2, t0, t2), B2 = lerp2(A2, A3, t1, t3);
  return lerp2(B1, B2, t1, t2);
}
function smoothClosed(arr, radius) {
  const n = arr.length, r = Math.max(1, Math.round(radius)), out = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += arr[(i + k + n) % n];
    out[i] = s / (2 * r + 1);
  }
  return out;
}
function runs(flags) {
  const out = [];
  const n = flags.length;
  for (let i = 0; i < n; i++) {
    if (flags[i] && !flags[(i - 1 + n) % n]) {
      let j = i;
      while (flags[(j + 1) % n] && (j + 1) % n !== i) j++;
      out.push([i, j % n]);
    }
  }
  return out;
}
function keepRuns(flags, minLen) {
  const out = flags.map(() => false);
  for (const [a, b] of runs(flags)) {
    const len = ((b - a + flags.length) % flags.length) + 1;
    if (len >= minLen) for (let k = 0; k < len; k++) out[(a + k) % flags.length] = true;
  }
  return out;
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  return { d: Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t), t };
}
function distToSeg(p, a, b) {
  return segDist(p, a, b).d;
}
function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
function centroid(poly) {
  return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
}
function simplify(poly, tol) {
  // saca vértices casi alineados
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[(i - 1 + poly.length) % poly.length], b = poly[i], c = poly[(i + 1) % poly.length];
    if (distToSeg(b, a, c) > tol || poly.length <= 4) out.push(b);
  }
  return out.length >= 3 ? out : poly;
}
function buildingKind(tags) {
  const b = tags.building;
  if (/church|cathedral|chapel/.test(b) || tags.amenity === 'place_of_worship') return 'iglesia';
  if (/hotel/.test(b) || tags.tourism === 'hotel') return 'hotel';
  if (tags.amenity === 'casino' || /casino/i.test(tags.name ?? '')) return 'casino';
  if (/apartments|residential|house/.test(b)) return 'casa';
  if (/commercial|office|retail/.test(b)) return 'oficina';
  return 'otro';
}
function hashStr(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
function smoothstep(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}
function round(v, d) {
  const k = 10 ** d;
  return Math.round(v * k) / k;
}
