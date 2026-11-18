// Carga los modelos de autos (GLB) y arma el perfil de física de cada uno.
// La geometría (ruedas, tamaño) sale del modelo; el "cómo se maneja" sale de config.js.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CARS } from '../../config.js';
import { profileFromModel } from './vehicleProfile.js';

const BASE = import.meta.env.BASE_URL;
const loaded = new Map(); // id -> { scene, info }

/** Carga cars.json y todos los GLB. Si algo falla, se usan los autos de cajitas. */
export async function loadCarAssets(onProgress = () => {}) {
  let manifest;
  try {
    const res = await fetch(`${BASE}assets/models/cars/cars.json`);
    manifest = await res.json();
  } catch (e) {
    console.warn('No se pudo cargar cars.json, se usan autos de cajitas', e);
    return;
  }
  const loader = new GLTFLoader();
  const ids = Object.keys(CARS).filter((id) => manifest[id]);
  let done = 0;
  await Promise.all(
    ids.map(async (id) => {
      try {
        const gltf = await loader.loadAsync(`${BASE}${manifest[id].model}`);
        loaded.set(id, { scene: gltf.scene, info: manifest[id] });
      } catch (e) {
        console.warn(`No se pudo cargar el modelo de ${id}`, e);
      }
      onProgress(++done / ids.length);
    }),
  );
}

export function carAsset(id) {
  return loaded.get(id) ?? null;
}

/** Perfil para la física: los números de config.js + la geometría del modelo. */
export function physicsProfile(id) {
  return profileFromModel(CARS[id], loaded.get(id)?.info);
}
