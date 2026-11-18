// Cámaras de manejo: afuera lejos, afuera cerca, conductor y frente.
// Las de afuera siguen al auto con un resorte y, al doblar, se corren un poco
// al costado para que se vea el lateral del auto (sin perder la vista de frente).
import * as THREE from 'three';
import { CAMERA, DRIVER_EYE } from '../../config.js';

const _v = new THREE.Vector3();
const _t = new THREE.Vector3();

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.index = 0;
    this.yaw = 0;
    this.swing = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.first = true;
  }

  get modeName() {
    return CAMERA.VIEWS[CAMERA.ORDER[this.index]].label;
  }

  nextMode() {
    this.index = (this.index + 1) % CAMERA.ORDER.length;
    this.first = true;
  }

  snap() {
    this.first = true;
  }

  /**
   * carObj: Object3D del auto (ya interpolado)
   * vehicle: para saber velocidad y dirección
   * carId: para los ojos del conductor
   */
  update(carObj, vehicle, carId, dt) {
    const mode = CAMERA.ORDER[this.index];
    const speedKmh = vehicle.kmh;
    const speedFrac = Math.min(speedKmh / 250, 1);
    const cam = this.camera;
    const k = 1 - Math.exp(-CAMERA.SMOOTHING * dt);

    if (mode === 'conductor' || mode === 'frente') {
      const p = vehicle.p;
      const eye = mode === 'conductor'
        ? DRIVER_EYE[carId] ?? { x: 0, y: 0.3, z: 0 }
        : { x: p.LENGTH / 2 + 0.15, y: -p.HEIGHT / 2 + 0.45, z: 0 };
      cam.position.copy(_v.set(eye.x, eye.y, eye.z).applyMatrix4(carObj.matrixWorld));
      // mira hacia adelante del auto, con el horizonte un poco más estable
      _t.set(eye.x + 30, eye.y - 0.6, eye.z).applyMatrix4(carObj.matrixWorld);
      cam.up.set(0, 1, 0);
      cam.lookAt(_t);
      const fov = (mode === 'conductor' ? 70 : 66) + CAMERA.FOV_AT_SPEED * speedFrac * speedFrac;
      cam.fov += (fov - cam.fov) * (this.first ? 1 : k);
      cam.near = 0.05;
      cam.updateProjectionMatrix();
      this.first = false;
      return;
    }

    const view = CAMERA.VIEWS[mode];
    const fwd = _v.set(1, 0, 0).applyQuaternion(carObj.quaternion);
    const carYaw = Math.atan2(-fwd.z, fwd.x);

    // Ladeo: al doblar, la cámara queda un poco hacia afuera de la curva
    const turning = vehicle.steer * Math.min(speedKmh / 40, 1);
    const ks = 1 - Math.exp(-CAMERA.SWING_SMOOTHING * dt);
    this.swing += (turning * CAMERA.SWING - this.swing) * ks;

    if (this.first) {
      this.yaw = carYaw;
    } else {
      let d = carYaw - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-CAMERA.SMOOTHING * 0.8 * dt));
    }
    const camYaw = this.yaw + this.swing;

    const dist = view.DISTANCE + CAMERA.DISTANCE_AT_SPEED * speedFrac;
    const back = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw));
    const ahead = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const target = carObj.position.clone().addScaledVector(back, dist);
    target.y = carObj.position.y + view.HEIGHT;
    const lookAt = carObj.position.clone().addScaledVector(ahead, view.LOOK_AHEAD);
    lookAt.y += 0.8;

    if (this.first) {
      this.pos.copy(target);
      this.look.copy(lookAt);
      this.first = false;
    } else {
      this.pos.x = target.x;
      this.pos.z = target.z;
      this.pos.y += (target.y - this.pos.y) * k;
      this.look.lerp(lookAt, Math.min(1, k * 2));
    }
    cam.position.copy(this.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    const fov = CAMERA.FOV + CAMERA.FOV_AT_SPEED * speedFrac * speedFrac;
    cam.fov += (fov - cam.fov) * k;
    cam.near = 0.1;
    cam.updateProjectionMatrix();
  }
}
