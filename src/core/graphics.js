// Calidad gráfica, posproceso (antialias, brillo, color) y preparación de materiales
// para las sombras en cascada (CSM).
import * as THREE from 'three';
import { GRAPHICS } from '../config.js';

const KEY = 'sport-games:calidad';
const ORDER = ['alta', 'media', 'baja'];

export const PRESETS = {
  alta: { pixelRatio: 1.5, grade: true, csm: { cascades: 3, size: 2048, maxFar: 900 }, clouds: true, particles: 1 },
  media: { pixelRatio: 1.25, grade: true, csm: { cascades: 2, size: 1024, maxFar: 500 }, clouds: true, particles: 0.6 },
  baja: { pixelRatio: 1, grade: false, csm: null, clouds: false, particles: 0.3 },
};

function loadQuality() {
  try {
    const q = localStorage.getItem(KEY);
    if (PRESETS[q]) return q;
  } catch {}
  return PRESETS[GRAPHICS.QUALITY] ? GRAPHICS.QUALITY : 'alta';
}

export const QUALITY = loadQuality();
export const Q = PRESETS[QUALITY];

/** Pasa a la siguiente calidad (alta → media → baja) y recarga la página. */
export function cycleQuality() {
  const next = ORDER[(ORDER.indexOf(QUALITY) + 1) % ORDER.length];
  try {
    localStorage.setItem(KEY, next);
  } catch {}
  location.reload();
}

/**
 * Dibujo directo a la pantalla (con el antialias del navegador). La corrección de color y la
 * viñeta se hacen con CSS encima del canvas: el navegador lo compone casi gratis, mucho más
 * barato que un posproceso de pantalla completa.
 */
export function createRenderPipeline(renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.pixelRatio));
  const canvas = renderer.domElement;
  const vignette = document.getElementById('vignette');
  if (Q.grade) {
    canvas.style.filter = `saturate(${GRAPHICS.SATURATION}) contrast(${GRAPHICS.CONTRAST})`;
    if (vignette) vignette.style.opacity = String(GRAPHICS.VIGNETTE);
  } else if (vignette) vignette.hidden = true;
  return {
    render: (scene, camera) => renderer.render(scene, camera),
    setSize() {},
  };
}

/**
 * Resolución dinámica: si el juego va lento baja un poco la resolución, si sobra la sube.
 * Así se mantiene fluido en compus menos potentes sin tener que recargar.
 */
export function createDynamicResolution(renderer, pipeline) {
  const max = Math.min(window.devicePixelRatio, Q.pixelRatio);
  const min = Math.min(max, 0.75);
  let pr = renderer.getPixelRatio();
  let t = 0, frames = 0;
  return {
    get pixelRatio() {
      return pr;
    },
    update(dt) {
      if (!GRAPHICS.DYNAMIC_RESOLUTION) return;
      t += dt;
      frames++;
      if (t < 1.5) return;
      const fps = frames / t;
      t = 0;
      frames = 0;
      let next = pr;
      if (fps < 50 && pr > min) next = Math.max(min, pr - 0.15);
      else if (fps > 58 && pr < max) next = Math.min(max, pr + 0.1);
      if (next !== pr) {
        pr = next;
        renderer.setPixelRatio(pr);
        renderer.setSize(window.innerWidth, window.innerHeight);
        pipeline.setSize(window.innerWidth, window.innerHeight);
      }
    },
  };
}

/**
 * Las sombras en cascada necesitan "preparar" cada material que recibe luz.
 * Se llama al armar el mundo y cada tanto (autos nuevos, fantasma, bots...).
 */
const prepared = new WeakSet();
export function prepareMaterials(scene, csm) {
  if (!csm) return;
  scene.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (prepared.has(m) || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) continue;
      csm.setupMaterial(m);
      m.needsUpdate = true;
      prepared.add(m);
    }
  });
}
