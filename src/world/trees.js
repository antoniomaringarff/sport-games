// Árboles mediterráneos hechos por código: pino piñonero, pino carrasco, ciprés, olivo,
// palmera y arbusto. Cada especie tiene variantes, corteza real (Poly Haven) y follaje con
// sombreado propio (más oscuro adentro y abajo). Se dibujan con "instancias": miles de árboles
// cuestan casi lo mismo que uno.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pbrMaps } from './pbr.js';
import { mulberry } from './city.js';
import { Q } from '../core/graphics.js';

// ---------------------------------------------------------------------------
// Materiales compartidos

let mats = null;
function materials() {
  if (mats) return mats;
  const bark = pbrMaps('bark_brown_02', 1, 1);
  mats = {
    bark: new THREE.MeshStandardMaterial({ ...bark, roughness: 1 }),
    leaves: new THREE.MeshStandardMaterial({
      vertexColors: true, map: leafTexture(), roughness: 0.92, alphaTest: 0.4, side: THREE.DoubleSide,
    }),
    palmTrunk: new THREE.MeshStandardMaterial({ map: palmTrunkTexture(), normalMap: bark.normalMap, roughness: 1 }),
    frond: new THREE.MeshStandardMaterial({
      map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true,
    }),
  };
  return mats;
}

/** Textura de hojitas con huecos (transparente entre hojas): la copa no se ve como una pelota. */
function leafTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  const r = mulberry(5);
  // muchas hojas chicas; se dibujan también corridas para que la textura se repita sin cortes
  for (let i = 0; i < 5200; i++) {
    const v = Math.floor(110 + r() * 145);
    const x = r() * S, y = r() * S, rx = 2 + r() * 4, ry = 1 + r() * 1.8, a = r() * 3.14;
    g.fillStyle = `rgba(${v},${v},${v},1)`;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      if (x + ox < -8 || x + ox > S + 8 || y + oy < -8 || y + oy > S + 8) continue;
      g.beginPath();
      g.ellipse(x + ox, y + oy, rx, ry, a, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Tronco de palmera: anillos de las hojas viejas. */
function palmTrunkTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7d6a52';
  g.fillRect(0, 0, 64, 256);
  const r = mulberry(9);
  for (let y = 0; y < 256; y += 9) {
    g.fillStyle = `rgba(60,45,30,${0.4 + r() * 0.3})`;
    g.fillRect(0, y, 64, 3);
    g.fillStyle = `rgba(170,150,120,${0.25 + r() * 0.2})`;
    g.fillRect(0, y + 3, 64, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Hoja de palmera: nervio central y muchos folíolos (transparente entre ellos). */
function frondTexture() {
  const W = 128, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  const r = mulberry(3);
  g.lineCap = 'round';
  for (let y = 8; y < H - 4; y += 5) {
    const t = y / H;
    const len = (W / 2 - 4) * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (0.85 + r() * 0.15);
    const shade = 70 + Math.floor(r() * 50);
    g.strokeStyle = `rgb(${shade - 25},${shade + 40},${shade - 30})`;
    g.lineWidth = 2.6;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(W / 2, y);
      g.quadraticCurveTo(W / 2 + s * len * 0.5, y + 6, W / 2 + s * len, y + 16 + r() * 6);
      g.stroke();
    }
  }
  g.strokeStyle = '#8a8a50';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(W / 2, 0);
  g.lineTo(W / 2, H);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// Piezas

/** Tronco curvo: tramos de cilindro (UV de corteza: vuelta = 1, alto cada 2 m). */
function trunk(r, height, lean, segs = 5, rnd) {
  const pts = [];
  let x = 0, z = 0, dx = (rnd() - 0.5) * lean, dz = (rnd() - 0.5) * lean;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push(new THREE.Vector3(x, t * height, z));
    x += dx * (height / segs);
    z += dz * (height / segs);
    dx += (rnd() - 0.5) * lean * 0.6;
    dz += (rnd() - 0.5) * lean * 0.6;
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, segs * 2, r, 7, false);
  // afinar hacia arriba
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const t = uv.getX(i); // 0 abajo, 1 arriba
    const c = curve.getPointAt(Math.min(1, t));
    const k = 1 - t * 0.45;
    pos.setXYZ(i, c.x + (pos.getX(i) - c.x) * k, pos.getY(i), c.z + (pos.getZ(i) - c.z) * k);
    uv.setXY(i, uv.getY(i), (t * height) / 2);
  }
  g.computeVertexNormals();
  return { geo: g, top: pts[pts.length - 1] };
}

/** Mata de follaje: esfera deformada con ruido, sombreada (oscura abajo/adentro). */
function blob(cx, cy, cz, rx, ry, rz, color, rnd, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const uv = new Float32Array(pos.count * 2);
  const ph = rnd() * 10;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = 1 + 0.22 * Math.sin(x * 4.1 + ph) * Math.sin(y * 3.7 + ph * 1.3) * Math.sin(z * 4.7 - ph) + (rnd() - 0.5) * 0.12;
    pos.setXYZ(i, cx + x * rx * n, cy + y * ry * n, cz + z * rz * n);
    // luz "propia": arriba más clara, abajo más oscura
    const l = 0.55 + 0.45 * (y * 0.5 + 0.5);
    col.set([color[0] * l, color[1] * l, color[2] * l], i * 3);
    // UV sin costura (proyección desde dos lados), ~5 repeticiones por metro... de hojas
    uv[i * 2] = (x * rx * 0.8 + z * rz * 0.6) * 0.9;
    uv[i * 2 + 1] = (y * ry + z * rz * 0.3) * 0.9;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  // normales "infladas" (desde el centro de la mata): el follaje se ve suave, no facetado
  const nrm = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3(pos.getX(i) - cx, (pos.getY(i) - cy) * 0.8, pos.getZ(i) - cz).normalize();
    const f = new THREE.Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).lerp(v, 0.7).normalize();
    nrm.setXYZ(i, f.x, f.y, f.z);
  }
  return g;
}

const mergeGroup = (parts) => {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
  return g;
};

// ---------------------------------------------------------------------------
// Especies: cada función devuelve { parts: [[geometría, material]] }

const SPECIES = {
  /** Pino piñonero: tronco alto y copa ancha y plana (el típico de la Costa Azul). */
  pinon(rnd) {
    const h = 7 + rnd() * 3;
    const t = trunk(0.28, h, 0.25, 5, rnd);
    const leaves = [];
    const n = 6 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(), d = i === 0 ? 0 : 1.6 + rnd() * 1.6;
      leaves.push(blob(t.top.x + Math.cos(a) * d, t.top.y + 0.4 + rnd() * 0.6, t.top.z + Math.sin(a) * d,
        2.0 + rnd() * 0.8, 0.85 + rnd() * 0.3, 2.0 + rnd() * 0.8, [0.2, 0.33, 0.16], rnd));
    }
    return [[t.geo, 'bark'], [mergeGroup(leaves), 'leaves']];
  },
  /** Pino carrasco: más chico, torcido, con copas irregulares a distintas alturas. */
  carrasco(rnd) {
    const h = 5 + rnd() * 3;
    const t = trunk(0.22, h, 0.45, 5, rnd);
    const leaves = [];
    const n = 4 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const k = 0.45 + (i / n) * 0.6;
      const a = rnd() * 6.28, d = 0.6 + rnd() * 1.4;
      leaves.push(blob(t.top.x * k + Math.cos(a) * d, h * k + 0.6, t.top.z * k + Math.sin(a) * d,
        1.2 + rnd() * 0.7, 0.8 + rnd() * 0.4, 1.2 + rnd() * 0.7, [0.27, 0.38, 0.2], rnd));
    }
    return [[t.geo, 'bark'], [mergeGroup(leaves), 'leaves']];
  },
  /** Ciprés: columna verde oscura, angosta y alta. */
  cipres(rnd) {
    const h = 8 + rnd() * 4;
    const t = trunk(0.16, 1.2, 0, 1, rnd);
    const g = blob(0, h * 0.52, 0, 0.95 + rnd() * 0.3, h * 0.5, 0.95 + rnd() * 0.3, [0.12, 0.22, 0.12], rnd, 2);
    // punta más fina
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = (pos.getY(i) - h * 0.02) / h;
      const k = Math.max(0.15, 1 - Math.pow(Math.max(0, y - 0.3) / 0.7, 1.5) * 0.85);
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
    return [[t.geo, 'bark'], [g, 'leaves']];
  },
  /** Olivo: tronco corto y retorcido, copa redonda verde grisácea. */
  olivo(rnd) {
    const t = trunk(0.3, 2 + rnd(), 0.7, 3, rnd);
    const leaves = [];
    for (let i = 0; i < 5; i++) {
      const a = rnd() * 6.28, d = rnd() * 1.4;
      leaves.push(blob(t.top.x + Math.cos(a) * d, t.top.y + 0.8 + rnd() * 1.2, t.top.z + Math.sin(a) * d,
        1.3 + rnd() * 0.5, 1.0 + rnd() * 0.4, 1.3 + rnd() * 0.5, [0.42, 0.48, 0.34], rnd));
    }
    return [[t.geo, 'bark'], [mergeGroup(leaves), 'leaves']];
  },
  /** Arbusto (garriga): matas bajas. */
  arbusto(rnd) {
    const leaves = [];
    const n = 2 + Math.floor(rnd() * 3);
    const tone = rnd() < 0.5 ? [0.3, 0.4, 0.2] : [0.38, 0.42, 0.24];
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.28, d = rnd() * 0.8;
      leaves.push(blob(Math.cos(a) * d, 0.4 + rnd() * 0.3, Math.sin(a) * d, 0.7 + rnd() * 0.5, 0.55 + rnd() * 0.3, 0.7 + rnd() * 0.5, tone, rnd));
    }
    return [[mergeGroup(leaves), 'leaves']];
  },
  /** Paja brava (pastizal de altura): matas bajas, amarillentas y achatadas. */
  paja(rnd) {
    const leaves = [];
    const n = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.28, d = rnd() * 0.5;
      const tone = [0.62 + rnd() * 0.08, 0.55 + rnd() * 0.06, 0.3];
      leaves.push(blob(Math.cos(a) * d, 0.25, Math.sin(a) * d, 0.45 + rnd() * 0.25, 0.4 + rnd() * 0.2, 0.45 + rnd() * 0.25, tone, rnd));
    }
    return [[mergeGroup(leaves), 'leaves']];
  },
  /** Palmera: tronco con anillos, penacho de hojas largas que caen en arco. */
  palmera(rnd) {
    const h = 6 + rnd() * 4;
    const t = trunk(0.22, h, 0.3, 6, rnd);
    t.geo.attributes.uv.array.forEach((v, i, arr) => { if (i % 2) arr[i] = v * 1.2; });
    const fronds = [];
    const n = 11 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.3;
      const up = 0.5 - rnd() * 0.9; // algunas para arriba, otras caídas
      fronds.push(frond(t.top, a, 3.2 + rnd() * 1.2, up, rnd));
    }
    return [[t.geo, 'palmTrunk'], [mergeGroup(fronds), 'frond']];
  },
};

/** Una hoja de palmera: tira de quads que sale del penacho y cae en arco. */
function frond(top, ang, len, up, rnd) {
  const segs = 6, w = 0.9;
  const P = [], U = [], C = [], idx = [];
  const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const tone = 0.8 + rnd() * 0.35;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const d = t * len;
    const y = top.y + up * d * 1.2 - d * d * 0.16;
    const c = new THREE.Vector3(top.x, y, top.z).addScaledVector(dir, d);
    const ww = w * (0.35 + Math.sin(Math.PI * Math.min(1, t * 1.1)) * 0.65);
    // un poco en "V" para que no se vea chata de costado
    const droop = ww * 0.25;
    P.push(c.x - side.x * ww, c.y - droop, c.z - side.z * ww, c.x + side.x * ww, c.y - droop, c.z + side.z * ww);
    U.push(0, t, 1, t);
    C.push(tone, tone, tone, tone, tone, tone);
    if (i < segs) {
      const q = i * 2;
      idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // que la luz le pegue como a algo que mira para arriba (si no, de abajo se ve negra)
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.4, Math.abs(n.getY(i)) + 0.6, n.getZ(i) * 0.4);
  return g;
}

// ---------------------------------------------------------------------------

const VARIANTS = 3;
const cache = new Map();
function variant(kind, v) {
  const key = `${kind}:${v}`;
  if (!cache.has(key)) cache.set(key, SPECIES[kind](mulberry(1000 + v * 77 + kind.length * 13)));
  return cache.get(key);
}

/**
 * Pone árboles en la escena.
 * list: [{ kind: 'pinon'|'carrasco'|'cipres'|'olivo'|'arbusto'|'palmera', x, y, z, s (escala), rot }]
 * Devuelve los InstancedMesh creados.
 */
export function plantTrees(scene, list, { shadows = true, thin = true } = {}) {
  const M = materials();
  const groups = new Map();
  const rnd = mulberry(42);
  for (const t of list) {
    // en calidad media/baja, menos árboles (las palmeras de la costanera quedan todas)
    if (thin && t.kind !== 'palmera' && rnd() > (Q.trees ?? 1)) continue;
    const key = `${t.kind}:${Math.floor(rnd() * VARIANTS)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const out = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  for (const [key, items] of groups) {
    const [kind, v] = key.split(':');
    for (const [geo, matName] of variant(kind, +v)) {
      const inst = new THREE.InstancedMesh(geo, M[matName], items.length);
      items.forEach((t, i) => {
        q.setFromEuler(e.set((rnd() - 0.5) * 0.06, t.rot, (rnd() - 0.5) * 0.06));
        m.compose(new THREE.Vector3(t.x, t.y - 0.15, t.z), q, new THREE.Vector3(t.s, t.s * (0.9 + rnd() * 0.2), t.s));
        inst.setMatrixAt(i, m);
        // cada árbol con un tono un poco distinto
        const k = 0.82 + rnd() * 0.3;
        col.setRGB(k * (0.95 + rnd() * 0.1), k, k * (0.9 + rnd() * 0.15));
        inst.setColorAt(i, col);
      });
      inst.castShadow = shadows;
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      scene.add(inst);
      out.push(inst);
    }
  }
  return out;
}
