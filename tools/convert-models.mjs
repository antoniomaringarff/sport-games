// Convierte modelos de autos (obj / fbx / gltf / glb) a un GLB normalizado para el juego.
//
//   node tools/convert-models.mjs            (convierte todos los de tools/cars.sources.json)
//   node tools/convert-models.mjs f1         (solo uno)
//
// Pasos:
//   1. aplanar: toda la geometría en un solo sistema de coordenadas (sin transformaciones anidadas)
//   2. orientar y escalar: frente del auto a +X, arriba +Y, derecha +Z, largo real en metros,
//      origen en el piso y centrado
//   3. simplificar (opcional, "simplify": 0.2 = quedarse con ~20% de los triángulos)
//   4. ruedas: se detectan por FORMA, no por nombre: piezas redondas que tocan el piso en cada
//      esquina (las cubiertas) + todo lo que está adentro (llanta, maza, disco). Se separan como
//      wheel_FL, wheel_FR, wheel_RL, wheel_RR, aunque en el original estén pegadas a la carrocería
//   5. texturas a 1024 px como máximo, en WebP; vidrios sin "transmisión" (cara de dibujar)
// Y escribe public/assets/models/cars/cars.json con la geometría que usa la física.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { transformMesh, prune, dedup, weld, simplify, textureCompress, quantize, join, normals } from '@gltf-transform/functions';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT_DIR = path.join(ROOT, 'public/assets/models/cars');
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/cars.sources.json'), 'utf8'));
const only = process.argv[2];
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const KEYS = ['FL', 'FR', 'RL', 'RR'];

fs.mkdirSync(OUT_DIR, { recursive: true });
const manifestPath = path.join(OUT_DIR, 'cars.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

for (const src of sources) {
  if (only && src.id !== only) continue;
  const file = path.join(ROOT, src.source);
  console.log(`\n▶ ${src.id}: ${src.source}`);
  const doc = await load(file);

  bakeAll(doc);
  orient(doc, src);
  if (src.simplify && src.simplify < 1) {
    const before = countTris(doc);
    // Con normales por cara cada triángulo queda suelto y no se puede simplificar: en las piezas sin
    // textura se sacan normales y UV, se simplifica y las normales se vuelven a calcular.
    if (src.rebuildNormals) stripUntexturedAttributes(doc);
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: src.simplify, error: src.simplifyError ?? 0.004 }));
    if (src.rebuildNormals) await doc.transform(normals({ overwrite: false }));
    console.log(`  simplificado: ${before} → ${countTris(doc)} triángulos`);
  }
  const wheels = extractWheels(doc, src);
  fixMaterials(doc);
  mergeBody(doc);
  await doc.transform(
    prune(),
    dedup(),
    join({ keepNamed: true }), // une piezas del mismo material dentro de cada malla, sin mezclar ruedas con carrocería
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [src.textureSize ?? 1024, src.textureSize ?? 1024] }),
  );
  const result = measure(doc, wheels);
  // 6) geometría cuantizada (KHR_mesh_quantization): menos bytes por vértice, three.js la lee directo
  await doc.transform(quantize());

  const outFile = path.join(OUT_DIR, `${src.id}.glb`);
  await io.write(outFile, doc);
  manifest[src.id] = {
    model: `assets/models/cars/${src.id}.glb`,
    source: src.source,
    author: src.author,
    license: src.license,
    url: src.url,
    ...result,
  };
  console.log(`  ✓ ${path.relative(ROOT, outFile)} (${(fs.statSync(outFile).size / 1024 / 1024).toFixed(1)} MB, ${countTris(doc)} triángulos)`);
  console.log(`  largo ${result.body.size[0].toFixed(2)} m · ancho ${result.body.size[2].toFixed(2)} m · alto ${result.body.size[1].toFixed(2)} m · rueda r=${result.wheelRadius.toFixed(2)} m`);
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n✓ ${path.relative(ROOT, manifestPath)}`);

// ---------------------------------------------------------------

async function load(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.glb' || ext === '.gltf') return io.read(file);
  if (ext === '.obj') {
    const { default: obj2gltf } = await import('obj2gltf');
    const glb = await obj2gltf(file, { binary: true });
    return io.readBinary(new Uint8Array(glb));
  }
  if (ext === '.fbx') {
    // Necesita FBX2glTF instalado (https://github.com/godotengine/FBX2glTF/releases) en el PATH
    const tmp = path.join(ROOT, 'assets-raw/.tmp', path.basename(file, ext));
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    try {
      execFileSync('FBX2glTF', ['--binary', '--input', file, '--output', tmp], { stdio: 'inherit' });
    } catch {
      throw new Error('No se encontró FBX2glTF. Instalalo o exportá el modelo a .glb desde Blender.');
    }
    return io.read(`${tmp}.glb`);
  }
  throw new Error(`Formato no soportado: ${ext}`);
}

/** 1) Aplanar: cada malla queda con su transformación "horneada" y los nodos sin moverse. */
function bakeAll(doc) {
  const root = doc.getRoot();
  // una malla usada por varios nodos se duplica, para poder hornear cada copia
  const used = new Map();
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    if (used.has(mesh)) node.setMesh(mesh.clone());
    else used.set(mesh, node);
  }
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (mesh) transformMesh(mesh, node.getWorldMatrix());
  }
  for (const node of root.listNodes()) {
    node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }
  // todos los nodos con malla directo en la escena
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  for (const node of root.listNodes()) {
    if (!node.getMesh()) continue;
    const parent = node.getParentNode();
    if (parent) parent.removeChild(node);
    if (!scene.listChildren().includes(node)) scene.addChild(node);
  }
  for (const node of root.listNodes()) if (!node.getMesh() && node.listChildren().length === 0) node.dispose();
}

/** 2) Frente a +X, escala real, origen en el piso y centrado. */
function orient(doc, src) {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const rotY = { '+x': 0, '-x': Math.PI, '+z': Math.PI / 2, '-z': -Math.PI / 2 }[src.forward];
  if (rotY === undefined) throw new Error(`forward inválido: ${src.forward}`);
  // algunos modelos vienen con Z para arriba
  const zUp = src.up === '+z';
  const b0 = getBounds(scene);
  const axis = src.forward.endsWith('x') ? 0 : 2;
  const s = src.length / (b0.max[axis] - b0.min[axis]);
  const c = Math.cos(rotY), sn = Math.sin(rotY);
  // matriz (columnas) = escala * rotación Y [* (Z arriba → Y arriba)]
  let M = [c * s, 0, -sn * s, 0, 0, s, 0, 0, sn * s, 0, c * s, 0, 0, 0, 0, 1];
  if (zUp) M = mul(M, [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
  for (const mesh of doc.getRoot().listMeshes()) transformMesh(mesh, M);
  const b = getBounds(scene);
  const T = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2, 1];
  for (const mesh of doc.getRoot().listMeshes()) transformMesh(mesh, T);
}

function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
  return o;
}

function stripUntexturedAttributes(doc) {
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const m = prim.getMaterial();
      if (m && (m.getBaseColorTexture() || m.getNormalTexture() || m.getMetallicRoughnessTexture())) continue;
      for (const sem of prim.listSemantics()) if (sem === 'NORMAL' || sem.startsWith('TEXCOORD_')) prim.setAttribute(sem, null);
    }
}

function countTris(doc) {
  let t = 0;
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives()) {
      const i = p.getIndices();
      t += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3;
    }
  return Math.round(t);
}

/**
 * 4) Ruedas por forma. Devuelve { FL: {center, radius, node}, ... }.
 *    Trabaja triángulo por triángulo, separando cada malla en piezas conectadas.
 */
function extractWheels(doc, src) {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const B = getBounds(scene);
  const L = B.max[0] - B.min[0], H = B.max[1] - B.min[1], W = B.max[2] - B.min[2];

  // --- piezas conectadas de cada primitiva ---
  const pieces = []; // { prim, tris: [triIndex], min, max }
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      ensureIndices(doc, prim);
      const pos = prim.getAttribute('POSITION');
      const idx = prim.getIndices().getArray();
      const n = pos.getCount();
      // unir vértices que comparten posición (las costuras de UV duplican vértices)
      const parent = new Int32Array(n).map((_, i) => i);
      const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
      const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
      const byPos = new Map(), v = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        pos.getElement(i, v);
        const k = `${Math.round(v[0] * 2000)},${Math.round(v[1] * 2000)},${Math.round(v[2] * 2000)}`;
        const j = byPos.get(k);
        if (j === undefined) byPos.set(k, i); else unite(i, j);
      }
      for (let t = 0; t < idx.length; t += 3) { unite(idx[t], idx[t + 1]); unite(idx[t], idx[t + 2]); }
      const groups = new Map();
      for (let t = 0; t < idx.length / 3; t++) {
        const r = find(idx[t * 3]);
        let g = groups.get(r);
        if (!g) groups.set(r, (g = { prim, tris: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }));
        g.tris.push(t);
        for (let k = 0; k < 3; k++) {
          pos.getElement(idx[t * 3 + k], v);
          for (let a = 0; a < 3; a++) { g.min[a] = Math.min(g.min[a], v[a]); g.max[a] = Math.max(g.max[a], v[a]); }
        }
      }
      pieces.push(...groups.values());
    }
  }

  // --- cubiertas: piezas redondas (de costado), que tocan el piso, en cada esquina ---
  const quad = (p) => {
    const cx = (p.min[0] + p.max[0]) / 2, cz = (p.min[2] + p.max[2]) / 2;
    return (cx > 0 ? 'F' : 'R') + (cz < 0 ? 'L' : 'R');
  };
  const tires = {};
  for (const p of pieces) {
    const sx = p.max[0] - p.min[0], sy = p.max[1] - p.min[1], sz = p.max[2] - p.min[2];
    const cx = (p.min[0] + p.max[0]) / 2, cz = (p.min[2] + p.max[2]) / 2;
    const touches = p.min[1] < H * 0.06;
    const round = sy > H * 0.18 && sx / sy > 0.75 && sx / sy < 1.3 && sz < sy * 0.9;
    const corner = Math.abs(cx) > L * 0.15 && Math.abs(cz) > W * 0.18;
    if (!touches || !round || !corner) continue;
    const q = quad(p);
    if (!tires[q] || sy > tires[q].max[1] - tires[q].min[1]) tires[q] = p;
  }
  if (process.env.DEBUG_WHEELS) {
    console.log('  caja', B.min.map((x) => x.toFixed(2)), B.max.map((x) => x.toFixed(2)));
    const low = pieces.filter((p) => p.min[1] < H * 0.1).sort((a, b) => (b.max[1] - b.min[1]) - (a.max[1] - a.min[1])).slice(0, 14);
    for (const p of low) console.log('   pieza', p.tris.length, 'tri  c', [0, 1, 2].map((a) => ((p.min[a] + p.max[a]) / 2).toFixed(2)).join(','), ' tam', [0, 1, 2].map((a) => (p.max[a] - p.min[a]).toFixed(2)).join(','));
  }
  const missing = KEYS.filter((k) => !tires[k]);
  if (missing.length) throw new Error(`No encontré las ruedas ${missing.join(', ')}: revisá "forward" o separalas en Blender.`);

  // --- cada rueda: la cubierta + todo lo que está adentro de ella ---
  const result = {};
  for (const key of KEYS) {
    const t = tires[key];
    const pad = (t.max[1] - t.min[1]) * 0.06;
    const lo = t.min.map((v) => v - pad), hi = t.max.map((v) => v + pad);
    const inside = pieces.filter((p) => p.min.every((v, a) => v >= lo[a]) && p.max.every((v, a) => v <= hi[a]));
    const mesh = doc.createMesh(`wheel_${key}`);
    const byPrim = new Map();
    for (const p of inside) {
      if (!byPrim.has(p.prim)) byPrim.set(p.prim, []);
      byPrim.get(p.prim).push(...p.tris);
      p.taken = true;
    }
    for (const [prim, tris] of byPrim) mesh.addPrimitive(copyTriangles(doc, prim, tris));
    const node = doc.createNode(`wheel_${key}`).setMesh(mesh);
    scene.addChild(node);
    const center = [0, 1, 2].map((a) => (t.min[a] + t.max[a]) / 2);
    result[key] = { node: `wheel_${key}`, center: center.map(round3), radius: (t.max[1] - t.min[1]) / 2 };
  }
  // sacar de la carrocería los triángulos que pasaron a las ruedas
  const removed = new Map();
  for (const p of pieces) if (p.taken) {
    if (!removed.has(p.prim)) removed.set(p.prim, new Set());
    for (const t of p.tris) removed.get(p.prim).add(t);
  }
  for (const [prim, set] of removed) {
    const idx = prim.getIndices().getArray();
    const keep = [];
    for (let t = 0; t < idx.length / 3; t++) if (!set.has(t)) keep.push(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]);
    prim.getIndices().setArray(new Uint32Array(keep));
  }
  console.log(`  ruedas: ${KEYS.map((k) => `${k} r=${result[k].radius.toFixed(2)}`).join(' · ')}`);
  return result;
}

function buffer(doc) {
  return doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
}

function ensureIndices(doc, prim) {
  if (prim.getIndices()) return;
  const n = prim.getAttribute('POSITION').getCount();
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from({ length: n }, (_, i) => i)).setBuffer(buffer(doc)));
}

/** Copia algunos triángulos de una primitiva a una primitiva nueva (mismo material). */
function copyTriangles(doc, prim, tris) {
  const idx = prim.getIndices().getArray();
  const remap = new Map();
  const newIdx = [];
  for (const t of tris) for (let k = 0; k < 3; k++) {
    const old = idx[t * 3 + k];
    if (!remap.has(old)) remap.set(old, remap.size);
    newIdx.push(remap.get(old));
  }
  const out = doc.createPrimitive().setMaterial(prim.getMaterial()).setMode(prim.getMode());
  for (const sem of prim.listSemantics()) {
    const a = prim.getAttribute(sem);
    const size = a.getElementSize();
    const arr = new (a.getArray().constructor)(remap.size * size);
    const el = [];
    for (const [o, nw] of remap) {
      a.getElement(o, el);
      for (let c = 0; c < size; c++) arr[nw * size + c] = el[c];
    }
    out.setAttribute(sem, doc.createAccessor().setType(a.getType()).setArray(arr).setNormalized(a.getNormalized()).setBuffer(buffer(doc)));
  }
  out.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(newIdx)).setBuffer(buffer(doc)));
  return out;
}

/** 5) Vidrios: sin transmisión (que obliga a dibujar la escena dos veces), transparentes comunes. */
function fixMaterials(doc) {
  for (const m of doc.getRoot().listMaterials()) {
    const tr = m.getExtension('KHR_materials_transmission');
    if (tr) {
      m.setExtension('KHR_materials_transmission', null);
      m.setAlphaMode('BLEND');
      const f = m.getBaseColorFactor();
      m.setBaseColorFactor([f[0], f[1], f[2], Math.min(f[3], 0.35)]);
    }
    for (const ext of ['KHR_materials_volume', 'KHR_materials_sheen']) if (m.getExtension(ext)) m.setExtension(ext, null);
  }
}

/**
 * Junta toda la carrocería en un solo nodo/malla (las transformaciones ya están horneadas),
 * así join() puede unir las piezas que comparten material: muchos menos dibujos por cuadro.
 */
function mergeBody(doc) {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const body = doc.createMesh('body');
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || /^wheel_/.test(node.getName())) continue;
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      if (idx && idx.getCount() === 0) continue;
      body.addPrimitive(prim);
    }
    node.dispose();
  }
  scene.addChild(doc.createNode('body').setMesh(body));
}

/** Medidas para la física: carrocería (sin ruedas) y ruedas. */
function measure(doc, wheels) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const v = [0, 0, 0];
  for (const mesh of doc.getRoot().listMeshes()) {
    if (/^wheel_/.test(mesh.getName())) continue;
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION');
      const idx = p.getIndices()?.getArray();
      if (idx && idx.length === 0) continue;
      const list = idx ?? Array.from({ length: pos.getCount() }, (_, i) => i);
      for (const i of list) {
        pos.getElement(i, v);
        for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], v[a]); max[a] = Math.max(max[a], v[a]); }
      }
    }
  }
  const radius = Math.max(...KEYS.map((k) => wheels[k].radius));
  return {
    wheels: Object.fromEntries(KEYS.map((k) => [k, { node: wheels[k].node, center: wheels[k].center }])),
    wheelRadius: round3(radius),
    body: { min: min.map(round3), max: max.map(round3), size: [0, 1, 2].map((a) => round3(max[a] - min[a])) },
  };
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}
