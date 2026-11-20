// Tribunas junto a la pista: gradas de cemento, público sentado, techo con columnas y
// carteles de publicidad (marcas inventadas). Se ponen en las rectas, donde el terreno
// es plano y no pisan otra parte del circuito.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pbrMaps } from './pbr.js';
import { mulberry, trackDistance } from './city.js';

const ROWS = 12, ROW_D = 0.85, ROW_H = 0.42, FRONT_H = 1.6;
const DEPTH = ROWS * ROW_D, TOP_H = FRONT_H + ROWS * ROW_H;

/**
 * heightAt(x, z): altura del terreno. Devuelve las "huellas" de las tribunas
 * ({cx, cz, ux, uz, a, b}: rectángulo) para no poner árboles encima.
 */
export function buildStands(scene, track, heightAt, { max = 16 } = {}) {
  const rnd = mulberry(77);
  const W = track.width / 2;
  const dist = trackDistance(track);
  const step = track.step ?? 2;
  const spots = [];
  const footprints = [];
  const stride = Math.round(30 / step);
  const look = Math.round(25 / step);

  for (let k = 0; k < track.n && spots.length < max; k += stride) {
    if (track.isTunnel[k]) continue;
    const a = track.d[(k - look + track.n) % track.n], b = track.d[(k + look) % track.n];
    if (a.dot(b) < Math.cos(THREE.MathUtils.degToRad(14))) continue; // solo en rectas
    for (const side of [-1, 1]) {
      const L = 34 + Math.floor(rnd() * 3) * 8;
      const P = track.p[k], R = track.r[k], D = track.d[k];
      const out = { x: R.x * side, z: R.z * side };
      const front = W + 3.2;
      const cx = P.x + out.x * (front + DEPTH / 2), cz = P.z + out.z * (front + DEPTH / 2);
      // no pisar otra parte de la pista ni otra tribuna
      let ok = true, minH = Infinity, maxH = -Infinity;
      for (const s of [-0.5, 0, 0.5]) for (const t of [0, 0.5, 1]) {
        const x = P.x + D.x * L * s + out.x * (front + DEPTH * t + 1);
        const z = P.z + D.z * L * s + out.z * (front + DEPTH * t + 1);
        if (dist(x, z) < front - 0.5) ok = false;
        const h = heightAt(x, z);
        minH = Math.min(minH, h);
        maxH = Math.max(maxH, h);
      }
      if (!ok) continue;
      if (minH < 0.4) continue;                 // agua
      if (maxH > P.y + TOP_H * 0.6) continue;   // contra un cerro
      if (footprints.some((f) => Math.hypot(f.cx - cx, f.cz - cz) < Math.max(f.a, L / 2) + 6)) continue;
      if (rnd() < 0.3) continue;                // no en todas las rectas
      spots.push({ P, D, out, front, L, bottom: Math.min(minH, P.y) - P.y - 1.5 });
      footprints.push({ cx, cz, ux: D.x, uz: D.z, a: L / 2 + 2, b: DEPTH / 2 + 3 });
    }
  }

  const parts = { concrete: [], crowd: [], roof: [], ads: [] };
  const m = new THREE.Matrix4();
  for (const s of spots) {
    const X = new THREE.Vector3(s.D.x, 0, s.D.z), Z = new THREE.Vector3(s.out.x, 0, s.out.z);
    if (new THREE.Vector3().crossVectors(X, new THREE.Vector3(0, 1, 0)).dot(Z) < 0) X.negate();
    m.makeBasis(X, new THREE.Vector3(0, 1, 0), Z);
    m.setPosition(s.P.x + s.out.x * s.front, s.P.y, s.P.z + s.out.z * s.front);
    for (const [kind, g] of standGeometry(s.L, s.bottom, rnd)) parts[kind].push(g.applyMatrix4(m));
  }

  const concrete = pbrMaps('plastered_wall_04');
  const mats = {
    concrete: new THREE.MeshStandardMaterial({ ...concrete, color: 0xb9b6b0, roughness: 0.95 }),
    crowd: new THREE.MeshStandardMaterial({ map: crowdTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }),
    roof: new THREE.MeshStandardMaterial({ color: 0xf0f0ee, roughness: 0.5, metalness: 0.3 }),
    ads: new THREE.MeshStandardMaterial({ map: adsTexture(), roughness: 0.6 }),
  };
  for (const [kind, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(list, false), mats[kind]);
    mesh.castShadow = kind !== 'crowd';
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  return footprints;
}

/** Una tribuna en coordenadas locales: x a lo largo de la pista, z hacia afuera, y arriba. */
function standGeometry(L, bottom, rnd) {
  const out = [];
  const norm = (g) => {
    g = g.index ? g.toNonIndexed() : g;
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    return g;
  };
  // estructura de cemento: perfil escalonado (en z-y) extruido a lo largo de x
  const sh = new THREE.Shape();
  sh.moveTo(0, bottom);
  sh.lineTo(0, FRONT_H);
  for (let i = 0; i < ROWS; i++) {
    sh.lineTo(i * ROW_D, FRONT_H + (i + 1) * ROW_H);
    sh.lineTo((i + 1) * ROW_D, FRONT_H + (i + 1) * ROW_H);
  }
  sh.lineTo(DEPTH + 0.4, FRONT_H + ROWS * ROW_H);
  sh.lineTo(DEPTH + 0.4, TOP_H + 1.2); // pared de atrás
  sh.lineTo(DEPTH + 0.8, TOP_H + 1.2);
  sh.lineTo(DEPTH + 0.8, bottom);
  sh.closePath();
  const body = new THREE.ExtrudeGeometry(sh, { depth: L, bevelEnabled: false });
  // el perfil quedó en (x = profundidad, y) y el largo en z: pasar a (x = largo, y, z = profundidad).
  // Cambiar x por z es un espejo: hay que invertir el orden de los triángulos.
  const bp = body.attributes.position;
  for (let i = 0; i < bp.count; i++) bp.setXYZ(i, bp.getZ(i) - L / 2, bp.getY(i), bp.getX(i));
  const idx = body.index;
  if (idx) for (let i = 0; i < idx.count; i += 3) { const t = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, t); }
  else for (let i = 0; i < bp.count; i += 3) {
    const tx = bp.getX(i + 1), ty = bp.getY(i + 1), tz = bp.getZ(i + 1);
    bp.setXYZ(i + 1, bp.getX(i + 2), bp.getY(i + 2), bp.getZ(i + 2));
    bp.setXYZ(i + 2, tx, ty, tz);
  }
  body.computeVertexNormals();
  const uvb = body.attributes.uv;
  for (let i = 0; i < uvb.count; i++) uvb.setXY(i, uvb.getX(i) / 4, uvb.getY(i) / 4);
  out.push(['concrete', norm(body)]);

  // público: una tira por fila, mirando a la pista
  for (let i = 0; i < ROWS; i++) {
    if (rnd() < 0.08) continue; // alguna fila medio vacía
    const g = new THREE.PlaneGeometry(L - 0.6, 1.05);
    g.rotateY(Math.PI); // mira hacia -z (la pista)
    g.translate(0, FRONT_H + (i + 1) * ROW_H + 0.5, i * ROW_D + ROW_D * 0.55);
    const uv = g.attributes.uv;
    const off = rnd();
    for (let j = 0; j < uv.count; j++) uv.setX(j, uv.getX(j) * (L / 7) + off);
    out.push(['crowd', norm(g)]);
  }

  // techo con columnas atrás
  const roofY = TOP_H + 4.2;
  const roof = new THREE.BoxGeometry(L + 1.5, 0.35, DEPTH + 2.5);
  roof.rotateX(-0.06);
  roof.translate(0, roofY, DEPTH / 2 - 0.4);
  out.push(['roof', norm(roof)]);
  for (let x = -L / 2 + 1; x <= L / 2 - 1; x += 8) {
    const col = new THREE.CylinderGeometry(0.22, 0.22, roofY - (TOP_H + 1.2), 8);
    col.translate(x, (roofY + TOP_H + 1.2) / 2, DEPTH + 0.6);
    out.push(['roof', norm(col)]);
  }
  // cartel en el frente del techo y en la pared de adelante
  const fascia = new THREE.PlaneGeometry(L + 1.5, 1.4);
  fascia.rotateY(Math.PI);
  fascia.translate(0, roofY - 0.45, -1.75);
  const front = new THREE.PlaneGeometry(L, 1.2);
  front.rotateY(Math.PI);
  front.translate(0, 0.75, -0.04);
  for (const g of [fascia, front]) {
    const uv = g.attributes.uv;
    const off = Math.floor(rnd() * 4) / 4;
    for (let j = 0; j < uv.count; j++) uv.setX(j, uv.getX(j) * (L / 24) + off);
    out.push(['ads', norm(g)]);
  }
  return out;
}

/** Público: cabezas y torsos de colores, con huecos (transparente). */
function crowdTexture() {
  const W = 512, H = 80;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const r = mulberry(11);
  const shirts = ['#d8262e', '#f2f2f2', '#1f4fa8', '#f2c230', '#2a2a2a', '#3f8f4f', '#e86fa0', '#f28c28', '#7a4fb0', '#9ad0e8'];
  const skins = ['#f1c9a5', '#e0ac85', '#c68a5e', '#8d5a3b', '#f6dcc4'];
  for (let x = 6; x < W - 6; x += 15 + r() * 6) {
    if (r() < 0.12) continue; // asiento vacío
    const bob = r() * 6;
    g.fillStyle = shirts[Math.floor(r() * shirts.length)];
    g.beginPath();
    g.roundRect(x - 7, 34 + bob, 14, 42 - bob, 5);
    g.fill();
    g.fillStyle = skins[Math.floor(r() * skins.length)];
    g.beginPath();
    g.arc(x, 26 + bob, 6.5, 0, Math.PI * 2);
    g.fill();
    if (r() < 0.35) {
      // gorra o pelo
      g.fillStyle = r() < 0.5 ? '#2b2118' : shirts[Math.floor(r() * shirts.length)];
      g.fillRect(x - 7, 18 + bob, 14, 5);
    }
    if (r() < 0.15) {
      // brazos arriba
      g.fillStyle = skins[Math.floor(r() * skins.length)];
      g.fillRect(x - 10, 8 + bob, 3, 26);
      g.fillRect(x + 7, 8 + bob, 3, 26);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Carteles de publicidad (marcas inventadas). */
function adsTexture() {
  const W = 1024, H = 64;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const ads = [
    ['AZUR', '#0d3b8c', '#ffffff'], ['RIVIERA', '#d8262e', '#ffffff'], ['SPORT GAMES', '#111111', '#f2c230'],
    ['CORNICHE', '#f2f2f2', '#0d3b8c'], ['MISTRAL', '#2a8f6a', '#ffffff'], ['PORT HERCULE', '#ffffff', '#d8262e'],
    ['TURBO', '#f28c28', '#111111'], ['CAP MARTIN', '#1f6fb0', '#ffffff'],
  ];
  const w = W / ads.length;
  ads.forEach(([txt, bg, fg], i) => {
    g.fillStyle = bg;
    g.fillRect(i * w, 0, w, H);
    g.fillStyle = fg;
    g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(txt, i * w + w / 2, H / 2 + 2, w - 12);
  });
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
