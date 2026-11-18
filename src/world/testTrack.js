// Pista de pruebas (Fase 1): un lugar para sentir el manejo antes de hacer la ciudad.
// Todo en metros. El auto arranca en SPAWN mirando hacia +X.
import * as THREE from 'three';
import { WorldBuilder } from './builder.js';
import { surfaceMaterial, stripesTexture } from './textures.js';

export const SPAWN = { x: -60, y: 1.2, z: 0, yaw: 0 };

const SIZE = 700; // lado del mundo

export function buildTestTrack(physics, scene) {
  const b = new WorldBuilder(physics, scene);
  const mat = (s, w, d, tile) => surfaceMaterial(s, w, d, tile);
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9b4aa, roughness: 0.9 });
  const asphaltMat = (w, d) => mat('asfalto', w, d, 10);

  // ---- Piso: pasto por todos lados ----
  b.box({
    size: { x: SIZE, y: 1, z: SIZE },
    pos: { x: 0, y: -0.5, z: 0 },
    material: mat('pasto', SIZE, SIZE, 12),
    surface: 'pasto',
    shadow: false,
  });

  // ---- Playón central de asfalto (para dar vueltas y derrapar) ----
  b.patch({ x: 0, z: 0, w: 160, d: 100, material: asphaltMat(160, 100), surface: 'asfalto' });
  addLines(scene, 0, 0, 160, 100);

  // Slalom de conos
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.6 });
  const coneGeo = new THREE.ConeGeometry(0.3, 0.75, 10);
  for (let i = 0; i < 7; i++) {
    b.cylinder({ radius: 0.28, height: 0.75, pos: { x: -25 + i * 10, y: 0.42, z: (i % 2 ? 1 : -1) * 0.5 }, material: coneMat, dynamic: true, mass: 4, geo: coneGeo });
  }
  // Rampas
  const rampMat = new THREE.MeshStandardMaterial({ color: 0xcfcab8, roughness: 0.85 });
  b.wedge({ x: 30, z: 28, length: 10, width: 8, height: 1.4, material: rampMat });          // chica
  b.wedge({ x: 35, z: -28, length: 14, width: 10, height: 3.2, material: rampMat });        // grande
  b.wedge({ x: 57, z: -28, length: 14, width: 10, height: 3.2, yaw: Math.PI, material: rampMat }); // aterrizaje
  // Pila de cajas para romper
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xc8954e, roughness: 0.8 });
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++)
      for (let z = 0; z < 3; z++)
        b.box({ size: { x: 1, y: 1, z: 1 }, pos: { x: 60 + x * 1.02, y: 0.53 + y * 1.01, z: 30 + z * 1.02 }, material: crateMat, dynamic: true, mass: 25 });

  // ---- Recta larga (velocidad máxima y lomos de burro) ----
  b.patch({ x: 0, z: -90, w: 520, d: 24, material: asphaltMat(520, 24), surface: 'asfalto' });
  addLines(scene, 0, -90, 520, 24);
  const bumpMat = new THREE.MeshStandardMaterial({ color: 0xe8c62e, roughness: 0.7 });
  for (const x of [-200, -185, -170]) {
    b.capsule({ radius: 0.35, length: 22, pos: { x, y: -0.12, z: -90 }, rot: { x: Math.PI / 2 }, material: bumpMat });
  }

  // ---- Zonas de superficies ----
  const zones = [
    ['adoquin', -150], ['tierra', -85], ['arena', -20], ['nieve', 45], ['pasto', 110],
  ];
  for (const [s, x] of zones) {
    if (s === 'pasto') continue; // el pasto ya está en todos lados
    b.patch({ x, z: 100, w: 60, d: 60, material: mat(s, 60, 60, s === 'adoquin' ? 3 : 8), surface: s });
    addSign(scene, s, x, 135);
  }
  // camino de asfalto que conecta las zonas
  b.patch({ x: -50, z: 62, w: 260, d: 10, material: asphaltMat(260, 10), surface: 'asfalto' });

  // ---- Loma: subida, meseta y bajada ----
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x6f7378, roughness: 0.9 });
  b.wedge({ x: 110, z: 0, length: 40, width: 20, height: 9, material: hillMat });
  b.box({ size: { x: 20, y: 9, z: 20 }, pos: { x: 140, y: 4.5, z: 0 }, material: hillMat, surface: 'asfalto' });
  b.wedge({ x: 170, z: 0, length: 40, width: 20, height: 9, yaw: Math.PI, material: hillMat });

  // ---- "Edificios" para chocar ----
  const r = mulberry(42);
  const palette = [0xe8d5b5, 0xd98e73, 0x9fb7c9, 0xf0e6d2, 0xc4a484, 0xa7c4a0];
  for (let i = 0; i < 22; i++) {
    const w = 8 + r() * 10, d = 8 + r() * 10, h = 6 + r() * 22;
    const x = -185 + (i % 4) * 20 + r() * 4;
    const z = -45 + Math.floor(i / 4) * 18 + r() * 3;
    if (z > 50) break;
    b.box({
      size: { x: w * 0.8, y: h, z: d * 0.8 },
      pos: { x, y: h / 2, z },
      material: new THREE.MeshStandardMaterial({ color: palette[i % palette.length], roughness: 0.85 }),
    });
  }
  b.patch({ x: -150, z: 0, w: 90, d: 110, top: 0.02, material: asphaltMat(90, 110), surface: 'asfalto' });

  // ---- Circuito con curvas de todo tipo ----
  buildCircuit(b, scene);

  // ---- Paredes del borde ----
  const wallMat = concrete;
  const H = SIZE / 2;
  for (const [x, z, w, d] of [[0, -H, SIZE, 2], [0, H, SIZE, 2], [-H, 0, 2, SIZE], [H, 0, 2, SIZE]]) {
    b.box({ size: { x: w, y: 3, z: d }, pos: { x, y: 1.5, z }, material: wallMat, shadow: false });
  }

  return b;
}

// Circuito cerrado: horquilla, chicana, curvas rápidas y lentas.
const CIRCUIT = [
  [-260, -170], [-60, -175], [40, -165], [75, -185], [110, -160], [240, -170], [285, -125],
  [270, -50], [235, 0], [265, 45], [290, 120], [255, 180], [170, 195], [130, 160], [95, 195],
  [-60, 205], [-200, 185], [-265, 130], [-235, 60], [-285, -20], [-295, -110],
];
const ROAD_W = 14;

function buildCircuit(b, scene) {
  const curve = new THREE.CatmullRomCurve3(
    CIRCUIT.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
  );
  const len = curve.getLength();
  const n = Math.ceil(len / 3);
  const pts = curve.getSpacedPoints(n);

  // Malla del asfalto + pianos
  const road = ribbon(pts, ROAD_W / 2, 0.035, len);
  const roadMat = surfaceMaterial('asfalto', 1, 1, 1);
  roadMat.map.repeat.set(ROAD_W / 10, len / 10);
  const roadMesh = new THREE.Mesh(road, roadMat);
  roadMesh.receiveShadow = true;
  scene.add(roadMesh);
  const kerbTex = stripesTexture().clone();
  kerbTex.needsUpdate = true;
  kerbTex.repeat.set(len / 6, 1);
  const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.8 });
  for (const side of [-1, 1]) {
    const k = ribbon(pts, 0.6, 0.045, len, side * (ROAD_W / 2 + 0.3), true);
    const m = new THREE.Mesh(k, kerbMat);
    m.receiveShadow = true;
    scene.add(m);
  }

  // Física: una caja finita por tramo (con un poquito de solapamiento)
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], c = pts[i + 1];
    const dx = c.x - a.x, dz = c.z - a.z;
    const segLen = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dz, dx);
    const desc = b.R.ColliderDesc.cuboid(segLen / 2 + 0.6, 0.1, ROAD_W / 2 + 0.9)
      .setTranslation((a.x + c.x) / 2, 0.035 - 0.1, (a.z + c.z) / 2)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
    const col = b.world.createCollider(desc);
    b.physics.setSurface(col, 'asfalto');
  }
}

/** Cinta a lo largo de una línea de puntos (calles, pianos). */
function ribbon(pts, halfW, y, totalLen, offset = 0, uAlong = false) {
  const pos = [], uv = [], idx = [];
  let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const nxt = pts[Math.min(i + 1, pts.length - 1)];
    const prv = pts[Math.max(i - 1, 0)];
    const tx = nxt.x - prv.x, tz = nxt.z - prv.z;
    const tl = Math.hypot(tx, tz) || 1;
    const nx = -tz / tl, nz = tx / tl; // normal hacia un costado
    if (i > 0) dist += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
    const cx = p.x + nx * offset, cz = p.z + nz * offset;
    pos.push(cx - nx * halfW, y, cz - nz * halfW, cx + nx * halfW, y, cz + nz * halfW);
    const v = dist / totalLen;
    if (uAlong) uv.push(v, 0, v, 1);
    else uv.push(0, v, 1, v);
    if (i < pts.length - 1) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // que las normales apunten para arriba
  const nrm = g.attributes.normal;
  if (nrm.getY(0) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

/** Líneas blancas pintadas en un rectángulo de asfalto. */
function addLines(scene, x, z, w, d) {
  const m = new THREE.MeshBasicMaterial({ color: 0xf4f4f0, transparent: true, opacity: 0.85 });
  const g = new THREE.Group();
  const line = (lx, lz, lw, ld) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(lw, ld), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x + lx, 0.04, z + lz);
    g.add(mesh);
  };
  line(0, -d / 2 + 0.6, w - 1, 0.25);
  line(0, d / 2 - 0.6, w - 1, 0.25);
  line(-w / 2 + 0.6, 0, 0.25, d - 1);
  line(w / 2 - 0.6, 0, 0.25, d - 1);
  if (d < 40) for (let lx = -w / 2 + 5; lx < w / 2 - 5; lx += 12) line(lx, 0, 6, 0.25);
  scene.add(g);
}

/** Cartel con el nombre de la superficie. */
function addSign(scene, surface, x, z) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#1d2b3a'; g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#fff'; g.font = 'bold 44px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const names = { adoquin: 'ADOQUÍN', tierra: 'TIERRA', arena: 'ARENA', nieve: 'NIEVE' };
  g.fillText(names[surface] ?? surface.toUpperCase(), 128, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.25), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  board.position.set(x, 3.6, z - 2);
  board.rotation.y = Math.PI;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6), new THREE.MeshStandardMaterial({ color: 0x555555 }));
  post.position.set(x, 1.3, z - 2);
  scene.add(board, post);
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
