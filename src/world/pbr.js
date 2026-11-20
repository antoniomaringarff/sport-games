// Texturas fotográficas (Poly Haven, CC0): color + relieve (normal) + rugosidad.
// Las genera tools/convert-textures.mjs en public/assets/textures/.
// Se cargan en segundo plano: el mundo aparece enseguida y las texturas se "encienden" al llegar.
import * as THREE from 'three';

const DIR = `${import.meta.env.BASE_URL}assets/textures/`;
const loader = new THREE.TextureLoader();
const cache = new Map();

function load(file, srgb) {
  if (cache.has(file)) return cache.get(file);
  const t = loader.load(DIR + file);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(file, t);
  return t;
}

/** { map, normalMap, roughnessMap } de un juego de texturas, repetidas rx × ry veces. */
export function pbrMaps(name, rx = 1, ry = rx) {
  const maps = {
    map: load(`${name}_color.webp`, true),
    normalMap: load(`${name}_normal.webp`, false),
    roughnessMap: load(`${name}_rough.webp`, false),
  };
  if (rx === 1 && ry === 1) return maps;
  for (const k of Object.keys(maps)) {
    maps[k] = maps[k].clone();
    maps[k].repeat.set(rx, ry);
  }
  return maps;
}

/** Asfalto real para cintas de pista (u = metros/uScale a lo largo, v = 0..1 de lado a lado). */
export function asphaltMaterial(uScale, width, tile = 4) {
  return new THREE.MeshStandardMaterial({
    ...pbrMaps('asphalt_02', uScale / tile, width / tile),
    color: new THREE.Color(1.25, 1.25, 1.27), // la foto es oscura: un poco más clara (asfalto gastado al sol)
    normalScale: new THREE.Vector2(0.8, 0.8),
  });
}

// ---------------------------------------------------------------------------
// Terreno: pasto, roca, arena y nieve mezclados según la pendiente y la altura
// (el atributo "splat" de cada vértice lo calcula gridGeometry).

/**
 * scale: metros que cubre una repetición del pasto.
 * La UV del terreno viene en metros/12 (ver gridGeometry).
 */
export function terrainMaterial(scale = 9) {
  const k = 12 / scale;
  const grass = pbrMaps('aerial_grass_rock', k);
  const rock = pbrMaps('rock_face_03');
  const paved = load('asphalt_02_color.webp', true);
  const mat = new THREE.MeshStandardMaterial({
    map: grass.map,
    normalMap: grass.normalMap,
    roughness: 0.95,
    normalScale: new THREE.Vector2(0.9, 0.9),
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.rockMap = { value: rock.map };
    sh.uniforms.rockNormal = { value: rock.normalMap };
    sh.uniforms.pavedMap = { value: paved };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;\nvarying float vTerrH;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat;\nvTerrH = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D rockMap, rockNormal, pavedMap;
        varying vec4 vSplat;
        varying float vTerrH;
        // la misma textura a dos escalas: casi no se nota que se repite
        vec4 twoScale(sampler2D t, vec2 uv) {
          vec2 r = mat2(0.8, -0.6, 0.6, 0.8) * uv; // rotada: los patrones no se alinean
          return texture2D(t, uv) * 0.4 + texture2D(t, r * 0.23 + vec2(0.37, 0.71)) * 0.35
               + texture2D(t, r.yx * 0.057 + vec2(0.13, 0.29)) * 0.25;
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `vec3 cGrass = twoScale(map, vMapUv).rgb;
        vec3 cRock = twoScale(rockMap, vMapUv * 0.45).rgb;
        // variación grande (manchas más secas / más verdes)
        float big = texture2D(map, vMapUv * 0.031).g;
        cGrass *= vec3(0.78, 1.0, 0.95) * mix(vec3(1.1, 1.04, 0.9), vec3(0.85, 1.0, 0.92), smoothstep(0.25, 0.45, big));
        vec3 c = mix(cGrass, cRock * vec3(1.05, 1.0, 0.95), vSplat.x);
        float lum = dot(cRock, vec3(0.33));
        c = mix(c, vec3(0.86, 0.78, 0.6) * (0.75 + lum * 0.6), vSplat.y);   // arena de la costa
        // arena mojada: más oscura justo donde llega el agua
        c *= 1.0 - 0.4 * vSplat.y * (1.0 - smoothstep(0.0, 0.8, vTerrH));
        c = mix(c, vec3(0.93, 0.95, 0.98) * (0.85 + lum * 0.3), vSplat.z);  // nieve
        // vereda / plaza: hormigón claro (la textura del asfalto, aclarada), baldosas de 4 m
        vec3 cPaved = texture2D(pavedMap, vMapUv * 2.2).rgb * vec3(2.0, 1.95, 1.85);
        c = mix(c, cPaved, vSplat.w);
        diffuseColor.rgb *= c;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `vec3 nG = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
        vec3 nR = texture2D(rockNormal, vNormalMapUv * 0.45).xyz * 2.0 - 1.0;
        vec3 mapN = normalize(mix(nG, nR, vSplat.x) * vec3(1.0, 1.0, 1.0 + vSplat.y + vSplat.z * 2.0 + vSplat.w * 6.0));
        mapN.xy *= normalScale;
        normal = normalize(tbn * mapN);`,
      );
  };
  mat.customProgramCacheKey = () => 'terrain-splat';
  return mat;
}

/** Pesos de mezcla del terreno: [roca, arena, nieve, vereda] según altura (m) y pendiente. */
export function splatOf(y, slope) {
  const ss = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const sand = 1 - ss(0.6, 2.2, y);
  const rock = ss(0.5, 0.95, slope) * (1 - sand);
  const snow = ss(790, 860, y);
  return [rock, sand, snow, 0];
}
