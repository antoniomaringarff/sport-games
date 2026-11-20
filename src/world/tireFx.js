// Efectos de las ruedas: humo al derrapar en asfalto, polvo en tierra/arena/pasto/nieve
// y marcas negras de frenada en el piso.
import * as THREE from 'three';
import { Q } from '../core/graphics.js';

const DUST = {
  tierra: [0.8, 0.72, 0.58],
  arena: [0.86, 0.79, 0.62],
  pasto: [0.55, 0.52, 0.42],
  nieve: [0.95, 0.96, 0.98],
};
const HARD = new Set(['asfalto', 'adoquin']);

export function createTireFx(scene) {
  // ---------- Partículas (humo / polvo) ----------
  const MAX = Math.round(900 * Q.particles);
  const pos = new Float32Array(MAX * 3), vel = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3), size = new Float32Array(MAX), alpha = new Float32Array(MAX);
  const life = new Float32Array(MAX), maxLife = new Float32Array(MAX), grow = new Float32Array(MAX), a0 = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { scale: { value: (window.innerHeight / 2) * Math.min(window.devicePixelRatio, Q.pixelRatio) } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
      uniform float scale; varying vec3 vColor; varying float vAlpha;
      void main() {
        vColor = aColor; vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * scale / max(-mv.z, 0.1);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor; varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.1, d) * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor, a);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  let next = 0;

  function emit(p, v, color, s, g, l, a) {
    const i = next;
    next = (next + 1) % MAX;
    pos.set([p.x + (Math.random() - 0.5) * 0.4, p.y + 0.15, p.z + (Math.random() - 0.5) * 0.4], i * 3);
    vel.set([v.x * 0.15 + (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 1.2, v.z * 0.15 + (Math.random() - 0.5) * 1.5], i * 3);
    col.set(color, i * 3);
    size[i] = s;
    grow[i] = g;
    life[i] = maxLife[i] = l * (0.7 + Math.random() * 0.6);
    a0[i] = a;
  }

  // ---------- Marcas de frenada ----------
  const MARKS = Math.round(1500 * Math.max(0.4, Q.particles));
  const markMat = new THREE.MeshBasicMaterial({
    color: 0x151515,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const markGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const marks = new THREE.InstancedMesh(markGeo, markMat, MARKS);
  marks.frustumCulled = false;
  marks.count = 0;
  scene.add(marks);
  let markNext = 0;
  const lastContact = [null, null, null, null];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  function addMark(a, b, width) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05 || len > 3) return;
    q.setFromAxisAngle(up, Math.atan2(-dz, dx));
    pv.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.03, (a.z + b.z) / 2);
    sc.set(len + 0.05, 1, width);
    m4.compose(pv, q, sc);
    marks.setMatrixAt(markNext, m4);
    markNext = (markNext + 1) % MARKS;
    marks.count = Math.max(marks.count, markNext === 0 ? MARKS : markNext);
    marks.instanceMatrix.needsUpdate = true;
  }

  const acc = [0, 0, 0, 0];
  const cpTmp = { x: 0, y: 0, z: 0 };
  const lastStore = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }));
  return {
    /** Llamar cada cuadro con el auto propio (y los que quieras). */
    emitFor(vehicle, dt) {
      const ctrl = vehicle.ctrl;
      const v = vehicle.body.linvel();
      const kmh = vehicle.kmh;
      for (let i = 0; i < 4; i++) {
        if (!ctrl.wheelIsInContact(i)) {
          lastContact[i] = null;
          continue;
        }
        const cp = ctrl.wheelContactPoint(i, cpTmp);
        if (!cp) continue;
        const surf = vehicle.wheelSurface[i];
        const skid = Math.max(vehicle.skid[i], vehicle.lastInputHandbrake && i >= 2 && kmh > 15 ? 0.6 : 0);
        const hard = HARD.has(surf);
        let rate = 0, color = null, s = 1, g = 2, l = 1.4, a = 0.3;
        if (hard && skid > 0.25) {
          rate = 45 * skid;
          color = [0.95, 0.95, 0.95];
          s = 1.2; g = 3.8; l = 1.8; a = 0.5 * Math.min(1, skid + 0.3);
        } else if (!hard && DUST[surf] && kmh > 12) {
          rate = (kmh / 7) * (i >= 2 ? 1 : 0.4) * (1 + skid * 2);
          color = DUST[surf];
          s = 1.8; g = 6; l = 2.6; a = 0.45;
        }
        if (rate > 0) {
          acc[i] += rate * dt * Q.particles;
          while (acc[i] >= 1) {
            acc[i] -= 1;
            emit(cp, v, color, s, g, l, a);
          }
        }
        // marcas en el piso duro cuando patina
        if (hard && skid > 0.35) {
          if (lastContact[i]) addMark(lastContact[i], cp, 0.28);
          const st = lastStore[i];
          st.x = cp.x; st.y = cp.y; st.z = cp.z;
          lastContact[i] = st;
        } else lastContact[i] = null;
      }
    },

    update(dt) {
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) {
          alpha[i] = 0;
          continue;
        }
        life[i] -= dt;
        const t = 1 - life[i] / maxLife[i];
        vel[i * 3] *= 1 - dt * 1.5;
        vel[i * 3 + 2] *= 1 - dt * 1.5;
        vel[i * 3 + 1] *= 1 - dt * 0.8;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        size[i] += grow[i] * dt;
        alpha[i] = a0[i] * Math.min(1, t * 6) * (1 - t);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
      geo.attributes.aColor.needsUpdate = true;
      mat.uniforms.scale.value = (window.innerHeight / 2) * Math.min(window.devicePixelRatio, Q.pixelRatio);
    },
  };
}
