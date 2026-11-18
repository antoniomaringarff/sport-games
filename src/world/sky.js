// Cielo, sol, luces y niebla.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

/**
 * opts: { elevation, azimuth (grados), fog: [color, cerca, lejos], sunColor, sunIntensity, exposure }
 */
export function createSky(scene, renderer, opts = {}) {
  const sky = new Sky();
  sky.scale.setScalar(18000);
  const u = sky.material.uniforms;
  u.turbidity.value = 6;
  u.rayleigh.value = 1.6;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.85;
  scene.add(sky);

  // Sol de tarde (alto pero ya bajando)
  const { elevation = 32, azimuth = 210 } = opts;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - elevation),
    THREE.MathUtils.degToRad(azimuth),
  );
  u.sunPosition.value.copy(sunDir);

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure ?? 0.75;

  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5a6b3a, 1.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(opts.sunColor ?? 0xfff0dc, opts.sunIntensity ?? 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const S = 45;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 300 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const [fogColor, fogNear, fogFar] = opts.fog ?? [0xbfd4e6, 180, 900];
  scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);

  return {
    /** La luz del sol sigue al auto para que las sombras se vean nítidas cerca. */
    exposure: opts.exposure ?? 0.75,
    follow(pos) {
      sun.target.position.copy(pos);
      sun.position.copy(pos).addScaledVector(sunDir, 150);
    },
  };
}
