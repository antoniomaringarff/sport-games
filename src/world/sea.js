// Mar Mediterráneo: turquesa y transparente cerca de la costa, azul profundo mar adentro,
// olas que se mueven en dos direcciones, reflejo del cielo y espuma donde rompe en la orilla.
import * as THREE from 'three';

/**
 * shore: { g: {n, cell, x0, z0}, heights } — un relieve para saber dónde está la costa.
 * Sin él, el mar es todo profundo (sin espuma).
 */
export function buildSea(scene, shore = null) {
  const normal = waveNormalTexture();
  const dist = shore ? shoreDistanceTexture(shore.g, shore.heights) : null;
  const time = { value: 0 };

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.06,
    metalness: 0,
    envMapIntensity: 1.1,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.55, 0.55),
  });
  const n = shore?.g.n ?? 1, cell = shore?.g.cell ?? 1;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.seaTime = time;
    sh.uniforms.shoreDist = { value: dist };
    sh.uniforms.shoreBox = { value: new THREE.Vector4(shore?.g.x0 ?? 0, shore?.g.z0 ?? 0, (n - 1) * cell, dist ? 1 : 0) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeaPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeaPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vSeaPos;
        uniform float seaTime;
        uniform sampler2D shoreDist;
        uniform vec4 shoreBox;
        float shoreD() {
          if (shoreBox.w < 0.5) return 1000.0;
          vec2 uv = (vSeaPos.xz - shoreBox.xy) / shoreBox.z;
          if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1000.0;
          return texture2D(shoreDist, uv).r * 255.0; // metros hasta la costa
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `float d = shoreD();
        float camD = length(vSeaPos - cameraPosition);
        vec3 deep = vec3(0.012, 0.075, 0.16);
        vec3 mid = vec3(0.02, 0.16, 0.24);
        vec3 shallow = vec3(0.1, 0.48, 0.5);   // turquesa sobre arena / roca
        vec3 col = mix(shallow, mid, smoothstep(1.5, 14.0, d));
        col = mix(col, deep, smoothstep(14.0, 110.0, d));
        // espuma: una línea pegada a la orilla y olas que llegan
        float nz = texture2D(normalMap, vSeaPos.xz / 23.0 + seaTime * 0.01).r;
        float waves = smoothstep(0.55, 0.95, sin(d * 0.9 - seaTime * 1.7 + nz * 6.0) * 0.5 + 0.5);
        float foam = (1.0 - smoothstep(0.5, 3.5, d)) * (0.65 + 0.35 * nz)
                   + waves * (1.0 - smoothstep(2.0, 11.0, d)) * 0.55;
        foam *= 1.0 - smoothstep(250.0, 700.0, camD); // de lejos no se ve
        diffuseColor.rgb = mix(col, vec3(0.92, 0.95, 0.96), clamp(foam, 0.0, 1.0));
        float seaFoam = clamp(foam, 0.0, 1.0);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = mix(roughness, 0.85, seaFoam);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `// dos capas de olas que van en direcciones distintas
        vec2 p = vSeaPos.xz;
        vec3 n1 = texture2D(normalMap, p / 31.0 + vec2(seaTime * 0.011, seaTime * 0.006)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, p / 9.0 + vec2(-seaTime * 0.017, seaTime * 0.021)).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(normalMap, p / 140.0 + vec2(seaTime * 0.002, -seaTime * 0.003)).xyz * 2.0 - 1.0;
        vec3 mapN = normalize(vec3(n1.xy + n2.xy * 0.6 + n3.xy * 0.8, 1.0));
        // a lo lejos las olitas se ven más chatas (si no, todo brilla y titila)
        mapN.xy *= normalScale * mix(1.0, 0.35, smoothstep(80.0, 900.0, length(vSeaPos - cameraPosition)));
        normal = normalize(tbn * mapN);`,
      );
  };
  mat.customProgramCacheKey = () => 'sea-v2';

  const sea = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), mat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0;
  sea.receiveShadow = true;
  scene.add(sea);
  return {
    update(dt) {
      time.value += dt;
    },
  };
}

/** Mapa de normales de olas (suma de senos con ruido, se repite sin cortes). */
function waveNormalTexture() {
  const size = 256;
  const h = new Float32Array(size * size);
  const waves = [];
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) {
    const a = Math.round((r() - 0.5) * 14) || 1, b = Math.round((r() - 0.5) * 14);
    waves.push([a, b, 1 / Math.hypot(a, b) ** 1.2, r() * 6.28]);
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0;
    for (const [a, b, amp, ph] of waves) v += Math.sin(((a * x + b * y) / size) * Math.PI * 2 + ph) * amp;
    h[y * size + x] = v;
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = h[y * size + ((x + 1) % size)] - h[y * size + ((x - 1 + size) % size)];
    const dy = h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x];
    const k = (y * size + x) * 4;
    data[k] = Math.max(0, Math.min(255, 128 - dx * 40));
    data[k + 1] = Math.max(0, Math.min(255, 128 - dy * 40));
    data[k + 2] = 255;
    data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** Para cada punto del agua: cuántos metros hay hasta la tierra más cercana (máx. 255). */
function shoreDistanceTexture(g, heights) {
  const { n, cell } = g;
  const INF = 1e9;
  const d = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) d[k] = heights[k] >= 0 ? 0 : INF;
  // distancia "chamfer" en dos pasadas (rápido y suficiente)
  const D1 = cell, D2 = cell * Math.SQRT2;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + D1);
    if (j > 0) {
      v = Math.min(v, d[k - n] + D1);
      if (i > 0) v = Math.min(v, d[k - n - 1] + D2);
      if (i < n - 1) v = Math.min(v, d[k - n + 1] + D2);
    }
    d[k] = v;
  }
  for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--) {
    const k = j * n + i;
    let v = d[k];
    if (i < n - 1) v = Math.min(v, d[k + 1] + D1);
    if (j < n - 1) {
      v = Math.min(v, d[k + n] + D1);
      if (i < n - 1) v = Math.min(v, d[k + n + 1] + D2);
      if (i > 0) v = Math.min(v, d[k + n - 1] + D2);
    }
    d[k] = v;
  }
  const data = new Uint8Array(n * n);
  for (let k = 0; k < n * n; k++) data[k] = Math.min(255, Math.round(d[k]));
  const t = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
