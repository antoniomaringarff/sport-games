// Convierte modelos de autos (obj / fbx / gltf / glb) a un GLB normalizado para el juego.
//
//   node tools/convert-models.mjs            (convierte todos los de tools/cars.sources.json)
//   node tools/convert-models.mjs f1         (solo uno)
//
// Normalizar significa:
//   - escala real en metros (según el largo que pidas)
//   - el frente del auto mira a +X, arriba es +Y, la derecha es +Z (igual que la física)
//   - el origen queda en el piso, centrado
//   - las ruedas se detectan solas (por nombre) y se renombran wheel_FL, wheel_FR, wheel_RL, wheel_RR
// Y escribe public/assets/models/cars/cars.json con la geometría que usa la física.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { transformMesh, prune, dedup } from '@gltf-transform/functions';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const WHEEL_RE = /wheel|tire|tyre|rueda/i;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT_DIR = path.join(ROOT, 'public/assets/models/cars');
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/cars.sources.json'), 'utf8'));
const only = process.argv[2];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

fs.mkdirSync(OUT_DIR, { recursive: true });
const manifestPath = path.join(OUT_DIR, 'cars.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};

for (const src of sources) {
  if (only && src.id !== only) continue;
  const file = path.join(ROOT, src.source);
  console.log(`\n▶ ${src.id}: ${src.source}`);
  const doc = await load(file);
  const result = normalize(doc, src);
  await doc.transform(prune(), dedup());
  const outFile = path.join(OUT_DIR, `${src.id}.glb`);
  await io.write(outFile, doc);
  manifest[src.id] = {
    model: `assets/models/cars/${src.id}.glb`,
    source: src.source,
    author: src.author,
    license: src.license,
    ...result,
  };
  console.log(`  ✓ ${path.relative(ROOT, outFile)} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
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

function normalize(doc, src) {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const roots = scene.listChildren();

  // 1) Rotación: el frente del modelo → +X
  const rotY = { '+x': 0, '-x': Math.PI, '+z': Math.PI / 2, '-z': -Math.PI / 2 }[src.forward];
  if (rotY === undefined) throw new Error(`forward inválido: ${src.forward}`);

  // 2) Escala: el largo (en la dirección del frente) pasa a medir src.length metros
  const b = getBounds(scene);
  const axis = src.forward.endsWith('x') ? 0 : 2;
  const srcLen = b.max[axis] - b.min[axis];
  const s = src.length / srcLen;

  // 3) Centro: x/z al medio, y al piso
  const offset = [(b.min[0] + b.max[0]) / 2, b.min[1], (b.min[2] + b.max[2]) / 2];

  const c = Math.cos(rotY), sn = Math.sin(rotY);
  // matriz columna (glTF): rotación Y * escala
  const M = [c * s, 0, -sn * s, 0, 0, s, 0, 0, sn * s, 0, c * s, 0, 0, 0, 0, 1];
  const apply = (v) => [M[0] * v[0] + M[4] * v[1] + M[8] * v[2], M[1] * v[0] + M[5] * v[1] + M[9] * v[2], M[2] * v[0] + M[6] * v[1] + M[10] * v[2]];

  const done = new Set();
  const visit = (node, isRoot) => {
    const r = node.getRotation();
    if (Math.abs(r[3]) < 0.9999) console.warn(`  ⚠ el nodo "${node.getName()}" tiene rotación propia: revisalo en el juego`);
    const t = node.getTranslation();
    const base = isRoot ? [t[0] - offset[0], t[1] - offset[1], t[2] - offset[2]] : t;
    node.setTranslation(apply(base));
    node.setScale([1, 1, 1].map((v, i) => node.getScale()[i]));
    const mesh = node.getMesh();
    if (mesh && !done.has(mesh)) {
      transformMesh(mesh, M);
      done.add(mesh);
    }
    for (const child of node.listChildren()) visit(child, false);
  };
  for (const n of roots) visit(n, true);

  // 4) Ruedas: detectar, clasificar por posición y renombrar
  const wheelNodes = [];
  scene.traverse((n) => {
    if (n.getMesh() && WHEEL_RE.test(n.getName())) wheelNodes.push(n);
  });
  if (wheelNodes.length !== 4) {
    throw new Error(`Se esperaban 4 ruedas y se encontraron ${wheelNodes.length} (${wheelNodes.map((n) => n.getName())}). Separá las ruedas en Blender.`);
  }
  const wheels = {};
  let radius = 0;
  for (const n of wheelNodes) {
    const wb = getBounds(n);
    const center = [0, 1, 2].map((i) => (wb.min[i] + wb.max[i]) / 2);
    const key = (center[0] > 0 ? 'F' : 'R') + (center[2] < 0 ? 'L' : 'R');
    if (wheels[key]) throw new Error(`Dos ruedas en la misma posición (${key}).`);
    n.setName(`wheel_${key}`);
    wheels[key] = { node: `wheel_${key}`, center: center.map(round) };
    radius = Math.max(radius, (wb.max[1] - wb.min[1]) / 2);
  }

  // 5) Medidas de la carrocería (sin ruedas) para el chasis de la física
  const bodyMin = [Infinity, Infinity, Infinity], bodyMax = [-Infinity, -Infinity, -Infinity];
  scene.traverse((n) => {
    if (!n.getMesh() || WHEEL_RE.test(n.getName())) return;
    const nb = getBounds(n);
    for (let i = 0; i < 3; i++) {
      bodyMin[i] = Math.min(bodyMin[i], nb.min[i]);
      bodyMax[i] = Math.max(bodyMax[i], nb.max[i]);
    }
  });

  return {
    wheels,
    wheelRadius: round(radius),
    body: {
      min: bodyMin.map(round),
      max: bodyMax.map(round),
      size: [0, 1, 2].map((i) => round(bodyMax[i] - bodyMin[i])),
    },
  };
}

function round(v) {
  return Math.round(v * 1000) / 1000;
}
