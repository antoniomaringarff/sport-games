// Ciudad: casas y edificios con estilos distintos (fachadas variadas, techos de tejas a cuatro
// aguas en las casas y edificios bajos, azoteas con maquinarias en los altos).
// Junto a la pista no hay edificios: ahí van las tribunas (y las casas quedan detrás).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pbrMaps } from './pbr.js';

const DIR = `${import.meta.env.BASE_URL}assets/textures/`;

// Un "módulo" de fachada = 2 ventanas de ancho × 2 pisos de alto
const TILE = { w: 6.8, h: 6.4 };
export const CLEAR_FROM_TRACK = 34; // metros libres a cada lado del eje de la pista

// estilos: 0 francés clásico · 1 departamentos modernos · 2 villa · 3 Belle Époque (hoteles)
const STYLE_COLORS = [
  [0xe6d6bc, 0xd9b48a, 0xe8cfb0, 0xd7a985, 0xece6da, 0xd8c28f],
  [0xf1efe9, 0xe4e1da, 0xd9d4ca, 0xebe3d3],
  [0xf0c9a8, 0xf3dca0, 0xe9b59a, 0xf2e3c8, 0xe7c7b8, 0xd9a07a, 0xf4e9d5],
  [0xeee4cf, 0xe8d8bd, 0xf2ece0],
];
const TILE_ROOFS = [
  [1.9, 1.35, 1.05], [1.75, 1.15, 0.9], [2.0, 1.45, 1.15], [1.6, 1.2, 1.0], [1.85, 1.3, 1.1],
];

export function buildBuildings(scene, list, track = null) {
  const rnd = mulberry(1234);
  const near = track ? trackDistance(track) : () => Infinity;
  const walls = [], roofs = [], flats = [];
  const kept = [];
  const c = new THREE.Color();

  for (const bd of list) {
    const pts = [];
    for (let i = 0; i < bd.p.length; i += 2) pts.push([bd.p[i], bd.p[i + 1]]);
    if (pts.length < 3) continue;
    let cx = 0, cz = 0;
    for (const [x, z] of pts) { cx += x; cz += z; }
    cx /= pts.length; cz /= pts.length;
    if (near(cx, cz) < CLEAR_FROM_TRACK) continue; // lugar para tribunas y veredas
    kept.push(bd);

    const area = Math.abs(polyArea(pts));
    const r = rnd();
    const isHouse = bd.k === 'casa' || (area < 260 && bd.h < 22) || (bd.h < 13 && r < 0.6);
    let style, h;
    if (isHouse) {
      style = 2;
      h = 5.8 + rnd() * 3.4; // planta baja + primer piso (a veces un segundo)
    } else if (bd.k === 'hotel' || bd.k === 'oficina' || bd.k === 'iglesia') {
      style = 3;
      h = Math.min(bd.h, 32);
    } else {
      style = r < 0.55 ? 0 : 1;
      h = Math.min(bd.h, bd.h > 30 ? 30 + (bd.h - 30) * 0.3 : bd.h);
    }
    const pal = STYLE_COLORS[style];
    c.setHex(pal[Math.floor(rnd() * pal.length)]);

    walls.push(wallGeometry(pts, bd.y, h, style, c));

    // techo
    const rect = minAreaRect(pts);
    const fits = area / (rect.a * rect.b * 4) > 0.72;
    if ((isHouse || h < 17) && fits && rect.b < 16) {
      const t = TILE_ROOFS[Math.floor(rnd() * TILE_ROOFS.length)];
      const k = 0.85 + rnd() * 0.2;
      roofs.push(hipRoof(rect, bd.y + h, isHouse ? 0.5 : 0.42, [t[0] * k, t[1] * k, t[2] * k]));
    } else {
      const g = 0.75 + rnd() * 0.2;
      flats.push(flatRoof(pts, bd.y + h, [g, g * 0.98, g * 0.95]));
      if (h > 14 && area > 150) flats.push(rooftopBoxes(rect, bd.y + h, rnd));
    }
  }

  const add = (geos, mat) => {
    if (!geos.length) return;
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  };
  add(walls, facadeMaterial());
  add(roofs, new THREE.MeshStandardMaterial({ vertexColors: true, ...pbrMaps('roof_tiles_14'), roughness: 1 }));
  add(flats, new THREE.MeshStandardMaterial({ vertexColors: true, ...pbrMaps('plastered_wall_04', 1), roughness: 0.95 }));
  return kept;
}

// ---------------------------------------------------------------------------
// Geometrías

function wallGeometry(pts, y0, h, style, color) {
  // normal hacia afuera según el sentido del polígono
  const sgn = polyArea(pts) > 0 ? 1 : -1;
  const P = [], N = [], U = [], C = [], S = [];
  let u = 0;
  const vTop = h / TILE.h;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) continue;
    const nx = (sgn * (bz - az)) / len, nz = (-sgn * (bx - ax)) / len;
    // módulos enteros por pared: así las ventanas no quedan cortadas en las esquinas
    const u0 = Math.round(u * 2) / 2, u1 = u0 + Math.max(0.5, Math.round((len / TILE.w) * 2) / 2);
    u += len / TILE.w;
    const A0 = [ax, y0 - 1.5, az, u0, -1.5 / TILE.h], B0 = [bx, y0 - 1.5, bz, u1, -1.5 / TILE.h];
    const B1 = [bx, y0 + h, bz, u1, vTop], A1 = [ax, y0 + h, az, u0, vTop];
    // el orden de los vértices define qué lado se ve: tiene que ser el de afuera
    const quad = sgn > 0 ? [A0, B1, B0, A0, A1, B1] : [A0, B0, B1, A0, B1, A1];
    for (const [x, y, z, uu, vv] of quad) {
      P.push(x, y, z);
      N.push(nx, 0, nz);
      U.push(uu, vv);
      C.push(color.r, color.g, color.b);
      S.push(style);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('facadeStyle', new THREE.Float32BufferAttribute(S, 1));
  return g;
}

/** Techo a cuatro aguas sobre el rectángulo que mejor envuelve la planta. */
function hipRoof(rect, eave, pitch, tint) {
  const { cx, cz, ux, uz, a, b } = rect; // u = lado largo
  const o = 0.45; // alero
  const A = a + o, B = b + o, rise = B * pitch, ridge = Math.max(0, A - B);
  const vx = -uz, vz = ux;
  const at = (s, t, y) => [cx + ux * s + vx * t, y, cz + uz * s + vz * t];
  const c1 = at(-A, -B, eave), c2 = at(A, -B, eave), c3 = at(A, B, eave), c4 = at(-A, B, eave);
  const r1 = at(-ridge, 0, eave + rise), r2 = at(ridge, 0, eave + rise);
  const faces = [
    [c1, c2, r2, r1],
    [c3, c4, r1, r2],
    [c2, c3, r2],
    [c4, c1, r1],
  ];
  const P = [], N = [], U = [], C = [];
  const v3 = (p) => new THREE.Vector3(...p);
  for (const f of faces) {
    const tris = f.length === 4 ? [[f[0], f[1], f[2]], [f[0], f[2], f[3]]] : [f];
    const e = v3(f[1]).sub(v3(f[0])).normalize();
    const n = new THREE.Vector3().crossVectors(v3(f[1]).sub(v3(f[0])), v3(f[2]).sub(v3(f[0]))).normalize();
    const flip = n.y < 0;
    if (flip) n.negate();
    for (let tri of tris) {
      if (flip) tri = [tri[0], tri[2], tri[1]];
      for (const p of tri) {
        P.push(...p);
        N.push(n.x, n.y, n.z);
        const d = v3(p).sub(v3(f[0]));
        U.push(d.dot(e) / 2.6, (p[1] - eave) / Math.sin(Math.atan(pitch)) / 2.6);
        C.push(...tint);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}

function flatRoof(pts, y, tint) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(shape).toNonIndexed();
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  const pos = g.attributes.position;
  const U = [], C = [];
  for (let i = 0; i < pos.count; i++) {
    U.push(pos.getX(i) / 4, pos.getZ(i) / 4);
    C.push(...tint);
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return g;
}

/** Sala de máquinas y tanques en las azoteas de los edificios altos. */
function rooftopBoxes(rect, y, rnd) {
  const geos = [];
  const n = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const w = 2 + rnd() * 4, d = 2 + rnd() * 3, h = 1.5 + rnd() * 2.2;
    const s = (rnd() - 0.5) * rect.a, t = (rnd() - 0.5) * rect.b;
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.rotateY(-Math.atan2(rect.uz, rect.ux));
    g.translate(rect.cx + rect.ux * s - rect.uz * t, y + h / 2, rect.cz + rect.uz * s + rect.ux * t);
    const pos = g.attributes.position, U = [], C = [];
    for (let k = 0; k < pos.count; k++) {
      U.push((pos.getX(k) + pos.getZ(k)) / 4, pos.getY(k) / 4);
      C.push(0.8, 0.79, 0.77);
    }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    geos.push(g);
  }
  return mergeGeometries(geos, false);
}

// ---------------------------------------------------------------------------
// Fachadas: un atlas con los 4 estilos (2 × 2). Cada estilo es un módulo de 2 ventanas × 2 pisos.

let atlas = null;
function facadeAtlas() {
  if (atlas) return atlas;
  const S = 1024, Q = S / 2;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const draw = (plaster) => {
    for (let st = 0; st < 4; st++) {
      const ox = (st % 2) * Q, oy = Math.floor(st / 2) * Q;
      g.save();
      g.beginPath();
      g.rect(ox, oy, Q, Q);
      g.clip();
      g.translate(ox, oy);
      if (plaster) {
        g.drawImage(plaster, 0, 0, Q / 2, Q / 2);
        g.drawImage(plaster, Q / 2, 0, Q / 2, Q / 2);
        g.drawImage(plaster, 0, Q / 2, Q / 2, Q / 2);
        g.drawImage(plaster, Q / 2, Q / 2, Q / 2, Q / 2);
        g.fillStyle = 'rgba(255,252,245,0.62)';
        g.fillRect(0, 0, Q, Q);
      } else {
        g.fillStyle = '#efe9df';
        g.fillRect(0, 0, Q, Q);
      }
      STYLES[st](g, Q);
      g.restore();
    }
  };
  draw(null);
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;
  new THREE.ImageLoader().load(`${DIR}plastered_wall_04_color.webp`, (img) => {
    draw(img);
    atlas.needsUpdate = true;
  });
  return atlas;
}

function glass(g, x, y, w, h, frame = 'rgba(245,245,240,0.95)') {
  const grd = g.createLinearGradient(0, y, 0, y + h);
  grd.addColorStop(0, '#aabdcc');
  grd.addColorStop(0.5, '#5b6c7a');
  grd.addColorStop(1, '#37434e');
  g.fillStyle = grd;
  g.fillRect(x, y, w, h);
  g.fillStyle = frame;
  g.fillRect(x + w / 2 - 2, y, 4, h);
  g.fillRect(x, y + h * 0.36, w, 3);
}
function shutters(g, x, y, w, h, color, closed = false) {
  const draw = (sx, sw) => {
    g.fillStyle = color;
    g.fillRect(sx, y - 2, sw, h + 2);
    g.fillStyle = 'rgba(25,30,25,0.25)';
    for (let ly = y + 4; ly < y + h; ly += 7) g.fillRect(sx + 3, ly, sw - 6, 2);
  };
  if (closed) draw(x, w);
  else {
    draw(x - 6 - w * 0.48, w * 0.48);
    draw(x + w + 6, w * 0.48);
  }
}
function railing(g, x, y, w, hgt = 26) {
  g.fillStyle = 'rgba(235,230,220,0.95)';
  g.fillRect(x - 4, y, w + 8, 8);
  g.fillStyle = 'rgba(40,40,40,0.28)';
  g.fillRect(x - 4, y + 8, w + 8, 6);
  g.strokeStyle = '#2a2c2e';
  g.lineWidth = 2;
  g.strokeRect(x, y - hgt, w, hgt);
  for (let bx = x; bx < x + w; bx += 7) {
    g.beginPath();
    g.moveTo(bx, y - hgt);
    g.lineTo(bx, y);
    g.stroke();
  }
}
function dirt(g, x, y, w) {
  const d = g.createLinearGradient(0, y, 0, y + 50);
  d.addColorStop(0, 'rgba(70,60,50,0.13)');
  d.addColorStop(1, 'rgba(70,60,50,0)');
  g.fillStyle = d;
  g.fillRect(x, y, w, 50);
}

const STYLES = [
  // 0: francés clásico — ventanas altas, postigos, balcones alternados
  (g, Q) => {
    const W = Q / 2;
    const cols = ['#8fa58a', '#9fb5bd', '#e8e4da', '#c9b48f'];
    for (let fy = 0; fy < 2; fy++) for (let fx = 0; fx < 2; fx++) {
      const x0 = fx * W, y0 = fy * W, v = fx + fy * 2;
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(x0, y0 + W - 10, W, 6);
      const ww = W * 0.3, wh = W * 0.56, wx = x0 + (W - ww) / 2, wy = y0 + W * 0.16;
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillRect(wx - 8, wy - 10, ww + 16, wh + 14);
      glass(g, wx, wy, ww, wh);
      if (v !== 1) shutters(g, wx, wy, ww, wh, cols[v], v === 3);
      if (v === 0 || v === 2) railing(g, wx - 22, wy + wh + 2, ww + 44);
      dirt(g, wx, wy + wh + 10, ww);
    }
  },
  // 1: departamentos modernos — bandas de balcones corridos y ventanales
  (g, Q) => {
    const F = Q / 2;
    for (let fy = 0; fy < 2; fy++) {
      const y0 = fy * F;
      // ventanal corrido con carpintería oscura
      const wy = y0 + F * 0.12, wh = F * 0.62;
      const grd = g.createLinearGradient(0, wy, 0, wy + wh);
      grd.addColorStop(0, '#9fb6c6');
      grd.addColorStop(0.6, '#4d5d6a');
      grd.addColorStop(1, '#2f3a44');
      g.fillStyle = grd;
      g.fillRect(Q * 0.04, wy, Q * 0.92, wh);
      g.fillStyle = '#3a3d40';
      for (let x = Q * 0.04; x <= Q * 0.96; x += Q * 0.23) g.fillRect(x - 2, wy, 5, wh);
      // cortinas en algunas
      g.fillStyle = 'rgba(235,225,205,0.75)';
      g.fillRect(Q * 0.28, wy + 4, Q * 0.1, wh - 8);
      g.fillRect(Q * 0.74 - fy * Q * 0.4, wy + 4, Q * 0.12, wh - 8);
      // losa del balcón + baranda de vidrio
      const by = y0 + F * 0.8;
      g.fillStyle = '#f4f2ee';
      g.fillRect(0, by, Q, 14);
      g.fillStyle = 'rgba(30,30,30,0.3)';
      g.fillRect(0, by + 14, Q, 8);
      g.fillStyle = 'rgba(180,205,215,0.45)';
      g.fillRect(0, by - 34, Q, 34);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fillRect(0, by - 36, Q, 3);
      // macetas
      g.fillStyle = '#4f7a3c';
      for (let x = 30 + fy * 60; x < Q; x += 170) {
        g.beginPath();
        g.arc(x, by - 34, 14, 0, Math.PI * 2);
        g.fill();
      }
    }
  },
  // 2: villa — ventanas chicas con arco, postigos de color, zócalo de piedra
  (g, Q) => {
    const W = Q / 2;
    const cols = ['#5f8a8f', '#7a9a6a', '#4f6f8f', '#8a6a4a'];
    for (let fy = 0; fy < 2; fy++) for (let fx = 0; fx < 2; fx++) {
      const x0 = fx * W, y0 = fy * W, v = fx + fy * 2;
      const ww = W * 0.26, wh = W * 0.4, wx = x0 + (W - ww) / 2, wy = y0 + W * 0.26;
      // moldura con arco
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath();
      g.moveTo(wx - 9, wy + wh + 6);
      g.lineTo(wx - 9, wy);
      g.arc(wx + ww / 2, wy, ww / 2 + 9, Math.PI, 0);
      g.lineTo(wx + ww + 9, wy + wh + 6);
      g.fill();
      g.save();
      g.beginPath();
      g.moveTo(wx, wy + wh);
      g.lineTo(wx, wy);
      g.arc(wx + ww / 2, wy, ww / 2, Math.PI, 0);
      g.lineTo(wx + ww, wy + wh);
      g.clip();
      glass(g, wx, wy - ww / 2, ww, wh + ww / 2);
      g.restore();
      shutters(g, wx, wy - 4, ww, wh + 4, cols[(v + fy) % cols.length], v === 2);
      // macetero con flores bajo algunas ventanas
      if (v % 2 === 0) {
        g.fillStyle = '#9a5a3a';
        g.fillRect(wx - 4, wy + wh + 6, ww + 8, 12);
        for (let i = 0; i < 6; i++) {
          g.fillStyle = ['#d8334a', '#f2f2f2', '#e86fa0', '#f2c230'][i % 4];
          g.beginPath();
          g.arc(wx + 2 + (i * (ww + 4)) / 6 + 4, wy + wh + 4, 5, 0, Math.PI * 2);
          g.fill();
        }
      }
      dirt(g, wx, wy + wh + 16, ww);
    }
    // zócalo de piedra en la planta baja (abajo del módulo)
    g.fillStyle = 'rgba(150,140,120,0.55)';
    g.fillRect(0, Q - 28, Q, 28);
    g.strokeStyle = 'rgba(90,80,65,0.4)';
    g.lineWidth = 2;
    for (let x = 0; x < Q; x += 36) g.strokeRect(x + ((Math.floor(x / 36) % 2) * 10), Q - 28, 36, 14);
    // canaleta / alero en el borde de arriba
    g.fillStyle = 'rgba(120,100,80,0.25)';
    g.fillRect(0, 0, Q, 5);
  },
  // 3: Belle Époque — ventanas con frontón, bandas de piedra, balcones de hierro trabajados
  (g, Q) => {
    const W = Q / 2;
    for (let fy = 0; fy < 2; fy++) {
      const y0 = fy * W;
      g.fillStyle = 'rgba(205,190,160,0.75)';
      g.fillRect(0, y0 + W - 22, Q, 18); // banda de piedra
      g.fillStyle = 'rgba(80,65,45,0.2)';
      g.fillRect(0, y0 + W - 4, Q, 4);
      for (let fx = 0; fx < 2; fx++) {
        const x0 = fx * W;
        const ww = W * 0.32, wh = W * 0.52, wx = x0 + (W - ww) / 2, wy = y0 + W * 0.2;
        // pilastras
        g.fillStyle = 'rgba(225,212,185,0.7)';
        g.fillRect(x0 + 6, y0, 16, W - 22);
        // frontón
        g.fillStyle = 'rgba(245,238,222,0.95)';
        g.beginPath();
        g.moveTo(wx - 14, wy - 8);
        g.lineTo(wx + ww / 2, wy - 30);
        g.lineTo(wx + ww + 14, wy - 8);
        g.closePath();
        g.fill();
        g.fillRect(wx - 10, wy - 8, ww + 20, wh + 12);
        glass(g, wx, wy, ww, wh);
        // balcón de hierro curvo
        g.strokeStyle = '#1f2224';
        g.lineWidth = 2;
        const by = wy + wh + 4;
        g.fillStyle = 'rgba(240,232,215,0.95)';
        g.fillRect(wx - 16, by, ww + 32, 8);
        for (let i = 0; i < 8; i++) {
          const bx = wx - 12 + (i * (ww + 24)) / 7;
          g.beginPath();
          g.ellipse(bx, by - 12, 4, 10, 0, 0, Math.PI * 2);
          g.stroke();
        }
        g.beginPath();
        g.moveTo(wx - 14, by - 24);
        g.lineTo(wx + ww + 14, by - 24);
        g.stroke();
        dirt(g, wx, by + 12, ww);
      }
    }
  },
];

function facadeMaterial() {
  const map = facadeAtlas();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map,
    normalMap: pbrMaps('plastered_wall_04').normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.88,
  });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float facadeStyle;\nvarying float vStyle;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStyle = facadeStyle;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vStyle;')
      .replace(
        '#include <map_fragment>',
        `// el atlas tiene 4 estilos de 2 × 2: repetir dentro del cuadro del estilo
        float st = floor(vStyle + 0.5);
        vec2 cellOff = vec2(mod(st, 2.0), floor(st / 2.0)) * 0.5;
        vec2 fuv = fract(vMapUv) * 0.5 + cellOff;
        // derivadas de la UV sin "fract" (si no, se ve una costura en cada módulo)
        vec4 sampledDiffuseColor = textureGrad(map, fuv, dFdx(vMapUv) * 0.5, dFdy(vMapUv) * 0.5);
        diffuseColor *= sampledDiffuseColor;`,
      );
  };
  mat.customProgramCacheKey = () => 'facade-atlas';
  return mat;
}

// ---------------------------------------------------------------------------
// Utilidades

function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

/** Rectángulo de área mínima que envuelve la planta (probando la dirección de cada lado). */
function minAreaRect(pts) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.01) continue;
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    for (const [x, z] of pts) {
      const s = x * ux + z * uz, t = -x * uz + z * ux;
      s0 = Math.min(s0, s); s1 = Math.max(s1, s);
      t0 = Math.min(t0, t); t1 = Math.max(t1, t);
    }
    const area = (s1 - s0) * (t1 - t0);
    if (!best || area < best.area) {
      const sc = (s0 + s1) / 2, tc = (t0 + t1) / 2;
      best = { area, cx: sc * ux - tc * uz, cz: sc * uz + tc * ux, ux, uz, a: (s1 - s0) / 2, b: (t1 - t0) / 2 };
    }
  }
  if (best.b > best.a) {
    // que "u" sea el lado largo
    [best.a, best.b] = [best.b, best.a];
    [best.ux, best.uz] = [-best.uz, best.ux];
  }
  return best;
}

/** Distancia (en planta) al eje de la pista, rápida con una grilla. */
export function trackDistance(track) {
  const C = 25;
  const hash = new Map();
  track.p.forEach((p, i) => {
    const key = `${Math.floor(p.x / C)},${Math.floor(p.z / C)}`;
    if (!hash.has(key)) hash.set(key, []);
    hash.get(key).push(i);
  });
  return (x, z) => {
    let best = Infinity;
    const ci = Math.floor(x / C), cj = Math.floor(z / C);
    for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) {
      for (const i of hash.get(`${ci + a},${cj + c}`) ?? []) best = Math.min(best, Math.hypot(track.p[i].x - x, track.p[i].z - z));
    }
    return best;
  };
}

export function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
