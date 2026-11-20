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
 * Dibujo directo a la pantalla (con el antialias del navegador) y una viñeta con CSS encima.
 */
export function createRenderPipeline(renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.pixelRatio));
  // viñeta: una capa fija encima (no un filtro sobre el canvas, que en algunos navegadores
  // obliga a reprocesar la imagen entera en cada cuadro y da tirones)
  const vignette = document.getElementById('vignette');
  if (Q.grade && vignette) vignette.style.opacity = String(GRAPHICS.VIGNETTE);
  else if (vignette) vignette.hidden = true;
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
  let t = 0, frames = 0, goodWindows = 0, sinceChange = 0;
  const apply = (next) => {
    pr = next;
    renderer.setPixelRatio(pr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    pipeline.setSize(window.innerWidth, window.innerHeight);
    sinceChange = 0;
    goodWindows = 0;
  };
  return {
    get pixelRatio() {
      return pr;
    },
    /** Al entrar a un lugar: no medir los primeros segundos (cargar y compilar da tirones). */
    reset() {
      t = -3;
      frames = 0;
      goodWindows = 0;
    },
    update(dt) {
      if (!GRAPHICS.DYNAMIC_RESOLUTION) return;
      if (dt > 0.1) return; // un tirón suelto (carga, cambio de pestaña) no cuenta como "va lento"
      t += dt;
      if (t < 0) return;
      sinceChange += dt;
      frames++;
      if (t < 3) return; // mirar ventanas de 3 segundos, no cuadros sueltos
      const fps = frames / t;
      t = 0;
      frames = 0;
      if (fps < 45 && pr > min && sinceChange > 3) apply(Math.max(min, pr - 0.25));
      else if (fps > 57) {
        goodWindows++;
        // subir solo si anduvo bien un buen rato (evita subir y bajar todo el tiempo)
        if (goodWindows >= 3 && pr < max && sinceChange > 10) apply(Math.min(max, pr + 0.25));
      } else goodWindows = 0;
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
