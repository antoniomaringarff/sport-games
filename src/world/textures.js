// Texturas procedurales (dibujadas con canvas): livianas y sin archivos.
// Más adelante se reemplazan por texturas de Higgsfield.
import * as THREE from 'three';

const cache = new Map();

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTexture(key, size, draw, repeat = 1) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size, rng(key.length * 7919));
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.repeat.set(repeat, repeat);
  cache.set(key, tex);
  return tex;
}

function noise(g, size, r, base, spread, count, maxR = 2) {
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    const v = (r() - 0.5) * spread;
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v)})`;
    const rr = r() * maxR + 0.5;
    g.fillRect(r() * size, r() * size, rr, rr);
  }
}

export const SURFACE_TEXTURES = {
  asfalto: () => canvasTexture('asfalto', 256, (g, s, r) => noise(g, s, r, '#7a7c80', 0.16, 9000, 2)),
  adoquin: () =>
    canvasTexture('adoquin', 256, (g, s, r) => {
      g.fillStyle = '#5b5148';
      g.fillRect(0, 0, s, s);
      const n = 8, w = s / n;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const off = (y % 2) * w * 0.5;
          const l = 52 + r() * 22;
          g.fillStyle = `hsl(${25 + r() * 15}, ${12 + r() * 10}%, ${l}%)`;
          g.beginPath();
          g.roundRect(x * w + off + 2, y * w + 2, w - 4, w - 4, 6);
          g.fill();
          g.beginPath();
          g.roundRect(x * w + off + 2 - s, y * w + 2, w - 4, w - 4, 6);
          g.fill();
        }
      }
    }),
  tierra: () => canvasTexture('tierra', 256, (g, s, r) => noise(g, s, r, '#8a6a46', 0.3, 7000, 3)),
  arena: () => canvasTexture('arena', 256, (g, s, r) => noise(g, s, r, '#e2cf9c', 0.12, 9000, 2)),
  nieve: () => canvasTexture('nieve', 256, (g, s, r) => noise(g, s, r, '#eef3f8', 0.07, 5000, 3)),
  pasto: () => canvasTexture('pasto', 256, (g, s, r) => noise(g, s, r, '#5c8a3e', 0.25, 12000, 2)),
};

/** Material para una superficie, con la textura repetida cada `tile` metros. */
export function surfaceMaterial(surface, width, depth, tile = 8) {
  const base = SURFACE_TEXTURES[surface]?.() ?? SURFACE_TEXTURES.asfalto();
  const tex = base.clone();
  tex.needsUpdate = true;
  tex.repeat.set(width / tile, depth / tile);
  return new THREE.MeshStandardMaterial({ map: tex, roughness: surface === 'nieve' ? 0.6 : 0.95 });
}

/** Textura de franjas rojas y blancas (pianos / vallas). */
export function stripesTexture() {
  return canvasTexture('stripes', 64, (g, s) => {
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#f2f2f2' : '#d22b2b';
      g.fillRect((i * s) / 4, 0, s / 4, s);
    }
  });
}
