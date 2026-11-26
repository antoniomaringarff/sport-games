// Mapa grande (mundo abierto): ciudad con la tienda en el medio, playa y mar al sur,
// un cerro chico al este y uno grande con nieve al norte, rutas que unen todo y entradas
// a los otros lugares (Mónaco, rally, pista). Por ahora sin gráficos lindos: colores lisos.
//
// Ejes: X = este, Z = sur (el mar está hacia +Z), Y = arriba. Todo en metros.
import * as THREE from 'three';
import { WorldBuilder } from './builder.js';
import { MAPA } from '../config.js';

// ---------- Números del mapa ----------
const SIZE = 4000;          // lado del mapa
const HALF = SIZE / 2;
const N = 401;              // vértices por lado del terreno (celdas de 10 m)
const CELL = SIZE / (N - 1);
const CITY_Y = 4;           // altura del piso de la ciudad
const CITY = { x0: -470, x1: 470, z0: -500, z1: 260 };
const XR = [-450, -270, -90, 90, 270, 450]; // calles norte-sur
const ZR = [-480, -300, -120, 60, 240];     // calles este-oeste
const ROAD_W = 12;
const DIRT_W = 9;
// r: hasta dónde llega la falda (más allá es llano, así las rutas de acceso no suben)
const M1 = { x: -700, z: -1250, h: 340, r: 640 };  // Cerro Grande (con nieve)
const M2 = { x: 1150, z: -450, h: 170, r: 400 };   // Cerrito
const SNOW_Y = 270;

/** Dónde empieza el agua según X (la costa hace ondas). */
const shoreZ = (x) => 760 + 60 * Math.sin(x / 300) + 25 * Math.sin(x / 97 + 1);
const coastRoadZ = (x) => shoreZ(x) - 220;

const SURF = ['pasto', 'asfalto', 'tierra', 'arena', 'nieve'];
const S = { pasto: 0, asfalto: 1, tierra: 2, arena: 3, nieve: 4 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- Altura natural del terreno (antes de tallar las rutas) ----------
function rawHeight(x, z) {
  const n = 2.2 * Math.sin(x / 160 + 0.7) * Math.cos(z / 190 - 0.3) + 1.2 * Math.sin((x + z) / 95) + 0.8 * Math.cos((x - 2 * z) / 61);
  // la ciudad es plana
  const dx = Math.max(CITY.x0 - x, 0, x - CITY.x1), dz = Math.max(CITY.z0 - z, 0, z - CITY.z1);
  const city = 1 - smooth(Math.hypot(dx, dz) / 160);
  // cerros (sus faldas llegan lejos: la ciudad se aplana después, si no queda enterrada)
  let hills = 0;
  for (const m of [M1, M2]) {
    const d = Math.hypot(x - m.x, z - m.z);
    if (d >= m.r) continue;
    hills += m.h * (1 - smooth(d / m.r));
  }
  let h = lerp(6 + n + hills, CITY_Y, city);
  // lomas en los bordes (para que el mapa no se termine de golpe)
  const edge = Math.max(smooth((Math.abs(x) - 1750) / 230), smooth((-z - 1850) / 140));
  h += edge * (90 + 20 * Math.sin(x / 120 + z / 150));
  // costa: baja hasta la playa y después el fondo del mar
  const d = z - shoreZ(x);
  if (d > -260) {
    if (d < -150) h = lerp(h, 1.8, smooth((d + 260) / 110));
    else if (d < 0) h = lerp(1.8, -0.25, (d + 150) / 150);
    else h = Math.max(-7, -0.25 - d * 0.035);
  }
  return h;
}

// ---------- Rutas ----------
/**
 * Espiral que sube un cerro: de radio r0 a r1, arrancando mirando a `from`.
 * El radio baja parejo con la distancia recorrida (no con el ángulo): así la pendiente no se
 * dispara cerca de la punta. `turns` es más o menos cuántas vueltas da.
 */
function spiral(m, from, r0, r1, turns) {
  const a0 = Math.atan2(from.z - m.z, from.x - m.x);
  const k = (r0 - r1) / (turns * Math.PI * (r0 + r1)); // metros que se acerca por metro recorrido
  const pts = [];
  for (let a = 0, r = r0; r > r1; ) {
    pts.push({ x: m.x + Math.cos(a0 + a) * r, z: m.z + Math.sin(a0 + a) * r });
    a += 8 / r;
    r -= 8 * k;
  }
  // el último tramo va derecho hasta la punta (ahí está la moneda grande)
  return densify([...pts.slice(0, -1), { x: m.x, z: m.z }]);
}

/** Puntos cada ~8 m a lo largo de una línea quebrada. */
function densify(pts, step = 8) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / step));
    for (let k = 1; k <= n; k++) out.push({ x: lerp(a.x, b.x, k / n), z: lerp(a.z, b.z, k / n) });
  }
  return out;
}

function makeRoads() {
  const roads = [];
  const add = (name, pts, surface, w) => roads.push({ name, pts, surface, w });
  // ruta de la costa
  const coast = [];
  for (let x = -1700; x <= 1700; x += 8) coast.push({ x, z: coastRoadZ(x) });
  add('costa', coast, 'asfalto', ROAD_W);
  // de la ciudad a la costa
  for (const x of [-450, 90, 450]) add('bajada', densify([{ x, z: CITY.z1 - 20 }, { x, z: coastRoadZ(x) }]), 'asfalto', ROAD_W);
  // al Cerro Grande: ruta hasta el pie y camino de tierra en espiral hasta arriba
  const fromN = { x: -270, z: CITY.z0 + 20 };
  const s1 = spiral(M1, fromN, 600, 45, 3);
  add('ruta-norte', densify([fromN, { x: -270, z: CITY.z0 - 40 }, s1[0]]), 'asfalto', ROAD_W);
  add('cerro-grande', s1, 'tierra', DIRT_W);
  // al Cerrito
  const fromE = { x: CITY.x1 - 20, z: -300 };
  const s2 = spiral(M2, fromE, 370, 35, 2);
  add('ruta-este', densify([fromE, { x: CITY.x1 + 40, z: -300 }, s2[0]]), 'asfalto', ROAD_W);
  add('cerrito', s2, 'tierra', DIRT_W);
  return roads;
}

/** Alturas del camino: las del terreno, suavizadas (sin pozos ni lomas bruscas). */
function roadHeights(pts) {
  const raw = pts.map((p) => rawHeight(p.x, p.z));
  const out = raw.slice();
  const W = 6; // ±48 m
  for (let i = 0; i < raw.length; i++) {
    let s = 0, c = 0;
    for (let k = Math.max(0, i - W); k <= Math.min(raw.length - 1, i + W); k++) {
      s += raw[k];
      c++;
    }
    out[i] = Math.max(0.6, s / c); // nunca abajo del agua
  }
  return out;
}

// ---------- Terreno ----------
function buildHeights(roads) {
  const h = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) h[j * N + i] = rawHeight(-HALF + i * CELL, -HALF + j * CELL);
  // tallar las rutas: plano a lo ancho (corte del lado de arriba, relleno del de abajo)
  const wBest = new Float32Array(N * N);
  const yBest = new Float32Array(N * N);
  const BLEND = 28;
  for (const r of roads) {
    const flat = r.w / 2 + 4;
    for (let k = 1; k < r.pts.length; k++) {
      const a = r.pts[k - 1], b = r.pts[k];
      const ya = r.ys[k - 1], yb = r.ys[k];
      const ext = flat + BLEND;
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - ext + HALF) / CELL));
      const i1 = Math.min(N - 1, Math.ceil((Math.max(a.x, b.x) + ext + HALF) / CELL));
      const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - ext + HALF) / CELL));
      const j1 = Math.min(N - 1, Math.ceil((Math.max(a.z, b.z) + ext + HALF) / CELL));
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = -HALF + i * CELL, z = -HALF + j * CELL;
          const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / L2, 0, 1);
          const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
          if (d > ext) continue;
          const w = d < flat ? 1 : 1 - smooth((d - flat) / BLEND);
          const idx = j * N + i;
          if (w > wBest[idx]) {
            wBest[idx] = w;
            yBest[idx] = lerp(ya, yb, t) - 0.05;
          }
        }
      }
    }
  }
  for (let k = 0; k < N * N; k++) if (wBest[k] > 0) h[k] = lerp(h[k], yBest[k], wBest[k]);
  return h;
}

/** Altura del terreno (ya tallado) en cualquier punto, igual que lo ve la física. */
function sampler(h) {
  return (x, z) => {
    const fx = clamp((x + HALF) / CELL, 0, N - 1.001), fz = clamp((z + HALF) / CELL, 0, N - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = h[j * N + i], b = h[j * N + i + 1], c = h[(j + 1) * N + i], d = h[(j + 1) * N + i + 1];
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
}

// ---------- Superficies (qué se pisa en cada lugar) ----------
const SRES = 4; // metros por casillero
const SN = SIZE / SRES;

function buildSurfaceMap(heightAt, roads) {
  const map = new Uint8Array(SN * SN);
  for (let j = 0; j < SN; j++) {
    for (let i = 0; i < SN; i++) {
      const x = -HALF + (i + 0.5) * SRES, z = -HALF + (j + 0.5) * SRES;
      map[j * SN + i] = naturalSurface(heightAt, x, z);
    }
  }
  const paint = (x0, z0, x1, z1, code) => {
    const i0 = clamp(Math.floor((x0 + HALF) / SRES), 0, SN - 1), i1 = clamp(Math.floor((x1 + HALF) / SRES), 0, SN - 1);
    const j0 = clamp(Math.floor((z0 + HALF) / SRES), 0, SN - 1), j1 = clamp(Math.floor((z1 + HALF) / SRES), 0, SN - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) map[j * SN + i] = code;
  };
  // la ciudad es toda de asfalto y vereda
  paint(CITY.x0, CITY.z0, CITY.x1, CITY.z1, S.asfalto);
  for (const r of roads) {
    const half = r.w / 2 + 0.6;
    for (const p of r.pts) paint(p.x - half, p.z - half, p.x + half, p.z + half, S[r.surface]);
  }
  return (x, z) => {
    const i = clamp(Math.floor((x + HALF) / SRES), 0, SN - 1), j = clamp(Math.floor((z + HALF) / SRES), 0, SN - 1);
    return SURF[map[j * SN + i]];
  };
}

function naturalSurface(heightAt, x, z) {
  const y = heightAt(x, z);
  if (z - shoreZ(x) > -175 && y < 2.4) return S.arena;
  if (y > SNOW_Y + 8 * Math.sin(x / 40 + z / 55)) return S.nieve;
  const slope = Math.hypot(heightAt(x + 4, z) - heightAt(x - 4, z), heightAt(x, z + 4) - heightAt(x, z - 4)) / 8;
  if (slope > 0.5) return S.tierra;
  return S.pasto;
}

const SURF_COLOR = {
  pasto: [0.33, 0.52, 0.24],
  asfalto: [0.42, 0.42, 0.42],
  tierra: [0.52, 0.42, 0.3],
  arena: [0.86, 0.79, 0.6],
  nieve: [0.93, 0.95, 0.98],
};

function terrainMesh(h, surfaceAt) {
  const pos = new Float32Array(N * N * 3);
  const col = new Float32Array(N * N * 3);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i, x = -HALF + i * CELL, z = -HALF + j * CELL;
      pos.set([x, h[k], z], k * 3);
      let c = SURF_COLOR[surfaceAt(x, z)];
      // en la ciudad el piso lo pone la textura de las calles; acá abajo, gris
      if (h[k] < -0.3) c = [0.7, 0.66, 0.52]; // fondo del mar, cerca de la orilla
      const v = 0.92 + 0.08 * Math.sin(x * 0.13 + z * 0.07) * Math.cos(z * 0.11 - x * 0.05);
      col.set([c[0] * v, c[1] * v, c[2] * v], k * 3);
    }
  }
  const index = new Uint32Array((N - 1) * (N - 1) * 6);
  let p = 0;
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
      index.set([a, c, b, b, c, d], p);
      p += 6;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  mesh.receiveShadow = true;
  return mesh;
}

/** Lo que se ve más allá del mapa: lomas lejanas (sin física). */
function farMesh() {
  const n = 61, size = 26000, cell = size / (n - 1);
  const g = new THREE.PlaneGeometry(size, size, n - 1, n - 1).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), z = p.getZ(k);
    const inside = Math.abs(x) < HALF && Math.abs(z) < HALF;
    let y;
    if (z > 1200) y = -9; // fondo del mar
    else if (inside) y = -60;
    else y = 140 + 90 * Math.sin(x / 1900 + 1) * Math.cos(z / 1500) + 40 * Math.sin((x + z) / 700);
    p.setY(k, y);
    const c = y > 200 ? [0.55, 0.56, 0.5] : [0.3, 0.45, 0.25];
    col.set(c, k * 3);
  }
  void cell;
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
}

// ---------- Rutas que se ven ----------
function ribbon(pts, ys, w, lift = 0.06) {
  const pos = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    const nx = -tz * (w / 2), nz = tx * (w / 2);
    const y = ys[i] + lift;
    pos.push(pts[i].x + nx, y, pts[i].z + nz, pts[i].x - nx, y, pts[i].z - nz);
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** El piso de la ciudad: calles, sendas peatonales, veredas y el estacionamiento de la tienda. */
function cityTexture() {
  const W = CITY.x1 - CITY.x0, D = CITY.z1 - CITY.z0;
  const ppm = 2; // pixeles por metro
  const c = document.createElement('canvas');
  c.width = W * ppm;
  c.height = D * ppm;
  const g = c.getContext('2d');
  const X = (x) => (x - CITY.x0) * ppm, Z = (z) => (z - CITY.z0) * ppm;
  g.fillStyle = '#b9b5ac'; // vereda / plaza
  g.fillRect(0, 0, c.width, c.height);
  // manzanas con pasto en el medio (las plazas)
  g.fillStyle = '#7f9a62';
  for (let a = 0; a < XR.length - 1; a++) {
    for (let b = 0; b < ZR.length - 1; b++) {
      if ((a + b) % 3) continue;
      g.fillRect(X(XR[a] + 40), Z(ZR[b] + 40), (XR[a + 1] - XR[a] - 80) * ppm, (ZR[b + 1] - ZR[b] - 80) * ppm);
    }
  }
  // estacionamiento de la tienda
  g.fillStyle = '#4a4c50';
  g.fillRect(X(-80), Z(66), 160 * ppm, 70 * ppm);
  g.strokeStyle = '#e8e8e8';
  g.lineWidth = 0.15 * ppm;
  for (let x = -76; x <= 76; x += 4) {
    g.beginPath();
    g.moveTo(X(x), Z(110));
    g.lineTo(X(x), Z(118));
    g.stroke();
  }
  // calles
  g.fillStyle = '#3d4044';
  for (const x of XR) g.fillRect(X(x - ROAD_W / 2), 0, ROAD_W * ppm, c.height);
  for (const z of ZR) g.fillRect(0, Z(z - ROAD_W / 2), c.width, ROAD_W * ppm);
  // línea del medio (punteada)
  g.strokeStyle = '#f2d24b';
  g.lineWidth = 0.25 * ppm;
  g.setLineDash([3 * ppm, 4 * ppm]);
  for (const x of XR) {
    g.beginPath();
    g.moveTo(X(x), 0);
    g.lineTo(X(x), c.height);
    g.stroke();
  }
  for (const z of ZR) {
    g.beginPath();
    g.moveTo(0, Z(z));
    g.lineTo(c.width, Z(z));
    g.stroke();
  }
  g.setLineDash([]);
  // sendas peatonales en cada esquina
  g.fillStyle = '#eeeeee';
  for (const x of XR) {
    for (const z of ZR) {
      g.fillStyle = '#3d4044';
      g.fillRect(X(x - ROAD_W / 2), Z(z - ROAD_W / 2), ROAD_W * ppm, ROAD_W * ppm);
      g.fillStyle = '#eeeeee';
      for (let k = -5; k <= 5; k += 2) {
        g.fillRect(X(x + k - 0.5), Z(z - ROAD_W / 2 - 4), 1 * ppm, 3.5 * ppm);
        g.fillRect(X(x + k - 0.5), Z(z + ROAD_W / 2 + 0.5), 1 * ppm, 3.5 * ppm);
        g.fillRect(X(x - ROAD_W / 2 - 4), Z(z + k - 0.5), 3.5 * ppm, 1 * ppm);
        g.fillRect(X(x + ROAD_W / 2 + 0.5), Z(z + k - 0.5), 3.5 * ppm, 1 * ppm);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ---------- Cosas ----------
function rnd(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Edificios: cajas de colores en el borde de cada manzana (la del medio-sur es la tienda). */
function buildCity(b) {
  const r = rnd(11);
  const palette = [0xe8d5b5, 0xd98e73, 0x9fb7c9, 0xf0e6d2, 0xc4a484, 0xa7c4a0, 0xe0b0a0, 0xb8c4d8];
  const mats = palette.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
  const roof = new THREE.MeshStandardMaterial({ color: 0x8a5a44, roughness: 0.8 });
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const boxes = [];
  for (let a = 0; a < XR.length - 1; a++) {
    for (let bz = 0; bz < ZR.length - 1; bz++) {
      const x0 = XR[a] + ROAD_W / 2 + 6, x1 = XR[a + 1] - ROAD_W / 2 - 6;
      const z0 = ZR[bz] + ROAD_W / 2 + 6, z1 = ZR[bz + 1] - ROAD_W / 2 - 6;
      if (XR[a] === -90 && ZR[bz] === 60) continue; // la tienda
      const park = (a + bz) % 3 === 0;
      const central = Math.hypot((x0 + x1) / 2, (z0 + z1) / 2) < 300;
      // a lo largo de los 4 lados
      const sides = [
        [x0, z0, x1, z0, 0], [x0, z1, x1, z1, 0], [x0, z0, x0, z1, 1], [x1, z0, x1, z1, 1],
      ];
      for (const [sx, sz, ex, ez, vertical] of sides) {
        const len = vertical ? ez - sz : ex - sx;
        let t = 0;
        while (t < len - 12) {
          const w = 14 + r() * 16, d = 14 + r() * 12;
          if (t + w > len) break;
          if (park && r() < 0.6) {
            t += w + 4;
            continue;
          }
          const hgt = central ? 14 + r() * 40 : 7 + r() * 14;
          const inward = (vertical ? (sx === x0 ? 1 : -1) : (sz === z0 ? 1 : -1)) * (d / 2);
          const cx = vertical ? sx + inward : sx + t + w / 2;
          const cz = vertical ? sz + t + w / 2 : sz + inward;
          const sxz = vertical ? [d, w] : [w, d];
          boxes.push({ x: cx, z: cz, w: sxz[0], d: sxz[1], h: hgt, mat: mats[Math.floor(r() * mats.length)] });
          t += w + 2 + r() * 5;
        }
      }
    }
  }
  for (const bx of boxes) {
    const m = new THREE.Mesh(geo, bx.mat);
    m.scale.set(bx.w, bx.h, bx.d);
    m.position.set(bx.x, CITY_Y + bx.h / 2, bx.z);
    m.castShadow = m.receiveShadow = true;
    b.scene.add(m);
    if (bx.h < 16) {
      const t = new THREE.Mesh(geo, roof);
      t.scale.set(bx.w + 0.6, 0.6, bx.d + 0.6);
      t.position.set(bx.x, CITY_Y + bx.h + 0.3, bx.z);
      t.castShadow = true;
      b.scene.add(t);
    }
    const col = b.world.createCollider(b.R.ColliderDesc.cuboid(bx.w / 2, bx.h / 2, bx.d / 2).setTranslation(bx.x, CITY_Y + bx.h / 2, bx.z));
    b.physics.markWall(col);
  }
  return boxes;
}

/** La tienda: un galpón grande con vidriera, cartel y autos en exhibición. */
function buildShop(b) {
  const y = CITY_Y;
  const wall = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x5f8fb0, roughness: 0.1, metalness: 0.5 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xffcc33, roughness: 0.5, emissive: 0x332200 });
  const box = (w, h, d, x, yy, z, mat, collide = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, yy, z);
    m.castShadow = m.receiveShadow = true;
    b.scene.add(m);
    if (collide) b.physics.markWall(b.world.createCollider(b.R.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, yy, z)));
  };
  box(90, 16, 46, 0, y + 8, 190, wall);
  box(70, 9, 0.6, 0, y + 5, 166.8, glass, false);
  box(94, 1.4, 50, 0, y + 16.7, 190, accent, false);
  const sign = labelSprite('TIENDA DE AUTOS', '#ffcc33', '#1a1a1a');
  sign.position.set(0, y + 23, 166);
  sign.scale.set(44, 11, 1);
  b.scene.add(sign);
}

/** Cartel que siempre mira a la cámara. */
function labelSprite(text, bg = '#1d3fbf', fg = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(8, 8, 1008, 240, 48);
  g.fill();
  g.fillStyle = fg;
  g.font = 'bold 104px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 104;
  while (g.measureText(text).width > 940 && size > 40) g.font = `bold ${(size -= 6)}px system-ui, sans-serif`;
  g.fillText(text, 512, 132);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false }));
  s.renderOrder = 2;
  return s;
}

/** Arco de entrada sobre la ruta: dos columnas, el travesaño y un cartel. */
function buildGate(b, gate) {
  const { x, z, y, yaw, color, label, w = ROAD_W + 4 } = gate;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.25 });
  const nx = -Math.sin(yaw), nz = Math.cos(yaw); // a lo ancho de la ruta
  for (const s of [-1, 1]) {
    const px = x + nx * s * (w / 2), pz = z + nz * s * (w / 2);
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 9, 1.4), mat);
    m.position.set(px, y + 4.5, pz);
    m.castShadow = true;
    b.scene.add(m);
    b.physics.markWall(b.world.createCollider(b.R.ColliderDesc.cuboid(0.7, 4.5, 0.7).setTranslation(px, y + 4.5, pz)));
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, w + 1.4), mat);
  beam.position.set(x, y + 9, z);
  beam.rotation.y = -yaw;
  beam.castShadow = true;
  b.scene.add(beam);
  // piso que brilla
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(MAPA.PORTAL_RADIUS - 1.2, MAPA.PORTAL_RADIUS, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  ring.position.set(x, y + 0.12, z);
  b.scene.add(ring);
  const sign = labelSprite(label, `#${color.toString(16).padStart(6, '0')}`);
  sign.position.set(x, y + 13.5, z);
  sign.scale.set(26, 6.5, 1);
  b.scene.add(sign);
  return ring;
}

/** Árboles simples (tronco + copa) en el pasto, lejos de las rutas. */
function buildTrees(b, heightAt, surfaceAt) {
  const r = rnd(5);
  const spots = [];
  for (let tries = 0; tries < 30000 && spots.length < 1800; tries++) {
    const x = (r() * 2 - 1) * (HALF - 60), z = (r() * 2 - 1) * (HALF - 60);
    if (x > CITY.x0 - 30 && x < CITY.x1 + 30 && z > CITY.z0 - 30 && z < CITY.z1 + 30) continue;
    // de a grupos: hay bosquecitos y claros
    if (Math.sin(x / 140) * Math.cos(z / 170) + 0.25 * Math.sin(x / 37 + z / 41) < 0.05) continue;
    const y = heightAt(x, z);
    if (y > SNOW_Y - 30 || y < 2) continue;
    let ok = true;
    for (const [ox, oz] of [[0, 0], [9, 0], [-9, 0], [0, 9], [0, -9]]) if (surfaceAt(x + ox, z + oz) !== 'pasto') ok = false;
    if (!ok) continue;
    spots.push({ x, y, z, s: 0.8 + r() * 0.6, pine: y > 60 || r() < 0.35 });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 3, 6);
  const leafGeo = new THREE.IcosahedronGeometry(2.6, 0);
  const pineGeo = new THREE.ConeGeometry(2.4, 7, 7);
  const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5b4030 }), spots.length);
  const leaves = spots.filter((s) => !s.pine), pines = spots.filter((s) => s.pine);
  const leaf = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x4e7d34, flatShading: true }), leaves.length);
  const pine = new THREE.InstancedMesh(pineGeo, new THREE.MeshStandardMaterial({ color: 0x2f5a2e, flatShading: true }), pines.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  spots.forEach((s, i) => {
    m.compose(p.set(s.x, s.y + 1.5 * s.s, s.z), q, sc.setScalar(s.s));
    trunk.setMatrixAt(i, m);
    b.world.createCollider(b.R.ColliderDesc.cylinder(1.5 * s.s, 0.35 * s.s).setTranslation(s.x, s.y + 1.5 * s.s, s.z));
  });
  leaves.forEach((s, i) => leaf.setMatrixAt(i, m.compose(p.set(s.x, s.y + 4.6 * s.s, s.z), q, sc.setScalar(s.s))));
  pines.forEach((s, i) => pine.setMatrixAt(i, m.compose(p.set(s.x, s.y + 5.5 * s.s, s.z), q, sc.setScalar(s.s))));
  for (const im of [trunk, leaf, pine]) {
    im.castShadow = true;
    im.receiveShadow = true;
    b.scene.add(im);
  }
}

/** Monedas: a lo largo de las rutas, en la playa y una grande arriba de cada cerro. */
function placeCoins(roads, heightAt, gates) {
  const r = rnd(3);
  const coins = [];
  const nearGate = (x, z) => gates.some((g) => Math.hypot(g.x - x, g.z - z) < 30);
  for (const road of roads) {
    const every = road.surface === 'tierra' ? 12 : 14; // cada ~100 m
    for (let k = every; k < road.pts.length - 2; k += every) {
      const p = road.pts[k], q = road.pts[k + 1];
      if (nearGate(p.x, p.z)) continue;
      const tx = q.x - p.x, tz = q.z - p.z, l = Math.hypot(tx, tz) || 1;
      const side = (k / every) % 3 === 0 ? 0 : ((k / every) % 3 === 1 ? 1 : -1) * road.w * 0.25;
      const x = p.x - (tz / l) * side, z = p.z + (tx / l) * side;
      coins.push({ x, y: road.ys[k] + 1.2, z, value: MAPA.COIN });
    }
  }
  // ciudad: por las calles
  for (const x of XR) for (let z = CITY.z0 + 30; z < CITY.z1 - 20; z += 90) if (!nearGate(x, z)) coins.push({ x, y: CITY_Y + 1.2, z, value: MAPA.COIN });
  for (const z of ZR) for (let x = CITY.x0 + 30; x < CITY.x1 - 20; x += 90) if (!nearGate(x, z)) coins.push({ x, y: CITY_Y + 1.2, z, value: MAPA.COIN });
  // playa
  for (let i = 0; i < 60; i++) {
    const x = (r() * 2 - 1) * 1700;
    const z = shoreZ(x) - 20 - r() * 120;
    coins.push({ x, y: heightAt(x, z) + 1.2, z, value: MAPA.COIN });
  }
  // las grandes, arriba de los cerros
  for (const m of [M1, M2]) coins.push({ x: m.x, y: heightAt(m.x, m.z) + 2.5, z: m.z, value: MAPA.BIG_COIN, big: true });
  return coins;
}

function coinMeshes(scene, coins) {
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc72c, metalness: 0.8, roughness: 0.25, emissive: 0x664400, emissiveIntensity: 0.6 });
  const make = (list, radius) => {
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(radius, radius, radius * 0.25, 20).rotateX(Math.PI / 2), gold, list.length);
    im.castShadow = true;
    scene.add(im);
    return im;
  };
  const small = coins.filter((c) => !c.big), big = coins.filter((c) => c.big);
  const meshes = [make(small, 0.7), make(big, 2.2)];
  small.forEach((c, i) => ((c.mesh = meshes[0]), (c.i = i)));
  big.forEach((c, i) => ((c.mesh = meshes[1]), (c.i = i)));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let t = 0;
  return {
    update(dt) {
      t += dt;
      q.setFromAxisAngle(up, t * 2.2);
      for (const c of coins) {
        s.setScalar(c.taken ? 0 : 1);
        c.mesh.setMatrixAt(c.i, m.compose(p.set(c.x, c.y + Math.sin(t * 2 + c.x) * 0.15, c.z), q, s));
      }
      for (const im of meshes) im.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------- Armar todo ----------
export function buildMapa(physics, scene) {
  const b = new WorldBuilder(physics, scene);
  const roads = makeRoads();
  for (const r of roads) r.ys = roadHeights(r.pts);
  const h = buildHeights(roads);
  const heightAt = sampler(h);
  // las rutas tienen que quedar exactamente sobre el terreno tallado
  for (const r of roads) r.ys = r.pts.map((p) => heightAt(p.x, p.z));
  const surfaceAt = buildSurfaceMap(heightAt, roads);
  // terreno: lo que se ve y lo que se pisa
  scene.add(terrainMesh(h, surfaceAt));
  scene.add(farMesh());
  const hf = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) hf[i * N + j] = h[j * N + i];
  const ground = b.world.createCollider(
    b.R.ColliderDesc.heightfield(N - 1, N - 1, hf, { x: SIZE, y: 1, z: SIZE }).setTranslation(0, 0, 0).setFriction(0.8),
  );
  physics.setSurfaceZones(ground, surfaceAt);
  // bordes del mapa: paredes invisibles
  for (const [x, z, hx, hz] of [[HALF, 0, 2, HALF], [-HALF, 0, 2, HALF], [0, -HALF, HALF, 2], [0, 1200, HALF, 2]]) {
    b.world.createCollider(b.R.ColliderDesc.cuboid(hx, 400, hz).setTranslation(x, 0, z));
  }

  // mar
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(30000, 30000).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x1f6f9a, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.88 }),
  );
  sea.position.y = 0;
  scene.add(sea);

  // ciudad: el piso con las calles dibujadas, edificios y la tienda
  const cityFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.x1 - CITY.x0, CITY.z1 - CITY.z0).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: cityTexture(), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  cityFloor.position.set((CITY.x0 + CITY.x1) / 2, CITY_Y + 0.03, (CITY.z0 + CITY.z1) / 2);
  cityFloor.receiveShadow = true;
  scene.add(cityFloor);
  const buildings = buildCity(b);
  buildShop(b);
  // rutas fuera de la ciudad
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x3d4044, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const dirt = new THREE.MeshStandardMaterial({ color: 0x7a5f43, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const line = new THREE.MeshBasicMaterial({ color: 0xf2d24b, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  for (const r of roads) {
    const m = new THREE.Mesh(ribbon(r.pts, r.ys, r.w), r.surface === 'tierra' ? dirt : asphalt);
    m.receiveShadow = true;
    scene.add(m);
    if (r.surface === 'asfalto') scene.add(new THREE.Mesh(ribbon(r.pts, r.ys, 0.3, 0.07), line));
  }

  // entradas a los otros lugares
  const at = (road, x) => {
    const r = roads.find((q) => q.name === road);
    let k = 0;
    for (let i = 0; i < r.pts.length; i++) if (Math.abs(r.pts[i].x - x) < Math.abs(r.pts[k].x - x)) k = i;
    return pointOn(r, k);
  };
  const start = (road, k = 6) => pointOn(roads.find((q) => q.name === road), k);
  const gates = [
    { place: 'tienda', label: 'TIENDA', color: 0xffcc33, x: 0, z: 74, y: CITY_Y, yaw: Math.PI / 2, w: 22 },
    { place: 'monaco', label: 'CIRCUITO DE MÓNACO', title: 'Circuito de Mónaco', color: 0xd8262e, ...at('costa', -1100) },
    { place: 'multi', label: 'MULTIJUGADOR', title: 'Multijugador', color: 0x6b2fbf, ...at('costa', -750) },
    { place: 'pista', label: 'PISTA DE PRUEBAS', title: 'Pista de pruebas', color: 0x1f9e4a, ...at('costa', 1000) },
    { place: 'rally', label: 'RALLY TÊTE DE CHIEN', title: 'Rally Tête de Chien', color: 0xff6a13, ...start('cerrito') },
    { place: 'condor', label: 'RALLY EL CÓNDOR', title: 'Rally El Cóndor', color: 0x8a5a2b, ...start('cerro-grande') },
  ];
  for (const g of gates) {
    g.ring = buildGate(b, g);
    // al volver de ese lugar aparecés un poco antes del arco, mirando para afuera
    g.back = { x: g.x - Math.cos(g.yaw) * 22, y: g.y + 1.4, z: g.z - Math.sin(g.yaw) * 22, yaw: -(g.yaw + Math.PI) };
  }
  // la tienda: al salir quedás en la calle
  gates[0].back = { x: -30, y: CITY_Y + 1.4, z: 60, yaw: 0 };
  buildTrees(b, heightAt, surfaceAt);
  const coins = placeCoins(roads, heightAt, gates);
  const coinFx = coinMeshes(scene, coins);

  const spawn = { x: -50, y: CITY_Y + 1.4, z: 60, yaw: 0 };
  let ringT = 0;
  return {
    builder: b,
    spawn,
    gates,
    coins,
    roads,
    buildings,
    heightAt,
    surfaceAt,
    shoreZ,
    bounds: { x0: -HALF, x1: HALF, z0: -HALF, z1: shoreZ(0) + 200 },
    city: CITY,
    mountains: [M1, M2],
    update(dt) {
      coinFx.update(dt);
      ringT += dt;
      for (const g of gates) g.ring.material.opacity = 0.35 + 0.25 * Math.sin(ringT * 3);
    },
  };
}

/** Punto k de una ruta con su dirección (para poner el arco atravesado). */
function pointOn(r, k) {
  const a = r.pts[Math.max(0, k - 1)], c = r.pts[Math.min(r.pts.length - 1, k + 1)];
  // yaw del auto: 0 = mirando a +X; la física gira al revés que atan2 en este plano
  const ang = Math.atan2(c.z - a.z, c.x - a.x);
  return { x: r.pts[k].x, z: r.pts[k].z, y: r.ys[k], yaw: ang };
}
