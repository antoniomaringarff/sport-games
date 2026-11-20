// Cielo, sol, luz del cielo (reflejos), sombras en cascada, nubes y niebla.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { CSM } from 'three/addons/csm/CSM.js';
import { GRAPHICS } from '../config.js';
import { Q } from '../core/graphics.js';

/**
 * opts: { elevation, azimuth (grados), fog: [color, cerca, lejos], sunColor, sunIntensity, exposure, skyLight }
 * camera: la cámara del juego (para las sombras en cascada)
 */
export function createSky(scene, renderer, opts = {}, camera = null) {
  const sky = makeSkyMesh(18000);
  scene.add(sky);

  const { elevation = 32, azimuth = 210 } = opts;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - elevation),
    THREE.MathUtils.degToRad(azimuth),
  );
  sky.material.uniforms.sunPosition.value.copy(sunDir);

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure ?? 0.75;

  // --- Luz del cielo: un cielo degradé (sin el disco del sol, que es enorme) como mapa de ambiente ---
  // Da reflejos en autos, vidrios y mar, y una luz ambiente mucho más natural.
  const envScene = new THREE.Scene();
  envScene.add(gradientSphere(sunDir));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(envScene, 0.02, 0.1, 100);
  scene.environment = envRT.texture;
  scene.environmentIntensity = GRAPHICS.ENV_LIGHT;
  pmrem.dispose();

  // relleno suave: lo justo para que las sombras no queden negras (más relleno = todo lavado)
  const hemi = new THREE.HemisphereLight(0xb9cde6, 0x5e5848, (opts.skyLight ?? 1.1) * 0.3);
  scene.add(hemi);

  // --- Sol: sombras en cascada (cerca nítidas, lejos también hay) o un sol simple ---
  const sunColor = new THREE.Color(opts.sunColor ?? 0xfff0dc);
  const sunIntensity = opts.sunIntensity ?? 2.6;
  let csm = null, sun = null;
  if (Q.csm && camera) {
    csm = new CSM({
      camera,
      parent: scene,
      cascades: Q.csm.cascades,
      maxFar: Q.csm.maxFar,
      shadowMapSize: Q.csm.size,
      lightDirection: sunDir.clone().negate(),
      lightIntensity: sunIntensity,
      lightMargin: 400,
      lightFar: 5000,
      // ojo: el bias se mide sobre todo el rango de la luz (lightFar = 5 km): -0.0002 eran ~1 m
      // y la sombra quedaba despegada del auto (parecía que flotaba). -0.00002 ≈ 10 cm.
      shadowBias: -0.00002,
    });
    csm.fade = true;
    for (const l of csm.lights) {
      l.color.copy(sunColor);
      l.shadow.normalBias = 0.03;
    }
  } else {
    sun = new THREE.DirectionalLight(sunColor, sunIntensity);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const S = 45;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 300 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
  }

  const [fogColor, fogNear, fogFar] = opts.fog ?? [0xbfd4e6, 180, 900];
  scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);

  const clouds = Q.clouds && GRAPHICS.CLOUDS > 0 ? makeClouds(scene, sunColor) : null;

  return {
    exposure: opts.exposure ?? 0.75,
    csm,
    /** Cada cuadro: las sombras siguen a la cámara (o el sol al auto) y las nubes se mueven. */
    follow(pos, dt = 0) {
      if (csm) csm.update();
      else {
        sun.target.position.copy(pos);
        sun.position.copy(pos).addScaledVector(sunDir, 150);
      }
      clouds?.update(dt, camera?.position ?? pos);
    },
    resize() {
      csm?.updateFrustums();
    },
  };
}

/** Cielo degradé para la luz ambiente: celeste arriba, claro en el horizonte, tierra abajo,
 *  y un poco más cálido del lado del sol. */
function gradientSphere(sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      top: { value: new THREE.Color(0x3f74b4) },
      horizon: { value: new THREE.Color(0xb9c8d6) },
      bottom: { value: new THREE.Color(0x4f4b42) },
      sun: { value: sunDir.clone() },
      warm: { value: new THREE.Color(0xffe2b8) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top, horizon, bottom, sun, warm; varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.6)) : mix(horizon, bottom, pow(-h, 0.4));
        float s = max(dot(normalize(vDir), normalize(sun)), 0.0);
        c = mix(c, warm, pow(s, 6.0) * 0.6);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat);
}

function makeSkyMesh(scale) {
  const sky = new Sky();
  sky.scale.setScalar(scale);
  const u = sky.material.uniforms;
  u.turbidity.value = 2.2;  // aire limpio: poca bruma blanca
  u.rayleigh.value = 2.6;   // cielo bien azul (día despejado en el Mediterráneo)
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.85;
  return sky;
}

/** Capa de nubes: una textura de ruido suave muy alta, que acompaña a la cámara y se desplaza. */
function makeClouds(scene, sunColor) {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  // ruido de valores con varias octavas, que se repite sin cortes
  const rnd = (x, y, s) => {
    const h = Math.sin((((x % s) + s) % s) * 127.1 + (((y % s) + s) % s) * 311.7) * 43758.5453;
    return h - Math.floor(h);
  };
  const noise = (x, y, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const sm = (t) => t * t * (3 - 2 * t);
    const a = rnd(xi, yi, s), b = rnd(xi + 1, yi, s), cc = rnd(xi, yi + 1, s), d = rnd(xi + 1, yi + 1, s);
    return (a * (1 - sm(xf)) + b * sm(xf)) * (1 - sm(yf)) + (cc * (1 - sm(xf)) + d * sm(xf)) * sm(yf);
  };
  const cover = 1 - GRAPHICS.CLOUDS * 0.55;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0, amp = 0.55, f = 4;
      for (let o = 0; o < 5; o++) {
        v += noise((x / size) * f, (y / size) * f, f) * amp;
        amp *= 0.5;
        f *= 2;
      }
      const a = Math.max(0, Math.min(1, (v - cover) * 3.2));
      const k = (y * size + x) * 4;
      const shade = 235 + 20 * (v - 0.5);
      img.data[k] = shade;
      img.data[k + 1] = shade;
      img.data[k + 2] = shade + 6;
      img.data[k + 3] = a * 235;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const SPAN = 40000, REPEAT = 7;
  tex.repeat.set(REPEAT, REPEAT);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    color: new THREE.Color(1.35, 1.35, 1.38).lerp(sunColor.clone().multiplyScalar(1.35), 0.2), // blancas al sol
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(SPAN, SPAN), mat);
  plane.rotation.x = Math.PI / 2; // mirando para abajo
  plane.position.y = 2200;
  scene.add(plane);
  const drift = new THREE.Vector2();
  return {
    update(dt, camPos) {
      drift.x += dt * 0.0006;
      drift.y += dt * 0.00025;
      plane.position.x = camPos.x;
      plane.position.z = camPos.z;
      // que las nubes queden quietas en el mundo aunque el plano siga a la cámara
      tex.offset.set((camPos.x / SPAN) * REPEAT + drift.x, (-camPos.z / SPAN) * REPEAT + drift.y);
    },
  };
}
