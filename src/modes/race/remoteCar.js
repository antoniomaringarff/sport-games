// Auto de otro jugador (o de un bot que maneja otra compu): se dibuja con las posiciones
// que llegan por la red, suavizadas, y tiene un cuerpo "cinemático" para poder tocarse.
import * as THREE from 'three';
import { createCarModel } from '../driving/carModel.js';
import { carAsset, physicsProfile } from '../driving/carAssets.js';

const DELAY = 120; // ms: se dibuja un poquito en el pasado para poder interpolar

export class RemoteCar {
  constructor(physics, scene, { id, name, car, color }) {
    this.id = id;
    this.name = name;
    this.car = car;
    this.scene = scene;
    this.physics = physics;
    this.snaps = []; // { time, s: [x,y,z,qx,qy,qz,qw,speed,steer] }
    this.prog = -Infinity;
    this.finishTime = null;
    const p = (this.profile = physicsProfile(car));

    // "vehículo de mentira" para que el modelo gire y doble las ruedas
    this.fake = {
      speed: 0,
      steer: 0,
      wheelState: (i) => ({ ...p.WHEELS?.[i] ?? { x: 0, y: 0, z: 0 }, steering: i < 2 ? -this.fake.steer * 0.4 : 0 }),
    };
    this.model = createCarModel(car, p, this.fake, carAsset(car), color);
    this.model.group.visible = false;
    scene.add(this.model.group);
    this.tag = nameTag(name);
    this.tag.position.y = p.HEIGHT / 2 + 1.4;
    this.model.group.add(this.tag);

    const R = physics.RAPIER;
    this.body = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -100, 0));
    physics.world.createCollider(
      R.ColliderDesc.cuboid(p.LENGTH / 2 - 0.1, p.HEIGHT / 2 - 0.1, p.WIDTH / 2 - 0.1).setFriction(0.3).setRestitution(0.1),
      this.body,
    );
    this._qa = new THREE.Quaternion();
    this._qb = new THREE.Quaternion();
  }

  push(msg) {
    this.snaps.push({ time: msg.time, s: msg.s });
    if (msg.prog != null) this.prog = msg.prog;
    if (this.snaps.length > 30) this.snaps.shift();
  }

  /** serverNow: hora del servidor (ms) */
  update(dt, serverNow) {
    const t = serverNow - DELAY;
    const sn = this.snaps;
    if (!sn.length) return;
    let a = sn[0], b = sn[0];
    for (let i = sn.length - 1; i >= 0; i--) {
      if (sn[i].time <= t) {
        a = sn[i];
        b = sn[i + 1] ?? sn[i];
        break;
      }
    }
    const f = b.time > a.time ? Math.min(1, (t - a.time) / (b.time - a.time)) : 0;
    const g = this.model.group;
    const A = a.s, B = b.s;
    g.position.set(A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f);
    this._qa.set(A[3], A[4], A[5], A[6]);
    this._qb.set(B[3], B[4], B[5], B[6]);
    g.quaternion.slerpQuaternions(this._qa, this._qb, f);
    g.visible = true;
    g.updateMatrixWorld();
    this.fake.speed = A[7] + (B[7] - A[7]) * f;
    this.fake.steer = A[8] ?? 0;
    this.model.update(dt);
    this.body.setNextKinematicTranslation({ x: g.position.x, y: g.position.y, z: g.position.z });
    this.body.setNextKinematicRotation({ x: g.quaternion.x, y: g.quaternion.y, z: g.quaternion.z, w: g.quaternion.w });
  }

  dispose() {
    this.scene.remove(this.model.group);
    this.model.dispose();
    this.tag.material.map.dispose();
    this.tag.material.dispose();
    this.physics.world.removeRigidBody(this.body);
  }
}

/** Cartel con el nombre arriba del auto. */
export function nameTag(text, color = '#ffcc33') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(12,18,28,0.75)';
  g.beginPath();
  g.roundRect(4, 8, 248, 48, 14);
  g.fill();
  g.fillStyle = color;
  g.font = 'bold 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(3.2, 0.8, 1);
  s.renderOrder = 10;
  return s;
}
