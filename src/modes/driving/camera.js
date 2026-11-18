// Cámara de persecución: sigue al auto con un resorte, se aleja y abre el ángulo con la velocidad.
import * as THREE from 'three';
import { CAMERA } from '../../config.js';

const MODES = ['persecucion', 'lejos', 'capot'];

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.mode = 0;
    this.yaw = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.first = true;
  }

  get modeName() {
    return MODES[this.mode];
  }

  nextMode() {
    this.mode = (this.mode + 1) % MODES.length;
  }

  snap() {
    this.first = true;
  }

  /** carObj: Object3D del auto (ya interpolado). speedKmh: velocidad. */
  update(carObj, speedKmh, dt) {
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(carObj.quaternion);
    const carYaw = Math.atan2(-fwd.z, fwd.x);
    const speedFrac = Math.min(speedKmh / 250, 1);
    const k = 1 - Math.exp(-CAMERA.SMOOTHING * dt);

    if (this.first) {
      this.yaw = carYaw;
    } else {
      let d = carYaw - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-CAMERA.SMOOTHING * 0.8 * dt));
    }

    const cam = this.camera;
    if (this.modeName === 'capot') {
      const p = new THREE.Vector3(0.6, 0.55, 0).applyMatrix4(carObj.matrixWorld);
      cam.position.copy(p);
      const t = new THREE.Vector3(20, 0.2, 0).applyMatrix4(carObj.matrixWorld);
      cam.lookAt(t);
      cam.fov = CAMERA.FOV + 8 + CAMERA.FOV_AT_SPEED * speedFrac;
      cam.updateProjectionMatrix();
      this.first = true;
      return;
    }

    const far = this.modeName === 'lejos' ? 1.6 : 1;
    const dist = (CAMERA.DISTANCE + CAMERA.DISTANCE_AT_SPEED * speedFrac) * far;
    const height = CAMERA.HEIGHT * far;
    const back = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const target = carObj.position.clone().addScaledVector(back, dist);
    target.y = carObj.position.y + height;
    const lookAt = carObj.position.clone().addScaledVector(back, -4);
    lookAt.y += 0.9;

    if (this.first) {
      this.pos.copy(target);
      this.look.copy(lookAt);
      this.first = false;
    } else {
      // posición horizontal pegada (sale del yaw suavizado), altura con más resorte
      this.pos.x = target.x;
      this.pos.z = target.z;
      this.pos.y += (target.y - this.pos.y) * k;
      this.look.lerp(lookAt, Math.min(1, k * 2));
    }
    cam.position.copy(this.pos);
    cam.lookAt(this.look);
    const fov = CAMERA.FOV + CAMERA.FOV_AT_SPEED * speedFrac * speedFrac;
    cam.fov += (fov - cam.fov) * k;
    cam.updateProjectionMatrix();
  }

  /** Vista de showroom: gira lento alrededor del auto. */
  orbit(carObj, t) {
    const r = 9;
    const a = t * 0.25;
    this.camera.position.set(carObj.position.x + Math.cos(a) * r, carObj.position.y + 2.2, carObj.position.z + Math.sin(a) * r);
    this.camera.lookAt(carObj.position.x, carObj.position.y + 0.3, carObj.position.z);
    this.camera.fov = 45;
    this.camera.updateProjectionMatrix();
    this.first = true;
  }
}
