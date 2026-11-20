// Chispas: partículas que saltan al golpear o raspar una pared.
import * as THREE from 'three';

const MAX = 400;

export function createSparks(scene) {
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.12,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  let next = 0;

  /** Larga n chispas desde `p`, empujadas en la dirección `dir` (velocidad del auto). */
  function emit(p, dir, n, spread = 3) {
    for (let k = 0; k < n; k++) {
      const i = next;
      next = (next + 1) % MAX;
      pos[i * 3] = p.x + (Math.random() - 0.5) * 0.3;
      pos[i * 3 + 1] = p.y + Math.random() * 0.3;
      pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.3;
      vel[i * 3] = dir.x * (0.4 + Math.random() * 0.5) + (Math.random() - 0.5) * spread;
      vel[i * 3 + 1] = 1 + Math.random() * spread;
      vel[i * 3 + 2] = dir.z * (0.4 + Math.random() * 0.5) + (Math.random() - 0.5) * spread;
      life[i] = 0.25 + Math.random() * 0.45;
    }
  }

  return {
    emit,
    update(dt) {
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) {
          col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
          continue;
        }
        life[i] -= dt;
        vel[i * 3 + 1] -= 9.8 * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const t = Math.max(0, life[i] / 0.7);
        col[i * 3] = 1.0 * t + 0.2;
        col[i * 3 + 1] = 0.75 * t;
        col[i * 3 + 2] = 0.3 * t * t;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}
