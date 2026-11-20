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

// ---------------------------------------------------------------------------
// Fachadas: revoque real + ventanas con postigos, balcones y cornisas dibujados encima.
// Un "módulo" de la textura = 2 ventanas de ancho × 2 pisos de alto (6.8 m × 6.4 m).
export const FACADE_TILE = { w: 6.8, h: 6.4 };

let facadeTex = null;
// postigos: verde salvia, celeste gastado, blanco (típicos de la Costa Azul)
const SHUTTER = ['#8fa58a', '#9fb5bd', '#e8e4da'];
function facadeTexture() {
  if (facadeTex) return facadeTex;
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const draw = (plaster) => {
    if (plaster) {
      // revoque claro (el color de cada edificio lo pone el color del vértice)
      for (let y = 0; y < S; y += 256) for (let x = 0; x < S; x += 256) g.drawImage(plaster, x, y, 256, 256);
      g.fillStyle = 'rgba(255,250,240,0.6)';
      g.fillRect(0, 0, S, S);
    } else {
      g.fillStyle = '#efe9df';
      g.fillRect(0, 0, S, S);
    }
    const W = S / 2, H = S / 2; // una ventana por cuarto
    for (let fy = 0; fy < 2; fy++) {
      for (let fx = 0; fx < 2; fx++) {
        const x0 = fx * W, y0 = fy * H;
        const variant = (fx + fy * 2) % 4;
        // cornisa del piso
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.fillRect(x0, y0 + H - 10, W, 6);
        g.fillStyle = 'rgba(60,50,40,0.25)';
        g.fillRect(x0, y0 + H - 4, W, 4);
        // ventana alta (estilo francés)
        const ww = W * 0.3, wh = H * 0.56, wx = x0 + (W - ww) / 2, wy = y0 + H * 0.16;
        // marco / moldura
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.fillRect(wx - 8, wy - 10, ww + 16, wh + 14);
        // vidrio: refleja el cielo arriba, oscuro abajo
        const grd = g.createLinearGradient(0, wy, 0, wy + wh);
        grd.addColorStop(0, '#a9bccb');
        grd.addColorStop(0.5, '#5a6b79');
        grd.addColorStop(1, '#36424d');
        g.fillStyle = grd;
        g.fillRect(wx, wy, ww, wh);
        g.fillStyle = 'rgba(240,240,235,0.9)';
        g.fillRect(wx + ww / 2 - 2, wy, 4, wh); // parante
        g.fillRect(wx, wy + wh * 0.35, ww, 3);
        // postigos (persianas de madera) abiertos a los costados, o uno cerrado
        const shutter = (sx, w) => {
          g.fillStyle = SHUTTER[(fx + fy) % SHUTTER.length];
          g.fillRect(sx, wy - 2, w, wh + 2);
          g.fillStyle = 'rgba(30,40,30,0.25)';
          for (let ly = wy + 4; ly < wy + wh; ly += 7) g.fillRect(sx + 3, ly, w - 6, 2);
        };
        if (variant === 3) shutter(wx, ww);
        else if (variant !== 1) {
          shutter(wx - 8 - ww * 0.48, ww * 0.48);
          shutter(wx + ww + 8, ww * 0.48);
        }
        // balcón con baranda de hierro en algunas
        if (variant === 0 || variant === 2) {
          const by = wy + wh + 2;
          g.fillStyle = 'rgba(235,230,220,0.95)';
          g.fillRect(wx - 26, by, ww + 52, 8);
          g.fillStyle = 'rgba(40,40,40,0.25)';
          g.fillRect(wx - 26, by + 8, ww + 52, 5); // sombra de la losa
          g.strokeStyle = '#2a2c2e';
          g.lineWidth = 2;
          g.strokeRect(wx - 24, by - 26, ww + 48, 26);
          for (let bx = wx - 24; bx < wx + ww + 24; bx += 7) {
            g.beginPath();
            g.moveTo(bx, by - 26);
            g.lineTo(bx, by);
            g.stroke();
          }
        }
        // mancha de suciedad bajo la ventana (lluvia)
        const dirt = g.createLinearGradient(0, wy + wh, 0, wy + wh + 40);
        dirt.addColorStop(0, 'rgba(70,60,50,0.12)');
        dirt.addColorStop(1, 'rgba(70,60,50,0)');
        g.fillStyle = dirt;
        g.fillRect(wx, wy + wh + 10, ww, 40);
      }
    }
  };
  draw(null);
  facadeTex = new THREE.CanvasTexture(c);
  facadeTex.wrapS = facadeTex.wrapT = THREE.RepeatWrapping;
  facadeTex.colorSpace = THREE.SRGBColorSpace;
  facadeTex.anisotropy = 8;
  new THREE.ImageLoader().load(`${DIR}plastered_wall_04_color.webp`, (img) => {
    draw(img);
    facadeTex.needsUpdate = true;
  });
  return facadeTex;
}

export function facadeMaterial() {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: facadeTexture(),
    normalMap: load('plastered_wall_04_normal.webp', false),
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.88,
  });
}

/** Techos: tejas (UV en metros/3, ver buildBuildings). */
export function roofMaterial() {
  // la foto es marrón oscura: llevarla a terracota
  return new THREE.MeshStandardMaterial({
    vertexColors: true, ...pbrMaps('roof_tiles_14'), roughness: 1, color: new THREE.Color(1.9, 1.35, 1.05),
  });
}
